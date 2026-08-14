import { Hono } from "hono";
import { query, queryOne } from "../db";
import type { HonoEnv } from "../auth";

// Site Assessment — a mountain-wide virtual GIS site-survey tool (Phase 1:
// the assessment record itself; map objects/annotations/measurements/notes/
// action items land in later phases as their own nested endpoints).
//
// mountain_id/project_id are plain uuid columns with NO foreign key
// constraint (see migration 0012_site_assessments.sql for why: the real
// mountains/projects tables are empty in this app — every real mountain and
// project lives in legacy_records, which the client already has loaded via
// DataContext). So this route deliberately does NOT try to join against
// mountains/projects for names — the client resolves those from its own
// already-loaded state (getMountainById/getProjectById).
export const siteAssessments = new Hono<HonoEnv>();

// created_by/updated_by are real FKs into the live `users` table (unlike
// mountain_id/project_id) — the client has no list of app users to resolve
// names from itself, so join them here for display.
siteAssessments.get("/", async (c) => {
  const rows = await query(`
    SELECT sa.*,
           cu.name AS created_by_name, uu.name AS updated_by_name,
           (SELECT count(*)::int FROM site_assessment_objects o
             WHERE o.site_assessment_id = sa.id AND o.deleted_at IS NULL) AS object_count,
           (SELECT count(*)::int FROM site_assessment_action_items ai
             WHERE ai.site_assessment_id = sa.id AND ai.status NOT IN ('Resolved', 'Not required')) AS open_action_item_count
      FROM site_assessments sa
      LEFT JOIN users cu ON cu.id = sa.created_by
      LEFT JOIN users uu ON uu.id = sa.updated_by
     ORDER BY sa.updated_at DESC`);
  return c.json({ siteAssessments: rows });
});

