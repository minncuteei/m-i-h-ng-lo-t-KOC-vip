/**
 * KOC VIP - Giao diện Tạo lời mời KOC (Bản UI Rộng Chuẩn STONK / Ảnh 2).
 * Chạy hoàn toàn cục bộ, bảo mật, không telemetry, không gọi server ngoài TikTok.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const tabStatusBadge = document.getElementById("tabStatusBadge");
  const dailyLimitBadge = document.getElementById("dailyLimitBadge");
  const btnClose = document.getElementById("btnClose");
  const btnMinimize = document.getElementById("btnMinimize");
  const btnMaximize = document.getElementById("btnMaximize");
  const btnOpenNewTab = document.getElementById("btnOpenNewTab");
  const btnCancel = document.getElementById("btnCancel");

  // Campaign Form
  const inputTitle = document.getElementById("inputTitle");
  const inputStaff = document.getElementById("inputStaff");
  const inputExpiresAt = document.getElementById("inputExpiresAt");
  const selectContentType = document.getElementById("selectContentType");
  const inputCommission = document.getElementById("inputCommission");
  const inputAdsCommission = document.getElementById("inputAdsCommission");
  const chkShareAfter = document.getElementById("chkShareAfter");
  const inputZalo = document.getElementById("inputZalo");
  const inputFacebook = document.getElementById("inputFacebook");
  const inputMessage = document.getElementById("inputMessage");
  const chkResolveConflict = document.getElementById("chkResolveConflict");
  const chkTestRun = document.getElementById("chkTestRun");
  const inputTestRunCount = document.getElementById("inputTestRunCount");
  const selectSafeDelay = document.getElementById("selectSafeDelay");
  const chkSampleEnabled = document.getElementById("chkSampleEnabled");
  const sampleModeBox = document.getElementById("sampleModeBox");

  // Products
  const btnScanProducts = document.getElementById("btnScanProducts");
  const inputProductSearch = document.getElementById("inputProductSearch");
  const chkSelectAllProducts = document.getElementById("chkSelectAllProducts");
  const lblSelectAllText = document.getElementById("lblSelectAllText");
  const selectProductSort = document.getElementById("selectProductSort");
  const inputManualPid = document.getElementById("inputManualPid");
  const btnAddManualPid = document.getElementById("btnAddManualPid");
  const productSummaryBar = document.getElementById("productSummaryBar");
  const productListContainer = document.getElementById("productListContainer");

  // Preview
  const previewTitle = document.getElementById("previewTitle");
  const previewMessage = document.getElementById("previewMessage");
  const previewProductsCount = document.getElementById("previewProductsCount");
  const previewProductList = document.getElementById("previewProductList");

  // KOC Drawer
  const btnOpenKocDrawer = document.getElementById("btnOpenKocDrawer");
  const btnOpenKocPool = document.getElementById("btnOpenKocPool");
  const btnOpenKocPoolFooter = document.getElementById("btnOpenKocPoolFooter");
  const kocDrawerOverlay = document.getElementById("kocDrawerOverlay");
  const btnCloseKocDrawer = document.getElementById("btnCloseKocDrawer");
  const kocDrawerText = document.getElementById("kocDrawerText");
  const kocDrawerFileInput = document.getElementById("kocDrawerFileInput");
  const btnDrawerSave = document.getElementById("btnDrawerSave");
  const btnDrawerClear = document.getElementById("btnDrawerClear");
  const kocDrawerStats = document.getElementById("kocDrawerStats");
  const chipKocCount = document.getElementById("chipKocCount");

  // Actions
  const statusQuickText = document.getElementById("statusQuickText");
  const btnConflictCheck = document.getElementById("btnConflictCheck");
  const btnDryRun = document.getElementById("btnDryRun");
  const btnSendReal = document.getElementById("btnSendReal");

  // Execution Panel
  const executionPanel = document.getElementById("executionPanel");
  const mSent = document.getElementById("mSent");
  const mSkipped = document.getElementById("mSkipped");
  const mFailed = document.getElementById("mFailed");
  const mReset = document.getElementById("mReset");
  const execProgressBar = document.getElementById("execProgressBar");
  const execProgressStatus = document.getElementById("execProgressStatus");
  const execProgressPercent = document.getElementById("execProgressPercent");
  const execLogContent = document.getElementById("execLogContent");
  const btnExecPause = document.getElementById("btnExecPause");
  const btnExecResume = document.getElementById("btnExecResume");
  const btnExecMinimize = document.getElementById("btnExecMinimize");
  const btnExecStop = document.getElementById("btnExecStop");
  const btnExecClose = document.getElementById("btnExecClose");
  const btnExecBack = document.getElementById("btnExecBack");
  const btnExportDebug = document.getElementById("btnExportDebug");
  const btnExportKocExcel = document.getElementById("btnExportKocExcel");
  const btnCopyKocText = document.getElementById("btnCopyKocText");
  const btnExportPastKocs = document.getElementById("btnExportPastKocs");
  const execStopwatchBadge = document.getElementById("execStopwatchBadge");
  const execTopReasonsBox = document.getElementById("execTopReasonsBox");
  const execTopReasonsList = document.getElementById("execTopReasonsList");

  // History Drawer Elements
  const btnOpenHistory = document.getElementById("btnOpenHistory");
  const btnOpenHistoryFooter = document.getElementById("btnOpenHistoryFooter");
  const historyOverlay = document.getElementById("historyOverlay");
  const btnCloseHistory = document.getElementById("btnCloseHistory");
  const historyCountBadge = document.getElementById("historyCountBadge");
  const historyTotalBadge = document.getElementById("historyTotalBadge");
  const inputHistorySearch = document.getElementById("inputHistorySearch");
  const btnHistoryRefresh = document.getElementById("btnHistoryRefresh");
  const btnExportAllHistoryExcel = document.getElementById("btnExportAllHistoryExcel");
  const historyListContainer = document.getElementById("historyListContainer");

  // State
  let rawProducts = [];
  let selectedProductIds = new Set();
  let kocList = []; // Array of { handle, creatorOecId }
  let activeTikTokTab = null;
  let currentRunId = null;
  let runStartedAt = null;
  let runStopwatchTimer = null;

  function formatStopwatch(ms) {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const p = n => String(n).padStart(2, "0");
    if (hrs > 0) return `${p(hrs)}:${p(mins)}:${p(secs)}`;
    return `00:${p(mins)}:${p(secs)}`;
  }

  function startStopwatch(startTimeMs) {
    runStartedAt = startTimeMs || Date.now();
    if (runStopwatchTimer) clearInterval(runStopwatchTimer);
    runStopwatchTimer = setInterval(() => {
      if (execStopwatchBadge && runStartedAt) {
        execStopwatchBadge.textContent = `⏱️ ${formatStopwatch(Date.now() - runStartedAt)}`;
      }
    }, 1000);
    if (execStopwatchBadge) {
      execStopwatchBadge.textContent = `⏱️ ${formatStopwatch(Date.now() - runStartedAt)}`;
    }
  }

  function stopStopwatch(finalElapsedMs) {
    if (runStopwatchTimer) {
      clearInterval(runStopwatchTimer);
      runStopwatchTimer = null;
    }
    if (execStopwatchBadge && finalElapsedMs != null) {
      execStopwatchBadge.textContent = `⏱️ ${formatStopwatch(finalElapsedMs)}`;
    }
  }

  function translateTikTokReason(raw) {
    if (!raw) return "Lỗi không xác định từ TikTok";
    const s = String(raw).trim();
    if (s.includes("16024016") || s.includes("linked with a shop account") || s.includes("liên kết Shop")) {
      return "Tài khoản liên kết Shop (không gửi qua Affiliate)";
    }
    if (s.includes("lời mời hiệu lực") || s.includes("Trùng nhóm") || s.includes("conflict") || s.includes("trùng")) {
      return "Đang có lời mời hiệu lực tại nhóm khác";
    }
    if (s.includes("98001004") || s.includes("Trùng tên nhóm") || s.includes("duplicate name")) {
      return "Trùng tên nhóm lời mời (hệ thống tự đổi tên)";
    }
    if (s.includes("16024034") || s.includes("16024035") || s.toLowerCase().includes("quota") || s.includes("hạn mức")) {
      return "Shop đã chạm trần hạn mức 10.000 KOC / ngày";
    }
    if (s.includes("Không tìm thấy") || s.includes("not found") || s.includes("user not exist")) {
      return "Không tìm thấy KOC hoặc tài khoản bị khóa";
    }
    if (s.includes("nhạy cảm") || s.includes("sensitive")) {
      return "Tin nhắn chứa từ khóa nhạy cảm";
    }
    return s;
  }

  // 1. Dò tìm tab TikTok Affiliate
  let currentLoadedShopId = null;
  let isScanningProducts = false;

  async function checkTikTokTab() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "KOCVIP_GET_TIKTOK_TAB" });
      if (res?.success && res.data) {
        activeTikTokTab = res.data;
        const shopName = res.data.shopName || currentShopName || "Hannah Seyo";
        if (res.data.shopName && !currentShopName) currentShopName = res.data.shopName;
        const shopIdText = res.data.shopId ? ` (${res.data.shopId})` : "";
        tabStatusBadge.className = "status-badge connected";
        tabStatusBadge.innerHTML = `<span class="dot"></span><span class="text">Đã nối: <b>${escapeHtml(shopName)}</b>${shopIdText}</span>`;

        const newShopId = String(res.data.shopId || res.data.shopName || "").trim();
        // Nhận biết shop khác nhau: Nếu chuyển tab sang shop mới, tự động nạp danh mục shop mới
        if (newShopId && currentLoadedShopId && newShopId !== currentLoadedShopId) {
          console.log(`[KOC VIP] Nhận diện shop mới: ${currentLoadedShopId} -> ${newShopId}`);
          statusQuickText.textContent = `Đang chuyển sang shop ${shopName}...`;
          currentLoadedShopId = newShopId;
          selectedProductIds.clear(); // Reset lựa chọn của shop cũ
          fetchProducts(false); // Dùng cache nếu shop mới từng quét, nếu chưa thì quét mới
        }
      } else {
        activeTikTokTab = null;
        tabStatusBadge.className = "status-badge disconnected";
        tabStatusBadge.innerHTML = `<span class="dot"></span><span class="text">Chưa mở tab TikTok Affiliate</span>`;
      }
    } catch {
      activeTikTokTab = null;
      tabStatusBadge.className = "status-badge disconnected";
      tabStatusBadge.innerHTML = `<span class="dot"></span><span class="text">Mất kết nối nền</span>`;
    }
  }
  setInterval(checkTikTokTab, 3500);
  checkTikTokTab();

  let currentShopName = "";

  function generateDefaultTitle(customShop) {
    const shop = (customShop || currentShopName || "Hannah Seyo").trim();
    return `${shop} x nhatminh`;
  }

  // Cấu trúc đặt tên chuẩn: shop x nhatminh_ngày tháng tạo_số thứ tự (VD: Hannah Seyo x nhatminh_08-10_001)
  // TikTok giới hạn độ dài Tên lời mời tối đa chính xác 30 ký tự (0/30)
  function formatInvitationGroupName(baseTitle, index) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const suffix = `_${dd}-${mm}_${String(index).padStart(3, "0")}`; // Dài 11 ký tự: _08-10_001
    let clean = String(baseTitle || generateDefaultTitle()).trim();
    clean = clean.replace(/[/\\:*?"<>|~`!@#$%^&=+{}\[\];]/g, "-").replace(/\s+/g, " ").replace(/[-_]{2,}/g, "_");
    clean = clean.replace(/_\d{2}[/-]\d{2}_\d+$/i, "").replace(/_N\d+$/i, "").replace(/_TEST$/i, "").trim();
    // Giới hạn phần prefix tối đa 30 - 11 = 19 ký tự để đảm bảo tổng độ dài luôn <= 30 ký tự
    const maxPrefixLen = Math.max(5, 30 - suffix.length);
    const prefix = clean.slice(0, maxPrefixLen).trim();
    let name = `${prefix}${suffix}`;
    if (name.length > 30) name = name.slice(0, 30).trim();
    return name;
  }

  // Quản lý Hạn mức 24h Thông minh (Reset lúc 00:00 mỗi ngày)
  async function getDailyQuota() {
    const today = new Date().toISOString().split("T")[0];
    const stored = await chrome.storage.local.get(["kocvip_daily_quota"]);
    const quota = stored?.kocvip_daily_quota;
    if (!quota || quota.date !== today) {
      const fresh = { date: today, sentKocCount: 0, sentGroupCount: 0, recordedRuns: [] };
      await chrome.storage.local.set({ kocvip_daily_quota: fresh });
      return fresh;
    }
    return quota;
  }

  function formatNumberVN(num) {
    return Number(num || 0).toLocaleString("vi-VN");
  }

  function updateDailyLimitBadge(quota) {
    if (!dailyLimitBadge) return;
    const kocCount = quota?.sentKocCount || 0;
    const groupCount = quota?.sentGroupCount || 0;
    dailyLimitBadge.textContent = `Hạn mức 24h: ${formatNumberVN(kocCount)}/10.000 (${formatNumberVN(groupCount)}/200 nhóm)`;
  }

  function setQuickExpiryDays(days) {
    const target = new Date(Date.now() + Number(days) * 86400000);
    inputExpiresAt.value = target.toISOString().split("T")[0];
  }

  function setQuickExpiryMonths(months) {
    const target = new Date();
    target.setMonth(target.getMonth() + Number(months));
    inputExpiresAt.value = target.toISOString().split("T")[0];
  }

  // Bấm nút chọn nhanh thời hạn (1 tuần, 1 tháng, 3 tháng, 6 tháng, 1 năm)
  document.querySelectorAll(".quick-date-row button").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.days) setQuickExpiryDays(btn.dataset.days);
      else if (btn.dataset.months) setQuickExpiryMonths(btn.dataset.months);
      saveSettings();
    });
  });

  // Lưu toàn bộ cài đặt form vào chrome.storage.local
  function saveSettings() {
    const settings = {
      title: inputTitle.value,
      staff: inputStaff.value || "nhatminh",
      expiresAt: inputExpiresAt.value,
      contentType: selectContentType.value,
      commission: inputCommission.value,
      adsCommission: inputAdsCommission.value,
      shareAfter: chkShareAfter.checked,
      zalo: inputZalo.value || "0943102588",
      facebook: inputFacebook.value,
      message: inputMessage.value,
      resolveConflict: chkResolveConflict.checked,
      testRun: chkTestRun.checked,
      testRunCount: inputTestRunCount.value,
      safeDelay: selectSafeDelay ? selectSafeDelay.value : "7500",
      sampleEnabled: chkSampleEnabled ? chkSampleEnabled.checked : true,
      sampleApprovalMode: document.querySelector('input[name="sampleApprovalMode"]:checked')?.value || "manual",
      kocText: kocDrawerText.value,
      selectedProductIds: Array.from(selectedProductIds),
    };
    chrome.storage.local.set({ kocvip_saved_settings: settings });
    updatePreview();
  }

  // Tải lại các giá trị đã lưu trước đó
  chrome.storage.local.get(["kocvip_saved_settings"], (data) => {
    const s = data.kocvip_saved_settings;
    if (s) {
      if (s.title && !s.title.startsWith("STONKAIKOC_VIP")) {
        inputTitle.value = s.title;
      } else {
        inputTitle.value = generateDefaultTitle();
      }

      // Mặc định nhân viên: nhatminh
      inputStaff.value = s.staff || "nhatminh";

      if (s.expiresAt) {
        inputExpiresAt.value = s.expiresAt;
      } else {
        setQuickExpiryDays(7); // Mặc định 1 tuần nếu chưa chọn
      }

      if (s.contentType) selectContentType.value = s.contentType;
      if (s.commission !== undefined && s.commission !== "") {
        inputCommission.value = s.commission;
      } else {
        inputCommission.value = "8";
      }
      if (s.adsCommission !== undefined && s.adsCommission !== "") {
        inputAdsCommission.value = s.adsCommission;
      } else {
        inputAdsCommission.value = "2";
      }
      if (s.shareAfter !== undefined) chkShareAfter.checked = !!s.shareAfter;

      // Mặc định Zalo: 0943102588
      inputZalo.value = s.zalo || "0943102588";

      if (s.facebook) inputFacebook.value = s.facebook;

      const DEFAULT_INVITE_MESSAGE = "Chào {{creators_username}}, mình bên Shop phụ trách chiến dịch cho các sản phẩm của shop và thấy kênh bạn rất phù hợp. Mời bạn nhận mẫu + gắn giỏ kiếm hoa hồng nhé!";
      if (s.message && s.message.trim()) {
        inputMessage.value = s.message;
      } else {
        inputMessage.value = DEFAULT_INVITE_MESSAGE;
      }

      if (s.resolveConflict !== undefined) chkResolveConflict.checked = !!s.resolveConflict;
      if (s.testRun !== undefined) chkTestRun.checked = !!s.testRun;
      if (s.testRunCount) inputTestRunCount.value = s.testRunCount;
      if (s.safeDelay && selectSafeDelay) selectSafeDelay.value = s.safeDelay;

      if (chkSampleEnabled && s.sampleEnabled !== undefined) {
        chkSampleEnabled.checked = !!s.sampleEnabled;
        if (sampleModeBox) sampleModeBox.style.display = s.sampleEnabled ? "flex" : "none";
      }

      if (s.sampleApprovalMode) {
        const rad = document.querySelector(`input[name="sampleApprovalMode"][value="${s.sampleApprovalMode}"]`);
        if (rad) rad.checked = true;
      }

      if (Array.isArray(s.selectedProductIds)) {
        s.selectedProductIds.slice(0, 100).forEach(id => selectedProductIds.add(id));
      }

      if (s.kocText) {
        kocDrawerText.value = s.kocText;
        updateKocListFromText();
      }
    } else {
      const DEFAULT_INVITE_MESSAGE = "Chào {{creators_username}}, mình bên Shop phụ trách chiến dịch cho các sản phẩm của shop và thấy kênh bạn rất phù hợp. Mời bạn nhận mẫu + gắn giỏ kiếm hoa hồng nhé!";
      inputTitle.value = generateDefaultTitle();
      inputStaff.value = "nhatminh";
      inputZalo.value = "0943102588";
      inputMessage.value = DEFAULT_INVITE_MESSAGE;
      setQuickExpiryDays(7); // Mặc định 1 tuần theo yêu cầu
      saveSettings();
    }
    getDailyQuota().then(updateDailyLimitBadge);
    updatePreview();
  });

  // Bắt sự kiện thay đổi trên toàn bộ các input / select / checkbox để tự động lưu
  [inputTitle, inputStaff, inputExpiresAt, selectContentType, inputCommission, inputAdsCommission, inputZalo, inputFacebook, inputMessage, inputTestRunCount].forEach(el => {
    if (el) {
      el.addEventListener("input", saveSettings);
      el.addEventListener("change", saveSettings);
    }
  });

  if (selectSafeDelay) selectSafeDelay.addEventListener("change", saveSettings);

  [chkShareAfter, chkResolveConflict, chkTestRun].forEach(el => {
    if (el) el.addEventListener("change", saveSettings);
  });

  if (chkSampleEnabled) {
    chkSampleEnabled.addEventListener("change", () => {
      if (sampleModeBox) sampleModeBox.style.display = chkSampleEnabled.checked ? "flex" : "none";
      saveSettings();
    });
  }

  document.querySelectorAll('input[name="sampleApprovalMode"]').forEach(rad => {
    rad.addEventListener("change", saveSettings);
  });

  // 3. Quét & Sắp xếp Sản phẩm (Cơ chế Nhận diện Shop & Cache thông minh)
  async function fetchProducts(force = false) {
    if (isScanningProducts) return;

    if (!activeTikTokTab) {
      await checkTikTokTab();
    }
    const realShopId = String(activeTikTokTab?.shopId || (activeTikTokTab?.url ? new URL(activeTikTokTab.url).searchParams.get("shop_id") || new URL(activeTikTokTab.url).searchParams.get("oec_seller_id") : "") || currentShopName || "default").trim();

    // Nếu không force và đã nạp đúng sản phẩm của shop hiện tại -> không quét lại
    if (!force && currentLoadedShopId === realShopId && rawProducts.length > 0) {
      statusQuickText.textContent = `Đã có sẵn ${rawProducts.length} sản phẩm của shop (nhấn 'Quét từ Shop' nếu cần cập nhật).`;
      return;
    }

    isScanningProducts = true;
    btnScanProducts.disabled = true;
    btnScanProducts.textContent = "⏳ Đang nạp...";
    statusQuickText.textContent = force ? "Đang quét danh mục sản phẩm mới từ TikTok Shop..." : "Đang kiểm tra danh mục sản phẩm của shop...";

    try {
      const res = await chrome.runtime.sendMessage({
        type: "KOCVIP_REFRESH_PRODUCTS",
        payload: { page: 1, pageSize: 100, shopId: realShopId, force: Boolean(force) },
      });

      if (!res?.success) throw new Error(res?.error || "Không thể nạp sản phẩm");
      const list = res.data?.products || [];
      const fromCache = Boolean(res.data?.fromCache);

      currentLoadedShopId = realShopId;

      // Nhận diện và cập nhật tên shop
      if (res.data?.shopName) {
        currentShopName = res.data.shopName;
        if (!inputTitle.value || inputTitle.value.startsWith("STONKAIKOC_VIP") || inputTitle.value.includes("x nhatminh")) {
          inputTitle.value = generateDefaultTitle(currentShopName);
          saveSettings();
        }
      }

      if (!list.length) {
        productListContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--warning);">Shop chưa có sản phẩm nào trong danh mục. Bấm "Quét từ Shop" để thử lại.</div>`;
        productSummaryBar.innerHTML = `<span>0 sản phẩm</span>`;
        statusQuickText.textContent = "Shop chưa có sản phẩm. Bấm 'Quét từ Shop' để tải.";
        return;
      }

      rawProducts = list;

      // Loại bỏ sạch sẽ các ID cũ không còn nằm trong danh sách đang bán (loại bỏ sản phẩm rác/ẩn/hết hàng)
      const validPids = new Set(rawProducts.map(p => p.productId));
      for (const id of Array.from(selectedProductIds)) {
        if (!validPids.has(id)) {
          selectedProductIds.delete(id);
        }
      }

      renderProducts();
      statusQuickText.textContent = fromCache
        ? `⚡ Đã nạp nhanh ${rawProducts.length} sản phẩm từ bộ nhớ tạm (Shop: ${currentShopName || realShopId}). Bấm 'Quét từ Shop' nếu muốn cập nhật mới.`
        : `✅ Đã quét thành công ${rawProducts.length} sản phẩm mới từ TikTok Shop.`;
    } catch (err) {
      statusQuickText.textContent = `Lỗi quét sản phẩm: ${err.message}`;
      productListContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--danger);">Lỗi tải sản phẩm: ${err.message}</div>`;
    } finally {
      isScanningProducts = false;
      btnScanProducts.disabled = false;
      btnScanProducts.textContent = "🔄 Quét từ Shop";
    }
  }

  btnScanProducts.addEventListener("click", () => fetchProducts(true));

  function removeVietnameseTones(str) {
    if (!str) return "";
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .trim();
  }

  // Bộ lọc & Sắp xếp danh mục sản phẩm chuẩn xác theo dữ liệu TikTok (hỗ trợ cả tiếng Việt có dấu & không dấu)
  function getSortedAndFilteredProducts() {
    const q1 = inputProductSearch ? inputProductSearch.value.trim() : "";
    const q2 = inputManualPid ? inputManualPid.value.trim() : "";
    // Ưu tiên ô tìm kiếm chính, nếu ô tìm kiếm chính rỗng thì tự động lấy từ ô dán ID/tên
    const query = q1 || q2;
    const queryLower = query.toLowerCase();
    const queryNorm = removeVietnameseTones(query);
    const sortMode = selectProductSort ? selectProductSort.value : "sales:desc";

    let items = rawProducts.filter(p => {
      if (!query) return true;
      const titleLower = (p.title || "").toLowerCase();
      const titleNorm = removeVietnameseTones(p.title || "");
      const titleMatch = titleLower.includes(queryLower) || titleNorm.includes(queryNorm);
      const idMatch = String(p.productId || "").includes(query);
      const skuMatch = (p.skus || []).some(s => {
        const sStr = String(s);
        return sStr.toLowerCase().includes(queryLower) || removeVietnameseTones(sStr).includes(queryNorm);
      });
      return titleMatch || idMatch || skuMatch;
    });

    // Sắp xếp linh hoạt theo các tiêu chí thực tế từ TikTok
    items.sort((a, b) => {
      if (sortMode === "sales:desc") {
        // Ưu tiên đơn hàng 28 ngày qua (hiệu suất thực tế) -> Tổng bán tích lũy -> Doanh thu
        const diffOrders = (b.orders28d || 0) - (a.orders28d || 0);
        if (diffOrders !== 0) return diffOrders;
        const diffSales = (b.allTimeSales || b.sales || 0) - (a.allTimeSales || a.sales || 0);
        if (diffSales !== 0) return diffSales;
        return (b.revenue || 0) - (a.revenue || 0) || (b.stock || 0) - (a.stock || 0);
      }
      if (sortMode === "revenue:desc") {
        // Doanh thu GMV cao nhất
        const diffGmv = (b.revenue || b.gmv28d || 0) - (a.revenue || a.gmv28d || 0);
        if (diffGmv !== 0) return diffGmv;
        return (b.orders28d || b.sales || 0) - (a.orders28d || a.sales || 0);
      }
      if (sortMode === "stock:desc") {
        // Tồn kho nhiều nhất
        const diffStock = (b.stock || 0) - (a.stock || 0);
        if (diffStock !== 0) return diffStock;
        return (b.sales || 0) - (a.sales || 0);
      }
      if (sortMode === "title:asc") {
        return String(a.title || "").localeCompare(String(b.title || ""), "vi");
      }
      return (b.sales || 0) - (a.sales || 0);
    });

    return items;
  }

  function renderProducts() {
    const products = getSortedAndFilteredProducts();
    const selectedCount = selectedProductIds.size;
    const sortMode = selectProductSort ? selectProductSort.value : "sales:desc";

    const sortMeta = {
      "sales:desc": { text: "🔥 Bán nhiều nhất", color: "#D97706" },
      "revenue:desc": { text: "💰 Doanh thu cao nhất", color: "#059669" },
      "stock:desc": { text: "📦 Tồn kho nhiều nhất", color: "#2563EB" },
      "title:asc": { text: "🔤 Tên A → Z", color: "#7C3AED" },
    }[sortMode] || { text: "🔥 Bán nhiều nhất", color: "#D97706" };

    productSummaryBar.innerHTML = `
      <span>Hiển thị <b>${products.length}</b> sản phẩm trên kệ • Đã chọn <b>${selectedCount}</b>/100</span>
      <span style="color: ${sortMeta.color}; font-weight: 600;">${sortMeta.text}</span>
    `;

    // Đồng bộ trạng thái checkbox hình vuông Chọn Full
    if (chkSelectAllProducts) {
      const isFullSelected = products.length > 0 && (
        (products.length <= 100 && products.every(p => selectedProductIds.has(p.productId))) ||
        (products.length > 100 && selectedCount >= 100)
      );
      chkSelectAllProducts.checked = isFullSelected;
      if (lblSelectAllText) {
        lblSelectAllText.textContent = isFullSelected
          ? `Bỏ full (${selectedCount})`
          : `Chọn full (${Math.min(products.length, 100)})`;
      }
    }

    if (!products.length) {
      productListContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">Không tìm thấy sản phẩm khớp bộ lọc.</div>`;
      updatePreview();
      return;
    }

    productListContainer.innerHTML = products.map((p, idx) => {
      const isSelected = selectedProductIds.has(p.productId);
      const priceText = p.price ? `${Number(p.price).toLocaleString("vi-VN")}₫` : "0₫";
      const stockText = Number(p.stock || 0).toLocaleString("vi-VN");
      const salesCount = Number(p.sales || p.allTimeSales || 0);
      const salesText = salesCount >= 1000 ? `${(salesCount / 1000).toFixed(1)}k` : `${salesCount}`;
      const skuPreview = p.skus && p.skus.length ? ` · SKU: ${p.skus.slice(0, 2).join(", ")}` : " · Chưa có SKU";

      const gmvBadge = p.gmv28d > 0
        ? `<span class="gmv-tag" style="background: rgba(16,185,129,0.12); color: #059669; padding: 2px 6px; border-radius: 4px; font-weight: 600;">💰 ${p.gmv28d >= 1000000 ? (p.gmv28d / 1000000).toFixed(1) + 'Tr' : p.gmv28d.toLocaleString('vi-VN') + '₫'}</span> · `
        : "";

      const ordersBadge = p.orders28d > 0
        ? `<b class="sales-tag" style="color: #D97706;">🔥 28 ngày: ${Number(p.orders28d).toLocaleString('vi-VN')} đơn</b> · `
        : `<b class="sales-tag">🔥 Đã bán: ${salesText}</b> · `;

      return `
        <label class="invite-product-row ${isSelected ? 'selected' : ''}" data-id="${p.productId}">
          <span class="product-stt">${idx + 1}</span>
          <input type="checkbox" class="product-item-chk" value="${p.productId}" ${isSelected ? 'checked' : ''}>
          ${p.imageUrl ? `<img src="${p.imageUrl}" alt="" loading="lazy">` : `<div class="invite-product-image-placeholder">📦</div>`}
          <div class="product-row-info">
            <strong>${escapeHtml(p.title)}</strong>
            <small>
              ID ${p.productId}${skuPreview} · Kho ${stockText} · ${priceText} · 
              ${ordersBadge}${gmvBadge}<span class="comm-tag">HH: ${p.commissionRate || 10}%</span>
            </small>
          </div>
        </label>
      `;
    }).join("");

    // Sự kiện tích chọn sản phẩm
    productListContainer.querySelectorAll(".product-item-chk").forEach(chk => {
      chk.addEventListener("change", (e) => {
        const pid = e.target.value;
        if (e.target.checked) {
          if (selectedProductIds.size >= 100) {
            e.target.checked = false;
            alert("TikTok Shop quy định tối đa 100 sản phẩm trong một chiến dịch mời KOC.");
            return;
          }
          selectedProductIds.add(pid);
        } else {
          selectedProductIds.delete(pid);
        }
        renderProducts();
        saveSettings();
      });
    });

    updatePreview();
  }

  inputProductSearch.addEventListener("input", () => {
    renderProducts();
  });

  if (inputManualPid) {
    inputManualPid.addEventListener("input", () => {
      // Khi gõ vào ô này, nếu ô tìm kiếm chính trống, tự động lọc sản phẩm ngay lập tức
      renderProducts();
    });
  }

  selectProductSort.addEventListener("change", renderProducts);

  // Sự kiện Checkbox hình vuông: Ấn lần 1 chọn full (tối đa 100 SP), ấn lần 2 bỏ full
  if (chkSelectAllProducts) {
    chkSelectAllProducts.addEventListener("change", () => {
      const currentList = getSortedAndFilteredProducts();
      if (chkSelectAllProducts.checked) {
        // Ấn lần 1: Chọn full (tối đa 100 sản phẩm theo giới hạn cho phép của TikTok)
        selectedProductIds.clear();
        currentList.slice(0, 100).forEach(p => selectedProductIds.add(p.productId));
      } else {
        // Ấn lần 2: Bỏ chọn full SẠCH SẼ TOÀN BỘ (không còn sót lại sản phẩm nào)
        selectedProductIds.clear();
      }
      renderProducts();
      saveSettings();
    });
  }

  // Thêm Product ID thủ công hoặc Tìm kiếm nhanh
  btnAddManualPid.addEventListener("click", () => {
    const val = inputManualPid.value.trim();
    if (!val) return;
    // Nếu người dùng nhập tên/từ khóa chữ thay vì ID số -> chuyển thành tìm kiếm sản phẩm ngay lập tức
    if (!/^\d{10,}$/.test(val)) {
      if (inputProductSearch) inputProductSearch.value = val;
      renderProducts();
      return;
    }
    const pid = val;
    const existing = rawProducts.find(p => p.productId === pid);
    if (!existing) {
      rawProducts.unshift({
        productId: pid,
        title: `Sản phẩm thủ công (${pid})`,
        imageUrl: "",
        price: 0,
        stock: 999,
        sales: 9999,
        commissionRate: Number(inputCommission.value || 8),
      });
    }
    selectedProductIds.add(pid);
    inputManualPid.value = "";
    renderProducts();
    saveSettings();
  });

  // 4. Cập nhật Xem trước (Card 4 - Đã mở rộng khung xem)
  function updatePreview() {
    previewTitle.textContent = inputTitle.value.trim() || generateDefaultTitle();
    previewMessage.textContent = inputMessage.value.trim() || "Nội dung lời mời sẽ hiển thị tại đây...";

    const selectedList = rawProducts.filter(p => selectedProductIds.has(p.productId));
    if (!selectedList.length) {
      previewProductsCount.textContent = "Chưa chọn sản phẩm";
      previewProductList.innerHTML = "";
    } else {
      previewProductsCount.textContent = `Đã chọn ${selectedList.length}/100 sản phẩm:`;
      previewProductList.innerHTML = selectedList.map((p, idx) => `
        <li><b>${idx + 1}.</b> ${escapeHtml(p.title)} <span style="color: var(--brand); font-weight: 600;">(HH: ${p.commissionRate || 8}%)</span></li>
      `).join("");
    }
  }

  // 5. BỘ PHÂN TÍCH ID KOC THÔNG MINH (Chuẩn hóa Kalodata, TikTok Export, Excel, URL, bỏ @)
  function parseKocInputData(rawText) {
    if (!rawText || typeof rawText !== "string") return [];
    const lines = rawText.split(/[\r\n]+/);
    const result = [];
    const seen = new Set();

    // Từ khóa tiêu đề cột chứa Handle / Username
    const HANDLE_HEADER_KEYWORDS = [
      "tài khoản nst", "tai khoan nst", "tên người dùng", "ten nguoi dung",
      "tài khoản", "tai khoan", "tên koc", "ten koc", "koc", "username", "handle",
      "kênh tiktok", "kenh tiktok", "link kênh", "link kenh", "creator account", "account"
    ];

    // Từ khóa tiêu đề cột chứa Creator OEC ID thật
    const OEC_HEADER_KEYWORDS = [
      "creator oec id", "creator_oec_id", "oec_id", "oecid", "creator_id", "creator id", "mã koc", "ma koc"
    ];

    // CÁC CỘT TUYỆT ĐỐI KHÔNG PHẢI LÀ KOC ID / USERNAME (Tránh bắt nhầm)
    const IGNORE_HEADER_KEYWORDS = [
      "id video", "video id", "id sản phẩm", "id san pham", "product id", "id chiến dịch",
      "doanh số", "doanh thu", "lượng theo dõi", "follower", "followers", "lượt bán", "giá bán",
      "tỷ lệ", "tổng sản phẩm", "livestream", "video", "chi phí", "roi", "sđt", "số điện thoại",
      "phone", "thời gian", "phạm vi", "ngày", "tiêu đề", "trạng thái", "loại ủy quyền", "stt"
    ];

    // Từ cấm / từ thông dụng trong bảng Excel không phải là username TikTok
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
      // TikTok handle: 2-30 ký tự, gồm a-z, 0-9, dấu chấm (.), gạch dưới (_)
      if (!/^[a-z0-9._]{2,30}$/.test(c)) return false;
      if (/^\d+$/.test(c)) return false; // Không thể là chuỗi toàn số
      if (BLACKLIST_WORDS.has(c)) return false;
      return true;
    }

    function isValidOecId(val) {
      if (!val) return false;
      const c = String(val).trim();
      // Snowflake ID của TikTok luôn có độ dài 17-21 chữ số
      if (!/^\d{17,21}$/.test(c)) return false;
      if (c.endsWith("00000000")) return false; // Loại bỏ số tròn hàng chục triệu
      if (/^(?:0|\+?84)[1-9]\d{8,9}$/.test(c)) return false; // Loại bỏ số điện thoại
      return true;
    }

    // Bước 1: Quét dòng tiêu đề (Header row) nếu có
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

    // Bước 2: Bóc tách từng dòng dữ liệu
    for (let i = startLineIdx; i < lines.length; i += 1) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;

      const cells = rawLine.split(/[\t,;|]+/).map(c => c.trim().replace(/["']/g, "")).filter(Boolean);
      if (!cells.length) continue;

      let rowHandle = "";
      let rowOecId = "";

      // Trường hợp A: Đã nhận diện được cột từ tiêu đề
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

      // Trường hợp B: Chưa tìm thấy hoặc người dùng dán tự do (không có header)
      if (!rowHandle && !rowOecId) {
        // 1. Tìm qua URL TikTok
        for (const c of cells) {
          const m = c.match(/tiktok\.com\/@([a-zA-Z0-9._]+)/i);
          if (m) {
            rowHandle = m[1].replace(/^@+/, "");
            break;
          }
        }

        // 2. Tìm qua tiền tố @handle
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

        // 3. Tìm OEC ID có tiền tố (ví dụ ID: 7494... hoặc OEC: 7494...)
        for (const c of cells) {
          const m = c.match(/(?:oec_id|creator_id|oec|id)[:=_\s]*(\d{17,21})/i);
          if (m && isValidOecId(m[1])) {
            rowOecId = m[1];
            break;
          }
        }

        // 4. Nếu dòng chỉ có 1-2 ô độc lập và là chuỗi số 17-21 chữ số
        if (!rowOecId && cells.length <= 2) {
          for (const c of cells) {
            if (isValidOecId(c)) {
              rowOecId = c;
              break;
            }
          }
        }

        // 5. Tìm handle thông thường (loại trừ số, ngày tháng, từ khóa rác)
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

  function updateKocListFromText() {
    const raw = kocDrawerText.value || "";
    kocList = parseKocInputData(raw);

    const total = kocList.length;
    const chunkCount = Math.ceil(total / 50);

    chipKocCount.textContent = `${formatNumberVN(total)} KOC ▾`;
    kocDrawerStats.innerHTML = `Tổng nhận diện: <b>${formatNumberVN(total)}</b> KOC • Dự kiến: <b>${formatNumberVN(chunkCount)}</b> nhóm (tối đa 50 KOC/nhóm)`;
  }

  function normalizeDrawerText() {
    if (!kocList.length) return;
    const lines = kocList.map(k => {
      if (k.handle) return k.handle.startsWith("@") ? k.handle : `@${k.handle}`;
      return k.creatorOecId;
    });
    kocDrawerText.value = lines.join("\n");
  }

  ["input", "change", "paste", "keyup"].forEach(evt => {
    kocDrawerText.addEventListener(evt, () => {
      setTimeout(() => {
        updateKocListFromText();
        saveSettings();
      }, 0);
    });
  });

  const openDrawer = () => {
    updateKocListFromText();
    kocDrawerOverlay.hidden = false;
  };
  btnOpenKocDrawer.addEventListener("click", openDrawer);
  btnOpenKocPool.addEventListener("click", openDrawer);
  btnOpenKocPoolFooter.addEventListener("click", openDrawer);
  btnCloseKocDrawer.addEventListener("click", () => {
    normalizeDrawerText();
    kocDrawerOverlay.hidden = true;
    saveSettings();
  });
  btnDrawerSave.addEventListener("click", () => {
    normalizeDrawerText();
    kocDrawerOverlay.hidden = true;
    saveSettings();
  });

  if (btnDrawerClear) {
    btnDrawerClear.addEventListener("click", () => {
      if (!kocDrawerText.value.trim()) return;
      if (confirm("Bạn có chắc chắn muốn xóa toàn bộ danh sách KOC hiện tại không?")) {
        kocDrawerText.value = "";
        kocDrawerFileInput.value = "";
        updateKocListFromText();
        saveSettings();
        kocDrawerText.focus();
      }
    });
  }

  // Nạp Excel (.xlsx / .xls) / CSV / TXT
  kocDrawerFileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = (file.name || "").toLowerCase();
    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result);
          if (typeof XLSX === "undefined") {
            throw new Error("Thư viện đọc Excel chưa sẵn sàng");
          }

          let workbook;
          try {
            workbook = XLSX.read(data, { type: "array" });
          } catch (readErr) {
            console.warn("XLSX.read (array) failed, thử sang binary:", readErr);
            const binary = Array.from(data).map(b => String.fromCharCode(b)).join("");
            workbook = XLSX.read(binary, { type: "binary" });
          }

          let allCsvText = "";
          if (workbook && workbook.SheetNames) {
            for (const sName of workbook.SheetNames) {
              const ws = workbook.Sheets[sName];
              if (ws) {
                const sheetText = XLSX.utils.sheet_to_csv(ws);
                if (sheetText && sheetText.trim()) {
                  allCsvText += (allCsvText ? "\n" : "") + sheetText;
                }
              }
            }
          }

          if (allCsvText.trim()) {
            kocDrawerText.value = allCsvText;
            updateKocListFromText();
            normalizeDrawerText();
            saveSettings();
          } else {
            throw new Error("File Excel không có dữ liệu nội dung");
          }
        } catch (err) {
          console.error("Lỗi parse file Excel:", err);
          // Fallback tự động đọc dưới dạng văn bản (đối với file CSV/TSV bị đổi tên thành .xlsx hoặc cấu trúc text)
          const textReader = new FileReader();
          textReader.onload = (tevt) => {
            const rawText = tevt.target?.result || "";
            if (rawText && typeof rawText === "string") {
              const testList = parseKocInputData(rawText);
              if (testList.length > 0) {
                kocDrawerText.value = rawText;
                updateKocListFromText();
                normalizeDrawerText();
                saveSettings();
                return;
              }
            }
            alert("Lỗi đọc file Excel: " + (err.message || "File không đúng định dạng"));
          };
          textReader.readAsText(file);
        } finally {
          e.target.value = ""; // Reset input file để có thể chọn lại cùng file nếu cần
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result || "";
        kocDrawerText.value = text;
        updateKocListFromText();
        normalizeDrawerText();
        saveSettings();
        e.target.value = "";
      };
      reader.readAsText(file);
    }
  });

  // 6. Kiểm trùng (Conflict Check nhanh)
  btnConflictCheck.addEventListener("click", async () => {
    if (!activeTikTokTab) {
      alert("Vui lòng mở tab TikTok Affiliate trước khi kiểm tra.");
      return;
    }
    if (!selectedProductIds.size) {
      alert("Vui lòng tích chọn ít nhất 1 sản phẩm trước khi kiểm trùng.");
      return;
    }
    if (!kocList.length) {
      alert("Chưa có danh sách KOC. Hãy bấm '📋 Nhập KOC' để dán ID hoặc Username.");
      kocDrawerOverlay.hidden = false;
      return;
    }

    statusQuickText.textContent = "Đang kiểm trùng trên TikTok...";
    btnConflictCheck.disabled = true;

    try {
      const targetChunk = kocList.slice(0, 50).map(k => ({
        creatorOecId: k.creatorOecId || "",
        handle: k.handle || "",
      }));
      const selectedProducts = rawProducts.filter(p => selectedProductIds.has(p.productId));
      const realShopId = activeTikTokTab.shopId || (activeTikTokTab.url ? new URL(activeTikTokTab.url).searchParams.get("shop_id") || new URL(activeTikTokTab.url).searchParams.get("oec_seller_id") : "") || "7495640849659693211";
      const realRegion = activeTikTokTab.shopRegion || (activeTikTokTab.url ? new URL(activeTikTokTab.url).searchParams.get("shop_region") : "") || "VN";

      const res = await chrome.runtime.sendMessage({
        type: "KOCVIP_START_INVITE",
        payload: {
          manifest: {
            shopId: realShopId,
            region: realRegion,
            serverRunId: `dry_run_${Date.now()}`,
            dryRunOnly: true,
            draft: {
              title: inputTitle.value.trim() || generateDefaultTitle(),
              expiresAt: inputExpiresAt.value,
              contentPreference: selectContentType.value,
              commission: Number(inputCommission.value || 8),
              adsCommission: Number(inputAdsCommission.value || 2),
              products: selectedProducts.map(p => ({
                productId: p.productId,
                title: p.title,
                target_commission: Math.round(Number(inputCommission.value || 8) * 100),
                target_ads_commission: Math.round(Number(inputAdsCommission.value || 2) * 100),
              })),
              recipients: targetChunk,
              tuXuLyTrung: chkResolveConflict.checked,
            },
          },
        },
      });
      statusQuickText.textContent = "Đã gửi yêu cầu kiểm trùng sang tab TikTok.";
    } catch (err) {
      statusQuickText.textContent = `Lỗi kiểm trùng: ${err.message}`;
    } finally {
      btnConflictCheck.disabled = false;
    }
  });

  // 6b. Kiểm tra cấu hình (1 KOC) - Chế độ cô lập lỗi trước khi chạy hàng loạt
  btnDryRun.addEventListener("click", async () => {
    if (!activeTikTokTab) {
      alert("Chưa kết nối tab TikTok Affiliate. Vui lòng mở https://affiliate.tiktok.com và đăng nhập shop.");
      return;
    }

    if (!rawProducts.length || !selectedProductIds.size) {
      alert("Chưa chọn sản phẩm nào! Vui lòng tích chọn ít nhất 1 sản phẩm bán chạy.");
      return;
    }

    const selectedProducts = rawProducts.filter(p => selectedProductIds.has(p.productId));
    if (!selectedProducts.length) {
      alert("Không tìm thấy sản phẩm hợp lệ trong danh mục đã chọn.");
      return;
    }

    if (!kocList.length) {
      alert("Chưa có KOC nào. Hãy bấm '📋 Nhập KOC' để dán ít nhất 1 ID KOC.");
      kocDrawerOverlay.hidden = false;
      return;
    }

    // Ưu tiên lấy 1 KOC đã có OEC ID số
    let sampleKoc = kocList.find(k => !!k.creatorOecId && /^\d{8,}$/.test(k.creatorOecId));
    if (!sampleKoc) {
      sampleKoc = kocList[0];
      if (!sampleKoc.creatorOecId && sampleKoc.handle) {
        statusQuickText.textContent = `Đang tra cứu ID cho @${sampleKoc.handle}...`;
        try {
          const lookupRes = await chrome.runtime.sendMessage({
            type: "KOCVIP_LOOKUP_HANDLES",
            payload: { handles: [sampleKoc.handle] },
          });
          const verified = lookupRes?.data?.verified || [];
          if (verified.length > 0) {
            sampleKoc.creatorOecId = verified[0].creatorOecId;
          }
        } catch { }
      }
    }

    if (!sampleKoc?.creatorOecId && !sampleKoc?.handle) {
      alert("Không tìm thấy KOC hợp lệ để kiểm tra cấu hình.");
      return;
    }

    const confirmMsg = `KIỂM TRA CẤU HÌNH (1 KOC):\n\n• Sẽ gửi thử 1 lời mời thật duy nhất tới KOC: ${sampleKoc.creatorOecId || sampleKoc.handle}\n• Sản phẩm: ${selectedProducts.map(p => p.title).slice(0, 2).join(", ")}\n• Mục đích: Cô lập lỗi payload/sản phẩm với TikTok trước khi chạy hàng loạt.\n\nBắt đầu kiểm tra ngay?`;
    if (!confirm(confirmMsg)) return;

    executionPanel.hidden = false;
    mSent.textContent = "0";
    mSkipped.textContent = "0";
    mFailed.textContent = "0";
    mReset.textContent = "0";
    execProgressBar.style.width = "0%";
    execProgressPercent.textContent = "0%";
    execProgressStatus.textContent = "Đang kiểm tra cấu hình với 1 KOC...";
    execLogContent.innerHTML = "";
    appendExecLog(`[TEST 1 KOC] Khởi tạo đợt kiểm tra cấu hình cho KOC: ${sampleKoc.creatorOecId || sampleKoc.handle}...`);

    const runId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    currentRunId = runId;

    const realShopId = activeTikTokTab.shopId || (activeTikTokTab.url ? new URL(activeTikTokTab.url).searchParams.get("shop_id") || new URL(activeTikTokTab.url).searchParams.get("oec_seller_id") : "") || "7495640849659693211";
    const realRegion = activeTikTokTab.shopRegion || (activeTikTokTab.url ? new URL(activeTikTokTab.url).searchParams.get("shop_region") : "") || "VN";
    const baseTitle = (inputTitle.value.trim() || generateDefaultTitle()).replace(/_N\d+$/i, "");
    const testGroupName = `${baseTitle}_TEST`;

    const recipient = [{
      creatorOecId: sampleKoc.creatorOecId || "",
      handle: sampleKoc.handle || "",
      status: "local_pending",
    }];

    const chunk = {
      chunkId: `${runId}_c1`,
      serverRunId: runId,
      groupName: testGroupName,
      soNhomDaMo: 1,
      status: "local_pending",
      recipients: recipient,
    };

    const manifest = {
      serverRunId: runId,
      shopId: realShopId,
      region: realRegion,
      totalKocs: 1,
      chunks: [chunk],
      draft: {
        title: testGroupName,
        expiresAt: inputExpiresAt.value,
        contentPreference: selectContentType.value,
        commission: Number(inputCommission.value || 8),
        adsCommission: Number(inputAdsCommission.value || 2),
        shareAfterInvite: false,
        zalo: inputZalo.value.trim(),
        facebook: inputFacebook.value.trim(),
        message: inputMessage.value.trim(),
        tuXuLyTrung: chkResolveConflict.checked,
        sampleEnabled: chkSampleEnabled ? chkSampleEnabled.checked : true,
        sampleApprovalMode: document.querySelector('input[name="sampleApprovalMode"]:checked')?.value || "manual",
        products: selectedProducts.map(p => ({
          productId: p.productId,
          title: p.title,
          target_commission: Math.round(Number(inputCommission.value || 8) * 100),
          target_ads_commission: Math.round(Number(inputAdsCommission.value || 2) * 100),
        })),
        recipients: recipient,
      },
    };

    try {
      await chrome.runtime.sendMessage({
        type: "KOCVIP_LOCAL_DB",
        payload: { op: "saveManifest", manifest },
      });
      await chrome.runtime.sendMessage({
        type: "KOCVIP_LOCAL_DB",
        payload: { op: "saveChunk", manifest, chunk },
      });
      const res = await chrome.runtime.sendMessage({
        type: "KOCVIP_START_INVITE",
        payload: { manifest },
      });
      if (!res?.success) throw new Error(res?.error || "Không thể khởi động kiểm tra");
      appendExecLog("Đã gửi đợt kiểm tra 1 KOC sang Content Script.");
    } catch (err) {
      appendExecLog(`Lỗi kiểm tra cấu hình: ${err.message}`, true);
    }
  });

  // 7. Gửi Thật (BẮT ĐẦU MỜI HÀNG LOẠT)
  btnSendReal.addEventListener("click", async () => {
    if (btnSendReal.disabled) return;

    if (!activeTikTokTab) {
      alert("Chưa kết nối tab TikTok. Vui lòng mở https://affiliate.tiktok.com hoặc https://seller-vn.tiktok.com và đăng nhập shop.");
      return;
    }

    if (!rawProducts.length || !selectedProductIds.size) {
      alert("Chưa chọn sản phẩm nào! TikTok bắt buộc phải gắn ít nhất 1 sản phẩm vào lời mời.\n\nVui lòng đợi nạp danh mục hoặc bấm 'Quét từ Shop' và tích chọn sản phẩm.");
      return;
    }

    const selectedProducts = rawProducts.filter(p => selectedProductIds.has(p.productId));
    if (!selectedProducts.length) {
      alert("Không tìm thấy sản phẩm hợp lệ trong danh mục đã chọn. Hãy bấm 'Quét từ Shop' lại.");
      return;
    }

    if (!kocList.length) {
      alert("Chưa có danh sách KOC nào. Hãy bấm '📋 Nhập KOC' để dán ID hoặc Username KOC.");
      kocDrawerOverlay.hidden = false;
      return;
    }

    // Nếu đang có tiến trình chạy chưa xong, hỏi người dùng trước khi đè
    if (currentRunId && !executionPanel.hidden) {
      if (!confirm("Một đợt mời đang chạy. Bạn có chắc muốn dừng đợt cũ để bắt đầu đợt mới không?")) return;
      await chrome.runtime.sendMessage({
        type: "KOCVIP_INVITE_CONTROL",
        payload: { action: "stop", serverRunId: currentRunId }
      }).catch(() => { });
    }

    const testRun = chkTestRun.checked;
    const testCount = Math.max(1, Number(inputTestRunCount.value || 5));
    const targetRecipients = testRun ? kocList.slice(0, testCount) : kocList;

    const baseTitle = (inputTitle.value.trim() || generateDefaultTitle()).replace(/_N\d+$/i, "");
    const campaignTitle = `${baseTitle}_N1`;
    const confirmMsg = `XÁC NHẬN GỬI THẬT:\n\n• Số KOC mời: ${targetRecipients.length} KOC ${testRun ? '(Chế độ chạy thử)' : ''}\n• Số sản phẩm gắn: ${selectedProducts.length} SP\n• Hoa hồng: Thường ${inputCommission.value}%, Ads ${inputAdsCommission.value}%\n• Tên đợt: ${baseTitle}\n• Thời hạn: ${inputExpiresAt.value || '1 tuần'}\n\nBắt đầu ngay?`;
    if (!confirm(confirmMsg)) return;

    btnSendReal.disabled = true;

    try {
      // Tự động tra cứu các username chưa có OEC ID trước khi bắt đầu
      const needLookup = kocList.filter(k => !k.creatorOecId && !!k.handle);
      if (needLookup.length > 0) {
        statusQuickText.textContent = `Đang tự động tra cứu ${needLookup.length} username qua TikTok...`;
        try {
          const lookupRes = await chrome.runtime.sendMessage({
            type: "KOCVIP_LOOKUP_HANDLES",
            payload: { handles: needLookup.map(k => k.handle) },
          });
          if (lookupRes?.success && lookupRes.data?.verified) {
            const vMap = new Map(lookupRes.data.verified.map(v => [v.handle.toLowerCase(), v.creatorOecId]));
            kocList.forEach(k => {
              if (!k.creatorOecId && k.handle && vMap.has(k.handle.toLowerCase())) {
                k.creatorOecId = vMap.get(k.handle.toLowerCase());
              }
            });
            normalizeDrawerText();
            updateKocListFromText();
            saveSettings();
          }
        } catch (e) {
          console.warn("[KOC VIP] Auto lookup error:", e);
        }
      }

      // Hiển thị Execution Panel
      executionPanel.removeAttribute("hidden");
      executionPanel.style.display = "flex";
      mSent.textContent = "0";
      mSkipped.textContent = "0";
      mFailed.textContent = "0";
      mReset.textContent = "0";
      execProgressBar.style.width = "0%";
      execProgressPercent.textContent = "0%";
      execProgressStatus.textContent = "Đang khởi tạo đợt mời...";
      btnExecPause.hidden = false;
      btnExecResume.hidden = true;
      btnExecStop.hidden = false;
      btnExecClose.hidden = false;
      btnExecClose.textContent = "✕ Đóng bảng";
      if (execTopReasonsBox) execTopReasonsBox.hidden = true;
      if (execTopReasonsList) execTopReasonsList.innerHTML = "";
      execLogContent.innerHTML = "";
      appendExecLog(`Bắt đầu đợt mời cho ${targetRecipients.length} KOC...`);

      const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      currentRunId = runId;
      startStopwatch(Date.now());
      try {
        chrome.storage.local.set({
          kocvip_active_run_id: runId,
          kocvip_run_start_time: Date.now()
        });
      } catch { }

      const realShopId = activeTikTokTab.shopId || (activeTikTokTab.url ? new URL(activeTikTokTab.url).searchParams.get("shop_id") || new URL(activeTikTokTab.url).searchParams.get("oec_seller_id") : "") || "7495640849659693211";
      const realRegion = activeTikTokTab.shopRegion || (activeTikTokTab.url ? new URL(activeTikTokTab.url).searchParams.get("shop_region") : "") || "VN";

      const allRecipients = targetRecipients.map(k => ({
        creatorOecId: k.creatorOecId || "",
        handle: k.handle || "",
        status: "local_pending",
      }));

      // Tự động phân chia thành các chunk 50 KOC theo giới hạn chuẩn của TikTok (tên nhóm _N1, _N2 chuẩn xác)
      const chunkSize = 50;
      const chunks = [];
      for (let i = 0; i < allRecipients.length; i += chunkSize) {
        const batch = allRecipients.slice(i, i + chunkSize);
        const chunkIndex = Math.floor(i / chunkSize) + 1;
        const groupName = formatInvitationGroupName(baseTitle, chunkIndex);
        chunks.push({
          chunkId: `${runId}_c${chunkIndex}`,
          serverRunId: runId,
          groupName,
          soNhomDaMo: chunkIndex,
          status: "local_pending",
          recipients: batch,
        });
      }

      const manifest = {
        serverRunId: runId,
        shopId: realShopId,
        region: realRegion,
        totalKocs: targetRecipients.length,
        safeDelayMs: Number(selectSafeDelay?.value || 7500),
        chunks,
        draft: {
          title: campaignTitle,
          expiresAt: inputExpiresAt.value,
          contentPreference: selectContentType.value,
          commission: Number(inputCommission.value || 8),
          adsCommission: Number(inputAdsCommission.value || 2),
          shareAfterInvite: chkShareAfter.checked,
          zalo: inputZalo.value.trim(),
          facebook: inputFacebook.value.trim(),
          message: inputMessage.value.trim(),
          tuXuLyTrung: chkResolveConflict.checked,
          sampleEnabled: chkSampleEnabled ? chkSampleEnabled.checked : true,
          sampleApprovalMode: document.querySelector('input[name="sampleApprovalMode"]:checked')?.value || "manual",
          products: selectedProducts.map(p => ({
            productId: p.productId,
            title: p.title,
            target_commission: Math.round(Number(inputCommission.value || 8) * 100),
            target_ads_commission: Math.round(Number(inputAdsCommission.value || 2) * 100),
          })),
          recipients: allRecipients,
        },
      };

      appendExecLog("Đang lưu cấu hình đợt mời vào IndexedDB...");
      await chrome.runtime.sendMessage({
        type: "KOCVIP_LOCAL_DB",
        payload: { op: "saveManifest", manifest },
      });
      for (const c of chunks) {
        await chrome.runtime.sendMessage({
          type: "KOCVIP_LOCAL_DB",
          payload: { op: "saveChunk", manifest, chunk: c },
        });
      }

      appendExecLog("Đang kết nối cổng TikTok Affiliate và khởi động tiến trình...");
      const res = await chrome.runtime.sendMessage({
        type: "KOCVIP_START_INVITE",
        payload: { manifest },
      });

      if (!res?.success) throw new Error(res?.error || "Không thể khởi động đợt mời");
      appendExecLog("Đợt mời đã được chuyển giao cho Content Script thực thi an toàn.");
    } catch (err) {
      appendExecLog(`Lỗi khởi động: ${err.message}`, true);
      execProgressStatus.textContent = `Lỗi: ${err.message}`;
    } finally {
      btnSendReal.disabled = false;
    }
  });

  function appendExecLog(msg, isError = false) {
    const time = new Date().toLocaleTimeString("vi-VN");
    const div = document.createElement("div");
    div.className = `log-line ${isError ? 'error' : ''}`;
    div.textContent = `[${time}] ${isError ? '[LỖI] ' : ''}${msg}`;
    execLogContent.prepend(div);
  }

  // Điều khiển Tạm dừng / Tiếp tục / Hủy
  btnExecPause.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "KOCVIP_INVITE_CONTROL", payload: { action: "pause", serverRunId: currentRunId } });
    btnExecPause.hidden = true;
    btnExecResume.hidden = false;
    stopStopwatch();
    appendExecLog("Đã gửi lệnh tạm dừng.");
  });

  btnExecResume.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "KOCVIP_INVITE_CONTROL", payload: { action: "resume", serverRunId: currentRunId } });
    btnExecPause.hidden = false;
    btnExecResume.hidden = true;
    startStopwatch(runStartedAt);
    appendExecLog("Đã gửi lệnh tiếp tục.");
  });

  function closeExecutionPanel(clearKocList = false) {
    executionPanel.hidden = true;
    executionPanel.setAttribute("hidden", "");
    executionPanel.style.display = "none";
    stopStopwatch();
    currentRunId = null;
    try {
      chrome.storage.local.remove(["kocvip_active_run_id", "kocvip_last_run_id", "kocvip_run_start_time"]);
      localStorage.removeItem("kocvip_last_run_id");
    } catch { }
    if (clearKocList) {
      kocDrawerText.value = "";
      updateKocListFromText();
      saveSettings();
    }
  }

  btnExecStop.addEventListener("click", async () => {
    if (!confirm("Bạn có chắc chắn muốn hủy bỏ đợt mời này không?")) return;

    stopStopwatch();
    appendExecLog("Đang gửi lệnh hủy đợt mời...");
    execProgressStatus.textContent = "Đã hủy bỏ đợt mời";
    btnExecPause.hidden = true;
    btnExecResume.hidden = true;
    btnExecStop.hidden = true;
    btnExecClose.hidden = false;
    btnExecClose.textContent = "← Quay lại thiết lập";

    let targetRunId = currentRunId;
    if (!targetRunId) {
      try {
        const stored = await chrome.storage.local.get(["kocvip_active_run_id"]);
        targetRunId = stored?.kocvip_active_run_id;
      } catch { }
    }

    try {
      await chrome.runtime.sendMessage({
        type: "KOCVIP_INVITE_CONTROL",
        payload: { action: "stop", serverRunId: targetRunId }
      });
    } catch (e) {
      console.warn("Lỗi gửi dừng tới runtime:", e);
    }

    try {
      window.parent.postMessage({
        type: "KOCVIP_INVITE_CONTROL",
        payload: { action: "stop", serverRunId: targetRunId }
      }, "*");
    } catch { }

    if (targetRunId) {
      try {
        await chrome.runtime.sendMessage({
          type: "KOCVIP_LOCAL_DB",
          payload: { op: "cancelRun", serverRunId: targetRunId }
        });
      } catch { }
    }

    currentRunId = null;
    try {
      await chrome.storage.local.remove(["kocvip_active_run_id", "kocvip_last_run_id", "kocvip_run_start_time"]);
      localStorage.removeItem("kocvip_last_run_id");
    } catch { }

    appendExecLog("Đã hủy bỏ đợt mời thành công.");

    // Tự động đóng bảng tiến trình sau 500ms để người dùng quay lại giao diện thiết lập
    setTimeout(() => {
      closeExecutionPanel(false);
    }, 500);
  });

  btnExecClose.addEventListener("click", () => {
    closeExecutionPanel(false);
  });

  if (btnExecMinimize) {
    btnExecMinimize.addEventListener("click", () => {
      window.parent.postMessage({ type: "KOCVIP_MINIMIZE_OVERLAY" }, "*");
    });
  }

  // Phím tắt Esc để thu nhỏ modal ra ngoài giải Captcha hoặc làm việc khác
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      window.parent.postMessage({ type: "KOCVIP_MINIMIZE_OVERLAY" }, "*");
    }
  });

  if (btnExecBack) {
    btnExecBack.addEventListener("click", () => {
      closeExecutionPanel(false);
    });
  }

  function formatStatusVN(status) {
    switch (status) {
      case "sent": return "✅ Thành công";
      case "skipped":
      case "conflict": return "⚠️ Bị trùng / Bỏ qua";
      case "failed": return "❌ Thất bại";
      case "waiting_daily_reset": return "⏳ Chờ reset 0h";
      case "local_pending": return "⏳ Đang chờ";
      default: return status || "Chưa rõ";
    }
  }

  function formatTimeVN(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      const p = n => String(n).padStart(2, "0");
      return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    } catch {
      return iso;
    }
  }

  function downloadKocsExcel(kocs, baseName = "kocvip_danh_sach_koc") {
    if (!Array.isArray(kocs) || kocs.length === 0) {
      alert("Không tìm thấy dữ liệu KOC để xuất!");
      return;
    }
    if (typeof XLSX === "undefined") {
      alert("Thư viện xuất Excel (XLSX) chưa sẵn sàng!");
      return;
    }

    // ==========================================
    // TRANG 1 (SHEET 1): DANH SÁCH KOC CHI TIẾT
    // ==========================================
    const headers = [
      "STT",
      "Username KOC",
      "ID KOC (OEC ID)",
      "Tên KOC",
      "Trạng thái",
      "Chi tiết / Lý do",
      "Thời gian mời"
    ];

    const listRows = [headers];
    kocs.forEach((k, idx) => {
      let handle = k.handle || "";
      if (handle && !handle.startsWith("@")) handle = `@${handle}`;
      listRows.push([
        idx + 1,
        handle,
        k.creatorOecId || "",
        k.nickName || "",
        formatStatusVN(k.status),
        k.reason || (k.status === "sent" ? "Đã gửi lời mời thành công" : ""),
        formatTimeVN(k.updatedAt)
      ]);
    });

    const wsList = XLSX.utils.aoa_to_sheet(listRows);
    wsList["!cols"] = [
      { wch: 6 },
      { wch: 24 },
      { wch: 25 },
      { wch: 25 },
      { wch: 24 },
      { wch: 48 },
      { wch: 22 }
    ];

    // ==========================================
    // TRANG 2 (SHEET 2): BÁO CÁO THỐNG KÊ KẾT QUẢ
    // ==========================================
    const total = kocs.length;
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let waitingCount = 0;
    let otherCount = 0;
    const reasonCounts = {};

    kocs.forEach(k => {
      const st = k.status;
      if (st === "sent") {
        sentCount++;
      } else if (st === "skipped" || st === "conflict") {
        skippedCount++;
      } else if (st === "failed") {
        failedCount++;
      } else if (st === "waiting_daily_reset") {
        waitingCount++;
      } else {
        otherCount++;
      }

      let r = (k.reason || "").trim();
      if (!r) {
        if (st === "sent") r = "Đã gửi lời mời thành công";
        else if (st === "skipped" || st === "conflict") r = "KOC bị trùng / Bỏ qua";
        else if (st === "failed") r = "Thất bại không rõ lý do";
        else r = formatStatusVN(st);
      }
      reasonCounts[r] = (reasonCounts[r] || 0) + 1;
    });

    const calcPct = (cnt) => total > 0 ? `${((cnt / total) * 100).toFixed(1)}%` : "0.0%";
    const exportTimeStr = formatTimeVN(new Date().toISOString());

    const statsRows = [
      ["BÁO CÁO THỐNG KÊ KẾT QUẢ MỜI KOC VIP"],
      ["Thời gian xuất báo cáo:", exportTimeStr],
      ["Tổng số lượng KOC:", total],
      [],
      ["1. BẢNG TỔNG QUAN KẾT QUẢ GỬI LỜI MỜI"],
      ["STT", "Chỉ số / Trạng thái", "Số lượng KOC", "Tỷ lệ (%)", "Ghi chú & Đánh giá"],
      [1, "✅ Mời thành công (Sent)", sentCount, calcPct(sentCount), "Đã gửi lời mời thành công lên TikTok Shop"],
      [2, "⚠️ Bị trùng / Bỏ qua (Skipped)", skippedCount, calcPct(skippedCount), "KOC đã được gửi lời mời trong 30 ngày qua hoặc trùng đợt cũ"],
      [3, "❌ Thất bại / Lỗi (Failed)", failedCount, calcPct(failedCount), "KOC đạt giới hạn nhận tin, chặn tin nhắn hoặc TikTok từ chối"],
      [4, "⏳ Chờ reset 0h / Đang chờ", waitingCount + otherCount, calcPct(waitingCount + otherCount), "Chờ TikTok reset hạn mức ngày mới hoặc đang hàng đợi"],
      ["", "TỔNG CỘNG", total, "100.0%", ""],
      [],
      ["2. PHÂN TÍCH CHI TIẾT THEO TỪNG NGUYÊN NHÂN / PHẢN HỒI"],
      ["STT", "Chi tiết lý do / Phản hồi", "Số lượng KOC", "Tỷ lệ (%)"]
    ];

    const sortedReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
    sortedReasons.forEach(([reason, count], idx) => {
      statsRows.push([
        idx + 1,
        reason,
        count,
        calcPct(count)
      ]);
    });

    const wsStats = XLSX.utils.aoa_to_sheet(statsRows);
    wsStats["!cols"] = [
      { wch: 6 },
      { wch: 45 },
      { wch: 16 },
      { wch: 14 },
      { wch: 55 }
    ];

    // Tạo Workbook và gắn cả 2 Trang (Sheets)
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsList, "Danh Sách KOC");
    XLSX.utils.book_append_sheet(wb, wsStats, "Thống Kê");

    const dStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${baseName}_${dStr}.xlsx`);
    appendExecLog(`📊 Đã xuất file Excel thành công (${kocs.length} KOC, gồm 2 sheet: Danh Sách & Thống Kê).`);
  }

  // Nút Xuất Excel đợt mời hiện tại
  if (btnExportKocExcel) {
    btnExportKocExcel.addEventListener("click", async () => {
      try {
        btnExportKocExcel.disabled = true;
        btnExportKocExcel.textContent = "⏳ Đang xuất...";
        const res = await chrome.runtime.sendMessage({
          type: "KOCVIP_LOCAL_DB",
          payload: { op: "getExportableKocs", serverRunId: currentRunId },
        });
        const kocs = res?.data || [];
        if (!kocs.length) {
          alert("Chưa có dữ liệu KOC nào trong đợt mời hiện tại.");
        } else {
          downloadKocsExcel(kocs, `kocvip_dot_moi_${currentRunId || 'export'}`);
        }
      } catch (err) {
        alert(`Lỗi khi xuất KOC: ${err.message}`);
      } finally {
        btnExportKocExcel.disabled = false;
        btnExportKocExcel.textContent = "📊 Xuất Excel";
      }
    });
  }

  // Nút Sao chép danh sách KOC dạng văn bản (mỗi dòng 1 KOC)
  if (btnCopyKocText) {
    btnCopyKocText.addEventListener("click", async () => {
      try {
        const res = await chrome.runtime.sendMessage({
          type: "KOCVIP_LOCAL_DB",
          payload: { op: "getExportableKocs", serverRunId: currentRunId },
        });
        const kocs = res?.data || [];
        if (!kocs.length) {
          alert("Chưa có danh sách KOC nào để sao chép.");
          return;
        }
        const lines = kocs.map(k => {
          let h = k.handle || "";
          if (h.startsWith("@")) h = h.slice(1);
          return h || k.creatorOecId || "";
        }).filter(Boolean);

        const text = lines.join("\n");
        await navigator.clipboard.writeText(text);
        alert(`Đã sao chép ${lines.length} KOC vào bộ nhớ tạm (mỗi dòng 1 KOC)!`);
      } catch (err) {
        alert(`Không thể sao chép: ${err.message}`);
      }
    });
  }

  // Nút Xuất toàn bộ KOC đã từng mời trong lịch sử máy (trong KOC Drawer)
  if (btnExportPastKocs) {
    btnExportPastKocs.addEventListener("click", async () => {
      try {
        btnExportPastKocs.disabled = true;
        btnExportPastKocs.textContent = "⏳ Đang xuất...";
        const res = await chrome.runtime.sendMessage({
          type: "KOCVIP_LOCAL_DB",
          payload: { op: "getExportableKocs", shopId: currentLoadedShopId },
        });
        const kocs = res?.data || [];
        if (!kocs.length) {
          alert("Chưa tìm thấy KOC nào đã từng được mời trong lịch sử máy này.");
        } else {
          downloadKocsExcel(kocs, `kocvip_lich_su_koc_${currentLoadedShopId || 'all'}`);
        }
      } catch (err) {
        alert(`Lỗi khi xuất lịch sử KOC: ${err.message}`);
      } finally {
        btnExportPastKocs.disabled = false;
        btnExportPastKocs.textContent = "📊 Xuất KOC đã mời";
      }
    });
  }

  // ==========================================
  // QUẢN LÝ LỊCH SỬ CÁC LẦN MỜI & ĐỐI CHIẾU
  // ==========================================
  let cachedRunHistory = [];

  async function loadHistoryList(filterText = "") {
    if (!historyListContainer) return;
    try {
      const res = await chrome.runtime.sendMessage({
        type: "KOCVIP_LOCAL_DB",
        payload: { op: "getRunHistory", shopId: currentLoadedShopId },
      });
      cachedRunHistory = res?.data || [];
      if (historyCountBadge) historyCountBadge.textContent = String(cachedRunHistory.length);
      if (historyTotalBadge) historyTotalBadge.textContent = `${cachedRunHistory.length} đợt mời`;

      renderHistoryCards(filterText);
    } catch (err) {
      historyListContainer.innerHTML = `<div class="history-empty-hint">Lỗi tải lịch sử: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderHistoryCards(filterText = "") {
    if (!historyListContainer) return;
    const q = (filterText || "").trim().toLowerCase();
    const filtered = cachedRunHistory.filter(r => {
      if (!q) return true;
      return (r.title || "").toLowerCase().includes(q) ||
             (r.serverRunId || "").toLowerCase().includes(q) ||
             (r.staff || "").toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      historyListContainer.innerHTML = `<div class="history-empty-hint">${cachedRunHistory.length === 0 ? "Chưa có đợt mời nào được lưu trên máy này." : "Không tìm thấy đợt mời nào khớp với từ khóa tìm kiếm."}</div>`;
      return;
    }

    historyListContainer.innerHTML = "";
    filtered.forEach(r => {
      const card = document.createElement("div");
      card.className = "history-card";

      const timeStr = formatTimeVN(r.createdAt || r.updatedAt);
      const totalKocStr = formatNumberVN(r.totalKocs || 0);
      const sentStr = formatNumberVN(r.sentCount || 0);
      const skippedStr = formatNumberVN(r.skippedCount || 0);
      const failedStr = formatNumberVN(r.failedCount || 0);
      const waitingStr = formatNumberVN(r.waitingCount || 0);

      let statusBadge = `<span class="history-card-status-badge status-completed">Đã hoàn tất</span>`;
      if (r.status === "cancelled") {
        statusBadge = `<span class="history-card-status-badge status-cancelled">Đã hủy bỏ</span>`;
      } else if (r.status === "running" || r.status === "local_ready" || r.status === "local_pending") {
        statusBadge = `<span class="history-card-status-badge status-running">Đang chạy...</span>`;
      }

      card.innerHTML = `
        <div class="history-card-top">
          <div class="history-card-title-group">
            <div class="history-card-title">
              <span>${escapeHtml(r.title || "Chiến dịch mời KOC")}</span>
              <span class="history-koc-badge">${totalKocStr} KOC</span>
            </div>
            <div class="history-card-meta">
              <span>🕒 ${timeStr}</span>
              ${r.staff ? `<span>👤 NV: ${escapeHtml(r.staff)}</span>` : ""}
              ${r.productsCount ? `<span>📦 ${r.productsCount} sản phẩm</span>` : ""}
              ${statusBadge}
            </div>
          </div>
        </div>

        <div class="history-card-stats-row">
          <span class="history-stat-pill success">✅ <b>${sentStr}</b> Thành công</span>
          <span class="history-stat-pill warning">⚠️ <b>${skippedStr}</b> Bị trùng / Bỏ qua</span>
          ${(r.failedCount || 0) > 0 ? `<span class="history-stat-pill danger">❌ <b>${failedStr}</b> Lỗi</span>` : ""}
          ${(r.waitingCount || 0) > 0 ? `<span class="history-stat-pill info">⏳ <b>${waitingStr}</b> Chờ reset 0h</span>` : ""}
        </div>

        <div class="history-card-actions">
          <button type="button" class="secondary-button-sm btn-export-history-run btn-excel-green" title="Xuất file Excel gồm Trang 1 (Danh sách KOC) và Trang 2 (Thống kê) của riêng đợt này để đối chiếu">
            📊 Xuất Excel (2 Trang)
          </button>
          <button type="button" class="secondary-button-sm btn-view-history-run" title="Mở xem lại chi tiết và tiến trình đợt mời này">
            👁️ Xem tiến trình
          </button>
          <button type="button" class="danger-button-sm btn-delete-history-run" title="Xóa đợt mời này khỏi lịch sử">
            🗑️ Xóa
          </button>
        </div>
      `;

      // Event listeners for card buttons
      const btnExport = card.querySelector(".btn-export-history-run");
      if (btnExport) {
        btnExport.addEventListener("click", async () => {
          try {
            btnExport.disabled = true;
            btnExport.textContent = "⏳ Đang xuất...";
            const res = await chrome.runtime.sendMessage({
              type: "KOCVIP_LOCAL_DB",
              payload: { op: "getExportableKocs", serverRunId: r.serverRunId },
            });
            const kocs = res?.data || [];
            if (!kocs.length) {
              alert("Không tìm thấy dữ liệu KOC của đợt mời này!");
            } else {
              downloadKocsExcel(kocs, `kocvip_dot_moi_${r.serverRunId || 'export'}`);
            }
          } catch (err) {
            alert(`Lỗi khi xuất file: ${err.message}`);
          } finally {
            btnExport.disabled = false;
            btnExport.textContent = "📊 Xuất Excel (2 Trang)";
          }
        });
      }

      const btnView = card.querySelector(".btn-view-history-run");
      if (btnView) {
        btnView.addEventListener("click", () => {
          if (historyOverlay) historyOverlay.hidden = true;
          loadAndShowRun(r.serverRunId);
        });
      }

      const btnDelete = card.querySelector(".btn-delete-history-run");
      if (btnDelete) {
        btnDelete.addEventListener("click", async () => {
          if (confirm(`Bạn có chắc muốn xóa đợt mời "${r.title || r.serverRunId}" khỏi lịch sử máy không?`)) {
            await chrome.runtime.sendMessage({
              type: "KOCVIP_LOCAL_DB",
              payload: { op: "deleteRun", serverRunId: r.serverRunId },
            });
            loadHistoryList(inputHistorySearch?.value || "");
          }
        });
      }

      historyListContainer.appendChild(card);
    });
  }

  const openHistoryDrawer = () => {
    if (historyOverlay) {
      historyOverlay.hidden = false;
      loadHistoryList(inputHistorySearch?.value || "");
    }
  };

  const closeHistoryDrawer = () => {
    if (historyOverlay) historyOverlay.hidden = true;
  };

  if (btnOpenHistory) btnOpenHistory.addEventListener("click", openHistoryDrawer);
  if (btnOpenHistoryFooter) btnOpenHistoryFooter.addEventListener("click", openHistoryDrawer);
  if (btnCloseHistory) btnCloseHistory.addEventListener("click", closeHistoryDrawer);
  if (btnHistoryRefresh) btnHistoryRefresh.addEventListener("click", () => loadHistoryList(inputHistorySearch?.value || ""));

  if (inputHistorySearch) {
    inputHistorySearch.addEventListener("input", (e) => {
      renderHistoryCards(e.target.value);
    });
  }

  if (btnExportAllHistoryExcel) {
    btnExportAllHistoryExcel.addEventListener("click", async () => {
      try {
        btnExportAllHistoryExcel.disabled = true;
        btnExportAllHistoryExcel.textContent = "⏳ Đang xuất...";
        const res = await chrome.runtime.sendMessage({
          type: "KOCVIP_LOCAL_DB",
          payload: { op: "getExportableKocs", shopId: currentLoadedShopId },
        });
        const kocs = res?.data || [];
        if (!kocs.length) {
          alert("Chưa tìm thấy KOC nào trong lịch sử máy này.");
        } else {
          downloadKocsExcel(kocs, `kocvip_tat_ca_lich_su_koc_${currentLoadedShopId || 'all'}`);
        }
      } catch (err) {
        alert(`Lỗi khi xuất file: ${err.message}`);
      } finally {
        btnExportAllHistoryExcel.disabled = false;
        btnExportAllHistoryExcel.textContent = "📊 Xuất tất cả lịch sử";
      }
    });
  }

  // Tự động nạp số lượng lịch sử ban đầu
  loadHistoryList();

  // Khôi phục và hiển thị đợt mời (đang chạy hoặc đã xong) lên giao diện chính
  async function loadAndShowRun(runId, snapshot) {
    if (!runId) return;
    currentRunId = runId;
    executionPanel.hidden = false;
    executionPanel.removeAttribute("hidden");
    executionPanel.style.display = "flex";
    btnExecClose.hidden = false;

    // Nếu có snapshot nhanh từ minibar (hoặc từ message), hiển thị ngay lập tức
    if (snapshot) {
      if (snapshot.sent != null) mSent.textContent = formatNumberVN(snapshot.sent);
      if (snapshot.skipped != null) mSkipped.textContent = formatNumberVN(snapshot.skipped);
      if (snapshot.failed != null) mFailed.textContent = formatNumberVN(snapshot.failed);
      if (snapshot.waiting != null) mReset.textContent = formatNumberVN(snapshot.waiting);
      const total = snapshot.totalRecipients || snapshot.total || 0;
      const processed = snapshot.processed || ((snapshot.sent || 0) + (snapshot.skipped || 0) + (snapshot.failed || 0));
      const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
      execProgressBar.style.width = `${pct}%`;
      execProgressPercent.textContent = `${pct}%`;
      const isDone = snapshot.status === "completed" || snapshot.status === "cancelled" || snapshot.status === "failed" || (total > 0 && processed >= total && processed > 0);
      if (snapshot.status === "cancelled") {
        execProgressStatus.textContent = `Đã hủy bỏ (${formatNumberVN(processed)}/${formatNumberVN(total)})`;
      } else if (snapshot.status === "failed") {
        execProgressStatus.textContent = `Thất bại (${formatNumberVN(processed)}/${formatNumberVN(total)})`;
      } else if (snapshot.status === "waiting_captcha") {
        execProgressStatus.textContent = "⚠️ Đang chờ bạn giải Captcha trên màn hình...";
      } else if (isDone) {
        execProgressStatus.textContent = `Đã hoàn tất (${formatNumberVN(processed)}/${formatNumberVN(total)})`;
      } else if (processed === 0) {
        execProgressStatus.textContent = `Đang khởi tạo đợt mời (0/${formatNumberVN(total)})`;
      } else {
        execProgressStatus.textContent = `Đang xử lý (${formatNumberVN(processed)}/${formatNumberVN(total)})`;
      }
      if (isDone) {
        btnExecPause.hidden = true;
        btnExecResume.hidden = true;
        btnExecStop.hidden = true;
        btnExecClose.hidden = false;
        btnExecClose.textContent = "✕ Đóng bảng";
        stopStopwatch();
      } else {
        btnExecStop.hidden = false;
      }
    }

    try {
      const [runRes, chunkRes] = await Promise.all([
        chrome.runtime.sendMessage({ type: "KOCVIP_LOCAL_DB", payload: { op: "getRun", serverRunId: runId } }),
        chrome.runtime.sendMessage({ type: "KOCVIP_LOCAL_DB", payload: { op: "listChunks", serverRunId: runId } }),
      ]);

      const run = runRes?.data;
      const chunks = chunkRes?.data || [];

      if (!run && (!chunks || chunks.length === 0)) {
        appendExecLog("Không tìm thấy đợt mời hoặc đợt mời đã kết thúc.");
        btnExecPause.hidden = true;
        btnExecResume.hidden = true;
        btnExecStop.hidden = true;
        btnExecClose.hidden = false;
        btnExecClose.textContent = "← Quay lại thiết lập";
        execProgressStatus.textContent = "Không tìm thấy dữ liệu đợt mời";
        stopStopwatch();
        setTimeout(() => {
          closeExecutionPanel(false);
        }, 1200);
        return;
      }

      if (run) {
        runStartedAt = run.startedAt ? new Date(run.startedAt).getTime() : (run.createdAt ? new Date(run.createdAt).getTime() : Date.now());
        const isCompleted = run.status === "completed" || run.status === "cancelled" || run.status === "failed";
        if (isCompleted) {
          stopStopwatch();
          if (run.finishedAt && run.startedAt) {
            const diff = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
            if (execStopwatchBadge) execStopwatchBadge.textContent = `⏱️ ${formatStopwatch(diff)}`;
          }
          btnExecPause.hidden = true;
          btnExecResume.hidden = true;
          btnExecStop.hidden = true;
          btnExecClose.hidden = false;
          btnExecClose.textContent = "✕ Đóng bảng";
        } else if (run.status === "waiting_captcha") {
          btnExecPause.hidden = true;
          btnExecResume.hidden = true;
          btnExecStop.hidden = false;
          btnExecClose.hidden = false;
          stopStopwatch();
          execProgressStatus.textContent = "⚠️ Đang chờ bạn giải Captcha trên màn hình...";
        } else if (run.status === "paused") {
          btnExecPause.hidden = true;
          btnExecResume.hidden = false;
          btnExecStop.hidden = false;
          btnExecClose.hidden = false;
          stopStopwatch();
        } else {
          btnExecPause.hidden = false;
          btnExecResume.hidden = true;
          btnExecStop.hidden = false;
          btnExecClose.hidden = false;
          startStopwatch(runStartedAt);
        }
      }

      if (chunks.length > 0) {
        let sent = 0, skipped = 0, failed = 0, waiting = 0, total = 0;
        const reasonCounts = {};
        for (const c of chunks) {
          for (const r of (c.recipients || [])) {
            total += 1;
            if (r.status === "sent") sent += 1;
            else if (r.status === "skipped") {
              skipped += 1;
              const friendly = translateTikTokReason(r.reason);
              if (friendly) reasonCounts[friendly] = (reasonCounts[friendly] || 0) + 1;
            } else if (r.status === "failed") {
              failed += 1;
              const friendly = translateTikTokReason(r.reason);
              if (friendly) reasonCounts[friendly] = (reasonCounts[friendly] || 0) + 1;
            } else if (r.status === "waiting_daily_reset") {
              waiting += 1;
              const friendly = translateTikTokReason(r.reason);
              if (friendly) reasonCounts[friendly] = (reasonCounts[friendly] || 0) + 1;
            }
          }
        }

        mSent.textContent = formatNumberVN(sent);
        mSkipped.textContent = formatNumberVN(skipped);
        mFailed.textContent = formatNumberVN(failed);
        mReset.textContent = formatNumberVN(waiting);
        const processed = sent + skipped + failed;
        const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
        execProgressBar.style.width = `${pct}%`;
        execProgressPercent.textContent = `${pct}%`;
        const isDone = run?.status === "completed" || run?.status === "cancelled" || run?.status === "failed" || (total > 0 && processed >= total && processed > 0);
        if (run?.status === "cancelled") {
          execProgressStatus.textContent = `Đã hủy bỏ (${formatNumberVN(processed)}/${formatNumberVN(total)})`;
        } else if (run?.status === "failed") {
          execProgressStatus.textContent = `Thất bại (${formatNumberVN(processed)}/${formatNumberVN(total)})`;
        } else if (run?.status === "waiting_captcha") {
          execProgressStatus.textContent = "⚠️ Đang chờ bạn giải Captcha trên màn hình...";
        } else if (isDone) {
          execProgressStatus.textContent = `Đã hoàn tất (${formatNumberVN(processed)}/${formatNumberVN(total)})`;
        } else if (processed === 0) {
          execProgressStatus.textContent = `Đang khởi tạo đợt mời (0/${formatNumberVN(total)})`;
        } else {
          execProgressStatus.textContent = `Đang xử lý (${formatNumberVN(processed)}/${formatNumberVN(total)})`;
        }

        if (isDone) {
          btnExecPause.hidden = true;
          btnExecResume.hidden = true;
          btnExecStop.hidden = true;
          btnExecClose.hidden = false;
          btnExecClose.textContent = "✕ Đóng bảng";
        } else {
          btnExecStop.hidden = false;
        }

        if (execTopReasonsBox && execTopReasonsList) {
          const sorted = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
          if (sorted.length > 0) {
            execTopReasonsBox.hidden = false;
            execTopReasonsList.innerHTML = sorted.slice(0, 4).map(([reason, count]) => {
              return `<li><b>${formatNumberVN(count)} KOC</b> — ${escapeHtml(reason)}</li>`;
            }).join("");
          } else {
            execTopReasonsBox.hidden = true;
          }
        }
      }
    } catch (e) {
      console.warn("loadAndShowRun error:", e);
    }
  }

  // Lắng nghe tín hiệu mở đợt mời từ content script (khi ấn nút Mở to trên thanh mini) hoặc trực tiếp từ iframe
  window.addEventListener("message", (e) => {
    if (e.data?.type === "KOCVIP_OPEN_RUN" && e.data.serverRunId) {
      loadAndShowRun(e.data.serverRunId, e.data.snapshot);
      // Replay log đã cache để không mất log khi mở lại bảng điều khiển
      const cachedLogs = e.data.cachedLogs;
      if (Array.isArray(cachedLogs) && cachedLogs.length > 0) {
        // Xóa placeholder mặc định và điền log thực
        if (execLogContent) {
          execLogContent.innerHTML = "";
          // Replay theo thứ tự cũ nhất -> mới nhất (prepend nên ghi ngược)
          [...cachedLogs].reverse().forEach(entry => {
            const t = entry.ts ? new Date(entry.ts).toLocaleTimeString("vi-VN") : "??:??:??";
            const div = document.createElement("div");
            div.className = `log-line ${entry.isError ? "error" : ""}`;
            div.textContent = `[${t}] ${entry.isError ? "[LỖI] " : ""}${entry.text}`;
            execLogContent.prepend(div);
          });
        }
      }
    } else if (e.data?.type === "KOCVIP_LOG_ENTRY") {
      const { text, isError } = e.data.payload || {};
      if (text) appendExecLog(text, !!isError);
    } else if (e.data?.type === "KOCVIP_PROGRESS_UPDATE") {
      const { serverRunId, status, message: extraMsg } = e.data.payload || {};
      if (extraMsg) appendExecLog(extraMsg);
      if (serverRunId) loadAndShowRun(serverRunId, e.data.payload);
    }
  });

  // Tự động kiểm tra URL hoặc Storage khi mở giao diện
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const initialRunId = urlParams.get("runId");
    if (initialRunId) {
      loadAndShowRun(initialRunId);
    } else {
      chrome.storage.local.get(["kocvip_active_run_id", "kocvip_run_start_time"]).then(stored => {
        const rId = stored?.kocvip_active_run_id;
        if (rId) {
          loadAndShowRun(rId);
        }
      });
    }
  } catch { }

  // Lắng nghe Tiến trình & Log Real-time
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "KOCVIP_LOG_ENTRY") {
      const { text, isError } = message.payload || {};
      if (text) appendExecLog(text, !!isError);
      return false;
    }

    if (message?.type === "KOCVIP_PROGRESS_UPDATE") {
      const { serverRunId, status, completed, message: extraMsg } = message.payload || {};
      if (extraMsg) appendExecLog(extraMsg);
      if (!currentRunId && serverRunId) {
        currentRunId = serverRunId;
      }
      if (serverRunId !== currentRunId) return false;
      executionPanel.hidden = false;

      (async () => {
        try {
          const res = await chrome.runtime.sendMessage({
            type: "KOCVIP_LOCAL_DB",
            payload: { op: "listChunks", serverRunId },
          });

          const chunks = res?.data || [];
          let sent = 0, skipped = 0, failed = 0, waiting = 0, total = 0;
          const reasonCounts = {};

          for (const c of chunks) {
            for (const r of c.recipients || []) {
              total += 1;
              if (r.status === "sent") sent += 1;
              else if (r.status === "skipped") {
                skipped += 1;
                const friendly = translateTikTokReason(r.reason);
                if (friendly) reasonCounts[friendly] = (reasonCounts[friendly] || 0) + 1;
              } else if (r.status === "failed") {
                failed += 1;
                const friendly = translateTikTokReason(r.reason);
                if (friendly) reasonCounts[friendly] = (reasonCounts[friendly] || 0) + 1;
              } else if (r.status === "waiting_daily_reset") {
                waiting += 1;
                const friendly = translateTikTokReason(r.reason);
                if (friendly) reasonCounts[friendly] = (reasonCounts[friendly] || 0) + 1;
              }
            }
          }

          mSent.textContent = formatNumberVN(sent);
          mSkipped.textContent = formatNumberVN(skipped);
          mFailed.textContent = formatNumberVN(failed);
          mReset.textContent = formatNumberVN(waiting);

          const processed = sent + skipped + failed;
          const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
          execProgressBar.style.width = `${pct}%`;
          execProgressPercent.textContent = `${pct}%`;
          execProgressStatus.textContent = completed ? "Đã hoàn thành đợt mời" : `Đang xử lý (${formatNumberVN(processed)}/${formatNumberVN(total)})`;

          // Cập nhật khối Top lý do lỗi
          if (execTopReasonsBox && execTopReasonsList) {
            const sorted = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) {
              execTopReasonsBox.hidden = false;
              execTopReasonsList.innerHTML = sorted.slice(0, 4).map(([reason, count]) => {
                return `<li><b>${formatNumberVN(count)} KOC</b> — ${escapeHtml(reason)}</li>`;
              }).join("");
            } else {
              execTopReasonsBox.hidden = true;
            }
          }

          if (status === "waiting_captcha") {
            execProgressStatus.textContent = "⚠️ Đang chờ bạn giải Captcha trên màn hình...";
            btnExecPause.hidden = true;
            btnExecResume.hidden = true;
            stopStopwatch();
          } else if (status === "paused") {
            btnExecPause.hidden = true;
            btnExecResume.hidden = false;
            stopStopwatch();
          } else if (status === "running") {
            btnExecPause.hidden = false;
            btnExecResume.hidden = true;
            if (!runStopwatchTimer) startStopwatch(runStartedAt);
          }

          if (completed) {
            const isCancelled = status === "cancelled";
            if (isCancelled) {
              appendExecLog(`Đợt mời đã được hủy bỏ! Đã mời: ${formatNumberVN(sent)} • Bỏ qua/trùng: ${formatNumberVN(skipped)} • Lỗi: ${formatNumberVN(failed)}`);
              execProgressStatus.textContent = `Đã hủy bỏ đợt mời (${formatNumberVN(processed)}/${formatNumberVN(total)})`;
            } else {
              appendExecLog(`Hoàn tất đợt mời! Thành công: ${formatNumberVN(sent)} • Bỏ qua/trùng: ${formatNumberVN(skipped)} • Lỗi: ${formatNumberVN(failed)} • Chờ reset: ${formatNumberVN(waiting)}`);
            }
            btnExecPause.hidden = true;
            btnExecResume.hidden = true;
            btnExecStop.hidden = true;
            btnExecClose.hidden = false;
            btnExecClose.textContent = "✕ Đóng bảng";
            stopStopwatch();
            try {
              chrome.storage.local.remove(["kocvip_active_run_id", "kocvip_last_run_id"]);
              localStorage.removeItem("kocvip_last_run_id");
            } catch { }

            // Chỉ tự động bỏ KOC đã chọn nếu đợt mời thực sự gửi thành công KOC
            if (sent > 0) {
              kocDrawerText.value = "";
              updateKocListFromText();
              saveSettings();
            }

            // Tự động cập nhật lại danh sách & badge Lịch sử mời
            loadHistoryList();

            if (currentRunId && sent > 0) {
              getDailyQuota().then(async quota => {
                quota.recordedRuns = quota.recordedRuns || [];
                if (!quota.recordedRuns.includes(currentRunId)) {
                  quota.recordedRuns.push(currentRunId);
                  quota.sentKocCount = (quota.sentKocCount || 0) + sent;
                  const successfulGroups = chunks.filter(c => (c.recipients || []).some(r => r.status === "sent")).length;
                  quota.sentGroupCount = (quota.sentGroupCount || 0) + (successfulGroups || 1);
                  await chrome.storage.local.set({ kocvip_daily_quota: quota });
                  updateDailyLimitBadge(quota);
                }
              });
            }
          }
        } catch { }
      })();
      return false;
    }
  });

  // Window Controls
  let isMaximized = false;
  function updateMaximizeButtonState(maximized) {
    isMaximized = !!maximized;
    if (!btnMaximize) return;
    btnMaximize.title = isMaximized ? "Thu nhỏ lại kích thước chuẩn" : "Phóng to toàn màn hình";
    btnMaximize.innerHTML = isMaximized
      ? `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="10" height="10" rx="1.5"></rect><path d="M4 12H2.5A1.5 1.5 0 0 1 1 10.5V2.5A1.5 1.5 0 0 1 2.5 1h8A1.5 1.5 0 0 1 12 2.5V4"></path></svg>`
      : `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"></rect></svg>`;
  }

  if (btnMaximize) {
    btnMaximize.addEventListener("click", () => {
      const next = !isMaximized;
      updateMaximizeButtonState(next);
      window.parent.postMessage({ type: "KOCVIP_TOGGLE_MAXIMIZE", isMaximized: next }, "*");
      try {
        localStorage.setItem("kocvip_is_maximized", next ? "true" : "false");
      } catch { }
    });
  }

  try {
    if (localStorage.getItem("kocvip_is_maximized") === "true") {
      updateMaximizeButtonState(true);
    }
  } catch { }

  btnClose.addEventListener("click", () => {
    window.parent.postMessage({ type: "KOCVIP_CLOSE_OVERLAY" }, "*");
    if (window.top === window) window.close();
  });

  btnMinimize.addEventListener("click", () => {
    window.parent.postMessage({ type: "KOCVIP_MINIMIZE_OVERLAY" }, "*");
  });

  btnOpenNewTab.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "KOCVIP_OPEN_FULL_UI" });
  });

  btnCancel.addEventListener("click", () => {
    window.parent.postMessage({ type: "KOCVIP_CLOSE_OVERLAY" }, "*");
    if (window.top === window) window.close();
  });

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  }

  // Tự động nạp sản phẩm lần đầu khi mở popup (dùng cache nếu cùng shop, chỉ quét khi là shop mới)
  fetchProducts(false);
});
