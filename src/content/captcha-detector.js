/**
 * KOC VIP - Captcha Monitor & Auto/Manual Hybrid Resolver Helper.
 * 1. Tự động phát hiện Captcha TikTok.
 * 2. Tự động kết nối Router Server (127.0.0.1:8000) để giải bằng OpenCV / NopeCHA và tự kéo chuột.
 * 3. Nếu server chưa bật hoặc giải lỗi: Tự động fallback sang bảng hướng dẫn giải tay an toàn.
 */
(function () {
  if (window.top !== window) return;

  const ROUTER_API = "http://127.0.0.1:8000/captcha/solve";
  const UNIFIED_API = "http://127.0.0.1:8000/captcha/solve";
  const FEEDBACK_API = "http://127.0.0.1:8000/captcha/feedback";
  const BANNER_ID = "kocvip-captcha-manual-banner";
  let isCaptchaActive = false;
  let isAutoSolving = false;
  let autoSolveAttempts = 0;
  let lastSolvedInfo = null; // { phash, sample_type, solution, extra_data }

  const SELECTORS = {
    PUZZLE_BG: "#captcha-verify-image, .captcha-verify-container #captcha-verify-image",
    PUZZLE_PIECE: "img.captcha_verify_img_slide, .captcha-verify-container .cap-absolute img",
    SLIDER_DRAG_BUTTON: ".secsdk-captcha-drag-icon, div[draggable=true]:has(.secsdk-captcha-drag-icon)",
    ROTATE_INNER: "[data-testid=whirl-inner-img], .captcha-verify-container > div > div > div > img.cap-absolute",
    ROTATE_OUTER: "[data-testid=whirl-outer-img], .captcha-verify-container > div > div > div > img:first-child",
    ROTATE_SLIDE_BAR: ".captcha_verify_slide--slidebar, .captcha-verify-container > div > div > div.cap-w-full > div.cap-rounded-full",
    CONTAINER: ".captcha-verify-container, .captcha-disable-scroll",
    MODAL_DETECTORS: [
      ".captcha-verify-container",
      "#captcha-verify-image",
      ".secsdk-captcha-drag-icon",
      "[data-testid='whirl-inner-img']",
      ".captcha_verify_container",
      ".secsdk_captcha_modal",
      ".captcha-disable-scroll",
      "[class*='captcha-verify']",
      "[id*='captcha-verify']",
      ".verify-bar-close"
    ]
  };

  function showBanner(message, isAuto = false) {
    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = BANNER_ID;
      document.body.appendChild(banner);
    }
    banner.innerHTML = `
      <div style="position:fixed;bottom:20px;right:20px;z-index:999999;background:#1E293B;color:#F8FAFC;border:2px solid ${isAuto ? '#3B82F6' : '#F59E0B'};border-radius:10px;padding:14px 18px;box-shadow:0 10px 25px rgba(0,0,0,0.5);font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:360px;animation:kocvip-fade-in 0.3s ease;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:20px">${isAuto ? '🤖' : '⚠️'}</span>
          <strong style="${isAuto ? 'color:#38BDF8' : 'color:#F59E0B'};font-size:14px">
            ${isAuto ? 'KOC VIP Đang Tự Giải Captcha' : 'TikTok Yêu Cầu Xác Minh'}
          </strong>
        </div>
        <p style="font-size:12.5px;line-height:1.5;margin:0 0 10px 0;color:#CBD5E1">
          ${message}
        </p>
        <div style="font-size:11px;color:#94A3B8;border-top:1px dashed #334155;padding-top:6px;display:flex;justify-content:space-between;">
          <span>${isAuto ? 'Đang gọi AI Router (OpenCV/NopeCHA)...' : 'KOC VIP • Chế độ giải tay'}</span>
          <span style="color:#64748B;">Esc để ẩn</span>
        </div>
      </div>
    `;

    try {
      chrome.runtime.sendMessage({
        type: "KOCVIP_PROGRESS_UPDATE",
        payload: { status: "waiting_captcha", message: "TikTok yêu cầu giải Captcha." },
      });
    } catch {}
  }

  function hideBanner() {
    const banner = document.getElementById(BANNER_ID);
    if (banner) banner.remove();
  }

  function playAlertBeep() {
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

  function isElementVisible(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    try {
      const style = window.getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0.01;
    } catch {
      return true;
    }
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

  function cubicBezier(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return (u*u*u)*p0 + 3*(u*u)*t*p1 + 3*u*(t*t)*p2 + (t*t*t)*p3;
  }

  function dispatchMouseSeq(el, type, x, y) {
    const init = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, pageX: x, pageY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    if (type.startsWith('pointer')) el.dispatchEvent(new PointerEvent(type, init));
    else if (type.startsWith('drag')) el.dispatchEvent(new DragEvent(type, init));
    else el.dispatchEvent(new MouseEvent(type, init));
  }

  // Hàm mô phỏng kéo trượt Puzzle SIÊU MƯỢT, KHÔNG RUNG LẮC (Chuẩn TikTok Anti-Detection)
  async function simulateBiometricDrag(btn, targetDistance) {
    const rect = btn.getBoundingClientRect();
    const startX = rect.x + rect.width / 2;
    const startY = rect.y + rect.height / 2;
    const endX = startX + targetDistance;

    // 1. Tiếp cận nhẹ nhàng vào thanh trượt (Approach)
    const approachSteps = 8;
    for (let i = 1; i <= approachSteps; i++) {
      const t = i / approachSteps;
      const ease = t * t * (3 - 2 * t);
      const curX = (startX - 35) + (35 * ease);
      const curY = (startY + 10) - (10 * ease);
      dispatchMouseSeq(document, 'mousemove', curX, curY);
      await new Promise(r => setTimeout(r, 15 + Math.random() * 10));
    }

    // Rê chuột vào tâm nút kéo, nghỉ ngắn
    dispatchMouseSeq(btn, 'mousemove', startX, startY);
    await new Promise(r => setTimeout(r, 120 + Math.random() * 50));

    // 2. Nhấn chuột (Mousedown & Dragstart)
    dispatchMouseSeq(btn, 'pointerdown', startX, startY);
    dispatchMouseSeq(btn, 'mousedown', startX, startY);
    dispatchMouseSeq(btn, 'dragstart', startX, startY);
    await new Promise(r => setTimeout(r, 100 + Math.random() * 50));

    // 3. Kéo mượt mà theo đường cong Sine (32 bước, giảm rung trục Y xuống mức siêu nhẹ ±0.2px)
    const steps = 32 + Math.floor(Math.random() * 6);
    let lastX = startX;

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      // Hàm Sine Easing giúp kéo nhanh đoạn đầu và chậm dần khi gần tới đích
      const eased = Math.sin((progress * Math.PI) / 2);
      const currX = startX + (targetDistance * eased);
      // Rung tay cực kỳ nhẹ và tự nhiên (chỉ ±0.2px, không làm giật hay trượt ra ngoài)
      const microJitterY = startY + (Math.sin(progress * Math.PI * 2) * 0.3) + (Math.random() * 0.4 - 0.2);

      dispatchMouseSeq(btn, 'pointermove', currX, microJitterY);
      dispatchMouseSeq(btn, 'mousemove', currX, microJitterY);
      dispatchMouseSeq(btn, 'drag', currX, microJitterY);

      // Tốc độ mượt mà: đoạn giữa 12ms, đoạn gần đích (>85%) chậm dần 22ms
      const isNearEnd = progress > 0.85;
      const stepDelay = isNearEnd ? (20 + Math.random() * 10) : (10 + Math.random() * 6);
      await new Promise(r => setTimeout(r, stepDelay));
      lastX = currX;
    }

    // 4. Dừng căn chỉnh chính xác tại đích 350ms (Đủ để TikTok ghi nhận khớp, không bị treo lâu)
    await new Promise(r => setTimeout(r, 350 + Math.random() * 100));

    // 5. Nhả chuột hoàn tất
    dispatchMouseSeq(btn, 'pointerup', lastX, startY);
    dispatchMouseSeq(btn, 'mouseup', lastX, startY);
    dispatchMouseSeq(btn, 'dragend', lastX, startY);
    console.log(`[Captcha Drag] Đã kéo xong mượt mà: ${targetDistance}px.`);
  }

  // Hàm mô phỏng click các điểm (Shapes / Icon / Point captcha): Mỗi click cách nhau đúng 1.25s, tổng 3 - 5s
  async function simulateBiometricClickPoints(targetElement, pointsArray, submitButtonElement = null) {
    const rect = targetElement.getBoundingClientRect();

    for (let i = 0; i < pointsArray.length; i++) {
      const pt = pointsArray[i];
      // Tính toạ độ pixel từ tỉ lệ (xProportion, yProportion)
      const clickX = rect.left + (pt.xProportion * rect.width);
      const clickY = rect.top + (pt.yProportion * rect.height);

      // Rê chuột tới vị trí điểm
      dispatchMouseSeq(targetElement, 'mousemove', clickX, clickY);
      await new Promise(r => setTimeout(r, 200 + Math.random() * 100));

      // Bắn chuỗi sự kiện click
      dispatchMouseSeq(targetElement, 'pointerdown', clickX, clickY);
      dispatchMouseSeq(targetElement, 'mousedown', clickX, clickY);
      await new Promise(r => setTimeout(r, 80 + Math.random() * 40));

      dispatchMouseSeq(targetElement, 'pointerup', clickX, clickY);
      dispatchMouseSeq(targetElement, 'mouseup', clickX, clickY);
      dispatchMouseSeq(targetElement, 'click', clickX, clickY);

      console.log(`[Captcha Timing] Đã click điểm ${i + 1}/${pointsArray.length} tại (${Math.round(clickX)}, ${Math.round(clickY)}). Chờ 1.25s...`);

      // Khoảng cách giữa các cú click giải cách nhau đúng 1.25 giây (1250ms)
      await new Promise(r => setTimeout(r, 1250 + (Math.random() * 100 - 50)));
    }

    // Nếu có nút Xác nhận (Submit button)
    if (submitButtonElement) {
      const subRect = submitButtonElement.getBoundingClientRect();
      const subX = subRect.left + subRect.width / 2;
      const subY = subRect.top + subRect.height / 2;

      dispatchMouseSeq(submitButtonElement, 'mousemove', subX, subY);
      await new Promise(r => setTimeout(r, 300));

      dispatchMouseSeq(submitButtonElement, 'click', subX, subY);
      console.log("[Captcha Timing] Đã click nút Xác nhận.");
    }
  }

  // Cố gắng tự giải qua Router Server (127.0.0.1:8000)
  async function attemptAutoSolve() {
    if (isAutoSolving) return;

    const bgEl = document.querySelector(SELECTORS.PUZZLE_BG);
    const pieceEl = document.querySelector(SELECTORS.PUZZLE_PIECE);
    const sliderBtn = document.querySelector(SELECTORS.SLIDER_DRAG_BUTTON);

    const rotOuterEl = document.querySelector(SELECTORS.ROTATE_OUTER);
    const rotInnerEl = document.querySelector(SELECTORS.ROTATE_INNER);
    const rotSlideBarEl = document.querySelector(SELECTORS.ROTATE_SLIDE_BAR);

    // DẠNG 1: PUZZLE SLIDER CAPTCHA
    if (bgEl && pieceEl && sliderBtn && isElementVisible(bgEl) && isElementVisible(pieceEl)) {
      const bgSrc = bgEl.getAttribute("src");
      const pieceSrc = pieceEl.getAttribute("src");
      if (bgSrc && pieceSrc) {
        try {
          isAutoSolving = true;
          showBanner("Phát hiện Slider Captcha! Đang kết nối AI Hub để tính toạ độ...", true);

          const [bgB64, pieceB64] = await Promise.all([
            fetchImageBase64(bgSrc),
            fetchImageBase64(pieceSrc)
          ]);

          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 6000);

          const resp = await fetch(UNIFIED_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              captcha_type: "slider",
              image_bg: bgB64,
              image_piece: pieceB64
            }),
            signal: ctrl.signal
          }).finally(() => clearTimeout(timer));

          const resData = await resp.json();
          if (!resData.success || !resData.data) {
            throw new Error(resData.error || "Server không trả kết quả");
          }

          const { slide_x_proportion, source, phash, raw_x } = resData.data;
          lastSolvedInfo = {
            phash: phash || null,
            sample_type: "slider",
            solution: slide_x_proportion,
            extra_data: JSON.stringify({ raw_x: raw_x || 0 })
          };

          const providerName = source === "golden_memory" ? "🧠 Trí Nhớ Vàng (<1ms)" : "🤖 OpenCV AI";
          showBanner(`Đã khớp toạ độ qua <b>${providerName}</b>. Đang tự kéo mảnh ghép...`, true);

          const domWidth = bgEl.getBoundingClientRect().width;
          let targetDistance = Math.round(slide_x_proportion * domWidth) - 3;

          await simulateBiometricDrag(sliderBtn, targetDistance);
          await new Promise(r => setTimeout(r, 1500));

          if (!document.querySelector(SELECTORS.PUZZLE_BG)) {
            console.log("[KOC VIP] Tự động giải Slider Captcha thành công!");
            autoSolveAttempts = 0;
            hideBanner();
            return;
          } else {
            autoSolveAttempts++;
          }
        } catch (err) {
          console.warn("[KOC VIP] Lỗi giải Slider Captcha:", err.message);
          autoSolveAttempts++;
        } finally {
          setTimeout(() => { isAutoSolving = false; }, 1500);
        }
        return;
      }
    }

    // DẠNG 2: ROTATE CIRCLE CAPTCHA
    if (rotOuterEl && rotInnerEl && sliderBtn && isElementVisible(rotOuterEl)) {
      const outerSrc = rotOuterEl.getAttribute("src");
      const innerSrc = rotInnerEl.getAttribute("src");
      if (outerSrc && innerSrc) {
        try {
          isAutoSolving = true;
          showBanner("Phát hiện Rotate Captcha! Đang quét góc xoay phù hợp...", true);

          const [outerB64, innerB64] = await Promise.all([
            fetchImageBase64(outerSrc),
            fetchImageBase64(innerSrc)
          ]);

          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 6000);

          const resp = await fetch(UNIFIED_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              captcha_type: "rotate",
              image_bg: outerB64,
              image_piece: innerB64
            }),
            signal: ctrl.signal
          }).finally(() => clearTimeout(timer));

          const resData = await resp.json();
          if (!resData.success || !resData.data) {
            throw new Error(resData.error || "Server không trả kết quả góc xoay");
          }

          const { angle, source, phash } = resData.data;
          lastSolvedInfo = {
            phash: phash || null,
            sample_type: "rotate",
            solution: angle,
            extra_data: ""
          };

          const providerName = source === "golden_memory" ? "🧠 Trí Nhớ Vàng (<1ms)" : "🔄 Polar AI";
          showBanner(`Góc xoay: <b>${angle.toFixed(1)}°</b> (${providerName}). Đang tự kéo...`, true);

          const barWidth = rotSlideBarEl ? rotSlideBarEl.getBoundingClientRect().width : 340;
          const iconWidth = sliderBtn.getBoundingClientRect().width || 40;
          const targetDistance = Math.round(((barWidth - iconWidth) * angle) / 360);

          await simulateBiometricDrag(sliderBtn, targetDistance);
          await new Promise(r => setTimeout(r, 1500));

          if (!document.querySelector(SELECTORS.ROTATE_OUTER)) {
            console.log("[KOC VIP] Tự động giải Rotate Captcha thành công!");
            autoSolveAttempts = 0;
            hideBanner();
            return;
          } else {
            autoSolveAttempts++;
          }
        } catch (err) {
          console.warn("[KOC VIP] Lỗi giải Rotate Captcha:", err.message);
          autoSolveAttempts++;
        } finally {
          setTimeout(() => { isAutoSolving = false; }, 1500);
        }
        return;
      }
    }

    // Nếu đã thử 2 lần thất bại hoặc dạng khác -> Chuyển sang giải tay
    if (autoSolveAttempts >= 2) {
      showBanner("Vui lòng kéo thanh trượt trên màn hình để giải Captcha. Tiện ích sẽ <b>tự động tiếp tục</b> ngay sau khi bạn giải xong.", false);
    }
  }

  function checkCaptchaInDOM() {
    let found = false;
    for (const sel of SELECTORS.MODAL_DETECTORS) {
      const el = document.querySelector(sel);
      if (el && isElementVisible(el)) {
        found = true;
        break;
      }
    }

    if (found && !isCaptchaActive) {
      isCaptchaActive = true;
      playAlertBeep();
      try {
        chrome.runtime.sendMessage({
          type: "KOCVIP_NOTIFY_CAPTCHA",
          payload: { message: "TikTok đang yêu cầu giải Captcha trên màn hình." }
        });
      } catch {}

      // Thử tự giải tự động trước
      attemptAutoSolve();

    } else if (found && isCaptchaActive) {
      // Nếu vẫn còn và chưa tự giải thành công, thử lại
      if (autoSolveAttempts < 2 && !isAutoSolving) {
        attemptAutoSolve();
      }
    } else if (!found && isCaptchaActive) {
      isCaptchaActive = false;
      autoSolveAttempts = 0;
      hideBanner();
      console.log("[KOC VIP] Captcha đã biến mất khỏi màn hình (Xác minh thành công).");

      // ACTIVE LEARNING FEEDBACK: Nạp vào Trí Nhớ Vàng (Golden Memory)
      if (lastSolvedInfo && lastSolvedInfo.phash) {
        console.log("[KOC VIP] ⚡ Gửi phản hồi thành công vào Trí Nhớ Vàng (Golden Memory)...", lastSolvedInfo);
        fetch(FEEDBACK_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phash: lastSolvedInfo.phash,
            sample_type: lastSolvedInfo.sample_type,
            solution: lastSolvedInfo.solution,
            extra_data: lastSolvedInfo.extra_data,
            status: "success"
          })
        }).then(r => r.json()).then(fbRes => {
          console.log("[KOC VIP] ✅ Trí Nhớ Vàng đã học mẫu này! Lần sau gặp lại sẽ giải siêu tốc <1ms:", fbRes);
        }).catch(e => {
          console.warn("[KOC VIP] Không gửi được feedback:", e);
        });
        lastSolvedInfo = null;
      }

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
    attributes: true,
    attributeFilter: ["src", "style", "class"]
  });

  setInterval(checkCaptchaInDOM, 1000);
  console.log("[KOC VIP] Hybrid Auto/Manual Captcha Solver loaded.");
})();
