import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const app = new Hono();

// ─── Supabase Storage client ──────────────────────────────────────────────────

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const PHOTO_BUCKET = "make-a0d4ba78-photos";

// Idempotently create the photo bucket on cold start
(async () => {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b: { name: string }) => b.name === PHOTO_BUCKET)) {
      await supabase.storage.createBucket(PHOTO_BUCKET, { public: false });
      console.log(`Created storage bucket: ${PHOTO_BUCKET}`);
    }
  } catch (err) {
    console.error("Error creating photo bucket:", err);
  }
})();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// ─── Retry helper ─────────────────────────────────────────────────────────────
// Wraps any async KV operation and retries up to `maxAttempts` times on
// transient network failures (connection reset, fetch errors, etc.).

const RETRY_DELAYS_MS = [150, 500, 1200]; // waits between attempt 1→2, 2→3, 3→4

function isTransientError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes('connection reset') ||
    msg.includes('connection error') ||
    msg.includes('connection refused') ||
    msg.includes('network error') ||
    msg.includes('fetch failed') ||
    msg.includes('client error') ||
    msg.includes('sendrequest') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout')
  );
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label = 'kv operation',
  maxAttempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransientError(err)) {
        const delay = RETRY_DELAYS_MS[attempt - 1] ?? 1200;
        console.log(`[retry] ${label} — attempt ${attempt} failed (${err}), retrying in ${delay}ms…`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        break;
      }
    }
  }
  throw lastErr;
}

// Photo fields — never stored server-side
const PHOTO_FIELDS = ["serialPhoto", "installPhoto", "internalPhoto", "externalPhoto", "miscPhotos"];
function stripPhotos(obj: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...obj };
  PHOTO_FIELDS.forEach(f => delete copy[f]);
  return copy;
}

// Index key helpers — store arrays of IDs so we can mget instead of getByPrefix
const MOUNTAIN_INDEX = "idx:mountains";
const LOCATION_INDEX = "idx:locations";
const ASSET_INDEX    = "idx:assets";
const SI_INDEX       = "idx:siteInspections";
const NOTE_INDEX     = "idx:notes";

async function addToIndex(indexKey: string, id: string): Promise<void> {
  const ids: string[] = (await withRetry(() => kv.get(indexKey), `get index ${indexKey}`)) || [];
  if (!ids.includes(id)) {
    ids.push(id);
    await withRetry(() => kv.set(indexKey, ids), `set index ${indexKey}`);
  }
}

// Fetch records in small sequential batches to stay within Edge Function
// memory limits. A single mget with hundreds of keys can exhaust resources.
const MGET_BATCH_SIZE = 40;

async function batchedMget(keys: string[]): Promise<(Record<string, unknown> | null)[]> {
  if (keys.length === 0) return [];
  const results: (Record<string, unknown> | null)[] = [];
  for (let i = 0; i < keys.length; i += MGET_BATCH_SIZE) {
    const batch = keys.slice(i, i + MGET_BATCH_SIZE);
    const batchResults = (await withRetry(
      () => kv.mget(batch),
      `mget batch [${batch[0]}…]`,
    )) as (Record<string, unknown> | null)[];
    results.push(...batchResults);
  }
  return results;
}

async function getByIndex(indexKey: string, prefix: string): Promise<Record<string, unknown>[]> {
  const ids: string[] = (await withRetry(() => kv.get(indexKey), `get index ${indexKey}`)) || [];
  if (ids.length === 0) {
    // Fall back to getByPrefix for any records written before the index existed.
    try {
      const results = await withRetry(() => kv.getByPrefix(prefix), `getByPrefix ${prefix}`);
      if (!results) return [];
      return (results as (Record<string, unknown> | null)[]).filter(Boolean) as Record<string, unknown>[];
    } catch {
      return [];
    }
  }
  const keys = ids.map(id => `${prefix}${id}`);
  const results = await batchedMget(keys);
  return results.filter(Boolean) as Record<string, unknown>[];
}

// ─── Location Media Upload / Download / Delete ────────────────────────────────

/**
 * POST /location-media/upload
 * { locationId, mediaType: 'loc'|'insp', field: 'photos'|'videos', index, dataUrl }
 * Compressed by client (photos only — videos are too large for edge functions).
 */
