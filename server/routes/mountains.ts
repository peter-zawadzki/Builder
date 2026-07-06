import { Hono } from "hono";
import { query, queryOne } from "../db";
import type { HonoEnv } from "../auth";

export const mountains = new Hono<HonoEnv>();

// List — each mountain with its (primary) project stage and rollup counts, which
// is what the mountains list screen renders.
mountains.get("/", async (c) => {
  const rows = await query(`
    SELECT m.id, m.name, m.address, m.region, m.phone, m.email, m.website, m.status,
           p.stage AS project_stage, p.is_stalled,
           (SELECT count(*)::int FROM trails t    WHERE t.mountain_id = m.id) AS trail_count,
           (SELECT count(*)::int FROM locations l WHERE l.mountain_id = m.id) AS location_count,
           (SELECT count(*)::int FROM assets a    WHERE a.mountain_id = m.id) AS asset_count,
           (SELECT count(*)::int FROM notes n     WHERE n.mountain_id = m.id) AS note_count,
           m.updated_at
      FROM mountains m
      LEFT JOIN LATERAL (
        SELECT stage, is_stalled FROM projects pr
        WHERE pr.mountain_id = m.id ORDER BY pr.created_at LIMIT 1
      ) p ON true
     ORDER BY m.name`);
  return c.json({ mountains: rows });
});

// One mountain, full row + its primary project + panel summary counts and the
// contacts/notes lists (so the detail page can render panel header pills and
// content in a single call).
mountains.get("/:id", async (c) => {
  const id = c.req.param("id");
  const mountain = await queryOne(`SELECT * FROM mountains WHERE id = $1`, [id]);
  if (!mountain) return c.json({ error: "Not found" }, 404);
  const project = await queryOne(
    `SELECT * FROM projects WHERE mountain_id = $1 ORDER BY created_at LIMIT 1`,
    [id]
  );
  const counts = await queryOne(
    `SELECT
       (SELECT count(*)::int FROM trails     WHERE mountain_id = $1) AS trails,
       (SELECT count(*)::int FROM locations  WHERE mountain_id = $1) AS locations,
       (SELECT count(*)::int FROM assets     WHERE mountain_id = $1) AS inventory,
       (SELECT count(*)::int FROM contacts   WHERE mountain_id = $1) AS contacts,
       (SELECT count(*)::int FROM notes      WHERE mountain_id = $1) AS notes,
       (SELECT count(*)::int FROM documents  WHERE mountain_id = $1) AS documents,
       (SELECT count(*)::int FROM activity_log WHERE mountain_id = $1) AS updates`,
    [id]
  );
  const contacts = await query(
    `SELECT c.*,
            COALESCE(array_agg(cr.role) FILTER (WHERE cr.role IS NOT NULL), '{}') AS roles
       FROM contacts c LEFT JOIN contact_roles cr ON cr.contact_id = c.id
      WHERE c.mountain_id = $1 GROUP BY c.id ORDER BY c.is_primary DESC, c.name`,
    [id]
  );
  const notes = await query(
    `SELECT * FROM notes WHERE mountain_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  const updates = await query(
    `SELECT * FROM activity_log WHERE mountain_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [id]
  );
  return c.json({ mountain, project, counts, contacts, notes, updates });
});

const MOUNTAIN_COLS = [
  "name", "address", "region", "legal_entity", "billing_address",
  "phone", "email", "website", "acreage", "vertical_drop",
  "trail_count_stated", "ip_subnet", "timing_systems", "status", "notes",
] as const;

function pick(body: any) {
  const out: Record<string, any> = {};
  for (const col of MOUNTAIN_COLS) if (col in body) out[col] = body[col];
  return out;
}

// Create — a mountain plus its initial project.
mountains.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  if (!body?.name) return c.json({ error: "name is required" }, 400);

  const fields = { ...pick(body), name: body.name, created_by: user.id };
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const mountain = await queryOne(
    `INSERT INTO mountains (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    vals
  );
  await queryOne(
    `INSERT INTO projects (mountain_id, kind, stage, created_by)
       VALUES ($1, 'Initial Install', 'Intro / Lead', $2) RETURNING id`,
    [(mountain as any).id, user.id]
  );
  return c.json({ mountain }, 201);
});

// Update — partial, only the columns provided.
mountains.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const fields = pick(body);
  if (Object.keys(fields).length === 0) return c.json({ error: "no updatable fields" }, 400);
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const set = cols.map((col, i) => `${col} = $${i + 1}`).join(", ");
  const mountain = await queryOne(
    `UPDATE mountains SET ${set} WHERE id = $${cols.length + 1} RETURNING *`,
    [...vals, id]
  );
  return mountain ? c.json({ mountain }) : c.json({ error: "Not found" }, 404);
});

// Delete — cascades to the mountain's children via FK ON DELETE CASCADE.
mountains.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await query(`DELETE FROM mountains WHERE id = $1`, [id]);
  return c.json({ ok: true });
});
