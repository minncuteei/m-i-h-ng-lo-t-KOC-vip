# BẢN SPEC & IMPLEMENTATION PLAN KỸ THUẬT: NÂNG CẤP TOOL "MỜI HÀNG LOẠT KOC VIP"
*(Trích xuất kiến trúc tối ưu & giải pháp triệt để từ STONK AI BOOKING)*

---

## MỤC TIÊU DỰ ÁN
Giải quyết triệt để 3 vấn đề nan y trong vận hành thực tế:
1. **Lỗi 16024016 (Creator Linked Shop)**: TikTok từ chối cả nhóm 50 KOC do dính 1–2 KOC là tài khoản shop/tiếp thị $\rightarrow$ Bóc tách KOC vi phạm trong 1 giây, đưa vào Sổ đen vĩnh viễn, gửi nhóm 48–49 KOC sạch ngay lập tức.
2. **Khắc phục lỗi chia tách nhóm lẻ**: Chấm dứt tình trạng fallback chia nhỏ thành các nhóm 1 KOC (`_a1`, `_a2`... `_a42`) làm mất 50 phút và rác giao diện Seller Center $\rightarrow$ Áp dụng **Kho Đệm KOC Sạch (Clean Buffer)** & **Dynamic Refill** để luôn gửi nhóm đủ 50 KOC sạch 100% trong 1 request duy nhất.
3. **Số thứ tự (STT) và khống chế 30 ký tự**: Tự động quét API Seller Center để tiếp nối STT thực tế (vd: `_043`, `_044`...), không bị reset về 001 khi F5 và dùng Regex bảo vệ đuôi số để không bao giờ vượt quá 30 ký tự.

---

## CHUYÊN ĐỀ 1: CƠ CHẾ KHO ĐỆM KOC SẠCH (CLEAN BUFFER) & KHÔNG TÁCH NHÓM

### 1.1 Luồng Pre-filter kiểm trùng trước khi gửi
- **API Endpoint**: `POST /api/v1/oec/affiliate/seller/invitation_group/conflict_check`
- **Đặc tính**: Read-only, không tạo nhóm trên Seller Center, cực kỳ an toàn, đo đạc thực tế chỉ dính Captcha 1 lần trên 8.000 KOC kiểm tra.
- **Kích thước Lô Kiểm Tra**: Mặc định 50 KOC/lô (có thể gom đến 100–200 KOC/lệnh).
- **Cơ chế Eligibility Fingerprint & Caching Dấu Sạch**:
  - Hash cấu hình chiến dịch qua hàm `invitationEligibilityFingerprint(draft, shopId, region)`.
  - KOC vượt qua kiểm tra được gán nhãn: `daKiemSachLuc = Date.now()` và `daKiemSachKey = eligibilityKey`. Khi nhóm sau lấy KOC này sẽ **bỏ qua kiểm tra**, tiết kiệm 100% request trùng lặp.

```javascript
// Trích xuất logic prefilterConflicts từ local-invite-executor.js
const prefilterConflicts = async (batch, attemptNo, options = {}) => {
  if (!batch || !batch.length) return { conflictRecipientIds: new Set() };
  const force = options.force === true;
  const idHopLe = item => /^\d{8,}$/.test(String(item.creatorOecId || item.creatorId || "").trim());
  batch = batch.filter(idHopLe);

  // Bỏ qua người đã được kiểm sạch với đúng cấu hình hiện tại
  const daSach = new Set(
    (chunk.recipients || []).filter(r => r.daKiemSachLuc && r.daKiemSachKey === eligibilityKey).map(r => r.recipientId)
  );
  const canKiem = force ? batch : batch.filter(r => !daSach.has(r.recipientId));
  if (!canKiem.length) return { conflictRecipientIds: new Set(), boQuaVìDaKiem: batch.length };
  batch = canKiem;

  const invitationCheck = buildCreateBody(manifest.draft || {}, batch, chunk.groupName).invitation_group;
  if (options.invitationId) invitationCheck.id = String(options.invitationId);

  const checkResult = await callTikTok({
    method: "POST",
    path: "/api/v1/oec/affiliate/seller/invitation_group/conflict_check",
    shopId: manifest.shopId,
    shopRegion: manifest.region || "VN",
    body: { invitation: invitationCheck },
    phase: "local_invite_conflict_check"
  });

  const conflicts = conflictIds(checkResult?.body);
  const isConf = item => conflicts.has(String(item.creatorOecId || "")) || conflicts.has(String(item.creatorId || ""));
  let conflictRecipientIds = new Set(batch.filter(isConf).map(r => r.recipientId));
  
  // Đánh dấu sạch in-memory + local DB
  await danhDauDaKiem(batch.filter(r => !isConf(r)));
  return { conflictRecipientIds };
};
```

