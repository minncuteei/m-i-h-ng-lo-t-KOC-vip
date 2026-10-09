/**
 * KOC VIP - Background Service Worker.
 * Quản lý điều phối giao tiếp giữa Side Panel, Content Scripts và IndexedDB Cục bộ.
 * Không gọi bất kỳ máy chủ bên thứ ba nào.
 */
import { handleLocalInviteDbOperation, saveCatalogProducts, getCatalogProducts } from './local-invite-db.js';

// Bộ nhớ đệm danh mục sản phẩm theo shopId
const catalogProductsCache = new Map();

async function ensureScriptsInTab(tabId) {
  if (!tabId) return false;

  // Luôn đảm bảo page-executor.js chạy trong MAIN world ở frame 0
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: ["src/content/page-executor.js"],
      world: "MAIN",
    });
  } catch (e) {
    console.warn("[KOC VIP] executeScript page-executor error:", e);
  }

  // Luôn đảm bảo content scripts chạy trong ISOLATED world ở frame 0
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: ["src/content/captcha-detector.js", "src/content/local-invite-executor.js"],
    });
  } catch (e) {
    console.warn("[KOC VIP] executeScript content scripts error:", e);
  }

  await new Promise(r => setTimeout(r, 100));
  return true;
}

async function resolveTikTokTabId(sender) {
  if (sender?.tab?.id) {
    try {
      const tab = await chrome.tabs.get(sender.tab.id);
      if (tab?.url && /tiktok\.com|tiktokglobalshop\.com/i.test(tab.url)) {
        return tab.id;
      }
    } catch {}
  }
  const tab = await findTikTokTab();
  return tab?.id || null;
}

async function sendToMainFrame(tabId, message, timeoutMs = 60000) {
  await ensureScriptsInTab(tabId);
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error(`Hết thời gian chờ phản hồi từ tab TikTok (${message.type || 'message'}) sau ${Math.round(timeoutMs / 1000)}s`));
      }
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, (response) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function injectAllOpenTikTokTabs() {
  try {
    const tabs = await chrome.tabs.query({
      url: [
        "https://affiliate.tiktok.com/*",
        "https://affiliate-us.tiktok.com/*",
        "https://affiliate.tiktokglobalshop.com/*",
        "https://affiliate.tiktokshopglobalselling.com/*",
        "https://seller-vn.tiktok.com/*",
        "https://seller.tiktok.com/*",
        "https://seller-us.tiktok.com/*",
      ]
    });
    for (const tab of tabs) {
      if (tab.id && !tab.discarded) {
        await ensureScriptsInTab(tab.id).catch(() => {});
      }
    }
  } catch {}
}

// Tự động tiêm script vào mọi tab TikTok đang mở khi service worker khởi động
injectAllOpenTikTokTabs();
if (chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    injectAllOpenTikTokTabs();
  });
}

// Mở UI rộng kiểu Modal in-page hoặc Tab mới (thay thế Side Panel hẹp)
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (tab?.id && tab.url && (tab.url.includes("affiliate.tiktok.com") || tab.url.includes("seller-vn.tiktok.com"))) {
      await ensureScriptsInTab(tab.id);
      const resp = await chrome.tabs.sendMessage(tab.id, { type: "KOCVIP_TOGGLE_MODAL" }, { frameId: 0 }).catch(() => null);
      if (resp?.success) return;
    }
  } catch {}
  chrome.tabs.create({ url: chrome.runtime.getURL("ui/index.html") });
});

async function findTikTokTab() {
  const tabs = await chrome.tabs.query({
    url: [
      "https://affiliate.tiktok.com/*",
      "https://affiliate-us.tiktok.com/*",
      "https://affiliate.tiktokglobalshop.com/*",
      "https://affiliate.tiktokshopglobalselling.com/*",
      "https://seller-vn.tiktok.com/*",
      "https://seller.tiktok.com/*",
      "https://seller-us.tiktok.com/*",
    ]
  });
  const sorted = tabs.filter(t => !t.discarded).sort((a, b) => (Number(!!b.active) - Number(!!a.active)));
  return sorted[0] || null;
}

