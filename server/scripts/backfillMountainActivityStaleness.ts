// One-off backfill: server/gmail/legacyCrm.ts's touchProjectsForMountain only
// bumps a project's updatedAt going forward, from the next email scan. This
// catches mountains that were already marked stale by the digest even though
// their contacts have recent email-derived notes/action items — bumping
// data.updatedAt (and the SQL updated_at column) to the latest such activity
// so isProjectStale (server/digest/staleDetection.ts) reflects it immediately,
// without waiting on tonight's scan. Safe to re-run: only ever moves
// updatedAt forward, never backward.
import { pool, query } from "../db";

interface ContactRow {
  id: string;
  data: { mountainId?: string; activities?: { type: string; createdAt: string }[] };
}

interface ProjectRow {
  id: string;
  data: { mountainId?: string; updatedAt?: string };
}

async function main() {
  const contacts = await query<ContactRow>(`SELECT id, data FROM legacy_records WHERE collection = 'contacts'`);
  const projects = await query<ProjectRow>(`SELECT id, data FROM legacy_records WHERE collection = 'projects'`);

  const latestActivityByMountain = new Map<string, string>();
  for (const { data } of contacts) {
    if (!data.mountainId) continue;
    for (const activity of data.activities ?? []) {
      if (activity.type !== "note" && activity.type !== "action") continue;
      const current = latestActivityByMountain.get(data.mountainId);
      if (!current || activity.createdAt > current) latestActivityByMountain.set(data.mountainId, activity.createdAt);
    }
  }

  let updated = 0;
  for (const project of projects) {
    const mountainId = project.data.mountainId;
    if (!mountainId) continue;
    const latest = latestActivityByMountain.get(mountainId);
    if (!latest) continue;
    if (project.data.updatedAt && project.data.updatedAt >= latest) continue;

    await query(
      `UPDATE legacy_records
       SET data = jsonb_set(data, '{updatedAt}', to_jsonb($2::text), true),
           updated_at = now()
       WHERE collection = 'projects' AND id = $1`,
      [project.id, latest]
    );
    updated++;
    console.log(`project ${project.id} (mountain ${mountainId}): updatedAt -> ${latest}`);
  }

  console.log(`Backfill complete. ${updated} project(s) updated out of ${projects.length}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