app.post("/make-server-a0d4ba78/location-media/upload", async (c) => {
  try {
    const { locationId, mediaType, field, index, dataUrl } = await c.req.json();
    if (!locationId || !mediaType || !field || !dataUrl) {
      return c.json({ error: "locationId, mediaType, field, and dataUrl are required" }, 400);
    }

    const commaIdx = (dataUrl as string).indexOf(",");
    if (commaIdx === -1) return c.json({ error: "Invalid dataUrl" }, 400);
    const header = (dataUrl as string).slice(0, commaIdx);
    const b64    = (dataUrl as string).slice(commaIdx + 1);
    const mime   = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
    const ext    = mime.includes("png") ? "png" : mime.includes("video") ? "mp4" : "jpg";

    let binary: string;
    try { binary = atob(b64); } catch { return c.json({ error: "Invalid base64" }, 400); }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const storagePath = `locations/${locationId}/${mediaType}/${field}/${index}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(storagePath, bytes, { contentType: mime, upsert: true });

    if (uploadError) {
      console.error(`Location media upload error (${storagePath}):`, uploadError);
      return c.json({ error: `Upload failed: ${uploadError.message}` }, 500);
    }

    // Record path in KV
    const kvKey = `locMediaRefs:${mediaType}:${locationId}`;
    const refs = ((await withRetry(() => kv.get(kvKey), "get locMediaRefs")) ?? {}) as Record<string, string[]>;
    if (!Array.isArray(refs[field])) refs[field] = [];
    refs[field][index] = storagePath;
    await withRetry(() => kv.set(kvKey, refs), "set locMediaRefs");

    console.log(`Location media uploaded: ${storagePath} (${bytes.length} bytes)`);
    return c.json({ success: true, path: storagePath });
  } catch (err) {
    console.error("Error uploading location media:", err);
    return c.json({ error: `Failed to upload location media: ${err}` }, 500);
  }
});

/**
 * POST /location-media/presign-video
 * Returns a short-lived signed upload URL so the browser can PUT a video
 * file directly to Supabase Storage without going through the edge function.
 * { locationId, mediaType, index, ext? }
 */
app.post("/make-server-a0d4ba78/location-media/presign-video", async (c) => {
  try {
    const { locationId, mediaType = "loc", index, ext = "mp4" } = await c.req.json();
    if (!locationId || index === undefined) {
      return c.json({ error: "locationId and index are required" }, 400);
    }
    const storagePath = `locations/${locationId}/${mediaType}/videos/${index}.${ext}`;
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error) {
      console.error("Video presign error:", error);
      return c.json({ error: error.message }, 500);
    }
    return c.json({ signedUrl: data.signedUrl, path: storagePath });
  } catch (err) {
    console.error("Error creating video presign URL:", err);
    return c.json({ error: `Failed to create presign URL: ${err}` }, 500);
  }
});

/**
 * POST /location-media/register-video
 * After a successful presigned PUT, record the storage path in KV.
 * { locationId, mediaType, index, path }
 */
app.post("/make-server-a0d4ba78/location-media/register-video", async (c) => {
  try {
    const { locationId, mediaType = "loc", index, path } = await c.req.json();
    if (!locationId || !path || index === undefined) {
      return c.json({ error: "locationId, path, and index are required" }, 400);
    }
    const kvKey = `locMediaRefs:${mediaType}:${locationId}`;
    const refs = ((await withRetry(() => kv.get(kvKey), "get locMediaRefs for video")) ?? {}) as Record<string, any>;
    if (!Array.isArray(refs.videos)) refs.videos = [];
    refs.videos[index] = path;
    await withRetry(() => kv.set(kvKey, refs), "set locMediaRefs for video");
    console.log(`Video registered: ${path}`);
    return c.json({ success: true, path });
  } catch (err) {
    console.error("Error registering video:", err);
    return c.json({ error: `Failed to register video: ${err}` }, 500);
  }
});

/** POST /location-media/batch-urls — signed download URLs for multiple locations */
app.post("/make-server-a0d4ba78/location-media/batch-urls", async (c) => {
  try {
    const { locationIds } = await c.req.json() as { locationIds: string[] };
    if (!Array.isArray(locationIds) || locationIds.length === 0) return c.json({ urlMap: {} });

    const urlMap: Record<string, Record<string, Record<string, string[]>>> = {};

    for (const locationId of locationIds) {
      const locKey  = `locMediaRefs:loc:${locationId}`;
      const inspKey = `locMediaRefs:insp:${locationId}`;
      const [locRefs, inspRefs] = (await withRetry(
        () => kv.mget([locKey, inspKey]),
        "mget locMediaRefs",
      )) as [Record<string, string[]> | null, Record<string, string[]> | null];

      const locationResult: Record<string, Record<string, string[]>> = {};

      for (const [type, refs] of [["loc", locRefs], ["insp", inspRefs]] as [string, Record<string, string[]> | null][]) {
        if (!refs) continue;
        const typeUrls: Record<string, string[]> = {};
        for (const [field, paths] of Object.entries(refs)) {
          if (!Array.isArray(paths)) continue;
          const signed: string[] = [];
          for (const p of paths) {
            if (!p) continue;
            const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(p, 86400);
            if (data?.signedUrl) signed.push(data.signedUrl);
          }
          if (signed.length) typeUrls[field] = signed;
        }
        if (Object.keys(typeUrls).length) locationResult[type] = typeUrls;
      }

      if (Object.keys(locationResult).length) urlMap[locationId] = locationResult;
    }

    return c.json({ urlMap });
  } catch (err) {
    console.error("Error fetching location media URLs:", err);
    return c.json({ error: `Failed to fetch location media URLs: ${err}` }, 500);
  }
});

/** DELETE /location-media/:locationId — remove all media for a location from storage + KV */
app.delete("/make-server-a0d4ba78/location-media/:locationId", async (c) => {
  try {
    const locationId = c.req.param("locationId");
    const locKey  = `locMediaRefs:loc:${locationId}`;
    const inspKey = `locMediaRefs:insp:${locationId}`;
    const [locRefs, inspRefs] = (await withRetry(
      () => kv.mget([locKey, inspKey]),
      "mget locMediaRefs for delete",
    )) as [Record<string, string[]> | null, Record<string, string[]> | null];

    const paths: string[] = [];
    for (const refs of [locRefs, inspRefs]) {
      if (!refs) continue;
      for (const pathArr of Object.values(refs)) {
        if (Array.isArray(pathArr)) paths.push(...pathArr.filter(Boolean));
      }
    }

    if (paths.length > 0) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
      if (error) console.error("Storage remove error for location media:", error);
    }
    await withRetry(() => kv.mdel([locKey, inspKey]), "mdel locMediaRefs");
    return c.json({ success: true, deletedFiles: paths.length });
  } catch (err) {
    console.error("Error deleting location media:", err);
    return c.json({ error: `Failed to delete location media: ${err}` }, 500);
  }
});

// ─── Asset Photo Upload / Download / Delete ───────────────────────────────────

/**
 * POST /photos/upload
 * { assetId, field, index?, dataUrl }
 * Client-compresses photos to ≤1600px JPEG; body stays well under the 6 MB limit.
 */
app.post("/make-server-a0d4ba78/photos/upload", async (c) => {
  try {
    const { assetId, field, index, dataUrl } = await c.req.json();
    if (!assetId || !field || !dataUrl) {
      return c.json({ error: "assetId, field, and dataUrl are required" }, 400);
    }

    const commaIdx = (dataUrl as string).indexOf(",");
    if (commaIdx === -1) return c.json({ error: "Invalid dataUrl" }, 400);
    const header = (dataUrl as string).slice(0, commaIdx);
    const b64    = (dataUrl as string).slice(commaIdx + 1);
    const mime   = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
    const ext    = mime.includes("png") ? "png" : "jpg";

    let binary: string;
    try { binary = atob(b64); } catch { return c.json({ error: "Invalid base64" }, 400); }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const suffix = (index !== undefined && index !== null) ? `_${index}` : "";
    const storagePath = `assets/${assetId}/${field}${suffix}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(storagePath, bytes, { contentType: mime, upsert: true });

    if (uploadError) {
      console.error(`Asset photo upload error (${storagePath}):`, uploadError);
      return c.json({ error: `Upload failed: ${uploadError.message}` }, 500);
    }

    // Record path in KV under photoRefs:{assetId}
    const kvKey = `photoRefs:${assetId}`;
    const refs = ((await withRetry(() => kv.get(kvKey), "get photoRefs")) ?? {}) as Record<string, any>;
    if (index !== undefined && index !== null) {
      if (!Array.isArray(refs[field])) refs[field] = [];
      refs[field][index] = storagePath;
    } else {
      refs[field] = storagePath;
    }
    await withRetry(() => kv.set(kvKey, refs), "set photoRefs");

    console.log(`Asset photo uploaded: ${storagePath} (${bytes.length} bytes)`);
    return c.json({ success: true, path: storagePath });
  } catch (err) {
    console.error("Error uploading asset photo:", err);
    return c.json({ error: `Failed to upload asset photo: ${err}` }, 500);
  }
});

