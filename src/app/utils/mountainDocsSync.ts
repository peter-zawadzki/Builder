/**
 * Cloud sync for mountain-level "Documents" panel uploads (MountainDocuments.tsx).
 * Mirrors cloudPhotoSync.ts — uploads to S3 via server/routes/documents.ts,
 * stored as `documents` rows with field = 'mountainDoc'.
 */

import { getAuthToken } from '../context/DataContext';

const BASE = '/api/documents';

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  return fetch(`${BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token ?? ''}`,
      ...options.headers,
    },
  });
}

export interface CloudMountainDoc {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: string;
}

export interface CloudAssetPhotoItem {
  id: string;
  field: string;
  slotIndex: number | null;
  url: string;
}

export interface CloudLocationMediaItem {
  id: string;
  mediaType: 'loc' | 'insp';
  field: 'photos' | 'videos';
  slotIndex: number | null;
  url: string;
}

/**
 * Raw (uncompacted) rows for a single asset's photos — carries each item's
 * real document id, so a delete can target the exact row instead of an array
 * index that may have drifted from slot_index after an earlier deletion.
 */
export async function fetchAssetPhotosFull(assetId: string): Promise<CloudAssetPhotoItem[]> {
  try {
    const res = await apiCall(`/photos/asset-full/${assetId}`);
    if (!res.ok) return [];
    const { items } = await res.json();
    return items ?? [];
  } catch (err) {
    console.error('[mountainDocsSync] fetchAssetPhotosFull error:', err);
    return [];
  }
}

/** Raw (uncompacted) rows for a single location's photos/videos — see fetchAssetPhotosFull. */
export async function fetchLocationMediaFull(locationId: string): Promise<CloudLocationMediaItem[]> {
  try {
    const res = await apiCall(`/location-media/full/${locationId}`);
    if (!res.ok) return [];
    const { items } = await res.json();
    return items ?? [];
  } catch (err) {
    console.error('[mountainDocsSync] fetchLocationMediaFull error:', err);
    return [];
  }
}

/** Generic single-row delete by document id (photo, video, mountain doc — anything). */
export async function deleteDocumentById(id: string): Promise<void> {
  try {
    const res = await apiCall(`/${id}`, { method: 'DELETE' });
    if (!res.ok) console.warn('[mountainDocsSync] deleteDocumentById failed:', res.status);
  } catch (err) {
    console.error('[mountainDocsSync] deleteDocumentById error:', err);
  }
}

// ── Pending mountain-doc upload queue (localStorage) ──────────────────────────
// Stored as: { mountainId, docId }[] — docId is the locally-minted id so a
// retry can find the same record in IndexedDB to re-upload.

const PENDING_KEY = 'skiInstall_pendingMountainDocs';

export interface PendingMountainDocEntry {
  mountainId: string;
  docId: string;
}

export function getPendingMountainDocs(): PendingMountainDocEntry[] {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); }
  catch { return []; }
}

export function addPendingMountainDoc(mountainId: string, docId: string): void {
  const list = getPendingMountainDocs();
  if (!list.some(e => e.mountainId === mountainId && e.docId === docId)) {
    localStorage.setItem(PENDING_KEY, JSON.stringify([...list, { mountainId, docId }]));
  }
}

export function removePendingMountainDoc(mountainId: string, docId: string): void {
  const list = getPendingMountainDocs();
  localStorage.setItem(
    PENDING_KEY,
    JSON.stringify(list.filter(e => !(e.mountainId === mountainId && e.docId === docId)))
  );
}

/**
 * Upload one file (as a base64 data URL) for a mountain. `id` should match the
 * id already used for the local IndexedDB copy, so the local and cloud
 * records share one identity instead of showing up as duplicates.
 */
export async function uploadMountainDocument(
  mountainId: string,
  id: string,
  fileName: string,
  mimeType: string,
  dataUrl: string,
): Promise<CloudMountainDoc | null> {
  try {
    const res = await apiCall('/mountain-docs/upload', {
      method: 'POST',
      body: JSON.stringify({ mountainId, id, dataUrl, fileName, mimeType }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => `HTTP ${res.status}`);
      console.error(`[mountainDocsSync] upload failed (${fileName}): ${body}`);
      return null;
    }
    const { success, document } = await res.json();
    return success ? document : null;
  } catch (err) {
    console.error('[mountainDocsSync] uploadMountainDocument error:', err);
    return null;
  }
}

/** Fetch all cloud-stored documents for a mountain. */
export async function fetchMountainDocuments(mountainId: string): Promise<CloudMountainDoc[]> {
  try {
    const res = await apiCall(`/mountain-docs/${mountainId}`);
    if (!res.ok) {
      if (res.status >= 500) console.error('[mountainDocsSync] fetch server error:', res.status);
      return [];
    }
    const { documents } = await res.json();
    return documents ?? [];
  } catch (err) {
    if (err instanceof TypeError && err.message === 'Failed to fetch') return []; // offline
    console.error('[mountainDocsSync] fetchMountainDocuments error:', err);
    return [];
  }
}

/** Delete a cloud-stored document. */
export async function deleteMountainDocument(mountainId: string, docId: string): Promise<void> {
  try {
    const res = await apiCall(`/mountain-docs/${mountainId}/${docId}`, { method: 'DELETE' });
    if (!res.ok) console.warn('[mountainDocsSync] delete failed:', res.status);
  } catch (err) {
    console.error('[mountainDocsSync] delete error:', err);
  }
}
