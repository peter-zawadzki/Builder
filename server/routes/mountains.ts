import { Hono } from "hono";
import { query, queryOne } from "../db";
import type { HonoEnv } from "../auth";

export const mountains = new Hono<HonoEnv>();

// List — the fields a list view needs.
mountains.get("/", async (c) => {
  const rows = await query(
    `SELECT id, name, address, region, phone, email, website, status, created_at
       FROM mountains ORDER BY name`
  );
  return c.json({ mountains: rows });
});

// One mountain, full row.
mountains.get("/:id", async (c) => {
  const m = await queryOne(`SELECT * FROM mountains WHERE id = $1`, [c.req.param("id")]);
  return m ? c.json({ mountain: m }) : c.json({ error: "Not found" }, 404);
});

// Create — created_by is the authenticated app user.
mountains.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  if (!body?.name) return c.json({ error: "name is required" }, 400);
  const m = await queryOne(
    `INSERT INTO mountains (name, address, region, phone, email, website, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Prospect')::mountain_status, $8)
     RETURNING *`,
    [
      body.name,
      body.address ?? null,
      body.region ?? null,
      body.phone ?? null,
      body.email ?? null,
      body.website ?? null,
      body.status ?? null,
      user.id,
    ]
  );
  return c.json({ mountain: m }, 201);
});
