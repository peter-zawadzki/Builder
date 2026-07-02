/**
 * IndexedDB storage for image annotations
 * Stores annotations for any image by its unique ID
 */

import type { Annotation } from '../context/DataContext';

const DB_NAME = 'YullrImageAnnotations';
const DB_VERSION = 1;
const STORE_NAME = 'annotations';

interface ImageAnnotations {
  imageId: string;
  annotations: Annotation[];
  updatedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'imageId' });
      }
    };
  });
}

/**
 * Get annotations for a specific image
 */
export async function getAnnotations(imageId: string): Promise<Annotation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(imageId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result as ImageAnnotations | undefined;
      resolve(result?.annotations || []);
    };
  });
}

/**
 * Save annotations for a specific image
 */
export async function saveAnnotations(imageId: string, annotations: Annotation[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const data: ImageAnnotations = {
      imageId,
      annotations,
      updatedAt: new Date().toISOString(),
    };
    const request = store.put(data);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Delete annotations for a specific image
 */
export async function deleteAnnotations(imageId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(imageId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
