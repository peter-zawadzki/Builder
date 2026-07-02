/**
 * IndexedDB wrapper for mountain-level documents.
 * Stores uploaded files (images, videos, PDFs, etc.) keyed by mountainId.
 */

const DB_NAME = 'skiInstall_mountainDocumentsDB';
const STORE_NAME = 'mountainDocuments';
const DB_VERSION = 1;

export interface MountainDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string; // base64 data URL
  uploadedAt: string;
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

/** Get all documents for a mountain. */
export async function getDocuments(mountainId: string): Promise<MountainDocument[]> {
  try {
    return await withDB((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(mountainId);
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => reject(req.error);
      })
    );
  } catch (err) {
    console.error('mountainDocumentsDB.getDocuments error:', err);
    return [];
  }
}

/** Save all documents for a mountain. */
export async function saveDocuments(mountainId: string, documents: MountainDocument[]): Promise<void> {
  try {
    await withDB((db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(documents, mountainId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
    );
  } catch (err) {
    console.error('mountainDocumentsDB.saveDocuments error:', err);
  }
}

/** Delete all documents for a mountain. */
export async function deleteDocuments(mountainId: string): Promise<void> {
  try {
    await withDB((db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(mountainId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
    );
  } catch (err) {
    console.error('mountainDocumentsDB.deleteDocuments error:', err);
  }
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
