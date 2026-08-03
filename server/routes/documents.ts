import { Hono } from "hono";
import { query, queryOne } from "../db";
import type { HonoEnv } from "../auth";
import { putObject, getSignedGetUrl, getSignedPutUrl, deleteObjects, decodeDataUrl, extFromMime } from "../s3";

// Replaces the legacy Supabase Storage/KV Edge Function for photos, videos,
// trail maps, and image annotations — everything now lives in the Postgres
// `documents` table (0007/0013/0014) with bytes in S3 (yullr-builder-prod).
export const documents = new Hono<HonoEnv>();

interface DocRow {
  id: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
}

async function upsertDocument(opts: {
  mountainId?: string | null; locationId?: string | null; assetId?: string | null;
  kind: "photo" | "video" | "file" | "trail_map";
  field?: string | null; slotIndex?: number | null;
  storagePath: string; fileName?: string | null; mimeType?: string | null;
  userId: string;
}): Promise<DocRow> {
  const { mountainId = null, locationId = null, assetId = null, kind, field = null, slotIndex = null,
          storagePath, fileName = null, mimeType = null, userId } = opts;

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM documents WHERE
       mountain_id IS NOT DISTINCT FROM $1 AND location_id IS NOT DISTINCT FROM $2 AND asset_id IS NOT DISTINCT FROM $3
       AND kind = $4::document_kind AND field IS NOT DISTINCT FROM $5 AND slot_index IS NOT DISTINCT FROM $6`,
    [mountainId, locationId, assetId, kind, field, slotIndex]
  );

  if (existing) {
    return (await queryOne<DocRow>(
      `UPDATE documents SET storage_path = $1, file_name = $2, mime_type = $3, uploaded_at = now(), uploaded_by = $4
         WHERE id = $5 RETURNING id, storage_path, file_name, mime_type`,
      [storagePath, fileName, mimeType, userId, existing.id]
    ))!;
  }

  try {
    return (await queryOne<DocRow>(
      `INSERT INTO documents (mountain_id, location_id, asset_id, kind, field, slot_index, storage_path, file_name, mime_type, uploaded_by)
         VALUES ($1,$2,$3,$4::document_kind,$5,$6,$7,$8,$9,$10)
       RETURNING id, storage_path, file_name, mime_type`,
      [mountainId, locationId, assetId, kind, field, slotIndex, storagePath, fileName, mimeType, userId]
    ))!;
  } catch (err: any) {
    // Two uploads to the same slot raced past the SELECT above — the unique
    // index caught it. Fall back to updating the row that won.
    if (err?.code === "23505") {
      const row = await queryOne<{ id: string }>(
        `SELECT id FROM documents WHERE
           mountain_id IS NOT DISTINCT FROM $1 AND location_id IS NOT DISTINCT FROM $2 AND asset_id IS NOT DISTINCT FROM $3
           AND kind = $4::document_kind AND field IS NOT DISTINCT FROM $5 AND slot_index IS NOT DISTINCT FROM $6`,
        [mountainId, locationId, assetId, kind, field, slotIndex]
      );
      return (await queryOne<DocRow>(
        `UPDATE documents SET storage_path = $1, file_name = $2, mime_type = $3, uploaded_at = now(), uploaded_by = $4
           WHERE id = $5 RETURNING id, storage_path, file_name, mime_type`,
        [storagePath, fileName, mimeType, userId, row!.id]
      ))!;
    }
    throw err;
  }
}

// ─── Asset photos ─────────────────────────────────────────────────────────────

documents.post("/photos/upload", async (c) => {
  const user = c.get("user");
  const { assetId, field, index, dataUrl } = await c.req.json().catch(() => ({}));
  if (!assetId || !field || !dataUrl) return c.json({ error: "assetId, field, and dataUrl are required" }, 400);

  try {
    const { mime, bytes } = decodeDataUrl(dataUrl);
    const ext = extFromMime(mime);
    const suffix = index !== undefined && index !== null ? `_${index}` : "";
    const key = `assets/${assetId}/${field}${suffix}.${ext}`;
    await putObject(key, bytes, mime);

    await upsertDocument({
      assetId, kind: "photo", field, slotIndex: index ?? null,
      storagePath: key, mimeType: mime, userId: user.id,
    });
    return c.json({ success: true, path: key });
  } catch (err) {
    console.error("[documents] asset photo upload error:", err);
    return c.json({ error: `Failed to upload asset photo: ${err}` }, 500);
  }
});

documents.post("/photos/batch-urls", async (c) => {
  const { assetIds } = await c.req.json().catch(() => ({ assetIds: [] }));
  if (!Array.isArray(assetIds) || assetIds.length === 0) return c.json({ urlMap: {} });

  const rows = await query<{ asset_id: string; field: string; slot_index: number | null; storage_path: string }>(
    `SELECT asset_id, field, slot_index, storage_path FROM documents
       WHERE asset_id = ANY($1) AND kind = 'photo' ORDER BY slot_index NULLS FIRST`,
    [assetIds]
  );

  const urlMap: Record<string, Record<string, string | string[]>> = {};
  for (const row of rows) {
    const url = await getSignedGetUrl(row.storage_path);
    const bucket = (urlMap[row.asset_id] ??= {});
    if (row.slot_index === null) {
      bucket[row.field] = url;
    } else {
      const arr = (bucket[row.field] ??= []) as string[];
      arr[row.slot_index] = url;
    }
  }
  // Compact any sparse arrays (a deleted middle slot would otherwise leave holes).
  for (const fields of Object.values(urlMap)) {
    for (const [k, v] of Object.entries(fields)) {
      if (Array.isArray(v)) fields[k] = v.filter(Boolean);
    }
  }
  return c.json({ urlMap });
});

documents.delete("/photos/:assetId", async (c) => {
  const assetId = c.req.param("assetId");
  const rows = await query<{ storage_path: string }>(
    `DELETE FROM documents WHERE asset_id = $1 AND kind = 'photo' RETURNING storage_path`, [assetId]
  );
  await deleteObjects(rows.map(r => r.storage_path));
  return c.json({ success: true, deletedFiles: rows.length });
});

// ─── Location media (photos + videos, location-level + inspection-level) ─────

documents.post("/location-media/upload", async (c) => {
  const user = c.get("user");
  const { locationId, mediaType, field, index, dataUrl } = await c.req.json().catch(() => ({}));
  if (!locationId || !mediaType || !field || !dataUrl) {
    return c.json({ error: "locationId, mediaType, field, and dataUrl are required" }, 400);
  }
  try {
    const { mime, bytes } = decodeDataUrl(dataUrl);
    const ext = extFromMime(mime);
    const key = `locations/${locationId}/${mediaType}/${field}/${index}.${ext}`;
    await putObject(key, bytes, mime);

    await upsertDocument({
      locationId, kind: field === "videos" ? "video" : "photo", field: `${mediaType}:${field}`, slotIndex: index ?? null,
      storagePath: key, mimeType: mime, userId: user.id,
    });
    return c.json({ success: true, path: key });
  } catch (err) {
    console.error("[documents] location media upload error:", err);
    return c.json({ error: `Failed to upload location media: ${err}` }, 500);
  }
});

documents.post("/location-media/presign-video", async (c) => {
  const { locationId, mediaType = "loc", index, ext = "mp4" } = await c.req.json().catch(() => ({}));
  if (!locationId || index === undefined) return c.json({ error: "locationId and index are required" }, 400);
  const key = `locations/${locationId}/${mediaType}/videos/${index}.${ext}`;
  const mime = ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4";
  const signedUrl = await getSignedPutUrl(key, mime);
  return c.json({ signedUrl, path: key });
});

documents.post("/location-media/register-video", async (c) => {
  const user = c.get("user");
  const { locationId, mediaType = "loc", index, path } = await c.req.json().catch(() => ({}));
  if (!locationId || !path || index === undefined) {
    return c.json({ error: "locationId, path, and index are required" }, 400);
  }
  await upsertDocument({
    locationId, kind: "video", field: `${mediaType}:videos`, slotIndex: index,
    storagePath: path, userId: user.id,
  });
  return c.json({ success: true, path });
});

documents.post("/location-media/batch-urls", async (c) => {
  const { locationIds } = await c.req.json().catch(() => ({ locationIds: [] }));
  if (!Array.isArray(locationIds) || locationIds.length === 0) return c.json({ urlMap: {} });

  const rows = await query<{ location_id: string; field: string; slot_index: number | null; storage_path: string }>(
    `SELECT location_id, field, slot_index, storage_path FROM documents
       WHERE location_id = ANY($1) AND kind IN ('photo','video') ORDER BY slot_index NULLS FIRST`,
    [locationIds]
  );

  const urlMap: Record<string, Record<string, Record<string, string[]>>> = {};
  for (const row of rows) {
    const [mediaType, arrField] = row.field.split(":"); // 'loc:photos' -> ['loc','photos']
    const url = await getSignedGetUrl(row.storage_path);
    const locBucket = (urlMap[row.location_id] ??= {});
    const typeBucket = (locBucket[mediaType] ??= {});
    const arr = (typeBucket[arrField] ??= []);
    if (row.slot_index === null) arr.push(url); else arr[row.slot_index] = url;
  }
  for (const loc of Object.values(urlMap)) {
    for (const type of Object.values(loc)) {
      for (const [k, v] of Object.entries(type)) type[k] = v.filter(Boolean);
    }
  }
  return c.json({ urlMap });
});

documents.delete("/location-media/:locationId", async (c) => {
  const locationId = c.req.param("locationId");
  const rows = await query<{ storage_path: string }>(
    `DELETE FROM documents WHERE location_id = $1 AND kind IN ('photo','video') RETURNING storage_path`, [locationId]
  );
  await deleteObjects(rows.map(r => r.storage_path));
  return c.json({ success: true, deletedFiles: rows.length });
});

// ─── Trail maps (one per mountain) ────────────────────────────────────────────

documents.post("/trail-map/upload", async (c) => {
  const user = c.get("user");
  const { mountainId, dataUrl, mimeType, fileName } = await c.req.json().catch(() => ({}));
  if (!mountainId || !dataUrl || !mimeType) {
    return c.json({ error: "mountainId, dataUrl, and mimeType are required" }, 400);
  }
  try {
    const { bytes } = decodeDataUrl(dataUrl);
    const ext = extFromMime(mimeType);
    const key = `trail-maps/${mountainId}.${ext}`;
    await putObject(key, bytes, mimeType);
    await upsertDocument({
      mountainId, kind: "trail_map", storagePath: key,
      fileName: fileName || key, mimeType, userId: user.id,
    });
    const url = await getSignedGetUrl(key);
    return c.json({ success: true, url });
  } catch (err) {
    console.error("[documents] trail map upload error:", err);
    return c.json({ error: `Failed to upload trail map: ${err}` }, 500);
  }
});

documents.get("/trail-map/:mountainId", async (c) => {
  const mountainId = c.req.param("mountainId");
  const row = await queryOne<DocRow>(
    `SELECT id, storage_path, file_name, mime_type FROM documents WHERE mountain_id = $1 AND kind = 'trail_map'`,
    [mountainId]
  );
  if (!row) return c.json({ url: null, mimeType: null, fileName: null });
  const url = await getSignedGetUrl(row.storage_path);
  return c.json({ url, mimeType: row.mime_type, fileName: row.file_name });
});

documents.delete("/trail-map/:mountainId", async (c) => {
  const mountainId = c.req.param("mountainId");
  const rows = await query<{ storage_path: string }>(
    `DELETE FROM documents WHERE mountain_id = $1 AND kind = 'trail_map' RETURNING storage_path`, [mountainId]
  );
  await deleteObjects(rows.map(r => r.storage_path));
  return c.json({ success: true });
});

// ─── Mountain-level documents (the "Documents" panel Upload button) ───────────
// One row per uploaded file (no fixed slot — MountainDocuments.tsx lets users
// upload any number of arbitrary files), distinguished from trail_map by
// field = 'mountainDoc'.

documents.post("/mountain-docs/upload", async (c) => {
  const user = c.get("user");
  const { mountainId, dataUrl, fileName, mimeType, id } = await c.req.json().catch(() => ({}));
  if (!mountainId || !dataUrl || !fileName) {
    return c.json({ error: "mountainId, dataUrl, and fileName are required" }, 400);
  }
  try {
    const { mime, bytes } = decodeDataUrl(dataUrl);
    const finalMime = mimeType || mime;
    const ext = extFromMime(finalMime);
    // Client supplies the id (matches the local IndexedDB record it already
    // created) so the local cache and the cloud row share one identity —
    // otherwise a device would see the same file twice after a resync.
    const docId = id || crypto.randomUUID();
    const key = `mountains/${mountainId}/documents/${docId}.${ext}`;
    await putObject(key, bytes, finalMime);

    const kind = finalMime.startsWith("image/") ? "photo" : finalMime.startsWith("video/") ? "video" : "file";
    const row = await queryOne<{ uploaded_at: string }>(
      `INSERT INTO documents (id, mountain_id, kind, field, storage_path, file_name, mime_type, file_size, uploaded_by)
         VALUES ($1,$2,$3::document_kind,'mountainDoc',$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         storage_path = EXCLUDED.storage_path, file_name = EXCLUDED.file_name,
         mime_type = EXCLUDED.mime_type, file_size = EXCLUDED.file_size, uploaded_at = now()
       RETURNING uploaded_at`,
      [docId, mountainId, kind, key, fileName, finalMime, bytes.length, user.id]
    );

    const url = await getSignedGetUrl(key);
    return c.json({
      success: true,
      document: { id: docId, name: fileName, type: finalMime, size: bytes.length, url, uploadedAt: row!.uploaded_at },
    });
  } catch (err) {
    console.error("[documents] mountain-doc upload error:", err);
    return c.json({ error: `Failed to upload document: ${err}` }, 500);
  }
});

documents.get("/mountain-docs/:mountainId", async (c) => {
  const mountainId = c.req.param("mountainId");
  const rows = await query<{ id: string; file_name: string; mime_type: string; file_size: number | null; uploaded_at: string; storage_path: string }>(
    `SELECT id, file_name, mime_type, file_size, uploaded_at, storage_path FROM documents
       WHERE mountain_id = $1 AND field = 'mountainDoc' ORDER BY uploaded_at DESC`,
    [mountainId]
  );
  const docs = await Promise.all(rows.map(async r => ({
    id: r.id, name: r.file_name, type: r.mime_type, size: Number(r.file_size) || 0,
    uploadedAt: r.uploaded_at, url: await getSignedGetUrl(r.storage_path),
  })));
  return c.json({ documents: docs });
});

documents.delete("/mountain-docs/:mountainId/:id", async (c) => {
  const { mountainId, id } = c.req.param();
  const row = await queryOne<{ storage_path: string }>(
    `DELETE FROM documents WHERE id = $1 AND mountain_id = $2 AND field = 'mountainDoc' RETURNING storage_path`,
    [id, mountainId]
  );
  if (row) await deleteObjects([row.storage_path]);
  return c.json({ success: true });
});

// ─── Image annotations ─────────────────────────────────────────────────────────
// Keyed by an opaque imageId minted by the annotator, independent of any
// documents row — kept as a small dedicated KV table (image_annotations, 0014).

documents.post("/annotations/upload", async (c) => {
  const { imageId, annotations } = await c.req.json().catch(() => ({}));
  if (!imageId) return c.json({ error: "Missing imageId" }, 400);
  await query(
    `INSERT INTO image_annotations (image_id, annotations, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (image_id) DO UPDATE SET annotations = $2, updated_at = now()`,
    [imageId, JSON.stringify(annotations ?? [])]
  );
  return c.json({ success: true });
});

documents.post("/annotations/batch-get", async (c) => {
  const { imageIds } = await c.req.json().catch(() => ({ imageIds: [] }));
  if (!Array.isArray(imageIds) || imageIds.length === 0) return c.json({ annotationsMap: {} });
  const rows = await query<{ image_id: string; annotations: unknown }>(
    `SELECT image_id, annotations FROM image_annotations WHERE image_id = ANY($1)`, [imageIds]
  );
  const annotationsMap: Record<string, unknown> = {};
  for (const row of rows) annotationsMap[row.image_id] = row.annotations;
  return c.json({ annotationsMap });
});

documents.delete("/annotations/:imageId", async (c) => {
  await query(`DELETE FROM image_annotations WHERE image_id = $1`, [c.req.param("imageId")]);
  return c.json({ success: true });
});

// ─── Image proxy (PDF export bypassing browser CORS on external images) ──────

documents.get("/proxy-image", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.text("Missing url parameter", 400);
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "YULLR-PDF-Export/1.0" } });
    if (!resp.ok) return c.text(`Upstream returned ${resp.status}`, 502);
    const bytes = await resp.arrayBuffer();
    const ct = resp.headers.get("content-type") || "image/png";
    return c.body(bytes, 200, { "Content-Type": ct, "Cache-Control": "public, max-age=3600" });
  } catch (err) {
    console.error("[documents] image proxy error:", err);
    return c.text(`Proxy fetch failed: ${err}`, 502);
  }
});