/** POST /photos/batch-urls — signed 24-hour download URLs for a batch of asset IDs */
app.post("/make-server-a0d4ba78/photos/batch-urls", async (c) => {
  try {
    const { assetIds } = await c.req.json() as { assetIds: string[] };
    if (!Array.isArray(assetIds) || assetIds.length === 0) return c.json({ urlMap: {} });

    const urlMap: Record<string, Record<string, string | string[]>> = {};

    for (const assetId of assetIds) {
      const refs = ((await withRetry(() => kv.get(`photoRefs:${assetId}`), "get photoRefs for batch")) ?? {}) as Record<string, any>;
      if (!refs || Object.keys(refs).length === 0) continue;

      const assetUrls: Record<string, string | string[]> = {};
      for (const [field, value] of Object.entries(refs)) {
        if (Array.isArray(value)) {
          const signed: string[] = [];
          for (const p of value as string[]) {
            if (!p) continue;
            const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(p, 86400);
            if (data?.signedUrl) signed.push(data.signedUrl);
          }
          if (signed.length) assetUrls[field] = signed;
        } else if (typeof value === "string" && value) {
          const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(value as string, 86400);
          if (data?.signedUrl) assetUrls[field] = data.signedUrl;
        }
      }
      if (Object.keys(assetUrls).length) urlMap[assetId] = assetUrls;
    }

    return c.json({ urlMap });
  } catch (err) {
    console.error("Error fetching asset photo URLs:", err);
    return c.json({ error: `Failed to fetch asset photo URLs: ${err}` }, 500);
  }
});

