/**
 * KOC VIP - Side Panel Application Controller.
 * Giao diện điều khiển chạy hoàn toàn cục bộ, không gửi dữ liệu ra bên ngoài.
 */
document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const tabStatusBadge = document.getElementById("tabStatusBadge");
  const btnOpenTab = document.getElementById("btnOpenTab");
  const noTabBanner = document.getElementById("noTabBanner");
  const btnOpenTikTok = document.getElementById("btnOpenTikTok");

  const btnScanProducts = document.getElementById("btnScanProducts");
  const productScanStatus = document.getElementById("productScanStatus");
  const inputManualProductId = document.getElementById("inputManualProductId");
  const btnAddManualProduct = document.getElementById("btnAddManualProduct");
  const productListContainer = document.getElementById("productListContainer");
  const productList = document.getElementById("productList");
  const chkSelectAllProducts = document.getElementById("chkSelectAllProducts");
  const selectedProductCount = document.getElementById("selectedProductCount");
  const btnPrevProductPage = document.getElementById("btnPrevProductPage");
  const btnNextProductPage = document.getElementById("btnNextProductPage");
  const productPageIndicator = document.getElementById("productPageIndicator");

  const cfgPrefix = document.getElementById("cfgPrefix");
  const cfgDays = document.getElementById("cfgDays");
  const cfgCommission = document.getElementById("cfgCommission");
  const cfgAdsCommission = document.getElementById("cfgAdsCommission");
  const cfgContentPref = document.getElementById("cfgContentPref");
  const cfgSampleEnabled = document.getElementById("cfgSampleEnabled");
  const sampleModeBox = document.getElementById("sampleModeBox");
  const cfgZalo = document.getElementById("cfgZalo");
  const cfgMessage = document.getElementById("cfgMessage");
  const cfgResolveConflict = document.getElementById("cfgResolveConflict");
  const cfgShareChat = document.getElementById("cfgShareChat");
  const cfgTestRun = document.getElementById("cfgTestRun");
  const testRunCountBox = document.getElementById("testRunCountBox");
  const cfgTestRunCount = document.getElementById("cfgTestRunCount");

  const fileKocInput = document.getElementById("fileKocInput");
  const kocInputText = document.getElementById("kocInputText");
  const btnLookupHandles = document.getElementById("btnLookupHandles");
  const lookupStatusText = document.getElementById("lookupStatusText");
  const statTotalKoc = document.getElementById("statTotalKoc");
  const statOecCount = document.getElementById("statOecCount");
  const statChunkCount = document.getElementById("statChunkCount");

  const metricSent = document.getElementById("metricSent");
  const metricSkipped = document.getElementById("metricSkipped");
  const metricFailed = document.getElementById("metricFailed");
  const metricReset = document.getElementById("metricReset");
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");
  const progressPercent = document.getElementById("progressPercent");

  const btnStart = document.getElementById("btnStart");
  const runningControls = document.getElementById("runningControls");
  const btnPause = document.getElementById("btnPause");
  const btnResume = document.getElementById("btnResume");
  const btnStop = document.getElementById("btnStop");
  const logContent = document.getElementById("logContent");

  // State
  let availableProducts = [];
  let selectedProductIds = new Set();
  let currentProductPage = 1;
  let totalProductPages = 1;
  let currentRunId = null;
  let activeTikTokTab = null;

  function appendLog(msg, isError = false, type = "") {
    const time = new Date().toLocaleTimeString("vi-VN");
    const prefix = isError ? "[LỖI] " : "";
    const lineEl = document.createElement("div");
    lineEl.className = `log-line ${isError ? "error" : (type || "")}`;
    lineEl.textContent = `[${time}] ${prefix}${msg}`;

    if (logContent.children.length === 0 && logContent.textContent.includes("Chưa có tác vụ")) {
      logContent.textContent = "";
    }
    logContent.prepend(lineEl);
  }

  // 1. Mở toàn màn hình ở tab mới
  btnOpenTab.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel/sidepanel.html") });
  });

  btnOpenTikTok.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://affiliate.tiktok.com/connection/creator?shop_region=VN" });
  });

  // 2. Dò tìm tab TikTok Affiliate đang mở
  async function checkTikTokTab() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "KOCVIP_GET_TIKTOK_TAB" });
      if (res?.success && res.data) {
        activeTikTokTab = res.data;
        tabStatusBadge.className = "status-badge connected";
        tabStatusBadge.innerHTML = '<span class="dot"></span><span class="text">Đã kết nối TikTok</span>';
        noTabBanner.hidden = true;
      } else {
        activeTikTokTab = null;
        tabStatusBadge.className = "status-badge disconnected";
        tabStatusBadge.innerHTML = '<span class="dot"></span><span class="text">Chưa mở tab TikTok</span>';
        noTabBanner.hidden = false;
      }
    } catch {
      tabStatusBadge.className = "status-badge disconnected";
      tabStatusBadge.innerHTML = '<span class="dot"></span><span class="text">Lỗi kết nối</span>';
      noTabBanner.hidden = false;
    }
  }

  setInterval(checkTikTokTab, 4000);
  checkTikTokTab();

  // 3. Khôi phục cấu hình đã lưu
  chrome.storage.local.get(["kocvip_saved_settings"], (data) => {
    const s = data.kocvip_saved_settings;
    if (s) {
      if (s.prefix) cfgPrefix.value = s.prefix;
      if (s.commission) cfgCommission.value = s.commission;
      if (s.adsCommission) cfgAdsCommission.value = s.adsCommission;
      if (s.zalo) cfgZalo.value = s.zalo;
      if (s.message) cfgMessage.value = s.message;
      if (s.contentPref) cfgContentPref.value = s.contentPref;
    }
  });

  function saveSettings() {
    chrome.storage.local.set({
      kocvip_saved_settings: {
        prefix: cfgPrefix.value,
        commission: cfgCommission.value,
        adsCommission: cfgAdsCommission.value,
        zalo: cfgZalo.value,
        message: cfgMessage.value,
        contentPref: cfgContentPref.value,
      },
    });
  }

  [cfgPrefix, cfgCommission, cfgAdsCommission, cfgZalo, cfgMessage, cfgContentPref].forEach(el => {
    el.addEventListener("change", saveSettings);
  });

  cfgSampleEnabled.addEventListener("change", () => {
    sampleModeBox.hidden = !cfgSampleEnabled.checked;
  });

  cfgTestRun.addEventListener("change", () => {
    testRunCountBox.hidden = !cfgTestRun.checked;
    updateKocStats();
  });

  // 4. Quét danh mục sản phẩm từ Shop (Có phân trang & Bắt lỗi chuẩn)
  async function fetchProducts(page = 1) {
    btnScanProducts.disabled = true;
    productScanStatus.className = "hint-text";
    productScanStatus.textContent = `Đang tải trang sản phẩm ${page}...`;
    appendLog(`Bắt đầu quét danh mục sản phẩm (Trang ${page})...`);

    try {
      const res = await chrome.runtime.sendMessage({
        type: "KOCVIP_REFRESH_PRODUCTS",
        payload: { page, pageSize: 50 },
      });

      if (!res?.success) throw new Error(res?.error || "Không thể tải sản phẩm");
      const data = res.data || {};
      const newProducts = data.products || [];
      const total = Number(data.total || newProducts.length);

      if (newProducts.length === 0) {
        productScanStatus.className = "hint-text warning";
        productScanStatus.textContent = `Shop chưa có sản phẩm nào đang mở bán (Trang ${page}).`;
        appendLog(`Không tìm thấy sản phẩm nào trên trang ${page}.`);
      } else {
        currentProductPage = page;
        totalProductPages = Math.max(1, Math.ceil(total / 50));
        availableProducts = newProducts;
        renderProducts();

        productScanStatus.className = "hint-text success";
        productScanStatus.textContent = `Đã tải ${newProducts.length} sản phẩm (Tổng ${total}).`;
        appendLog(`Quét thành công ${newProducts.length}/${total} sản phẩm.`);
      }
    } catch (err) {
      productScanStatus.className = "hint-text error";
      productScanStatus.textContent = `Lỗi tải sản phẩm: ${err.message}`;
      appendLog(`Lỗi tải sản phẩm: ${err.message}`, true);
    } finally {
      btnScanProducts.disabled = false;
    }
  }

  btnScanProducts.addEventListener("click", () => fetchProducts(1));

  btnPrevProductPage.addEventListener("click", () => {
    if (currentProductPage > 1) fetchProducts(currentProductPage - 1);
  });

  btnNextProductPage.addEventListener("click", () => {
    if (currentProductPage < totalProductPages) fetchProducts(currentProductPage + 1);
  });

  // Dán Product ID thủ công
  btnAddManualProduct.addEventListener("click", () => {
    const pId = inputManualProductId.value.trim();
    if (!pId) return;
    if (!/^\d{10,}$/.test(pId)) {
      alert("Product ID phải là dãy số (ví dụ: 1732626228898006171)");
      return;
    }
    const existing = availableProducts.find(p => p.productId === pId);
    if (!existing) {
      availableProducts.unshift({
        productId: pId,
        title: `Sản phẩm thủ công (${pId})`,
        imageUrl: "",
        price: 0,
        stock: 999,
        commissionRate: Number(cfgCommission.value || 10),
      });
    }
    selectedProductIds.add(pId);
    renderProducts();
    inputManualProductId.value = "";
    appendLog(`Đã thêm thủ công sản phẩm ID: ${pId}`);
  });

  function renderProducts() {
    if (!availableProducts.length) {
      productListContainer.hidden = true;
      return;
    }
    productListContainer.hidden = false;
    productList.innerHTML = availableProducts.map(p => `
      <div class="product-item">
        <input type="checkbox" class="chk-prod" data-id="${p.productId}" ${selectedProductIds.has(p.productId) ? "checked" : ""}>
        <img src="${p.imageUrl || 'data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\"></svg>'}" alt="">
        <div class="p-info">
          <div class="p-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</div>
          <div class="p-meta">ID: ${p.productId} • Giá: ${Number(p.price).toLocaleString()}đ • Kho: ${p.stock} • <b style="color:#D97706">🔥 Đã bán: ${Number(p.sales || 0).toLocaleString()}</b> • HH: ${p.commissionRate}%</div>
        </div>
      </div>
    `).join("");

    productPageIndicator.textContent = `Trang ${currentProductPage}/${totalProductPages}`;
    btnPrevProductPage.disabled = currentProductPage <= 1;
    btnNextProductPage.disabled = currentProductPage >= totalProductPages;

    updateSelectedProductText();

    productList.querySelectorAll(".chk-prod").forEach(chk => {
      chk.addEventListener("change", (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) selectedProductIds.add(id);
        else selectedProductIds.delete(id);
        updateSelectedProductText();
      });
    });
  }

  chkSelectAllProducts.addEventListener("change", (e) => {
    if (e.target.checked) {
      availableProducts.forEach(p => selectedProductIds.add(p.productId));
    } else {
      selectedProductIds.clear();
    }
    renderProducts();
  });

  function updateSelectedProductText() {
    selectedProductCount.textContent = `Đã chọn ${selectedProductIds.size}/${availableProducts.length}`;
    chkSelectAllProducts.checked = availableProducts.length > 0 && selectedProductIds.size === availableProducts.length;
  }

  // 5. Phân tích danh sách KOC
  // 5. Phân tích danh sách KOC (Chuẩn hóa Kalodata, TikTok Export, Excel, URL, bỏ @)
  function parseKocLines(text) {
    if (!text || typeof text !== "string") return [];
    const lines = text.split(/[\r\n]+/);
    const result = [];
    const seen = new Set();

    const HANDLE_HEADER_KEYWORDS = [
      "tài khoản nst", "tai khoan nst", "tên người dùng", "ten nguoi dung",
      "tài khoản", "tai khoan", "tên koc", "ten koc", "koc", "username", "handle",
      "kênh tiktok", "kenh tiktok", "link kênh", "link kenh", "creator account", "account"
    ];

    const OEC_HEADER_KEYWORDS = [
      "creator oec id", "creator_oec_id", "oec_id", "oecid", "creator_id", "creator id", "mã koc", "ma koc"
    ];

    const IGNORE_HEADER_KEYWORDS = [
      "id video", "video id", "id sản phẩm", "id san pham", "product id", "id chiến dịch",
      "doanh số", "doanh thu", "lượng theo dõi", "follower", "followers", "lượt bán", "giá bán",
      "tỷ lệ", "tổng sản phẩm", "livestream", "video", "chi phí", "roi", "sđt", "số điện thoại",
      "phone", "thời gian", "phạm vi", "ngày", "tiêu đề", "trạng thái", "loại ủy quyền", "stt"
    ];

    const BLACKLIST_WORDS = new Set([
      "nam", "nu", "male", "female", "fashion", "beauty", "food", "life",
      "thoitrang", "mypham", "giadung", "tech", "review", "active", "pending",
      "status", "done", "ok", "yes", "no", "pass", "fail", "daduyet", "dathue",
      "kol", "koc", "vip", "link", "channel", "kenh", "video", "livestream",
      "follow", "followers", "gmv", "revenue", "phone", "sdt", "zalo", "facebook",
      "fb", "true", "false", "undefined", "null", "nan", "admin", "vietnam",
      "hanoi", "hcm", "danang", "creator"
    ]);

    function isValidHandle(val) {
      if (!val) return false;
      const c = String(val).trim().replace(/^@+/, "").toLowerCase();
      if (!/^[a-z0-9._]{2,30}$/.test(c)) return false;
      if (/^\d+$/.test(c)) return false;
      if (BLACKLIST_WORDS.has(c)) return false;
      return true;
    }

    function isValidOecId(val) {
      if (!val) return false;
      const c = String(val).trim();
      if (!/^\d{17,21}$/.test(c)) return false;
      if (c.endsWith("00000000")) return false;
      if (/^(?:0|\+?84)[1-9]\d{8,9}$/.test(c)) return false;
      return true;
    }

    let handleColIdx = -1;
    let oecColIdx = -1;
    let startLineIdx = 0;

    if (lines.length > 0) {
      const firstLine = lines[0].trim().toLowerCase();
      const headerCells = firstLine.split(/[\t,;|]+/).map(c => c.trim().replace(/["'()₫]/g, ""));

      let isHeader = false;
      headerCells.forEach((colName, idx) => {
        if (!colName) return;
        const isIgnore = IGNORE_HEADER_KEYWORDS.some(kw => colName.includes(kw));

        if (OEC_HEADER_KEYWORDS.some(kw => colName.includes(kw)) && !isIgnore) {
          oecColIdx = idx;
          isHeader = true;
        } else if (HANDLE_HEADER_KEYWORDS.some(kw => colName.includes(kw)) && !isIgnore) {
          handleColIdx = idx;
          isHeader = true;
        } else if (isIgnore) {
          isHeader = true;
        }
      });

      if (isHeader) {
        startLineIdx = 1;
      }
    }

    for (let i = startLineIdx; i < lines.length; i += 1) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;

      const cells = rawLine.split(/[\t,;|]+/).map(c => c.trim().replace(/["']/g, "")).filter(Boolean);
      if (!cells.length) continue;

      let rowHandle = "";
      let rowOecId = "";

      if (handleColIdx >= 0 && handleColIdx < cells.length) {
        const val = cells[handleColIdx];
        const urlMatch = val.match(/tiktok\.com\/@([a-zA-Z0-9._]+)/i);
        if (urlMatch) {
          rowHandle = urlMatch[1].replace(/^@+/, "");
        } else if (isValidHandle(val)) {
          rowHandle = val.replace(/^@+/, "");
        }
      }

      if (oecColIdx >= 0 && oecColIdx < cells.length) {
        const val = cells[oecColIdx];
        if (isValidOecId(val)) {
          rowOecId = val;
        }
      }

      if (!rowHandle && !rowOecId) {
        for (const c of cells) {
          const m = c.match(/tiktok\.com\/@([a-zA-Z0-9._]+)/i);
          if (m) {
            rowHandle = m[1].replace(/^@+/, "");
            break;
          }
        }

        if (!rowHandle) {
          for (const c of cells) {
            if (c.startsWith("@")) {
              const candidate = c.replace(/^@+/, "");
              if (isValidHandle(candidate)) {
                rowHandle = candidate;
                break;
              }
            }
          }
        }

        for (const c of cells) {
          const m = c.match(/(?:oec_id|creator_id|oec|id)[:=_\s]*(\d{17,21})/i);
          if (m && isValidOecId(m[1])) {
            rowOecId = m[1];
            break;
          }
        }

        if (!rowOecId && cells.length <= 2) {
          for (const c of cells) {
            if (isValidOecId(c)) {
              rowOecId = c;
              break;
            }
          }
        }

        if (!rowHandle) {
          for (const c of cells) {
            if (/^\d+$/.test(c) || c.includes("~") || c.includes("/") || c.includes(":")) continue;
            if (isValidHandle(c)) {
              rowHandle = c.replace(/^@+/, "");
              break;
            }
          }
        }
      }

      const key = (rowOecId || rowHandle).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);

      result.push({
        handle: rowHandle,
        creatorOecId: rowOecId,
      });
    }

    return result;
  }

  function updateKocStats() {
    const list = parseKocLines(kocInputText.value);
    const withOec = list.filter(k => !!k.creatorOecId).length;
    statTotalKoc.textContent = list.length;
    statOecCount.textContent = withOec;
    let chunks = Math.ceil(list.length / 50);
    if (cfgTestRun.checked && list.length > 0) chunks = 1;
    statChunkCount.textContent = chunks;
  }

  kocInputText.addEventListener("input", updateKocStats);

  // Nhập file CSV / TXT
  fileKocInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || "");
      const parsedList = parseKocLines(content);
      const lines = parsedList.map(k => {
        if (k.creatorOecId && k.handle) return `${k.handle}\t${k.creatorOecId}`;
        if (k.creatorOecId) return k.creatorOecId;
        return k.handle;
      });

      kocInputText.value = lines.join("\n");
      updateKocStats();
      appendLog(`Đã nạp ${parsedList.length} KOC từ file ${file.name}`);
    };
    reader.readAsText(file);
  });

  // 6. Tra cứu OEC ID từ Username (@handle)
  btnLookupHandles.addEventListener("click", async () => {
    const list = parseKocLines(kocInputText.value);
    const handlesToLookup = list.filter(k => !k.creatorOecId && !!k.handle).map(k => k.handle);

    if (!handlesToLookup.length) {
      alert("Tất cả KOC trong danh sách đã có OEC ID hoặc danh sách đang rỗng.");
      return;
    }

    if (!activeTikTokTab) {
      alert("Vui lòng mở tab TikTok Affiliate trước khi tra cứu.");
      return;
    }

    btnLookupHandles.disabled = true;
    lookupStatusText.hidden = false;
    lookupStatusText.className = "hint-text";
    lookupStatusText.textContent = `Đang tra cứu ${handlesToLookup.length} usernames qua TikTok...`;
    appendLog(`Bắt đầu tra cứu ID cho ${handlesToLookup.length} usernames qua API TikTok...`);

    try {
      const res = await chrome.runtime.sendMessage({
        type: "KOCVIP_LOOKUP_HANDLES",
        payload: { handles: handlesToLookup },
      });

      if (!res?.success) throw new Error(res?.error || "Tra cứu thất bại");
      const { verified, notFound } = res.data || { verified: [], notFound: [] };

      // Thay thế username bằng OEC ID trong danh sách
      const foundMap = new Map(verified.map(v => [v.handle.toLowerCase(), v.creatorOecId]));
      const lines = kocInputText.value.split(/[\r\n]+/);
      const updatedLines = lines.map(line => {
        const clean = line.replace(/^@/, "").trim().toLowerCase();
        return foundMap.has(clean) ? foundMap.get(clean) : line;
      });

      kocInputText.value = updatedLines.join("\n");
      updateKocStats();

      let msg = `Tìm thấy ${verified.length}/${handlesToLookup.length} KOC hợp lệ.`;
      if (notFound.length) {
        msg += ` Không tìm thấy ${notFound.length} usernames: ${notFound.slice(0, 5).join(", ")}${notFound.length > 5 ? "..." : ""}`;
      }
      lookupStatusText.className = notFound.length ? "hint-text warning" : "hint-text success";
      lookupStatusText.textContent = msg;
      appendLog(msg);
    } catch (err) {
      lookupStatusText.className = "hint-text error";
      lookupStatusText.textContent = `Lỗi tra cứu: ${err.message}`;
      appendLog(`Lỗi tra cứu ID: ${err.message}`, true);
    } finally {
      btnLookupHandles.disabled = false;
    }
  });

  // 7. Quy tắc sinh tên nhóm: <TIỀN_TỐ>_<ngày>_<giờ>_N<STT>
  function sinhTenNhom(prefix, chunkIdx) {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, "0");
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0") + "h";
    const p = (prefix || "KOCVIP").trim().toUpperCase();
    return `${p}_${d}_${m}_${h}_N${chunkIdx + 1}`.slice(0, 30);
  }

  // 8. Bắt đầu gửi lời mời
  btnStart.addEventListener("click", async () => {
    if (!activeTikTokTab) {
      alert("Chưa tìm thấy tab TikTok Affiliate. Hãy mở trang https://affiliate.tiktok.com và đăng nhập trước.");
      return;
    }

    if (selectedProductIds.size === 0) {
      alert("Vui lòng chọn ít nhất 1 sản phẩm để gắn vào lời mời.");
      return;
    }

    let kocList = parseKocLines(kocInputText.value);
    if (kocList.length === 0) {
      alert("Vui lòng nhập danh sách KOC.");
      return;
    }

    if (cfgTestRun.checked) {
      const testLimit = Math.max(1, Math.min(50, Number(cfgTestRunCount.value || 5)));
      kocList = kocList.slice(0, testLimit);
      appendLog(`[Chạy Thử] Đã lấy ${kocList.length} KOC đầu tiên để thử nghiệm.`);
    }

    metricSent.textContent = "0";
    metricSkipped.textContent = "0";
    metricFailed.textContent = "0";
    metricReset.textContent = "0";
    progressFill.style.width = "0%";
    progressPercent.textContent = "0%";
    progressText.textContent = "Đang khởi tạo...";

    btnStart.hidden = true;
    runningControls.hidden = false;
    btnPause.hidden = false;
    btnResume.hidden = true;

    currentRunId = crypto.randomUUID();
    const prefix = cfgPrefix.value || "KOCVIP";

    const chunkSize = 50;
    const chunks = [];
    for (let i = 0; i < kocList.length; i += chunkSize) {
      const slice = kocList.slice(i, i + chunkSize);
      const chunkIdx = chunks.length;
      chunks.push({
        chunkId: `chunk_${currentRunId}_${chunkIdx}`,
        groupName: sinhTenNhom(prefix, chunkIdx),
        capacity: 50,
        status: "local_pending",
        recipients: slice.map((koc, idx) => ({
          recipientId: `rec_${currentRunId}_${chunkIdx}_${idx}`,
          creatorOecId: koc.creatorOecId,
          handle: koc.handle,
          status: "local_pending",
        })),
      });
    }

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + Number(cfgDays.value || 365));
    const expiresAt = expDate.toISOString().slice(0, 10);

    const sampleMode = document.querySelector('input[name="sampleMode"]:checked')?.value || "manual";
    const selectedProducts = availableProducts.filter(p => selectedProductIds.has(p.productId));

    const manifest = {
      serverRunId: currentRunId,
      shopId: "tiktok_shop",
      region: "VN",
      totalEligible: kocList.length,
      chunks,
      draft: {
        title: prefix,
        expiresAt,
        commissionBps: Number(cfgCommission.value || 10) * 100,
        adsCommissionBps: Number(cfgAdsCommission.value || 1) * 100,
        contentPreference: cfgContentPref.value,
        sampleEnabled: cfgSampleEnabled.checked,
        sampleApprovalMode: sampleMode,
        zalo: cfgZalo.value.trim(),
        message: cfgMessage.value.trim(),
        tuXuLyTrung: cfgResolveConflict.checked,
        shareAfterInvite: cfgShareChat.checked,
        products: selectedProducts.map(p => ({
          productId: p.productId,
          commissionBps: Number(cfgCommission.value || 10) * 100,
          adsCommissionBps: Number(cfgAdsCommission.value || 1) * 100,
        })),
      },
    };

    appendLog(`Bắt đầu đợt mời [${manifest.serverRunId.slice(0, 8)}] với ${kocList.length} KOC trong ${chunks.length} nhóm...`);

    try {
      const res = await chrome.runtime.sendMessage({
        type: "KOCVIP_START_INVITE",
        payload: { manifest },
      });
      if (!res?.success) throw new Error(res?.error || "Không thể khởi động đợt mời");
      appendLog("Tiến trình đang chạy trên tab TikTok Affiliate.");
    } catch (err) {
      appendLog(`Lỗi khởi động: ${err.message}`, true);
      btnStart.hidden = false;
      runningControls.hidden = true;
    }
  });

  // 9. Nút điều khiển
  btnPause.addEventListener("click", async () => {
    if (!currentRunId) return;
    await chrome.runtime.sendMessage({
      type: "KOCVIP_INVITE_CONTROL",
      payload: { serverRunId: currentRunId, action: "pause" },
    });
    btnPause.hidden = true;
    btnResume.hidden = false;
    appendLog("Đã tạm dừng đợt mời.");
  });

  btnResume.addEventListener("click", async () => {
    if (!currentRunId) return;
    await chrome.runtime.sendMessage({
      type: "KOCVIP_INVITE_CONTROL",
      payload: { serverRunId: currentRunId, action: "resume" },
    });
    btnResume.hidden = true;
    btnPause.hidden = false;
    appendLog("Đã tiếp tục đợt mời.");
  });

  btnStop.addEventListener("click", async () => {
    if (!currentRunId) return;
    if (!confirm("Bạn có chắc chắn muốn hủy đợt mời này không?")) return;
    await chrome.runtime.sendMessage({
      type: "KOCVIP_INVITE_CONTROL",
      payload: { serverRunId: currentRunId, action: "stop" },
    });
    btnStart.hidden = false;
    runningControls.hidden = true;
    appendLog("Đã hủy đợt mời.");
  });

  // 10. Tiến trình & Nhật ký Real-time
  chrome.runtime.onMessage.addListener(async (message) => {
    if (message?.type === "KOCVIP_LOG_ENTRY") {
      const { text, isError, type: logType } = message.payload || {};
      if (text) appendLog(text, !!isError, logType);
      return;
    }

    if (message?.type === "KOCVIP_PROGRESS_UPDATE") {
      const { serverRunId, status, completed, message: extraMsg } = message.payload || {};
      if (extraMsg) appendLog(extraMsg);
      if (serverRunId !== currentRunId) return;

      try {
        const res = await chrome.runtime.sendMessage({
          type: "KOCVIP_LOCAL_DB",
          payload: { op: "listChunks", serverRunId },
        });

        const chunks = res?.data || [];
        let sent = 0, skipped = 0, failed = 0, waiting = 0, total = 0;

        for (const c of chunks) {
          for (const r of c.recipients || []) {
            total += 1;
            if (r.status === "sent") sent += 1;
            else if (r.status === "skipped") skipped += 1;
            else if (r.status === "failed") failed += 1;
            else if (r.status === "waiting_daily_reset") waiting += 1;
          }
        }

        metricSent.textContent = sent;
        metricSkipped.textContent = skipped;
        metricFailed.textContent = failed;
        metricReset.textContent = waiting;

        const processed = sent + skipped + failed;
        const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
        progressFill.style.width = `${pct}%`;
        progressPercent.textContent = `${pct}%`;
        progressText.textContent = completed ? "Hoàn tất" : `Đang xử lý (${processed}/${total})`;

        if (completed) {
          appendLog(`Đợt mời hoàn tất! Thành công: ${sent} • Trùng/Bỏ qua: ${skipped} • Lỗi: ${failed} • Chờ reset: ${waiting}`);
          btnStart.hidden = false;
          runningControls.hidden = true;
        }
      } catch {}
    }
  });

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  }
});
