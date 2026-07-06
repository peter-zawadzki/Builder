import { Hono } from "hono";
import { query, queryOne } from "../db";
import type { HonoEnv } from "../auth";

// Serves the ORIGINAL record shapes from legacy_records, matching the contract
// the existing app's data layer expects. This lets MountainsList and every other
// current screen run on the local DB unchanged and lossless.
export const legacy = new Hono<HonoEnv>();

// collection -> the key the old app expects in the GET response
const ARRAY_KEY: Record<string, string> = {
  mountains: "mountains",
  trails: "trails",
  locations: "locations",
  assets: "assets",
  notes: "notes",
  "site-inspections": "siteInspections",
};
const SINGLETON_KEY: Record<string, string> = {
  options: "options",
  "item-prices": "prices",
};

async function listArray(collection: string) {
  const rows = await query<{ data: any }>(
    `SELECT data FROM legacy_records WHERE collection = $1 ORDER BY updated_at`,
    [collection]
  );
  return rows.map((r) => r.data);
}

async function upsert(collection: string, id: string, data: any) {
  await query(
    `INSERT INTO legacy_records (collection, id, data, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [collection, id, JSON.stringify(data)]
  );
}

// ── GET list (arrays) ────────────────────────────────────────────────────────
for (const [collection, key] of Object.entries(ARRAY_KEY)) {
  legacy.get(`/${collection}`, async (c) => {
    const items = await listArray(collection);
    return c.json({ [key]: items });
  });
}

// ── GET singletons ───────────────────────────────────────────────────────────
for (const [collection, key] of Object.entries(SINGLETON_KEY)) {
  legacy.get(`/${collection}`, async (c) => {
    const row = await queryOne<{ data: any }>(
      `SELECT data FROM legacy_records WHERE collection = $1 AND id = '__all__'`,
      [collection]
    );
    return c.json({ [key]: row?.data ?? {} });
  });
}

// ── Writes for array collections (create / update / delete + cascade) ─────────
for (const collection of Object.keys(ARRAY_KEY)) {
  // create
  legacy.post(`/${collection}`, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const id = body?.id ?? crypto.randomUUID();
    await upsert(collection, id, { ...body, id });
    return c.json({ ok: true, id });
  });
  // update
  legacy.put(`/${collection}/:id`, async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const existing = await queryOne<{ data: any }>(
      `SELECT data FROM legacy_records WHERE collection = $1 AND id = $2`,
      [collection, id]
    );
    await upsert(collection, id, { ...(existing?.data ?? {}), ...body, id });
    return c.json({ ok: true });
  });
  // delete (+ cascade for mountains/locations)
  legacy.delete(`/${collection}/:id`, async (c) => {
    const id = c.req.param("id");
    await query(`DELETE FROM legacy_records WHERE collection = $1 AND id = $2`, [collection, id]);
    if (collection === "mountains") {
      await query(
        `DELETE FROM legacy_records
          WHERE collection IN ('trails','locations','assets','notes','site-inspections')
            AND data->>'mountainId' = $1`,
        [id]
      );
    } else if (collection === "locations") {
      await query(`DELETE FROM legacy_records WHERE collection = 'assets' AND data->>'locationId' = $1`, [id]);
    }
    return c.json({ ok: true });
  });
  // cascade-delete alias (old app calls /mountains/:id/cascade and /locations/:id/cascade)
  legacy.delete(`/${collection}/:id/cascade`, async (c) => {
    const id = c.req.param("id");
    await query(`DELETE FROM legacy_records WHERE collection = $1 AND id = $2`, [collection, id]);
    if (collection === "mountains") {
      await query(
        `DELETE FROM legacy_records
          WHERE collection IN ('trails','locations','assets','notes','site-inspections')
            AND data->>'mountainId' = $1`,
        [id]
      );
    } else if (collection === "locations") {
      await query(`DELETE FROM legacy_records WHERE collection = 'assets' AND data->>'locationId' = $1`, [id]);
    }
    return c.json({ ok: true });
  });
}

// ── options / item-prices writes (whole-dict replace) ─────────────────────────
legacy.post("/options", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  // old app posts { key, value } to append; keep a merged dict
  const row = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='options' AND id='__all__'`);
  const dict = row?.data ?? {};
  if (body?.key) {
    const arr: string[] = Array.isArray(dict[body.key]) ? dict[body.key] : [];
    if (body.value && !arr.includes(body.value)) arr.push(body.value);
    dict[body.key] = arr;
  }
  await upsert("options", "__all__", dict);
  return c.json({ ok: true });
});
legacy.post("/item-prices", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const row = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='item-prices' AND id='__all__'`);
  const dict = row?.data ?? {};
  if (body?.name != null) dict[body.name] = body.price;
  await upsert("item-prices", "__all__", dict);
  return c.json({ ok: true });
});

// ── Activity feed (Updates) — the actor is the authenticated user ─────────────
legacy.get("/activity", async (c) => {
  const mountainId = c.req.query("mountainId");
  const rows = mountainId
    ? await query<{ data: any }>(
        `SELECT data FROM legacy_records WHERE collection='activity' AND data->>'mountainId' = $1 ORDER BY updated_at DESC LIMIT 50`,
        [mountainId]
      )
    : await query<{ data: any }>(
        `SELECT data FROM legacy_records WHERE collection='activity' ORDER BY updated_at DESC LIMIT 50`
      );
  return c.json({ activity: rows.map((r) => r.data) });
});
legacy.post("/activity", async (c) => {
  const user = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  const rec = {
    id: crypto.randomUUID(),
    mountainId: b.mountainId ?? null,
    type: b.type ?? "update",
    summary: b.summary ?? "",
    actor: user.name || user.email || "Someone",
    actorId: user.id,
    timestamp: new Date().toISOString(),
  };
  await upsert("activity", rec.id, rec);
  return c.json({ ok: true, activity: rec });
});