---

### 1.2 Thuật toán Dynamic Refill (Bù KOC để nhóm luôn đủ 50)
- Thay vì gửi tạo nhóm thiếu KOC rồi mới nhồi thêm bằng `creators_add`, hệ thống duy trì **Kho Đệm Mục Tiêu 200 KOC sạch**:
  1. Rút 50 KOC đầu tiên kiểm tra qua `prefilterConflicts`.
  2. Nếu bị loại $N$ KOC (trùng lặp), gọi hàm `claimLocalRefills(N, "")` rút nguyên tử $N$ KOC từ nhóm sau lên bù vào.
  3. Kiểm trùng tiếp $N$ KOC mới này.
  4. Gom đủ 50 KOC sạch 100% vào `seedBatch`.
  5. Gọi 1 lệnh `POST /api/v1/oec/affiliate/seller/invitation_group/create` duy nhất.

```javascript
// Trích xuất vòng lặp gom lô sạch nguyên bản từ local-invite-executor.js
const KHO_MUC_TIEU = 200;
const tranGomLo = 50; // Luôn hướng tới nhóm đủ 50 KOC sạch
const TRAN_GOM_DU = 6;

for (let vongGom = 0;
     vongGom < TRAN_GOM_DU && !controller.cancelled &&
     (seedBatch.length < tranGomLo || (laNhomDauCuaChunk && demKhoSach() < KHO_MUC_TIEU));
     vongGom += 1) {

  const thieu = Math.max(
    tranGomLo - seedBatch.length,
    laNhomDauCuaChunk ? KHO_MUC_TIEU - demKhoSach() : 0
  );
  
  // Rút KOC từ hàng đợi sau
  const vay = await claimLocalRefills(thieu, "");
  if (!vay.length) break;

  const kiem = await prefilterConflicts(vay, attemptNo);
  const trungIds = kiem.conflictRecipientIds || new Set();

  if (trungIds.size) {
    const capNhat = (chunk.recipients || []).map(item =>
      trungIds.has(item.recipientId)
        ? recipientStatusPatch(item, "skipped_conflict", "TikTok báo trùng khi gom đủ lô", "")
        : item
    );
    await saveChunk(manifest, chunk, { recipients: capNhat });
  }

  const sach = vay.filter(r => !trungIds.has(r.recipientId));
  if (sach.length) seedBatch = seedBatch.concat(sach).slice(0, tranGomLo);
}

// Gọi duy nhất 1 request tạo nhóm với đủ 50 KOC sạch
let createResult = await callTikTok({
  method: "POST",
  path: "/api/v1/oec/affiliate/seller/invitation_group/create",
  shopId: manifest.shopId,
  shopRegion: manifest.region || "VN",
  body: buildCreateBody(manifest.draft || {}, seedBatch, tenNhomTheoLan(chunk.groupName, chunk.soNhomDaMo)),
  phase: "local_invite_create_seed"
});
```

---

## CHUYÊN ĐỀ 2: CHIẾN THUẬT XỬ LÝ LỖI 16024016 (CREATOR LINKED SHOP)

### 2.1 Bản chất phản hồi từ TikTok
- **Response**: `code: 16024016`, `message: "creator is linked with a shop account"`.
- **Đặc điểm**: TikTok **từ chối toàn bộ nhóm** và **không nêu danh tính `creator_id` nào bị lỗi** nếu gửi lô $> 1$ KOC.

### 2.2 Thuật toán Cô lập đuôi (Tail Isolation Mode)
1. Khi gặp `16024016`, hệ thống **không chia nhị phân ngay lập tức tại luồng chính** (để tránh làm nghẽn tiến trình của hàng trăm KOC sạch khác).
2. Lưu chunk lỗi và hoãn xuống cuối hàng đợi (`phase = "waiting_creator_isolation_tail"`, `tailIsolationMode = true`).
3. Khi xử lý chunk cô lập đuôi, chuyển kích thước lô gửi về `1` (`batch.length === 1`).
4. Khi gửi lô kích thước = 1 mà gặp 16024016 $\rightarrow$ **Bắt chính xác 100% ID KOC vi phạm**, gán trạng thái `skipped_shop_linked` (kèm mã `tiktokCode: 16024016`), ghi vào Sổ đen và sleep 1s rồi chuyển ngay sang KOC kế tiếp.

