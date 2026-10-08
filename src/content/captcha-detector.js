/**
 * KOC VIP - Captcha Monitor & Manual Resolver Helper.
 * Hoạt động 100% cục bộ trên tab TikTok: Phát hiện khi có Captcha xuất hiện,
 * hiển thị hướng dẫn giải tay và tự động báo tiếp tục khi người dùng đã giải xong.
 * Không gọi bất kỳ dịch vụ giải captcha bên ngoài nào.
 */
(function () {
  if (window.top !== window) return;

  const BANNER_ID = "kocvip-captcha-manual-banner";
  let isCaptchaActive = false;

  function showBanner() {
    if (document.getElementById(BANNER_ID)) return;
    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.innerHTML = `
      <div style="position:fixed;bottom:20px;right:20px;z-index:999999;background:#1E293B;color:#F8FAFC;border:2px solid #F59E0B;border-radius:10px;padding:14px 18px;box-shadow:0 10px 25px rgba(0,0,0,0.5);font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:350px;animation:kocvip-fade-in 0.3s ease;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:20px">⚠️</span>
          <strong style="color:#F59E0B;font-size:14px">TikTok Yêu Cầu Xác Minh</strong>
        </div>
        <p style="font-size:12.5px;line-height:1.5;margin:0 0 10px 0;color:#CBD5E1">
          Vui lòng kéo thanh trượt hoặc xoay hình ảnh trên màn hình để giải Captcha. Tiện ích sẽ <b>tự động tiếp tục</b> ngay sau khi bạn giải xong.
        </p>
        <div style="font-size:11px;color:#94A3B8;border-top:1px dashed #334155;padding-top:6px">
          KOC VIP • Chế độ giải tay an toàn
        </div>
      </div>
    `;
    document.body.appendChild(banner);

    try {
      chrome.runtime.sendMessage({
        type: "KOCVIP_PROGRESS_UPDATE",
        payload: { status: "waiting_captcha", message: "TikTok yêu cầu giải Captcha trên màn hình." },
      });
    } catch {}
  }

  function hideBanner() {
    const banner = document.getElementById(BANNER_ID);
    if (banner) banner.remove();
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

  // Quan sát DOM tìm khung captcha
  function checkCaptchaInDOM() {
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
    let found = false;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)) {
        found = true;
        break;
      }
    }

    if (found && !isCaptchaActive) {
      isCaptchaActive = true;
      showBanner();
      playCaptchaAlertBeep();
      try {
        chrome.runtime.sendMessage({
          type: "KOCVIP_NOTIFY_CAPTCHA",
          payload: { message: "TikTok đang yêu cầu giải Captcha trên màn hình. Hãy bấm vào đây để mở tab TikTok và giải ngay!" }
        });
      } catch {}
    } else if (!found && isCaptchaActive) {
      isCaptchaActive = false;
      hideBanner();
      console.log("[KOC VIP] Captcha đã được giải xong.");
      try {
        chrome.runtime.sendMessage({
          type: "KOCVIP_PROGRESS_UPDATE",
          payload: { status: "captcha_resolved", message: "Đã giải xong Captcha. Tiếp tục gửi lời mời..." },
        });
      } catch {}
    }
  }

  const observer = new MutationObserver(() => {
    checkCaptchaInDOM();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  setInterval(checkCaptchaInDOM, 1000);
})();
