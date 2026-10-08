/**
 * KOC VIP - Auto Captcha Solver with Smart Router Integration
 * Tự động bắt popup TikTok Captcha -> Gọi Router Server (OpenCV / NopeCHA) -> Kéo trượt sinh trắc học.
 * Nếu server không bật hoặc lỗi toàn bộ -> Tự động Fallback sang chế độ Giải tay thủ công.
 */

(function () {
  'use strict';
  if (window.top !== window) return;

  const ROUTER_API = "http://127.0.0.1:8000/solve/puzzle";
  const BANNER_ID = "kocvip-auto-captcha-banner";
  let isSolving = false;
  let failureCount = 0;

  const SELECTORS = {
    PUZZLE_BG: "#captcha-verify-image, .captcha-verify-container #captcha-verify-image",
    PUZZLE_PIECE: "img.captcha_verify_img_slide, .captcha-verify-container .cap-absolute img",
    SLIDER_DRAG_BUTTON: ".secsdk-captcha-drag-icon, div[draggable=true]:has(.secsdk-captcha-drag-icon)",
    CONTAINER: ".captcha-disable-scroll, .captcha-verify-container"
  };

  function updateStatusBanner(text, type = "info") {
    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = BANNER_ID;
      banner.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:999999;background:#1E293B;color:#F8FAFC;border:2px solid #3B82F6;border-radius:10px;padding:14px 18px;box-shadow:0 10px 25px rgba(0,0,0,0.5);font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:360px;font-size:13px;transition:all 0.3s ease;";
      document.body.appendChild(banner);
    }
    const color = type === "error" ? "#EF4444" : type === "warning" ? "#F59E0B" : "#3B82F6";
    banner.style.borderColor = color;
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:18px">${type === "error" ? "❌" : type === "warning" ? "⚠️" : "🤖"}</span>
        <strong style="color:${color};font-size:14px">KOC VIP Auto Captcha</strong>
      </div>
      <div style="line-height:1.4;color:#CBD5E1">${text}</div>
    `;
  }

  function removeStatusBanner() {
    const banner = document.getElementById(BANNER_ID);
    if (banner) banner.remove();
  }

  function cubicBezier(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return (u*u*u)*p0 + 3*(u*u)*t*p1 + 3*u*(t*t)*p2 + (t*t*t)*p3;
  }

  async function fetchImageBase64(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function isElementVisible(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    try {
      const style = window.getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0.01;
    } catch {
      return true;
    }
  }

  function dispatchMouseSeq(el, type, x, y) {
    const init = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, pageX: x, pageY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    if (type.startsWith('pointer')) el.dispatchEvent(new PointerEvent(type, init));
    else if (type.startsWith('drag')) el.dispatchEvent(new DragEvent(type, init));
    else el.dispatchEvent(new MouseEvent(type, init));
  }

  async function simulateBiometricDrag(btn, targetDistance) {
    const rect = btn.getBoundingClientRect();
    const startX = rect.x + rect.width / 2;
    const startY = rect.y + rect.height / 2;
    const endX = startX + targetDistance;
    const endY = startY;

    // 1. Tiếp cận nút
    dispatchMouseSeq(document, 'mousemove', startX - 25, startY + 10);
    await new Promise(r => setTimeout(r, 120));
    dispatchMouseSeq(btn, 'mousemove', startX, startY);
    await new Promise(r => setTimeout(r, 100));

    // 2. Nhấn nút
    dispatchMouseSeq(btn, 'pointerdown', startX, startY);
    dispatchMouseSeq(btn, 'mousedown', startX, startY);
    dispatchMouseSeq(btn, 'dragstart', startX, startY);
    await new Promise(r => setTimeout(r, 80));

    // 3. Kéo theo đường cong
    const steps = 30 + Math.floor(Math.random() * 10);
    const ctrl1X = startX + (endX - startX) * 0.3;
    const ctrl2X = startX + (endX - startX) * 0.7;

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const eased = Math.sin((progress * Math.PI) / 2);
      const currX = cubicBezier(startX, ctrl1X, ctrl2X, endX, eased);
      const currY = startY + (Math.random() * 1.6 - 0.8);

      dispatchMouseSeq(btn, 'pointermove', currX, currY);
      dispatchMouseSeq(btn, 'mousemove', currX, currY);
      dispatchMouseSeq(btn, 'drag', currX, currY);
      await new Promise(r => setTimeout(r, 12 + Math.random() * 10));
    }

    // 4. Dừng căn chỉnh và nhả chuột
    await new Promise(r => setTimeout(r, 150));
    dispatchMouseSeq(btn, 'pointerup', endX, endY);
    dispatchMouseSeq(btn, 'mouseup', endX, endY);
    dispatchMouseSeq(btn, 'dragend', endX, endY);
  }

  async function handleAutoSolve() {
    if (isSolving) return;

    const bgEl = document.querySelector(SELECTORS.PUZZLE_BG);
    const pieceEl = document.querySelector(SELECTORS.PUZZLE_PIECE);
    const sliderBtn = document.querySelector(SELECTORS.SLIDER_DRAG_BUTTON);

    if (!bgEl || !pieceEl || !sliderBtn) return;
    if (!isElementVisible(bgEl) || !isElementVisible(pieceEl)) return;

    // Nếu đã thử tự động 3 lần thất bại -> chuyển sang cho giải tay
    if (failureCount >= 3) {
      updateStatusBanner("Đã thử tự động 3 lần chưa khớp. Vui lòng kéo nhẹ bằng tay để tiếp tục!", "warning");
      return;
    }

    try {
      isSolving = true;
      updateStatusBanner("Phát hiện Captcha! Đang kết nối Router để tính toạ độ...");

      const [bgB64, pieceB64] = await Promise.all([
        fetchImageBase64(bgEl.getAttribute("src")),
        fetchImageBase64(pieceEl.getAttribute("src"))
      ]);

      const resp = await fetch(ROUTER_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puzzle_image_b64: bgB64,
          piece_image_b64: pieceB64
        })
      });

      const resData = await resp.json();
      if (!resData.success || !resData.data) {
        throw new Error(resData.error || "Không nhận được toạ độ từ Router");
      }

      const { slide_x_proportion, provider_used } = resData.data;
      updateStatusBanner(`Đã giải qua <b>${provider_used}</b>. Đang mô phỏng thao tác kéo...`);

      const domWidth = bgEl.getBoundingClientRect().width;
      let targetDistance = Math.round(slide_x_proportion * domWidth) - 2;

      await simulateBiometricDrag(sliderBtn, targetDistance);

      // Chờ TikTok xác thực kết quả
      await new Promise(r => setTimeout(r, 1800));

      if (!document.querySelector(SELECTORS.PUZZLE_BG)) {
        updateStatusBanner("Giải Captcha thành công! Tiếp tục gửi lời mời KOC.", "info");
        failureCount = 0;
        setTimeout(removeStatusBanner, 2000);
      } else {
        failureCount++;
      }

    } catch (err) {
      console.warn("[KOC VIP Captcha] Lỗi xử lý tự động:", err.message);
      failureCount++;
      if (failureCount >= 2) {
        updateStatusBanner(`Server chưa bật hoặc lỗi API (${err.message}). Bạn có thể kéo tay để tiếp tục!`, "warning");
      }
    } finally {
      setTimeout(() => { isSolving = false; }, 2000);
    }
  }

  const observer = new MutationObserver(() => {
    handleAutoSolve();
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "style", "class"]
  });

  console.log("[KOC VIP] Auto Captcha Solver initialized.");
})();
