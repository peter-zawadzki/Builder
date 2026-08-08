// One-off backfill for content that predates the embeddings pipeline. Run
// with `npx tsx server/notes/backfillEmbeddings.ts`. Safe to re-run — the
// upsert skips anything whose content hash hasn't changed since last run.
// Scoped to type='note' entries (not 'action') — notes are the substantive,
// searchable content this feature is about; action items are transient
// task-tracking, not knowledge worth indexing for RAG/search.
import "../env";
import { query } from "../db";
import { upsertNoteEmbedding } from "./embedNote";

const ACTIVITY_COLLECTIONS = ["mountains", "projects", "contacts", "teams", "organizations", "inspections"];

async function backfillMountainNotes(): Promise<number> {
  const rows = await query<{ id: string; data: any }>(`SELECT id, data FROM legacy_records WHERE collection='notes'`);
  let n = 0;
  for (const row of rows) {
    if (!row.data.text?.trim()) continue;
    await upsertNoteEmbedding({
      noteSource: "mountain_note",
      noteId: row.id,
      mountainId: row.data.mountainId ?? null,
      content: row.data.text,
    });
    n++;
  }
  return n;
}

async function backfillActivities(): Promise<number> {
  let n = 0;
  for (const collection of ACTIVITY_COLLECTIONS) {
    const rows = await query<{ id: string; data: any }>(`SELECT id, data FROM legacy_records WHERE collection=$1`, [collection]);
    for (const row of rows) {
      const mountainId = collection === "mountains" ? row.id : collection === "projects" || collection === "contacts" ? row.data.mountainId ?? null : null;
      for (const activity of row.data.activities ?? []) {
        if (activity.type !== "note" || activity.archived || !activity.text?.trim()) continue;
        await upsertNoteEmbedding({
          noteSource: "activity",
          noteId: activity.id,
          originCollection: collection,
          originId: row.id,
          mountainId,
          content: activity.text,
        });
        n++;
      }
    }
  }
  return n;
}

async function backfillReplies(): Promise<number> {
  const rows = await query<{ id: string; text: string; note_source: string; note_id: string; origin_collection: string | null; origin_id: string | null }>(
    `SELECT id, text, note_source, note_id, origin_collection, origin_id FROM note_replies`
  );
  let n = 0;
  for (const row of rows) {
    if (!row.text?.trim()) continue;
    await upsertNoteEmbedding({
      noteSource: "reply",
      noteId: row.id,
      originCollection: row.origin_collection,
      originId: row.origin_id,
      content: row.text,
    });
    n++;
  }
  return n;
}

async function main() {
  const notesCount = await backfillMountainNotes();
  console.log(`[backfill] mountain notes embedded: ${notesCount}`);
  const activitiesCount = await backfillActivities();
  console.log(`[backfill] activity notes embedded: ${activitiesCount}`);
  const repliesCount = await backfillReplies();
  console.log(`[backfill] replies embedded: ${repliesCount}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("[backfill] fatal error:", e);
  process.exit(1);
});
