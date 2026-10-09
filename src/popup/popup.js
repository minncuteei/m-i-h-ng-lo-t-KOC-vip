document.addEventListener("DOMContentLoaded", async () => {
  const statusDot = document.getElementById("statusDot");
  const statusTitle = document.getElementById("statusTitle");
  const statusSub = document.getElementById("statusSub");
  const btnOpenModal = document.getElementById("btnOpenModal");
  const btnOpenAffiliate = document.getElementById("btnOpenAffiliate");

  let activeTikTokTab = null;

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

  async function checkTikTokTab() {
    try {
      const tabs = await chrome.tabs.query({
        url: [
          "https://affiliate.tiktok.com/*",
          "https://affiliate-us.tiktok.com/*",
          "https://affiliate.tiktokglobalshop.com/*",
          "https://affiliate.tiktokshopglobalselling.com/*",
        ]
      });

      const sorted = tabs.filter(t => !t.discarded).sort((a, b) => (Number(!!b.active) - Number(!!a.active)));
      activeTikTokTab = sorted[0] || null;

      if (activeTikTokTab) {
        statusDot.className = "status-dot connected";
        
        let shopName = "";
        let shopId = "";
        try {
          const urlObj = new URL(activeTikTokTab.url);
          shopId = urlObj.searchParams.get("shop_id") || urlObj.searchParams.get("oec_seller_id") || "";
          const saved = await chrome.storage.local.get(["kocvip_shop_name"]);
          shopName = sanitizeShopName(saved?.kocvip_shop_name || "");
        } catch {}

        if (shopName) {
          statusTitle.textContent = `TikTok Shop: ${shopName}`;
          statusSub.textContent = shopId ? `(ID: ${shopId})` : "affiliate.tiktok.com";
        } else {
          statusTitle.textContent = "TikTok Shop";
          statusSub.textContent = shopId ? `ID: ${shopId}` : "affiliate.tiktok.com";
        }
      } else {
        statusDot.className = "status-dot";
        statusTitle.textContent = "Chưa mở tab TikTok";
        statusSub.textContent = "Bấm nút dưới để mở trang TikTok Shop Affiliate";
      }
    } catch (err) {
      statusTitle.textContent = "Kiểm tra tab TikTok";
      statusSub.textContent = err.message || "Không thể truy vấn tab";
    }
  }

  await checkTikTokTab();

  // 1. Bấm mở Modal Mời KOC VIP trực tiếp trong trang TikTok
  btnOpenModal.addEventListener("click", async () => {
    if (activeTikTokTab?.id) {
      try {
        // Chuyển sang tab TikTok và kích hoạt cửa sổ
        await chrome.tabs.update(activeTikTokTab.id, { active: true });
        if (activeTikTokTab.windowId != null) {
          await chrome.windows.update(activeTikTokTab.windowId, { focused: true });
        }

        // Gửi lệnh mở Modal trực tiếp trên trang
        await chrome.tabs.sendMessage(activeTikTokTab.id, { type: "KOCVIP_TOGGLE_MODAL" }, { frameId: 0 }).catch(() => null);
        window.close();
        return;
      } catch {}
    }

    // Nếu chưa có tab TikTok, tạo tab mới tại trang Collaboration
    await chrome.tabs.create({
      url: "https://affiliate.tiktok.com/affiliate/collaboration/open-collaboration?shop_region=VN",
      active: true,
    });
    window.close();
  });

  // 2. Bấm mở trang TikTok Shop Affiliate
  btnOpenAffiliate.addEventListener("click", async () => {
    if (activeTikTokTab?.id) {
      await chrome.tabs.update(activeTikTokTab.id, { active: true });
      if (activeTikTokTab.windowId != null) {
        await chrome.windows.update(activeTikTokTab.windowId, { focused: true });
      }
      window.close();
      return;
    }

    await chrome.tabs.create({
      url: "https://affiliate.tiktok.com/affiliate/collaboration/open-collaboration?shop_region=VN",
      active: true,
    });
    window.close();
  });
});
