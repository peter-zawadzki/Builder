// One-off cleanup for the thread-splitting bug fixed in processMessage.ts:
// before that fix, each message in a reply thread got its own note/action
// items instead of one consolidated note per thread. This finds every
// (contact, Gmail thread) group with more than one already-written note,
// regenerates ONE consolidated note+action-item list from the combined
// original message bodies, removes the old duplicate entries, and updates
// the ledger + embeddings accordingly. Run with --dry-run first.
//
// Usage: npx tsx server/gmail/mergeDuplicates.ts [--dry-run]
import "../env";
import { query, queryOne } from "../db";
import { getGmailClientForUser } from "./client";
import { parseMessageHeaders, extractPlainTextBody, normalizeDateForSql } from "./messageParser";
import { generateEmailSummary } from "./summarize";
import { upsertNoteEmbedding } from "../notes/embedNote";
import { logContactActivity, AUTOMATED_AUTHOR_NAME, type NewActivityEntry, type LegacyContact } from "./legacyCrm";

const DRY_RUN = process.argv.includes("--dry-run");

interface Row {
  ledger_id: string;
  gmail_message_id: string;
  contact_id: string;
  note_id: string;
  claimed_by_email: string;
}

interface FetchedMessage {
  ledgerId: string;
  subject: string;
  from: string;
  to: string[];
  date: string | null;
  dateIso: string | null;
  body: string;
}

