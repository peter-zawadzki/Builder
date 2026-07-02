/**
 * Cloud sync for location media (photos/videos).
 * Mirrors the same pattern as cloudPhotoSync.ts but for locationMediaDB records.
 *
 * Storage paths:
 *   locations/{locationId}/loc/photos/{index}.jpg    (location-level)
 *   locations/{locationId}/insp/photos/{index}.jpg   (inspection)
 *
 * KV keys:
 *   locMediaRefs:loc:{locationId}   → { photos: [path, ...], videos: [] }
 *   locMediaRefs:insp:{locationId}  → { photos: [path, ...] }
 */

import { projectId, publicAnonKey } from '/utils/supabase/info';

export type MediaType = 'loc' | 'insp';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;
const AUTH = { Authorization: `Bearer ${publicAnonKey}` };
function jsonHeaders() { return { ...AUTH, 'Content-Type': 'application/json' }; }

function isDataUrl(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.startsWith('data:');
}

// ── Pending location-media upload queue (localStorage) ────────────────────────
// Stored as: { locationId: string; mediaType: MediaType }[]

const PENDING_LOC_KEY = 'skiInstall_pendingLocMedia';

export interface PendingLocEntry {
  locationId: string;
  mediaType: MediaType;
}

export function getPendingLocMedia(): PendingLocEntry[] {
  try { return JSON.parse(localStorage.getItem(PENDING_LOC_KEY) || '[]'); }
  catch { return []; }
}

export function addPendingLocMedia(locationId: string, mediaType: MediaType): void {
  const list = getPendingLocMedia();
  const exists = list.some(e => e.locationId === locationId && e.mediaType === mediaType);
  if (!exists) {
    localStorage.setItem(PENDING_LOC_KEY, JSON.stringify([...list, { locationId, mediaType }]));
  }
}

export function removePendingLocMedia(locationId: string, mediaType: MediaType): void {
  const list = getPendingLocMedia();
  localStorage.setItem(
    PENDING_LOC_KEY,
    JSON.stringify(list.filter(e => !(e.locationId === locationId && e.mediaType === mediaType)))
  );
}

// ── Photo compression ─────────────────────────────────────────────────────────

async function compressPhoto(dataUrl: string): Promise<string> {
  return new Promise(resolve => {
    try {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 1600, MAX_H = 1200;
        let { naturalWidth: w, naturalHeight: h } = img;
        if (w > MAX_W || h > MAX_H) {
          const r = Math.min(MAX_W / w, MAX_H / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch { resolve(dataUrl); }
  });
}

/**
 * Upload all data: photos (skips https:// URLs that are already in the cloud).
 * Videos are too large for the edge function body limit, so they use a
 * presigned PUT directly to Supabase Storage (browser → Storage, no proxy).
 * Returns true if all uploads succeeded.
 */
export async function uploadLocationMedia(
  locationId: string,
  media: { photos: string[]; videos?: string[] },
  mediaType: MediaType = 'loc',
): Promise<boolean> {
  const tasks: Promise<boolean>[] = [];

  // ── Photos: compressed server-side upload ──────────────────────────────────
  media.photos.forEach((photo, index) => {
    if (!isDataUrl(photo)) return;
    tasks.push(
      compressPhoto(photo)
        .then(compressed =>
          fetch(`${API_BASE}/location-media/upload`, {
            method: 'POST',
            headers: jsonHeaders(),
            body: JSON.stringify({ locationId, mediaType, field: 'photos', index, dataUrl: compressed }),
          }).then(r => {
            if (!r.ok) r.text().then(t => console.error(`[cloudLocSync] photo upload failed (${mediaType}/${index}):`, t));
            return r.ok;
          })
        )
        .catch(err => { console.error('[cloudLocSync] photo upload error:', err); return false; })
    );
  });

  // ── Videos: presigned PUT directly to Supabase Storage ────────────────────
  (media.videos ?? []).forEach((video, index) => {
    if (!isDataUrl(video)) return;
    tasks.push(uploadOneVideo(locationId, mediaType, video, index));
  });

  if (tasks.length === 0) return true;
  const results = await Promise.allSettled(tasks);
  return results.every(r => r.status === 'fulfilled' && r.value === true);
}

async function uploadOneVideo(
  locationId: string,
  mediaType: MediaType,
  dataUrl: string,
  index: number,
): Promise<boolean> {
  try {
    // Detect extension from MIME type
    const mime = dataUrl.split(';')[0].split(':')[1] ?? 'video/mp4';
    const ext  = mime.includes('quicktime') ? 'mov' : mime.includes('webm') ? 'webm' : 'mp4';

    // 1. Get a presigned upload URL from the server
    const presignRes = await fetch(`${API_BASE}/location-media/presign-video`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ locationId, mediaType, index, ext }),
    });
    if (!presignRes.ok) {
      console.error('[cloudLocSync] presign-video failed:', presignRes.status, await presignRes.text().catch(() => ''));
      return false;
    }
    const { signedUrl, path } = await presignRes.json();

    // 2. Convert data URL to a Blob (native browser API — no manual base64 loop)
    const blob = await fetch(dataUrl).then(r => r.blob());

    // 3. PUT blob directly to Supabase Storage (bypasses the edge function size limit)
    const putRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mime },
      body: blob,
    });
    if (!putRes.ok) {
      console.error(`[cloudLocSync] presigned PUT failed (${index}):`, putRes.status, await putRes.text().catch(() => ''));
      return false;
    }

    // 4. Register the stored path in KV
    const regRes = await fetch(`${API_BASE}/location-media/register-video`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ locationId, mediaType, index, path }),
    });
    if (!regRes.ok) {
      console.error('[cloudLocSync] register-video failed:', regRes.status);
      return false;
    }

    console.log(`[cloudLocSync] video uploaded: ${path}`);
    return true;
  } catch (err) {
    console.error('[cloudLocSync] uploadOneVideo error:', err);
    return false;
  }
}

/**
 * Fetch signed 24-hour URLs for multiple locations' media.
 * Returns: { [locationId]: { loc: { photos: [url, ...], videos: [url,...] }, insp: { photos: [...] } } }
 */
export async function fetchLocationMediaUrls(
  locationIds: string[],
): Promise<Record<string, { loc?: { photos?: string[]; videos?: string[] }; insp?: { photos?: string[]; videos?: string[] } }>> {
  if (locationIds.length === 0) return {};
  try {
    const res = await fetch(`${API_BASE}/location-media/batch-urls`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ locationIds }),
    });
    if (!res.ok) {
      // Only log if it's an actual server error (not 404 or empty response)
      if (res.status >= 500) {
        console.error('[cloudLocSync] batch-urls server error:', res.status);
      }
      return {};
    }
    const { urlMap } = await res.json();
    return urlMap ?? {};
  } catch (err) {
    // Silently fail - this is expected when offline or server not available
    // Only log if it's not a network error
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      // Network error, likely offline or server not running - don't log
      return {};
    }
    console.error('[cloudLocSync] fetchLocationMediaUrls error:', err);
    return {};
  }
}

/** Delete all cloud-stored media for a location (call when location is deleted). */
export async function deleteLocationMedia(locationId: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/location-media/${locationId}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    if (!res.ok) console.warn('[cloudLocSync] delete failed:', res.status);
  } catch (err) {
    console.error('[cloudLocSync] delete error:', err);
  }
}