/** DELETE /photos/:assetId — remove all photos for an asset from storage + KV */
app.delete("/make-server-a0d4ba78/photos/:assetId", async (c) => {
  try {
    const assetId = c.req.param("assetId");
    const refs = ((await withRetry(() => kv.get(`photoRefs:${assetId}`), "get photoRefs")) ?? {}) as Record<string, any>;

    const paths: string[] = [];
    for (const v of Object.values(refs)) {
      if (Array.isArray(v)) paths.push(...(v as string[]).filter(Boolean));
      else if (v) paths.push(v as string);
    }
    if (paths.length > 0) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
      if (error) console.error("Storage remove error:", error);
    }
    await withRetry(() => kv.del(`photoRefs:${assetId}`), "del photoRefs");
    return c.json({ success: true, deletedFiles: paths.length });
  } catch (err) {
    console.error("Error deleting asset photos:", err);
    return c.json({ error: `Failed to delete photos: ${err}` }, 500);
  }
});

// Health check endpoint
app.get("/make-server-a0d4ba78/health", (c) => {
  return c.json({ status: "ok" });
});

// ─── Mountains ────────────────────────────────────────────────────────────────

app.get("/make-server-a0d4ba78/mountains", async (c) => {
  try {
    const mountains = await getByIndex(MOUNTAIN_INDEX, "mountain:");
    return c.json({ mountains });
  } catch (error) {
    console.error("Error fetching mountains:", error);
    return c.json({ error: `Failed to fetch mountains: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/mountains", async (c) => {
  try {
    const mountain = await c.req.json();
    await withRetry(() => kv.set(`mountain:${mountain.id}`, mountain), 'set mountain');
    await addToIndex(MOUNTAIN_INDEX, mountain.id);
    return c.json({ success: true, mountain });
  } catch (error) {
    console.error("Error creating mountain:", error);
    return c.json({ error: `Failed to create mountain: ${error}` }, 500);
  }
});

app.put("/make-server-a0d4ba78/mountains/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = (await withRetry(() => kv.get(`mountain:${id}`), 'get mountain')) as Record<string, unknown> | null;
    if (!existing) {
      return c.json({ error: "Mountain not found" }, 404);
    }
    const updated = { ...existing, ...updates };
    await withRetry(() => kv.set(`mountain:${id}`, updated), 'set mountain');
    await addToIndex(MOUNTAIN_INDEX, id);
    return c.json({ success: true, mountain: updated });
  } catch (error) {
    console.error("Error updating mountain:", error);
    return c.json({ error: `Failed to update mountain: ${error}` }, 500);
  }
});

// Cascade-delete a mountain + all its locations + all their assets
app.delete("/make-server-a0d4ba78/mountains/:id/cascade", async (c) => {
  try {
    const mountainId = c.req.param("id");

    // 1. Remove mountain from index + delete its KV entry
    const mountainIds: string[] = (await withRetry(() => kv.get(MOUNTAIN_INDEX), 'get mountain index')) || [];
    await withRetry(() => kv.set(MOUNTAIN_INDEX, mountainIds.filter((id: string) => id !== mountainId)), 'set mountain index');
    await withRetry(() => kv.del(`mountain:${mountainId}`), 'del mountain');

    // 2. Find all locations for this mountain, delete each one
    const locationIds: string[] = (await withRetry(() => kv.get(LOCATION_INDEX), 'get location index')) || [];
    const locationKeys = locationIds.map((id: string) => `location:${id}`);
    const locationRecords = locationKeys.length > 0 ? await batchedMget(locationKeys) : [];

    const orphanLocationIds: string[] = locationRecords
      .filter((l): l is Record<string, unknown> => !!l && (l as any).mountainId === mountainId)
      .map((l: any) => l.id as string);

    if (orphanLocationIds.length > 0) {
      await withRetry(() => kv.set(LOCATION_INDEX, locationIds.filter((id: string) => !orphanLocationIds.includes(id))), 'set location index');
      await withRetry(() => kv.mdel(orphanLocationIds.map((id: string) => `location:${id}`)), 'mdel locations');
    }

    // 3. Find all assets for those locations, delete each one
    const assetIds: string[] = (await withRetry(() => kv.get(ASSET_INDEX), 'get asset index')) || [];
    const assetKeys = assetIds.map((id: string) => `asset:${id}`);
    const assetRecords = assetKeys.length > 0 ? await batchedMget(assetKeys) : [];

    const orphanAssetIds: string[] = assetRecords
      .filter((a): a is Record<string, unknown> => !!a && orphanLocationIds.includes((a as any).locationId))
      .map((a: any) => a.id as string);

    if (orphanAssetIds.length > 0) {
      await withRetry(() => kv.set(ASSET_INDEX, assetIds.filter((id: string) => !orphanAssetIds.includes(id))), 'set asset index');
      await withRetry(() => kv.mdel(orphanAssetIds.map((id: string) => `asset:${id}`)), 'mdel assets');
    }

    // 4. Find and delete all site inspections for this mountain
    const siIds: string[] = (await withRetry(() => kv.get(SI_INDEX), 'get si index')) || [];
    const siKeys = siIds.map((id: string) => `siLoc:${id}`);
    const siRecords = siKeys.length > 0 ? await batchedMget(siKeys) : [];

    const orphanSiIds: string[] = siRecords
      .filter((s): s is Record<string, unknown> => !!s && (s as any).mountainId === mountainId)
      .map((s: any) => s.id as string);

    if (orphanSiIds.length > 0) {
      await withRetry(() => kv.set(SI_INDEX, siIds.filter((id: string) => !orphanSiIds.includes(id))), 'set si index');
      await withRetry(() => kv.mdel(orphanSiIds.map((id: string) => `siLoc:${id}`)), 'mdel si');
    }

    // 5. Find and delete all notes for this mountain
    const noteIds: string[] = (await withRetry(() => kv.get(NOTE_INDEX), 'get note index')) || [];
    const noteKeys = noteIds.map((id: string) => `note:${id}`);
    const noteRecords = noteKeys.length > 0 ? await batchedMget(noteKeys) : [];

    const orphanNoteIds: string[] = noteRecords
      .filter((n): n is Record<string, unknown> => !!n && (n as any).mountainId === mountainId)
      .map((n: any) => n.id as string);

    if (orphanNoteIds.length > 0) {
      await withRetry(() => kv.set(NOTE_INDEX, noteIds.filter((id: string) => !orphanNoteIds.includes(id))), 'set note index');
      await withRetry(() => kv.mdel(orphanNoteIds.map((id: string) => `note:${id}`)), 'mdel notes');
    }

    console.log(`Cascade-deleted mountain ${mountainId}: ${orphanLocationIds.length} locations, ${orphanAssetIds.length} assets, ${orphanSiIds.length} site inspections, ${orphanNoteIds.length} notes`);
    return c.json({ success: true, deletedLocations: orphanLocationIds.length, deletedAssets: orphanAssetIds.length, deletedSiteInspections: orphanSiIds.length, deletedNotes: orphanNoteIds.length });
  } catch (error) {
    console.error("Error cascade-deleting mountain:", error);
    return c.json({ error: `Failed to delete mountain: ${error}` }, 500);
  }
});

// ─── Site Inspections ──────────────────────────────────────────────────────

app.get("/make-server-a0d4ba78/site-inspections", async (c) => {
  try {
    const siteInspections = await getByIndex(SI_INDEX, "siLoc:");
    return c.json({ siteInspections });
  } catch (error) {
    console.error("Error fetching site inspections:", error);
    return c.json({ error: `Failed to fetch site inspections: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/site-inspections", async (c) => {
  try {
    const si = await c.req.json();
    await withRetry(() => kv.set(`siLoc:${si.id}`, si), 'set si');
    await addToIndex(SI_INDEX, si.id);
    return c.json({ success: true, siteInspection: si });
  } catch (error) {
    console.error("Error creating site inspection:", error);
    return c.json({ error: `Failed to create site inspection: ${error}` }, 500);
  }
});

app.put("/make-server-a0d4ba78/site-inspections/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = (await withRetry(() => kv.get(`siLoc:${id}`), 'get si')) as Record<string, unknown> | null;
    const updated = { ...(existing || {}), ...updates, id };
    await withRetry(() => kv.set(`siLoc:${id}`, updated), 'set si');
    await addToIndex(SI_INDEX, id);
    return c.json({ success: true, siteInspection: updated });
  } catch (error) {
    console.error("Error updating site inspection:", error);
    return c.json({ error: `Failed to update site inspection: ${error}` }, 500);
  }
});

app.delete("/make-server-a0d4ba78/site-inspections/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const siIds: string[] = (await withRetry(() => kv.get(SI_INDEX), 'get si index')) || [];
    await withRetry(() => kv.set(SI_INDEX, siIds.filter((sid: string) => sid !== id)), 'set si index');
    await withRetry(() => kv.del(`siLoc:${id}`), 'del si');
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting site inspection:", error);
    return c.json({ error: `Failed to delete site inspection: ${error}` }, 500);
  }
});