```javascript
// Nhận diện lỗi tài khoản Shop
function laLoiCreatorGanShop(result) {
  const body = result?.body || {};
  const code = Number(body.originalCode ?? body.code ?? body.data?.code ?? 0);
  const message = `${body.originalMessage || ""} ${body.message || body.msg || ""}`.toLowerCase();
  return code === 16024016 || /creator is linked with a shop account|linked with a shop account/.test(message);
}

// Xử lý bắt ID chính xác ở lô size = 1
if (laLoiCreatorGanShop(createResult)) {
  const summary = resultSummary(createResult);
  if (seedBatch.length === 1) {
    const badId = seedBatch[0].recipientId;
    const recipients = (chunk.recipients || []).map(item => item.recipientId === badId
      ? { ...recipientStatusPatch(item, "skipped_shop_linked", "KOC đã gắn tài khoản shop — không thể mời (TikTok 16024016)", ""), tiktokCode: 16024016 }
      : item);
    await saveChunk(manifest, chunk, {
      status: "local_pending",
      phase: "creator_isolation_tail",
      tailIsolationMode: true,
      recipients,
      lastKnownTikTokResult: summary,
    }, true);
    await cancellableSleep(1000, manifest.serverRunId);
    continue;
  }

  // Nếu lô > 1: Hoãn nhóm xuống cuối
  await saveChunk(manifest, chunk, {
    status: "retry_wait",
    phase: "waiting_creator_isolation_tail",
    tailIsolationMode: true,
    recipients,
    lastKnownTikTokResult: summary,
  }, true);
  return { state: "creator_isolation_tail_deferred" };
}
```

### 2.3 Sổ đen KOC vi phạm (Persistent Blacklist)
- **Lưu trữ**: IndexedDB store `stonk_creator_blacklist` theo khóa `creator_oec_id`.
- **Thời hạn lưu**:
  - `16024016`: **Lưu vĩnh viễn** (`expiresAt: null`).
  - `50001702` (KOC không khả dụng): **Lưu 14 ngày** (`expiresAt: Date.now() + 14 * 86400 * 1000`).
- **Lọc trước khi chạy**: Trong form gửi lời mời, hệ thống đối soát và tự động lọc bỏ các KOC trong sổ đen trước khi phân chia nhóm.

---

## CHUYÊN ĐỀ 3: TỰ ĐỘNG GỠ TRÙNG KOC (CONFLICT AUTO-RESOLVE)

### 3.1 API & Payload Gỡ Trùng
- **Endpoint**: `POST /api/v1/oec/affiliate/seller/invitation_group/conflict_check/resolve`
- **Tác dụng**: Tự động hủy liên kết KOC khỏi các nhóm lời mời cũ của chính shop để đưa vào nhóm lời mời mới.
- **Payload Request**:
```json
{
  "group_pair": [
    {
      "creator_id": "7492819283719283",
      "invitation_group_id": "1729384729182371"
    }
  ],
  "resolve_type": 1
}
```

```javascript
// Dựng mảng group_pair từ phản hồi conflict_check
function capGoTrung(body, batch) {
  const data = body?.data || {};
  const conflictList = data.conflict_list || data.conflicts || [];
  const cap = [];
  const daCo = new Set();

  for (const nhom of conflictList) {
    const groupId = String(nhom?.invitation_group_id || nhom?.id || "");
    const cids = (nhom?.creator_id_list || []).map(String);
    for (const cid of cids) {
      const khoa = `${cid}:${groupId}`;
      if (!daCo.has(khoa)) {
        daCo.add(khoa);
        cap.push({ creator_id: cid, invitation_group_id: groupId });
      }
    }
  }
  return cap;
}

// Thực thi gỡ trùng khi cấu hình tuXuLyTrung được bật
if (conflictRecipientIds.size && manifest.draft?.tuXuLyTrung) {
  const capGoiY = capGoTrung(checkResult?.body, batch);
  if (capGoiY.length) {
    await callTikTok({
      method: "POST",
      path: "/api/v1/oec/affiliate/seller/invitation_group/conflict_check/resolve",
      shopId: manifest.shopId,
      shopRegion: manifest.region || "VN",
      body: { group_pair: capGoiY, resolve_type: 1 },
      phase: "local_invite_go_trung"
    });
  }
}
```

---

## CHUYÊN ĐỀ 4: ĐẶT TÊN NHÓM, QUÉT STT TIẾP NỐI & KHỐNG CHẾ 30 KÝ TỰ

### 4.1 Thuật toán sinh tên & Khống chế 30 ký tự
- **Cấu trúc**: `STONKAIKOC_[SHOP]_[NV]_[DDMM]` (hoặc `[Tên Shop] x [Tên NV]_[STT]`).
- **Thuật toán Regex cắt thân giữa**: Cắt ngắn phần tên Shop / Tên NV, **bảo toàn nguyên vẹn phần đuôi `_N2` hoặc `_043`**.

