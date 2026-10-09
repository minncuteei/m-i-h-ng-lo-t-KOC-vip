/**
 * KOC VIP - Local Invite Execution Engine (ISOLATED world).
 * Điều phối luồng mời hàng loạt KOC trên tab TikTok Shop Affiliate.
 * Hoàn toàn cục bộ, kết nối với page-executor qua postMessage và lưu trữ vào IndexedDB qua background.
 */
(function () {
  if (window.top !== window) return;
  const CLIENT_VERSION = "1.0.0";
  const BRIDGE_PATCH = "kocvip";
  const BRIDGE_PROTOCOL = `${CLIENT_VERSION}-${BRIDGE_PATCH}`;
  if (window.__KOCVIP_LOCAL_INVITE_EXECUTOR_VERSION === BRIDGE_PROTOCOL) return;
  window.__KOCVIP_LOCAL_INVITE_EXECUTOR_VERSION = BRIDGE_PROTOCOL;
  window.__KOCVIP_LOCAL_INVITE_EXECUTOR__ = true;

  const REQUEST_SOURCE = `kocvip-job-runner-${CLIENT_VERSION}-${BRIDGE_PATCH}`;
  const RESULT_SOURCE = `kocvip-page-executor-${CLIENT_VERSION}-${BRIDGE_PATCH}`;
  const BRIDGE_NONCE = crypto.randomUUID();

  const TERMINAL_CHUNK_STATUSES = new Set(["sent", "skipped", "failed", "waiting_daily_reset", "cancelled", "settled"]);
  const activeRuns = new Map();
  const kickedRuns = new Set();

  function isExtensionValid() {
    try {
      return Boolean(window.chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function safeGetURL(path) {
    try {
      if (!isExtensionValid()) return "";
      return chrome.runtime.getURL(path);
    } catch {
      return "";
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function cancellableSleep(ms, serverRunId) {
    const start = Date.now();
    return new Promise(resolve => {
      const timer = setInterval(() => {
        const controller = activeRuns.get(serverRunId);
        if (!controller || controller.cancelled || kickedRuns.has(serverRunId) || Date.now() - start >= ms) {
          clearInterval(timer);
          kickedRuns.delete(serverRunId);
          resolve();
        }
      }, 100);
    });
  }

  function setIntervalBenBi(callback, intervalMs) {
    let timer = null;
    let stopped = false;
    async function tick() {
      if (stopped) return;
      try { await callback(); } catch {}
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
    timer = setTimeout(tick, intervalMs);
    return () => { stopped = true; clearTimeout(timer); };
  }

  function extensionMessage(type, payload = {}, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; reject(new Error(`Message timeout (${type})`)); }
      }, timeoutMs);

      try {
        chrome.runtime.sendMessage({ type, payload }, response => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response?.data !== undefined ? response.data : response);
          }
        });
      } catch (err) {
        if (!done) { done = true; clearTimeout(timer); reject(err); }
      }
    });
  }

  function emitLog(text, isError = false) {
    // Cache log vào bộ nhớ để phục hồi khi modal mở lại
    if (currentActiveRun) {
      if (!currentActiveRun.logs) currentActiveRun.logs = [];
      currentActiveRun.logs.push({ text, isError, ts: Date.now() });
      if (currentActiveRun.logs.length > 250) currentActiveRun.logs.splice(0, currentActiveRun.logs.length - 200);
    }
    try {
      chrome.runtime.sendMessage({
        type: "KOCVIP_LOG_ENTRY",
        payload: { text, isError },
      });
    } catch {}
    try {
      if (overlayIframe?.contentWindow) {
        overlayIframe.contentWindow.postMessage({
          type: "KOCVIP_LOG_ENTRY",
          payload: { text, isError },
        }, "*");
      }
    } catch {}
  }

  function emitProgress(payload = {}) {
    try {
      chrome.runtime.sendMessage({
        type: "KOCVIP_PROGRESS_UPDATE",
        payload,
      });
    } catch {}
    try {
      if (overlayIframe?.contentWindow) {
        overlayIframe.contentWindow.postMessage({
          type: "KOCVIP_PROGRESS_UPDATE",
          payload,
        }, "*");
      }
    } catch {}
  }

  // Cập nhật tiến độ Real-time ngay lập tức trên màn hình
  async function syncProgressNow(manifest) {
    if (!manifest?.serverRunId) return;
    try {
      const allChunks = await localDb("listChunks", { serverRunId: manifest.serverRunId });
      let sentCount = 0, skippedCount = 0, failedCount = 0, waitingCount = 0, totalCount = 0;
      for (const c of (allChunks || [])) {
        for (const r of (c.recipients || [])) {
          totalCount++;
          if (r.status === "sent") sentCount++;
          else if (r.status === "skipped") skippedCount++;
          else if (r.status === "failed") failedCount++;
          else if (r.status === "waiting_daily_reset") waitingCount++;
        }
      }

      const payload = {
        serverRunId: manifest.serverRunId,
        sent: sentCount,
        skipped: skippedCount,
        failed: failedCount,
        waiting: waitingCount,
        total: totalCount,
        processed: sentCount + skippedCount + failedCount,
        status: "running",
      };

      if (currentActiveRun) {
        currentActiveRun.sent = sentCount;
        currentActiveRun.skipped = skippedCount;
        currentActiveRun.failed = failedCount;
        currentActiveRun.waiting = waitingCount;
        currentActiveRun.totalRecipients = totalCount;
        currentActiveRun.processed = payload.processed;
      }
      emitProgress(payload);
      renderMiniBar();
    } catch {}
  }

  function localDb(op, payload = {}) {
    return extensionMessage("KOCVIP_LOCAL_DB", { op, ...payload });
  }

  function safeStorageSet(data) {
    try {
      if (typeof chrome !== "undefined" && chrome?.storage?.local?.set) {
        return chrome.storage.local.set(data);
      }
    } catch {}
    return Promise.resolve();
  }

  function safeStorageRemove(keys) {
    try {
      if (typeof chrome !== "undefined" && chrome?.storage?.local?.remove) {
        return chrome.storage.local.remove(keys);
      }
    } catch {}
    return Promise.resolve();
  }

  function getShopContext() {
    const params = new URLSearchParams(window.location.search);
    const matchShop = document.cookie.match(/(?:^|;\s*)(?:x-jupiter-shop-id|oec_seller_id)=([^;]*)/);
    const shopId = params.get("shop_id") || params.get("shopId") || params.get("oec_seller_id") || (matchShop ? decodeURIComponent(matchShop[1]) : "");
    const matchRegion = document.cookie.match(/(?:^|;\s*)shop_region=([^;]*)/);
    const region = params.get("shop_region") || params.get("region") || (matchRegion ? decodeURIComponent(matchRegion[1]) : "VN");
    return {
      shopId: String(shopId || "").trim(),
      region: String(region || "VN").trim().toUpperCase(),
    };
  }

  function extractShopNameFromDOM() {
    try {
      // 1. Quét text nodes trong dropdown user profile (như ở Ảnh 1: "Vietnam (ChamVN)")
      const allTextElements = document.querySelectorAll('div, span, p, h1, h2, h3, h4, a');
      for (const el of allTextElements) {
        const t = el.textContent?.trim();
        if (t && /Vietnam\s*\(([^)]+)\)/i.test(t)) {
          const m = t.match(/Vietnam\s*\(([^)]+)\)/i);
          if (m && m[1] && m[1].trim().length >= 2) return m[1].trim();
        }
      }

      // 2. Kiểm tra các selector phổ biến trong header TikTok Shop Seller Center
      const selectors = [
        '[class*="ShopInfo"] [class*="name"]',
        '[class*="shop-name"]',
        '[class*="shopName"]',
        '[class*="seller-name"]',
        '[class*="sellerName"]',
        '[class*="account-name"]',
        '[class*="accountName"]',
        '[data-testid*="shop-name"]',
        '.header-shop-name'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        const text = el?.textContent?.trim();
        if (text && text.length >= 2 && text.length <= 35 && !text.toLowerCase().includes("chọn") && !text.toLowerCase().includes("quản lý") && !text.toLowerCase().includes("tài khoản")) {
          return text;
        }
      }
    } catch {}
    return "";
  }

  // Tự động gọi API /api/v1/affiliate/account/all_sellers/get lấy tên shop chính thức 100%
  async function fetchShopInfoFromTikTokAPI() {
    try {
      const res = await executeInPage({
        method: "GET",
        path: "/api/v1/affiliate/account/all_sellers/get",
        noShopInject: true,
      });
      if (res?.body?.data?.sellers_data) {
        const sellers = res.body.data.sellers_data;
        for (const [sId, sellerObj] of Object.entries(sellers)) {
          const shopName = sellerObj?.shops?.[0]?.shop_name || sellerObj?.global_seller?.global_seller_name || "";
          if (shopName) {
            await safeStorageSet({ kocvip_shop_name: shopName, kocvip_last_shop_id: sId });
            return shopName;
          }
        }
      }
    } catch (e) {
      console.warn("[KOC VIP] fetchShopInfoFromTikTokAPI error:", e);
    }
    return "";
  }

  // Tự động nhận diện và đồng bộ tên shop chuẩn từ API & trang TikTok
  setTimeout(async () => {
    let sName = await fetchShopInfoFromTikTokAPI();
    if (!sName) sName = extractShopNameFromDOM();
    if (sName) {
      safeStorageSet({ kocvip_shop_name: sName });
    }
  }, 800);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "KOCVIP_GET_DOM_SHOP_NAME") {
      (async () => {
        let sName = await fetchShopInfoFromTikTokAPI();
        if (!sName) sName = extractShopNameFromDOM();
        sendResponse({ success: true, shopName: sName });
      })();
      return true;
    }

    if (message?.type === "KOCVIP_SCAN_MAX_GROUP_SEQ") {
      (async () => {
        try {
          const { shopId, region } = getShopContext();
          const targetPrefix = String(message?.payload?.prefix || "").toLowerCase().trim();
          let globalMaxSeq = 0;
          let prefixMaxSeq = 0;

          function extractSeqNumberFromName(name) {
            if (!name) return 0;
            const clean = String(name).trim();
            const lower = clean.toLowerCase();

            // QUY TẮC BẮT BUỘC: Chỉ lấy STT khi nhóm có chứa chữ ký nhận diện của bạn/tool
            // (Ví dụ: 'x nhatminh', 'x nm', 'x nm_', 'nhatminh', ' x ')
            // Loại bỏ 100% các nhóm tự do chứa số như 'khẩu trang 1907', 'combo 99k', 'quần 2024'
            const hasSignature = lower.includes("x nhatminh") || 
                                 lower.includes("x nm") || 
                                 lower.includes("x nm_") || 
                                 lower.includes("x nm/") ||
                                 lower.includes("nhatminh") ||
                                 /\s+x\s+/.test(lower);

            if (!hasSignature) {
              return 0; // Bỏ qua nếu không có chữ ký nhận diện
            }

            // 1. Khớp hậu tố số có gạch nối/gạch dưới/khoảng trắng: _007, -007, 007, _006_a1, _001a, ...
            const m1 = clean.match(/[-_ ](?:a|n)?(\d{1,4})(?:[-_a-z]\d*)?$/i);
            if (m1 && m1[1]) {
              const val = parseInt(m1[1], 10);
              if (val > 0 && val <= 1500) return val;
            }
            
            // 2. Khớp cụm 2-4 chữ số ở cuối:
            const m2 = clean.match(/_(\d{2,4})(?:[-_a-z]\d*)?$/i);
            if (m2 && m2[1]) {
              const val = parseInt(m2[1], 10);
              if (val > 0 && val <= 1500) return val;
            }

            return 0;
          }

          // Quét trạng thái 5 (All / Tất cả) + 1, 2, 3, 4 để bao phủ 100% nhóm
          const statusesToScan = [5, 1, 2, 3, 4];
          const scannedGroupIds = new Set();

          for (const status of statusesToScan) {
            try {
              const res = await executeInPage({
                method: "POST",
                path: "/api/v1/oec/affiliate/seller/invitation_group/search",
                shopId,
                shopRegion: region,
                body: { cur_page: 1, invitation_group_status: status, page_size: 50, search_params: { filter_accept_status: 3, query_items: [] } },
              });
              const list = res?.body?.data?.invitation_group_list || res?.body?.data?.invitation_list || [];
              for (const group of list) {
                const gId = group.id || group.invitation_group_id || group.group_id;
                if (gId && scannedGroupIds.has(gId)) continue;
                if (gId) scannedGroupIds.add(gId);

                const name = String(group.name || group.invitation_group?.name || "").trim();
                const num = extractSeqNumberFromName(name);
                if (num > 0) {
                  if (num > globalMaxSeq) globalMaxSeq = num;
                  if (targetPrefix && name.toLowerCase().includes(targetPrefix)) {
                    if (num > prefixMaxSeq) prefixMaxSeq = num;
                  }
                }
              }
            } catch (eScan) {}
          }

          sendResponse({ success: true, maxSeq: globalMaxSeq, globalMaxSeq, prefixMaxSeq });
        } catch (err) {
          sendResponse({ success: false, maxSeq: 0, globalMaxSeq: 0, prefixMaxSeq: 0, error: String(err?.message || err) });
        }
      })();
      return true;
    }
  });

  function ensurePageExecutorInjected() {
    try {
      if (document.getElementById("kocvip-page-executor-script")) return;
      const script = document.createElement("script");
      script.id = "kocvip-page-executor-script";
      script.src = safeGetURL("src/content/page-executor.js");
      (document.head || document.documentElement).appendChild(script);
    } catch {}
  }

  async function executeInPage(request) {
    ensurePageExecutorInjected();
    const requestId = crypto.randomUUID();
    const context = getShopContext();
    return new Promise((resolve, reject) => {
      const timerWarning = setTimeout(() => {
        emitLog(`[KOCVIP API] Đang chờ máy chủ TikTok phản hồi (${request.path})...`);
      }, 4000);

      const timeout = setTimeout(() => {
        clearTimeout(timerWarning);
        window.removeEventListener("message", onMessage);
        reject(new Error("TikTok API không phản hồi sau 25s (mạng chậm hoặc phiên TikTok đang bị tạm nghẽn)"));
      }, 25000);

      function onMessage(event) {
        if (event.source !== window || event.origin !== window.location.origin) return;
        const message = event.data;
        if (!message || message.source !== RESULT_SOURCE || message.requestId !== requestId || message.bridgeNonce !== BRIDGE_NONCE) return;
        clearTimeout(timeout);
        clearTimeout(timerWarning);
        window.removeEventListener("message", onMessage);

        if (message.body?.sessionExpired) {
          const sessionError = new Error(message.body.message || "Phiên TikTok Affiliate đã hết hạn");
          sessionError.code = "LOCAL_INVITE_SESSION_EXPIRED";
          reject(sessionError);
          return;
        }
        if (!message.ok && !message.body) reject(new Error(message.error || "TikTok request failed"));
        else resolve(message);
      }

      window.addEventListener("message", onMessage);
      window.postMessage({
        source: REQUEST_SOURCE,
        replySource: RESULT_SOURCE,
        type: "execute",
        requestId,
        bridgeNonce: BRIDGE_NONCE,
        request: {
          ...request,
          shopId: request.shopId || context.shopId,
          shopRegion: request.shopRegion || request.region || context.region,
        },
      }, window.location.origin);
    });
  }

  function endTimeMillis(expiresAt) {
    const date = expiresAt ? new Date(`${expiresAt}T23:59:59.000+07:00`) : new Date(Date.now() + 365 * 86400000);
    return String(date.getTime());
  }

  // DÁN NGUYÊN VĂN recipientPayload()
  function recipientPayload(recipient) {
    const creatorOecId = String(recipient.creatorOecId || "").trim();
    return {
      base_info: {
        creator_id: "",
        nick_name: "",
        creator_oec_id: creatorOecId,
      },
    };
  }

  function formatFriendlyError(code, rawMsg) {
    const msg = String(rawMsg || "").toLowerCase();
    if (code === 16024016 || msg.includes("linked with a shop account")) {
      return "Bỏ qua (do KOC là tài khoản liên kết Shop khác, TikTok không cho gửi lời mời Affiliate)";
    }
    if (code === 16024034 || code === 16024035 || msg.includes("reach the upper limit") || msg.includes("quota")) {
      return "Tạm dừng (do Shop đã dùng hết hạn mức 200 nhóm/ngày của TikTok, chờ 0h reset)";
    }
    if (code === 16024002 || msg.includes("duplicate") || msg.includes("already exist")) {
      return "Bị lỗi (do tên nhóm đã tồn tại trên TikTok, hệ thống đang tự động đổi tên)";
    }
    if (code === 98001004 || msg.includes("invalid param") || msg.includes("verify your input")) {
      return "Bị lỗi (do KOC cài đặt chặn lời mời hoặc tài khoản bị giới hạn tiếp thị)";
    }
    if (code === 50001702 || msg.includes("unavailable creator or product")) {
      return "Bị lỗi (do sản phẩm đính kèm đã hết hàng hoặc KOC không đủ điều kiện)";
    }
    return `Bị lỗi (do TikTok phản hồi: ${rawMsg || "Lỗi tham số"})`;
  }

  // Tự động nhận diện danh sách ID KOC bị lỗi liên kết Shop (Mã 16024016) từ response của TikTok
  function extractBadCreatorsFromResponse(res) {
    const data = res?.body?.data || {};
    const msg = String(res?.body?.message || "");
    const badIds = new Set();
    if (data?.creator_id) badIds.add(String(data.creator_id).trim());
    if (data?.creator_oec_id) badIds.add(String(data.creator_oec_id).trim());
    const listFields = ["failed_creators", "failed_creator_list", "failed_creator_ids", "creator_id_list", "invalid_creators", "creators"];
    for (const f of listFields) {
      if (Array.isArray(data[f])) {
        for (const item of data[f]) {
          if (typeof item === "string" || typeof item === "number") badIds.add(String(item).trim());
          else if (item?.creator_oec_id) badIds.add(String(item.creator_oec_id).trim());
          else if (item?.creator_id) badIds.add(String(item.creator_id).trim());
          else if (item?.base_info?.creator_oec_id) badIds.add(String(item.base_info.creator_oec_id).trim());
        }
      }
    }
    const matches = msg.match(/\b\d{16,21}\b/g);
    if (matches) {
      matches.forEach(m => badIds.add(m));
    }
    return Array.from(badIds).filter(Boolean);
  }

  function extractBadCreatorFromResponse(res) {
    const list = extractBadCreatorsFromResponse(res);
    return list.length ? list[0] : null;
  }

  // Chuẩn hóa tên nhóm an toàn cho TikTok API (giữ dấu tiếng Việt, loại bỏ ký tự đặc biệt, giới hạn tối đa 30 ký tự)
  function sanitizeInvitationName(rawName) {
    let name = String(rawName || "").trim();
    // Thay thế các ký tự đặc biệt không an toàn gây lỗi
    name = name.replace(/[/\\:*?"<>|~`!@#$%^&=+{}\[\];]/g, "-");
    name = name.replace(/\s+/g, " ");
    name = name.replace(/[-_]{2,}/g, "_");
    name = name.trim();
    if (!name) {
      name = `KOC_${Date.now().toString(36)}`;
    }
    // TikTok giới hạn độ dài Tên lời mời tối đa chính xác 30 ký tự (0/30)
    if (name.length > 30) {
      name = name.slice(0, 30).trim();
    }
    return name;
  }

  // Tên nhóm chuẩn hóa: [Tên Shop / Tiêu đề]_[Số thứ tự] (VD: ChạmVN x nhatminh_001)
  function tenNhomTheoLan(groupName, soNhom) {
    let ten = String(groupName || "").trim();
    ten = ten.replace(/[/\\:*?"<>|~`!@#$%^&=+{}\[\];]/g, "-").replace(/\s+/g, " ").replace(/[-_]{2,}/g, "_");

    // Bảo vệ nguyên vẹn đuôi STT _001, _043 nếu tổng độ dài tên vượt quá 30 ký tự
    const khopDuoiStt = ten.match(/^(.*?)(_(\d{2}[-_]\d{2}_)?\d{2,4})$/);
    if (khopDuoiStt) {
      const suffix = khopDuoiStt[2];
      const maxHead = Math.max(3, 30 - suffix.length);
      const head = khopDuoiStt[1].slice(0, maxHead).trim();
      return sanitizeInvitationName(`${head}${suffix}`);
    }

    const lan = Math.max(1, Number(soNhom || 1));
    if (lan <= 1) return sanitizeInvitationName(ten.slice(0, 30));
    const duoiThem = `_N${lan}`;
    if (ten.length + duoiThem.length <= 30) return sanitizeInvitationName(ten + duoiThem);
    const khopDuoi = ten.match(/^(.*?)(_\d{1,2}_\d{1,2}_\d+)$/);
    if (khopDuoi) {
      const dau = khopDuoi[1].slice(0, Math.max(1, 30 - khopDuoi[2].length - duoiThem.length));
      return sanitizeInvitationName(`${dau}${khopDuoi[2]}${duoiThem}`);
    }
    return sanitizeInvitationName(ten.slice(0, 30 - duoiThem.length) + duoiThem);
  }

  // DỰNG BODY CREATE KHỚP 100% HAR ENTRY 137 (TUYỆT ĐỐI KHÔNG CÓ has_flash_sale)
  function buildCreateBody(draft, recipients, groupName) {
    const contacts = [];
    if (draft.zalo) {
      contacts.push({
        title: "",
        field: 42,
        value: String(draft.zalo).replace(/\D/g, "").replace(/^84/, "").replace(/^0/, ""),
        country_code: "VN#84",
      });
    }
    if (draft.facebook) contacts.push({ title: "Facebook", field: 41, value: draft.facebook, country_code: "" });

    // Chuẩn hóa placeholder thành {{user_name}} theo đúng HAR
    const rawMsg = draft.message || "";
    const message = rawMsg
      .replace(/\{\{\s*creators?_?username\s*\}\}/gi, "{{user_name}}")
      .replace(/\{\{\s*creators?\s+username\s*\}\}/gi, "{{user_name}}");

    const finalGroupName = sanitizeInvitationName(groupName || draft.title || "KOCVIP");

    return {
      invitation_group: {
        name: finalGroupName,
        message,
        contacts_info: contacts,
        group_type: 1,
        free_sample_rule: {
          has_free_sample: !!draft.sampleEnabled,
          is_free_sample_auto_review: !!draft.sampleEnabled && draft.sampleApprovalMode === "auto",
          sample_setting_type: draft.sampleEnabled ? (draft.sampleApprovalMode === "auto" ? 2 : 1) : 0,
        },
        end_time: endTimeMillis(draft.expiresAt),
        product_list: (draft.products || [])
          .filter(product => Boolean(product.productId || product.product_id))
          .slice(0, 100)
          .map(product => {
            let comm = Number(product.target_commission || product.commissionBps || 0);
            if (!comm && (product.commissionRate || draft.commission)) {
              comm = Math.round(Number(product.commissionRate || draft.commission) * 100);
            }
            if (!comm) comm = 800;

            let adsComm = Number(product.target_ads_commission || product.adsCommissionBps || 0);
            if (!adsComm && draft.adsCommission) {
              adsComm = Math.round(Number(draft.adsCommission) * 100);
            }
            if (!adsComm && adsComm !== 0) adsComm = 200;

            return {
              product_id: String(product.productId || product.product_id || "").trim(),
              target_commission: comm,
              target_ads_commission: adsComm,
            };
          }),
        creator_id_list: recipients
          .map(recipientPayload)
          .filter(item => Boolean(item?.base_info?.creator_oec_id || item?.base_info?.creator_id)),
        delivery_requirements: {
          content_option: draft.contentPreference === "live" ? 2 : draft.contentPreference === "video" ? 1 : (draft.contentOption ?? 1),
        },
      },
    };
  }

  // DỰNG BODY CONFLICT_CHECK KHỚP 100% HAR ENTRY 126 & 135
  function buildConflictCheckBody(draft, recipients) {
    return {
      invitation: {
        product_list: (draft.products || [])
          .filter(product => Boolean(product.productId || product.product_id))
          .slice(0, 100)
          .map(product => {
            let comm = Number(product.target_commission || product.commissionBps || 0);
            if (!comm && (product.commissionRate || draft.commission)) {
              comm = Math.round(Number(product.commissionRate || draft.commission) * 100);
            }
            if (!comm) comm = 800;

            let adsComm = Number(product.target_ads_commission || product.adsCommissionBps || 0);
            if (!adsComm && draft.adsCommission) {
              adsComm = Math.round(Number(draft.adsCommission) * 100);
            }
            if (!adsComm && adsComm !== 0) adsComm = 200;

            return {
              product_id: String(product.productId || product.product_id || "").trim(),
              target_commission: comm,
              target_ads_commission: adsComm,
            };
          }),
        creator_id_list: recipients
          .map(recipientPayload)
          .filter(item => Boolean(item?.base_info?.creator_oec_id || item?.base_info?.creator_id)),
        group_type: 1,
      },
    };
  }

  // DÁN NGUYÊN VĂN buildCreatorsAddBody()
  function buildCreatorsAddBody(groupId, recipients) {
    return {
      group_id: String(groupId || ""),
      creator_ids: recipients
        .map(recipient => String(recipient.creatorOecId || recipient.creatorId || "").trim())
        .filter(Boolean),
    };
  }

  // DÁN NGUYÊN VĂN invitationEligibilityFingerprint()
  function invitationEligibilityFingerprint(draft, shopId, region) {
    const normalized = {
      version: 1,
      shopId: String(shopId || ""),
      region: String(region || "VN").toUpperCase(),
      groupType: 1,
      hasFlashSale: false,
      freeSampleRule: {
        hasFreeSample: !!draft?.sampleEnabled,
        autoReview: !!draft?.sampleEnabled && draft?.sampleApprovalMode === "auto",
        settingType: draft?.sampleEnabled ? (draft?.sampleApprovalMode === "auto" ? 2 : 1) : 0,
      },
      contentOption: draft?.contentPreference === "live" ? 2 : draft?.contentPreference === "video" ? 1 : 0,
      expiresAt: String(draft?.expiresAt || ""),
      message: String(draft?.message || ""),
      products: (draft?.products || []).map(product => ({
        productId: String(product?.productId || ""),
        commissionBps: Number(product?.commissionBps ?? draft?.commissionBps ?? 0),
        adsCommissionBps: Number(product?.adsCommissionBps ?? draft?.adsCommissionBps ?? 0),
      })),
    };
    const input = JSON.stringify(normalized);
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `eligibility-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function isTikTokSuccess(res) {
    const code = Number(res?.body?.code ?? -1);
    return res?.ok && (code === 0 || code === 200);
  }

  function recipientStatusPatch(item, status, reason = "") {
    return {
      ...item,
      status,
      reason: reason || item.reason || "",
      updatedAt: new Date().toISOString(),
    };
  }

  function isOecIdValid(id) {
    const s = String(id || "").trim();
    return /^\d{8,25}$/.test(s) && !s.endsWith("00000000");
  }

  function extractGroupId(res) {
    if (!res) return "";
    const d = res.body?.data;
    const b = res.body;
    if (typeof d === "string" || typeof d === "number") return String(d);
    if (d?.invitation?.id) return String(d.invitation.id);
    if (d?.invitation_group?.id) return String(d.invitation_group.id);
    if (d?.invitation_group?.group_id) return String(d.invitation_group.group_id);
    if (d?.invitation_group?.invitation_group_id) return String(d.invitation_group.invitation_group_id);
    if (d?.invitation_group_id) return String(d.invitation_group_id);
    if (d?.group_id) return String(d.group_id);
    if (d?.invitation_id) return String(d.invitation_id);
    if (d?.id) return String(d.id);
    if (d?.invitation_groups?.[0]?.id) return String(d.invitation_groups[0].id);
    if (d?.invitation_groups?.[0]?.invitation_group_id) return String(d.invitation_groups[0].invitation_group_id);
    if (d?.invitation_list?.[0]?.id) return String(d.invitation_list[0].id);
    if (d?.invitations?.[0]?.id) return String(d.invitations[0].id);
    if (d?.group?.id) return String(d.group.id);
    if (b?.invitation?.id) return String(b.invitation.id);
    if (b?.invitation_group_id) return String(b.invitation_group_id);
    if (b?.group_id) return String(b.group_id);
    if (b?.id) return String(b.id);
    if (typeof d === "object" && d !== null) {
      for (const [k, v] of Object.entries(d)) {
        if ((k.includes("id") || k.includes("group")) && (typeof v === "string" || typeof v === "number") && String(v).length >= 5) {
          return String(v);
        }
      }
    }
    return "";
  }

  let lastCaptchaResolvedAt = 0;
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "KOCVIP_PROGRESS_UPDATE" && message?.payload?.status === "captcha_resolved") {
      lastCaptchaResolvedAt = Date.now();
    }
  });

  function isCaptchaPresentOnPage() {
    const selectors = [
      ".captcha-verify-container",
      "#captcha-verify-image",
      ".secsdk-captcha-drag-icon",
      "[data-testid='whirl-inner-img']",
      ".captcha_verify_container",
      ".secsdk_captcha_modal",
      ".captcha-disable-scroll",
      "[class*='captcha-verify']",
      "[id*='captcha-verify']",
      "iframe[src*='captcha']",
      "iframe[src*='verify']",
      "[data-testid*='captcha']",
      ".verify-bar-close",
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)) {
          return true;
        }
      } catch {}
    }
    return false;
  }

  function playCaptchaAlertBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  }

  async function waitForCaptchaResolution(controller, manifest) {
    if (controller?.cancelled) return { cancelled: true };
    emitLog("[KOC VIP] ⚠️ TikTok yêu cầu giải Captcha trên màn hình! Đang tạm dừng chờ bạn giải xong để tự động tiếp tục...", true);
    playCaptchaAlertBeep();

    const prevStatus = currentActiveRun?.status || "running";
    if (currentActiveRun) {
      currentActiveRun.status = "waiting_captcha";
      renderMiniBar();
    }

    // Tự động thu nhỏ bảng to để người dùng nhìn thấy ngay khung giải Captcha trên màn hình TikTok
    hideModal();

    try {
      chrome.runtime.sendMessage({
        type: "KOCVIP_NOTIFY_CAPTCHA",
        payload: {
          serverRunId: manifest?.serverRunId,
          message: "TikTok đang yêu cầu giải Captcha trên màn hình. Hãy bấm vào đây để mở tab TikTok và giải ngay!"
        }
      });
    } catch {}
    emitProgress({
      serverRunId: manifest?.serverRunId,
      status: "waiting_captcha",
      message: "⚠️ TikTok yêu cầu giải Captcha trên màn hình — Tiện ích đang chờ bạn giải xong để tự động tiếp tục..."
    });

    const maxWaitMs = 300000; // 5 phút
    const startTime = Date.now();
    let captchaWasSeen = isCaptchaPresentOnPage();

    while (Date.now() - startTime < maxWaitMs) {
      if (controller?.cancelled) break;
      if (controller) controller.lastActivityAt = Date.now();

      const currentlyPresent = isCaptchaPresentOnPage();
      if (currentlyPresent) {
        captchaWasSeen = true;
      }

      const recentlyResolved = Date.now() - lastCaptchaResolvedAt < 4000;
      if ((captchaWasSeen && !currentlyPresent) || recentlyResolved) {
        emitLog("[KOC VIP] ✅ Đã giải xong Captcha! Đang đợi 2 giây để TikTok cập nhật phiên...");
        await sleep(2000);
        showModal(manifest?.serverRunId);
        break;
      }

      await sleep(700);
    }

    if (controller?.cancelled) {
      if (currentActiveRun) {
        currentActiveRun.status = "cancelled";
        currentActiveRun.completed = true;
        renderMiniBar();
      }
      return { cancelled: true };
    }

    if (currentActiveRun && currentActiveRun.status === "waiting_captcha") {
      currentActiveRun.status = prevStatus === "waiting_captcha" ? "running" : prevStatus;
      renderMiniBar();
    }
    emitProgress({
      serverRunId: manifest?.serverRunId,
      status: "running",
      message: "Đã giải xong Captcha. Đang tiếp tục đợt mời..."
    });
    return { resolved: true };
  }

  const handleToOecCache = new Map();

  async function resolveMissingOecIds(recipients, shopId, region, controller, manifest) {
    if (!recipients || !recipients.length) return;

    // 1. Phục hồi nhanh từ bộ nhớ tạm in-memory
    for (const r of recipients) {
      if (!isOecIdValid(r.creatorOecId)) {
        const h = String(r.handle || "").replace(/^@/, "").toLowerCase().trim();
        if (h && handleToOecCache.has(h)) {
          r.creatorOecId = handleToOecCache.get(h);
        }
      }
    }

    let missing = recipients.filter(r => !isOecIdValid(r.creatorOecId));
    if (!missing.length) return;

    // 2. Tra cứu hàng loạt từ IndexedDB kocCache (Persistent Storage)
    try {
      const missingHandles = missing.map(r => String(r.handle || "").replace(/^@/, "").toLowerCase().trim()).filter(Boolean);
      if (missingHandles.length) {
        const cachedKocs = await localDb("getCachedKocs", { handles: missingHandles });
        if (Array.isArray(cachedKocs) && cachedKocs.length) {
          for (const item of cachedKocs) {
            const h = String(item.handle || "").replace(/^@/, "").toLowerCase().trim();
            const oec = String(item.creatorOecId || "").trim();
            if (h && isOecIdValid(oec)) {
              handleToOecCache.set(h, oec);
            }
          }
          for (const r of missing) {
            const h = String(r.handle || "").replace(/^@/, "").toLowerCase().trim();
            if (handleToOecCache.has(h)) {
              r.creatorOecId = handleToOecCache.get(h);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[KOC VIP] Tra cứu IndexedDB kocCache:", e);
    }

    missing = recipients.filter(r => !isOecIdValid(r.creatorOecId));
    if (!missing.length) return;

    // 3. Batch 100 handles per request tới API TikTok Shop import_check (Chuẩn STONK)
    const batchSize = 100;
    const newlyResolvedForDb = [];

    for (let i = 0; i < missing.length; i += batchSize) {
      if (controller?.cancelled) break;
      if (isCaptchaPresentOnPage()) {
        await waitForCaptchaResolution(controller, manifest);
      }
      const slice = missing.slice(i, i + batchSize);
      const handleNames = slice.map(r => String(r.handle || "").replace(/^@/, "").trim()).filter(Boolean);
      if (!handleNames.length) continue;

      try {
        let res = await executeInPage({
          method: "POST",
          path: "/api/v1/oec/affiliate/crm/creator/import_check",
          body: { handle_names: handleNames },
          shopId,
          region,
        });

        if (res?.body?.captchaRequired || isCaptchaPresentOnPage()) {
          await waitForCaptchaResolution(controller, manifest);
          res = await executeInPage({
            method: "POST",
            path: "/api/v1/oec/affiliate/crm/creator/import_check",
            body: { handle_names: handleNames },
            shopId,
            region,
          });
        }

        const foundList = res?.body?.data?.creators || res?.body?.creators || [];
        for (const item of foundList) {
          const base = item.base || item.creator_base || item || {};
          const h = String(base.handle_name || item.handle_name || "").replace(/^@/, "").toLowerCase().trim();
          const oec = String(base.oec_id || base.creator_oec_id || item.oec_id || item.creator_oec_id || "").trim();
          const nick = String(base.nickname || item.nickname || h).trim();
          if (h && isOecIdValid(oec)) {
            handleToOecCache.set(h, oec);
            newlyResolvedForDb.push({ handle: h, creatorOecId: oec, nickname: nick });
          }
        }

        for (const r of slice) {
          const h = String(r.handle || "").replace(/^@/, "").toLowerCase().trim();
          if (handleToOecCache.has(h)) {
            r.creatorOecId = handleToOecCache.get(h);
          }
        }
      } catch (err) {
        console.warn("[KOC VIP] Tra cứu import_check 100 KOC lỗi:", err);
      }

      // Microtask yield + delay 150ms siêu mượt
      await Promise.resolve();
      await cancellableSleep(150 + Math.floor(Math.random() * 50), manifest.serverRunId);
    }

    // Lưu các kết quả tra cứu mới vào IndexedDB kocCache
    if (newlyResolvedForDb.length) {
      try {
        await localDb("saveCachedKocs", { creators: newlyResolvedForDb });
      } catch {}
    }
  }

  // Lọc sạch toàn bộ danh sách KOC trước khi chạy (Bulk Pre-filter & Clean Buffer)
  async function runBulkPreFilterAndRechunk(manifest, shopId, region, controller) {
    if (manifest.draft?.tuXuLyTrung || manifest.dryRunOnly) {
      return;
    }

    const allChunks = await localDb("listChunks", { serverRunId: manifest.serverRunId });
    if (!Array.isArray(allChunks) || !allChunks.length) return;

    // 1. Thu thập toàn bộ KOC từ tất cả chunks
    const allRecipients = [];
    for (const c of allChunks) {
      for (const r of (c.recipients || [])) {
        allRecipients.push({ ...r });
      }
    }

    if (allRecipients.length === 0) return;

    emitLog(`[KOCVIP BULK PRE-FILTER] Bắt đầu kiểm tra OEC ID và lọc trùng cho toàn bộ ${allRecipients.length} KOC...`);

    // 2. Tra cứu OEC ID hàng loạt với batch 100 handles
    await resolveMissingOecIds(allRecipients, shopId, region, controller, manifest);

    // 3. Tra cứu Sổ đen (Blacklist)
    let blOecSet = new Set();
    let blHandleSet = new Set();
    try {
      const blRes = await localDb("getBlacklist", { shopId });
      const blList = Array.isArray(blRes?.list) ? blRes.list : (Array.isArray(blRes) ? blRes : []);
      blOecSet = new Set(blList.map(b => String(b.creatorOecId || "").trim()).filter(Boolean));
      blHandleSet = new Set(blList.map(b => String(b.handle || "").replace(/^@/, "").toLowerCase().trim()).filter(Boolean));
    } catch {}

    const validOecList = [];
    const skippedList = [];

    for (const r of allRecipients) {
      const oec = String(r.creatorOecId || "").trim();
      const h = String(r.handle || "").replace(/^@/, "").toLowerCase().trim();
      if (!isOecIdValid(oec)) {
        skippedList.push(recipientStatusPatch(r, "failed", "Không tìm thấy OEC ID TikTok"));
      } else if (blOecSet.has(oec) || (h && blHandleSet.has(h))) {
        skippedList.push(recipientStatusPatch(r, "skipped", "Tài khoản liên kết Shop (Sổ đen tự động loại trừ)"));
      } else {
        validOecList.push(r);
      }
    }

    if (validOecList.length === 0) return;

    // 4. Quét kiểm trùng hàng loạt theo lô lớn 100 KOC/lệnh
    emitLog(`[KOCVIP BULK PRE-FILTER] Đang quét kiểm trùng siêu tốc cho ${validOecList.length} KOC qua TikTok (100 KOC/lệnh)...`);
    const batchSize = 100;
    const allConflictOecIds = new Set();
    const conflictInfoMap = new Map();

    for (let i = 0; i < validOecList.length; i += batchSize) {
      if (controller?.cancelled) break;
      const slice = validOecList.slice(i, i + batchSize);
      const checkBody = buildConflictCheckBody(manifest.draft || {}, slice);

      try {
        const checkRes = await executeInPage({
          method: "POST",
          path: "/api/v1/oec/affiliate/seller/invitation_group/conflict_check",
          shopId,
          region,
          body: checkBody,
        });

        const data = checkRes?.body?.data || {};
        for (const item of (data.conflict_cids || [])) {
          if (Array.isArray(item?.cids)) item.cids.forEach(cid => cid && allConflictOecIds.add(String(cid).trim()));
          else if (item) allConflictOecIds.add(String(item).trim());
        }
        for (const group of (data.conflict_list || [])) {
          const oldGroupName = group?.name || "";
          for (const c of (group?.creator_id_list || [])) {
            const oec = String(c?.base_info?.creator_oec_id || "").trim();
            if (oec) {
              allConflictOecIds.add(oec);
              conflictInfoMap.set(oec, oldGroupName);
            }
          }
        }
      } catch (err) {
        console.warn("[KOC VIP] Bulk pre-filter conflict check error:", err);
      }

      await Promise.resolve();
      await cancellableSleep(150, manifest.serverRunId);
    }

    // 5. Phân tách KOC sạch 100% và KOC bị trùng
    const cleanList = [];
    for (const r of validOecList) {
      const oec = String(r.creatorOecId || "").trim();
      if (allConflictOecIds.has(oec)) {
        const oldName = conflictInfoMap.get(oec);
        const desc = oldName ? `Trùng nhóm "${oldName}"` : "Đang có lời mời hiệu lực tại nhóm khác";
        skippedList.push(recipientStatusPatch(r, "skipped", `${desc} (Tự động loại trừ do trùng)`));
      } else {
        cleanList.push({ ...r, status: "local_pending", daKiemSach: true });
      }
    }

    emitLog(`[KOCVIP BULK PRE-FILTER HOÀN TẤT] Quét xong ${allRecipients.length} KOC: Có ${cleanList.length} KOC SẠCH 100% sẵn sàng tạo nhóm, ${skippedList.length} KOC bị trùng/lỗi tự động bỏ qua!`);

    // 6. Gom toàn bộ KOC sạch thành các nhóm 50 KOC chuẩn xác
    const newChunks = [];
    const baseGroupName = (manifest.draft?.title || "KOCVIP").replace(/_N\d+$/i, "");
    let groupIndex = 1;
    const CHUNK_CAP = 50;

    for (let i = 0; i < cleanList.length; i += CHUNK_CAP) {
      const slice = cleanList.slice(i, i + CHUNK_CAP);
      const matchedOriginalChunk = allChunks[groupIndex - 1];
      const chunkGroupName = matchedOriginalChunk?.groupName || (cleanList.length > CHUNK_CAP ? `${baseGroupName}_${String(groupIndex).padStart(3, "0")}` : baseGroupName);
      newChunks.push({
        chunkId: `${manifest.serverRunId}_c${groupIndex}`,
        serverRunId: manifest.serverRunId,
        shopId,
        groupName: chunkGroupName,
        capacity: CHUNK_CAP,
        status: "local_pending",
        isPreFiltered: true,
        recipients: slice,
        updatedAt: new Date().toISOString(),
      });
      groupIndex++;
    }

    // Lưu chunk chứa các KOC đã bị trùng/loại trừ (status: settled)
    if (skippedList.length > 0) {
      newChunks.push({
        chunkId: `${manifest.serverRunId}_skipped`,
        serverRunId: manifest.serverRunId,
        shopId,
        groupName: `${baseGroupName}_BỏQua`,
        capacity: skippedList.length,
        status: "settled",
        isPreFiltered: true,
        recipients: skippedList,
        updatedAt: new Date().toISOString(),
      });
    }

    // Cập nhật lại IndexedDB với danh sách Chunks mới đã lọc sạch
    for (const c of newChunks) {
      await localDb("saveChunk", { manifest, chunk: c, patch: c });
    }

    manifest.chunks = newChunks;
    await syncProgressNow(manifest);
  }

  // Thực thi 1 Chunk KOC
  async function executeChunk(manifest, chunk, controller) {
    if (controller?.cancelled) return { state: "cancelled" };
    if (TERMINAL_CHUNK_STATUSES.has(chunk.status)) return { state: "settled" };
    const pageContext = getShopContext();
    const shopId = (!manifest.shopId || manifest.shopId === "default") ? pageContext.shopId : manifest.shopId;
    const region = manifest.region && manifest.region !== "VN" && manifest.region !== "DEFAULT" ? manifest.region : (pageContext.region || "VN");
    // Độ trễ an toàn lấy từ manifest (người dùng chọn), min 3000ms, mặc định 7500ms (chuẩn ~30s / camp)
    const NHIP_TOI_THIEU_MS = Math.max(3000, Number(manifest.safeDelayMs || 7500));
    const JITTER_MS = Math.round(NHIP_TOI_THIEU_MS * 0.3); // Biến động ngẫu nhiên ±30% để giả lập thao tác người dùng thật
    let nhipLenhCuoi = 0;

    const callTikTok = async (req, maxRetries = 3, isFastRetry = false) => {
      // Các API chỉ đọc (conflict_check, import_check) chỉ nghỉ ngắn 350ms, không nghỉ 7.5s
      const isReadOnly = isFastRetry || req?.path?.includes("conflict_check") || req?.path?.includes("import_check") || req?.path?.includes("get_creator_info");
      const targetDelay = isReadOnly ? 350 : NHIP_TOI_THIEU_MS;
      const targetJitter = isReadOnly ? 100 : JITTER_MS;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (controller?.cancelled) {
          const cancelErr = new Error("Đợt mời đã bị người dùng hủy bỏ");
          cancelErr.cancelled = true;
          throw cancelErr;
        }
        if (controller) controller.lastActivityAt = Date.now();

        if (isCaptchaPresentOnPage()) {
          const capRes = await waitForCaptchaResolution(controller, manifest);
          if (controller?.cancelled || capRes?.cancelled) {
            const cancelErr = new Error("Đợt mời đã bị người dùng hủy bỏ");
            cancelErr.cancelled = true;
            throw cancelErr;
          }
        }

        if (nhipLenhCuoi > 0) {
          const cachLan = Date.now() - nhipLenhCuoi;
          if (cachLan < targetDelay) {
            const delay = targetDelay - cachLan + Math.floor(Math.random() * targetJitter);
            await cancellableSleep(delay, manifest.serverRunId);
          } else if (!isFastRetry) {
            await cancellableSleep(Math.floor(Math.random() * 500) + 300, manifest.serverRunId);
          } else {
            await cancellableSleep(150, manifest.serverRunId);
          }
        }
        nhipLenhCuoi = Date.now();

        let res;
        try {
          res = await executeInPage(req);
        } catch (err) {
          if (controller?.cancelled) throw err;
          if (attempt < maxRetries && (isCaptchaPresentOnPage() || err.message?.includes("Captcha"))) {
            const capRes = await waitForCaptchaResolution(controller, manifest);
            if (controller?.cancelled || capRes?.cancelled) throw err;
            continue;
          }
          throw err;
        }

        if (controller?.cancelled) {
          const cancelErr = new Error("Đợt mời đã bị người dùng hủy bỏ");
          cancelErr.cancelled = true;
          throw cancelErr;
        }

        // ✅ CHỈ coi là Captcha khi page-executor báo captchaRequired THỰC SỰ (đã lọc sạch verify/verification thông thường)
        // TUYỆT ĐỐI không bắt chữ "verify" trong message vì sẽ nhầm với lỗi validate tham số
        const isCaptchaSignal = res?.body?.captchaRequired === true ||
          res?.body?.code === 30004009 ||
          isCaptchaPresentOnPage() ||
          (req.path.includes("/create") && Number(res?.body?.code ?? 0) === 0 && !res?.body?.data?.invitation?.id && isCaptchaPresentOnPage());

        if (isCaptchaSignal && attempt < maxRetries && !controller?.cancelled) {
          emitLog(`[KOCVIP] TikTok yêu cầu xác minh Captcha tại API ${req.path}. Đang tạm dừng chờ bạn giải Captcha...`, true);
          const capRes = await waitForCaptchaResolution(controller, manifest);
          if (controller?.cancelled || capRes?.cancelled) {
            const cancelErr = new Error("Đợt mời đã bị người dùng hủy bỏ");
            cancelErr.cancelled = true;
            throw cancelErr;
          }
          emitLog(`[KOCVIP] Đang gọi lại API ${req.path} sau khi giải Captcha thành công...`);
          await cancellableSleep(1500, manifest.serverRunId);
          continue;
        }

        return res;
      }
    };

    // 1. Đảm bảo KOC có creatorOecId
    const validBefore = (chunk.recipients || []).filter(r => isOecIdValid(r.creatorOecId)).length;
    emitLog(`[KOCVIP] Chunk ${chunk.chunkId}: Có ${validBefore}/${chunk.recipients?.length || 0} KOC có creatorOecId sẵn.`);

    if (validBefore < (chunk.recipients?.length || 0)) {
      const missingCount = (chunk.recipients?.length || 0) - validBefore;
      emitLog(`[KOCVIP] Chunk ${chunk.chunkId}: Có ${missingCount} KOC chưa có OEC ID -> Đang gọi TikTok import_check...`);
      await resolveMissingOecIds(chunk.recipients || [], shopId, region, controller, manifest);
      const validAfter = (chunk.recipients || []).filter(r => isOecIdValid(r.creatorOecId)).length;
      emitLog(`[KOCVIP] Chunk ${chunk.chunkId}: Sau import_check, có ${validAfter}/${chunk.recipients?.length || 0} KOC hợp lệ.`);
    }

    let recipients = (chunk.recipients || []).map(r => {
      if (!isOecIdValid(r.creatorOecId)) {
        return recipientStatusPatch(r, "failed", "Không tìm thấy OEC ID TikTok");
      }
      return r;
    });

    // 1b. Sàng lọc danh sách đen (Blacklist - các KOC liên kết Shop đã biết)
    try {
      const blRes = await localDb("getBlacklist", { shopId });
      const blList = Array.isArray(blRes?.list) ? blRes.list : (Array.isArray(blRes) ? blRes : []);
      if (blList.length > 0) {
        const blOecSet = new Set(blList.map(b => String(b.creatorOecId || "").trim()).filter(Boolean));
        const blHandleSet = new Set(blList.map(b => String(b.handle || "").replace(/^@/, "").toLowerCase().trim()).filter(Boolean));

        let blCount = 0;
        recipients = recipients.map(r => {
          const oec = String(r.creatorOecId || "").trim();
          const handle = String(r.handle || "").replace(/^@/, "").toLowerCase().trim();
          if ((oec && blOecSet.has(oec)) || (handle && blHandleSet.has(handle))) {
            blCount++;
            return recipientStatusPatch(r, "skipped", "Tài khoản liên kết Shop (Sổ đen tự động loại trừ)");
          }
          return r;
        });
        if (blCount > 0) {
          emitLog(`[KOCVIP SỔ ĐEN] Đã tự động loại trừ trước ${blCount} KOC liên kết Shop từ Sổ đen.`);
        }
      }
    } catch {}

    let pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));
    if (!pending.length) {
      emitLog(`[KOCVIP] Chunk ${chunk.chunkId}: Toàn bộ KOC đã được xử lý hoặc không có KOC hợp lệ. Hoàn tất chunk.`, false);
      await localDb("saveChunk", { manifest, chunk, patch: { status: "settled", recipients } });
      return { state: "settled" };
    }

    // 1c. Kiểm tra sản phẩm bắt buộc
    const selectedProducts = manifest.draft?.products || [];
    if (!selectedProducts.length) {
      emitLog(`[KOCVIP] [LỖI ĐỎ] Chunk ${chunk.chunkId}: Không có sản phẩm nào được chọn! TikTok bắt buộc phải có ít nhất 1 sản phẩm để gắn lời mời.`, true);
      recipients = recipients.map(r => recipientStatusPatch(r, "failed", "Chưa chọn sản phẩm trong lời mời (bắt buộc)"));
      await localDb("saveChunk", { manifest, chunk, patch: { status: "failed", recipients } });
      return { state: "failed" };
    }

    // 2. Conflict Check (Kiểm trùng)
    if (chunk.isPreFiltered) {
      emitLog(`[KOCVIP] Chunk ${chunk.chunkId} (${chunk.groupName}): Đã được lọc sạch 100% KOC qua Bulk Pre-Filter -> Gửi lệnh tạo nhóm ngay!`);
    } else {
      const conflictCheckBody = buildConflictCheckBody(manifest.draft || {}, pending);
      let conflictIds = new Set();
      const conflictInfoMap = new Map(); // oecId -> { oldGroupId, oldGroupName, userName, nickName }

      try {
        emitLog(`[KOCVIP API] Đang gọi conflict_check cho ${pending.length} KOC...`);
      const checkRes = await callTikTok({
        method: "POST",
        path: "/api/v1/oec/affiliate/seller/invitation_group/conflict_check",
        shopId,
        shopRegion: region,
        body: conflictCheckBody,
      });
      const checkCode = Number(checkRes?.body?.code ?? (checkRes?.httpStatus === 200 ? 0 : checkRes?.httpStatus ?? -1));
      const checkStatus = checkRes?.httpStatus || checkRes?.status || (checkRes?.ok ? 200 : 400);

      if (!checkRes?.ok || checkCode !== 0) {
        const msg = checkRes?.body?.message || checkRes?.error || "Lỗi kiểm tra trùng lặp";
        emitLog(`[KOCVIP API LỖI] conflict_check thất bại: HTTP ${checkStatus}, Code ${checkCode}: ${msg}`, true);
      } else {
        const data = checkRes?.body?.data || {};

        // 1. Đọc từ conflict_cids: [{ conflict_type: 4, cids: ["7494019818635626133", ...] }]
        const rawConflictCids = data.conflict_cids || [];
        for (const item of rawConflictCids) {
          if (Array.isArray(item?.cids)) {
            for (const cid of item.cids) {
              if (cid) conflictIds.add(String(cid).trim());
            }
          } else if (typeof item === "string" || typeof item === "number") {
            conflictIds.add(String(item).trim());
          }
        }

        // 2. Đọc từ conflict_list: [{ id, name, product_list, creator_id_list }]
        const rawConflictList = data.conflict_list || [];
        for (const group of rawConflictList) {
          const oldGroupId = group?.id || "";
          const oldGroupName = group?.name || "";
          for (const c of (group?.creator_id_list || [])) {
            const oec = String(c?.base_info?.creator_oec_id || "").trim();
            if (oec) {
              conflictIds.add(oec);
              conflictInfoMap.set(oec, {
                oldGroupId,
                oldGroupName,
                userName: c?.base_info?.user_name || "",
                nickName: c?.base_info?.nick_name || "",
              });
            }
          }
        }

        if (conflictIds.size > 0) {
          emitLog(`[KOCVIP] Phát hiện ${conflictIds.size} KOC đang có lời mời hiệu lực tại nhóm khác.`);
        }
      }
    } catch (err) {
      emitLog(`[KOCVIP API LỖI] conflict_check ngoại lệ: ${err.message}`, true);
    }

    // 2b. Xử lý Chế độ Kiểm trùng nhanh (dryRunOnly)
    if (manifest.dryRunOnly) {
      recipients = recipients.map(r => {
        const oec = String(r.creatorOecId || "").trim();
        if (conflictIds.has(oec)) {
          const info = conflictInfoMap.get(oec);
          const desc = info?.oldGroupName ? `Trùng nhóm "${info.oldGroupName}"` : "Đang có lời mời hiệu lực";
          return recipientStatusPatch(r, "skipped", desc);
        }
        return r;
      });
      emitLog(`[KOCVIP] [KIỂM TRÙNG] Hoàn tất kiểm tra chunk ${chunk.chunkId}: ${conflictIds.size}/${pending.length} KOC bị trùng. Dừng trước khi tạo nhóm.`);
      await localDb("saveChunk", { manifest, chunk, patch: { status: "settled", recipients } });
      return { state: "settled" };
    }

    // 2c. Xử lý Trùng lặp cho đợt gửi thật
    const tuXuLyTrung = !!manifest.draft?.tuXuLyTrung;
    if (conflictIds.size > 0) {
      if (tuXuLyTrung) {
        // Tự động kéo KOC về lượt mời này (theo chuẩn HAR TikTok: group_pair & resolve_type: 1)
        try {
          const groupPair = [];
          for (const cid of conflictIds) {
            const info = conflictInfoMap.get(cid);
            if (info?.oldGroupId) {
              groupPair.push({
                invitation_group_id: String(info.oldGroupId),
                creator_id: String(cid),
              });
            }
          }

          if (groupPair.length > 0) {
            emitLog(`[KOCVIP API] Đang giải quyết trùng lặp (conflict_check/resolve) cho ${groupPair.length} KOC...`);
            const resolveRes = await callTikTok({
              method: "POST",
              path: "/api/v1/oec/affiliate/seller/invitation_group/conflict_check/resolve",
              shopId,
              shopRegion: region,
              body: {
                resolve_type: 1,
                group_pair: groupPair,
              },
            });
            const resolveCode = Number(resolveRes?.body?.code ?? (resolveRes?.httpStatus === 200 ? 0 : resolveRes?.httpStatus ?? -1));
            const resolveStatus = resolveRes?.httpStatus || resolveRes?.status || (resolveRes?.ok ? 200 : 400);

            if (!resolveRes?.ok || resolveCode !== 0) {
              const msg = resolveRes?.body?.message || resolveRes?.error || "TikTok không hỗ trợ gỡ trùng tự động";
              emitLog(`[KOCVIP API CẢNH BÁO] Không thể gỡ trùng (HTTP ${resolveStatus}, Code ${resolveCode}: ${msg}) -> Tự động LOẠI TRỪ ${conflictIds.size} KOC trùng để bảo vệ nhóm không bị lỗi 50001702.`, true);
              recipients = recipients.map(r => {
                const oec = String(r.creatorOecId || "").trim();
                if (conflictIds.has(oec)) {
                  const info = conflictInfoMap.get(oec);
                  const desc = info?.oldGroupName ? `Trùng nhóm "${info.oldGroupName}"` : "Đang có lời mời hiệu lực";
                  return recipientStatusPatch(r, "skipped", `${desc} (Tự động loại trừ do trùng)`);
                }
                return r;
              });
              pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));
            } else {
              emitLog(`[KOCVIP API] Giải quyết trùng lặp thành công! Đã gỡ ${groupPair.length} KOC khỏi nhóm cũ để mời vào nhóm mới.`);
              // Kiểm tra lại lần nữa để loại trừ bất kỳ KOC nào còn sót lại nếu chưa hết trùng
              try {
                const recheck = await callTikTok({
                  method: "POST",
                  path: "/api/v1/oec/affiliate/seller/invitation_group/conflict_check",
                  shopId,
                  shopRegion: region,
                  body: conflictCheckBody,
                });
                const redata = recheck?.body?.data || {};
                const remainingConflicts = new Set();
                for (const item of (redata.conflict_cids || [])) {
                  if (Array.isArray(item?.cids)) item.cids.forEach(c => remainingConflicts.add(String(c)));
                }
                if (remainingConflicts.size > 0) {
                  emitLog(`[KOCVIP] Còn ${remainingConflicts.size} KOC chưa thể gỡ -> Tự động loại trừ.`);
                  recipients = recipients.map(r => {
                    const oec = String(r.creatorOecId || "").trim();
                    if (remainingConflicts.has(oec)) {
                      return recipientStatusPatch(r, "skipped", "Đang có lời mời hiệu lực (Tự động loại trừ do trùng)");
                    }
                    return r;
                  });
                  pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));
                }
              } catch (_) {}
            }
          } else {
            // Không có oldGroupId trong conflict_list -> Fallback loại trừ
            emitLog(`[KOCVIP] Không xác định được nhóm cũ để gỡ -> Tự động LOẠI TRỪ ${conflictIds.size} KOC trùng.`);
            recipients = recipients.map(r => {
              const oec = String(r.creatorOecId || "").trim();
              if (conflictIds.has(oec)) {
                return recipientStatusPatch(r, "skipped", "Đang có lời mời hiệu lực (Tự động loại trừ do trùng)");
              }
              return r;
            });
            pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));
          }
        } catch (err) {
          emitLog(`[KOCVIP API LỖI] Ngoại lệ gỡ trùng: ${err.message} -> Tự động loại trừ KOC trùng để bảo vệ nhóm.`, true);
          recipients = recipients.map(r => {
            const oec = String(r.creatorOecId || "").trim();
            if (conflictIds.has(oec)) {
              return recipientStatusPatch(r, "skipped", "Đang có lời mời hiệu lực (Tự động loại trừ do trùng)");
            }
            return r;
          });
          pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));
        }
      } else {
        // KHÔNG TÍCH "KÉO VỀ": LOẠI BỎ HOÀN TOÀN KOC TRÙNG KHỎI CHUNK (KHÔNG ĐƯA VÀO CREATE)
        emitLog(`[KOCVIP] Tùy chọn 'Kéo KOC trùng' đang TẮT. Tự động LOẠI TRỪ ${conflictIds.size} KOC bị trùng ra khỏi nhóm để bảo vệ nhóm an toàn.`);
        recipients = recipients.map(r => {
          const oec = String(r.creatorOecId || "").trim();
          if (conflictIds.has(oec)) {
            const info = conflictInfoMap.get(oec);
            const desc = info?.oldGroupName ? `Trùng nhóm "${info.oldGroupName}"` : "Đang có lời mời hiệu lực";
            return recipientStatusPatch(r, "skipped", `${desc} (Tự động loại trừ do trùng)`);
          }
          return r;
        });
        pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));
      }

      // Lưu DB và đồng bộ UI ngay lập tức
      await localDb("saveChunk", { manifest, chunk, patch: { recipients } });
      await syncProgressNow(manifest);
      emitLog(`[KOCVIP] Đã loại trừ xong ${conflictIds.size} KOC trùng. Còn lại ${pending.length} KOC sạch sẵn sàng.`);
      await cancellableSleep(1800 + Math.floor(Math.random() * 800), manifest.serverRunId);
    } else {
      emitLog(`[KOCVIP] [BƯỚC 2: KIỂM TRA SẠCH] Tuyệt vời! Toàn bộ ${pending.length} KOC đều sạch.`);
      await cancellableSleep(1200 + Math.floor(Math.random() * 600), manifest.serverRunId);
    }

    // [CÁCH 2 NÂNG CAO: TỰ ĐỘNG BÙ KOC TỪ CÁC NHÓM SAU ĐỂ ĐỦ 50 KOC SẠCH]
    const TARGET_CHUNK_CAPACITY = 50;
    let refillPasses = 0;
    const MAX_REFILL_PASSES = 4;

    while (pending.length < TARGET_CHUNK_CAPACITY && refillPasses < MAX_REFILL_PASSES && !controller?.cancelled) {
      refillPasses++;
      const needed = TARGET_CHUNK_CAPACITY - pending.length;

      // NGUYÊN TỬ: Di chuyển KOC từ chunk sau sang chunk hiện tại trong 1 transaction IndexedDB duy nhất (tránh mất KOC)
      const refillRes = await localDb("reallocateRefill", {
        serverRunId: manifest.serverRunId,
        receiverChunkId: chunk.chunkId,
        shortage: needed,
      });

      let refilledKocs = Array.isArray(refillRes?.moved) ? refillRes.moved : [];
      if (!refilledKocs.length) {
        break; // Không còn KOC nào khả dụng ở các nhóm sau để bù
      }

      emitLog(`[KOCVIP BÙ KOC TỰ ĐỘNG] Đã bốc thêm ${refilledKocs.length} KOC từ nhóm tiếp theo để bù vào nhóm "${chunk.groupName || chunk.chunkId}". Đang kiểm tra OEC ID và quét trùng cho KOC mới...`);

      // 1. Đảm bảo KOC mới bù vào có OEC ID hợp lệ
      const needOecResolve = refilledKocs.filter(r => !isOecIdValid(r.creatorOecId));
      if (needOecResolve.length > 0) {
        await resolveMissingOecIds(refilledKocs, shopId, region, controller, manifest);
      }
      refilledKocs = refilledKocs.map(r => {
        if (!isOecIdValid(r.creatorOecId)) {
          return recipientStatusPatch(r, "failed", "Không tìm thấy OEC ID TikTok");
        }
        return r;
      });

      // 2. Quét trùng cho các KOC mới bù vào
      const refilledValid = refilledKocs.filter(r => r.status !== "failed" && isOecIdValid(r.creatorOecId));
      if (refilledValid.length > 0) {
        const refillCheckBody = buildConflictCheckBody(manifest.draft || {}, refilledValid);
        try {
          const refillCheckRes = await callTikTok({
            method: "POST",
            path: "/api/v1/oec/affiliate/seller/invitation_group/conflict_check",
            shopId,
            shopRegion: region,
            body: refillCheckBody,
          });
          const refillCode = Number(refillCheckRes?.body?.code ?? (refillCheckRes?.httpStatus === 200 ? 0 : refillCheckRes?.httpStatus ?? -1));
          if (refillCheckRes?.ok && refillCode === 0) {
            const refillData = refillCheckRes?.body?.data || {};
            const refillConflictIds = new Set();
            for (const item of (refillData.conflict_cids || [])) {
              if (Array.isArray(item?.cids)) item.cids.forEach(c => refillConflictIds.add(String(c).trim()));
              else if (item) refillConflictIds.add(String(item).trim());
            }
            for (const group of (refillData.conflict_list || [])) {
              for (const c of (group?.creator_id_list || [])) {
                const oec = String(c?.base_info?.creator_oec_id || "").trim();
                if (oec) refillConflictIds.add(oec);
              }
            }

            if (refillConflictIds.size > 0) {
              emitLog(`[KOCVIP BÙ KOC] Phát hiện ${refillConflictIds.size} KOC mới bù bị trùng -> Tự động loại trừ.`);
              refilledKocs = refilledKocs.map(r => {
                const oec = String(r.creatorOecId || "").trim();
                if (refillConflictIds.has(oec)) {
                  return recipientStatusPatch(r, "skipped", "Đang có lời mời hiệu lực (Tự động loại trừ do trùng)");
                }
                return r;
              });
            } else {
              emitLog(`[KOCVIP BÙ KOC] Toàn bộ ${refilledValid.length} KOC mới bù đều sạch, không bị trùng!`);
            }
          }
        } catch (eRefill) {
          emitLog(`[KOCVIP BÙ KOC] Lỗi quét trùng KOC bù: ${eRefill.message}`, true);
        }
      }

      // Gộp refilledKocs vào recipients của chunk hiện tại
      recipients.push(...refilledKocs);
      chunk.recipients = recipients;
      pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));

      // Lưu lại chunk hiện tại và cập nhật UI ngay lập tức
      await localDb("saveChunk", { manifest, chunk, patch: { recipients } });
      if (Array.isArray(manifest.chunks)) {
        const memChunk = manifest.chunks.find(c => c.chunkId === chunk.chunkId);
        if (memChunk) memChunk.recipients = recipients;
      }
      await syncProgressNow(manifest);
      emitLog(`[KOCVIP] Nhóm hiện tại sau khi bù có: ${pending.length} KOC sạch sẵn sàng tạo nhóm.`);

      await cancellableSleep(1500, manifest.serverRunId);
    }
  }

    if (!pending.length) {
      emitLog(`[KOCVIP] Chunk ${chunk.chunkId}: Toàn bộ KOC đều bị trùng (đã loại trừ) hoặc không có KOC hợp lệ. Hoàn tất chunk an toàn.`);
      await localDb("saveChunk", { manifest, chunk, patch: { status: "settled", recipients } });
      await syncProgressNow(manifest);
      return { state: "settled" };
    }

    // 3. Kiểm tra từ nhạy cảm trong tin nhắn
    if (!controller.daKiemNoiDung && manifest.draft?.message) {
      controller.daKiemNoiDung = true;
      try {
        await callTikTok({
          method: "POST",
          path: "/api/v1/oec/affiliate/seller/invitation_group/sensitive_text_check",
          shopId,
          shopRegion: region,
          body: { text: String(manifest.draft.message) },
        });
      } catch {}
    }

    // 4. Tạo nhóm lời mời (Create Invitation Group)
    const tenNhom = tenNhomTheoLan(chunk.groupName, chunk.soNhomDaMo || 1);
    const createBody = buildCreateBody(manifest.draft || {}, pending, tenNhom);
    emitLog(`[KOCVIP API] Đang gửi API tạo nhóm lời mời "${tenNhom}" cho ${pending.length} KOC...`);

    let createRes = await callTikTok({
      method: "POST",
      path: "/api/v1/oec/affiliate/seller/invitation_group/create",
      shopId,
      shopRegion: region,
      body: createBody,
    });

    let createCode = Number(createRes?.body?.code ?? (createRes?.httpStatus === 200 ? 0 : createRes?.httpStatus ?? -1));
    let createStatus = createRes?.httpStatus || createRes?.status || (createRes?.ok ? 200 : 400);

    // Xử lý hết hạn mức ngày
    if (createCode === 16024034 || createCode === 16024035) {
      const limitMsg = createRes?.body?.message || "Hết hạn mức mời ngày của Shop — chờ 0h reset";
      emitLog(`[KOCVIP API LỖI] Shop hết hạn mức ngày (HTTP ${createStatus}, Code ${createCode}): ${limitMsg}`, true);
      recipients = recipients.map(r => r.status === "local_pending" ? recipientStatusPatch(r, "waiting_daily_reset", `Hết hạn mức ngày (Code ${createCode})`) : r);
      await localDb("saveChunk", { manifest, chunk, patch: { status: "waiting_daily_reset", recipients } });
      return { state: "waiting_daily_reset" };
    }

    let groupId = extractGroupId(createRes);

    // Safety net: nếu groupId trống và phát hiện Captcha
    if (!groupId && (isCaptchaPresentOnPage() || createRes?.body?.captchaRequired || createCode === 30004009)) {
      emitLog(`[KOCVIP] TikTok kích hoạt Captcha khi tạo nhóm "${tenNhom}". Đang tạm dừng chờ bạn giải...`, true);
      await waitForCaptchaResolution(controller, manifest);
      emitLog(`[KOCVIP] Đang gọi lại API tạo nhóm "${tenNhom}" sau khi giải Captcha thành công...`);
      await cancellableSleep(1500, manifest.serverRunId);
      createRes = await callTikTok({
        method: "POST",
        path: "/api/v1/oec/affiliate/seller/invitation_group/create",
        shopId,
        shopRegion: region,
        body: createBody,
      });
      createCode = Number(createRes?.body?.code ?? (createRes?.httpStatus === 200 ? 0 : createRes?.httpStatus ?? -1));
      createStatus = createRes?.httpStatus || createRes?.status || (createRes?.ok ? 200 : 400);
      groupId = extractGroupId(createRes);
    }

    const isCreateSuccess = (createRes?.ok && createCode === 0) || createCode === 0;
    if (isCreateSuccess && !groupId) {
      groupId = `group_${Date.now()}`;
    }

    if (!isCreateSuccess) {
      let errMsg = createRes?.body?.message || createRes?.error || "Không tạo được nhóm lời mời trên TikTok";
      emitLog(`[KOCVIP API LỖI] create nhóm "${tenNhom}" THẤT BẠI: HTTP ${createStatus}, Code ${createCode}: ${errMsg}`, true);

      // XỬ LÝ ĐẶC BIỆT LỖI 98001004 / 16024002 (invitation name invalid):
      // Tự động thử lại ngay lập tức với tên an toàn ngẫu nhiên chuẩn ASCII để đợt mời tiếp tục chạy trơn tru
      if (createCode === 98001004 || createCode === 16024002 || errMsg.toLowerCase().includes("invitation name")) {
        const fallbackName = `KOC_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
        emitLog(`[KOCVIP TỰ ĐỘNG THỬ LẠI] Tên nhóm không hợp lệ (Mã ${createCode}) -> Đang thử lại với tên an toàn "${fallbackName}"...`);
        const fallbackBody = buildCreateBody(manifest.draft || {}, pending, fallbackName);
        createRes = await callTikTok({
          method: "POST",
          path: "/api/v1/oec/affiliate/seller/invitation_group/create",
          shopId,
          shopRegion: region,
          body: fallbackBody,
        });
        createCode = Number(createRes?.body?.code ?? (createRes?.httpStatus === 200 ? 0 : createRes?.httpStatus ?? -1));
        createStatus = createRes?.httpStatus || createRes?.status || (createRes?.ok ? 200 : 400);
        groupId = extractGroupId(createRes) || `group_${Date.now()}`;
        if ((createRes?.ok && createCode === 0) || createCode === 0) {
          emitLog(`[KOCVIP TẠO NHÓM THÀNH CÔNG] Đã tạo nhóm thành công với tên an toàn "${fallbackName}" (ID: ${groupId})!`);
          recipients = recipients.map(r => {
            if (pending.some(p => p.creatorOecId === r.creatorOecId)) {
              return { ...recipientStatusPatch(r, "sent", "Đã gửi lời mời thành công"), groupId };
            }
            return r;
          });
          await localDb("saveChunk", { manifest, chunk, patch: { status: "sent", groupId, recipients } });
          await syncProgressNow(manifest);
          return { state: "sent", groupId };
        } else {
          errMsg = createRes?.body?.message || createRes?.error || errMsg;
        }
      }

      // XỬ LÝ ĐẶC BIỆT LỖI 16024016 (The invitation failed because the creator is linked with a shop account):
      // Trong nhóm có KOC là tài khoản chính thức hoặc tiếp thị của một Shop TikTok (không được nhận lời mời Affiliate).
      // Thay vì làm hỏng cả nhóm và dừng đợt mời, tự động CÔ LẬP ĐUÔI và LOẠI BỎ KOC lỗi, gửi lời mời cho các KOC hợp lệ còn lại!
      if (createCode === 16024016 || errMsg.toLowerCase().includes("linked with a shop account")) {
        // 1. Nếu chỉ có 1 KOC trong lô gửi -> Đã tóm đúng 100% ID KOC vi phạm
        if (pending.length === 1) {
          const badKoc = pending[0];
          const kocName = badKoc.handle ? `@${badKoc.handle}` : badKoc.creatorOecId;
          emitLog(`[KOCVIP BỎ QUA] KOC ${kocName} là tài khoản liên kết Shop (Mã 16024016) -> Ghi Sổ đen vĩnh viễn & Tự động bỏ qua.`);
          try {
            await localDb("addToBlacklist", {
              creatorOecId: badKoc.creatorOecId,
              handle: badKoc.handle || "",
              reason: "Tài khoản liên kết Shop (Mã 16024016)",
              shopId,
              tiktokCode: 16024016,
            });
          } catch {}
          recipients = recipients.map(r => r.creatorOecId === badKoc.creatorOecId ? recipientStatusPatch(r, "skipped", "Tài khoản liên kết Shop (Không thể nhận lời mời Affiliate - Mã 16024016)") : r);
          await localDb("saveChunk", { manifest, chunk, patch: { status: "settled", recipients } });
          return { state: "settled" };
        }

        // 2. Nếu TikTok trả về cụ thể danh sách ID bị lỗi trong message/details
        const badCreatorIds = extractBadCreatorsFromResponse(createRes);
        if (badCreatorIds.length > 0) {
          const badSet = new Set(badCreatorIds);
          emitLog(`[KOCVIP LOẠI TRỪ] Đã xác định ${badCreatorIds.length} KOC liên kết Shop: ${badCreatorIds.join(", ")} -> Loại trừ ngay và ghi Sổ đen.`);
          for (const bId of badCreatorIds) {
            try {
              await localDb("addToBlacklist", {
                creatorOecId: bId,
                reason: "Tài khoản liên kết Shop (Mã 16024016)",
                shopId,
                tiktokCode: 16024016,
              });
            } catch {}
          }
          recipients = recipients.map(r => {
            const oec = String(r.creatorOecId || "").trim();
            if (badSet.has(oec) || badSet.has(String(r.handle || "").trim())) {
              return recipientStatusPatch(r, "skipped", "Tài khoản liên kết Shop (Không thể nhận lời mời Affiliate - Mã 16024016)");
            }
            return r;
          });
          pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));

          if (pending.length > 0) {
            emitLog(`[KOCVIP GỬI LẠI GỘP] Đang gửi 1 LỆNH DUY NHẤT tạo nhóm "${tenNhom}" cho ${pending.length} KOC sạch còn lại...`);
            const retryBody = buildCreateBody(manifest.draft || {}, pending, tenNhom);
            const retryRes = await callTikTok({
              method: "POST",
              path: "/api/v1/oec/affiliate/seller/invitation_group/create",
              shopId,
              shopRegion: region,
              body: retryBody,
            }, 2, true);
            const rCode = Number(retryRes?.body?.code ?? (retryRes?.httpStatus === 200 ? 0 : retryRes?.httpStatus ?? -1));
            let rGroupId = extractGroupId(retryRes) || `group_${Date.now()}`;
            if ((retryRes?.ok && rCode === 0) || rCode === 0) {
              recipients = recipients.map(r => {
                if (pending.some(p => p.creatorOecId === r.creatorOecId)) {
                  return { ...recipientStatusPatch(r, "sent", "Đã gửi lời mời thành công"), groupId: rGroupId };
                }
                return r;
              });
              await localDb("saveChunk", { manifest, chunk, patch: { status: "sent", groupId: rGroupId, recipients } });
              await syncProgressNow(manifest);
              return { state: "sent", groupId: rGroupId };
            }
          }
        }

        // 3. Nếu đang ở Chế độ Cô lập đuôi (Tail Isolation Mode): bóc tách từng KOC 1 (size = 1) để xác định chính xác mà không làm hỏng nhóm
        if (chunk.tailIsolationMode) {
          emitLog(`[KOCVIP CÔ LẬP ĐUÔI] Đang bóc tách từng KOC trong nhóm ${chunk.chunkId} để xác định chính xác tài khoản Shop vi phạm...`);
          for (const koc of [...pending]) {
            if (controller?.cancelled) break;
            const singleBody = buildCreateBody(manifest.draft || {}, [koc], `${tenNhom}_i`);
            const singleRes = await callTikTok({
              method: "POST",
              path: "/api/v1/oec/affiliate/seller/invitation_group/create",
              shopId,
              shopRegion: region,
              body: singleBody,
            }, 1, true);

            const sCode = Number(singleRes?.body?.code ?? (singleRes?.httpStatus === 200 ? 0 : singleRes?.httpStatus ?? -1));
            const sMsg = singleRes?.body?.message || singleRes?.error || "";
            const sGroupId = extractGroupId(singleRes) || `group_${Date.now()}`;

            if (sCode === 16024016 || sMsg.toLowerCase().includes("linked with a shop account")) {
              const kName = koc.handle ? `@${koc.handle}` : koc.creatorOecId;
              emitLog(`[KOCVIP BẮT ĐÚNG THỦ PHẠM 16024016] KOC ${kName} là nick liên kết Shop -> Ghi Sổ đen & Tự động bỏ qua.`);
              try {
                await localDb("addToBlacklist", {
                  creatorOecId: koc.creatorOecId,
                  handle: koc.handle || "",
                  reason: "Tài khoản liên kết Shop (Mã 16024016)",
                  shopId,
                  tiktokCode: 16024016,
                });
              } catch {}
              recipients = recipients.map(r => r.creatorOecId === koc.creatorOecId ? recipientStatusPatch(r, "skipped", "Tài khoản liên kết Shop (Không thể nhận lời mời Affiliate - Mã 16024016)") : r);
            } else if ((singleRes?.ok && sCode === 0) || sCode === 0) {
              recipients = recipients.map(r => r.creatorOecId === koc.creatorOecId ? { ...recipientStatusPatch(r, "sent", "Đã gửi lời mời thành công"), groupId: sGroupId } : r);
            } else {
              recipients = recipients.map(r => r.creatorOecId === koc.creatorOecId ? recipientStatusPatch(r, "failed", `Code ${sCode}: ${sMsg}`) : r);
            }
            await localDb("saveChunk", { manifest, chunk, patch: { recipients } });
            await syncProgressNow(manifest);
            await cancellableSleep(600, manifest.serverRunId);
          }
          const finalChunkState = recipients.some(r => r.status === "sent") ? "sent" : "settled";
          await localDb("saveChunk", { manifest, chunk, patch: { status: finalChunkState, recipients } });
          return { state: finalChunkState };
        }

        // 4. Nếu chưa phải chế độ cô lập đuôi (luồng chính): HOÃN NHÓM XUỐNG CUỐI (Tail Isolation Mode) để giải phóng luồng chính chạy siêu tốc
        emitLog(`[KOCVIP HOÃN CÔ LẬP ĐUÔI] Nhóm ${chunk.chunkId} chứa KOC liên kết Shop (16024016). Tự động hoãn nhóm này về cuối đợt mời để xử lý bóc tách từng KOC mà không làm chậm các nhóm sạch khác!`);
        await localDb("saveChunk", {
          manifest,
          chunk,
          patch: {
            status: "local_pending",
            phase: "waiting_creator_isolation_tail",
            tailIsolationMode: true,
            recipients,
          }
        });
        await syncProgressNow(manifest);
        return { state: "creator_isolation_tail_deferred" };
      }

      recipients = recipients.map(r => pending.some(p => p.creatorOecId === r.creatorOecId) ? recipientStatusPatch(r, "failed", `HTTP ${createStatus}, Code ${createCode}: ${errMsg}`) : r);
      await localDb("saveChunk", { manifest, chunk, patch: { status: "failed", recipients } });
      return { state: "failed", code: createCode, error: errMsg };
    }

    emitLog(`[KOCVIP API] create nhóm "${tenNhom}" THÀNH CÔNG (Group ID: ${groupId}) cho ${pending.length} KOC!`);

    // Nhóm đã tạo thành công
    recipients = recipients.map(r => {
      if (pending.some(p => p.creatorOecId === r.creatorOecId)) {
        return { ...recipientStatusPatch(r, "sent", "Đã gửi lời mời thành công"), groupId };
      }
      return r;
    });

    await localDb("saveChunk", { manifest, chunk, patch: { status: "sent", groupId, recipients } });
    await syncProgressNow(manifest);
    return { state: "sent", groupId };
  }

  // Gửi tin nhắn Cooperation Chat sau khi mời
  async function sendPostInviteChatMessages(manifest, chunks) {
    if (manifest.draft?.shareAfterInvite !== true) return;
    const shareMessage = String(manifest.draft?.shareMessage || manifest.draft?.message || "").trim();
    for (const chunk of chunks || []) {
      for (const r of chunk.recipients || []) {
        if (r.status !== "sent" || r.shareStatus === "sent") continue;
        const creatorId = String(r.creatorOecId || "").trim();
        const groupId = String(r.groupId || chunk.groupId || "").trim();
        if (!/^\d{8,}$/.test(creatorId) || !groupId) continue;

        try {
          const clientMessageId = `kocvip_chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const res = await executeInPage({
            operation: "sendTikTokIm",
            creatorId,
            content: shareMessage,
            usePlatformTemplate: true,
            invitationGroupId: groupId,
            clientMessageId,
            shopId: manifest.shopId,
            shopRegion: manifest.region || "VN",
          });
          r.shareStatus = res?.body?.sent ? "sent" : "failed";
        } catch {
          r.shareStatus = "failed";
        }
        await sleep(600);
      }
      await localDb("saveChunk", { manifest, chunk, patch: { recipients: chunk.recipients } });
    }
  }

  // Luồng thực thi toàn bộ Đợt Mời (Run)
  async function executeRun(manifest) {
    if (!manifest?.serverRunId) {
      emitLog("[KOCVIP] [LỖI ĐỎ] Thiếu manifest hoặc serverRunId!", true);
      return;
    }
    if (activeRuns.has(manifest.serverRunId)) {
      emitLog(`[KOCVIP] Đợt mời ${manifest.serverRunId} đang chạy, bỏ qua yêu cầu khởi động trùng lặp.`);
      return;
    }

    const controller = { paused: false, cancelled: false, lastActivityAt: Date.now() };
    activeRuns.set(manifest.serverRunId, controller);

    const pageContext = getShopContext();
    if (!manifest.shopId || manifest.shopId === "default") {
      manifest.shopId = pageContext.shopId || "";
    }
    if (!manifest.region || manifest.region === "DEFAULT") {
      manifest.region = pageContext.region || "VN";
    }

    emitLog(`[KOCVIP] Bắt đầu executeRun: runId = ${manifest.serverRunId}, shopId = ${manifest.shopId || "default"}`);

    try {
      await localDb("saveManifest", { manifest });
      await localDb("updateRun", { serverRunId: manifest.serverRunId, patch: { status: "running" } });
      emitLog(`[KOCVIP] Đã lưu manifest vào IndexedDB. Đang đọc chunks...`);

      let chunks = await localDb("listChunks", { serverRunId: manifest.serverRunId });

      // Fallback nếu chunks bị rỗng do bất kỳ lý do gì: tự động phân chia từ draft.recipients
      if (!Array.isArray(chunks) || !chunks.length) {
        const fallbackRecipients = manifest.draft?.recipients || manifest.recipients || [];
        if (fallbackRecipients.length > 0) {
          emitLog(`[KOCVIP] CẢNH BÁO: chunks trong DB rỗng nhưng tìm thấy ${fallbackRecipients.length} KOC trong draft. Đang tự động chia chunk...`);
          await localDb("saveManifest", { manifest });
          chunks = await localDb("listChunks", { serverRunId: manifest.serverRunId });
        }
      }

      emitLog(`[KOCVIP] Đọc IndexedDB: tìm thấy ${chunks?.length || 0} chunk(s) cho runId = ${manifest.serverRunId}`);

      if (!Array.isArray(chunks) || !chunks.length) {
        emitLog(`[KOCVIP] [LỖI ĐỎ] Không đọc được chunk từ IndexedDB hoặc đợt mời không có KOC nào! Hủy thực thi.`, true);
        await localDb("updateRun", { serverRunId: manifest.serverRunId, patch: { status: "failed", error: "Không đọc được chunk từ IndexedDB" } });
        chrome.runtime.sendMessage({
          type: "KOCVIP_PROGRESS_UPDATE",
          payload: { serverRunId: manifest.serverRunId, status: "failed", error: "Không đọc được chunk từ IndexedDB", completed: true },
        });
        return;
      }

      // SÀNG LỌC ĐẦU VÀO: Tự động loại trừ ngay các KOC đã nằm trong Sổ đen (Mã 16024016)
      try {
        const blacklist = await localDb("getBlacklist");
        if (Array.isArray(blacklist) && blacklist.length > 0) {
          const blackSet = new Set(blacklist.map(b => String(b.creatorOecId || "").trim()).filter(Boolean));
          let blackCount = 0;
          for (const c of chunks) {
            let changed = false;
            c.recipients = (c.recipients || []).map(r => {
              const oec = String(r.creatorOecId || "").trim();
              if (blackSet.has(oec) && r.status === "local_pending") {
                blackCount++;
                changed = true;
                return recipientStatusPatch(r, "skipped", "Tài khoản liên kết Shop (Sổ đen - Mã 16024016)");
              }
              return r;
            });
            if (changed) {
              await localDb("saveChunk", { manifest, chunk: c, patch: { recipients: c.recipients } });
            }
          }
          if (blackCount > 0) {
            emitLog(`[KOCVIP SỔ ĐEN] Đã tự động loại trừ ${blackCount} KOC liên kết Shop đã lưu trong Sổ đen trước khi bắt đầu!`);
          }
        }
      } catch {}

      // CHẠY BULK PRE-FILTER: Lọc trùng siêu tốc 100 KOC/lệnh và gom nhóm sạch 50 KOC/nhóm
      if (!manifest.draft?.tuXuLyTrung && !manifest.dryRunOnly) {
        try {
          await runBulkPreFilterAndRechunk(manifest, shopId, region, controller);
          chunks = await localDb("listChunks", { serverRunId: manifest.serverRunId });
        } catch (err) {
          console.warn("[KOC VIP] Lỗi chạy bulk pre-filter:", err);
        }
      }

      const totalRecipients = chunks.reduce((acc, c) => acc + (c.recipients?.length || 0), 0);
      emitLog(`[KOCVIP] Tổng số recipient trên tất cả chunk: ${totalRecipients} KOC.`);
      if (totalRecipients === 0) {
        emitLog(`[KOCVIP] [LỖI ĐỎ] Tổng số KOC trong các chunk = 0! Dừng đợt mời.`, true);
        await localDb("updateRun", { serverRunId: manifest.serverRunId, patch: { status: "failed", error: "Tổng số KOC = 0" } });
        chrome.runtime.sendMessage({
          type: "KOCVIP_PROGRESS_UPDATE",
          payload: { serverRunId: manifest.serverRunId, status: "failed", error: "Tổng số KOC = 0", completed: true },
        });
        return;
      }

      let pending = chunks.filter(c => !TERMINAL_CHUNK_STATUSES.has(c.status));
      let exitReason = "Đã hoàn thành tất cả chunks";
      let lastChunkResult = null;

      currentActiveRun = {
        serverRunId: manifest.serverRunId,
        startedAt: Date.now(),
        status: "running",
        totalRecipients: totalRecipients,
        processed: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        waiting: 0,
        currentChunkIndex: 1,
        totalChunks: chunks.length,
        completed: false,
        logs: [], // Cache log để phục hồi khi modal mở lại
      };
      try {
        localStorage.setItem("kocvip_last_run_id", manifest.serverRunId);
        safeStorageSet({ kocvip_active_run_id: manifest.serverRunId, kocvip_last_run_id: manifest.serverRunId });
      } catch {}
      startMiniBarTimer();
      renderMiniBar();

      // Watchdog 90s canh kẹt tiến trình
      const watchdogTimer = setIntervalBenBi(() => {
        if (controller.cancelled || controller.paused) return;
        if (Date.now() - controller.lastActivityAt > 90000) {
          emitLog("[KOCVIP Watchdog] Kẹt 90s không phản hồi -> Thử kích hoạt lại tiến trình", true);
          kickedRuns.add(manifest.serverRunId);
          controller.lastActivityAt = Date.now();
        }
      }, 15000);

      // Sắp xếp các chunk đang ở chế độ cô lập đuôi xuống cuối
      pending.sort((a, b) => {
        const aIsTail = Boolean(a.tailIsolationMode || a.phase === "waiting_creator_isolation_tail");
        const bIsTail = Boolean(b.tailIsolationMode || b.phase === "waiting_creator_isolation_tail");
        if (aIsTail === bIsTail) return 0;
        return aIsTail ? 1 : -1;
      });

      while (pending.length && !controller.cancelled) {
        if (controller.paused) {
          if (currentActiveRun && currentActiveRun.status !== "paused") {
            currentActiveRun.status = "paused";
            renderMiniBar();
          }
          await sleep(1000);
          continue;
        } else if (currentActiveRun && currentActiveRun.status === "paused") {
          currentActiveRun.status = "running";
          renderMiniBar();
        }

        const chunk = pending[0];
        emitLog(`[KOCVIP] Bắt đầu chunk ${chunk.chunkId} (${chunk.groupName || "Nhóm"}): Có ${chunk.recipients?.length || 0} KOC.`);
        const res = await executeChunk(manifest, chunk, controller);
        lastChunkResult = res;

        // Bắn tiến độ về Side Panel / UI
        try {
          chrome.runtime.sendMessage({
            type: "KOCVIP_PROGRESS_UPDATE",
            payload: { serverRunId: manifest.serverRunId, chunkId: chunk.chunkId, status: res.state },
          });
        } catch {}

        chunks = await localDb("listChunks", { serverRunId: manifest.serverRunId });
        let sentCount = 0, skippedCount = 0, failedCount = 0, waitingCount = 0;
        for (const c of (chunks || [])) {
          for (const r of (c.recipients || [])) {
            if (r.status === "sent") sentCount++;
            else if (r.status === "skipped") skippedCount++;
            else if (r.status === "failed") failedCount++;
            else if (r.status === "waiting_daily_reset") waitingCount++;
          }
        }
        if (currentActiveRun) {
          currentActiveRun.sent = sentCount;
          currentActiveRun.skipped = skippedCount;
          currentActiveRun.failed = failedCount;
          currentActiveRun.waiting = waitingCount;
          currentActiveRun.processed = sentCount + skippedCount + failedCount;
          const finishedChunks = (chunks || []).filter(c => TERMINAL_CHUNK_STATUSES.has(c.status)).length;
          currentActiveRun.currentChunkIndex = Math.min(chunks.length, finishedChunks + 1);
          renderMiniBar();
        }

        if (res.state === "waiting_daily_reset") {
          exitReason = "Shop chạm hạn mức mời ngày của TikTok (chờ 0h reset)";
          emitLog(`[KOCVIP] Thoát vòng lặp executeRun: ${exitReason}`, true);
          break;
        }

        if (res.state === "failed") {
          emitLog(`[KOCVIP CẢNH BÁO] Chunk ${chunk.chunkId} thất bại (${res.error || "TikTok từ chối tạo nhóm"}). Tự động tiếp tục xử lý các nhóm KOC còn lại...`, true);
        }

        if (manifest.dryRunOnly) {
          exitReason = "Hoàn tất kiểm trùng (Chế độ kiểm tra nhanh)";
          emitLog(`[KOCVIP] Thoát vòng lặp executeRun: ${exitReason}`);
          break;
        }

        if (controller.cancelled) {
          exitReason = "Người dùng bấm HỦY đợt mời";
          emitLog(`[KOCVIP] Thoát vòng lặp executeRun: ${exitReason}`);
          break;
        }

        const dbPending = chunks.filter(c => !TERMINAL_CHUNK_STATUSES.has(c.status));
        pending = dbPending.filter(c => c.chunkId !== chunk.chunkId || res.state === "creator_isolation_tail_deferred");
        // Sắp xếp các chunk đang ở chế độ cô lập đuôi (16024016) xuống cuối cùng để luồng chính chạy mượt mà
        pending.sort((a, b) => {
          const aIsTail = Boolean(a.tailIsolationMode || a.phase === "waiting_creator_isolation_tail");
          const bIsTail = Boolean(b.tailIsolationMode || b.phase === "waiting_creator_isolation_tail");
          if (aIsTail === bIsTail) return 0;
          return aIsTail ? 1 : -1;
        });

        // ✅ Độ trễ an toàn giữa các chiến dịch (camp/chunk) mời KOC để chống bị TikTok quét
        if (pending.length && !controller.cancelled && !manifest.dryRunOnly) {
          const safeDelay = Math.max(3000, Number(manifest.safeDelayMs || 7500));
          const jitter = Math.floor(Math.random() * (safeDelay * 0.4));
          const totalDelayMs = safeDelay + jitter;
          emitLog(`[KOCVIP] ⏳ Nghỉ ngơi ${(totalDelayMs / 1000).toFixed(1)}s trước khi tạo chiến dịch tiếp theo để tránh bị quét TikTok...`);
          await cancellableSleep(totalDelayMs, manifest.serverRunId);
        }
      }

      watchdogTimer();

      if (!controller.cancelled && lastChunkResult?.state !== "waiting_daily_reset" && !pending.length) {
        emitLog(`[KOCVIP] Thoát vòng lặp executeRun: ${exitReason}`);
      }

      // Gửi Cooperation Chat nếu có cấu hình
      if (!controller.cancelled && manifest.draft?.shareAfterInvite) {
        emitLog("[KOCVIP] Bắt đầu gửi tin nhắn trao đổi (Cooperation Chat)...");
        await sendPostInviteChatMessages(manifest, chunks);
      }

      const finalStatus = controller.cancelled ? "cancelled" : (pending.length ? "paused" : "completed");
      await localDb("updateRun", { serverRunId: manifest.serverRunId, patch: { status: finalStatus } });

      if (currentActiveRun) {
        currentActiveRun.completed = true;
        currentActiveRun.finishedAt = Date.now();
        currentActiveRun.status = finalStatus;
        renderMiniBar();
        try {
          localStorage.setItem("kocvip_last_run_id", manifest.serverRunId);
          safeStorageSet({ kocvip_last_run_id: manifest.serverRunId });
        } catch {}
      }

      try {
        const completionPayload = {
          serverRunId: manifest.serverRunId,
          status: finalStatus,
          completed: true,
          sent: currentActiveRun?.sent || 0,
          skipped: currentActiveRun?.skipped || 0,
          failed: currentActiveRun?.failed || 0,
          waiting: currentActiveRun?.waiting || 0,
          total: currentActiveRun?.totalRecipients || 0,
        };
        chrome.runtime.sendMessage({
          type: "KOCVIP_PROGRESS_UPDATE",
          payload: completionPayload,
        });
        chrome.runtime.sendMessage({
          type: "KOCVIP_NOTIFY_COMPLETED",
          payload: completionPayload,
        });
      } catch {}
    } catch (err) {
      emitLog(`[KOCVIP Run LỖI] Ngoại lệ executeRun: ${err.message}`, true);
      await localDb("updateRun", { serverRunId: manifest.serverRunId, patch: { status: "failed", error: String(err?.message || err) } });
      if (currentActiveRun) {
        currentActiveRun.completed = true;
        currentActiveRun.finishedAt = Date.now();
        currentActiveRun.status = "failed";
        renderMiniBar();
        try {
          localStorage.setItem("kocvip_last_run_id", manifest.serverRunId);
          safeStorageSet({ kocvip_last_run_id: manifest.serverRunId });
        } catch {}
      }
    } finally {
      activeRuns.delete(manifest.serverRunId);
    }
  }

  // Lắng nghe lệnh điều khiển từ background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const { type, payload = {} } = message || {};

    if (type === "KOCVIP_LOCAL_INVITE_START") {
      const manifest = payload.manifest;
      if (!manifest?.serverRunId) {
        sendResponse({ success: false, error: "Thiếu manifest đợt mời" });
        return false;
      }
      executeRun(manifest);
      sendResponse({ success: true, data: { accepted: true, serverRunId: manifest.serverRunId } });
      return false;
    }

    if (type === "KOCVIP_LOCAL_INVITE_PAUSE") {
      const controller = activeRuns.get(payload.serverRunId);
      if (controller) controller.paused = true;
      localDb("updateRun", { serverRunId: payload.serverRunId, patch: { paused: true, status: "paused" } });
      sendResponse({ success: true });
      return false;
    }

    if (type === "KOCVIP_LOCAL_INVITE_RESUME") {
      const controller = activeRuns.get(payload.serverRunId);
      if (controller) {
        controller.paused = false;
        kickedRuns.add(payload.serverRunId);
      } else {
        localDb("getRun", { serverRunId: payload.serverRunId }).then(run => {
          if (run) executeRun(run);
        });
      }
      localDb("updateRun", { serverRunId: payload.serverRunId, patch: { paused: false, status: "running" } });
      sendResponse({ success: true });
      return false;
    }

    if (type === "KOCVIP_LOCAL_INVITE_STOP") {
      const runId = payload.serverRunId || currentActiveRun?.serverRunId;
      if (runId) {
        const controller = activeRuns.get(runId);
        if (controller) { controller.cancelled = true; controller.paused = false; }
        localDb("cancelRun", { serverRunId: runId });
      }
      activeRuns.forEach(c => { c.cancelled = true; c.paused = false; });
      if (currentActiveRun) {
        currentActiveRun.status = "cancelled";
        currentActiveRun.completed = true;
        currentActiveRun.finishedAt = Date.now();
        renderMiniBar();
      }
      emitProgress({
        serverRunId: runId,
        status: "cancelled",
        message: "Đã hủy bỏ đợt mời theo yêu cầu."
      });
      try {
        localStorage.removeItem("kocvip_last_run_id");
        safeStorageRemove(["kocvip_active_run_id", "kocvip_last_run_id", "kocvip_run_start_time"]);
      } catch {}
      sendResponse({ success: true, data: { stopped: true } });
      return false;
    }

    if (type === "KOCVIP_EXECUTE_TIKTOK_PRODUCT_LIST") {
      (async () => {
        const page = Number(payload.page || payload.page_number || payload.cur_page || 1);
        const pageSize = Number(payload.pageSize || payload.page_size || 50);
        const keyword = String(payload.keyword || "").trim();

        // 1. Thử gọi API chuẩn Quản lý sản phẩm Shop (Seller Center) để lấy đúng Tab "Trên kệ" (131 sản phẩm)
        try {
          const sellerRes = await executeInPage({
            method: "GET",
            path: "/api/v1/product/local/products/list",
            query: {
              tab_id: "2", // BẮT BUỘC: Tab "Trên kệ"
              page_number: String(page),
              page_size: String(pageSize),
              product_sort_fields: "15", // Hiệu suất bán chạy nhất
              product_sort_types: "0",   // Giảm dần
              sku_number: "1",
              is_need_target_stock: "true",
              same_product_page_size: "3",
              is_need_clearance_tag: "true",
              ...(keyword ? { keyword, product_name: keyword } : {}),
            },
          });

          if (sellerRes?.ok && Number(sellerRes?.body?.code ?? -1) === 0 && (sellerRes?.body?.data?.products || sellerRes?.body?.data?.total_product_count !== undefined)) {
            console.log("[KOC VIP] Lấy sản phẩm thành công từ API Seller Shop (Trên kệ):", sellerRes.body.data);
            sendResponse({ success: true, result: sellerRes?.body || sellerRes });
            return;
          }
        } catch (eSeller) {
          console.warn("[KOC VIP] Gọi API Seller chưa được, chuyển sang fallback Affiliate:", eSeller);
        }

        // 2. Fallback sang cổng Affiliate nếu trang không phải Seller Shop
        const searchParams = keyword ? [{ key: 1, search_type: 1, value: keyword }] : [];
        const body = {
          cur_page: page,
          page_number: page,
          page_size: pageSize,
          search_params: searchParams,
          source: 2,
        };
        console.log("[KOC VIP] Quét sản phẩm trang:", page, "kích thước:", pageSize, body);
        const res = await executeInPage({
          method: "POST",
          path: "/api/v1/affiliate/product_selection/list",
          body,
        });
        console.log("[KOC VIP] Kết quả TikTok trả về cho sản phẩm:", res);
        if (!res?.ok || (res.body?.code !== undefined && Number(res.body.code) !== 0)) {
          const errMsg = res?.body?.message || res?.error || `HTTP ${res?.httpStatus || 400}`;
          const errCode = res?.body?.code ?? res?.httpStatus ?? -1;
          throw new Error(`TikTok lỗi (Code ${errCode}): ${errMsg}`);
        }
        sendResponse({ success: true, result: res?.body || res });
      })().catch(err => {
        console.error("[KOC VIP] Lỗi nạp sản phẩm:", err);
        sendResponse({ success: false, error: String(err?.message || err) });
      });
      return true;
    }

    if (type === "KOCVIP_IMPORT_CHECK_HANDLES") {
      (async () => {
        const handleNames = Array.isArray(payload.handleNames) ? payload.handleNames : [];
        const res = await executeInPage({
          method: "POST",
          path: "/api/v1/oec/affiliate/crm/creator/import_check",
          body: { handle_names: handleNames },
        });
        if (!res?.ok || (res.body?.code !== undefined && Number(res.body.code) !== 0)) {
          const errMsg = res?.body?.message || res?.error || `HTTP ${res?.httpStatus || 400}`;
          const errCode = res?.body?.code ?? res?.httpStatus ?? -1;
          throw new Error(`TikTok lỗi tra cứu ID (Code ${errCode}): ${errMsg}`);
        }
        sendResponse({ success: true, result: res?.body || res });
      })().catch(err => sendResponse({ success: false, error: String(err?.message || err) }));
      return true;
    }

    if (type === "KOCVIP_PING") {
      sendResponse({ pong: true, version: CLIENT_VERSION });
      return false;
    }

    if (type === "KOCVIP_TOGGLE_MODAL") {
      toggleModal();
      sendResponse({ success: true, opened: overlayHost?.style.display === "flex" });
      return true;
    }

    if (type === "KOCVIP_FOCUS_CAPTCHA") {
      hideModal();
      sendResponse({ success: true });
      return true;
    }
  });

  // =========================================================================
  // GIAO DIỆN MODAL RỘNG TRỰC TIẾP TRÊN TRANG TIKTOK (THAY THẾ SIDE PANEL HẸP)
  // =========================================================================
  let overlayHost = null;
  let overlayIframe = null;

  function initInPageOverlay() {
    if (!isExtensionValid()) return;

    // 1. Tạo Overlay Host & Iframe modal (nếu chưa có)
    if (!overlayHost || !document.getElementById("kocvip-inpage-overlay-host")) {
      const existingHost = document.getElementById("kocvip-inpage-overlay-host");
      if (existingHost) existingHost.remove();

      overlayHost = document.createElement("div");
      overlayHost.id = "kocvip-inpage-overlay-host";
      overlayHost.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(4px);
        display: none;
        align-items: center;
        justify-content: center;
      `;

      overlayIframe = document.createElement("iframe");
      overlayIframe.src = safeGetURL("ui/index.html");
      overlayIframe.allow = "clipboard-read; clipboard-write";
      const isSavedMax = localStorage.getItem("kocvip_is_maximized") === "true";
      if (isSavedMax) {
        overlayIframe.dataset.maximized = "true";
        overlayIframe.style.cssText = `
          width: 100vw;
          height: 100vh;
          max-width: 100vw;
          max-height: 100vh;
          border: 0;
          border-radius: 0;
          box-shadow: none;
          background: #FFFFFF;
          overflow: hidden;
        `;
      } else {
        overlayIframe.style.cssText = `
          width: min(1560px, 98vw);
          height: min(96vh, 950px);
          border: 0;
          border-radius: 14px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45);
          background: #FFFFFF;
          overflow: hidden;
        `;
      }

      overlayHost.appendChild(overlayIframe);
      (document.body || document.documentElement).appendChild(overlayHost);

      // Bấm ra vùng backdrop xám thì đóng
      overlayHost.addEventListener("click", (e) => {
        if (e.target === overlayHost) {
          hideModal();
        }
      });
    }

    // 2. Tạo Floating Action Button (FAB) hình tròn với viền hồng hào quang (Minibar)
    if (!document.getElementById("kocvip-inpage-fab")) {
      const fab = document.createElement("div");
      fab.id = "kocvip-inpage-fab";
      fab.title = "Mở Mời hàng loạt KOC VIP";

      const rocketImgUrl = safeGetURL("icons/icon128.png");
      fab.innerHTML = `
        <div class="kocvip-fab-inner">
          <img src="${rocketImgUrl}" alt="KOC VIP" draggable="false" />
        </div>
      `;

      const savedTop = localStorage.getItem("kocvip_fab_top") || "40%";

      fab.style.cssText = `
        position: fixed !important;
        right: 4px !important;
        top: ${savedTop} !important;
        width: 58px !important;
        height: 58px !important;
        border-radius: 50% !important;
        padding: 0 !important;
        margin: 0 !important;
        background: radial-gradient(circle, #ff69b4 0%, #f43f5e 60%, #e11d48 100%) !important;
        box-shadow: 0 0 18px 5px rgba(244, 63, 94, 0.55), 0 0 32px 10px rgba(236, 72, 153, 0.35), 0 4px 14px rgba(0, 0, 0, 0.25) !important;
        cursor: pointer !important;
        z-index: 2147483646 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        user-select: none !important;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease !important;
        box-sizing: border-box !important;
      `;

      const inner = fab.querySelector(".kocvip-fab-inner");
      if (inner) {
        inner.style.cssText = `
          width: 48px !important;
          height: 48px !important;
          border-radius: 50% !important;
          overflow: hidden !important;
          background: #ffffff !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 2px solid #ffffff !important;
          box-shadow: inset 0 0 4px rgba(0,0,0,0.15) !important;
          pointer-events: none !important;
        `;
        const img = inner.querySelector("img");
        if (img) {
          img.style.cssText = `
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
            pointer-events: none !important;
          `;
        }
      }

      // Hiệu ứng hover
      fab.onmouseenter = () => {
        fab.style.transform = "scale(1.12) translateX(-2px)";
        fab.style.boxShadow = "0 0 24px 8px rgba(244, 63, 94, 0.75), 0 0 40px 14px rgba(236, 72, 153, 0.5), 0 6px 18px rgba(0, 0, 0, 0.3)";
      };
      fab.onmouseleave = () => {
        fab.style.transform = "scale(1) translateX(0)";
        fab.style.boxShadow = "0 0 18px 5px rgba(244, 63, 94, 0.55), 0 0 32px 10px rgba(236, 72, 153, 0.35), 0 4px 14px rgba(0, 0, 0, 0.25)";
      };

      // Kéo thả & Click mở Modal (Chuẩn xác, chống nuốt click trên Trackpad/Mouse)
      let isMouseDown = false;
      let startX = 0;
      let startY = 0;
      let initialTop = 0;
      let hasDragged = false;
      let dragStartTime = 0;

      fab.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        isMouseDown = true;
        hasDragged = false;
        dragStartTime = Date.now();
        startX = e.clientX;
        startY = e.clientY;
        const rect = fab.getBoundingClientRect();
        initialTop = rect.top;
        fab.style.transition = "none";
      });

      window.addEventListener("mousemove", (e) => {
        if (!isMouseDown) return;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        // Chỉ kích hoạt kéo khi chuột dịch chuyển hơn 12px và giữ trên 120ms
        if (Math.hypot(deltaX, deltaY) > 12 && (Date.now() - dragStartTime > 120)) {
          hasDragged = true;
          fab.style.cursor = "grabbing";
          const newTop = Math.max(10, Math.min(window.innerHeight - 70, initialTop + deltaY));
          fab.style.top = `${newTop}px`;
        }
      });

      window.addEventListener("mouseup", () => {
        if (!isMouseDown) return;
        isMouseDown = false;
        fab.style.cursor = "pointer";
        fab.style.transition = "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease";
        if (hasDragged) {
          try {
            localStorage.setItem("kocvip_fab_top", fab.style.top);
          } catch {}
        }
      });

      // Bắt sự kiện click trực tiếp (Native Click)
      fab.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (hasDragged) {
          hasDragged = false;
          return;
        }
        toggleModal();
      });

      (document.body || document.documentElement).appendChild(fab);
    }
  }

  // Phóng to toàn màn hình TikTok hoặc thu nhỏ về kích thước chuẩn
  function toggleMaximize(forceState) {
    if (!overlayIframe || !overlayHost) return;
    const shouldMax = forceState !== undefined ? !!forceState : !overlayIframe.dataset.maximized;
    if (shouldMax) {
      overlayIframe.dataset.maximized = "true";
      overlayIframe.style.width = "100vw";
      overlayIframe.style.height = "100vh";
      overlayIframe.style.maxWidth = "100vw";
      overlayIframe.style.maxHeight = "100vh";
      overlayIframe.style.borderRadius = "0";
      overlayHost.style.padding = "0";
      try { localStorage.setItem("kocvip_is_maximized", "true"); } catch {}
    } else {
      delete overlayIframe.dataset.maximized;
      overlayIframe.style.width = "min(1560px, 98vw)";
      overlayIframe.style.height = "min(96vh, 950px)";
      overlayIframe.style.maxWidth = "";
      overlayIframe.style.maxHeight = "";
      overlayIframe.style.borderRadius = "14px";
      overlayHost.style.padding = "";
      try { localStorage.setItem("kocvip_is_maximized", "false"); } catch {}
    }
  }

  // Lắng nghe đóng / thu nhỏ / phóng to / hủy từ bên trong iframe
  window.addEventListener("message", (e) => {
    if (e.data?.type === "KOCVIP_CLOSE_OVERLAY" || e.data?.type === "KOCVIP_MINIMIZE_OVERLAY") {
      hideModal();
    } else if (e.data?.type === "KOCVIP_TOGGLE_MAXIMIZE") {
      toggleMaximize(e.data.isMaximized);
    } else if (e.data?.type === "KOCVIP_INVITE_CONTROL" && e.data.payload?.action === "stop") {
      const runId = e.data.payload.serverRunId || currentActiveRun?.serverRunId;
      if (runId) {
        const controller = activeRuns.get(runId);
        if (controller) { controller.cancelled = true; controller.paused = false; }
        localDb("cancelRun", { serverRunId: runId });
      }
      activeRuns.forEach(c => { c.cancelled = true; c.paused = false; });
      if (currentActiveRun) {
        currentActiveRun.status = "cancelled";
        currentActiveRun.completed = true;
        currentActiveRun.finishedAt = Date.now();
        renderMiniBar();
      }
      emitProgress({
        serverRunId: runId,
        status: "cancelled",
        message: "Đã hủy bỏ đợt mời theo yêu cầu."
      });
      try {
        localStorage.removeItem("kocvip_last_run_id");
        safeStorageRemove(["kocvip_active_run_id", "kocvip_last_run_id", "kocvip_run_start_time"]);
      } catch {}
    }
  });

  // Phím tắt Esc trên trang để thu nhỏ modal
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlayHost && overlayHost.style.display === "flex") {
      hideModal();
    }
  });

  // =========================================================================
  // MINI BAR QUẢN LÝ TIẾN TRÌNH CHẠY NGẦM (100% LOCAL TRÊN TIKTOK)
  // =========================================================================
  let currentActiveRun = null;
  let miniBarEl = null;
  let miniBarTimer = null;

  function formatNumberVN(num) {
    return Number(num || 0).toLocaleString("vi-VN");
  }

  function formatStopwatch(ms) {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const p = n => String(n).padStart(2, "0");
    if (hrs > 0) return `${p(hrs)}:${p(mins)}:${p(secs)}`;
    return `${p(mins)}:${p(secs)}`;
  }

  function ensureMiniBar() {
    if (!isExtensionValid()) return null;
    let mb = document.getElementById("kocvip-inpage-minibar");
    if (mb) return mb;

    let savedTop = "64px";
    let savedRight = "260px";
    try {
      const st = localStorage.getItem("kocvip_minibar_top");
      const sr = localStorage.getItem("kocvip_minibar_right");
      if (st) savedTop = st;
      if (sr) savedRight = sr;
    } catch {}

    mb = document.createElement("div");
    mb.id = "kocvip-inpage-minibar";
    mb.style.cssText = `
      position: fixed !important;
      top: ${savedTop} !important;
      right: ${savedRight} !important;
      bottom: auto !important;
      left: auto !important;
      z-index: 2147483647 !important;
      background: #ffffff !important;
      border: 1.5px solid #cbd5e1 !important;
      border-radius: 12px !important;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.03) !important;
      color: #0f172a !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      padding: 10px 14px !important;
      width: 320px !important;
      box-sizing: border-box !important;
      display: none;
      flex-direction: column !important;
      gap: 7px !important;
      user-select: none !important;
      cursor: grab !important;
      transition: box-shadow 0.2s ease, border-color 0.2s ease !important;
    `;

    mb.innerHTML = `
      <style>
        @keyframes kocvipPulseGlow {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 2px rgba(225,29,72,0.4)); }
          50% { transform: scale(1.12); filter: drop-shadow(0 0 6px rgba(225,29,72,0.8)); }
        }
        .kocvip-mb-pulse-icon {
          display: inline-block;
          animation: kocvipPulseGlow 1.8s infinite ease-in-out;
        }
        .kocvip-mb-btn {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          color: #334155;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .kocvip-mb-btn:hover {
          background: #e2e8f0;
          border-color: #94a3b8;
          color: #0f172a;
        }
        .kocvip-mb-btn.danger {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
        }
        .kocvip-mb-btn.danger:hover {
          background: #fee2e2;
          border-color: #f87171;
          color: #b91c1c;
        }
        .kocvip-mb-btn.primary {
          background: #fff1f2;
          border: 1px solid #fecdd3;
          color: #e11d48;
        }
        .kocvip-mb-btn.primary:hover {
          background: #ffe4e6;
          border-color: #fda4af;
          color: #be123c;
        }
      </style>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 7px; font-weight: 700; font-size: 13px;">
          <span id="kocvip-mb-icon" class="kocvip-mb-pulse-icon">🚀</span>
          <span id="kocvip-mb-title" style="color: #0f172a;">Đang mời KOC...</span>
        </div>
        <span id="kocvip-mb-timer" style="font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 2px 7px; border-radius: 5px; border: 1px solid #cbd5e1;">⏱️ 00:00</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748b;">
        <span id="kocvip-mb-count" style="font-weight: 500;">0/0 KOC (Nhóm 0/0)</span>
        <span id="kocvip-mb-pct" style="font-weight: 700; color: #e11d48;">0%</span>
      </div>

      <div style="width: 100%; height: 5px; background: #e2e8f0; border-radius: 999px; overflow: hidden;">
        <div id="kocvip-mb-bar-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #ec4899, #f43f5e); transition: width 0.3s ease;"></div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1px;">
        <span id="kocvip-mb-stats" style="font-size: 11px; color: #64748b; font-weight: 500;">✅ 0  •  ⚠️ 0  •  ❌ 0</span>
        <div id="kocvip-mb-actions" style="display: flex; gap: 5px;">
          <button type="button" class="kocvip-mb-btn" id="kocvip-mb-btn-pause" title="Tạm dừng đợt mời">⏸️</button>
          <button type="button" class="kocvip-mb-btn danger" id="kocvip-mb-btn-stop" title="Hủy đợt mời">⏹️</button>
          <button type="button" class="kocvip-mb-btn primary" id="kocvip-mb-btn-expand" title="Mở to bảng điều khiển">↗ Mở to</button>
          <button type="button" class="kocvip-mb-btn" id="kocvip-mb-btn-close" title="Đóng thanh mini" style="display: none;">✕</button>
        </div>
      </div>
    `;

    // Hỗ trợ kéo thả (drag & drop) thanh mini bar và lưu vị trí
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialTop = 0, initialRight = 0;
    let hasMoved = false;

    mb.addEventListener("mousedown", (e) => {
      if (e.target.closest("button") || e.target.closest(".kocvip-mb-btn")) return;
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = mb.getBoundingClientRect();
      initialTop = rect.top;
      initialRight = window.innerWidth - rect.right;
      mb.style.cursor = "grabbing";

      const onMouseMove = (ev) => {
        if (!isDragging) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasMoved = true;
        }
        let newTop = initialTop + dy;
        let newRight = initialRight - dx;

        newTop = Math.max(10, Math.min(window.innerHeight - 80, newTop));
        newRight = Math.max(10, Math.min(window.innerWidth - 340, newRight));

        mb.style.top = `${newTop}px`;
        mb.style.right = `${newRight}px`;
        mb.style.bottom = "auto";
        mb.style.left = "auto";
      };

      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        mb.style.cursor = "grab";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (hasMoved) {
          try {
            localStorage.setItem("kocvip_minibar_top", mb.style.top);
            localStorage.setItem("kocvip_minibar_right", mb.style.right);
          } catch {}
        }
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    mb.addEventListener("mouseenter", () => {
      mb.style.boxShadow = "0 14px 28px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)";
    });
    mb.addEventListener("mouseleave", () => {
      mb.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.03)";
    });

    mb.addEventListener("click", (e) => {
      if (hasMoved) {
        hasMoved = false;
        return;
      }
      if (e.target.closest("button") || e.target.closest(".kocvip-mb-btn")) return;
      showModal(currentActiveRun?.serverRunId);
    });

    mb.querySelector("#kocvip-mb-btn-expand")?.addEventListener("click", (e) => {
      e.stopPropagation();
      showModal(currentActiveRun?.serverRunId);
    });

    mb.querySelector("#kocvip-mb-btn-pause")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!currentActiveRun) return;
      const controller = activeRuns.get(currentActiveRun.serverRunId);
      const isPaused = controller?.paused || currentActiveRun.status === "paused";
      if (isPaused) {
        if (controller) {
          controller.paused = false;
          kickedRuns.add(currentActiveRun.serverRunId);
        }
        currentActiveRun.status = "running";
        localDb("updateRun", { serverRunId: currentActiveRun.serverRunId, patch: { paused: false, status: "running" } });
        try {
          chrome.runtime.sendMessage({
            type: "KOCVIP_INVITE_CONTROL",
            payload: { action: "resume", serverRunId: currentActiveRun.serverRunId }
          });
        } catch {}
      } else {
        if (controller) controller.paused = true;
        currentActiveRun.status = "paused";
        localDb("updateRun", { serverRunId: currentActiveRun.serverRunId, patch: { paused: true, status: "paused" } });
        try {
          chrome.runtime.sendMessage({
            type: "KOCVIP_INVITE_CONTROL",
            payload: { action: "pause", serverRunId: currentActiveRun.serverRunId }
          });
        } catch {}
      }
      renderMiniBar();
    });

    mb.querySelector("#kocvip-mb-btn-stop")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!currentActiveRun) return;
      const ok = confirm("Bạn có chắc chắn muốn HỦY đợt mời KOC này?");
      if (!ok) return;
      const controller = activeRuns.get(currentActiveRun.serverRunId);
      if (controller) {
        controller.cancelled = true;
        controller.paused = false;
      }
      currentActiveRun.status = "cancelled";
      localDb("cancelRun", { serverRunId: currentActiveRun.serverRunId });
      try {
        chrome.runtime.sendMessage({
          type: "KOCVIP_INVITE_CONTROL",
          payload: { action: "stop", serverRunId: currentActiveRun.serverRunId }
        });
      } catch {}
      renderMiniBar();
    });

    mb.querySelector("#kocvip-mb-btn-close")?.addEventListener("click", (e) => {
      e.stopPropagation();
      hideMiniBar(true);
    });

    (document.body || document.documentElement).appendChild(mb);
    miniBarEl = mb;
    return mb;
  }

  function renderMiniBar() {
    if (!currentActiveRun) {
      if (miniBarEl) miniBarEl.style.display = "none";
      return;
    }

    const mb = ensureMiniBar();
    if (!mb) return;

    const isModalOpen = overlayHost && overlayHost.style.display === "flex";
    if (isModalOpen) {
      mb.style.display = "none";
      return;
    }
    mb.style.display = "flex";

    const elTitle = mb.querySelector("#kocvip-mb-title");
    const elIcon = mb.querySelector("#kocvip-mb-icon");
    const elTimer = mb.querySelector("#kocvip-mb-timer");
    const elCount = mb.querySelector("#kocvip-mb-count");
    const elPct = mb.querySelector("#kocvip-mb-pct");
    const elFill = mb.querySelector("#kocvip-mb-bar-fill");
    const elStats = mb.querySelector("#kocvip-mb-stats");
    const btnPause = mb.querySelector("#kocvip-mb-btn-pause");
    const btnStop = mb.querySelector("#kocvip-mb-btn-stop");
    const btnClose = mb.querySelector("#kocvip-mb-btn-close");

    const total = currentActiveRun.totalRecipients || 0;
    const sent = currentActiveRun.sent || 0;
    const skipped = currentActiveRun.skipped || 0;
    const failed = currentActiveRun.failed || 0;
    const processed = sent + skipped + failed;
    const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
    const isCompleted = currentActiveRun.completed || currentActiveRun.status === "completed" || currentActiveRun.status === "cancelled";
    const isPaused = currentActiveRun.status === "paused";

    if (elTimer && currentActiveRun.startedAt) {
      const elapsed = isCompleted && currentActiveRun.finishedAt 
        ? currentActiveRun.finishedAt - currentActiveRun.startedAt 
        : Date.now() - currentActiveRun.startedAt;
      if (isCompleted) {
        elTimer.textContent = `⏱️ ${formatStopwatch(elapsed)}`;
      } else {
        const remainingKocs = Math.max(0, total - processed);
        const remainingChunks = Math.ceil(remainingKocs / 50);
        const etaSec = Math.max(0, remainingChunks * 8);
        const etaMin = Math.floor(etaSec / 60);
        const etaS = etaSec % 60;
        const etaFormatted = `~${String(etaMin).padStart(2, "0")}:${String(etaS).padStart(2, "0")}`;
        elTimer.textContent = `⏱️ ${formatStopwatch(elapsed)} • ⏳ ${etaFormatted}`;
      }
    }

    if (isCompleted) {
      if (elIcon) {
        elIcon.textContent = currentActiveRun.status === "cancelled" ? "⏹️" : "🎉";
        elIcon.className = "";
      }
      if (elTitle) {
        elTitle.textContent = currentActiveRun.status === "cancelled" ? "Đã hủy đợt mời" : "Đã xong đợt mời!";
        elTitle.style.color = currentActiveRun.status === "cancelled" ? "#dc2626" : "#16a34a";
      }
      if (mb) {
        mb.style.borderColor = currentActiveRun.status === "cancelled" ? "#fca5a5" : "#86efac";
      }
      if (elFill) {
        elFill.style.background = currentActiveRun.status === "cancelled" ? "#ef4444" : "#22c55e";
        elFill.style.width = "100%";
      }
      if (elPct) {
        elPct.style.color = currentActiveRun.status === "cancelled" ? "#dc2626" : "#16a34a";
      }
      if (elTimer) {
        elTimer.style.color = currentActiveRun.status === "cancelled" ? "#dc2626" : "#16a34a";
        elTimer.style.background = currentActiveRun.status === "cancelled" ? "#fef2f2" : "#f0fdf4";
        elTimer.style.borderColor = currentActiveRun.status === "cancelled" ? "#fecaca" : "#bbf7d0";
      }
      if (btnPause) btnPause.style.display = "none";
      if (btnStop) btnStop.style.display = "none";
      if (btnClose) btnClose.style.display = "inline-flex";
    } else if (currentActiveRun.status === "waiting_captcha") {
      if (elIcon) {
        elIcon.textContent = "⚠️";
        elIcon.className = "kocvip-mb-pulse-icon";
      }
      if (elTitle) {
        elTitle.textContent = "Chờ giải Captcha...";
        elTitle.style.color = "#d97706";
      }
      if (mb) {
        mb.style.borderColor = "#f59e0b";
      }
      if (elPct) {
        elPct.style.color = "#d97706";
      }
      if (elTimer) {
        elTimer.style.color = "#b45309";
        elTimer.style.background = "#fffbeb";
        elTimer.style.borderColor = "#fde68a";
      }
      if (btnPause) btnPause.style.display = "none";
      if (btnStop) btnStop.style.display = "inline-flex";
      if (btnClose) btnClose.style.display = "none";
    } else if (isPaused) {
      if (elIcon) {
        elIcon.textContent = "⏸️";
        elIcon.className = "";
      }
      if (elTitle) {
        elTitle.textContent = "Đang tạm dừng";
        elTitle.style.color = "#d97706";
      }
      if (mb) {
        mb.style.borderColor = "#fcd34d";
      }
      if (elPct) {
        elPct.style.color = "#d97706";
      }
      if (elTimer) {
        elTimer.style.color = "#b45309";
        elTimer.style.background = "#fffbeb";
        elTimer.style.borderColor = "#fde68a";
      }
      if (btnPause) {
        btnPause.textContent = "▶️";
        btnPause.title = "Tiếp tục đợt mời";
        btnPause.style.display = "inline-flex";
      }
      if (btnStop) btnStop.style.display = "inline-flex";
      if (btnClose) btnClose.style.display = "none";
    } else {
      if (elIcon) {
        elIcon.textContent = "🚀";
        elIcon.className = "kocvip-mb-pulse-icon";
      }
      if (elTitle) {
        elTitle.textContent = "Đang mời KOC...";
        elTitle.style.color = "#0f172a";
      }
      if (mb) {
        mb.style.borderColor = "#cbd5e1";
      }
      if (elPct) {
        elPct.style.color = "#e11d48";
      }
      if (elTimer) {
        elTimer.style.color = "#475569";
        elTimer.style.background = "#f1f5f9";
        elTimer.style.borderColor = "#cbd5e1";
      }
      if (elFill) {
        elFill.style.background = "linear-gradient(90deg, #ec4899, #f43f5e)";
        elFill.style.width = `${pct}%`;
      }
      if (btnPause) {
        btnPause.textContent = "⏸️";
        btnPause.title = "Tạm dừng đợt mời";
        btnPause.style.display = "inline-flex";
      }
      if (btnStop) btnStop.style.display = "inline-flex";
      if (btnClose) btnClose.style.display = "none";
    }

    if (elCount) {
      const curChunk = currentActiveRun.currentChunkIndex || 1;
      const totChunk = currentActiveRun.totalChunks || 1;
      elCount.textContent = `${formatNumberVN(processed)}/${formatNumberVN(total)} KOC (Nhóm ${curChunk}/${totChunk})`;
    }
    if (elPct) {
      elPct.textContent = `${pct}%`;
    }
    if (elStats) {
      elStats.innerHTML = `✅ ${formatNumberVN(sent)}  •  ⚠️ ${formatNumberVN(skipped)}  •  ❌ ${formatNumberVN(failed)}`;
    }
  }

  function startMiniBarTimer() {
    if (miniBarTimer) clearInterval(miniBarTimer);
    miniBarTimer = setInterval(() => {
      if (!currentActiveRun) {
        clearInterval(miniBarTimer);
        return;
      }
      const isCompleted = currentActiveRun.completed || currentActiveRun.status === "completed" || currentActiveRun.status === "cancelled";
      if (!isCompleted && currentActiveRun.status !== "paused") {
        const elTimer = document.getElementById("kocvip-mb-timer");
        if (elTimer && currentActiveRun.startedAt) {
          elTimer.textContent = `⏱️ ${formatStopwatch(Date.now() - currentActiveRun.startedAt)}`;
        }
      }
    }, 1000);
  }

  function showMiniBar() {
    if (currentActiveRun) {
      renderMiniBar();
      startMiniBarTimer();
    }
  }

  function hideMiniBar(dismiss = false) {
    if (dismiss) currentActiveRun = null;
    if (miniBarEl) miniBarEl.style.display = "none";
    if (miniBarTimer && dismiss) {
      clearInterval(miniBarTimer);
      miniBarTimer = null;
    }
  }

  function showModal(targetRunId) {
    if (!isExtensionValid()) {
      alert("Tiện ích Mời KOC VIP vừa được cập nhật.\n\nVui lòng tải lại trang TikTok (ấn F5 hoặc Cmd+R) để mở bảng điều khiển!");
      location.reload();
      return;
    }
    initInPageOverlay();
    if (overlayHost) {
      // Chỉ mở tiến trình nếu đợt mời ĐANG CHẠY THỰC SỰ (chưa hoàn tất, chưa hủy, chưa thất bại)
      const isCurrentlyRunning = currentActiveRun && !currentActiveRun.completed &&
        currentActiveRun.status !== "completed" && currentActiveRun.status !== "cancelled" && currentActiveRun.status !== "failed";
      const runId = targetRunId || (isCurrentlyRunning ? currentActiveRun.serverRunId : null);
      const targetUrl = safeGetURL(runId ? `ui/index.html?runId=${encodeURIComponent(runId)}` : "ui/index.html");

      const sendOpenRunMsg = () => {
        if (!runId || !overlayIframe?.contentWindow) return;
        try {
          const snap = currentActiveRun ? { ...currentActiveRun } : null;
          overlayIframe.contentWindow.postMessage({
            type: "KOCVIP_OPEN_RUN",
            serverRunId: runId,
            snapshot: snap,
            // Gửi kèm log đã cache để UI replay lại sau khi mở to (tránh mất log)
            cachedLogs: (snap?.logs || []).slice(-200),
          }, "*");
        } catch {}
      };

      if (overlayIframe) {
        const needsReload = !overlayIframe.src ||
          overlayIframe.src === "about:blank" ||
          (runId && !overlayIframe.src.includes(runId)) ||
          (!runId && overlayIframe.src.includes("runId="));

        if (needsReload) {
          overlayIframe.onload = () => {
            if (runId) {
              sendOpenRunMsg();
              setTimeout(sendOpenRunMsg, 100);
              setTimeout(sendOpenRunMsg, 300);
            }
          };
          overlayIframe.src = targetUrl;
        } else if (runId) {
          sendOpenRunMsg();
          setTimeout(sendOpenRunMsg, 100);
          setTimeout(sendOpenRunMsg, 300);
        }
      }
      if (runId) {
        try {
          safeStorageSet({ kocvip_active_run_id: runId });
        } catch {}
      } else {
        try {
          safeStorageRemove(["kocvip_active_run_id", "kocvip_last_run_id"]);
          localStorage.removeItem("kocvip_last_run_id");
        } catch {}
      }
      const isSavedMax = localStorage.getItem("kocvip_is_maximized") === "true";
      toggleMaximize(isSavedMax);
      overlayHost.style.display = "flex";
      document.body.style.overflow = "hidden";
      hideMiniBar(false);
    }
  }

  function hideModal() {
    if (overlayHost) {
      overlayHost.style.display = "none";
      document.body.style.overflow = "";
    }
    if (currentActiveRun && !currentActiveRun.dismissed) {
      showMiniBar();
    }
  }

  function toggleModal() {
    initInPageOverlay();
    if (overlayHost && overlayHost.style.display === "flex") {
      hideModal();
    } else {
      showModal();
    }
  }

  // Khởi tạo FAB khi trang tải xong và kiểm tra định kỳ để không bị mất khi chuyển route SPA
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initInPageOverlay);
  } else {
    setTimeout(initInPageOverlay, 500);
  }

  const fabPeriodicTimer = setInterval(() => {
    if (!isExtensionValid()) {
      clearInterval(fabPeriodicTimer);
      return;
    }
    if (!document.getElementById("kocvip-inpage-fab")) {
      initInPageOverlay();
    }
  }, 1500);
})();
