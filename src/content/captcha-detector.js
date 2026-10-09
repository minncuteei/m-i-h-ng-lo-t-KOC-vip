/**
 * KOC VIP - Centralized CAPTCHA State Manager & Single-Actor Resolver.
 * 
 * KIẾN TRÚC ĐIỀU PHỐI ĐƠN NHẤT (SINGLE-ACTOR MUTEX & STATE MANAGER):
 * 1. Single Actor Mutex: Tuyệt đối chỉ 1 tác nhân giải tại 1 thời điểm.
 * 2. Nút Dừng Khẩn Cấp (Emergency Stop Button): Cho phép người dùng bấm "⏹️ Dừng Tự Giải / Chuyển Giải Tay" ngay lập tức, ngắt kết nối gửi về Server (AbortController) và dừng mọi hành vi kéo chuột.
 * 3. Chế độ Tắt Tự Động: Người dùng có thể chủ động chuyển hẳn sang chế độ giải tay bất kỳ lúc nào.
 * 4. Phân tách rõ ràng 5 Trạng Thái (IDLE -> DETECTED -> ANALYZING -> INTERACTING -> PENDING_VERIFICATION -> MANUAL_REQUIRED -> RESOLVED).
 * 5. Chống lặp vô tận (Session Tracking qua captcha_session_id, Cooldown 4s).
 */