```javascript
// Trích xuất từ local-invite-executor.js
function tenNhomTheoLan(groupName, soNhom) {
  const ten = String(groupName || "");
  const lan = Math.max(1, Number(soNhom || 1));
  if (lan <= 1) return ten.slice(0, 30);
  const duoiThem = `_N${lan}`;
  if (ten.length + duoiThem.length <= 30) return ten + duoiThem;

  const khopDuoi = ten.match(/^(.*?)(_\d{1,2}_\d{1,2}_\d+)$/);
  if (khopDuoi) {
    const dau = khopDuoi[1].slice(0, Math.max(1, 30 - khopDuoi[2].length - duoiThem.length));
    return `${dau}${khopDuoi[2]}${duoiThem}`.slice(0, 30);
  }
  return ten.slice(0, 30 - duoiThem.length) + duoiThem;
}
```

### 4.2 Quét API danh sách nhóm TikTok để tiếp nối STT thực tế
- Gọi `POST /api/v1/oec/affiliate/seller/invitation_group/search` với `invitation_group_status: 5` (đang chạy) để bóc tách số thứ tự lớn nhất `maxSeq`, tự động tạo tiếp `maxSeq + 1` (vd: `_042` $\rightarrow$ `_043`).

```javascript
async function laySttTiepNoi(shopId, region) {
  const res = await callTikTok({
    method: "POST",
    path: "/api/v1/oec/affiliate/seller/invitation_group/search",
    shopId,
    shopRegion: region,
    body: { invitation_group_status: 5, page_size: 50, page_number: 1 }
  });

  const list = res?.body?.data?.invitation_group_list || [];
  let maxSeq = 0;
  const regex = /_(\d{2,4})$/;

  list.forEach(group => {
    const name = group.name || group.invitation_group?.name || "";
    const match = name.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxSeq) maxSeq = num;
    }
  });

  return String(maxSeq + 1).padStart(3, "0");
}
```

---

## CHUYÊN ĐỀ 5: QUẢN TRỊ TỐC ĐỘ, DELAY AN TOÀN & HẠN MỨC QUOTA 24H

### 5.1 Bảng cấu hình độ trễ (Delay Matrix & Jitter)
| Loại Request | Base Delay | Random Jitter | Mục đích |
| :--- | :--- | :--- | :--- |
| **`conflict_check`** | `400ms` | `+ Math.random() * 300ms` | Kiểm tra nhanh theo lô 50–200 KOC |
| **`conflict_check/resolve`** | `800ms` | `+ Math.random() * 400ms` | Giãn cách khi hủy nhóm cũ |
| **`invitation_group/create`** | `3.000ms` | `+ Math.random() * 1.500ms` | Tạo nhóm 50 KOC sạch |
| **Giữa 2 nhóm (Chunk Delay)** | `7.500ms – 9.000ms`| `+ Math.random() * 2.000ms`| Đảm bảo an toàn tài khoản tuyệt đối |

### 5.2 Xử lý Quota 200 nhóm / 10.000 KOC (24h Limit)
- Nhận diện mã lỗi: `16024035` (chạm trần 200 nhóm/24h) hoặc `16024034` (đầy nhóm active).
- Chuyển toàn bộ KOC còn lại sang trạng thái `waiting_daily_reset`, tính toán thời gian `quotaDeferredAt = Date.now() + 24 * 3600 * 1000` và hiển thị đồng hồ đếm ngược trên giao diện.

---

## CHUYÊN ĐỀ 6: CHECKLIST TRIỂN KHAI TÍCH HỢP CHO TOOL

