// Admin-uploaded files for the Resource Center's Training Materials, Sales
// Tools, and Marketing Assets tabs (db/migrations/0033_resource_files.sql).
// Any authenticated user can list/download; upload and delete are
// admin/super_admin only, enforced here (not just hidden in the UI).
import { Hono } from "hono";
import { requireAdmin, type HonoEnv } from "../auth";
import { query, queryOne } from "../db";
import { putObject, deleteObject, decodeDataUrl, extFromMime, getSignedGetUrl } from "../s3";

export const resourceFiles = new Hono<HonoEnv>();

const CATEGORIES = ["training", "sales", "marketing"];

resourceFiles.get("/", async (c) => {
  const category = c.req.query("category");
  if (!category || !CATEGORIES.includes(category)) {
    return c.json({ error: `category must be one of: ${CATEGORIES.join(", ")}` }, 400);
  }
  const rows = await query<{
    id: string; name: string; original_filename: string; mime_type: string;
    s3_key: string; file_size: number | null; created_at: string;
  }>(
    `SELECT id, name, original_filename, mime_type, s3_key, file_size, created_at
       FROM resource_files WHERE category = $1 ORDER BY created_at DESC`,
    [category]
  );
  const files = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      originalFilename: r.original_filename,
      mimeType: r.mime_type,
      fileSize: r.file_size,
      createdAt: r.created_at,
      url: await getSignedGetUrl(r.s3_key),
    }))
  );
  return c.json({ files });
});

resourceFiles.post("/", requireAdmin, async (c) => {
  const user = c.get("user");
  const { category, name, dataUrl, fileName, mimeType } = await c.req.json().catch(() => ({}));
  if (!category || !CATEGORIES.includes(category)) {
    return c.json({ error: `category must be one of: ${CATEGORIES.join(", ")}` }, 400);
  }
  if (!name?.trim() || !dataUrl || !fileName) {
    return c.json({ error: "name, dataUrl, and fileName are required" }, 400);
  }
  const { mime, bytes } = decodeDataUrl(dataUrl);
  const finalMime = mimeType || mime;
  const id = crypto.randomUUID();
  const key = `resource-files/${category}/${id}.${extFromMime(finalMime)}`;
  await putObject(key, bytes, finalMime);

  const file = await queryOne<{ id: string }>(
    `INSERT INTO resource_files (id, category, name, original_filename, mime_type, s3_key, file_size, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [id, category, name.trim(), fileName, finalMime, key, bytes.length, user.id]
  );
  return c.json({ success: true, file }, 201);
});

resourceFiles.patch("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const { name } = await c.req.json().catch(() => ({}));
  if (!name?.trim()) return c.json({ error: "name is required" }, 400);
  const row = await queryOne<{ id: string }>(
    `UPDATE resource_files SET name = $1 WHERE id = $2 RETURNING id`,
    [name.trim(), id]
  );
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

resourceFiles.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const row = await queryOne<{ s3_key: string }>(`DELETE FROM resource_files WHERE id=$1 RETURNING s3_key`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  await deleteObject(row.s3_key);
  return c.json({ ok: true });
});
