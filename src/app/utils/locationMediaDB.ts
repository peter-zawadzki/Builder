/**
 * IndexedDB wrapper for location media.
 * Stores both location-level photos/videos AND inspection photos/videos,
 * keyed by locationId with different key prefixes.
 *
 *   loc:{locationId}  → { photos, videos }   (location-level media)
 *   insp:{locationId} → { photos, videos }   (inspection media)
 */

const DB_NAME = 'skiInstall_locationMediaDB';
const STORE_NAME = 'locationMedia';
const DB_VERSION = 1;

export interface LocationMedia {
  photos: string[]; // base64 data URLs
  videos: string[]; // base64 data URLs
}

let _db: IDBDatabase | null = null;
let _opening: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_opening) return _opening;

  _opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
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
    req.onblocked = () => { _opening = null; reject(new Error('IndexedDB open blocked')); };
  });

  return _opening;
}

async function withDB<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  try {
    const db = await openDB();
    return await fn(db);
  } catch (err: any) {
    if (err?.name === 'InvalidStateError') {
      _db = null;
      _opening = null;
      const db = await openDB();
      return fn(db);
    }
    throw err;
  }
}

async function getMedia(key: string): Promise<LocationMedia> {
  try {
    return await withDB((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result ?? { photos: [], videos: [] });
        req.onerror = () => reject(req.error);
      })
    );
  } catch (err) {
    console.error('locationMediaDB.getMedia error:', err);
    return { photos: [], videos: [] };
  }
}

async function saveMedia(key: string, media: LocationMedia): Promise<void> {
  try {
    await withDB((db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(media, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
    );
  } catch (err) {
    console.error('locationMediaDB.saveMedia error:', err);
  }
}

async function deleteMedia(key: string): Promise<void> {
  try {
    await withDB((db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
    );
  } catch (err) {
    console.error('locationMediaDB.deleteMedia error:', err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Get location-level photos + videos. */
export const getLocationMedia = (locationId: string) => getMedia(`loc:${locationId}`);

/** Save location-level photos + videos. */
export const saveLocationMedia = (locationId: string, media: LocationMedia) =>
  saveMedia(`loc:${locationId}`, media);

/** Get inspection photos + videos for a location. */
export const getInspectionMedia = (locationId: string) => getMedia(`insp:${locationId}`);

/** Save inspection photos + videos for a location. */
export const saveInspectionMedia = (locationId: string, media: LocationMedia) =>
  saveMedia(`insp:${locationId}`, media);

/** Delete ALL media (location + inspection) for a location. */
export async function deleteAllMedia(locationId: string): Promise<void> {
  await Promise.all([
    deleteMedia(`loc:${locationId}`),
    deleteMedia(`insp:${locationId}`),
  ]);
}

/** Convert a File to a base64 data URL. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