```
[ ] BƯỚC 1: Xây dựng Module Pre-filter & Kho Đệm Sạch (Clean Buffer & Dynamic Refill)
    ├── Tích hợp prefilterConflicts gọi POST /invitation_group/conflict_check.
    ├── Tích hợp claimLocalRefills rút bù KOC thiếu từ nhóm sau vào nhóm trước.
    └── Đảm bảo POST /invitation_group/create luôn luôn gửi đúng 50 KOC sạch trong 1 request.

[ ] BƯỚC 2: Xây dựng Module Cô lập đuôi xử lý lỗi 16024016 (Tail Isolation Mode)
    ├── Bắt mã lỗi 16024016 / "creator is linked with a shop account".
    ├── Hoãn chunk lỗi xuống cuối hàng đợi (không chia nhỏ nhóm ngay luồng chính).
    └── Gửi lô size = 1 ở vòng đuôi để bắt chính xác ID vi phạm, gán skipped_shop_linked và lưu vào IndexedDB.

[ ] BƯỚC 3: Xây dựng Module Đặt tên nhóm & Khống chế 30 ký tự
    ├── Tích hợp tenNhomTheoLan() dùng Regex cắt phần thân, bảo toàn đuôi STT.
    └── Tích hợp laySttTiepNoi() quét /invitation_group/search lấy STT lớn nhất hiện hữu.

[ ] BƯỚC 4: Xây dựng Module Tự động Gỡ trùng (Conflict Auto-Resolve)
    └── Tích hợp gọi POST /invitation_group/conflict_check/resolve khi bật tuXuLyTrung.

[ ] BƯỚC 5: Thiết lập Delay Matrix & Quản lý Quota 24h
    ├── Áp dụng Delay 7.5s - 9s giữa các nhóm và Cooldown bậc thang khi gặp Rate Limit.
    └── Bắt mã 16024035 để chuyển sang waiting_daily_reset kèm đếm ngược 24h.
```

---
---

# ======================================================================
# PHẦN BỔ SUNG: KIẾN TRÚC MỞ RỘNG CHO TẢI TỐI ĐA 10.000 KOC / 24H (200 NHÓM x 50 KOC)
# ======================================================================

---

## CHUYÊN ĐỀ 7: KIẾN TRÚC INPUT & TRA CỨU OEC ID HÀNG LOẠT (10.000 HANDLES)

### 7.1 Lô 100 handles / request & Chạy tuần tự (Sequential vs Parallel Pool)
- **Kích thước lô**: API `/api/v1/oec/affiliate/crm/creator/import_check` của TikTok Seller Center hỗ trợ tối đa **100 handles / request**.
- **Với 10.000 handles**: Chỉ cần đúng **100 requests** (thay vì 200 requests nếu chia 50).
- **Quy tắc luồng an toàn**: **Bắt buộc chạy Tuần tự (Sequential)** kết hợp nhường luồng `await Promise.resolve()` (hoặc delay `150ms – 250ms`).
  > [!WARNING]
  > Tuyệt đối KHÔNG dùng Parallel Pool (3-5 workers đồng thời) trên cùng 1 session cookie. TikTok WAF phát hiện nhiều kết nối song song bất thường sẽ lập tức gắn cờ bot và kích hoạt Checkpoint Captcha cứng.
- **Thời gian xử lý**: Toàn bộ 10.000 handles được phân giải xong OEC ID trong vòng **25 – 35 giây**.

