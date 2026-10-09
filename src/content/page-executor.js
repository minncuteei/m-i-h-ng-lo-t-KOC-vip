/**
 * KOC VIP - TikTok page-context read/write executor (MAIN world).
 * Thực thi các lệnh gọi API trực tiếp trong ngữ cảnh trang TikTok Affiliate để mang theo Cookie/Session.
 * Hoàn toàn cục bộ, không gửi dữ liệu ra bất kỳ server nào bên ngoài TikTok.
 */
(function () {
  const REQUEST_SOURCE_PREFIX = "kocvip-job-runner-";
  const CLIENT_VERSION = "1.0.0";
  const BRIDGE_PATCH = "kocvip";
  const EXECUTOR_ID = `kocvip-page-executor-${CLIENT_VERSION}-${BRIDGE_PATCH}`;
  if (window[EXECUTOR_ID]) return;
  window[EXECUTOR_ID] = true;
  window.__KOCVIP_PAGE_EXECUTOR__ = true;

  const REQUEST_SOURCE = `kocvip-job-runner-${CLIENT_VERSION}-${BRIDGE_PATCH}`;
  const RESULT_SOURCE = `kocvip-page-executor-${CLIENT_VERSION}-${BRIDGE_PATCH}`;

  // Danh mục các endpoint TikTok được phép thực thi
  const ALLOWED = new Map([
    ["/api/v1/affiliate/account/all_sellers/get", "GET"],
    ["/api/v1/affiliate/account/info_v2", "GET"],
    ["/api/v1/affiliate/backend/category/get", "GET"],
    ["/api/v1/affiliate/product_selection/list", "POST"],
    ["/api/v1/product/local/products/list", "GET"],
    ["/api/v1/oec/affiliate/crm/creator/import_check", "POST"],
    ["/api/v1/oec/affiliate/seller/invitation_group/create", "POST"],
    ["/api/v1/oec/affiliate/seller/invitation_group/creators_add", "POST"],
    ["/api/v1/oec/affiliate/seller/invitation_group/conflict_check", "POST"],
    ["/api/v1/oec/affiliate/seller/invitation_group/conflict_check/resolve", "POST"],
    ["/api/v1/oec/affiliate/seller/invitation_group/sensitive_text_check", "POST"],
    ["/api/v1/oec/affiliate/seller/invitation_group/invitation/limit", "GET"],
    ["/api/v1/oec/affiliate/seller/invitation_group/rate_limit_info", "POST"],
    ["/api/v1/oec/affiliate/seller/invitation_group/search", "POST"],
    ["/api/v1/oec/affiliate/seller/invitation_group/terminate", "POST"],
    ["/api/v1/oec/affiliate/seller/invitation_group/product_creator_relation", "POST"],
    ["/api/v1/affiliate/notification/im/entrance_check", "POST"],
    ["/api/v1/oec/affiliate/seller/im/template/message", "POST"]
  ]);

  function cookieValue(name) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function pageShopContext() {
    const params = new URLSearchParams(window.location.search);
    const shopId =
      params.get("shop_id") || params.get("shopId") || params.get("oec_seller_id") ||
      window.globalShopData?.shopId || window.globalShopData?.shop_id ||
      cookieValue("x-jupiter-shop-id") || cookieValue("oec_seller_id") ||
      "";
    const region =
      params.get("shop_region") || params.get("region") ||
      window.globalShopData?.region || window.globalShopData?.shopRegion ||
      cookieValue("shop_region") ||
      "";
    return {
      shopId: String(shopId || "").trim(),
      shopRegion: String(region || "").trim().toUpperCase(),
    };
  }

  function validateShopContext(request) {
    const actual = pageShopContext();
    const expectedShopId = String(request.shopId || request.query?.shop_id || request.query?.oec_seller_id || "").trim();
    const expectedRegion = String(request.shopRegion || request.region || request.query?.shop_region || "").trim().toUpperCase();
    if (expectedShopId && actual.shopId && expectedShopId !== actual.shopId) {
      console.warn("[KOC VIP] TikTok page shop differs from request; using request shopId", { expectedShopId, actualShopId: actual.shopId });
    }
    if (expectedRegion && actual.shopRegion && expectedRegion !== actual.shopRegion) {
      console.warn("[KOC VIP] TikTok page region differs from request; using request region", { expectedRegion, actualRegion: actual.shopRegion });
    }
    return actual;
  }

  function addCommonQuery(url, request) {
    const pageParams = new URLSearchParams(window.location.search);
    const pageShop = pageShopContext();
    const fetchTKParams = String(window.globalShopData?.fetchTKParams || "");
    if (fetchTKParams) {
      new URLSearchParams(fetchTKParams).forEach((value, key) => {
        if (value !== "" && value != null) url.searchParams.set(key, value);
      });
    }
    const allowedPageKeys = new Set(["shop_id", "shopId", "oec_seller_id", "shop_region", "region"]);
    pageParams.forEach((value, key) => {
      if (allowedPageKeys.has(key) && value !== "" && value != null && !url.searchParams.has(key)) {
        url.searchParams.set(key, value);
      }
    });
    const defaults = {
      user_language: (navigator.language || "vi").split("-")[0] || "vi",
      aid: "4331",
      app_name: "i18n_ecom_alliance",
      device_id: "0",
      device_platform: "web",
      oec_seller_id: (request.shopId && request.shopId !== "default") ? request.shopId : (pageShop.shopId || ""),
      shop_region: (request.shopRegion && request.shopRegion !== "DEFAULT") ? request.shopRegion : (pageShop.shopRegion || "VN"),
    };
    Object.entries(defaults).forEach(([key, value]) => {
      if (value !== "" && value != null && !url.searchParams.has(key)) url.searchParams.set(key, String(value));
    });
    Object.entries(request.query || {}).forEach(([key, value]) => {
      if (value !== "" && value != null) url.searchParams.set(key, String(value));
    });
    if (!url.searchParams.has("msToken")) {
      const msToken = cookieValue("msToken");
      if (msToken) url.searchParams.set("msToken", msToken);
    }
  }

  function applyVerifyFingerprint(verifyHeader) {
    if (!verifyHeader) return "";
    let fingerprint = "";
    try {
      const parsed = JSON.parse(verifyHeader);
      fingerprint = String(parsed.fp || parsed.fingerprint || parsed.data?.fp || "");
    } catch {
      const match = String(verifyHeader).match(/(?:^|[?&,{\s\"])(?:fp|fingerprint)[\"']?\s*[:=]\s*[\"']?([^,}&\"'\s]+)/i);
      fingerprint = match?.[1] ? decodeURIComponent(match[1]) : "";
    }
    if (!fingerprint || !window.globalShopData) return fingerprint;
    const params = new URLSearchParams(String(window.globalShopData.fetchTKParams || ""));
    params.set("fp", fingerprint);
    window.globalShopData.fetchTKParams = params.toString();
    return fingerprint;
  }

  function cleanupTikTokCaptchaDOM() {
    try {
      const selectors = [
        ".captcha-disable-scroll",
        ".captcha-verify-container",
        "#captcha-verify-image",
        ".secsdk-captcha-drag-icon",
        "[data-testid='whirl-inner-img']",
      ];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el && el.style) el.style.display = "none";
        });
      });
    } catch {}
  }

  async function executeRequest(request) {
    const path = String(request.path || "");
    const method = String(request.method || "GET").toUpperCase();
    validateShopContext(request);
    const url = new URL(path, window.location.origin);
    addCommonQuery(url, request);

    if (request.query && typeof request.query === "object") {
      Object.entries(request.query).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
          url.searchParams.set(k, String(v));
        }
      });
    }

    if (request.noShopInject) {
      url.searchParams.delete("oec_seller_id");
      url.searchParams.delete("shop_id");
      url.searchParams.delete("shopId");
    }

    const abortCtrl = new AbortController();
    const abortTimer = setTimeout(() => abortCtrl.abort(), 20000);

    let response;
    try {
      response = await fetch(url.pathname + url.search, {
        method,
        credentials: "include",
        signal: abortCtrl.signal,
        headers: {
          Accept: "application/json, text/plain, */*",
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        body: method === "POST" ? JSON.stringify(request.body || {}) : undefined,
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("TikTok API không phản hồi sau 20s (mạng chậm hoặc bị TikTok giới hạn tần suất tạm thời)");
      }
      throw err;
    } finally {
      clearTimeout(abortTimer);
    }

    console.log("[KOC VIP API]", method, url.pathname + url.search, response.status);

    const text = await response.text();
    let body;
    let parsedJson = true;
    try {
      body = JSON.parse(text);
    } catch {
      parsedJson = false;
      body = {
        code: -1,
        nonJson: true,
        retryable: response.status >= 500,
        httpStatus: response.status,
        contentType: response.headers.get("content-type") || "",
        message: response.status === 404
          ? `Đường dẫn API TikTok không tồn tại trên trang này (HTTP 404). Vui lòng đảm bảo đang chạy trên tab TikTok Affiliate.`
          : `TikTok trả phản hồi không hợp lệ (HTTP ${response.status || 0}); hệ thống sẽ giảm tốc và thử lại.`,
      };
    }

    const verifyHeader = response.headers.get("bdturing-verify") || "";
    const msgLower = String(body.message || "").toLowerCase();
    const rawLower = parsedJson ? "" : String(text || "").slice(0, 12000).toLowerCase();

    const isInvalidParams = /invalid param|invalid input|invalid parameters|name invalid|ids is empty|verify your input|exceed max/.test(msgLower);
    const nhomDay = /exceed max creator num|exceed max/.test(msgLower);
    if (nhomDay) {
      body.retryable = false;
      body.nhomDay = true;
      body.message = 'Nhóm cộng tác đã đầy KOC (TikTok: "' + String(body.message || "").slice(0, 80) + '"). Cần tạo nhóm mới.';
    }

    // Chỉ coi là Captcha khi có tín hiệu xác minh thực sự, TUYỆT ĐỐI không bắt nhầm trên mã nguồn HTML thông thường
    const hasHtmlCaptchaChallenge = !parsedJson && (
      rawLower.includes("/__secsdk/captcha") ||
      rawLower.includes("captcha_verify_container") ||
      rawLower.includes("captcha-verify-container") ||
      rawLower.includes("id=\"captcha-verify-image\"") ||
      rawLower.includes("data-testid=\"whirl-inner-img\"")
    );

    const captchaSignals = !!verifyHeader
      || body.code === 30004009
      || (!isInvalidParams && response.status !== 404 && /captcha|verify[_-]?code|robot[_-]?check/i.test(msgLower))
      || hasHtmlCaptchaChallenge;

    const captchaRequired = !isInvalidParams && response.status !== 404 && captchaSignals;
    if (captchaRequired) {
      console.log("[KOC VIP Captcha] Phát hiện Captcha:", { code: body.code, message: body.message });
    }

    const loginHtml = !parsedJson && /passport|login|sign[ -]?in|đăng nhập|session expired|unauthorized/.test(rawLower);
    const sessionExpired = !captchaRequired && (response.status === 401 || response.status === 403 || response.status === 409 || loginHtml);

    const originalCode = body?.code ?? body?.data?.code ?? null;
    const originalMessage = String(body?.message || body?.msg || "");

    if (captchaRequired) {
      const fingerprint = applyVerifyFingerprint(verifyHeader);
      window.__KOCVIP_LAST_CAPTCHA_REQUEST__ = request;
      body = {
        ...(body || {}),
        originalCode,
        originalMessage,
        code: 98001004,
        captchaRequired: true,
        verifyHeader,
        fingerprint,
        failedRequest: request,
        message: body?.message || "TikTok yêu cầu xác minh Captcha — bộ giải đang tự xử lý.",
      };
    } else if (sessionExpired) {
      body = {
        ...(body || {}),
        originalCode,
        originalMessage,
        sessionExpired: true,
        message: "Phiên TikTok Affiliate đã hết hạn hoặc mất quyền truy cập shop. Vui lòng kiểm tra lại tab TikTok.",
      };
    }

    return { response, body };
  }

  function normalizeTikTokImText(text) {
    return String(text || "").trim();
  }

  function findTikTokImSdkContext() {
    return window.__im_sdk__ || window.imSdk || window.cooperationChatSdk || null;
  }

  async function executeTikTokImSend(request = {}) {
    if (!/(?:seller\/im|connection\/im|message|chat)/i.test(window.location.pathname + window.location.search)) {
      throw new Error("Trang TikTok hiện tại chưa phải Cooperation Chat");
    }
    const creatorId = String(request.creatorId || "").trim();
    if (!/^\d{8,}$/.test(creatorId)) throw new Error("KOC chưa có creator OEC ID hợp lệ");
    const clientMessageId = String(request.clientMessageId || "").trim();
    if (!/^[a-zA-Z0-9_-]{12,80}$/.test(clientMessageId)) throw new Error("Thiếu mã chống gửi trùng hợp lệ");

    const entranceRequest = {
      method: "POST",
      path: "/api/v1/affiliate/notification/im/entrance_check",
      body: { creator_oec_ids: [creatorId], im_entrance_type: 2 },
      shopId: request.shopId,
      shopRegion: request.shopRegion || request.region || "VN",
    };
    const entrance = await executeRequest(entranceRequest);
    const entranceBody = entrance.body || {};
    if (entranceBody?.captchaRequired) {
      return { sent: false, status: "captcha_required", message: entranceBody.message || "TikTok yêu cầu xác minh" };
    }
    const showMap = entranceBody?.data?.show_status || entranceBody?.show_status || entranceBody?.data?.showStatus || {};
    const showStatus = Number(showMap?.[creatorId] ?? entranceBody?.data?.show_status_map?.[creatorId] ?? 0);
    if (Number(entranceBody?.code || 0) !== 0 || showStatus !== 1) {
      return { sent: false, status: "skipped_unavailable", code: entranceBody?.code, showStatus, message: entranceBody?.message || "TikTok không cho phép nhắn KOC này" };
    }

    let content = normalizeTikTokImText(request.content);
    const invitationGroupId = String(request.invitationGroupId || request.groupId || "").trim();
    if (request.usePlatformTemplate === true && !invitationGroupId) {
      throw new Error("KOC chưa có mã lời mời thành công để tạo thẻ TikTok");
    }
    if (!content && request.usePlatformTemplate === true) {
      const generated = await executeRequest({
        method: "POST",
        path: "/api/v1/oec/affiliate/seller/im/template/message",
        body: {
          template_type: 1,
          creator_ids: [creatorId],
          extra_info: request.commissionRate ? { commissionRate: String(request.commissionRate) } : {},
        },
        shopId: request.shopId,
        shopRegion: request.shopRegion || request.region || "VN",
      });
      if (generated.body?.captchaRequired) {
        return { sent: false, status: "captcha_required", message: generated.body.message || "TikTok yêu cầu xác minh" };
      }
      content = normalizeTikTokImText(generated.body?.content || generated.body?.data?.content);
    }
    if (!content) throw new Error("TikTok không tạo được nội dung tin nhắn");

    const sdk = findTikTokImSdkContext();
    if (!sdk || (sdk.sdkStatus !== undefined && Number(sdk.sdkStatus) !== 2 && Number(sdk.sdkStatus) !== 1 && sdk.sdkStatus !== "ready")) {
      throw new Error("SDK Cooperation Chat chưa sẵn sàng; hãy chờ trang tải xong rồi thử lại");
    }

    const cardClientMessageId = `${clientMessageId.slice(0, 73)}_card`.slice(0, 80);
    const invitationCard = invitationGroupId ? {
      content: "[target_plan_card]",
      messageType: "targetPlan",
      ext: {
        type: "targetPlan",
        invitationId: invitationGroupId,
        starling_content_key: "im_creator_message_type_plan_card",
        "s:client_message_id": cardClientMessageId,
      },
    } : null;

    const textMessage = {
      content,
      messageType: "text",
      ext: { type: "text", "s:client_message_id": clientMessageId },
    };

    if (sdk.sendMessageToMultiUser) {
      const sendMulti = async message => {
        const failed = await sdk.sendMessageToMultiUser([{ targetId: creatorId, message }], {
          changeCurrentContact: false,
          switchToLastContact: false,
          enableFailedHook: false,
        });
        return Array.isArray(failed) && failed.length === 0;
      };
      const cardSent = invitationCard ? await sendMulti(invitationCard) : false;
      const textSent = await sendMulti(textMessage);
      const sent = textSent && (!invitationCard || cardSent);
      return {
        sent,
        cardSent,
        textSent,
        status: sent ? "sent" : "failed",
        creatorId,
        clientMessageId,
        renderedMessage: content,
        message: sent ? "" : "TikTok không tạo được hội thoại hoặc từ chối gửi tin",
      };
    }

    if (!sdk.createConversation) {
      throw new Error("SDK Cooperation Chat không có API tạo hội thoại tương thích");
    }
    const contact = await sdk.createConversation({ creatorId }, {
      changeCurrentContact: false,
      enableHooks: false,
    });
    const conversationId = String(
      contact?.conversationId || contact?.conversationShortId || contact?.conversation_short_id ||
      contact?.conversation?.conversationId || contact?.conversation?.conversationShortId ||
      contact?.conversation?.conversation_short_id || ""
    );
    if (!conversationId) throw new Error("TikTok không tạo được hội thoại với KOC");

    let cardSent = false;
    if (invitationCard) {
      cardSent = await sdk.sendMessage(conversationId, {
        clientId: cardClientMessageId,
        content: invitationCard.content,
        ext: invitationCard.ext,
      }, false);
    }
    const textSent = await sdk.sendMessage(conversationId, {
      clientId: clientMessageId,
      content,
      ext: { type: "text", "s:client_message_id": clientMessageId },
    }, false);

    return {
      sent: textSent === true && (!invitationCard || cardSent === true),
      cardSent,
      textSent: textSent === true,
      status: textSent === true && (!invitationCard || cardSent === true) ? "sent" : "failed",
      creatorId,
      conversationId,
      clientMessageId,
      renderedMessage: content,
    };
  }

  // Lắng nghe lệnh từ Content Script (kocvip-job-runner)
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || typeof message.source !== "string" || message.type !== "execute") return;
    if (!message.source.startsWith(REQUEST_SOURCE_PREFIX)) return;

    const { requestId, bridgeNonce, request = {} } = message;
    const replySource = typeof message.replySource === "string" && message.replySource ? message.replySource : RESULT_SOURCE;

    if (request.operation === "sendTikTokIm") {
      if (!requestId) return;
      try {
        const body = await executeTikTokImSend(request);
        window.postMessage({ source: replySource, type: "result", requestId, bridgeNonce, ok: body.sent === true || String(body.status || "").startsWith("skipped_"), body }, window.location.origin);
      } catch (error) {
        window.postMessage({ source: replySource, type: "result", requestId, bridgeNonce, ok: false, error: String(error?.message || error) }, window.location.origin);
      }
      return;
    }

    const path = String(request.path || "");
    const method = String(request.method || "GET").toUpperCase();
    const allowedMethod = ALLOWED.get(path);
    const methodOk = !!allowedMethod && String(allowedMethod).toUpperCase().split("|").includes(method);

    if (!requestId || !methodOk) {
      window.postMessage({
        source: replySource,
        type: "result",
        requestId,
        bridgeNonce,
        ok: false,
        error: `TikTok action is not allowlisted: ${path}`,
      }, window.location.origin);
      return;
    }

    try {
      const { response, body } = await executeRequest(request);
      window.postMessage({
        source: replySource,
        type: "result",
        requestId,
        bridgeNonce,
        ok: response.ok && !body?.captchaRequired,
        httpStatus: response.status,
        retryAfter: response.headers.get("Retry-After") || "",
        body,
      }, window.location.origin);
    } catch (error) {
      window.postMessage({
        source: replySource,
        type: "result",
        requestId,
        bridgeNonce,
        ok: false,
        error: String(error?.message || error),
      }, window.location.origin);
    }
  });
})();
