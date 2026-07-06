import { Hono } from "hono";
import { query, queryOne } from "../db";
import type { HonoEnv } from "../auth";

export const locations = new Hono<HonoEnv>();

// List locations for a mountain (optionally filtered to a trail), with the trail
// name and asset / inspection counts.
locations.get("/", async (c) => {
  const mountainId = c.req.query("mountainId");
  const trailId = c.req.query("trailId");
  if (!mountainId && !trailId) return c.json({ error: "mountainId or trailId is required" }, 400);
  const where = trailId ? "l.trail_id = $1" : "l.mountain_id = $1";
  const rows = await query(
    `SELECT l.*, t.name AS trail_name,
            (SELECT count(*)::int FROM assets a WHERE a.location_id = l.id) AS asset_count,
            (SELECT count(*)::int FROM location_inspections li WHERE li.location_id = l.id) AS inspection_count
       FROM locations l LEFT JOIN trails t ON t.id = l.trail_id
      WHERE ${where} ORDER BY l.name`,
    [trailId ?? mountainId]
  );
  return c.json({ locations: rows });
});

// One location + trail name + inspection history.
locations.get("/:id", async (c) => {
  const id = c.req.param("id");
  const location = await queryOne(
    `SELECT l.*, t.name AS trail_name FROM locations l
       LEFT JOIN trails t ON t.id = l.trail_id WHERE l.id = $1`,
    [id]
  );
  if (!location) return c.json({ error: "Not found" }, 404);
  const inspections = await query(
    `SELECT * FROM location_inspections WHERE location_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  return c.json({ location, inspections });
});

locations.post("/", async (c) => {
  const user = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  if (!b?.mountain_id || !b?.name) return c.json({ error: "mountain_id and name are required" }, 400);
  const location = await queryOne(
    `INSERT INTO locations (mountain_id, trail_id, name, difficulty, notes, latitude, longitude, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [b.mountain_id, b.trail_id ?? null, b.name, b.difficulty ?? null, b.notes ?? null,
     b.latitude ?? null, b.longitude ?? null, user.id]
  );
  return c.json({ location }, 201);
});

locations.put("/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json().catch(() => ({}));
  const location = await queryOne(
    `UPDATE locations SET
       name = COALESCE($1, name),
       trail_id = $2,
       difficulty = $3,
       notes = $4,
       latitude = $5,
       longitude = $6
     WHERE id = $7 RETURNING *`,
    [b.name ?? null, b.trail_id ?? null, b.difficulty ?? null, b.notes ?? null,
     b.latitude ?? null, b.longitude ?? null, id]
  );
  return location ? c.json({ location }) : c.json({ error: "Not found" }, 404);
});

locations.delete("/:id", async (c) => {
  await query(`DELETE FROM locations WHERE id = $1`, [c.req.param("id")]);
  return c.json({ ok: true });
});

// Add an inspection (append-only log).
locations.post("/:id/inspections", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const b = await c.req.json().catch(() => ({}));
  const inspection = await queryOne(
    `INSERT INTO location_inspections (location_id, items, notes, inspected_by)
       VALUES ($1, $2::jsonb, $3, $4) RETURNING *`,
    [id, JSON.stringify(b.items ?? []), b.notes ?? null, user.id]
  );
  return c.json({ inspection }, 201);
});