*(Trích mã từ [`src/content/overlay-launcher.js`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/src/content/overlay-launcher.js#L2925-L2974)):*
```javascript
// Quét OEC ID 100 handles / batch tuần tự an toàn
async function checkCreatorHandlesOnTikTok(rawHandles, onProgress = null, shouldCancel = null) {
  const handles = Array.from(new Set((rawHandles || [])
    .map(value => String(value || "").replace(/^@/, "").trim().toLowerCase())
    .filter(Boolean)));
  const creators = [];

  for (let offset = 0; offset < handles.length; offset += 100) {
    if (shouldCancel?.()) throw new Error("Đã dừng kiểm tra ID theo yêu cầu.");
    const chunk = handles.slice(offset, offset + 100);
    const requestId = `creator_check_${Date.now()}_${offset}_${Math.random().toString(36).slice(2, 8)}`;
    const replySource = `stonk-ai-booking-page-executor-creator-${requestId}`;

    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onResult);
        reject(new Error("TikTok không phản hồi kiểm tra KOC sau 45 giây."));
      }, 45000);

      function onResult(event) {
        const message = event.data;
        if (event.source !== window || message?.source !== replySource || message?.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener("message", onResult);
        if (!message.ok) reject(new Error(message?.error || "TikTok từ chối kiểm tra KOC."));
        else resolve(message.body || {});
      }

      window.addEventListener("message", onResult);
      window.postMessage({
        source: "stonk-ai-booking-job-runner",
        replySource,
        type: "execute",
        requestId,
        request: {
          method: "POST",
          path: "/api/v1/oec/affiliate/crm/creator/import_check",
          body: { handle_names: chunk }
        },
      }, window.location.origin);
    });

    const chunkCreators = importCheckCreatorsFromResponse(response);
    creators.push(...chunkCreators);

    if (typeof onProgress === "function") {
      await onProgress({
        creators: chunkCreators,
        processed: Math.min(offset + chunk.length, handles.length),
        total: handles.length
      });
    }
    // Nhường microtask cho UI cập nhật mượt mà
    if (offset + 100 < handles.length) await Promise.resolve();
  }
  return creators;
}
```

### 7.2 Chuẩn hóa dữ liệu TikTok Response (Tương thích mọi phiên bản TikTok)
```javascript
function normalizeTikTokCreatorImportCheck(raw = {}) {
  const base = raw?.base || raw?.creator_base || raw?.creatorBase || raw?.creator?.base || raw?.creator || raw || {};
  const scalar = value => value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value") ? value.value : value;
  const handle = String(scalar(base.handle_name) || scalar(base.handle) || scalar(base.unique_id) || scalar(base.username) || "")
    .replace(/^@/, "").trim().toLowerCase();
  const rawOecId = String(scalar(base.oec_id) || scalar(base.creator_oec_id) || scalar(base.creator_oecuid) || "").trim();

  return {
    handle,
    nickname: String(base.nick_name || base.nickname || handle).trim(),
    creatorOecId: /^\d{8,}$/.test(rawOecId) ? rawOecId : "",
  };
}
```

### 7.3 Caching Đa Tầng (In-Memory Map + IndexedDB `kocCache`)
- Cặp `handle -> creatorOecId` sau khi tra cứu được lưu vào store IndexedDB `kocCache` (khóa `cacheKey = ${shopId}:${handle}`).
- Các đợt mời sau khi nạp file 10.000 KOC sẽ nạp ngay từ cache trong 0.1 giây, chỉ gọi API cho các KOC mới phát sinh.

---

## CHUYÊN ĐỀ 8: CHIẾN LƯỢC SỔ ĐEN TOÀN CỤC & TẠI SAO KHÔNG CHIA NHỊ PHÂN 25-25

### 8.1 So sánh Chiến lược Xử lý 16024016 ở quy mô 10.000 KOC
| Tiêu chí | Chia nhị phân 25-25 tại luồng chính | Cô lập đuôi (Tail Isolation) của STONK |
| :--- | :--- | :--- |
| **Cách xử lý** | Chia 50 $\rightarrow$ 25 $\rightarrow$ 12 $\rightarrow$ 6 $\rightarrow$ 3 $\rightarrow$ 1 ngay tại chỗ | Hoãn nhóm lỗi xuống cuối hàng đợi (`phase = "waiting_creator_isolation_tail"`) |
| **Tác động luồng chính** | Làm đứng luồng chính 5–10 phút / KOC lỗi; phát sinh 6 request `create` thất bại liên tiếp | Luồng chính **chạy liên tục không gián đoạn**, gửi 9.500 KOC sạch với tốc độ tối đa |
| **Tạo nhóm rác** | Dễ sinh ra hàng chục nhóm lẻ `_a1`, `_a2`... làm rác Seller Center | **0 nhóm rác**, chỉ tạo nhóm khi đủ 50 KOC sạch hoặc ở lượt xử lý cuối cùng |
| **Độ chính xác** | Dễ nhầm lẫn do rate-limit | **Chính xác 100% ID KOC vi phạm** khi ép kích thước lô về 1 |

### 8.2 Quy tắc lưu trữ Sổ đen Toàn Cục (Global Blacklist)
- **Store IndexedDB**: `stonk_creator_blacklist`
- **Mã lỗi 16024016** (*Creator linked shop*): **Lưu vĩnh viễn** (`expiresAt = null`).
- **Mã lỗi 50001702** (*Creator unavailable*): **Lưu 14 ngày** (`expiresAt = Date.now() + 14 * 86400 * 1000`).
- **Lọc trước khi chạy**: Hệ thống đối soát và tự động loại bỏ KOC nằm trong Sổ đen ngay từ lúc nạp danh sách, không tốn quota hay thời gian xử lý.

---

## CHUYÊN ĐỀ 9: THUẬT TOÁN ĐIỀU PHỐI ATOMIC REFILL & GỠ TRÙNG NGUYÊN TỬ CHO 200 NHÓM

### 9.1 Giao dịch nguyên tử `reallocateRefill` trong IndexedDB
- **Giải quyết lỗi "Vắt kiệt chunk kế tiếp"**: Thuật toán cũ chỉ mượn KOC từ chunk kế tiếp làm chunk đó bị rỗng và các nhóm sau bị thiếu KOC.
- **Thuật toán mới**: Rút KOC từ **BẤT KỲ donor chunk nào chưa chạy** (`!donor.groupId` và `status !== "sent"`) trong **1 Transaction duy nhất** (`db.transaction("chunks", "readwrite")`), đảm bảo mọi nhóm luôn đủ 50 KOC sạch 100%.

*(Trích mã từ [`src/background/local-invite-db.js`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/src/background/local-invite-db.js#L636-L710)):*
```javascript
async function reallocateRefill({ serverRunId, receiverChunkId, shortage = 0 } = {}) {
  const want = Math.max(0, Number(shortage) || 0);
  if (!want || !receiverChunkId) return { moved: [] };

  const db = await openLocalInviteDb();
  const tx = db.transaction("chunks", "readwrite");
  const store = tx.objectStore("chunks");
  const receiver = await requestResult(store.get(receiverChunkId));
  if (!receiver) { await transactionDone(tx); return { moved: [] }; }

  const all = (await requestResult(store.index("serverRunId").getAll(serverRunId)))
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  
  const moved = [];
  for (const donor of all) {
    if (moved.length >= want) break;
    if (String(donor.chunkId) === String(receiverChunkId)) continue;
    // Chỉ mượn từ nhóm chưa gửi lên TikTok
    if (donor.groupId || ["sent", "skipped", "failed"].includes(donor.status)) continue;

    const claimable = (donor.recipients || []).filter(item =>
      !["sent", "failed"].includes(item.status) && !String(item.status || "").startsWith("skipped"));
    const take = claimable.slice(0, want - moved.length);
    if (!take.length) continue;

    const takeIds = new Set(take.map(item => item.recipientId));
    const remaining = (donor.recipients || []).filter(item => !takeIds.has(item.recipientId));

    store.put({
      ...donor,
      recipients: remaining,
      size: remaining.length,
      status: remaining.length ? "local_pending" : "skipped",
      reallocatedCount: Number(donor.reallocatedCount || 0) + take.length,
      updatedAt: new Date().toISOString(),
    });

    for (const item of take) {
      moved.push({ ...item, status: "local_pending", reason: "Bổ sung để đủ số lượng", groupId: "" });
    }
  }

  if (moved.length) {
    store.put({
      ...receiver,
      recipients: [...(receiver.recipients || []), ...moved],
      refillClaimed: Number(receiver.refillClaimed || 0) + moved.length,
      updatedAt: new Date().toISOString(),
    });
  }
  await transactionDone(tx);
  return { moved };
}
```

### 9.2 Cấu trúc `group_pair` khi gọi `/conflict_check/resolve` (`resolve_type: 1`)
```json
{
  "group_pair": [
    {
      "creator_id": "7492819283719283",
      "invitation_group_id": "1729384729182371"
    }
  ],
  "resolve_type": 1
}
```

---

## CHUYÊN ĐỀ 10: STATE MACHINE PHỤC HỒI & GIẢI CAPTCHA KHI BỊ CHẶN Ở NHÓM 80/200

### 10.1 Delay Matrix & Jitter chuẩn cho 200 nhóm liên tục
- **Delay giữa 2 lần tạo nhóm**: `7.5s – 9.5s` (`Base 7.5s + Math.random() * 2.0s`).
- **Thời gian chạy**: 200 nhóm x 8.5s trung bình = **~28 phút** để hoàn thành 10.000 KOC an toàn tuyệt đối.

### 10.2 State Machine phục hồi khi gặp Captcha
1. **Chuyển trạng thái an toàn**: Khi gặp Captcha ở nhóm 80, chuyển chunk sang `waiting_captcha_solver`. Lưu `idempotencyKey` và `requestFingerprint` để không tạo nhóm trùng.
2. **Kích hoạt Auto Captcha Resolver**:
   - Gửi ảnh sang microservice `captcha_server.py` (FastAPI + OpenCV) tính tọa độ mảnh ghép.
   - Injector `captcha_client_injector.js` kéo trượt theo đường cong Bezier ngẫu nhiên.
3. **Tiếp tục liền mạch**: Khi Captcha hoàn tất, State Machine chuyển về `local_running`, tiếp tục chạy từ nhóm 80 đến nhóm 200 mà không mất dữ liệu.

---

## CHUYÊN ĐỀ 11: QUẢN LÝ BỘ NHỚ UI & XUẤT BÁO CÁO EXCEL 10.000 DÒNG 2 SHEET

### 11.1 Throttling UI & Thanh Mini Bar nổi
- Áp dụng `Throttling 500ms` cho việc cập nhật Progress Bar, không re-render 10.000 DOM nodes.
- Hỗ trợ thu nhỏ thành thanh nổi Mini Bar trên TikTok Shop, giữ nguyên tiến trình khi phóng to/thu nhỏ.

### 11.2 Xuất Báo Cáo Excel 10.000 Dòng 2 Sheet (SheetJS `xlsx`)
```javascript
function exportInviteRunReport(runInfo, recipients = []) {
  const wb = XLSX.utils.book_new();

  // SHEET 1: CHI TIẾT 10.000 KOC
  const headers = ["STT", "Handle KOC", "Tên KOC", "OEC ID", "Trạng Thái", "Mã Lỗi TikTok", "Chi Tiết Lý Do", "Tên Nhóm Mời", "Thời Gian"];
  const rows = [headers];

  recipients.forEach((item, index) => {
    rows.push([
      index + 1,
      item.handle || "",
      item.nickname || "",
      item.creatorOecId || item.creatorId || "",
      item.status === "sent" ? "Thành công" : "Bỏ qua / Lỗi",
      item.tiktokCode || "",
      item.reason || "",
      item.groupName || "",
      item.updatedAt || ""
    ]);
  });

  const wsDetail = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, wsDetail, "Chi Tiết Mời KOC");

  // SHEET 2: THỐNG KÊ & TỔNG QUAN
  const stats = {
    total: recipients.length,
    sent: recipients.filter(r => r.status === "sent").length,
    conflict: recipients.filter(r => r.status === "skipped_conflict").length,
    shopLinked: recipients.filter(r => r.status === "skipped_shop_linked").length,
    unavailable: recipients.filter(r => r.status === "skipped_creator_unavailable").length,
  };

  const summaryRows = [
    ["CHỈ SỐ THỐNG KÊ ĐỢT MỜI", "SỐ LƯỢNG"],
    ["Tổng số KOC nạp vào", stats.total],
    ["Mời thành công (Đã vào nhóm)", stats.sent],
    ["Bỏ qua do trùng lời mời", stats.conflict],
    ["Bỏ qua do nick liên kết Shop (16024016)", stats.shopLinked],
    ["Bỏ qua do KOC không khả dụng (50001702)", stats.unavailable],
    ["Tỷ lệ thành công", `${((stats.sent / stats.total) * 100).toFixed(2)}%`]
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Báo Cáo Tổng Quan");

  const fileName = `BaoCao_MoiKOC_${runInfo.shopName || "Shop"}_${Date.now()}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
```

---

# ======================================================================
# PHẦN 3: BẢNG TRA CỨU HÀM & FILE SOURCE CODE LÕI TRONG CODEBASE
# ======================================================================

| Nghiệp Vụ / Chức Năng | Tên Hàm Trong Codebase | File Chứa Source Code |
| :--- | :--- | :--- |
| **Kiểm tra trùng lặp KOC** | `prefilterConflicts(batch, attemptNo)` | [`src/content/local-invite-executor.js`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/src/content/local-invite-executor.js#L1825) |
| **Gỡ trùng kéo KOC về** | `capGoTrung(body, batch)` | [`src/content/local-invite-executor.js`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/src/content/local-invite-executor.js#L1173) |
| **Bù KOC nguyên tử giữa các chunk** | `reallocateRefill(payload)` | [`src/background/local-invite-db.js`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/src/background/local-invite-db.js#L636) |
| **Nhận diện lỗi 16024016** | `laLoiCreatorGanShop(result)` | [`src/content/local-invite-executor.js`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/src/content/local-invite-executor.js#L1234) |
| **Đặt tên nhóm & Cắt $\le 30$ ký tự** | `tenNhomTheoLan(groupName, soNhom)` | [`src/content/local-invite-executor.js`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/src/content/local-invite-executor.js#L475) |
| **Quét STT tiếp nối lớn nhất** | `laySttTiepNoi(shopId, region)` | [`stonk-app/app.js`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/stonk-app/app.js#L3308) |
| **Tra cứu OEC ID 100 handles** | `checkCreatorHandlesOnTikTok(...)` | [`src/content/overlay-launcher.js`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/src/content/overlay-launcher.js#L2925) |
| **Chuẩn hóa response Import KOC** | `normalizeTikTokCreatorImportCheck(...)` | [`stonk-app/app.js`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/stonk-app/app.js#L2827) |
| **Giải Puzzle Captcha OpenCV** | `FastAPI app + OpenCV matchTemplate` | [`captcha_server.py`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/captcha_server.py#L1) |
| **Kéo chuột giả lập đường Bezier** | `simulateDragPiece(...)` | [`captcha_client_injector.js`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/captcha_client_injector.js#L1) |
| **Xuất Báo cáo Excel 2 Sheet** | `exportInviteRunReport(runInfo, recipients)` | [`stonk-app/app.js`](file:///Users/nhatminh/Downloads/STONK%20AI%20BOOKING%20/stonk-app/app.js#L22300) |