async function main() {
  const rows = await query<Row>(`
    SELECT p.id as ledger_id, p.gmail_message_id, p.contact_id, p.note_id, u.email as claimed_by_email
    FROM processed_email_messages p
    JOIN users u ON u.id = p.claimed_by_user_id
    WHERE p.status = 'processed'
    ORDER BY p.contact_id, p.created_at
  `);

  const clientCache = new Map<string, ReturnType<typeof getGmailClientForUser>>();
  function clientFor(email: string) {
    if (!clientCache.has(email)) clientCache.set(email, getGmailClientForUser(email));
    return clientCache.get(email)!;
  }

  // Group by (contact_id, threadId).
  const groups = new Map<string, { row: Row; threadId: string; fetched: FetchedMessage }[]>();
  for (const r of rows) {
    const gmail = clientFor(r.claimed_by_email);
    const msg = await gmail.users.messages.get({ userId: "me", id: r.gmail_message_id, format: "full" });
    const headers = parseMessageHeaders(msg.data);
    const fetched: FetchedMessage = {
      ledgerId: r.ledger_id,
      subject: headers.subject,
      from: headers.from,
      to: headers.to,
      date: headers.date,
      dateIso: normalizeDateForSql(headers.date),
      body: extractPlainTextBody(msg.data.payload),
    };
    const threadId = msg.data.threadId ?? r.gmail_message_id;
    const key = `${r.contact_id}::${threadId}`;
    const arr = groups.get(key) ?? [];
    arr.push({ row: r, threadId, fetched });
    groups.set(key, arr);
  }

  let mergedGroups = 0, mergedNotes = 0;

  for (const [key, entries] of groups) {
    if (entries.length <= 1) continue; // nothing to merge
    const [contactId] = key.split("::");
    entries.sort((a, b) => (a.fetched.dateIso ?? "").localeCompare(b.fetched.dateIso ?? ""));
    const oldNoteIds = [...new Set(entries.map((e) => e.row.note_id))];
    const ledgerIds = entries.map((e) => e.row.ledger_id);

    console.log(`\n[merge] contact=${contactId} thread messages=${entries.length} old notes=${oldNoteIds.join(",")}`);

    const combinedBody = entries
      .map((e, i) => `--- Message ${i + 1} of ${entries.length} (${e.fetched.date ?? "unknown date"}) ---\nFrom: ${e.fetched.from}\nTo: ${e.fetched.to.join(", ")}\nSubject: ${e.fetched.subject}\n\n${e.fetched.body}`)
      .join("\n\n");

    const contactRow = await queryOne<{ id: string; data: any }>(`SELECT id, data FROM legacy_records WHERE collection='contacts' AND id=$1`, [contactId]);
    if (!contactRow) { console.error(`[merge] contact ${contactId} not found, skipping`); continue; }
    const contact: LegacyContact = {
      id: contactRow.id,
      name: contactRow.data.name ?? contactRow.data.email,
      email: (contactRow.data.email ?? "").toLowerCase(),
      mountainId: contactRow.data.mountainId ?? null,
      organizationId: contactRow.data.organizationId ?? null,
    };

    const latest = entries[entries.length - 1];
    const summaryResult = await generateEmailSummary({
      subject: latest.fetched.subject,
      from: latest.fetched.from,
      to: latest.fetched.to,
      date: latest.fetched.date,
      body: combinedBody,
      contactName: contact.name,
    });
    if (!summaryResult) { console.error(`[merge] summarize failed for ${contactId}, skipping`); continue; }

    // Old notes all share createdAt with their sibling action items (same
    // write call stamped one `now` for the whole group) — that's how we
    // find exactly which JSON entries to remove.
    const activities: any[] = contactRow.data.activities ?? [];
    const oldNoteEntries = activities.filter((a) => oldNoteIds.includes(a.id));
    const oldTimestamps = new Set(oldNoteEntries.map((a) => a.createdAt));
    const toRemove = new Set(activities.filter((a) => oldTimestamps.has(a.createdAt)).map((a) => a.id));
    const keptActivities = activities.filter((a) => !toRemove.has(a.id));

    // Author/assignee: keep whoever the most recent old note was attributed
    // to, matching finalizeGroups' "most recent message wins" rule.
    const latestOldNote = oldNoteEntries.reduce((a, b) => ((a?.createdAt ?? "") > b.createdAt ? a : b), oldNoteEntries[0]);

    const now = new Date().toISOString();
    const newNote: NewActivityEntry = {
      id: crypto.randomUUID(),
      text: summaryResult.summary,
      type: "note",
      createdAt: now,
      authorContactId: latestOldNote?.authorContactId,
      authorName: AUTOMATED_AUTHOR_NAME,
      assigneeContactId: latestOldNote?.assigneeContactId,
      assigneeName: latestOldNote?.assigneeName,
    };
    const newActions: NewActivityEntry[] = summaryResult.actionItems.map((item) => ({
      id: crypto.randomUUID(),
      text: item,
      type: "action",
      createdAt: now,
      authorContactId: latestOldNote?.authorContactId,
      authorName: AUTOMATED_AUTHOR_NAME,
      assigneeContactId: latestOldNote?.assigneeContactId,
      assigneeName: latestOldNote?.assigneeName,
    }));

    console.log(`[merge] removing ${toRemove.size} old entries, adding 1 note + ${newActions.length} action items`);
    console.log(`[merge] new summary: ${summaryResult.summary}`);
    for (const item of summaryResult.actionItems) console.log(`[merge]   action: ${item}`);

    if (DRY_RUN) continue;

    await query(
      `UPDATE legacy_records SET data = jsonb_set(data, '{activities}', $2::jsonb, true), updated_at = now() WHERE collection='contacts' AND id=$1`,
      [contactId, JSON.stringify([...keptActivities, newNote, ...newActions])]
    );

    // Drop the old (now-orphaned) embeddings, add the merged one.
    await query(`DELETE FROM note_embeddings WHERE note_source='activity' AND note_id = ANY($1)`, [oldNoteIds]);
    await upsertNoteEmbedding({
      noteSource: "activity",
      noteId: newNote.id,
      originCollection: "contacts",
      originId: contactId,
      mountainId: contact.mountainId ?? undefined,
      content: summaryResult.summary,
    });

    await logContactActivity(contact, newNote);
    for (const entry of newActions) await logContactActivity(contact, entry);

    await query(
      `UPDATE processed_email_messages SET note_id=$2, action_item_count=$3 WHERE id = ANY($1)`,
      [ledgerIds, newNote.id, newActions.length]
    );

    mergedGroups++;
    mergedNotes += oldNoteIds.length;
  }

  console.log(`\n[merge] done. ${DRY_RUN ? "(dry run) " : ""}merged ${mergedGroups} thread group(s), collapsing ${mergedNotes} old notes into ${mergedGroups}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