siteAssessments.get("/:id", async (c) => {
  const id = c.req.param("id");
  const siteAssessment = await queryOne(`SELECT * FROM site_assessments WHERE id = $1`, [id]);
  if (!siteAssessment) return c.json({ error: "Not found" }, 404);

  const participants = await query(
    `SELECT * FROM site_assessment_participants WHERE site_assessment_id = $1 ORDER BY created_at`,
    [id]
  );
  const objects = await query(
    `SELECT * FROM site_assessment_objects WHERE site_assessment_id = $1 AND deleted_at IS NULL ORDER BY display_order, created_at`,
    [id]
  );
  const annotations = await query(
    `SELECT * FROM site_assessment_annotations WHERE site_assessment_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [id]
  );
  const measurements = await query(
    `SELECT * FROM site_assessment_measurements WHERE site_assessment_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [id]
  );
  const notes = await query(
    `SELECT * FROM site_assessment_notes WHERE site_assessment_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  const actionItems = await query(
    `SELECT * FROM site_assessment_action_items WHERE site_assessment_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  const activity = await query(
    `SELECT * FROM site_assessment_activity WHERE site_assessment_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [id]
  );

  return c.json({ siteAssessment, participants, objects, annotations, measurements, notes, actionItems, activity });
});

const SITE_ASSESSMENT_COLS = [
  "mountain_id", "project_id", "name", "status", "inspection_type", "description",
  "general_notes", "inspection_date", "resort_representative_name",
  "resort_representative_title", "resort_representative_email",
  "map_center_lat", "map_center_lng", "map_zoom", "map_bearing", "map_pitch", "map_style",
] as const;

function pick(body: any) {
  const out: Record<string, any> = {};
  for (const col of SITE_ASSESSMENT_COLS) if (col in body) out[col] = body[col];
  return out;
}

// Idempotent find-or-create: a mountain can have at most one active (not
// archived) assessment (idx_site_assessments_one_active_per_mountain,
// migration 0032). A double-click/slow-network race from the client's
// check-then-create in useAddLocationToMap.ts used to be able to slip two
// POSTs through before the first one's response updated client state,
// creating real duplicate rows in production (confirmed: 7 of them) — this
// ON CONFLICT makes a second concurrent POST for the same mountain return
// the already-existing row instead of erroring or creating a duplicate,
// closing the race at the one layer that can actually be atomic.
siteAssessments.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  if (!body?.name) return c.json({ error: "name is required" }, 400);
  if (!body?.mountain_id) return c.json({ error: "mountain_id is required" }, 400);

  const fields = { ...pick(body), name: body.name, mountain_id: body.mountain_id, created_by: user.id };
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const row = await queryOne<any>(
    `INSERT INTO site_assessments (${cols.join(", ")}) VALUES (${placeholders.join(", ")})
     ON CONFLICT (mountain_id) WHERE archived_at IS NULL DO UPDATE SET updated_at = now()
     RETURNING *, (xmax = 0) AS inserted`,
    vals
  );
  const { inserted, ...siteAssessment } = row;
  if (inserted) {
    await query(
      `INSERT INTO site_assessment_activity (site_assessment_id, type, summary, actor_user_id)
         VALUES ($1, 'created', $2, $3)`,
      [siteAssessment.id, `Site Assessment "${body.name}" created`, user.id]
    );
  }
  return c.json({ siteAssessment }, inserted ? 201 : 200);
});

siteAssessments.put("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const fields = { ...pick(body), updated_by: user.id };
  if (Object.keys(fields).length === 1) return c.json({ error: "no updatable fields" }, 400); // just updated_by
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const set = cols.map((col, i) => `${col} = $${i + 1}`).join(", ");
  const siteAssessment = await queryOne(
    `UPDATE site_assessments SET ${set} WHERE id = $${cols.length + 1} RETURNING *`,
    [...vals, id]
  );
  return siteAssessment ? c.json({ siteAssessment }) : c.json({ error: "Not found" }, 404);
});

// Archive — soft delete (matches this app's convention elsewhere, e.g.
// proposals: archiving keeps the historical record, never hard-deleted).
siteAssessments.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const siteAssessment = await queryOne(
    `UPDATE site_assessments SET archived_at = now(), updated_by = $2 WHERE id = $1 RETURNING *`,
    [id, user.id]
  );
  if (!siteAssessment) return c.json({ error: "Not found" }, 404);
  await query(
    `INSERT INTO site_assessment_activity (site_assessment_id, type, summary, actor_user_id)
       VALUES ($1, 'archived', 'Site Assessment archived', $2)`,
    [id, user.id]
  );
  return c.json({ ok: true });
});

// ── Map objects (Phase 3+) ────────────────────────────────────────────────
// Every write is scoped by site_assessment_id in its WHERE clause — an
// object can only ever be read/updated/deleted through the assessment it
// actually belongs to (the spec's explicit "validate ownership" requirement).

const OBJECT_COLS = [
  "trail_id", "object_type", "object_subtype", "name", "description",
  "geometry_json", "latitude", "longitude", "elevation", "status",
  "verification_status", "properties_json", "notes", "is_hidden", "is_locked",
  "display_order",
] as const;

function pickObject(body: any) {
  const out: Record<string, any> = {};
  for (const col of OBJECT_COLS) if (col in body) out[col] = body[col];
  return out;
}

siteAssessments.post("/:id/objects", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  if (!body?.object_type) return c.json({ error: "object_type is required" }, 400);
  if (!body?.name) return c.json({ error: "name is required" }, 400);
  if (!body?.geometry_json) return c.json({ error: "geometry_json is required" }, 400);

  const assessment = await queryOne(`SELECT id FROM site_assessments WHERE id = $1`, [id]);
  if (!assessment) return c.json({ error: "Site Assessment not found" }, 404);

  const fields = { ...pickObject(body), site_assessment_id: id, created_by: user.id };
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const object = await queryOne(
    `INSERT INTO site_assessment_objects (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    vals
  );
  await query(
    `INSERT INTO site_assessment_activity (site_assessment_id, type, summary, actor_user_id)
       VALUES ($1, 'object_created', $2, $3)`,
    [id, `${body.object_type} "${body.name}" placed`, user.id]
  );
  return c.json({ object }, 201);
});

siteAssessments.put("/:id/objects/:objectId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const objectId = c.req.param("objectId");
  const body = await c.req.json().catch(() => ({}));
  const fields = { ...pickObject(body), updated_by: user.id };
  if (Object.keys(fields).length === 1) return c.json({ error: "no updatable fields" }, 400);
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const set = cols.map((col, i) => `${col} = $${i + 1}`).join(", ");
  const object = await queryOne(
    `UPDATE site_assessment_objects SET ${set}
      WHERE id = $${cols.length + 1} AND site_assessment_id = $${cols.length + 2} AND deleted_at IS NULL
      RETURNING *`,
    [...vals, objectId, id]
  );
  return object ? c.json({ object }) : c.json({ error: "Not found" }, 404);
});

// Soft delete — kept for revision history / undo, per spec.
siteAssessments.delete("/:id/objects/:objectId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const objectId = c.req.param("objectId");
  const object = await queryOne(
    `UPDATE site_assessment_objects SET deleted_at = now(), updated_by = $3
      WHERE id = $1 AND site_assessment_id = $2 AND deleted_at IS NULL RETURNING *`,
    [objectId, id, user.id]
  );
  if (!object) return c.json({ error: "Not found" }, 404);
  await query(
    `INSERT INTO site_assessment_activity (site_assessment_id, type, summary, actor_user_id)
       VALUES ($1, 'object_deleted', $2, $3)`,
    [id, `${(object as any).object_type} "${(object as any).name}" removed`, user.id]
  );
  return c.json({ ok: true });
});

