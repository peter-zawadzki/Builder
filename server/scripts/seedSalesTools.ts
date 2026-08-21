// One-off migration: moves the hand-maintained SALES_TOOLS manifest
// (src/app/data/salesToolsData.ts) into the resource_files table + S3, so
// these become normal deletable resource files like the rest of Sales
// Tools/Marketing Assets/Training Materials. Safe to re-run — skips any
// (category, name) pair that already has a row.
import "../env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, queryOne, pool } from "../db";
import { putObject, extFromMime } from "../s3";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.resolve(dirname, "../../public/resource-assets/sales-tools");

const FILES = [
  { name: "YULLR Coaches One Pager", file: "YULLR Coaches One Pager.pdf", mime: "application/pdf" },
  { name: "YULLR Install Overview", file: "YULLR Install Overview.png", mime: "image/png" },
  { name: "YULLR Subscription Pricing", file: "YULLR Subscription Pricing.pdf", mime: "application/pdf" },
];

async function main() {
  for (const f of FILES) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM resource_files WHERE category = 'sales' AND name = $1`,
      [f.name]
    );
    if (existing) {
      console.log(`skip (already seeded): ${f.name}`);
      continue;
    }
    const bytes = await readFile(path.join(BASE, f.file));
    const id = crypto.randomUUID();
    const key = `resource-files/sales/${id}.${extFromMime(f.mime)}`;
    await putObject(key, bytes, f.mime);
    await query(
      `INSERT INTO resource_files (id, category, name, original_filename, mime_type, s3_key, file_size, uploaded_by)
       VALUES ($1,'sales',$2,$3,$4,$5,$6,NULL)`,
      [id, f.name, f.file, f.mime, key, bytes.length]
    );
    console.log(`seeded: ${f.name} -> ${key} (${bytes.length} bytes)`);
  }
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
