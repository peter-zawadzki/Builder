// Physical point-to-point connections drawn on a mountain's map (Wireless
// Link, Wired PoE Link, 120V power run) — a dedicated, real-Postgres-table
// entity (see db/migrations/0031_mountain_connections.sql), deliberately NOT
// a Location: nothing here ever touches the `locations`/`legacy_records`
// tables, so a connection structurally can never leak into a Location list.
// Modeled on siteAssessments.ts's measurement sub-routes (dynamic
// column-picker pattern), not locations.ts (which the live client doesn't
// actually use — see mountainConnectionsApi.ts's header comment).
import { Hono } from "hono";
import { query, queryOne } from "../db";
import type { HonoEnv } from "../auth";

export const mountainConnections = new Hono<HonoEnv>();

const CONNECTION_TYPES = ["wireless", "poe", "120v"];

const CONNECTION_COLS = [
  "trail_id", "name", "connection_type",
  "start_latitude", "start_longitude", "end_latitude", "end_longitude",
  "difficulty", "is_locked",
] as const;

function pickConnection(body: any) {
  const out: Record<string, any> = {};
  for (const col of CONNECTION_COLS) if (col in body) out[col] = body[col];
  return out;
}

mountainConnections.get("/", async (c) => {
  const mountainId = c.req.query("mountainId");
  if (!mountainId) return c.json({ error: "mountainId is required" }, 400);
  const connections = await query(
    `SELECT * FROM mountain_connections WHERE mountain_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [mountainId]
  );
  return c.json({ connections });
});

mountainConnections.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  if (!body?.mountain_id || !body?.name || !body?.connection_type) {
    return c.json({ error: "mountain_id, name, and connection_type are required" }, 400);
  }
  if (!CONNECTION_TYPES.includes(body.connection_type)) {
    return c.json({ error: `connection_type must be one of: ${CONNECTION_TYPES.join(", ")}` }, 400);
  }
  const fields = { ...pickConnection(body), mountain_id: body.mountain_id, created_by: user.id };
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const connection = await queryOne(
    `INSERT INTO mountain_connections (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    vals
  );
  return c.json({ connection }, 201);
});

// Serves both properties edits (name/connection_type/difficulty) AND
// endpoint-drag updates (start_*/end_* lat/lng) — same shape, the client
// just sends whichever fields actually changed.
mountainConnections.put("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  if (body.connection_type && !CONNECTION_TYPES.includes(body.connection_type)) {
    return c.json({ error: `connection_type must be one of: ${CONNECTION_TYPES.join(", ")}` }, 400);
  }
  const fields = { ...pickConnection(body), updated_by: user.id };
  const cols = Object.keys(fields);
  if (cols.length === 0) return c.json({ error: "no updatable fields" }, 400);
  const vals = Object.values(fields);
  const set = cols.map((col, i) => `${col} = $${i + 1}`).join(", ");
  const connection = await queryOne(
    `UPDATE mountain_connections SET ${set} WHERE id = $${cols.length + 1} AND deleted_at IS NULL RETURNING *`,
    [...vals, id]
  );
  return connection ? c.json({ connection }) : c.json({ error: "Not found" }, 404);
});

mountainConnections.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const connection = await queryOne(
    `UPDATE mountain_connections SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [id]
  );
  return connection ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404);
});
