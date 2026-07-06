// ETL: pull the live Supabase KV data and load it into the local normalized DB.
// Re-runnable — it truncates the migrated tables and reloads (users are left
// alone). See db/MIGRATION_MAP.md for the field mapping.
//
// Run:  npx tsx db/etl.ts
import dotenv from "dotenv";
import { resolve } from "node:path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import pg from "pg";
import { projectId, publicAnonKey } from "../utils/supabase/info";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function get(ep: string, key: string): Promise<any[]> {
  const res = await fetch(`${BASE}/${ep}`, { headers: { Authorization: `Bearer ${publicAnonKey}` } });
  const data = await res.json();
  const val = data?.[key] ?? data;
  return Array.isArray(val) ? val : [];
}
async function getObj(ep: string, key: string): Promise<Record<string, any>> {
  const res = await fetch(`${BASE}/${ep}`, { headers: { Authorization: `Bearer ${publicAnonKey}` } });
  const data = await res.json();
  return data?.[key] ?? data ?? {};
}

const STAGE_MAP: Record<string, string> = {
  Prospect: "Intro / Lead", Demo: "Demo", "Site Visit": "Site Assessment",
  Proposal: "Proposal", Agreement: "Proposal", Install: "Install",
  Live: "Training", Churned: "Intro / Lead",
};
const CONTACT_ROLE = new Set(["Admin", "Technical", "Operations", "Billing", "Legal", "Decision Maker", "Champion", "Signatory"]);
const PHONE_TYPE = new Set(["Office", "Cell"]);
const CAT_FOR_ASSET: Record<string, string> = {
  Camera: "Cameras", "Network Gear": "Network Equipment",
  Server: "Server Hardware", Miscellaneous: "Miscellaneous Items",
};

