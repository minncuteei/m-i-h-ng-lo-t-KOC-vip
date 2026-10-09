/**
 * KOC VIP - Local IndexedDB Manager.
 * Lưu trữ trạng thái đợt mời, chunks và danh mục sản phẩm hoàn toàn cục bộ trên máy.
 */
const DB_NAME = "koc-vip-local-invite";
const DB_VERSION = 1;

let dbPromise = null;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

export function openLocalInviteDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("runs")) {
        const store = db.createObjectStore("runs", { keyPath: "serverRunId" });
        store.createIndex("shopId", "shopId", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("chunks")) {
        const store = db.createObjectStore("chunks", { keyPath: "chunkId" });
        store.createIndex("serverRunId", "serverRunId", { unique: false });
        store.createIndex("runStatus", ["serverRunId", "status"], { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("locks")) {
        db.createObjectStore("locks", { keyPath: "lockKey" });
      }
      if (!db.objectStoreNames.contains("limits")) {
        db.createObjectStore("limits", { keyPath: "shopId" });
      }
      if (!db.objectStoreNames.contains("catalogProducts")) {
        const store = db.createObjectStore("catalogProducts", { keyPath: "cacheKey" });
        store.createIndex("shopId", "shopId", { unique: false });
        store.createIndex("productId", "productId", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error("Cannot open IndexedDB"));
    };
  });
  return dbPromise;
}

async function getOne(storeName, key) {
  const db = await openLocalInviteDb();
  const tx = db.transaction(storeName, "readonly");
  return requestResult(tx.objectStore(storeName).get(key));
}

async function putOne(storeName, record) {
  const db = await openLocalInviteDb();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(record);
  await transactionDone(tx);
  return record;
}

export async function saveManifest(manifest) {
  if (!manifest?.serverRunId) throw new Error("Manifest is missing serverRunId");
  const existing = await getOne("runs", manifest.serverRunId);
  const db = await openLocalInviteDb();
  const tx = db.transaction(["runs", "chunks"], "readwrite");
  const runStore = tx.objectStore("runs");
  const chunkStore = tx.objectStore("chunks");
  const now = new Date().toISOString();

  // Tự động chia nhỏ chunks nếu manifest chưa được chia
  let rawChunks = Array.isArray(manifest.chunks) && manifest.chunks.length ? manifest.chunks : [];
  if (!rawChunks.length) {
    const recipients = Array.isArray(manifest.draft?.recipients)
      ? manifest.draft.recipients
      : (Array.isArray(manifest.recipients) ? manifest.recipients : []);
    const chunkSize = 50;
    for (let i = 0; i < recipients.length; i += chunkSize) {
      const slice = recipients.slice(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize) + 1;
      rawChunks.push({
        chunkId: `${manifest.serverRunId}_c${chunkIndex}`,
        serverRunId: manifest.serverRunId,
        shopId: manifest.shopId,
        groupName: `${manifest.draft?.title || "KOCVIP"}${chunkIndex > 1 ? `_N${chunkIndex}` : ""}`,
        capacity: chunkSize,
        status: "local_pending",
        recipients: slice.map(r => ({
          creatorOecId: String(r.creatorOecId || r.creator_oec_id || "").trim(),
          handle: String(r.handle || r.handle_name || "").trim(),
          nickName: String(r.nickName || r.nick_name || "").trim(),
          status: "local_pending",
        })),
        updatedAt: now,
      });
    }
  }

  runStore.put({
    ...(existing || {}),
    serverRunId: manifest.serverRunId,
    shopId: manifest.shopId,
    region: manifest.region || "VN",
    status: existing?.status || "local_ready",
    draft: manifest.draft || {},
    paused: !!existing?.paused,
    totalEligible: manifest.totalEligible || manifest.totalKocs || (manifest.draft?.recipients || []).length || 0,
    totalChunks: rawChunks.length,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });

  for (const rawChunk of rawChunks) {
    const chunk = {
      chunkId: rawChunk.chunkId,
      serverRunId: manifest.serverRunId,
      shopId: manifest.shopId,
      groupName: rawChunk.groupName || manifest.draft?.title || "KOCVIP",
      capacity: rawChunk.capacity || 50,
      status: rawChunk.status || "local_pending",
      recipients: Array.isArray(rawChunk.recipients) ? rawChunk.recipients : [],
      updatedAt: now,
    };
    chunkStore.put(chunk);
  }

  await transactionDone(tx);
  manifest.chunks = rawChunks;
  return manifest;
}

export async function listChunks(serverRunId) {
  const db = await openLocalInviteDb();
  const tx = db.transaction("chunks", "readonly");
  const store = tx.objectStore("chunks");
  const index = store.index("serverRunId");
  return requestResult(index.getAll(IDBKeyRange.only(serverRunId)));
}

export async function getChunk(chunkId) {
  return getOne("chunks", chunkId);
}

