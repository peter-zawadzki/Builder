/**
 * Offline Write Queue — IndexedDB
 *
 * When the device is offline (or an API call fails), mutations are stored here
 * as ordered pending operations. DataContext flushes them on "online" events
 * and on every app startup.
 *
 * Operations are processed strictly FIFO so create → update → delete ordering
 * is preserved even across reconnect gaps.
 */

const DB_NAME  = 'skiInstall_offlineQueue';
const STORE    = 'pendingOps';
const VERSION  = 1;

export interface PendingOp {
  id: string;
  endpoint: string;
  method: string;
  body: string | null;
  createdAt: number;
  retries?: number;
}

// ── DB singleton ───────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;
let _opening: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_opening) return _opening;

  _opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);

    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      _opening = null;
      _db.onclose = () => { _db = null; };
      _db.onversionchange = () => { _db?.close(); _db = null; };
      resolve(_db);
    };

    req.onerror = () => { _opening = null; reject(req.error); };
    req.onblocked = () => { _opening = null; reject(new Error('offlineQueue IDB blocked')); };
  });

  return _opening;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Add an operation to the end of the queue. */
export async function enqueue(op: Omit<PendingOp, 'id' | 'createdAt'>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const item: PendingOp = {
      ...op,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    const req = tx.objectStore(STORE).add(item);
    req.onsuccess = () => resolve();
    req.onerror  = () => reject(req.error);
  });
}

/** Return all pending operations sorted oldest-first. */
export async function getAll(): Promise<PendingOp[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve((req.result as PendingOp[]).sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

/** Remove a single operation by id (call after successful execution). */
export async function remove(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror  = () => reject(req.error);
  });
}

/** Increment and persist an op's retry count; returns the new count (0 if the op is gone). */
export async function bumpRetry(id: string): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingOp | undefined;
      if (!item) { resolve(0); return; }
      const retries = (item.retries || 0) + 1;
      const putReq = store.put({ ...item, retries });
      putReq.onsuccess = () => resolve(retries);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/** How many operations are currently queued. */
export async function count(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result as number);
    req.onerror  = () => reject(req.error);
  });
}

/** Clear the entire queue (e.g. after a full re-sync resets server state). */
export async function clear(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror  = () => reject(req.error);
  });
}