async function findAffiliateTab() {
  const tabs = await chrome.tabs.query({
    url: [
      "https://affiliate.tiktok.com/*",
      "https://affiliate-us.tiktok.com/*",
      "https://affiliate.tiktokglobalshop.com/*",
      "https://affiliate.tiktokshopglobalselling.com/*",
    ]
  });
  const sorted = tabs.filter(t => !t.discarded).sort((a, b) => (Number(!!b.active) - Number(!!a.active)));
  return sorted[0] || null;
}

async function resolveAffiliateTabId(sender, shopId = "", region = "VN") {
  if (sender?.tab?.id) {
    try {
      const tab = await chrome.tabs.get(sender.tab.id);
      if (tab?.url && /affiliate(-us)?\.tiktok/i.test(tab.url)) {
        return tab.id;
      }
    } catch {}
  }

  const existing = await findAffiliateTab();
  if (existing?.id) return existing.id;

  // Nếu người dùng đang mở tab Seller Center (seller-vn.tiktok.com):
  // Tự động mở tab Affiliate tương ứng với Shop trong chế độ nền để gửi lời mời
  const targetRegion = region || "VN";
  const targetShopId = String(shopId || "").trim();
  const affUrl = (targetShopId && targetShopId !== "default")
    ? `https://affiliate.tiktok.com/affiliate/collaboration/target-invitation?shop_region=${targetRegion}&shop_id=${targetShopId}`
    : `https://affiliate.tiktok.com/affiliate/collaboration/open-collaboration?shop_region=${targetRegion}`;

  console.log("[KOC VIP] Tự động mở tab TikTok Affiliate để gửi lời mời:", affUrl);
  const newTab = await chrome.tabs.create({ url: affUrl, active: false });

  await new Promise(resolve => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; chrome.tabs.onUpdated.removeListener(listener); resolve(); }
    }, 15000);

    function listener(tabId, info) {
      if (tabId === newTab.id && info.status === "complete") {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });

  await ensureScriptsInTab(newTab.id);
  await new Promise(r => setTimeout(r, 1200));
  return newTab.id;
}

// Quản lý thông báo Desktop hệ thống khi TikTok yêu cầu giải Captcha
let activeCaptchaNotificationId = null;

function showCaptchaDesktopNotification(msg) {
  const notifId = "kocvip_captcha_" + Date.now();
  activeCaptchaNotificationId = notifId;
  const messageText = msg || "TikTok đang yêu cầu giải Captcha trên màn hình. Hãy bấm vào đây để mở tab TikTok và giải ngay!";

  try {
    chrome.notifications.create(notifId, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "⚠️ TikTok Yêu Cầu Giải Captcha!",
      message: messageText,
      priority: 2,
      requireInteraction: true // Giữ thông báo trên màn hình macOS / Windows cho đến khi bấm
    });
  } catch (err) {
    console.warn("[KOC VIP] Lỗi gửi thông báo Desktop:", err);
  }
}

function clearCaptchaDesktopNotification() {
  if (activeCaptchaNotificationId) {
    try {
      chrome.notifications.clear(activeCaptchaNotificationId);
    } catch {}
    activeCaptchaNotificationId = null;
  }
}

