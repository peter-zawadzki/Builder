// One-off retroactive fix: entries written by the Gmail sync before the
// "author should say Odin, not the employee's real name" change (see
// AUTOMATED_AUTHOR_NAME in legacyCrm.ts) still show the employee as author.
// This finds every note/action-item entry created by the sync (via
// processed_email_messages.note_id, plus its sibling action items — they
// share the exact same createdAt timestamp as the note they were written
// alongside) and relabels just `authorName` to "Odin", leaving
// authorContactId/assigneeContactId/assigneeName untouched so permissions
// and "assigned to" stay correct.
//
// Usage: npx tsx server/gmail/relabelAuthorToOdin.ts [--dry-run]
import "../env";
import { query } from "../db";
import { AUTOMATED_AUTHOR_NAME } from "./legacyCrm";

const DRY_RUN = process.argv.includes("--dry-run");

interface LedgerRow {
  contact_id: string;
  note_id: string;
}

async function main() {
  const rows = await query<LedgerRow>(
    `SELECT DISTINCT contact_id, note_id FROM processed_email_messages WHERE status = 'processed' AND contact_id IS NOT NULL AND note_id IS NOT NULL`
  );

  const noteIdsByContact = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = noteIdsByContact.get(r.contact_id) ?? new Set();
    set.add(r.note_id);
    noteIdsByContact.set(r.contact_id, set);
  }

  let contactsUpdated = 0;
  let entriesRelabeled = 0;

  for (const [contactId, noteIds] of noteIdsByContact) {
    const contactRows = await query<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='contacts' AND id=$1`, [contactId]);
    if (contactRows.length === 0) continue;
    const activities: any[] = contactRows[0].data.activities ?? [];

    const noteTimestamps = new Set(activities.filter((a) => noteIds.has(a.id)).map((a) => a.createdAt));
    let changed = 0;
    const updated = activities.map((a) => {
      if (noteTimestamps.has(a.createdAt) && a.authorName !== AUTOMATED_AUTHOR_NAME) {
        changed++;
        return { ...a, authorName: AUTOMATED_AUTHOR_NAME };
      }
      return a;
    });

    if (changed === 0) continue;
    console.log(`[relabel] contact=${contactId} relabeling ${changed} entries`);
    if (!DRY_RUN) {
      await query(
        `UPDATE legacy_records SET data = jsonb_set(data, '{activities}', $2::jsonb, true), updated_at = now() WHERE collection='contacts' AND id=$1`,
        [contactId, JSON.stringify(updated)]
      );
    }
    contactsUpdated++;
    entriesRelabeled += changed;
  }

  console.log(`\n[relabel] done. ${DRY_RUN ? "(dry run) " : ""}${contactsUpdated} contact(s), ${entriesRelabeled} entries relabeled to "${AUTOMATED_AUTHOR_NAME}".`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
