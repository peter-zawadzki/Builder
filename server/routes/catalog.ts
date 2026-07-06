import { Hono } from "hono";
import { query } from "../db";
import type { HonoEnv } from "../auth";

export const catalog = new Hono<HonoEnv>();

// Equipment catalog lookups for asset/inventory dropdowns.
//   ?category=Cameras&kind=manufacturer   -> manufacturers in a category
//   ?parentId=<mfr>&kind=model            -> models under a manufacturer
catalog.get("/", async (c) => {
  const category = c.req.query("category");
  const kind = c.req.query("kind") ?? "manufacturer";
  const parentId = c.req.query("parentId");
  if (parentId) {
    const rows = await query(
      `SELECT id, name FROM equipment_catalog WHERE parent_id = $1 AND kind = 'model' ORDER BY name`,
      [parentId]
    );
    return c.json({ items: rows });
  }
  if (!category) return c.json({ error: "category or parentId is required" }, 400);
  const rows = await query(
    `SELECT id, name FROM equipment_catalog WHERE category = $1::inventory_category AND kind = $2::equipment_kind AND parent_id IS NULL ORDER BY name`,
    [category, kind]
  );
  return c.json({ items: rows });
});
