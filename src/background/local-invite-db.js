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
      commissionRate: p.commissionRate || 10,
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
  return requestResult(index.getAll(IDBKeyRange.only(shopId)));
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
    case "getRun":
      return getRun(payload.serverRunId);
    case "cancelRun":
      return cancelRun(payload.serverRunId);
    case "acquireLock":
      return acquireLock(payload);
    case "releaseLock":
      return releaseLock(payload);
    case "saveCatalogProducts":
      return saveCatalogProducts(payload.shopId, payload.products);
    case "getCatalogProducts":
      return getCatalogProducts(payload.shopId);
    default:
      throw new Error(`Unsupported DB op: ${op}`);
  }
}