// ─── Install Locations ────────────────────────────────────────────────────────

app.get("/make-server-a0d4ba78/locations", async (c) => {
  try {
    const locations = await getByIndex(LOCATION_INDEX, "location:");
    return c.json({ locations });
  } catch (error) {
    console.error("Error fetching locations:", error);
    return c.json({ error: `Failed to fetch locations: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/locations", async (c) => {
  try {
    const location = await c.req.json();
    await withRetry(() => kv.set(`location:${location.id}`, location), 'set location');
    await addToIndex(LOCATION_INDEX, location.id);
    return c.json({ success: true, location });
  } catch (error) {
    console.error("Error creating location:", error);
    return c.json({ error: `Failed to create location: ${error}` }, 500);
  }
});

app.put("/make-server-a0d4ba78/locations/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = (await withRetry(() => kv.get(`location:${id}`), 'get location')) as Record<string, unknown> | null;
    const updated = { ...(existing || {}), ...updates, id };
    await withRetry(() => kv.set(`location:${id}`, updated), 'set location');
    await addToIndex(LOCATION_INDEX, id);
    return c.json({ success: true, location: updated });
  } catch (error) {
    console.error("Error updating location:", error);
    return c.json({ error: `Failed to update location: ${error}` }, 500);
  }
});

// Cascade-delete a location + all its assets
app.delete("/make-server-a0d4ba78/locations/:id/cascade", async (c) => {
  try {
    const locationId = c.req.param("id");

    // 1. Remove location from index + delete its KV entry
    const locationIds: string[] = (await withRetry(() => kv.get(LOCATION_INDEX), 'get location index')) || [];
    await withRetry(() => kv.set(LOCATION_INDEX, locationIds.filter((id: string) => id !== locationId)), 'set location index');
    await withRetry(() => kv.del(`location:${locationId}`), 'del location');

    // 2. Find all assets for this location, delete each one
    const assetIds: string[] = (await withRetry(() => kv.get(ASSET_INDEX), 'get asset index')) || [];
    const assetKeys = assetIds.map((id: string) => `asset:${id}`);
    const assetRecords = assetKeys.length > 0 ? await batchedMget(assetKeys) : [];

    const orphanAssetIds: string[] = assetRecords
      .filter((a): a is Record<string, unknown> => !!a && (a as any).locationId === locationId)
      .map((a: any) => a.id as string);

    if (orphanAssetIds.length > 0) {
      await withRetry(() => kv.set(ASSET_INDEX, assetIds.filter((id: string) => !orphanAssetIds.includes(id))), 'set asset index');
      await withRetry(() => kv.mdel(orphanAssetIds.map((id: string) => `asset:${id}`)), 'mdel assets');
    }

    console.log(`Cascade-deleted location ${locationId}: ${orphanAssetIds.length} assets`);
    return c.json({ success: true, deletedAssets: orphanAssetIds.length });
  } catch (error) {
    console.error("Error cascade-deleting location:", error);
    return c.json({ error: `Failed to delete location: ${error}` }, 500);
  }
});

// ─── Assets ───────────────────────────────────────────────────────────────────

app.get("/make-server-a0d4ba78/assets", async (c) => {
  try {
    const raw = await getByIndex(ASSET_INDEX, "asset:");
    // Strip photo fields — photos live client-side in IndexedDB only.
    const assets = raw.map(stripPhotos);
    return c.json({ assets });
  } catch (error) {
    console.error("Error fetching assets:", error);
    return c.json({ error: `Failed to fetch assets: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/assets", async (c) => {
  try {
    const asset = await c.req.json();
    // Always strip photos before persisting — photos belong in IndexedDB only
    const safeAsset = stripPhotos(asset as Record<string, unknown>);
    await withRetry(() => kv.set(`asset:${safeAsset.id}`, safeAsset), 'set asset');
    await addToIndex(ASSET_INDEX, safeAsset.id as string);
    return c.json({ success: true, asset: safeAsset });
  } catch (error) {
    console.error("Error creating asset:", error);
    return c.json({ error: `Failed to create asset: ${error}` }, 500);
  }
});

app.put("/make-server-a0d4ba78/assets/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = (await withRetry(() => kv.get(`asset:${id}`), 'get asset')) as Record<string, unknown> | null;
    if (!existing) {
      const safeUpdates = stripPhotos(updates as Record<string, unknown>);
      await withRetry(() => kv.set(`asset:${id}`, { ...safeUpdates, id }), 'set asset');
      await addToIndex(ASSET_INDEX, id);
      return c.json({ success: true, asset: safeUpdates });
    }
    const updated = stripPhotos({ ...existing, ...updates } as Record<string, unknown>);
    await withRetry(() => kv.set(`asset:${id}`, updated), 'set asset');
    await addToIndex(ASSET_INDEX, id);
    return c.json({ success: true, asset: updated });
  } catch (error) {
    console.error("Error updating asset:", error);
    return c.json({ error: `Failed to update asset: ${error}` }, 500);
  }
});

app.delete("/make-server-a0d4ba78/assets/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const assetIds: string[] = (await withRetry(() => kv.get(ASSET_INDEX), 'get asset index')) || [];
    await withRetry(() => kv.set(ASSET_INDEX, assetIds.filter((aid: string) => aid !== id)), 'set asset index');
    await withRetry(() => kv.del(`asset:${id}`), 'del asset');
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting asset:", error);
    return c.json({ error: `Failed to delete asset: ${error}` }, 500);
  }
});

