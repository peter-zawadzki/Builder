// Lossless copy: pull every Supabase record verbatim into legacy_records so the
// existing app can run on the local DB with zero field loss. Re-runnable.
//
// Run:  npx tsx db/etl_legacy.ts
import dotenv from "dotenv";
import { resolve } from "node:path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import pg from "pg";
import { projectId, publicAnonKey } from "../utils/supabase/info";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// collections that come back as arrays of records, and the key they're wrapped in
const ARRAY_COLLECTIONS: Record<string, string> = {
  mountains: "mountains",
  trails: "trails",
  locations: "locations",
  assets: "assets",
  notes: "notes",
  "site-inspections": "siteInspections",
};
// singletons: dicts stored under one row
const SINGLETON_COLLECTIONS: Record<string, string> = {
  options: "options",
  "item-prices": "prices",
};

async function fetchJson(ep: string): Promise<any> {
  const res = await fetch(`${BASE}/${ep}`, { headers: { Authorization: `Bearer ${publicAnonKey}` } });
  return res.json();
}

async function main() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("TRUNCATE legacy_records");

    for (const [ep, key] of Object.entries(ARRAY_COLLECTIONS)) {
      const data = await fetchJson(ep);
      const arr: any[] = Array.isArray(data) ? data : data?.[key] ?? [];
      for (const rec of arr) {
        const id = rec?.id ?? crypto.randomUUID();
        await c.query(
          `INSERT INTO legacy_records (collection, id, data) VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data`,
          [ep, id, JSON.stringify(rec)]
        );
      }
      console.log(`  ${ep}: ${arr.length}`);
    }

    for (const [ep, key] of Object.entries(SINGLETON_COLLECTIONS)) {
      const data = await fetchJson(ep);
      const dict = data?.[key] ?? data ?? {};
      await c.query(
        `INSERT INTO legacy_records (collection, id, data) VALUES ($1, '__all__', $2::jsonb)
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data`,
        [ep, JSON.stringify(dict)]
      );
      console.log(`  ${ep}: singleton (${Object.keys(dict).length} keys)`);
    }

    await c.query("COMMIT");
    console.log("Lossless copy complete.");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("Failed, rolled back:", e);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}

main();
