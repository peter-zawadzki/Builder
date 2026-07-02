/**
 * Cloud photo sync — uploads asset photos to Supabase Storage so they are
 * available on every device, not just the one that captured them.
 *
 * Upload flow (single round-trip):
 *   1. Compress photo to ≤1600px JPEG at 82% quality (~300–700 KB)
 *   2. POST compressed base64 to /photos/upload
 *   3. Server decodes → uploads to Supabase Storage → saves path in KV
 *
 * Download flow (on every page load for devices without local copies):
 *   1. POST /photos/batch-urls with all asset IDs
 *   2. Server generates 24-hour signed URLs from stored paths
 *   3. Signed URLs are set as photo field values (work directly in <img src>)
 */

import { projectId, publicAnonKey } from '/utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;
const AUTH = { Authorization: `Bearer ${publicAnonKey}` };
function jsonHeaders() { return { ...AUTH, 'Content-Type': 'application/json' }; }

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the value is a local data URL (not yet uploaded). */
export function isDataUrl(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.startsWith('data:');
}

/**
 * Resize + re-encode a data URL to JPEG ≤1600×1200 at 82% quality.
 * This keeps uploads under ~800 KB — well within the 6 MB edge-function limit.
 * If the canvas API is unavailable or the image can't be decoded, returns the original.
 */
async function compressDataUrl(dataUrl: string): Promise<string> {
  return new Promise(resolve => {
    try {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 1600;
        const MAX_H = 1200;
        let { naturalWidth: w, naturalHeight: h } = img;
        if (w > MAX_W || h > MAX_H) {
          const ratio = Math.min(MAX_W / w, MAX_H / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => resolve(dataUrl); // fall back to original on decode error
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}

// ── Upload one photo field ────────────────────────────────────────────────────

async function uploadOne(
  assetId: string,
  field: string,
  dataUrl: string,
  index?: number,
): Promise<boolean> {
  try {
    const compressed = await compressDataUrl(dataUrl);

    const res = await fetch(`${API_BASE}/photos/upload`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ assetId, field, index, dataUrl: compressed }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => `HTTP ${res.status}`);
      console.error(`[cloudPhoto] upload failed (${field}${index !== undefined ? `[${index}]` : ''}): ${body}`);
      return false;
    }

    const { success, path } = await res.json();
    if (success) {
      console.log(`[cloudPhoto] uploaded ${path}`);
    }
    return !!success;
  } catch (err) {
    console.error(`[cloudPhoto] uploadOne error (${field}):`, err);
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Upload every photo field that is still a local data: URL.
 * Already-uploaded values (https:// signed URLs) are skipped.
 * Returns true if ALL uploads succeeded, false if any failed.
 */
export async function uploadAssetPhotos(
  assetId: string,
  photos: Partial<Record<string, string | string[]>>,
): Promise<boolean> {
  const tasks: Promise<boolean>[] = [];

  for (const [field, value] of Object.entries(photos)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (isDataUrl(v)) tasks.push(uploadOne(assetId, field, v, i));
      });
    } else if (isDataUrl(value)) {
      tasks.push(uploadOne(assetId, field, value));
    }
  }

  if (tasks.length === 0) return true;

  const results = await Promise.allSettled(tasks);
  const allOk = results.every(r => r.status === 'fulfilled' && r.value === true);
  if (!allOk) {
    console.warn(`[cloudPhoto] ${results.filter(r => r.status !== 'fulfilled' || !(r as any).value).length}/${results.length} uploads failed for asset ${assetId}`);
  }
  return allOk;
}

/**
 * Fetch signed 24-hour download URLs for a batch of assetIds.
 * Returns { [assetId]: { [field]: signedUrl | signedUrl[] } }
 */
export async function fetchBatchPhotoUrls(
  assetIds: string[],
): Promise<Record<string, Record<string, string | string[]>>> {
  if (assetIds.length === 0) return {};
  try {
    const res = await fetch(`${API_BASE}/photos/batch-urls`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ assetIds }),
    });
    if (!res.ok) {
      // Only log if it's an actual server error (not 404 or empty response)
      if (res.status >= 500) {
        console.error('[cloudPhoto] batch-urls server error:', res.status);
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
    console.error('[cloudPhoto] fetchBatchPhotoUrls error:', err);
    return {};
  }
}

/** Delete all cloud-stored photos for an asset (call when asset is deleted). */
export async function deleteAssetPhotos(assetId: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/photos/${assetId}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    if (!res.ok) {
      console.warn('[cloudPhoto] deleteAssetPhotos failed:', res.status);
    }
  } catch (err) {
    console.error('[cloudPhoto] deleteAssetPhotos error:', err);
  }
}