// ─── Notes ────────────────────────────────────────────────────────────────────

app.get("/make-server-a0d4ba78/notes", async (c) => {
  try {
    const notes = await getByIndex(NOTE_INDEX, "note:");
    return c.json({ notes });
  } catch (error) {
    console.error("Error fetching notes:", error);
    return c.json({ error: `Failed to fetch notes: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/notes", async (c) => {
  try {
    const note = await c.req.json();
    await withRetry(() => kv.set(`note:${note.id}`, note), 'set note');
    await addToIndex(NOTE_INDEX, note.id);
    return c.json({ success: true, note });
  } catch (error) {
    console.error("Error creating note:", error);
    return c.json({ error: `Failed to create note: ${error}` }, 500);
  }
});

app.put("/make-server-a0d4ba78/notes/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = (await withRetry(() => kv.get(`note:${id}`), 'get note')) as Record<string, unknown> | null;
    const updated = { ...(existing || {}), ...updates, id };
    await withRetry(() => kv.set(`note:${id}`, updated), 'set note');
    await addToIndex(NOTE_INDEX, id);
    return c.json({ success: true, note: updated });
  } catch (error) {
    console.error("Error updating note:", error);
    return c.json({ error: `Failed to update note: ${error}` }, 500);
  }
});

app.delete("/make-server-a0d4ba78/notes/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const noteIds: string[] = (await withRetry(() => kv.get(NOTE_INDEX), 'get note index')) || [];
    await withRetry(() => kv.set(NOTE_INDEX, noteIds.filter((nid: string) => nid !== id)), 'set note index');
    await withRetry(() => kv.del(`note:${id}`), 'del note');
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting note:", error);
    return c.json({ error: `Failed to delete note: ${error}` }, 500);
  }
});

// ─── Options (custom dropdown values, shared across all mountains) ───────────

app.get("/make-server-a0d4ba78/options", async (c) => {
  try {
    const options = (await withRetry(() => kv.get("all:options"), 'get options')) as Record<string, string[]> | null;
    return c.json({ options: options || {} });
  } catch (error) {
    console.error("Error fetching options:", error);
    return c.json({ error: `Failed to fetch options: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/options", async (c) => {
  try {
    const { key, value } = await c.req.json();
    if (!key || !value) return c.json({ error: "key and value are required" }, 400);
    const current = ((await withRetry(() => kv.get("all:options"), 'get options')) as Record<string, string[]> | null) || {};
    const arr: string[] = current[key] ? [...current[key]] : [];
    if (!arr.includes(value)) {
      arr.push(value);
      arr.sort((a, b) => a.localeCompare(b));
    }
    const updated = { ...current, [key]: arr };
    await withRetry(() => kv.set("all:options", updated), 'set options');
    return c.json({ options: updated });
  } catch (error) {
    console.error("Error saving option:", error);
    return c.json({ error: `Failed to save option: ${error}` }, 500);
  }
});

app.delete("/make-server-a0d4ba78/options", async (c) => {
  try {
    const { key, value } = await c.req.json();
    if (!key || !value) return c.json({ error: "key and value are required" }, 400);
    const current = ((await withRetry(() => kv.get("all:options"), 'get options')) as Record<string, string[]> | null) || {};
    const arr: string[] = (current[key] || []).filter((v: string) => v !== value);
    const updated = { ...current, [key]: arr };
    await withRetry(() => kv.set("all:options", updated), 'set options');
    return c.json({ options: updated });
  } catch (error) {
    console.error("Error deleting option:", error);
    return c.json({ error: `Failed to delete option: ${error}` }, 500);
  }
});

// ─── Item Prices ──────────────────────────────────────────────────────────────

app.get("/make-server-a0d4ba78/item-prices", async (c) => {
  try {
    const prices = (await withRetry(() => kv.get("all:itemPrices"), 'get item prices')) as Record<string, number> | null;
    return c.json({ prices: prices || {} });
  } catch (error) {
    console.error("Error fetching item prices:", error);
    return c.json({ error: `Failed to fetch item prices: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/item-prices", async (c) => {
  try {
    const { name, price } = await c.req.json();
    if (!name) return c.json({ error: "name is required" }, 400);
    const current = ((await withRetry(() => kv.get("all:itemPrices"), 'get item prices')) as Record<string, number> | null) || {};
    let updated: Record<string, number>;
    if (price === null || price === undefined) {
      const { [name]: _, ...rest } = current;
      updated = rest;
    } else {
      updated = { ...current, [name]: Number(price) };
    }
    await withRetry(() => kv.set("all:itemPrices", updated), 'set item prices');
    return c.json({ prices: updated });
  } catch (error) {
    console.error("Error saving item price:", error);
    return c.json({ error: `Failed to save item price: ${error}` }, 500);
  }
});

// ─── Google Places (proxy — keeps API key server-side) ─────────────────────────

app.get("/make-server-a0d4ba78/places/autocomplete", async (c) => {
  try {
    const input = c.req.query("input");
    if (!input || input.length < 2) return c.json({ suggestions: [] });
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) return c.json({ error: "GOOGLE_PLACES_API_KEY not configured" }, 500);
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json() as any;
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.log("Places autocomplete API error:", data.status, data.error_message);
      return c.json({ error: `Places API: ${data.status}` }, 500);
    }
    const suggestions = (data.predictions || []).map((p: any) => ({
      placeId: p.place_id,
      description: p.description,
    }));
    return c.json({ suggestions });
  } catch (error) {
    console.error("Error fetching place autocomplete:", error);
    return c.json({ error: `Failed to fetch autocomplete: ${error}` }, 500);
  }
});

app.get("/make-server-a0d4ba78/places/details", async (c) => {
  try {
    const placeId = c.req.query("place_id");
    if (!placeId) return c.json({ error: "place_id required" }, 400);
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) return c.json({ error: "GOOGLE_PLACES_API_KEY not configured" }, 500);
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,formatted_address,geometry&key=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json() as any;
    if (data.status !== "OK") {
      console.log("Places details API error:", data.status, data.error_message);
      return c.json({ error: `Places API: ${data.status}` }, 500);
    }
    const result = data.result;
    return c.json({
      name: result.name,
      address: result.formatted_address,
      location: result.geometry?.location ?? null,
    });
  } catch (error) {
    console.error("Error fetching place details:", error);
    return c.json({ error: `Failed to fetch place details: ${error}` }, 500);
  }
});

app.get("/make-server-a0d4ba78/places/geocode", async (c) => {
  try {
    const address = c.req.query("address");
    if (!address) return c.json({ location: null });
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) return c.json({ location: null });
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json() as any;
    if (data.status !== "OK" || !data.results?.length) return c.json({ location: null });
    const location = data.results[0]?.geometry?.location ?? null;
    return c.json({ location });
  } catch (error) {
    console.error("Error geocoding address:", error);
    return c.json({ location: null });
  }
});

Deno.serve(app.fetch);