(function () {
  if (window.top !== window) return;

  // ================= 1. TAB-LEVEL SINGLETON COORDINATOR =================
  const COORDINATOR_ID = "kocvip_coord_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  window.__KOCVIP_CAPTCHA_COORDINATOR__ = COORDINATOR_ID;
  document.documentElement.setAttribute("data-kocvip-captcha-coordinator", COORDINATOR_ID);

  function isCoordinatorActive() {
    return window.__KOCVIP_CAPTCHA_COORDINATOR__ === COORDINATOR_ID &&
           document.documentElement.getAttribute("data-kocvip-captcha-coordinator") === COORDINATOR_ID;
  }

  const UNIFIED_API = "http://127.0.0.1:8000/captcha/solve";
  const FEEDBACK_API = "http://127.0.0.1:8000/captcha/feedback";
  const BANNER_ID = "kocvip-captcha-state-banner";

  // ================= 2. CAPTCHA STATE MANAGER CORE =================
  const CAPTCHA_STATES = {
    IDLE: "IDLE",
    DETECTED: "DETECTED",
    ANALYZING: "ANALYZING",
    INTERACTING: "INTERACTING",
    PENDING_VERIFICATION: "PENDING_VERIFICATION",
    MANUAL_REQUIRED: "MANUAL_REQUIRED",
    RESOLVED: "RESOLVED",
    FAILED: "FAILED"
  };

  class CaptchaStateManager {
    constructor() {
      this.currentState = CAPTCHA_STATES.IDLE;
      this.currentSession = null;
      this.maxAutoAttempts = 2;
      this.minCooldownMs = 4000;
      this.lastAttemptTime = 0;
      this.autoSolveDisabled = sessionStorage.getItem("kocvip_captcha_manual_only") === "1";
    }

    createSession(type = "slider") {
      // Hủy session cũ nếu còn controller
      if (this.currentSession && this.currentSession.abortController) {
        try { this.currentSession.abortController.abort(); } catch {}
      }

      this.currentSession = {
        sessionId: "sess_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
        captchaType: type,
        detectedAt: Date.now(),
        attempts: 0,
        stateHistory: [],
        aiResult: null,
        interactionResult: null,
        platformStatus: null,
        phash: null,
        solution: null,
        abortController: new AbortController(),
        isCancelled: false
      };
      return this.currentSession;
    }

    stopAndSwitchToManual(reason = "user_cancelled") {
      console.warn(`[CAPTCHA Manager] 🛑 Người dùng kích hoạt DỪNG TỰ ĐỘNG GIẢI (${reason}). Ngắt kết nối Server và chuyển sang giải tay!`);
      if (this.currentSession) {
        this.currentSession.isCancelled = true;
        if (this.currentSession.abortController) {
          try { this.currentSession.abortController.abort(); } catch {}
        }
      }
      this.autoSolveDisabled = true;
      sessionStorage.setItem("kocvip_captcha_manual_only", "1");
      this.transitionTo(CAPTCHA_STATES.MANUAL_REQUIRED, { reason });
    }

    enableAutoSolve() {
      console.log("[CAPTCHA Manager] ▶️ Kích hoạt lại chế độ AI Tự Giải.");
      this.autoSolveDisabled = false;
      sessionStorage.removeItem("kocvip_captcha_manual_only");
      if (this.currentState === CAPTCHA_STATES.MANUAL_REQUIRED) {
        this.transitionTo(CAPTCHA_STATES.DETECTED, { reason: "user_reenabled_ai" });
      }
    }

    transitionTo(newState, meta = {}) {
      const prev = this.currentState;
      this.currentState = newState;
      const record = {
        from: prev,
        to: newState,
        time: Date.now(),
        meta
      };

      if (this.currentSession) {
        this.currentSession.stateHistory.push(record);
      }

      console.log(`[CAPTCHA State Manager] 🔄 [${prev}] ➔ [${newState}]`, meta);

      // Cập nhật DOM & biến toàn cục để các Module khác (Crawler, Inviter) lắng nghe
      document.documentElement.setAttribute("data-kocvip-captcha-state", newState);
      window.__KOCVIP_CAPTCHA_STATE__ = newState;
      window.__STONK_CAPTCHA_ACTIVE_UNTIL__ = (newState !== CAPTCHA_STATES.IDLE && newState !== CAPTCHA_STATES.RESOLVED) 
        ? (Date.now() + 60000) 
        : 0;

      // Phát sự kiện toàn Tab
      try {
        window.dispatchEvent(new CustomEvent("KOCVIP_CAPTCHA_STATE_CHANGE", {
          detail: { state: newState, session: this.currentSession, meta }
        }));
      } catch {}

      this.updateUI();
    }

    updateUI() {
      switch (this.currentState) {
        case CAPTCHA_STATES.DETECTED:
          showBanner("Phát hiện Captcha trên trang. Đang tạm dừng tác vụ và chuẩn bị xử lý...", true);
          break;
        case CAPTCHA_STATES.ANALYZING:
          showBanner("AI Hub đang phân tích cấu trúc hình ảnh...", true);
          break;
        case CAPTCHA_STATES.INTERACTING:
          showBanner("Đang thực hiện mô phỏng tương tác sinh trắc học...", true);
          break;
        case CAPTCHA_STATES.PENDING_VERIFICATION:
          showBanner("Đang đợi TikTok xác nhận kết quả (vui lòng chờ vài giây)...", true);
          break;
        case CAPTCHA_STATES.MANUAL_REQUIRED:
          showBanner("Chế độ giải an toàn: Vui lòng <b>kéo thanh trượt trên màn hình</b> để xác minh thủ công. Tiện ích sẽ <b>tự động tiếp tục</b> ngay khi hoàn tất.", false);
          break;
        case CAPTCHA_STATES.RESOLVED:
          hideBanner();
          break;
        case CAPTCHA_STATES.IDLE:
          hideBanner();
          break;
      }
    }
  }

  const stateManager = new CaptchaStateManager();

  // ================= 3. DOM SELECTORS =================
  const SELECTORS = {
    PUZZLE_BG: "#captcha-verify-image, .captcha-verify-container #captcha-verify-image",
    PUZZLE_PIECE: "img.captcha_verify_img_slide, .captcha-verify-container .cap-absolute img",
    SLIDER_DRAG_BUTTON: ".secsdk-captcha-drag-icon, div[draggable=true]:has(.secsdk-captcha-drag-icon)",
    ROTATE_INNER: "[data-testid=whirl-inner-img], .captcha-verify-container > div > div > div > img.cap-absolute",
    ROTATE_OUTER: "[data-testid=whirl-outer-img], .captcha-verify-container > div > div > div > img:first-child",
    ROTATE_SLIDE_BAR: ".captcha_verify_slide--slidebar, .captcha-verify-container > div > div > div.cap-w-full > div.cap-rounded-full",
    REFRESH_BTN: ".secsdk_captcha_refresh--icon, .captcha_verify_action--refresh, [aria-label='Refresh'], .captcha-refresh",
    ERROR_MESSAGE: ".captcha_verify_message--error, .captcha-error-tip, .secsdk-captcha-error",
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

  let lastBannerNotifyTime = 0;
  function showBanner(message, isAuto = false) {
    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = BANNER_ID;
      document.body.appendChild(banner);
    }
    
    banner.innerHTML = `
      <div style="position:fixed;bottom:20px;right:20px;z-index:999999;background:#1E293B;color:#F8FAFC;border:2px solid ${isAuto ? '#3B82F6' : '#F59E0B'};border-radius:12px;padding:14px 18px;box-shadow:0 12px 30px rgba(0,0,0,0.6);font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:380px;animation:kocvip-fade-in 0.3s ease;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:18px">${isAuto ? '🤖' : '🖐️'}</span>
            <strong style="${isAuto ? 'color:#38BDF8' : 'color:#F59E0B'};font-size:13.5px">
              ${isAuto ? 'AI Hub Đang Tự Giải Captcha' : 'Chế Độ Xác Minh Thủ Công'}
            </strong>
          </div>
          <button id="kocvip-btn-focus-captcha" style="background:#334155;color:#94A3B8;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;" title="Cuộn tới Captcha">
            🎯 Định vị
          </button>
        </div>
        
        <p style="font-size:12px;line-height:1.5;margin:0 0 10px 0;color:#CBD5E1">
          ${message}
        </p>
        
        <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px dashed #334155;padding-top:8px;margin-top:4px;">
          ${isAuto ? `
            <button id="kocvip-btn-emergency-stop" style="background:#DC2626;color:#FFFFFF;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
              ⏹️ Dừng AI (Giải tay)
            </button>
          ` : `
            <button id="kocvip-btn-reenable-ai" style="background:#0284C7;color:#FFFFFF;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
              ▶️ Thử bật lại AI
            </button>
          `}
          <span style="font-size:11px;color:#64748B;">Esc để ẩn</span>
        </div>
      </div>
    `;

    // Gán sự kiện cho các nút điều khiển trên Banner
    const stopBtn = banner.querySelector("#kocvip-btn-emergency-stop");
    if (stopBtn) {
      stopBtn.onclick = (e) => {
        e.stopPropagation();
        stateManager.stopAndSwitchToManual("user_clicked_stop_button");
      };
    }

    const reenableBtn = banner.querySelector("#kocvip-btn-reenable-ai");
    if (reenableBtn) {
      reenableBtn.onclick = (e) => {
        e.stopPropagation();
        stateManager.enableAutoSolve();
      };
    }

    const focusBtn = banner.querySelector("#kocvip-btn-focus-captcha");
    if (focusBtn) {
      focusBtn.onclick = (e) => {
        e.stopPropagation();
        focusAndHighlightCaptcha();
      };
    }

    const now = Date.now();
    if (now - lastBannerNotifyTime > 15000) {
      lastBannerNotifyTime = now;
      try {
        chrome.runtime.sendMessage({
          type: "KOCVIP_PROGRESS_UPDATE",
          payload: { status: "waiting_captcha", message: "TikTok yêu cầu giải Captcha." },
        });
      } catch {}
    }
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

  function dispatchMouseSeq(el, type, x, y) {
    const isDownOrMove = type.includes('down') || type.includes('move') || type.includes('drag');
    const init = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      screenX: x + (window.screenX || 0),
      screenY: y + (window.screenY || 0),
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: isDownOrMove ? 1 : 0,
      button: type.includes('contextmenu') ? 2 : 0,
      which: isDownOrMove ? 1 : 0
    };

    if (type.startsWith('pointer')) {
      el.dispatchEvent(new PointerEvent(type, init));
      if (document && el !== document) document.dispatchEvent(new PointerEvent(type, init));
      if (window && el !== window) window.dispatchEvent(new PointerEvent(type, init));
    } else if (type.startsWith('drag')) {
      el.dispatchEvent(new DragEvent(type, init));
    } else {
      el.dispatchEvent(new MouseEvent(type, init));
      if (document && el !== document) document.dispatchEvent(new MouseEvent(type, init));
      if (window && el !== window) window.dispatchEvent(new MouseEvent(type, init));
    }
  }

  // ================= 4. MÔ PHỎNG CHUỘT SINH TRẮC HỌC (1.8s - 2.5s) KÈM CƠ CHẾ CANCEL =================
  async function simulateBiometricDrag(btn, targetDistance, session) {
    const rect = btn.getBoundingClientRect();
    const startX = rect.x + rect.width / 2;
    const startY = rect.y + rect.height / 2;
    const finalEndX = startX + targetDistance;

    if (session && session.isCancelled) return;

    // 1. Độ trễ nhận thức (600 - 900ms)
    await new Promise(r => setTimeout(r, 600 + Math.random() * 300));
    if (session && session.isCancelled) return;

    // 2. Tiếp cận con trỏ (Approach: 10 bước ~180ms)
    const approachSteps = 10;
    for (let i = 1; i <= approachSteps; i++) {
      if (session && session.isCancelled) return;
      const t = i / approachSteps;
      const ease = t * t * (3 - 2 * t);
      const curX = (startX - 45) + (45 * ease);
      const curY = (startY + 15) - (15 * ease);
      dispatchMouseSeq(document, 'mousemove', curX, curY);
      await new Promise(r => setTimeout(r, 16 + Math.random() * 6));
    }

    dispatchMouseSeq(btn, 'mousemove', startX, startY);
    await new Promise(r => setTimeout(r, 180 + Math.random() * 70));
    if (session && session.isCancelled) return;

    // 3. Nhấn chuột
    dispatchMouseSeq(btn, 'pointerdown', startX, startY);
    dispatchMouseSeq(btn, 'mousedown', startX, startY);
    dispatchMouseSeq(btn, 'dragstart', startX, startY);
    await new Promise(r => setTimeout(r, 200 + Math.random() * 80));

    // 4. Kéo đoạn chính theo S-Curve kèm Micro-Jitter (65 - 80 bước)
    const willOvershoot = Math.random() < 0.70;
    const overshootDist = willOvershoot ? (2.5 + Math.random() * 3.0) : 0;
    const stage1EndX = finalEndX + overshootDist;

    const steps = 65 + Math.floor(Math.random() * 15);
    for (let i = 1; i <= steps; i++) {
      if (session && session.isCancelled) {
        // Nhả chuột khẩn cấp nếu bị huỷ
        dispatchMouseSeq(btn, 'mouseup', startX, startY);
        return;
      }
      const progress = i / steps;
      const eased = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      const currX = startX + ((stage1EndX - startX) * eased);
      const microJitterY = startY + (Math.random() * 1.6 - 0.8);

      dispatchMouseSeq(btn, 'pointermove', currX, microJitterY);
      dispatchMouseSeq(btn, 'mousemove', currX, microJitterY);
      dispatchMouseSeq(btn, 'drag', currX, microJitterY);

      const isNearEnd = progress > 0.80;
      const stepDelay = isNearEnd ? (22 + Math.random() * 10) : (16 + Math.random() * 8);
      await new Promise(r => setTimeout(r, stepDelay));
    }

    // 5. Kéo lố nhẹ rồi lùi lại
    if (willOvershoot && (!session || !session.isCancelled)) {
      await new Promise(r => setTimeout(r, 160 + Math.random() * 80));
      const correctionSteps = 12 + Math.floor(Math.random() * 4);
      for (let i = 1; i <= correctionSteps; i++) {
        if (session && session.isCancelled) {
          dispatchMouseSeq(btn, 'mouseup', startX, startY);
          return;
        }
        const prog = i / correctionSteps;
        const currX = stage1EndX + ((finalEndX - stage1EndX) * prog);
        const microJitterY = startY + (Math.random() * 1.0 - 0.5);

        dispatchMouseSeq(btn, 'pointermove', currX, microJitterY);
        dispatchMouseSeq(btn, 'mousemove', currX, microJitterY);
        dispatchMouseSeq(btn, 'drag', currX, microJitterY);
        await new Promise(r => setTimeout(r, 18 + Math.random() * 8));
      }
    }

    // 6. Dừng ngắm chuẩn
    await new Promise(r => setTimeout(r, 380 + Math.random() * 150));
    if (session && session.isCancelled) {
      dispatchMouseSeq(btn, 'mouseup', startX, startY);
      return;
    }

    // 7. Nhả chuột
    dispatchMouseSeq(btn, 'pointerup', finalEndX, startY);
    dispatchMouseSeq(btn, 'mouseup', finalEndX, startY);
    dispatchMouseSeq(btn, 'dragend', finalEndX, startY);
    console.log(`[CAPTCHA Interactor] Hoàn tất kéo chuột: ${targetDistance}px`);
  }

  // ================= 5. THEO DÕI XÁC NHẬN NỀN TẢNG =================
  async function waitForPlatformVerification(checkStillExistsFn, timeoutMs = 4500) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, 300));
      const stillExists = checkStillExistsFn();
      const errEl = document.querySelector(SELECTORS.ERROR_MESSAGE);
      const isErrorVisible = errEl && isElementVisible(errEl);

      if (isErrorVisible) {
        return { status: "REJECTED", reason: "error_message_visible" };
      }

      if (!stillExists) {
        return { status: "ACCEPTED", reason: "modal_dismissed" };
      }
    }
    return { status: "TIMEOUT_UNKNOWN", reason: "modal_still_present" };
  }

  // ================= 6. ĐIỀU PHỐI ĐƠN NHẤT (SINGLE-ACTOR MUTEX PIPELINE) =================
  let isSolvingMutex = false;

  async function executeSolvePipeline() {
    if (!isCoordinatorActive()) return;

    // SINGLE-ACTOR MUTEX: Chỉ cho phép 1 tác nhân duy nhất chạy tại 1 thời điểm
    if (isSolvingMutex) {
      console.log("[CAPTCHA Manager] 🔒 Đang có tác vụ giải đang chạy. Khóa Mutex ngăn chặn tác nhân thứ 2.");
      return;
    }

    // Nếu người dùng đã chọn chế độ Giải tay -> Không gửi về server
    if (stateManager.autoSolveDisabled) {
      console.log("[CAPTCHA Manager] Chế độ Tự Giải AI đang tắt. Giữ nguyên trạng thái để người dùng giải tay.");
      stateManager.transitionTo(CAPTCHA_STATES.MANUAL_REQUIRED, { reason: "auto_solve_disabled_by_user" });
      return;
    }

    if ([CAPTCHA_STATES.ANALYZING, CAPTCHA_STATES.INTERACTING, CAPTCHA_STATES.PENDING_VERIFICATION].includes(stateManager.currentState)) {
      return;
    }

    if (stateManager.currentSession && stateManager.currentSession.attempts >= stateManager.maxAutoAttempts) {
      stateManager.transitionTo(CAPTCHA_STATES.MANUAL_REQUIRED, { reason: "max_attempts_reached" });
      return;
    }

    const now = Date.now();
    if (now - stateManager.lastAttemptTime < stateManager.minCooldownMs) {
      return;
    }
    stateManager.lastAttemptTime = now;

    isSolvingMutex = true;
    const session = stateManager.currentSession || stateManager.createSession("slider");
    session.attempts++;

    try {
      const bgEl = document.querySelector(SELECTORS.PUZZLE_BG);
      const pieceEl = document.querySelector(SELECTORS.PUZZLE_PIECE);
      const sliderBtn = document.querySelector(SELECTORS.SLIDER_DRAG_BUTTON);

      const rotOuterEl = document.querySelector(SELECTORS.ROTATE_OUTER);
      const rotInnerEl = document.querySelector(SELECTORS.ROTATE_INNER);
      const rotSlideBarEl = document.querySelector(SELECTORS.ROTATE_SLIDE_BAR);

      // --- DẠNG 1: SLIDER CAPTCHA ---
      if (bgEl && pieceEl && sliderBtn && isElementVisible(bgEl) && isElementVisible(pieceEl)) {
        const bgSrc = bgEl.getAttribute("src");
        const pieceSrc = pieceEl.getAttribute("src");
        if (bgSrc && pieceSrc) {
          stateManager.transitionTo(CAPTCHA_STATES.ANALYZING, { session_id: session.sessionId, attempt: session.attempts });

          const [bgB64, pieceB64] = await Promise.all([
            fetchImageBase64(bgSrc),
            fetchImageBase64(pieceSrc)
          ]);

          if (session.isCancelled) return;

          const resp = await fetch(UNIFIED_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              captcha_type: "slider",
              image_bg: bgB64,
              image_piece: pieceB64
            }),
            signal: session.abortController.signal
          });

          const resData = await resp.json();
          if (!resData.success || !resData.data) {
            throw new Error(resData.error || "AI Hub không trả kết quả toạ độ");
          }

          if (session.isCancelled) return;

          const { slide_x_proportion, source, phash, raw_x } = resData.data;
          session.aiResult = { status: "SUCCESS", slide_x_proportion, confidence: resData.data.confidence, source };
          session.phash = phash;
          session.solution = slide_x_proportion;

          stateManager.transitionTo(CAPTCHA_STATES.INTERACTING, { proportion: slide_x_proportion, source });

          const bgRect = bgEl.getBoundingClientRect();
          const domWidth = bgRect.width;
          const pieceRect = pieceEl.getBoundingClientRect();
          const initialPieceOffset = Math.max(0, pieceRect.left - bgRect.left);

          let targetDistance = Math.round(slide_x_proportion * domWidth) - initialPieceOffset;
          if (targetDistance < 10) targetDistance = Math.round(slide_x_proportion * domWidth);

          await simulateBiometricDrag(sliderBtn, targetDistance, session);
          if (session.isCancelled) return;

          session.interactionResult = { status: "COMPLETED", targetDistance };

          stateManager.transitionTo(CAPTCHA_STATES.PENDING_VERIFICATION, { targetDistance });

          const verResult = await waitForPlatformVerification(() => {
            const el = document.querySelector(SELECTORS.PUZZLE_BG);
            return el && isElementVisible(el);
          }, 4500);

          if (session.isCancelled) return;
          session.platformStatus = verResult.status;

          if (verResult.status === "ACCEPTED") {
            stateManager.transitionTo(CAPTCHA_STATES.RESOLVED, { reason: "verified_success" });
            if (session.phash && !session.isCancelled) {
              fetch(FEEDBACK_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  phash: session.phash,
                  captcha_type: "slider",
                  exact_solution: session.solution,
                  is_correct: true
                })
              }).catch(() => {});
            }
          } else {
            console.warn(`[CAPTCHA Manager] Nền tảng từ chối (Lý do: ${verResult.reason})`);
            if (session.phash && !session.isCancelled) {
              fetch(FEEDBACK_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  phash: session.phash,
                  captcha_type: "slider",
                  exact_solution: session.solution,
                  is_correct: false
                })
              }).catch(() => {});
            }

            if (session.attempts < stateManager.maxAutoAttempts && !session.isCancelled) {
              stateManager.transitionTo(CAPTCHA_STATES.DETECTED, { reason: "retry_attempt_2" });
              await new Promise(r => setTimeout(r, 1800));
              const refreshBtn = document.querySelector(SELECTORS.REFRESH_BTN);
              if (refreshBtn && !session.isCancelled) {
                try { refreshBtn.click(); } catch(e){}
              }
              await new Promise(r => setTimeout(r, 2000));
            } else {
              stateManager.transitionTo(CAPTCHA_STATES.MANUAL_REQUIRED, { reason: "exceeded_max_attempts" });
            }
          }
          return;
        }
      }

      // --- DẠNG 2: ROTATE CAPTCHA ---
      if (rotOuterEl && rotInnerEl && sliderBtn && isElementVisible(rotOuterEl)) {
        const outerSrc = rotOuterEl.getAttribute("src");
        const innerSrc = rotInnerEl.getAttribute("src");
        if (outerSrc && innerSrc) {
          stateManager.transitionTo(CAPTCHA_STATES.ANALYZING, { session_id: session.sessionId });

          const [outerB64, innerB64] = await Promise.all([
            fetchImageBase64(outerSrc),
            fetchImageBase64(innerSrc)
          ]);

          if (session.isCancelled) return;

          const resp = await fetch(UNIFIED_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              captcha_type: "rotate",
              image_bg: outerB64,
              image_piece: innerB64
            }),
            signal: session.abortController.signal
          });

          const resData = await resp.json();
          if (!resData.success || !resData.data) {
            throw new Error(resData.error || "Server không trả kết quả góc xoay");
          }

          if (session.isCancelled) return;

          const { angle, source, phash } = resData.data;
          session.aiResult = { status: "SUCCESS", angle, source };
          session.phash = phash;
          session.solution = angle;

          stateManager.transitionTo(CAPTCHA_STATES.INTERACTING, { angle });

          const barWidth = rotSlideBarEl ? rotSlideBarEl.getBoundingClientRect().width : 340;
          const iconWidth = sliderBtn.getBoundingClientRect().width || 40;
          const targetDistance = Math.round(((barWidth - iconWidth) * angle) / 360);

          await simulateBiometricDrag(sliderBtn, targetDistance, session);
          if (session.isCancelled) return;

          session.interactionResult = { status: "COMPLETED", targetDistance };

          stateManager.transitionTo(CAPTCHA_STATES.PENDING_VERIFICATION, { targetDistance });

          const verResult = await waitForPlatformVerification(() => {
            const el = document.querySelector(SELECTORS.ROTATE_OUTER);
            return el && isElementVisible(el);
          }, 4500);

          if (session.isCancelled) return;
          session.platformStatus = verResult.status;

          if (verResult.status === "ACCEPTED") {
            stateManager.transitionTo(CAPTCHA_STATES.RESOLVED, { reason: "rotate_verified" });
            if (session.phash && !session.isCancelled) {
              fetch(FEEDBACK_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  phash: session.phash,
                  captcha_type: "rotate",
                  exact_solution: angle,
                  is_correct: true
                })
              }).catch(() => {});
            }
          } else {
            console.warn(`[CAPTCHA Manager] Rotate bị từ chối (${verResult.reason})`);
            if (session.phash && !session.isCancelled) {
              fetch(FEEDBACK_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  phash: session.phash,
                  captcha_type: "rotate",
                  exact_solution: angle,
                  is_correct: false
                })
              }).catch(() => {});
            }

            if (session.attempts < stateManager.maxAutoAttempts && !session.isCancelled) {
              stateManager.transitionTo(CAPTCHA_STATES.DETECTED, { reason: "retry_rotate" });
              await new Promise(r => setTimeout(r, 1800));
              const refreshBtn = document.querySelector(SELECTORS.REFRESH_BTN);
              if (refreshBtn && !session.isCancelled) {
                try { refreshBtn.click(); } catch(e){}
              }
              await new Promise(r => setTimeout(r, 2000));
            } else {
              stateManager.transitionTo(CAPTCHA_STATES.MANUAL_REQUIRED, { reason: "exceeded_max_attempts" });
            }
          }
          return;
        }
      }
    } catch (err) {
      if (err.name === "AbortError" || session.isCancelled) {
        console.log("[CAPTCHA Manager] Tác vụ đã được người dùng hủy thành công.");
      } else {
        console.warn("[CAPTCHA Manager] Lỗi trong luồng xử lý:", err.message);
        if (session.attempts >= stateManager.maxAutoAttempts) {
          stateManager.transitionTo(CAPTCHA_STATES.MANUAL_REQUIRED, { error: err.message });
        } else {
          stateManager.transitionTo(CAPTCHA_STATES.DETECTED, { error: err.message });
        }
      }
    } finally {
      isSolvingMutex = false;
    }
  }

  // ================= 7. GIÁM SÁT DOM VÀ PHÁT HIỆN SỰ KIỆN CAPTCHA =================
  function checkCaptchaInDOM() {
    if (!isCoordinatorActive()) {
      if (observer) observer.disconnect();
      if (pollTimer) clearInterval(pollTimer);
      return;
    }

    let found = false;
    for (const sel of SELECTORS.MODAL_DETECTORS) {
      const el = document.querySelector(sel);
      if (el && isElementVisible(el)) {
        found = true;
        break;
      }
    }

    if (found) {
      if (stateManager.currentState === CAPTCHA_STATES.IDLE || stateManager.currentState === CAPTCHA_STATES.RESOLVED) {
        stateManager.createSession("slider");
        stateManager.transitionTo(CAPTCHA_STATES.DETECTED);
        playAlertBeep();
        executeSolvePipeline();
      } else if (stateManager.currentState === CAPTCHA_STATES.DETECTED) {
        executeSolvePipeline();
      }
    } else {
      if (stateManager.currentState !== CAPTCHA_STATES.IDLE && stateManager.currentState !== CAPTCHA_STATES.RESOLVED) {
        console.log("[CAPTCHA Manager] Captcha đã biến mất khỏi màn hình -> Xác nhận RESOLVED.");
        stateManager.transitionTo(CAPTCHA_STATES.RESOLVED);
        
        try {
          chrome.runtime.sendMessage({
            type: "KOCVIP_PROGRESS_UPDATE",
            payload: { status: "captcha_resolved", message: "Đã giải xong Captcha. Tiếp tục công việc..." },
          });
        } catch {}

        setTimeout(() => {
          if (stateManager.currentState === CAPTCHA_STATES.RESOLVED) {
            stateManager.transitionTo(CAPTCHA_STATES.IDLE);
          }
        }, 1500);
      }
    }
  }

  function focusAndHighlightCaptcha() {
    let targetEl = null;
    for (const sel of SELECTORS.MODAL_DETECTORS) {
      const el = document.querySelector(sel);
      if (el && isElementVisible(el)) {
        targetEl = el.closest(".captcha-verify-container, .secsdk_captcha_modal, .captcha-disable-scroll") || el;
        break;
      }
    }

    if (!targetEl) {
      targetEl = document.querySelector(SELECTORS.CONTAINER) || document.querySelector(SELECTORS.PUZZLE_BG);
    }

    if (targetEl) {
      try {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        const oldBoxShadow = targetEl.style.boxShadow;
        const oldTransition = targetEl.style.transition;
        const oldOutline = targetEl.style.outline;

        targetEl.style.transition = "all 0.3s ease";
        targetEl.style.outline = "4px solid #EF4444";
        targetEl.style.outlineOffset = "4px";
        targetEl.style.boxShadow = "0 0 0 8px rgba(239, 68, 68, 0.4), 0 0 40px rgba(239, 68, 68, 0.7)";

        const sliderBtn = targetEl.querySelector(SELECTORS.SLIDER_DRAG_BUTTON) || document.querySelector(SELECTORS.SLIDER_DRAG_BUTTON);
        if (sliderBtn) {
          try { sliderBtn.focus(); } catch {}
        }

        setTimeout(() => {
          if (targetEl) {
            targetEl.style.outline = oldOutline || "";
            targetEl.style.outlineOffset = "";
            targetEl.style.boxShadow = oldBoxShadow || "";
            targetEl.style.transition = oldTransition || "";
          }
        }, 3500);
      } catch (err) {
        console.warn("[CAPTCHA Manager] Không thể highlight:", err);
      }
    }
  }

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "KOCVIP_FOCUS_CAPTCHA") {
        focusAndHighlightCaptcha();
      }
    });
  } catch {}

  let domCheckDebounce = null;
  const observer = new MutationObserver(() => {
    if (domCheckDebounce) clearTimeout(domCheckDebounce);
    domCheckDebounce = setTimeout(checkCaptchaInDOM, 250);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "style", "class"]
  });

  const pollTimer = setInterval(checkCaptchaInDOM, 1500);
  console.log(`[CAPTCHA State Manager] Single-Actor Mutex Loaded [${COORDINATOR_ID}].`);
})();
