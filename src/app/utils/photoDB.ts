/**
 * IndexedDB wrapper for asset photo storage.
 * Photos are base64 strings that can be several MB each — far too large for
 * localStorage (5 MB total). IndexedDB has no practical size limit for this use case.
 */

const DB_NAME = 'skiInstall_photoDB';
const STORE_NAME = 'assetPhotos';
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;
let _opening: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  // Return live connection if it exists
  if (_db) return Promise.resolve(_db);
  // Coalesce concurrent open calls into one
  if (_opening) return _opening;

  _opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME); // key = assetId
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      _opening = null;

      // Reset cached reference when the connection is closed externally
      // (e.g. Vite HMR re-evaluates this module while the old DB is still open)
      _db.onclose = () => { _db = null; };

      // Close gracefully if another tab/version wants to upgrade
      _db.onversionchange = () => {
        _db?.close();
        _db = null;
      };

      resolve(_db);
    };
    req.onerror = () => { _opening = null; reject(req.error); };
    req.onblocked = () => { _opening = null; reject(new Error('IndexedDB open blocked')); };
  });

  return _opening;
}

/** Re-open if the previous connection has gone stale and retry the callback once. */
async function withDB<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  try {
    const db = await openDB();
    return await fn(db);
  } catch (err: any) {
    if (err?.name === 'InvalidStateError') {
      // Connection was closing — reset and try once more with a fresh handle
      _db = null;
      _opening = null;
      const db = await openDB();
      return fn(db);
    }
    throw err;
  }
}

/** Persist photo fields for a given asset. Merges with any existing entry. */
export async function savePhotos(
  assetId: string,
  photos: Partial<Record<string, string | string[]>>
): Promise<void> {
  try {
    await withDB(async (db) => {
      // Read existing first so we don't clobber other photo fields
      const existing = await getPhotos(assetId) ?? {};
      const merged = { ...existing, ...photos };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(merged, assetId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  } catch (err) {
    console.error('photoDB.savePhotos error:', err);
  }
}

/** Retrieve photo fields for a single asset. Returns null if not found. */
export async function getPhotos(
  assetId: string
): Promise<Record<string, string | string[]> | null> {
  try {
    return await withDB((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(assetId);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      })
    );
  } catch (err) {
    console.error('photoDB.getPhotos error:', err);
    return null;
  }
}

/** Return a lookup of ALL stored photos keyed by assetId. */
export async function getAllPhotos(): Promise<Record<string, Record<string, string | string[]>>> {
  try {
    return await withDB((db) =>
      new Promise((resolve, reject) => {
        const result: Record<string, Record<string, string | string[]>> = {};
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).openCursor();
        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (cursor) {
            result[cursor.key as string] = cursor.value;
            cursor.continue();
          } else {
            resolve(result);
          }
        };
        req.onerror = () => reject(req.error);
      })
    );
  } catch (err) {
    console.error('photoDB.getAllPhotos error:', err);
    return {};
  }
}

/** Delete the photo record for a given asset (called when an asset is deleted). */
export async function deletePhotos(assetId: string): Promise<void> {
  try {
    await withDB((db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(assetId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
    );
  } catch (err) {
    console.error('photoDB.deletePhotos error:', err);
  }
}