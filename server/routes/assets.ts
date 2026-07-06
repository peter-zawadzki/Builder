import { Hono } from "hono";
import { query, queryOne } from "../db";
import type { HonoEnv } from "../auth";

export const assets = new Hono<HonoEnv>();

const SELECT = `
  SELECT a.*, mf.name AS manufacturer_name, md.name AS model_name,
         l.name AS location_name
    FROM assets a
    LEFT JOIN equipment_catalog mf ON mf.id = a.manufacturer_id
    LEFT JOIN equipment_catalog md ON md.id = a.model_id
    LEFT JOIN locations l ON l.id = a.location_id`;

// List by location or by mountain.
assets.get("/", async (c) => {
  const locationId = c.req.query("locationId");
  const mountainId = c.req.query("mountainId");
  if (!locationId && !mountainId) return c.json({ error: "locationId or mountainId is required" }, 400);
  const where = locationId ? "a.location_id = $1" : "a.mountain_id = $1";
  const rows = await query(`${SELECT} WHERE ${where} ORDER BY a.created_at DESC`, [locationId ?? mountainId]);
  return c.json({ assets: rows });
});

assets.get("/:id", async (c) => {
  const asset = await queryOne(`${SELECT} WHERE a.id = $1`, [c.req.param("id")]);
  return asset ? c.json({ asset }) : c.json({ error: "Not found" }, 404);
});

assets.post("/", async (c) => {
  const user = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  if (!b?.mountain_id || !b?.type) return c.json({ error: "mountain_id and type are required" }, 400);
  const asset = await queryOne(
    `INSERT INTO assets (mountain_id, location_id, type, manufacturer_id, model_id, serial_number, ip_address, network_category, notes, is_draft, created_by)
       VALUES ($1,$2,$3::asset_type,$4,$5,$6,$7,$8,$9,COALESCE($10,false),$11) RETURNING *`,
    [b.mountain_id, b.location_id ?? null, b.type, b.manufacturer_id ?? null, b.model_id ?? null,
     b.serial_number ?? null, b.ip_address ?? null, b.network_category ?? null, b.notes ?? null, b.is_draft ?? false, user.id]
  );
  return c.json({ asset }, 201);
});

assets.put("/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json().catch(() => ({}));
  const asset = await queryOne(
    `UPDATE assets SET
       location_id = $1, manufacturer_id = $2, model_id = $3,
       serial_number = $4, ip_address = $5, network_category = $6,
       notes = $7, is_draft = COALESCE($8, is_draft)
     WHERE id = $9 RETURNING *`,
    [b.location_id ?? null, b.manufacturer_id ?? null, b.model_id ?? null,
     b.serial_number ?? null, b.ip_address ?? null, b.network_category ?? null,
     b.notes ?? null, b.is_draft ?? null, id]
  );
  return asset ? c.json({ asset }) : c.json({ error: "Not found" }, 404);
});

assets.delete("/:id", async (c) => {
  await query(`DELETE FROM assets WHERE id = $1`, [c.req.param("id")]);
  return c.json({ ok: true });
});
