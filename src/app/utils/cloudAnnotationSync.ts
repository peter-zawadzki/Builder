/**
 * Cloud annotation sync — uploads image annotations to Supabase KV so they are
 * available on every device, not just the one that created them.
 *
 * Upload flow:
 *   1. Save annotations to IndexedDB (local copy)
 *   2. POST /annotations/upload with imageId and annotations array
 *
 * Download flow:
 *   1. POST /annotations/batch-get with array of imageIds
 *   2. Returns map of imageId -> annotations
 */

import { projectId, publicAnonKey } from '/utils/supabase/info';
import type { Annotation } from '../context/DataContext';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;
const AUTH = { Authorization: `Bearer ${publicAnonKey}` };
function jsonHeaders() { return { ...AUTH, 'Content-Type': 'application/json' }; }

// ── Pending annotation upload queue (localStorage) ────────────────────────────

const PENDING_KEY = 'skiInstall_pendingAnnotations';

export function getPendingAnnotations(): string[] {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); }
  catch { return []; }
}

export function addPendingAnnotation(imageId: string): void {
  const list = getPendingAnnotations();
  if (!list.includes(imageId)) {
    localStorage.setItem(PENDING_KEY, JSON.stringify([...list, imageId]));
  }
}

export function removePendingAnnotation(imageId: string): void {
  const list = getPendingAnnotations();
  localStorage.setItem(PENDING_KEY, JSON.stringify(list.filter(id => id !== imageId)));
}

// ── Upload ─────────────────────────────────────────────────────────────────────

/**
 * Upload annotations for an image to the cloud.
 * Returns true if successful.
 */
export async function uploadAnnotations(
  imageId: string,
  annotations: Annotation[],
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/annotations/upload`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ imageId, annotations }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => `HTTP ${res.status}`);
      console.error(`[cloudAnnotations] upload failed: ${body}`);
      return false;
    }

    const { success } = await res.json();
    if (success) {
      console.log(`[cloudAnnotations] uploaded annotations for ${imageId}`);
    }
    return !!success;
  } catch (err) {
    console.error(`[cloudAnnotations] uploadAnnotations error:`, err);
    return false;
  }
}

// ── Download ───────────────────────────────────────────────────────────────────

/**
 * Fetch annotations for a batch of imageIds.
 * Returns { [imageId]: Annotation[] }
 */
export async function fetchBatchAnnotations(
  imageIds: string[],
): Promise<Record<string, Annotation[]>> {
  if (imageIds.length === 0) return {};
  try {
    const res = await fetch(`${API_BASE}/annotations/batch-get`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ imageIds }),
    });
    if (!res.ok) {
      if (res.status >= 500) {
        console.error('[cloudAnnotations] batch-get server error:', res.status);
      }
      return {};
    }
    const { annotationsMap } = await res.json();
    return annotationsMap ?? {};
  } catch (err) {
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      // Network error, likely offline - don't log
      return {};
    }
    console.error('[cloudAnnotations] fetchBatchAnnotations error:', err);
    return {};
  }
}

/** Delete cloud-stored annotations for an image (call when image is deleted). */
export async function deleteAnnotations(imageId: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/annotations/${imageId}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    if (!res.ok) {
      console.warn('[cloudAnnotations] delete failed:', res.status);
    }
  } catch (err) {
    console.error('[cloudAnnotations] delete error:', err);
  }
}