async function main() {
  const c = await pool.connect();
  try {
    console.log("Fetching Supabase data…");
    const [mountains, trails, locations, assets, notes] = await Promise.all([
      get("mountains", "mountains"), get("trails", "trails"), get("locations", "locations"),
      get("assets", "assets"), get("notes", "notes"),
    ]);
    const options = await getObj("options", "options");
    const itemPrices = await getObj("item-prices", "prices");
    console.log(`  mountains=${mountains.length} trails=${trails.length} locations=${locations.length} assets=${assets.length} notes=${notes.length}`);

    await c.query("BEGIN");
    await c.query(
      `TRUNCATE mountains, organizations, equipment_catalog, app_options, item_prices RESTART IDENTITY CASCADE`
    );

    // ── mountains + projects + embedded contacts ──
    for (const m of mountains) {
      await c.query(
        `INSERT INTO mountains (id, name, address, region, legal_entity, billing_address, phone, email, website, acreage, vertical_drop, trail_count_stated, ip_subnet, timing_systems, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Active')`,
        [m.id, m.name ?? "Unnamed", m.address ?? null, m.region ?? null, m.legalEntity ?? null,
         m.billingAddress ?? null, m.phone ?? null, m.email ?? null, m.website ?? null,
         num(m.acreage), num(m.verticalDrop), int(m.trailCount), m.ipSubnet ?? null,
         Array.isArray(m.timingSystems) ? m.timingSystems : null, m.notes ?? null]
      );

      // one project per mountain, carrying pipeline state
      let stage = "Intro / Lead", status = "Active";
      if (m.pipelineStage === "Churned") status = "Cancelled";
      else if (m.pipelineStage) stage = STAGE_MAP[m.pipelineStage] ?? "Intro / Lead";
      await c.query(
        `INSERT INTO projects (mountain_id, kind, stage, status, is_stalled, stall_reason, stalled_at, next_action, next_action_date, estimated_value, close_probability)
         VALUES ($1,'Initial Install',$2::project_stage,$3::project_status,$4,$5,$6,$7,$8,$9,$10)`,
        [m.id, stage, status, !!m.isStalled, m.stallReason ?? null, ts(m.stalledAt),
         m.nextAction ?? null, date(m.nextActionDate), num(m.estimatedDealValue), num(m.closeProbability)]
      );

      // embedded contacts
      const contacts: Array<[any, string | null]> = [];
      if (m.adminContact?.name) contacts.push([m.adminContact, "Admin"]);
      if (m.technicalContact?.name) contacts.push([m.technicalContact, "Technical"]);
      for (const ac of m.additionalContacts ?? []) if (ac?.name) contacts.push([ac, mapRole(ac.role)]);
      for (const ta of m.technicalAdministrators ?? []) if (ta?.name) contacts.push([ta, "Technical"]);
      for (const [ct, role] of contacts) {
        const { rows } = await c.query(
          `INSERT INTO contacts (mountain_id, name, title, email, phone, phone_type, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [m.id, ct.name, ct.title ?? null, ct.email ?? null, ct.phone ?? null,
           PHONE_TYPE.has(ct.phoneType) ? ct.phoneType : null, ct.notes ?? null]
        );
        if (role && CONTACT_ROLE.has(role)) {
          await c.query(`INSERT INTO contact_roles (contact_id, role) VALUES ($1,$2::contact_role) ON CONFLICT DO NOTHING`, [rows[0].id, role]);
        }
      }
    }

    // ── trails ──
    const mtnIds = new Set(mountains.map((m) => m.id));
    for (const t of trails) {
      if (!mtnIds.has(t.mountainId)) continue;
      await c.query(`INSERT INTO trails (id, mountain_id, name, notes, is_nastar) VALUES ($1,$2,$3,$4,$5)`,
        [t.id, t.mountainId, t.name ?? "Unnamed", t.notes ?? null, !!t.isNastar]);
    }

    // trailName -> trail_id resolver
    const trailByKey = new Map<string, string>();
    for (const t of trails) if (t.name) trailByKey.set(`${t.mountainId}::${t.name.toLowerCase()}`, t.id);

    // ── locations + inspections ──
    const locMountain = new Map<string, string>();
    for (const l of locations) {
      if (!mtnIds.has(l.mountainId)) continue;
      locMountain.set(l.id, l.mountainId);
      const trailId = l.trailName ? trailByKey.get(`${l.mountainId}::${String(l.trailName).toLowerCase()}`) ?? null : null;
      await c.query(
        `INSERT INTO locations (id, mountain_id, trail_id, name, notes, latitude, longitude, sync_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'Synced')`,
        [l.id, l.mountainId, trailId, l.name ?? "Unnamed", l.notes ?? null,
         num(l.coordinates?.latitude), num(l.coordinates?.longitude)]
      );
      if (l.inspection && (l.inspection.items?.length || l.inspection.notes)) {
        await c.query(`INSERT INTO location_inspections (location_id, items, notes, sync_status) VALUES ($1,$2::jsonb,$3,'Synced')`,
          [l.id, JSON.stringify(l.inspection.items ?? []), l.inspection.notes ?? null]);
      }
    }

    // ── equipment_catalog (find-or-create) ──
    const catByKey = new Map<string, string>();
    async function catalog(category: string, kind: "manufacturer" | "model", name: string, parentId: string | null): Promise<string> {
      const key = `${category}::${kind}::${parentId ?? ""}::${name.toLowerCase()}`;
      if (catByKey.has(key)) return catByKey.get(key)!;
      const { rows } = await c.query(
        `INSERT INTO equipment_catalog (category, kind, parent_id, name) VALUES ($1::inventory_category,$2::equipment_kind,$3,$4) RETURNING id`,
        [category, kind, parentId, name]
      );
      catByKey.set(key, rows[0].id);
      return rows[0].id;
    }

    // ── assets ──
    let assetSkipped = 0;
    for (const a of assets) {
      const mountainId = a.locationId ? locMountain.get(a.locationId) : null;
      if (!mountainId) { assetSkipped++; continue; }
      const cat = CAT_FOR_ASSET[a.type] ?? "Miscellaneous Items";
      const mfrName = a.customManufacturer || a.manufacturer;
      const mdlName = a.customModel || a.model;
      let mfrId: string | null = null, mdlId: string | null = null;
      if (mfrName) mfrId = await catalog(cat, "manufacturer", mfrName, null);
      if (mdlName && mfrId) mdlId = await catalog(cat, "model", mdlName, mfrId);
      await c.query(
        `INSERT INTO assets (id, mountain_id, location_id, type, manufacturer_id, model_id, serial_number, ip_address, is_draft, notes)
         VALUES ($1,$2,$3,$4::asset_type,$5,$6,$7,$8,$9,$10)`,
        [a.id, mountainId, a.locationId ?? null, a.type ?? "Miscellaneous", mfrId, mdlId,
         a.serialNumber ?? null, a.ipAddress ?? null, !!a.isDraft, a.notes ?? null]
      );
    }

    // ── notes ──
    for (const n of notes) {
      if (!mtnIds.has(n.mountainId)) continue;
      await c.query(
        `INSERT INTO notes (id, mountain_id, text, topic, scheduled, completed, install_progress, follow_up_date, created_at, updated_at)
         VALUES ($1,$2,$3,$4::note_topic,$5,$6,$7,$8,COALESCE($9,now()),COALESCE($10,now()))`,
        [n.id, n.mountainId, n.text ?? "", validTopic(n.topic), !!n.scheduled, !!n.completed,
         int(n.installProgress), date(n.followUpDate), ts(n.createdAt), ts(n.updatedAt)]
      );
    }

    // ── options -> app_options (+ seed equipment_catalog from inventory keys) ──
    for (const [key, values] of Object.entries(options)) {
      for (const v of (values as string[]) ?? []) {
        await c.query(`INSERT INTO app_options (key, value) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [key, v]);
      }
      const invMfr = key.match(/^inventory:mfr:(.+)$/);
      const invMdl = key.match(/^inventory:mdl:(.+?):(.+)$/);
      if (invMfr && isCat(invMfr[1])) {
        for (const v of (values as string[]) ?? []) await catalog(invMfr[1], "manufacturer", v, null);
      } else if (invMdl && isCat(invMdl[1])) {
        for (const v of (values as string[]) ?? []) {
          const mfrId = await catalog(invMdl[1], "manufacturer", invMdl[2], null);
          await catalog(invMdl[1], "model", v, mfrId);
        }
      }
    }

    // ── item-prices ──
    for (const [name, price] of Object.entries(itemPrices)) {
      if (typeof price === "number") await c.query(`INSERT INTO item_prices (name, price) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET price=EXCLUDED.price`, [name, price]);
    }

    await c.query("COMMIT");
    console.log(`Done. assets skipped (no resolvable location): ${assetSkipped}`);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("ETL failed, rolled back:", e);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}

// helpers
function num(v: any) { return v === null || v === undefined || v === "" ? null : Number(v); }
function int(v: any) { const n = num(v); return n === null ? null : Math.round(n); }
function ts(v: any) { return v ? new Date(v).toISOString() : null; }
function date(v: any) { return v ? String(v).slice(0, 10) : null; }
function mapRole(r: any): string | null { return CONTACT_ROLE.has(r) ? r : null; }
function isCat(s: string) { return ["Server Hardware", "Network Equipment", "Cameras", "Office Equipment", "Miscellaneous Items"].includes(s); }
function validTopic(t: any): string | null {
  return ["Demo", "Site Visit", "Proposal", "Install", "Training", "Updates"].includes(t) ? t : null;
}

main();