export async function saveChunk(manifest, chunk, patch = {}) {
  const existing = await getOne("chunks", chunk.chunkId);
  const updated = {
    ...(existing || chunk),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await putOne("chunks", updated);
  return updated;
}

export async function updateRun(payload = {}) {
  const { serverRunId, patch = {} } = payload;
  if (!serverRunId) return null;
  const existing = await getOne("runs", serverRunId);
  if (!existing) return null;
  const updated = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await putOne("runs", updated);
  return updated;
}

export async function appendRunLog(serverRunId, logEntry) {
  if (!serverRunId || !logEntry) return null;
  const run = await getOne("runs", serverRunId);
  if (!run) return null;
  if (!Array.isArray(run.logs)) run.logs = [];
  run.logs.push({
    ...logEntry,
    time: logEntry.time || new Date().toLocaleTimeString("vi-VN"),
    ts: logEntry.ts || Date.now()
  });
  if (run.logs.length > 1000) run.logs.splice(0, run.logs.length - 800);
  run.updatedAt = new Date().toISOString();
  await putOne("runs", run);
  return true;
}

export async function getRun(serverRunId) {
  return getOne("runs", serverRunId);
}

export async function cancelRun(serverRunId) {
  const run = await getOne("runs", serverRunId);
  if (!run) return null;
  run.status = "cancelled";
  run.cancelled = true;
  run.updatedAt = new Date().toISOString();
  await putOne("runs", run);

  const chunks = await listChunks(serverRunId);
  const db = await openLocalInviteDb();
  const tx = db.transaction("chunks", "readwrite");
  const store = tx.objectStore("chunks");
  for (const c of chunks) {
    if (!["sent", "skipped", "failed"].includes(c.status)) {
      c.status = "cancelled";
      c.updatedAt = new Date().toISOString();
      store.put(c);
    }
  }
  await transactionDone(tx);
  return run;
}

export async function acquireLock({ lockKey, ownerId, leaseMs = 60000 }) {
  const existing = await getOne("locks", lockKey);
  const now = Date.now();
  if (existing && existing.ownerId !== ownerId && existing.expiresAt > now) {
    return { acquired: false, existing };
  }
  const lock = {
    lockKey,
    ownerId,
    acquiredAt: now,
    expiresAt: now + leaseMs,
  };
  await putOne("locks", lock);
  return { acquired: true, lock };
}

export async function releaseLock({ lockKey, ownerId }) {
  const existing = await getOne("locks", lockKey);
  if (existing && existing.ownerId === ownerId) {
    const db = await openLocalInviteDb();
    const tx = db.transaction("locks", "readwrite");
    tx.objectStore("locks").delete(lockKey);
    await transactionDone(tx);
  }
  return { released: true };
}

export async function saveCatalogProducts(shopId, products = []) {
  if (!shopId) return;
  const db = await openLocalInviteDb();
  const tx = db.transaction("catalogProducts", "readwrite");
  const store = tx.objectStore("catalogProducts");
  const now = new Date().toISOString();
  for (const p of products) {
    const productId = String(p.productId || p.id || "");
    if (!productId) continue;
    store.put({
      cacheKey: `${shopId}|${productId}`,
      shopId,
      productId,
      title: p.title || p.name || "",
      imageUrl: p.imageUrl || p.image || "",
      price: p.price || 0,
      stock: p.stock || 0,
      sales: p.sales || 0,
      orders28d: p.orders28d || 0,
      allTimeSales: p.allTimeSales || 0,
      revenue: p.revenue || 0,
      gmv28d: p.gmv28d || 0,
      commissionRate: p.commissionRate || 10,
      skus: Array.isArray(p.skus) ? p.skus : [],
      isOnline: p.isOnline !== false,
      updatedAt: now,
    });
  }
  await transactionDone(tx);
}

export async function getCatalogProducts(shopId) {
  if (!shopId) return [];
  const db = await openLocalInviteDb();
  const tx = db.transaction("catalogProducts", "readonly");
  const store = tx.objectStore("catalogProducts");
  const index = store.index("shopId");
  const list = await requestResult(index.getAll(IDBKeyRange.only(shopId)));
  if (Array.isArray(list)) {
    list.sort((a, b) => (b.sales || 0) - (a.sales || 0));
  }
  return list || [];
}

export async function getExportableKocs(payload = {}) {
  const { serverRunId, shopId, status } = payload;
  const db = await openLocalInviteDb();
  let chunks = [];

  if (serverRunId) {
    chunks = await listChunks(serverRunId);
  } else if (shopId) {
    const tx = db.transaction(["runs", "chunks"], "readonly");
    const runStore = tx.objectStore("runs");
    const runIndex = runStore.index("shopId");
    const runs = await requestResult(runIndex.getAll(IDBKeyRange.only(shopId)));
    const runIds = new Set((runs || []).map(r => r.serverRunId));
    const chunkStore = tx.objectStore("chunks");
    const allChunks = await requestResult(chunkStore.getAll());
    chunks = (allChunks || []).filter(c => runIds.has(c.serverRunId));
  } else {
    const tx = db.transaction("chunks", "readonly");
    const chunkStore = tx.objectStore("chunks");
    chunks = await requestResult(chunkStore.getAll());
  }

  const kocs = [];
  for (const chunk of chunks) {
    for (const r of chunk.recipients || []) {
      if (status && status !== "all" && r.status !== status) {
        continue;
      }
      kocs.push({
        creatorOecId: r.creatorOecId || "",
        handle: r.handle || "",
        nickName: r.nickName || "",
        status: r.status || "pending",
        reason: r.reason || r.msg || (r.status === "sent" ? "Đã gửi lời mời thành công" : ""),
        updatedAt: r.updatedAt || chunk.updatedAt || new Date().toISOString(),
      });
    }
  }
  return kocs;
}

export async function getRunHistory(payload = {}) {
  const { shopId } = payload;
  const db = await openLocalInviteDb();
  const tx = db.transaction(["runs", "chunks"], "readonly");
  const runStore = tx.objectStore("runs");
  const chunkStore = tx.objectStore("chunks");

  let runs = [];
  if (shopId) {
    const index = runStore.index("shopId");
    runs = await requestResult(index.getAll(IDBKeyRange.only(shopId)));
  } else {
    runs = await requestResult(runStore.getAll());
  }

  const allChunks = await requestResult(chunkStore.getAll());
  const chunksByRun = new Map();
  for (const c of allChunks || []) {
    if (!chunksByRun.has(c.serverRunId)) {
      chunksByRun.set(c.serverRunId, []);
    }
    chunksByRun.get(c.serverRunId).push(c);
  }

  const history = (runs || []).map(r => {
    const chunks = chunksByRun.get(r.serverRunId) || [];
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let waitingCount = 0;
    let totalKocs = 0;

    for (const chunk of chunks) {
      for (const rec of chunk.recipients || []) {
        totalKocs++;
        if (rec.status === "sent") sentCount++;
        else if (rec.status === "skipped" || rec.status === "conflict") skippedCount++;
        else if (rec.status === "failed") failedCount++;
        else if (rec.status === "waiting_daily_reset") waitingCount++;
      }
    }

    if (totalKocs === 0) {
      totalKocs = r.totalEligible || (r.draft?.recipients || []).length || 0;
    }

    return {
      serverRunId: r.serverRunId,
      shopId: r.shopId || "",
      title: r.draft?.title || "Chiến dịch mời KOC",
      staff: r.draft?.staff || "",
      commission: r.draft?.commission || "",
      status: r.status,
      totalKocs,
      sentCount,
      skippedCount,
      failedCount,
      waitingCount,
      createdAt: r.createdAt || r.updatedAt,
      updatedAt: r.updatedAt,
      productsCount: (r.draft?.productIds || []).length || 0,
    };
  });

  history.sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));
  return history;
}