// Bấm vào thông báo Desktop thì tự động focus chuyển sang tab TikTok
chrome.notifications.onClicked.addListener(async (notifId) => {
  if (notifId && notifId.startsWith("kocvip_captcha_")) {
    try {
      const tab = await findTikTokTab();
      if (tab?.id) {
        await chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
      }
    } catch {}
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, payload = {} } = message || {};

  // Gửi thông báo Desktop khi phát hiện Captcha
  if (type === "KOCVIP_NOTIFY_CAPTCHA") {
    showCaptchaDesktopNotification(payload?.message);
    sendResponse({ success: true });
    return true;
  }

  // Tự động quản lý thông báo Desktop qua tiến trình
  if (type === "KOCVIP_PROGRESS_UPDATE") {
    if (payload?.status === "waiting_captcha") {
      showCaptchaDesktopNotification(payload?.message);
    } else if (payload?.status === "captcha_resolved" || payload?.status === "running" || payload?.completed) {
      clearCaptchaDesktopNotification();
    }
  }

  // Mở tab UI toàn màn hình khi cần
  if (type === "KOCVIP_OPEN_FULL_UI") {
    chrome.tabs.create({ url: chrome.runtime.getURL("ui/index.html") });
    sendResponse({ success: true });
    return true;
  }

  // 1. Thao tác Cơ sở dữ liệu IndexedDB Cục bộ
  if (type === "KOCVIP_LOCAL_DB") {
    handleLocalInviteDbOperation(payload)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: String(err?.message || err) }));
    return true;
  }

  function sanitizeShopName(raw) {
    let name = String(raw || "").trim();
    name = name.replace(/Chính\s*thức/gi, "")
               .replace(/CHÍNHChính/gi, "")
               .replace(/Chính/gi, "")
               .replace(/Official/gi, "")
               .replace(/Mall/gi, "")
               .replace(/Vietnam\s*\(([^)]+)\)/i, "$1")
               .replace(/VN\s*\(([^)]+)\)/i, "$1")
               .replace(/\s+/g, " ")
               .trim();
    if (!name || name.length < 2 || name.toLowerCase().includes("chạm chính") || name.toLowerCase() === "chạm") return "Sốp";
    return name;
  }

  // 2. Tìm kiếm tab TikTok đang mở
  if (type === "KOCVIP_GET_TIKTOK_TAB") {
    findTikTokTab()
      .then(async tab => {
        if (!tab) return sendResponse({ success: true, data: null });
        let shopId = "";
        let shopRegion = "VN";
        try {
          const u = new URL(tab.url);
          shopId = u.searchParams.get("shop_id") || u.searchParams.get("shopId") || u.searchParams.get("oec_seller_id") || "";
          shopRegion = u.searchParams.get("shop_region") || u.searchParams.get("region") || "VN";
        } catch {}
        let shopName = "";
        try {
          const domRes = await chrome.tabs.sendMessage(tab.id, { type: "KOCVIP_GET_DOM_SHOP_NAME" }).catch(() => null);
          if (domRes?.shopName) {
            shopName = sanitizeShopName(domRes.shopName);
            await chrome.storage.local.set({ kocvip_shop_name: shopName });
          }
        } catch {}

        if (!shopName) {
          const saved = await chrome.storage.local.get(["kocvip_shop_name"]);
          shopName = sanitizeShopName(saved?.kocvip_shop_name || "Sốp");
        }

        sendResponse({ success: true, data: { id: tab.id, url: tab.url, title: tab.title, shopId, shopRegion, shopName } });
      })
      .catch(err => sendResponse({ success: false, error: String(err?.message || err) }));
    return true;
  }

  // 3. Quét danh mục sản phẩm từ tab TikTok Shop (LUÔN PHÂN LOẠI THEO LƯỢT BÁN TỪ CAO XUỐNG THẤP)
  if (type === "KOCVIP_REFRESH_PRODUCTS") {
    (async () => {
      const targetTabId = await resolveTikTokTabId(_sender);
      if (!targetTabId) {
        throw new Error("Chưa mở tab TikTok Shop Affiliate (affiliate.tiktok.com). Hãy mở tab TikTok và đăng nhập.");
      }

      let tabShopId = "";
      try {
        const tab = await chrome.tabs.get(targetTabId);
        if (tab?.url) {
          const u = new URL(tab.url);
          tabShopId = u.searchParams.get("shop_id") || u.searchParams.get("shopId") || u.searchParams.get("oec_seller_id") || "";
        }
      } catch {}

      const requestedPage = Number(payload.page || 1);
      const pageSize = Number(payload.pageSize || 50);
      const keyword = String(payload.keyword || "").trim();
      const forceRefresh = Boolean(payload.force);
      const shopId = String(payload.shopId || tabShopId || "default").trim();

      // NẾU KHÔNG YÊU CẦU QUÉT LẠI (force !== true) VÀ ĐÃ CÓ BỘ NHỚ ĐỆM CỦA SHOP NÀY:
      if (!forceRefresh && !keyword) {
        // 1. Kiểm tra memory cache
        if (catalogProductsCache.has(shopId)) {
          const cachedEntry = catalogProductsCache.get(shopId);
          if (cachedEntry && Array.isArray(cachedEntry.products) && cachedEntry.products.length > 0) {
            console.log(`[KOC VIP] Trả về ${cachedEntry.products.length} sản phẩm từ Memory Cache cho shop: ${shopId}`);
            return {
              products: cachedEntry.products,
              total: cachedEntry.total || cachedEntry.products.length,
              page: 1,
              pageSize,
              shopName: cachedEntry.shopName || "",
              fromCache: true,
              shopId,
            };
          }
        }

        // 2. Kiểm tra IndexedDB Cache
        const dbProducts = await getCatalogProducts(shopId).catch(() => []);
        if (Array.isArray(dbProducts) && dbProducts.length > 0) {
          console.log(`[KOC VIP] Trả về ${dbProducts.length} sản phẩm từ IndexedDB Cache cho shop: ${shopId}`);
          const saved = await chrome.storage.local.get(["kocvip_shop_name"]);
          const shopName = saved?.kocvip_shop_name || "";
          catalogProductsCache.set(shopId, {
            products: dbProducts,
            total: dbProducts.length,
            shopName,
            cachedAt: Date.now(),
          });
          return {
            products: dbProducts,
            total: dbProducts.length,
            page: 1,
            pageSize,
            shopName,
            fromCache: true,
            shopId,
          };
        }
      }

      // Quét các trang sản phẩm (tự động gom nhiều trang để lấy trọn vẹn danh mục)
      let allRawProducts = [];
      let currentPage = requestedPage;
      let totalExpected = 0;
      let hasMore = true;
      let detectedShopName = "";
      const maxPages = keyword ? 5 : 20; // Hỗ trợ quét toàn bộ shop lớn lên tới 20 trang (1.000 sản phẩm)

      while (hasMore && currentPage <= maxPages) {
        const res = await sendToMainFrame(targetTabId, {
          type: "KOCVIP_EXECUTE_TIKTOK_PRODUCT_LIST",
          payload: { page: currentPage, page_number: currentPage, cur_page: currentPage, pageSize, keyword },
        });

        if (!res?.success) {
          throw new Error(res?.error || `Không nhận được phản hồi từ TikTok trang ${currentPage}`);
        }

        const rawResult = res.result || {};
        const rawBody = rawResult.body || rawResult;
        if (rawBody.code !== undefined && Number(rawBody.code) !== 0) {
          throw new Error(`TikTok báo lỗi (Mã ${rawBody.code}): ${rawBody.message || "Lỗi nạp sản phẩm"}`);
        }

        const data = (rawBody.data && typeof rawBody.data === "object") ? rawBody.data : rawBody;
        const list = data.products || data.product_list || data.records || data.list || [];
        
        // Nhận diện tổng sản phẩm từ TikTok Seller API (TikTok trả về total_product_count)
        const detectedTotal = Number(
          data.total_product_count ??
          data.total ??
          data.total_count ??
          data.total_cnt ??
          0
        );
        if (detectedTotal > 0) {
          totalExpected = Math.max(totalExpected, detectedTotal);
        }

        // Tự động nhận diện tên thương hiệu/shop từ thông tin sản phẩm
        if (!detectedShopName && Array.isArray(list) && list.length > 0) {
          for (const item of list) {
            if (item.brand?.name) {
              detectedShopName = String(item.brand.name).replace(/-/g, " ").trim();
              break;
            }
          }
        }

        if (Array.isArray(list) && list.length > 0) {
          allRawProducts.push(...list);
        }

        // Điều kiện dừng: không có list, list rỗng, trang trả về ít hơn pageSize, hoặc đã lấy đủ totalExpected (>0)
        if (!Array.isArray(list) || list.length === 0 || list.length < pageSize || (totalExpected > 0 && allRawProducts.length >= totalExpected)) {
          hasMore = false;
        } else {
          currentPage += 1;
        }
      }

      // Khử trùng theo product_id
      const seenIds = new Set();
      const uniqueRaw = [];
      for (const p of allRawProducts) {
        const id = String(p.id || p.product_id || p.productId || p.item_id || "").trim();
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          uniqueRaw.push(p);
        }
      }

      const products = uniqueRaw.map(p => {
        const perf = p.product_performance || {};
        const salesInfo = p.product_sales || {};

        // Đơn hàng 28 ngày qua (Hiệu suất bán)
        const orders28d = Number(perf.last_28days_order || 0);

        // Doanh thu GMV 28 ngày qua (xử lý chuỗi '1.910.449.163₫' -> 1910449163)
        const gmvRaw = perf.last_28days_gmv || p.revenue || p.gmv || p.product_gmv || 0;
        const gmv28d = typeof gmvRaw === "string" ? Number(gmvRaw.replace(/[^\d]/g, "") || 0) : Number(gmvRaw || 0);

        // Tổng lượt bán tích lũy toàn thời gian
        const allTimeSales = Number(
          salesInfo.sales ??
          salesInfo.total_sales ??
          p.sold_count ??
          p.sales ??
          p.sale_count ??
          p.sold_num ??
          p.volume ??
          p.history_sold_count ??
          p.month_sold_count ??
          p.order_count ??
          p.orders ??
          p.metrics?.sold_count ??
          p.metrics?.sales ??
          p.metrics?.product_units_sold ??
          p.stat?.sold_count ??
          0
        );

        // Lượt bán hiển thị và ưu tiên sắp xếp: kết hợp cả 28 ngày và tổng bán
        const sales = orders28d > 0 ? orders28d : allTimeSales;
        const revenue = gmv28d > 0 ? gmv28d : (sales * 50000); // dự toán doanh thu nếu chỉ có lượt bán

        // Giá bán (xử lý cả dạng chuỗi hoặc dạng số)
        const rawPrice = (
          p.price_range?.min_sale_price ??
          p.price_range?.min_promotion_price ??
          p.skus?.[0]?.base_price?.sale_price ??
          p.sale_price?.min_price ??
          p.price ??
          p.sale_price ??
          p.price_range?.min_price ??
          0
        );
        const price = typeof rawPrice === "string" ? Number(rawPrice.replace(/[^\d]/g, "") || 0) : Number(rawPrice || 0);

        // Tồn kho khả dụng thực tế
        const stock = Number(
          p.total_available_stock ??
          p.total_available_spot_stock ??
          p.quantity?.total_available_stock ??
          p.quantity?.seller_quantity?.total_quantity ??
          p.stock_infos?.[0]?.available_stock ??
          p.stock ??
          p.available_stock ??
          p.stock_info?.spu_stock ??
          p.stock_info?.total_stock ??
          0
        );

        // Trạng thái đang mở bán (Active / Online)
        const isOnline = Boolean(
          p.is_online_version === true ||
          p.product_status === 4 ||
          p.product_status_view?.product_main_status === 1 ||
          p.sale_platform_products?.[0]?.product_status === 4 ||
          (p.product_status === undefined && stock > 0)
        );

        const commissionRate = Number(
          p.commission_rate ??
          p.target_commission ??
          10
        );

        const skuList = Array.isArray(p.skus) ? p.skus : Array.isArray(p.skuList) ? p.skuList : Array.isArray(p.sku_list) ? p.sku_list : [];
        const skus = skuList.map(s => typeof s === "string" ? s : (s.sellerSku || s.seller_sku || s.skuId || s.sku_id || "")).filter(Boolean);

        const imageUrl = (
          p.image?.url_list?.[0] ||
          p.image?.thumb_url_list?.[0] ||
          p.cover?.url_list?.[0] ||
          p.image_url ||
          p.imageUrl ||
          p.image ||
          ""
        );

        return {
          productId: String(p.id || p.product_id || p.productId || p.item_id || ""),
          title: p.title || p.name || p.product_name || "Sản phẩm",
          imageUrl,
          price,
          stock,
          sales,
          orders28d,
          allTimeSales,
          revenue,
          gmv28d,
          isOnline,
          commissionRate,
          skus,
        };
      }).filter(p => {
        if (!p.productId) return false;
        // YÊU CẦU: CHỈ NHẬN CÁC SẢN PHẨM ĐANG HOẠT ĐỘNG TRÊN KỆ, LOẠI BỎ HẲN CÁC SẢN PHẨM KHÔNG HOẠT ĐỘNG HOẶC HẾT HÀNG KHO = 0
        if (p.isOnline === false) return false;
        if (p.stock <= 0) return false;
        return true;
      });

      // YÊU CẦU CỐT LÕI: LUÔN LUÔN PHÂN LOẠI THEO LƯỢT BÁN TỪ CAO XUỐNG THẤP
      products.sort((a, b) => {
        const salesDiff = (b.sales || 0) - (a.sales || 0);
        if (salesDiff !== 0) return salesDiff;
        const revDiff = (b.revenue || 0) - (a.revenue || 0);
        if (revDiff !== 0) return revDiff;
        return (b.stock || 0) - (a.stock || 0);
      });

      await saveCatalogProducts(shopId, products);
      catalogProductsCache.set(shopId, {
        products,
        total: products.length,
        shopName: detectedShopName,
        cachedAt: Date.now(),
      });
      if (detectedShopName) {
        await chrome.storage.local.set({ kocvip_shop_name: detectedShopName, kocvip_last_shop_id: shopId });
      }
      return { products, total: products.length, page: 1, pageSize, shopName: detectedShopName, fromCache: false, shopId };
    })()
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: String(err?.message || err) }));
    return true;
  }

  // 3b. Tra cứu Username sang creator_oec_id qua import_check
  if (type === "KOCVIP_LOOKUP_HANDLES") {
    (async () => {
      const targetTabId = await resolveAffiliateTabId(_sender);
      if (!targetTabId) throw new Error("Chưa mở tab TikTok Shop Affiliate (affiliate.tiktok.com)");

      const rawHandles = Array.isArray(payload.handles) ? payload.handles : [];
      const handles = rawHandles.map(h => String(h || "").replace(/^@/, "").trim()).filter(Boolean);
      if (!handles.length) return { verified: [], notFound: [], total: 0 };

      const verified = [];
      const notFound = [];
      const batchSize = 50;

      for (let i = 0; i < handles.length; i += batchSize) {
        const chunk = handles.slice(i, i + batchSize);
        const res = await sendToMainFrame(targetTabId, {
          type: "KOCVIP_IMPORT_CHECK_HANDLES",
          payload: { handleNames: chunk },
        });

        if (!res?.success) throw new Error(res?.error || `Lỗi tra cứu lô KOC ${i + 1} - ${i + chunk.length}`);
        const rawResult = res.result || {};
        const rawBody = rawResult.body || rawResult;
        const root = rawBody?.data || rawBody;
        const creators = root.creators || [];
        const foundMap = new Map();

        for (const item of creators) {
          const base = item.base || item.creator_base || item || {};
          const h = String(base.handle_name || item.handle_name || "").toLowerCase().trim();
          const oec = String(base.oec_id || base.creator_oec_id || item.oec_id || item.creator_oec_id || "").trim();
          if (h && /^\d{8,}$/.test(oec)) {
            foundMap.set(h, {
              handle: h,
              creatorOecId: oec,
              nickName: base.nick_name || item.nick_name || h,
              avatar: base.avatar?.thumb_url_list?.[0] || "",
            });
          }
        }

        for (const h of chunk) {
          const lower = h.toLowerCase();
          if (foundMap.has(lower)) {
            verified.push(foundMap.get(lower));
          } else {
            notFound.push(h);
          }
        }

        if (i + batchSize < handles.length) {
          await new Promise(r => setTimeout(r, 800 + Math.floor(Math.random() * 700)));
        }
      }

      return { verified, notFound, total: handles.length };
    })()
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: String(err?.message || err) }));
    return true;
  }

  // 4. Bắt đầu đợt mời KOC (Dispatch sang Content Script trên tab TikTok Affiliate)
  if (type === "KOCVIP_START_INVITE") {
    (async () => {
      const shopId = payload.manifest?.shopId || "";
      const region = payload.manifest?.region || "VN";
      const targetTabId = await resolveAffiliateTabId(_sender, shopId, region);
      if (!targetTabId) throw new Error("Không thể kết nối tab TikTok Affiliate. Hãy mở tab https://affiliate.tiktok.com và đăng nhập shop.");

      if (payload.manifest?.draft?.shareAfterInvite) {
        chrome.tabs.create({
          url: `https://affiliate.tiktok.com/connection/im?shop_region=${region}&shop_id=${shopId}`,
          active: false,
        }).catch(() => {});
      }

      const res = await sendToMainFrame(targetTabId, {
        type: "KOCVIP_LOCAL_INVITE_START",
        payload: { manifest: payload.manifest },
      });
      return res;
    })()
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: String(err?.message || err) }));
    return true;
  }

  // 5. Điều khiển tạm dừng / tiếp tục / hủy đợt mời
  if (type === "KOCVIP_INVITE_CONTROL") {
    if (payload?.action === "stop") {
      try {
        chrome.storage.local.remove(["kocvip_active_run_id", "kocvip_last_run_id", "kocvip_run_start_time"]);
      } catch {}
    }
    (async () => {
      const actionType = payload.action === "pause"
        ? "KOCVIP_LOCAL_INVITE_PAUSE"
        : payload.action === "resume"
          ? "KOCVIP_LOCAL_INVITE_RESUME"
          : "KOCVIP_LOCAL_INVITE_STOP";

      // Gửi lệnh điều khiển tới TẤT CẢ các tab TikTok đang mở để dừng tức thì mọi tiến trình chạy ngầm
      const tabs = await chrome.tabs.query({
        url: [
          "https://affiliate.tiktok.com/*",
          "https://affiliate-us.tiktok.com/*",
          "https://affiliate.tiktokglobalshop.com/*",
          "https://affiliate.tiktokshopglobalselling.com/*",
          "https://seller-vn.tiktok.com/*",
          "https://seller.tiktok.com/*",
          "https://seller-us.tiktok.com/*",
        ]
      });
      for (const t of tabs) {
        if (t.id && !t.discarded) {
          chrome.tabs.sendMessage(t.id, {
            type: actionType,
            payload: { serverRunId: payload.serverRunId },
          }, { frameId: 0 }).catch(() => {});
        }
      }
      return { success: true, data: { stopped: true } };
    })()
      .then(data => sendResponse({ success: true, data }))
      .catch(() => sendResponse({ success: true, data: { stopped: true } }));
    return true;
  }
});
