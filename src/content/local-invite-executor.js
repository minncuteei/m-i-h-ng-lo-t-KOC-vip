/**
 * KOC VIP - Local Invite Execution Engine (ISOLATED world).
 * Điều phối luồng mời hàng loạt KOC trên tab TikTok Shop Affiliate.
 * Hoàn toàn cục bộ, kết nối với page-executor qua postMessage và lưu trữ vào IndexedDB qua background.
 */
(function () {
  if (window.top !== window) return;
  const CLIENT_VERSION = "1.0.0";
  const BRIDGE_PATCH = "kocvip";
  const BRIDGE_PROTOCOL = `${CLIENT_VERSION}-${BRIDGE_PATCH}`;
  if (window.__KOCVIP_LOCAL_INVITE_EXECUTOR_VERSION === BRIDGE_PROTOCOL) return;
  window.__KOCVIP_LOCAL_INVITE_EXECUTOR_VERSION = BRIDGE_PROTOCOL;
  window.__KOCVIP_LOCAL_INVITE_EXECUTOR__ = true;

  const REQUEST_SOURCE = `kocvip-job-runner-${CLIENT_VERSION}-${BRIDGE_PATCH}`;
  const RESULT_SOURCE = `kocvip-page-executor-${CLIENT_VERSION}-${BRIDGE_PATCH}`;
  const BRIDGE_NONCE = crypto.randomUUID();

  const TERMINAL_CHUNK_STATUSES = new Set(["sent", "skipped", "failed", "waiting_daily_reset", "cancelled", "settled"]);
  const activeRuns = new Map();
  const kickedRuns = new Set();

  function isExtensionValid() {
    try {
      return Boolean(window.chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function safeGetURL(path) {
    try {
      if (!isExtensionValid()) return "";
      return chrome.runtime.getURL(path);
    } catch {
      return "";
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function cancellableSleep(ms, serverRunId) {
    const start = Date.now();
    return new Promise(resolve => {
      const timer = setInterval(() => {
        const controller = activeRuns.get(serverRunId);
        if (!controller || controller.cancelled || kickedRuns.has(serverRunId) || Date.now() - start >= ms) {
          clearInterval(timer);
          kickedRuns.delete(serverRunId);
          resolve();
        }
      }, 100);
    });
  }

  function setIntervalBenBi(callback, intervalMs) {
    let timer = null;
    let stopped = false;
    async function tick() {
      if (stopped) return;
      try { await callback(); } catch {}
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
    timer = setTimeout(tick, intervalMs);
    return () => { stopped = true; clearTimeout(timer); };
  }

  function extensionMessage(type, payload = {}, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; reject(new Error(`Message timeout (${type})`)); }
      }, timeoutMs);

      try {
        chrome.runtime.sendMessage({ type, payload }, response => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response?.data !== undefined ? response.data : response);
          }
        });
      } catch (err) {
        if (!done) { done = true; clearTimeout(timer); reject(err); }
      }
    });
  }

  function emitLog(text, isError = false) {
    try {
      chrome.runtime.sendMessage({
        type: "KOCVIP_LOG_ENTRY",
        payload: { text, isError },
      });
    } catch {}
  }

  function localDb(op, payload = {}) {
    return extensionMessage("KOCVIP_LOCAL_DB", { op, ...payload });
  }

  function getShopContext() {
    const params = new URLSearchParams(window.location.search);
    const matchShop = document.cookie.match(/(?:^|;\s*)(?:x-jupiter-shop-id|oec_seller_id)=([^;]*)/);
    const shopId = params.get("shop_id") || params.get("shopId") || params.get("oec_seller_id") || (matchShop ? decodeURIComponent(matchShop[1]) : "");
    const matchRegion = document.cookie.match(/(?:^|;\s*)shop_region=([^;]*)/);
    const region = params.get("shop_region") || params.get("region") || (matchRegion ? decodeURIComponent(matchRegion[1]) : "VN");
    return {
      shopId: String(shopId || "").trim(),
      region: String(region || "VN").trim().toUpperCase(),
    };
  }

  function ensurePageExecutorInjected() {
    try {
      if (document.getElementById("kocvip-page-executor-script")) return;
      const script = document.createElement("script");
      script.id = "kocvip-page-executor-script";
      script.src = safeGetURL("src/content/page-executor.js");
      (document.head || document.documentElement).appendChild(script);
    } catch {}
  }

  async function executeInPage(request) {
    ensurePageExecutorInjected();
    const requestId = crypto.randomUUID();
    const context = getShopContext();
    return new Promise((resolve, reject) => {
      const timerWarning = setTimeout(() => {
        emitLog(`[KOCVIP API] Đang chờ máy chủ TikTok phản hồi (${request.path})...`);
      }, 4000);

      const timeout = setTimeout(() => {
        clearTimeout(timerWarning);
        window.removeEventListener("message", onMessage);
        reject(new Error("TikTok API không phản hồi sau 25s (mạng chậm hoặc phiên TikTok đang bị tạm nghẽn)"));
      }, 25000);

      function onMessage(event) {
        if (event.source !== window || event.origin !== window.location.origin) return;
        const message = event.data;
        if (!message || message.source !== RESULT_SOURCE || message.requestId !== requestId || message.bridgeNonce !== BRIDGE_NONCE) return;
        clearTimeout(timeout);
        clearTimeout(timerWarning);
        window.removeEventListener("message", onMessage);

        if (message.body?.sessionExpired) {
          const sessionError = new Error(message.body.message || "Phiên TikTok Affiliate đã hết hạn");
          sessionError.code = "LOCAL_INVITE_SESSION_EXPIRED";
          reject(sessionError);
          return;
        }
        if (!message.ok && !message.body) reject(new Error(message.error || "TikTok request failed"));
        else resolve(message);
      }

      window.addEventListener("message", onMessage);
      window.postMessage({
        source: REQUEST_SOURCE,
        replySource: RESULT_SOURCE,
        type: "execute",
        requestId,
        bridgeNonce: BRIDGE_NONCE,
        request: {
          ...request,
          shopId: request.shopId || context.shopId,
          shopRegion: request.shopRegion || request.region || context.region,
        },
      }, window.location.origin);
    });
  }

  function endTimeMillis(expiresAt) {
    const date = expiresAt ? new Date(`${expiresAt}T23:59:59.000+07:00`) : new Date(Date.now() + 365 * 86400000);
    return String(date.getTime());
  }

  // DÁN NGUYÊN VĂN recipientPayload()
  function recipientPayload(recipient) {
    const creatorOecId = String(recipient.creatorOecId || "").trim();
    return {
      base_info: {
        creator_id: "",
        nick_name: "",
        creator_oec_id: creatorOecId,
      },
    };
  }

  // DÁN NGUYÊN VĂN tenNhomTheoLan()
  // Tên nhóm chuẩn hóa - không bao giờ nối _N1_N1
  function tenNhomTheoLan(groupName, soNhom) {
    const ten = String(groupName || "").trim();
    const lan = Math.max(1, Number(soNhom || 1));
    const cleanTen = ten.replace(/_N\d+$/i, "");
    if (lan <= 1) return cleanTen;
    const duoiThem = `_N${lan}`;
    if (cleanTen.length + duoiThem.length <= 30) return cleanTen + duoiThem;
    return cleanTen.slice(0, 30 - duoiThem.length) + duoiThem;
  }

  // DỰNG BODY CREATE KHỚP 100% HAR ENTRY 137 (TUYỆT ĐỐI KHÔNG CÓ has_flash_sale)
  function buildCreateBody(draft, recipients, groupName) {
    const contacts = [];
    if (draft.zalo) {
      contacts.push({
        title: "",
        field: 42,
        value: String(draft.zalo).replace(/\D/g, "").replace(/^84/, "").replace(/^0/, ""),
        country_code: "VN#84",
      });
    }
    if (draft.facebook) contacts.push({ title: "Facebook", field: 41, value: draft.facebook, country_code: "" });

    // Chuẩn hóa placeholder thành {{user_name}} theo đúng HAR
    const rawMsg = draft.message || "";
    const message = rawMsg
      .replace(/\{\{\s*creators?_?username\s*\}\}/gi, "{{user_name}}")
      .replace(/\{\{\s*creators?\s+username\s*\}\}/gi, "{{user_name}}");

    return {
      invitation_group: {
        name: groupName || draft.title || "",
        message,
        contacts_info: contacts,
        group_type: 1,
        free_sample_rule: {
          has_free_sample: !!draft.sampleEnabled,
          is_free_sample_auto_review: !!draft.sampleEnabled && draft.sampleApprovalMode === "auto",
          sample_setting_type: draft.sampleEnabled ? (draft.sampleApprovalMode === "auto" ? 2 : 1) : 0,
        },
        end_time: endTimeMillis(draft.expiresAt),
        product_list: (draft.products || [])
          .filter(product => Boolean(product.productId || product.product_id))
          .slice(0, 100)
          .map(product => {
            let comm = Number(product.target_commission || product.commissionBps || 0);
            if (!comm && (product.commissionRate || draft.commission)) {
              comm = Math.round(Number(product.commissionRate || draft.commission) * 100);
            }
            if (!comm) comm = 1000;

            let adsComm = Number(product.target_ads_commission || product.adsCommissionBps || 0);
            if (!adsComm && draft.adsCommission) {
              adsComm = Math.round(Number(draft.adsCommission) * 100);
            }
            if (!adsComm) adsComm = 100;

            return {
              product_id: String(product.productId || product.product_id || "").trim(),
              target_commission: comm,
              target_ads_commission: adsComm,
            };
          }),
        creator_id_list: recipients
          .map(recipientPayload)
          .filter(item => Boolean(item?.base_info?.creator_oec_id || item?.base_info?.creator_id)),
        delivery_requirements: {
          content_option: draft.contentPreference === "live" ? 2 : draft.contentPreference === "video" ? 1 : (draft.contentOption ?? 1),
        },
      },
    };
  }

  // DỰNG BODY CONFLICT_CHECK KHỚP 100% HAR ENTRY 126 & 135
  function buildConflictCheckBody(draft, recipients) {
    return {
      invitation: {
        product_list: (draft.products || [])
          .filter(product => Boolean(product.productId || product.product_id))
          .slice(0, 100)
          .map(product => {
            let comm = Number(product.target_commission || product.commissionBps || 0);
            if (!comm && (product.commissionRate || draft.commission)) {
              comm = Math.round(Number(product.commissionRate || draft.commission) * 100);
            }
            if (!comm) comm = 1000;

            let adsComm = Number(product.target_ads_commission || product.adsCommissionBps || 0);
            if (!adsComm && draft.adsCommission) {
              adsComm = Math.round(Number(draft.adsCommission) * 100);
            }
            if (!adsComm) adsComm = 100;

            return {
              product_id: String(product.productId || product.product_id || "").trim(),
              target_commission: comm,
              target_ads_commission: adsComm,
            };
          }),
        creator_id_list: recipients
          .map(recipientPayload)
          .filter(item => Boolean(item?.base_info?.creator_oec_id || item?.base_info?.creator_id)),
        group_type: 1,
      },
    };
  }

  // DÁN NGUYÊN VĂN buildCreatorsAddBody()
  function buildCreatorsAddBody(groupId, recipients) {
    return {
      group_id: String(groupId || ""),
      creator_ids: recipients
        .map(recipient => String(recipient.creatorOecId || recipient.creatorId || "").trim())
        .filter(Boolean),
    };
  }

  // DÁN NGUYÊN VĂN invitationEligibilityFingerprint()
  function invitationEligibilityFingerprint(draft, shopId, region) {
    const normalized = {
      version: 1,
      shopId: String(shopId || ""),
      region: String(region || "VN").toUpperCase(),
      groupType: 1,
      hasFlashSale: false,
      freeSampleRule: {
        hasFreeSample: !!draft?.sampleEnabled,
        autoReview: !!draft?.sampleEnabled && draft?.sampleApprovalMode === "auto",
        settingType: draft?.sampleEnabled ? (draft?.sampleApprovalMode === "auto" ? 2 : 1) : 0,
      },
      contentOption: draft?.contentPreference === "live" ? 2 : draft?.contentPreference === "video" ? 1 : 0,
      expiresAt: String(draft?.expiresAt || ""),
      message: String(draft?.message || ""),
      products: (draft?.products || []).map(product => ({
        productId: String(product?.productId || ""),
        commissionBps: Number(product?.commissionBps ?? draft?.commissionBps ?? 0),
        adsCommissionBps: Number(product?.adsCommissionBps ?? draft?.adsCommissionBps ?? 0),
      })),
    };
    const input = JSON.stringify(normalized);
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `eligibility-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function isTikTokSuccess(res) {
    const code = Number(res?.body?.code ?? -1);
    return res?.ok && (code === 0 || code === 200);
  }

  function recipientStatusPatch(item, status, reason = "") {
    return {
      ...item,
      status,
      reason: reason || item.reason || "",
      updatedAt: new Date().toISOString(),
    };
  }

  function isOecIdValid(id) {
    const s = String(id || "").trim();
    return /^\d{17,21}$/.test(s) && !s.endsWith("00000000");
  }

  async function resolveMissingOecIds(recipients, shopId, region) {
    const missing = recipients.filter(r => !isOecIdValid(r.creatorOecId));
    if (!missing.length) return;
    const batchSize = 50;
    for (let i = 0; i < missing.length; i += batchSize) {
      const slice = missing.slice(i, i + batchSize);
      const handleNames = slice.map(r => String(r.handle || "").replace(/^@/, "").trim()).filter(Boolean);
      if (!handleNames.length) continue;
      try {
        const res = await executeInPage({
          method: "POST",
          path: "/api/v1/oec/affiliate/crm/creator/import_check",
          body: { handle_names: handleNames },
          shopId,
          region,
        });
        const foundList = res?.body?.data?.creators || res?.body?.creators || [];
        const foundMap = new Map();
        for (const item of foundList) {
          const base = item.base || item.creator_base || item || {};
          const h = String(base.handle_name || item.handle_name || "").toLowerCase().trim();
          const oec = String(base.oec_id || base.creator_oec_id || item.oec_id || item.creator_oec_id || "").trim();
          if (h && isOecIdValid(oec)) foundMap.set(h, oec);
        }
        for (const r of slice) {
          const h = String(r.handle || "").replace(/^@/, "").toLowerCase().trim();
          if (foundMap.has(h)) r.creatorOecId = foundMap.get(h);
        }
      } catch (err) {
        console.warn("[KOC VIP] Tra cứu ID KOC lỗi:", err);
      }
      await sleep(500);
    }
  }

  // Thực thi 1 Chunk KOC
  async function executeChunk(manifest, chunk, controller) {
    if (TERMINAL_CHUNK_STATUSES.has(chunk.status)) return { state: "settled" };
    const pageContext = getShopContext();
    const shopId = (!manifest.shopId || manifest.shopId === "default") ? pageContext.shopId : manifest.shopId;
    const region = manifest.region && manifest.region !== "VN" && manifest.region !== "DEFAULT" ? manifest.region : (pageContext.region || "VN");
    const NHIP_TOI_THIEU_MS = 350;
    let nhipLenhCuoi = 0;

    const callTikTok = async req => {
      if (controller) controller.lastActivityAt = Date.now();
      const cachLan = Date.now() - nhipLenhCuoi;
      if (cachLan < NHIP_TOI_THIEU_MS) {
        const delay = NHIP_TOI_THIEU_MS - cachLan + Math.floor(Math.random() * 200);
        await cancellableSleep(delay, manifest.serverRunId);
      }
      nhipLenhCuoi = Date.now();
      return executeInPage(req);
    };

    // 1. Đảm bảo KOC có creatorOecId
    const validBefore = (chunk.recipients || []).filter(r => isOecIdValid(r.creatorOecId)).length;
    emitLog(`[KOCVIP] Chunk ${chunk.chunkId}: Có ${validBefore}/${chunk.recipients?.length || 0} KOC có creatorOecId sẵn.`);

    if (validBefore < (chunk.recipients?.length || 0)) {
      const missingCount = (chunk.recipients?.length || 0) - validBefore;
      emitLog(`[KOCVIP] Chunk ${chunk.chunkId}: Có ${missingCount} KOC chưa có OEC ID -> Đang gọi TikTok import_check...`);
      await resolveMissingOecIds(chunk.recipients || [], shopId, region);
      const validAfter = (chunk.recipients || []).filter(r => isOecIdValid(r.creatorOecId)).length;
      emitLog(`[KOCVIP] Chunk ${chunk.chunkId}: Sau import_check, có ${validAfter}/${chunk.recipients?.length || 0} KOC hợp lệ.`);
    }

    let recipients = (chunk.recipients || []).map(r => {
      if (!isOecIdValid(r.creatorOecId)) {
        return recipientStatusPatch(r, "failed", "Không tìm thấy OEC ID TikTok");
      }
      return r;
    });

    let pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));
    if (!pending.length) {
      emitLog(`[KOCVIP] [LỖI ĐỎ] Chunk ${chunk.chunkId}: Không có KOC nào có OEC ID hợp lệ để mời!`, true);
      await localDb("saveChunk", { manifest, chunk, patch: { status: "settled", recipients } });
      return { state: "settled" };
    }

    // 1b. Kiểm tra sản phẩm bắt buộc
    const selectedProducts = manifest.draft?.products || [];
    if (!selectedProducts.length) {
      emitLog(`[KOCVIP] [LỖI ĐỎ] Chunk ${chunk.chunkId}: Không có sản phẩm nào được chọn! TikTok bắt buộc phải có ít nhất 1 sản phẩm để gắn lời mời.`, true);
      recipients = recipients.map(r => recipientStatusPatch(r, "failed", "Chưa chọn sản phẩm trong lời mời (bắt buộc)"));
      await localDb("saveChunk", { manifest, chunk, patch: { status: "failed", recipients } });
      return { state: "failed" };
    }

    // 2. Conflict Check (Kiểm trùng)
    const conflictCheckBody = buildConflictCheckBody(manifest.draft || {}, pending);
    let conflictIds = new Set();
    const conflictInfoMap = new Map(); // oecId -> { oldGroupId, oldGroupName, userName, nickName }

    try {
      emitLog(`[KOCVIP API] Đang gọi conflict_check cho ${pending.length} KOC...`);
      const checkRes = await callTikTok({
        method: "POST",
        path: "/api/v1/oec/affiliate/seller/invitation_group/conflict_check",
        shopId,
        shopRegion: region,
        body: conflictCheckBody,
      });
      const checkCode = Number(checkRes?.body?.code ?? (checkRes?.httpStatus === 200 ? 0 : checkRes?.httpStatus ?? -1));
      const checkStatus = checkRes?.httpStatus || checkRes?.status || (checkRes?.ok ? 200 : 400);

      if (!checkRes?.ok || checkCode !== 0) {
        const msg = checkRes?.body?.message || checkRes?.error || "Lỗi kiểm tra trùng lặp";
        emitLog(`[KOCVIP API LỖI] conflict_check thất bại: HTTP ${checkStatus}, Code ${checkCode}: ${msg}`, true);
      } else {
        const data = checkRes?.body?.data || {};

        // 1. Đọc từ conflict_cids: [{ conflict_type: 4, cids: ["7494019818635626133", ...] }]
        const rawConflictCids = data.conflict_cids || [];
        for (const item of rawConflictCids) {
          if (Array.isArray(item?.cids)) {
            for (const cid of item.cids) {
              if (cid) conflictIds.add(String(cid).trim());
            }
          } else if (typeof item === "string" || typeof item === "number") {
            conflictIds.add(String(item).trim());
          }
        }

        // 2. Đọc từ conflict_list: [{ id, name, product_list, creator_id_list }]
        const rawConflictList = data.conflict_list || [];
        for (const group of rawConflictList) {
          const oldGroupId = group?.id || "";
          const oldGroupName = group?.name || "";
          for (const c of (group?.creator_id_list || [])) {
            const oec = String(c?.base_info?.creator_oec_id || "").trim();
            if (oec) {
              conflictIds.add(oec);
              conflictInfoMap.set(oec, {
                oldGroupId,
                oldGroupName,
                userName: c?.base_info?.user_name || "",
                nickName: c?.base_info?.nick_name || "",
              });
            }
          }
        }

        emitLog(`[KOCVIP API] conflict_check thành công (HTTP 200, Code 0). Phát hiện trùng: ${conflictIds.size} KOC.`);
        if (conflictIds.size > 0) {
          for (const cid of conflictIds) {
            const info = conflictInfoMap.get(cid);
            const creatorDisplay = info?.userName ? `@${info.userName} (${cid})` : cid;
            const groupDisplay = info?.oldGroupName ? `nhóm "${info.oldGroupName}"` : `nhóm ID ${info?.oldGroupId || "cũ"}`;
            emitLog(`[KOCVIP TRÙNG] KOC ${creatorDisplay} đang có lời mời hiệu lực tại ${groupDisplay}.`);
          }
        }
      }
    } catch (err) {
      emitLog(`[KOCVIP API LỖI] conflict_check ngoại lệ: ${err.message}`, true);
    }

    // 2b. Xử lý Chế độ Kiểm trùng nhanh (dryRunOnly)
    if (manifest.dryRunOnly) {
      recipients = recipients.map(r => {
        const oec = String(r.creatorOecId || "").trim();
        if (conflictIds.has(oec)) {
          const info = conflictInfoMap.get(oec);
          const desc = info?.oldGroupName ? `Trùng nhóm "${info.oldGroupName}"` : "Đang có lời mời hiệu lực";
          return recipientStatusPatch(r, "skipped", desc);
        }
        return r;
      });
      emitLog(`[KOCVIP] [KIỂM TRÙNG] Hoàn tất kiểm tra chunk ${chunk.chunkId}: ${conflictIds.size}/${pending.length} KOC bị trùng. Dừng trước khi tạo nhóm.`);
      await localDb("saveChunk", { manifest, chunk, patch: { status: "settled", recipients } });
      return { state: "settled" };
    }

    // 2c. Xử lý Trùng lặp cho đợt gửi thật
    const tuXuLyTrung = !!manifest.draft?.tuXuLyTrung;
    if (conflictIds.size > 0) {
      if (tuXuLyTrung) {
        // Tự động kéo KOC về lượt mời này (theo chuẩn HAR TikTok: group_pair & resolve_type: 1)
        try {
          const groupPair = [];
          for (const cid of conflictIds) {
            const info = conflictInfoMap.get(cid);
            if (info?.oldGroupId) {
              groupPair.push({
                invitation_group_id: String(info.oldGroupId),
                creator_id: String(cid),
              });
            }
          }

          if (groupPair.length > 0) {
            emitLog(`[KOCVIP API] Đang giải quyết trùng lặp (conflict_check/resolve) cho ${groupPair.length} KOC...`);
            const resolveRes = await callTikTok({
              method: "POST",
              path: "/api/v1/oec/affiliate/seller/invitation_group/conflict_check/resolve",
              shopId,
              shopRegion: region,
              body: {
                resolve_type: 1,
                group_pair: groupPair,
              },
            });
            const resolveCode = Number(resolveRes?.body?.code ?? (resolveRes?.httpStatus === 200 ? 0 : resolveRes?.httpStatus ?? -1));
            const resolveStatus = resolveRes?.httpStatus || resolveRes?.status || (resolveRes?.ok ? 200 : 400);

            if (!resolveRes?.ok || resolveCode !== 0) {
              const msg = resolveRes?.body?.message || resolveRes?.error || "TikTok không hỗ trợ gỡ trùng tự động";
              emitLog(`[KOCVIP API CẢNH BÁO] Không thể gỡ trùng (HTTP ${resolveStatus}, Code ${resolveCode}: ${msg}) -> Tự động LOẠI TRỪ ${conflictIds.size} KOC trùng để bảo vệ nhóm không bị lỗi 50001702.`, true);
              recipients = recipients.map(r => {
                const oec = String(r.creatorOecId || "").trim();
                if (conflictIds.has(oec)) {
                  const info = conflictInfoMap.get(oec);
                  const desc = info?.oldGroupName ? `Trùng nhóm "${info.oldGroupName}"` : "Đang có lời mời hiệu lực";
                  return recipientStatusPatch(r, "skipped", `${desc} (Tự động loại trừ do trùng)`);
                }
                return r;
              });
              pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));
            } else {
              emitLog(`[KOCVIP API] Giải quyết trùng lặp thành công! Đã gỡ ${groupPair.length} KOC khỏi nhóm cũ để mời vào nhóm mới.`);
              // Kiểm tra lại lần nữa để loại trừ bất kỳ KOC nào còn sót lại nếu chưa hết trùng
              try {
                const recheck = await callTikTok({
                  method: "POST",
                  path: "/api/v1/oec/affiliate/seller/invitation_group/conflict_check",
                  shopId,
                  shopRegion: region,
                  body: conflictCheckBody,
                });
                const redata = recheck?.body?.data || {};
                const remainingConflicts = new Set();
                for (const item of (redata.conflict_cids || [])) {
                  if (Array.isArray(item?.cids)) item.cids.forEach(c => remainingConflicts.add(String(c)));
                }
                if (remainingConflicts.size > 0) {
                  emitLog(`[KOCVIP] Còn ${remainingConflicts.size} KOC chưa thể gỡ -> Tự động loại trừ.`);
                  recipients = recipients.map(r => {
                    const oec = String(r.creatorOecId || "").trim();
                    if (remainingConflicts.has(oec)) {
                      return recipientStatusPatch(r, "skipped", "Đang có lời mời hiệu lực (Tự động loại trừ do trùng)");
                    }
                    return r;
                  });
                  pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));
                }
              } catch (_) {}
            }
          } else {
            // Không có oldGroupId trong conflict_list -> Fallback loại trừ
            emitLog(`[KOCVIP] Không xác định được nhóm cũ để gỡ -> Tự động LOẠI TRỪ ${conflictIds.size} KOC trùng.`);
            recipients = recipients.map(r => {
              const oec = String(r.creatorOecId || "").trim();
              if (conflictIds.has(oec)) {
                return recipientStatusPatch(r, "skipped", "Đang có lời mời hiệu lực (Tự động loại trừ do trùng)");
              }
              return r;
            });
            pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));
          }
        } catch (err) {
          emitLog(`[KOCVIP API LỖI] Ngoại lệ gỡ trùng: ${err.message} -> Tự động loại trừ KOC trùng để bảo vệ nhóm.`, true);
          recipients = recipients.map(r => {
            const oec = String(r.creatorOecId || "").trim();
            if (conflictIds.has(oec)) {
              return recipientStatusPatch(r, "skipped", "Đang có lời mời hiệu lực (Tự động loại trừ do trùng)");
            }
            return r;
          });
          pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));
        }
      } else {
        // KHÔNG TÍCH "KÉO VỀ": LOẠI BỎ HOÀN TOÀN KOC TRÙNG KHỎI CHUNK (KHÔNG ĐƯA VÀO CREATE)
        emitLog(`[KOCVIP] Tùy chọn 'Kéo KOC trùng' đang TẮT. Tự động LOẠI TRỪ ${conflictIds.size} KOC bị trùng ra khỏi nhóm để bảo vệ nhóm an toàn.`);
        recipients = recipients.map(r => {
          const oec = String(r.creatorOecId || "").trim();
          if (conflictIds.has(oec)) {
            const info = conflictInfoMap.get(oec);
            const desc = info?.oldGroupName ? `Trùng nhóm "${info.oldGroupName}"` : "Đang có lời mời hiệu lực";
            return recipientStatusPatch(r, "skipped", `${desc} (Tự động loại trừ do trùng)`);
          }
          return r;
        });
        pending = recipients.filter(r => !["sent", "failed", "skipped"].includes(r.status));
      }
    }

    if (!pending.length) {
      emitLog(`[KOCVIP] Chunk ${chunk.chunkId}: Toàn bộ KOC đều bị trùng (đã loại trừ) hoặc không có KOC hợp lệ. Hoàn tất chunk an toàn.`);
      await localDb("saveChunk", { manifest, chunk, patch: { status: "settled", recipients } });
      return { state: "settled" };
    }

    // 3. Kiểm tra từ nhạy cảm trong tin nhắn
    if (!controller.daKiemNoiDung && manifest.draft?.message) {
      controller.daKiemNoiDung = true;
      try {
        await callTikTok({
          method: "POST",
          path: "/api/v1/oec/affiliate/seller/invitation_group/sensitive_text_check",
          shopId,
          shopRegion: region,
          body: { text: String(manifest.draft.message) },
        });
      } catch {}
    }

    // 4. Tạo nhóm lời mời (Create Invitation Group)
    const tenNhom = tenNhomTheoLan(chunk.groupName, chunk.soNhomDaMo || 1);
    const createBody = buildCreateBody(manifest.draft || {}, pending, tenNhom);
    emitLog(`[KOCVIP API] Đang gửi API tạo nhóm lời mời "${tenNhom}" cho ${pending.length} KOC...`);

    const createRes = await callTikTok({
      method: "POST",
      path: "/api/v1/oec/affiliate/seller/invitation_group/create",
      shopId,
      shopRegion: region,
      body: createBody,
    });

    const createCode = Number(createRes?.body?.code ?? (createRes?.httpStatus === 200 ? 0 : createRes?.httpStatus ?? -1));
    const createStatus = createRes?.httpStatus || createRes?.status || (createRes?.ok ? 200 : 400);

    // Xử lý hết hạn mức ngày
    if (createCode === 16024034 || createCode === 16024035) {
      const limitMsg = createRes?.body?.message || "Hết hạn mức mời ngày của Shop — chờ 0h reset";
      emitLog(`[KOCVIP API LỖI] Shop hết hạn mức ngày (HTTP ${createStatus}, Code ${createCode}): ${limitMsg}`, true);
      recipients = recipients.map(r => r.status === "local_pending" ? recipientStatusPatch(r, "waiting_daily_reset", `Hết hạn mức ngày (Code ${createCode})`) : r);
      await localDb("saveChunk", { manifest, chunk, patch: { status: "waiting_daily_reset", recipients } });
      return { state: "waiting_daily_reset" };
    }

    // Theo HAR Entry 137, ID nằm trong data.invitation.id
    const groupId = String(
      createRes?.body?.data?.invitation?.id ||
      createRes?.body?.data?.invitation_group_id ||
      createRes?.body?.invitation_group_id ||
      createRes?.body?.data?.id ||
      ""
    );

    if (!createRes?.ok || createCode !== 0 || !groupId) {
      const errMsg = createRes?.body?.message || createRes?.error || "Không tạo được nhóm lời mời trên TikTok";
      emitLog(`[KOCVIP API LỖI] create nhóm "${tenNhom}" THẤT BẠI: HTTP ${createStatus}, Code ${createCode}: ${errMsg}`, true);

      // XỬ LÝ ĐẶC BIỆT LỖI 16024016 (The invitation failed because the creator is linked with a shop account):
      // Trong nhóm có KOC là tài khoản chính thức hoặc tiếp thị của một Shop TikTok (không được nhận lời mời Affiliate).
      // Thay vì làm hỏng cả nhóm và dừng đợt mời, tự động CÔ LẬP và LOẠI BỎ KOC lỗi, gửi lời mời cho các KOC hợp lệ còn lại!
      if (createCode === 16024016 || errMsg.toLowerCase().includes("linked with a shop account")) {
        if (pending.length === 1) {
          const badKoc = pending[0];
          const kocName = badKoc.handle ? `@${badKoc.handle}` : badKoc.creatorOecId;
          emitLog(`[KOCVIP BỎ QUA] KOC ${kocName} là tài khoản liên kết Shop (Mã 16024016) -> Tự động bỏ qua.`);
          recipients = recipients.map(r => r.creatorOecId === badKoc.creatorOecId ? recipientStatusPatch(r, "skipped", "Tài khoản liên kết Shop (Không thể nhận lời mời Affiliate - Mã 16024016)") : r);
          await localDb("saveChunk", { manifest, chunk, patch: { status: "settled", recipients } });
          return { state: "settled" };
        }

        emitLog(`[KOCVIP TỰ ĐỘNG CÔ LẬP] Phát hiện KOC liên kết Shop trong nhóm ${pending.length} KOC. Đang tự động tách từng KOC để loại trừ KOC lỗi và cứu các KOC còn lại...`);
        let anySuccess = false;
        let lastCreatedGroupId = "";

        for (let pIdx = 0; pIdx < pending.length; pIdx++) {
          const singleKoc = pending[pIdx];
          const singleName = tenNhomTheoLan(`${chunk.groupName}_${pIdx + 1}`, chunk.soNhomDaMo || 1);
          const singleBody = buildCreateBody(manifest.draft || {}, [singleKoc], singleName);
          const kocName = singleKoc.handle ? `@${singleKoc.handle}` : singleKoc.creatorOecId;

          try {
            const singleRes = await callTikTok({
              method: "POST",
              path: "/api/v1/oec/affiliate/seller/invitation_group/create",
              shopId,
              shopRegion: region,
              body: singleBody,
            });

            const sCode = Number(singleRes?.body?.code ?? (singleRes?.httpStatus === 200 ? 0 : singleRes?.httpStatus ?? -1));
            const sGid = String(
              singleRes?.body?.data?.invitation?.id ||
              singleRes?.body?.data?.invitation_group_id ||
              singleRes?.body?.invitation_group_id ||
              singleRes?.body?.data?.id ||
              ""
            );

            if (sCode === 0 && sGid) {
              anySuccess = true;
              lastCreatedGroupId = sGid;
              emitLog(`[KOCVIP CỨU THÀNH CÔNG] KOC ${kocName} gửi lời mời thành công! (Group ID: ${sGid})`);
              recipients = recipients.map(r => r.creatorOecId === singleKoc.creatorOecId ? { ...recipientStatusPatch(r, "sent", "Đã gửi lời mời thành công"), groupId: sGid } : r);
            } else if (sCode === 16024016 || (singleRes?.body?.message || "").toLowerCase().includes("linked with a shop account")) {
              emitLog(`[KOCVIP ĐÃ XÁC ĐỊNH] KOC ${kocName} chính là tài khoản liên kết Shop (Mã 16024016) -> Bỏ qua an toàn.`);
              recipients = recipients.map(r => r.creatorOecId === singleKoc.creatorOecId ? recipientStatusPatch(r, "skipped", "Tài khoản liên kết Shop (Không thể nhận lời mời Affiliate - Mã 16024016)") : r);
            } else {
              const sErr = singleRes?.body?.message || singleRes?.error || "Lỗi tạo lời mời";
              emitLog(`[KOCVIP] KOC ${kocName} lỗi (Code ${sCode}): ${sErr}`, true);
              recipients = recipients.map(r => r.creatorOecId === singleKoc.creatorOecId ? recipientStatusPatch(r, "failed", `Mã ${sCode}: ${sErr}`) : r);
            }
          } catch (eSingle) {
            emitLog(`[KOCVIP] KOC ${kocName} ngoại lệ: ${eSingle.message}`, true);
            recipients = recipients.map(r => r.creatorOecId === singleKoc.creatorOecId ? recipientStatusPatch(r, "failed", eSingle.message) : r);
          }
          await sleep(400);
        }

        const chunkStatus = anySuccess ? "sent" : "settled";
        await localDb("saveChunk", { manifest, chunk, patch: { status: chunkStatus, groupId: lastCreatedGroupId, recipients } });
        return { state: chunkStatus, groupId: lastCreatedGroupId };
      }

      recipients = recipients.map(r => pending.some(p => p.creatorOecId === r.creatorOecId) ? recipientStatusPatch(r, "failed", `HTTP ${createStatus}, Code ${createCode}: ${errMsg}`) : r);
      await localDb("saveChunk", { manifest, chunk, patch: { status: "failed", recipients } });
      return { state: "failed", code: createCode, error: errMsg };
    }

    emitLog(`[KOCVIP API] create nhóm "${tenNhom}" THÀNH CÔNG (Group ID: ${groupId}) cho ${pending.length} KOC!`);

    // Nhóm đã tạo thành công
    recipients = recipients.map(r => {
      if (pending.some(p => p.creatorOecId === r.creatorOecId)) {
        return { ...recipientStatusPatch(r, "sent", "Đã gửi lời mời thành công"), groupId };
      }
      return r;
    });

    await localDb("saveChunk", { manifest, chunk, patch: { status: "sent", groupId, recipients } });
    return { state: "sent", groupId };
  }

  // Gửi tin nhắn Cooperation Chat sau khi mời
  async function sendPostInviteChatMessages(manifest, chunks) {
    if (manifest.draft?.shareAfterInvite !== true) return;
    const shareMessage = String(manifest.draft?.shareMessage || manifest.draft?.message || "").trim();
    for (const chunk of chunks || []) {
      for (const r of chunk.recipients || []) {
        if (r.status !== "sent" || r.shareStatus === "sent") continue;
        const creatorId = String(r.creatorOecId || "").trim();
        const groupId = String(r.groupId || chunk.groupId || "").trim();
        if (!/^\d{8,}$/.test(creatorId) || !groupId) continue;

        try {
          const clientMessageId = `kocvip_chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const res = await executeInPage({
            operation: "sendTikTokIm",
            creatorId,
            content: shareMessage,
            usePlatformTemplate: true,
            invitationGroupId: groupId,
            clientMessageId,
            shopId: manifest.shopId,
            shopRegion: manifest.region || "VN",
          });
          r.shareStatus = res?.body?.sent ? "sent" : "failed";
        } catch {
          r.shareStatus = "failed";
        }
        await sleep(600);
      }
      await localDb("saveChunk", { manifest, chunk, patch: { recipients: chunk.recipients } });
    }
  }

  // Luồng thực thi toàn bộ Đợt Mời (Run)
  async function executeRun(manifest) {
    if (!manifest?.serverRunId) {
      emitLog("[KOCVIP] [LỖI ĐỎ] Thiếu manifest hoặc serverRunId!", true);
      return;
    }
    if (activeRuns.has(manifest.serverRunId)) {
      emitLog(`[KOCVIP] Đợt mời ${manifest.serverRunId} đang chạy, bỏ qua yêu cầu khởi động trùng lặp.`);
      return;
    }

    const controller = { paused: false, cancelled: false, lastActivityAt: Date.now() };
    activeRuns.set(manifest.serverRunId, controller);

    const pageContext = getShopContext();
    if (!manifest.shopId || manifest.shopId === "default") {
      manifest.shopId = pageContext.shopId || "";
    }
    if (!manifest.region || manifest.region === "DEFAULT") {
      manifest.region = pageContext.region || "VN";
    }

    emitLog(`[KOCVIP] Bắt đầu executeRun: runId = ${manifest.serverRunId}, shopId = ${manifest.shopId || "default"}`);

    try {
      await localDb("saveManifest", { manifest });
      await localDb("updateRun", { serverRunId: manifest.serverRunId, patch: { status: "running" } });
      emitLog(`[KOCVIP] Đã lưu manifest vào IndexedDB. Đang đọc chunks...`);

      let chunks = await localDb("listChunks", { serverRunId: manifest.serverRunId });

      // Fallback nếu chunks bị rỗng do bất kỳ lý do gì: tự động phân chia từ draft.recipients
      if (!Array.isArray(chunks) || !chunks.length) {
        const fallbackRecipients = manifest.draft?.recipients || manifest.recipients || [];
        if (fallbackRecipients.length > 0) {
          emitLog(`[KOCVIP] CẢNH BÁO: chunks trong DB rỗng nhưng tìm thấy ${fallbackRecipients.length} KOC trong draft. Đang tự động chia chunk...`);
          await localDb("saveManifest", { manifest });
          chunks = await localDb("listChunks", { serverRunId: manifest.serverRunId });
        }
      }

      emitLog(`[KOCVIP] Đọc IndexedDB: tìm thấy ${chunks?.length || 0} chunk(s) cho runId = ${manifest.serverRunId}`);

      if (!Array.isArray(chunks) || !chunks.length) {
        emitLog(`[KOCVIP] [LỖI ĐỎ] Không đọc được chunk từ IndexedDB hoặc đợt mời không có KOC nào! Hủy thực thi.`, true);
        await localDb("updateRun", { serverRunId: manifest.serverRunId, patch: { status: "failed", error: "Không đọc được chunk từ IndexedDB" } });
        chrome.runtime.sendMessage({
          type: "KOCVIP_PROGRESS_UPDATE",
          payload: { serverRunId: manifest.serverRunId, status: "failed", error: "Không đọc được chunk từ IndexedDB", completed: true },
        });
        return;
      }

      const totalRecipients = chunks.reduce((acc, c) => acc + (c.recipients?.length || 0), 0);
      emitLog(`[KOCVIP] Tổng số recipient trên tất cả chunk: ${totalRecipients} KOC.`);
      if (totalRecipients === 0) {
        emitLog(`[KOCVIP] [LỖI ĐỎ] Tổng số KOC trong các chunk = 0! Dừng đợt mời.`, true);
        await localDb("updateRun", { serverRunId: manifest.serverRunId, patch: { status: "failed", error: "Tổng số KOC = 0" } });
        chrome.runtime.sendMessage({
          type: "KOCVIP_PROGRESS_UPDATE",
          payload: { serverRunId: manifest.serverRunId, status: "failed", error: "Tổng số KOC = 0", completed: true },
        });
        return;
      }

      let pending = chunks.filter(c => !TERMINAL_CHUNK_STATUSES.has(c.status));
      let exitReason = "Đã hoàn thành tất cả chunks";
      let lastChunkResult = null;

      // Watchdog 90s canh kẹt tiến trình
      const watchdogTimer = setIntervalBenBi(() => {
        if (controller.cancelled || controller.paused) return;
        if (Date.now() - controller.lastActivityAt > 90000) {
          emitLog("[KOCVIP Watchdog] Kẹt 90s không phản hồi -> Thử kích hoạt lại tiến trình", true);
          kickedRuns.add(manifest.serverRunId);
          controller.lastActivityAt = Date.now();
        }
      }, 15000);

      while (pending.length && !controller.cancelled) {
        if (controller.paused) {
          await sleep(1000);
          continue;
        }

        const chunk = pending[0];
        emitLog(`[KOCVIP] Bắt đầu chunk ${chunk.chunkId} (${chunk.groupName || "Nhóm"}): Có ${chunk.recipients?.length || 0} KOC.`);
        const res = await executeChunk(manifest, chunk, controller);
        lastChunkResult = res;

        // Bắn tiến độ về Side Panel / UI
        try {
          chrome.runtime.sendMessage({
            type: "KOCVIP_PROGRESS_UPDATE",
            payload: { serverRunId: manifest.serverRunId, chunkId: chunk.chunkId, status: res.state },
          });
        } catch {}

        if (res.state === "waiting_daily_reset") {
          exitReason = "Shop chạm hạn mức mời ngày của TikTok (chờ 0h reset)";
          emitLog(`[KOCVIP] Thoát vòng lặp executeRun: ${exitReason}`, true);
          break;
        }

        if (res.state === "failed") {
          exitReason = `Dừng đợt mời do lỗi tại chunk ${chunk.chunkId} (Mã lỗi ${res.code || 0}): ${res.error || "TikTok từ chối tạo nhóm"}`;
          emitLog(`[KOCVIP] [DỪNG TIẾN TRÌNH] ${exitReason}`, true);
          break;
        }

        if (manifest.dryRunOnly) {
          exitReason = "Hoàn tất kiểm trùng (Chế độ kiểm tra nhanh)";
          emitLog(`[KOCVIP] Thoát vòng lặp executeRun: ${exitReason}`);
          break;
        }

        if (controller.cancelled) {
          exitReason = "Người dùng bấm HỦY đợt mời";
          emitLog(`[KOCVIP] Thoát vòng lặp executeRun: ${exitReason}`);
          break;
        }

        chunks = await localDb("listChunks", { serverRunId: manifest.serverRunId });
        const dbPending = chunks.filter(c => !TERMINAL_CHUNK_STATUSES.has(c.status));
        pending = dbPending.filter(c => c.chunkId !== chunk.chunkId);
      }

      watchdogTimer();

      if (!controller.cancelled && lastChunkResult?.state !== "waiting_daily_reset" && !pending.length) {
        emitLog(`[KOCVIP] Thoát vòng lặp executeRun: ${exitReason}`);
      }

      // Gửi Cooperation Chat nếu có cấu hình
      if (!controller.cancelled && manifest.draft?.shareAfterInvite) {
        emitLog("[KOCVIP] Bắt đầu gửi tin nhắn trao đổi (Cooperation Chat)...");
        await sendPostInviteChatMessages(manifest, chunks);
      }

      const finalStatus = controller.cancelled ? "cancelled" : (pending.length ? "paused" : "completed");
      await localDb("updateRun", { serverRunId: manifest.serverRunId, patch: { status: finalStatus } });

      try {
        chrome.runtime.sendMessage({
          type: "KOCVIP_PROGRESS_UPDATE",
          payload: { serverRunId: manifest.serverRunId, status: finalStatus, completed: true },
        });
      } catch {}
    } catch (err) {
      emitLog(`[KOCVIP Run LỖI] Ngoại lệ executeRun: ${err.message}`, true);
      await localDb("updateRun", { serverRunId: manifest.serverRunId, patch: { status: "failed", error: String(err?.message || err) } });
    } finally {
      activeRuns.delete(manifest.serverRunId);
    }
  }

  // Lắng nghe lệnh điều khiển từ background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const { type, payload = {} } = message || {};

    if (type === "KOCVIP_LOCAL_INVITE_START") {
      const manifest = payload.manifest;
      if (!manifest?.serverRunId) {
        sendResponse({ success: false, error: "Thiếu manifest đợt mời" });
        return false;
      }
      executeRun(manifest);
      sendResponse({ success: true, data: { accepted: true, serverRunId: manifest.serverRunId } });
      return false;
    }

    if (type === "KOCVIP_LOCAL_INVITE_PAUSE") {
      const controller = activeRuns.get(payload.serverRunId);
      if (controller) controller.paused = true;
      localDb("updateRun", { serverRunId: payload.serverRunId, patch: { paused: true, status: "paused" } });
      sendResponse({ success: true });
      return false;
    }

    if (type === "KOCVIP_LOCAL_INVITE_RESUME") {
      const controller = activeRuns.get(payload.serverRunId);
      if (controller) {
        controller.paused = false;
        kickedRuns.add(payload.serverRunId);
      } else {
        localDb("getRun", { serverRunId: payload.serverRunId }).then(run => {
          if (run) executeRun(run);
        });
      }
      localDb("updateRun", { serverRunId: payload.serverRunId, patch: { paused: false, status: "running" } });
      sendResponse({ success: true });
      return false;
    }

    if (type === "KOCVIP_LOCAL_INVITE_STOP") {
      const controller = activeRuns.get(payload.serverRunId);
      if (controller) { controller.cancelled = true; controller.paused = false; }
      localDb("cancelRun", { serverRunId: payload.serverRunId });
      sendResponse({ success: true });
      return false;
    }

    if (type === "KOCVIP_EXECUTE_TIKTOK_PRODUCT_LIST") {
      (async () => {
        const page = Number(payload.page || payload.page_number || payload.cur_page || 1);
        const pageSize = Number(payload.pageSize || payload.page_size || 50);
        const keyword = String(payload.keyword || "").trim();
        const searchParams = keyword ? [{ key: 1, search_type: 1, value: keyword }] : [];
        const body = {
          cur_page: page,
          page_number: page,
          page_size: pageSize,
          search_params: searchParams,
          source: 2,
        };
        console.log("[KOC VIP] Quét sản phẩm trang:", page, "kích thước:", pageSize, body);
        const res = await executeInPage({
          method: "POST",
          path: "/api/v1/affiliate/product_selection/list",
          body,
        });
        console.log("[KOC VIP] Kết quả TikTok trả về cho sản phẩm:", res);
        if (!res?.ok || (res.body?.code !== undefined && Number(res.body.code) !== 0)) {
          const errMsg = res?.body?.message || res?.error || `HTTP ${res?.httpStatus || 400}`;
          const errCode = res?.body?.code ?? res?.httpStatus ?? -1;
          throw new Error(`TikTok lỗi (Code ${errCode}): ${errMsg}`);
        }
        sendResponse({ success: true, result: res?.body || res });
      })().catch(err => {
        console.error("[KOC VIP] Lỗi nạp sản phẩm:", err);
        sendResponse({ success: false, error: String(err?.message || err) });
      });
      return true;
    }

    if (type === "KOCVIP_IMPORT_CHECK_HANDLES") {
      (async () => {
        const handleNames = Array.isArray(payload.handleNames) ? payload.handleNames : [];
        const res = await executeInPage({
          method: "POST",
          path: "/api/v1/oec/affiliate/crm/creator/import_check",
          body: { handle_names: handleNames },
        });
        if (!res?.ok || (res.body?.code !== undefined && Number(res.body.code) !== 0)) {
          const errMsg = res?.body?.message || res?.error || `HTTP ${res?.httpStatus || 400}`;
          const errCode = res?.body?.code ?? res?.httpStatus ?? -1;
          throw new Error(`TikTok lỗi tra cứu ID (Code ${errCode}): ${errMsg}`);
        }
        sendResponse({ success: true, result: res?.body || res });
      })().catch(err => sendResponse({ success: false, error: String(err?.message || err) }));
      return true;
    }

    if (type === "KOCVIP_PING") {
      sendResponse({ pong: true, version: CLIENT_VERSION });
      return false;
    }

    if (type === "KOCVIP_TOGGLE_MODAL") {
      toggleModal();
      sendResponse({ success: true, opened: overlayHost?.style.display === "flex" });
      return true;
    }
  });

  // =========================================================================
  // GIAO DIỆN MODAL RỘNG TRỰC TIẾP TRÊN TRANG TIKTOK (THAY THẾ SIDE PANEL HẸP)
  // =========================================================================
  let overlayHost = null;
  let overlayIframe = null;

  function initInPageOverlay() {
    if (!isExtensionValid()) return;

    // 1. Tạo Overlay Host & Iframe modal (nếu chưa có)
    if (!overlayHost || !document.getElementById("kocvip-inpage-overlay-host")) {
      const existingHost = document.getElementById("kocvip-inpage-overlay-host");
      if (existingHost) existingHost.remove();

      overlayHost = document.createElement("div");
      overlayHost.id = "kocvip-inpage-overlay-host";
      overlayHost.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(4px);
        display: none;
        align-items: center;
        justify-content: center;
      `;

      overlayIframe = document.createElement("iframe");
      overlayIframe.src = safeGetURL("ui/index.html");
      overlayIframe.style.cssText = `
        width: min(1380px, 98vw);
        height: min(94vh, 920px);
        border: 0;
        border-radius: 14px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45);
        background: #FFFFFF;
        overflow: hidden;
      `;

      overlayHost.appendChild(overlayIframe);
      (document.body || document.documentElement).appendChild(overlayHost);

      // Bấm ra vùng backdrop xám thì đóng
      overlayHost.addEventListener("click", (e) => {
        if (e.target === overlayHost) {
          hideModal();
        }
      });
    }

    // 2. Tạo Floating Action Button (FAB) hình gà tròn với viền hồng hào quang (như hình Image 1)
    if (!document.getElementById("kocvip-inpage-fab")) {
      const fab = document.createElement("div");
      fab.id = "kocvip-inpage-fab";
      fab.title = "Mở Mời hàng loạt KOC VIP";

      const chickenImgUrl = safeGetURL("icons/chicken.png");
      fab.innerHTML = `
        <div class="kocvip-fab-inner">
          <img src="${chickenImgUrl}" alt="KOC VIP" draggable="false" />
        </div>
      `;

      const savedTop = localStorage.getItem("kocvip_fab_top") || "40%";

      fab.style.cssText = `
        position: fixed !important;
        right: 4px !important;
        top: ${savedTop} !important;
        width: 58px !important;
        height: 58px !important;
        border-radius: 50% !important;
        padding: 0 !important;
        margin: 0 !important;
        background: radial-gradient(circle, #ff69b4 0%, #f43f5e 60%, #e11d48 100%) !important;
        box-shadow: 0 0 18px 5px rgba(244, 63, 94, 0.55), 0 0 32px 10px rgba(236, 72, 153, 0.35), 0 4px 14px rgba(0, 0, 0, 0.25) !important;
        cursor: grab !important;
        z-index: 2147483645 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        user-select: none !important;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease !important;
        box-sizing: border-box !important;
      `;

      const inner = fab.querySelector(".kocvip-fab-inner");
      if (inner) {
        inner.style.cssText = `
          width: 48px !important;
          height: 48px !important;
          border-radius: 50% !important;
          overflow: hidden !important;
          background: #ffffff !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 2px solid #ffffff !important;
          box-shadow: inset 0 0 4px rgba(0,0,0,0.15) !important;
          pointer-events: none !important;
        `;
        const img = inner.querySelector("img");
        if (img) {
          img.style.cssText = `
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
            pointer-events: none !important;
          `;
        }
      }

      // Hiệu ứng hover
      fab.onmouseenter = () => {
        fab.style.transform = "scale(1.12) translateX(-2px)";
        fab.style.boxShadow = "0 0 24px 8px rgba(244, 63, 94, 0.75), 0 0 40px 14px rgba(236, 72, 153, 0.5), 0 6px 18px rgba(0, 0, 0, 0.3)";
      };
      fab.onmouseleave = () => {
        fab.style.transform = "scale(1) translateX(0)";
        fab.style.boxShadow = "0 0 18px 5px rgba(244, 63, 94, 0.55), 0 0 32px 10px rgba(236, 72, 153, 0.35), 0 4px 14px rgba(0, 0, 0, 0.25)";
      };

      // Kéo thả dọc theo mép phải (Y axis drag)
      let isDragging = false;
      let startY = 0;
      let initialTop = 0;
      let hasMoved = false;

      fab.onmousedown = (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        hasMoved = false;
        startY = e.clientY;
        const rect = fab.getBoundingClientRect();
        initialTop = rect.top;
        fab.style.cursor = "grabbing";
        fab.style.transition = "none";
        e.preventDefault();
      };

      const onMouseMove = (e) => {
        if (!isDragging) return;
        const deltaY = e.clientY - startY;
        if (Math.abs(deltaY) > 4) hasMoved = true;
        const newTop = Math.max(10, Math.min(window.innerHeight - 70, initialTop + deltaY));
        fab.style.top = `${newTop}px`;
      };

      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        fab.style.cursor = "grab";
        fab.style.transition = "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease";
        try {
          localStorage.setItem("kocvip_fab_top", fab.style.top);
        } catch {}

        if (!hasMoved) {
          toggleModal();
        }
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      (document.body || document.documentElement).appendChild(fab);
    }
  }

  // Lắng nghe đóng / thu nhỏ từ bên trong iframe
  window.addEventListener("message", (e) => {
    if (e.data?.type === "KOCVIP_CLOSE_OVERLAY" || e.data?.type === "KOCVIP_MINIMIZE_OVERLAY") {
      hideModal();
    }
  });

  function showModal() {
    initInPageOverlay();
    if (overlayHost) {
      overlayHost.style.display = "flex";
      document.body.style.overflow = "hidden";
    }
  }

  function hideModal() {
    if (overlayHost) {
      overlayHost.style.display = "none";
      document.body.style.overflow = "";
    }
  }

  function toggleModal() {
    initInPageOverlay();
    if (overlayHost && overlayHost.style.display === "flex") {
      hideModal();
    } else {
      showModal();
    }
  }

  // Khởi tạo FAB khi trang tải xong và kiểm tra định kỳ để không bị mất khi chuyển route SPA
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initInPageOverlay);
  } else {
    setTimeout(initInPageOverlay, 500);
  }

  const fabPeriodicTimer = setInterval(() => {
    if (!isExtensionValid()) {
      clearInterval(fabPeriodicTimer);
      return;
    }
    if (!document.getElementById("kocvip-inpage-fab")) {
      initInPageOverlay();
    }
  }, 1500);
})();