export async function deleteRun(serverRunId) {
  if (!serverRunId) return false;
  const db = await openLocalInviteDb();
  const tx = db.transaction(["runs", "chunks"], "readwrite");
  tx.objectStore("runs").delete(serverRunId);

  const chunkStore = tx.objectStore("chunks");
  const chunkIndex = chunkStore.index("serverRunId");
  const chunks = await requestResult(chunkIndex.getAll(IDBKeyRange.only(serverRunId)));
  for (const c of chunks || []) {
    chunkStore.delete(c.chunkId);
  }
  await transactionDone(tx);
  return true;
}

// Router tiếp nhận yêu cầu thao tác DB từ Content Script hoặc Side Panel
export async function handleLocalInviteDbOperation(payload = {}) {
  const { op } = payload;
  switch (op) {
    case "saveManifest":
      return saveManifest(payload.manifest);
    case "listChunks":
      return listChunks(payload.serverRunId);
    case "getChunk":
      return getChunk(payload.chunkId);
    case "saveChunk":
      return saveChunk(payload.manifest, payload.chunk, payload.patch);
    case "updateRun":
      return updateRun(payload);
    case "appendRunLog":
      return appendRunLog(payload.serverRunId, payload.logEntry);
    case "getRun":
      return getRun(payload.serverRunId);
    case "cancelRun":
      return cancelRun(payload.serverRunId);
    case "deleteRun":
      return deleteRun(payload.serverRunId);
    case "acquireLock":
      return acquireLock(payload);
    case "releaseLock":
      return releaseLock(payload);
    case "saveCatalogProducts":
      return saveCatalogProducts(payload.shopId, payload.products);
    case "getCatalogProducts":
      return getCatalogProducts(payload.shopId);
    case "getExportableKocs":
      return getExportableKocs(payload);
    case "getRunHistory":
      return getRunHistory(payload);
    default:
      throw new Error(`Unsupported DB op: ${op}`);
  }
}

