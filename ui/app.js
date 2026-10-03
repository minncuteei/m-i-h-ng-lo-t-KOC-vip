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
  const btnExecStop = document.getElementById("btnExecStop");
  const btnExecClose = document.getElementById("btnExecClose");
  const btnExportDebug = document.getElementById("btnExportDebug");

  // State
  let rawProducts = [];
  let selectedProductIds = new Set();
  let kocList = []; // Array of { handle, creatorOecId }
  let activeTikTokTab = null;
  let currentRunId = null;

  // 1. Dò tìm tab TikTok Affiliate
  async function checkTikTokTab() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "KOCVIP_GET_TIKTOK_TAB" });
      if (res?.success && res.data) {
        activeTikTokTab = res.data;
        const shopName = res.data.shopName || currentShopName || "Hannah Seyo";
        if (res.data.shopName && !currentShopName) currentShopName = res.data.shopName;
        const shopId = res.data.shopId ? ` (${res.data.shopId})` : "";
        tabStatusBadge.className = "status-badge connected";
        tabStatusBadge.innerHTML = `<span class="dot"></span><span class="text">Đã nối: <b>${escapeHtml(shopName)}</b>${shopId}</span>`;
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

  // Cấu trúc đặt tên chuẩn: shop x nhatminh_ngày tháng tạo_số thứ tự (VD: Hannah Seyo x nhatminh_03/10_001)
  function formatInvitationGroupName(baseTitle, index) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dateStr = `${dd}/${mm}`;
    const idxStr = String(index).padStart(3, "0");
    let clean = String(baseTitle || generateDefaultTitle()).trim();
    clean = clean.replace(/_\d{2}\/\d{2}_\d+$/i, "").replace(/_N\d+$/i, "").replace(/_TEST$/i, "").trim();
    return `${clean}_${dateStr}_${idxStr}`;
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

  // 3. Quét & Sắp xếp Sản phẩm (YÊU CẦU CỐT LÕI: LUÔN LUÔN PHÂN LOẠI THEO LƯỢT BÁN TỪ CAO XUỐNG THẤP)
  async function fetchProducts() {
    btnScanProducts.disabled = true;
    btnScanProducts.textContent = "⏳ Đang quét...";
    statusQuickText.textContent = "Đang quét danh mục sản phẩm từ TikTok Shop...";

    try {
      const res = await chrome.runtime.sendMessage({
        type: "KOCVIP_REFRESH_PRODUCTS",
        payload: { page: 1, pageSize: 100 },
      });

      if (!res?.success) throw new Error(res?.error || "Không thể nạp sản phẩm");
      const list = res.data?.products || [];

      // Nhận diện và cập nhật tên shop
      if (res.data?.shopName) {
        currentShopName = res.data.shopName;
        if (!inputTitle.value || inputTitle.value.startsWith("STONKAIKOC_VIP") || inputTitle.value.includes("x nhatminh")) {
          inputTitle.value = generateDefaultTitle(currentShopName);
          saveSettings();
        }
      }

      if (!list.length) {
        productListContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--warning);">Shop chưa có sản phẩm nào đang mở bán.</div>`;
        productSummaryBar.innerHTML = `<span>0 sản phẩm</span>`;
        statusQuickText.textContent = "Shop không có sản phẩm đang mở bán.";
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
      statusQuickText.textContent = `Đã nạp ${rawProducts.length} sản phẩm thành công.`;
    } catch (err) {
      statusQuickText.textContent = `Lỗi quét sản phẩm: ${err.message}`;
      productListContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--danger);">Lỗi tải sản phẩm: ${err.message}</div>`;
    } finally {
      btnScanProducts.disabled = false;
      btnScanProducts.textContent = "🔄 Quét từ Shop";
    }
  }

  btnScanProducts.addEventListener("click", fetchProducts);

  // Bộ lọc & Sắp xếp danh mục sản phẩm chuẩn xác theo dữ liệu TikTok
  function getSortedAndFilteredProducts() {
    const query = inputProductSearch.value.trim().toLowerCase();
    const sortMode = selectProductSort ? selectProductSort.value : "sales:desc";

    let items = rawProducts.filter(p => {
      if (!query) return true;
      const titleMatch = (p.title || "").toLowerCase().includes(query);
      const idMatch = (p.productId || "").includes(query);
      const skuMatch = (p.skus || []).some(s => String(s).toLowerCase().includes(query));
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

  inputProductSearch.addEventListener("input", renderProducts);
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

  // Thêm Product ID thủ công
  btnAddManualPid.addEventListener("click", () => {
    const pid = inputManualPid.value.trim();
    if (!/^\d{10,}$/.test(pid)) {
      alert("Product ID phải là dãy số gồm ít nhất 10 chữ số.");
      return;
    }
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
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const csvText = XLSX.utils.sheet_to_csv(worksheet);
          kocDrawerText.value = csvText;
          updateKocListFromText();
          normalizeDrawerText();
          saveSettings();
        } catch (err) {
          alert("Lỗi đọc file Excel: " + err.message);
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
        } catch {}
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
    if (!activeTikTokTab) {
      alert("Chưa kết nối tab TikTok Affiliate. Vui lòng mở https://affiliate.tiktok.com và đăng nhập shop.");
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

    const testRun = chkTestRun.checked;
    const testCount = Math.max(1, Number(inputTestRunCount.value || 5));
    const targetRecipients = testRun ? kocList.slice(0, testCount) : kocList;

    const baseTitle = (inputTitle.value.trim() || generateDefaultTitle()).replace(/_N\d+$/i, "");
    const campaignTitle = `${baseTitle}_N1`;
    const confirmMsg = `XÁC NHẬN GỬI THẬT:\n\n• Số KOC mời: ${targetRecipients.length} KOC ${testRun ? '(Chế độ chạy thử)' : ''}\n• Số sản phẩm gắn: ${selectedProducts.length} SP\n• Hoa hồng: Thường ${inputCommission.value}%, Ads ${inputAdsCommission.value}%\n• Tên đợt: ${baseTitle}\n• Thời hạn: ${inputExpiresAt.value || '1 tuần'}\n\nBắt đầu ngay?`;
    if (!confirm(confirmMsg)) return;

    // Hiển thị Execution Panel
    executionPanel.hidden = false;
    mSent.textContent = "0";
    mSkipped.textContent = "0";
    mFailed.textContent = "0";
    mReset.textContent = "0";
    execProgressBar.style.width = "0%";
    execProgressPercent.textContent = "0%";
    execProgressStatus.textContent = "Đang khởi tạo đợt mời...";
    execLogContent.innerHTML = "";
    appendExecLog(`Bắt đầu đợt mời cho ${targetRecipients.length} KOC...`);

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    currentRunId = runId;

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
    const totalChunks = Math.ceil(allRecipients.length / chunkSize);
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

    try {
      // 1. Lưu manifest và các chunk vào IndexedDB trực tiếp để Content Script luôn sẵn sàng đọc
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

      // 2. Chuyển giao tiến trình sang Content Script
      const res = await chrome.runtime.sendMessage({
        type: "KOCVIP_START_INVITE",
        payload: { manifest },
      });

      if (!res?.success) throw new Error(res?.error || "Không thể khởi động đợt mời");
      appendExecLog("Đợt mời đã được chuyển giao cho Content Script thực thi an toàn.");
    } catch (err) {
      appendExecLog(`Lỗi khởi động: ${err.message}`, true);
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
    appendExecLog("Đã gửi lệnh tạm dừng.");
  });

  btnExecResume.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "KOCVIP_INVITE_CONTROL", payload: { action: "resume", serverRunId: currentRunId } });
    btnExecPause.hidden = false;
    btnExecResume.hidden = true;
    appendExecLog("Đã gửi lệnh tiếp tục.");
  });

  btnExecStop.addEventListener("click", () => {
    if (!confirm("Bạn có chắc chắn muốn hủy bỏ đợt mời này không?")) return;
    chrome.runtime.sendMessage({ type: "KOCVIP_INVITE_CONTROL", payload: { action: "stop", serverRunId: currentRunId } });
    appendExecLog("Đã gửi lệnh hủy đợt mời.");
    btnExecClose.hidden = false;
  });

  btnExecClose.addEventListener("click", () => {
    executionPanel.hidden = true;
  });

  // Xuất file Debug JSON
  if (btnExportDebug) {
    btnExportDebug.addEventListener("click", async () => {
      try {
        const runRes = await chrome.runtime.sendMessage({
          type: "KOCVIP_LOCAL_DB",
          payload: { op: "getRun", serverRunId: currentRunId },
        });
        const chunkRes = await chrome.runtime.sendMessage({
          type: "KOCVIP_LOCAL_DB",
          payload: { op: "listChunks", serverRunId: currentRunId },
        });

        const debugData = {
          runId: currentRunId,
          exportedAt: new Date().toISOString(),
          shopTab: activeTikTokTab,
          run: runRes?.data || null,
          chunks: chunkRes?.data || [],
          logs: Array.from(execLogContent.children).map(el => el.textContent),
        };

        const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kocvip_debug_${currentRunId || 'current'}.json`;
        a.click();
        URL.revokeObjectURL(url);
        appendExecLog("Đã xuất file debug JSON thành công.");
      } catch (err) {
        alert(`Không thể xuất debug: ${err.message}`);
      }
    });
  }

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
      if (serverRunId !== currentRunId) return false;

      (async () => {
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

          mSent.textContent = formatNumberVN(sent);
          mSkipped.textContent = formatNumberVN(skipped);
          mFailed.textContent = formatNumberVN(failed);
          mReset.textContent = formatNumberVN(waiting);

          const processed = sent + skipped + failed;
          const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
          execProgressBar.style.width = `${pct}%`;
          execProgressPercent.textContent = `${pct}%`;
          execProgressStatus.textContent = completed ? "Đã hoàn thành đợt mời" : `Đang xử lý (${formatNumberVN(processed)}/${formatNumberVN(total)})`;

          if (completed) {
            appendExecLog(`Hoàn tất đợt mời! Thành công: ${formatNumberVN(sent)} • Bỏ qua/trùng: ${formatNumberVN(skipped)} • Lỗi: ${formatNumberVN(failed)} • Chờ reset: ${formatNumberVN(waiting)}`);
            btnExecPause.hidden = true;
            btnExecResume.hidden = true;
            btnExecClose.hidden = false;

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
        } catch {}
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
      } catch {}
    });
  }

  try {
    if (localStorage.getItem("kocvip_is_maximized") === "true") {
      updateMaximizeButtonState(true);
    }
  } catch {}

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

  // Tự động quét sản phẩm lần đầu khi mở popup
  fetchProducts();
});