// ── Measurements (Phase 7) ─────────────────────────────────────────────────
// terrain_distance/elevation_gain/elevation_loss/start_elevation/end_elevation
// are populated client-side via Mapbox's queryTerrainElevation against the
// already-loaded terrain-DEM source — no server-side elevation lookup needed.

const MEASUREMENT_COLS = [
  "measurement_type", "geometry_json", "horizontal_distance", "terrain_distance",
  "elevation_gain", "elevation_loss", "start_elevation", "end_elevation",
  "bearing", "area", "units", "properties_json",
] as const;

function pickMeasurement(body: any) {
  const out: Record<string, any> = {};
  for (const col of MEASUREMENT_COLS) if (col in body) out[col] = body[col];
  return out;
}

siteAssessments.post("/:id/measurements", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  if (!body?.measurement_type) return c.json({ error: "measurement_type is required" }, 400);
  if (!body?.geometry_json) return c.json({ error: "geometry_json is required" }, 400);

  const assessment = await queryOne(`SELECT id FROM site_assessments WHERE id = $1`, [id]);
  if (!assessment) return c.json({ error: "Site Assessment not found" }, 404);

  const fields = { ...pickMeasurement(body), site_assessment_id: id, created_by: user.id };
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const measurement = await queryOne(
    `INSERT INTO site_assessment_measurements (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    vals
  );
  return c.json({ measurement }, 201);
});

siteAssessments.put("/:id/measurements/:measurementId", async (c) => {
  const id = c.req.param("id");
  const measurementId = c.req.param("measurementId");
  const body = await c.req.json().catch(() => ({}));
  const fields = pickMeasurement(body);
  if (Object.keys(fields).length === 0) return c.json({ error: "no updatable fields" }, 400);
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const set = cols.map((col, i) => `${col} = $${i + 1}`).join(", ");
  const measurement = await queryOne(
    `UPDATE site_assessment_measurements SET ${set}
      WHERE id = $${cols.length + 1} AND site_assessment_id = $${cols.length + 2} AND deleted_at IS NULL
      RETURNING *`,
    [...vals, measurementId, id]
  );
  return measurement ? c.json({ measurement }) : c.json({ error: "Not found" }, 404);
});

siteAssessments.delete("/:id/measurements/:measurementId", async (c) => {
  const id = c.req.param("id");
  const measurementId = c.req.param("measurementId");
  const measurement = await queryOne(
    `UPDATE site_assessment_measurements SET deleted_at = now()
      WHERE id = $1 AND site_assessment_id = $2 AND deleted_at IS NULL RETURNING *`,
    [measurementId, id]
  );
  if (!measurement) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
