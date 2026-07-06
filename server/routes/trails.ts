import { Hono } from "hono";
import { query, queryOne } from "../db";
import type { HonoEnv } from "../auth";

export const trails = new Hono<HonoEnv>();

// List trails for a mountain (with child location counts).
trails.get("/", async (c) => {
  const mountainId = c.req.query("mountainId");
  if (!mountainId) return c.json({ error: "mountainId is required" }, 400);
  const rows = await query(
    `SELECT t.*,
            (SELECT count(*)::int FROM locations l WHERE l.trail_id = t.id) AS location_count
       FROM trails t WHERE t.mountain_id = $1 ORDER BY t.name`,
    [mountainId]
  );
  return c.json({ trails: rows });
});

// One trail + its locations.
trails.get("/:id", async (c) => {
  const id = c.req.param("id");
  const trail = await queryOne(`SELECT * FROM trails WHERE id = $1`, [id]);
  if (!trail) return c.json({ error: "Not found" }, 404);
  const locations = await query(
    `SELECT l.*, (SELECT count(*)::int FROM assets a WHERE a.location_id = l.id) AS asset_count
       FROM locations l WHERE l.trail_id = $1 ORDER BY l.name`,
    [id]
  );
  return c.json({ trail, locations });
});

trails.post("/", async (c) => {
  const user = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  if (!b?.mountain_id || !b?.name) return c.json({ error: "mountain_id and name are required" }, 400);
  const trail = await queryOne(
    `INSERT INTO trails (mountain_id, name, notes, is_nastar, created_by)
       VALUES ($1, $2, $3, COALESCE($4, false), $5) RETURNING *`,
    [b.mountain_id, b.name, b.notes ?? null, b.is_nastar ?? false, user.id]
  );
  return c.json({ trail }, 201);
});

trails.put("/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json().catch(() => ({}));
  const trail = await queryOne(
    `UPDATE trails SET
       name = COALESCE($1, name),
       notes = $2,
       is_nastar = COALESCE($3, is_nastar)
     WHERE id = $4 RETURNING *`,
    [b.name ?? null, b.notes ?? null, b.is_nastar ?? null, id]
  );
  return trail ? c.json({ trail }) : c.json({ error: "Not found" }, 404);
});

// Delete — child locations keep existing; their trail_id is set NULL by the FK.
trails.delete("/:id", async (c) => {
  await query(`DELETE FROM trails WHERE id = $1`, [c.req.param("id")]);
  return c.json({ ok: true });
});
