// Orchestrates one employee mailbox for one nightly run. This is the unit of
// idempotent work: the per-mailbox historyId cursor only advances after the
// whole batch finishes, and every message is claimed via a unique-constraint
// insert into processed_email_messages before any real work happens, so a
// crash/rerun only ever redoes cheap, already-ledgered skips plus at most one
// in-flight message.
//
// Writes land in `legacy_records` (collection='contacts'), NOT the
// normalized `contacts`/`notes` SQL tables — those exist in this codebase
// but the live frontend never reads them. Real contacts and their notes/
// action items live as an `activities` array embedded in each contact's own
// JSON blob (see server/gmail/legacyCrm.ts and DataContext.tsx's
// ContactActivity). processed_email_messages.contact_id/note_id therefore
// reference ids in that JSON space, not FK-checkable SQL rows (0035
// migration drops those FKs for this reason).
import { query, queryOne } from "../db";
import { upsertNoteEmbedding } from "../notes/embedNote";
import { getGmailClientForUser } from "./client";
import { fetchNewMessageIds } from "./historySync";
import { parseMessageHeaders, isBulkOrAutomated, extractPlainTextBody } from "./messageParser";
import { findContactMatch, findPrimaryEmployee } from "./matcher";
import { generateEmailSummary } from "./summarize";
import { appendContactActivities, logContactActivity, type LegacyContact, type NewActivityEntry } from "./legacyCrm";
import type { EmployeeMailbox } from "./employees";

export interface MailboxRunResult {
  processed: number;
  skipped: number;
  errors: number;
}

interface SyncStateRow {
  last_history_id: string | null;
}

async function loadCursor(userId: string): Promise<string | null> {
  const row = await queryOne<SyncStateRow>(`SELECT last_history_id FROM gmail_sync_state WHERE user_id = $1`, [userId]);
  return row?.last_history_id ?? null;
}

async function saveCursor(user: EmployeeMailbox, newHistoryId: string, status: string, error?: string) {
  await query(
    `INSERT INTO gmail_sync_state (user_id, email, last_history_id, last_synced_at, last_run_status, last_error)
     VALUES ($1, $2, $3, now(), $4, $5)
     ON CONFLICT (user_id) DO UPDATE
       SET last_history_id = EXCLUDED.last_history_id, last_synced_at = now(),
           last_run_status = EXCLUDED.last_run_status, last_error = EXCLUDED.last_error, updated_at = now()`,
    [user.id, user.email, newHistoryId, status, error ?? null]
  );
}

// Claims a Message-ID for this run. Zero rows back means another mailbox
// (this run or a prior one) already owns it — the caller should skip.
async function claimMessage(messageIdHeader: string, user: EmployeeMailbox, gmailMessageId: string, status: string, messageDate: string | null): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO processed_email_messages (message_id_header, claimed_by_user_id, gmail_message_id, status, message_date)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (message_id_header) DO NOTHING
     RETURNING id`,
    [messageIdHeader, user.id, gmailMessageId, status, messageDate]
  );
  return row?.id ?? null;
}

async function markLedger(ledgerId: string, status: string, fields: Partial<{ contactId: string; noteId: string; primaryEmployeeId: string; actionItemCount: number; error: string }> = {}) {
  await query(
    `UPDATE processed_email_messages
     SET status = $2, contact_id = $3, note_id = $4, primary_employee_id = $5, action_item_count = $6, error = $7
     WHERE id = $1`,
    [ledgerId, status, fields.contactId ?? null, fields.noteId ?? null, fields.primaryEmployeeId ?? null, fields.actionItemCount ?? 0, fields.error ?? null]
  );
}

export async function processMailbox(
  user: EmployeeMailbox,
  employeeEmails: Set<string>,
  legacyContactsByEmail: Map<string, LegacyContact>,
  opts: { dryRun: boolean }
): Promise<MailboxRunResult> {
  const result: MailboxRunResult = { processed: 0, skipped: 0, errors: 0 };

  const lastHistoryId = await loadCursor(user.id);
  const gmail = getGmailClientForUser(user.email);
  const { messageIds, newHistoryId } = await fetchNewMessageIds(gmail, lastHistoryId);

  for (const gmailMessageId of messageIds) {
    try {
      const message = await gmail.users.messages.get({ userId: "me", id: gmailMessageId, format: "full" });
      const headers = parseMessageHeaders(message.data);

      if (!headers.messageIdHeader) {
        result.skipped++;
        continue; // shouldn't happen for real mail, nothing to dedup-key on
      }

      if (isBulkOrAutomated(headers, message.data.payload)) {
        if (!opts.dryRun) {
          await claimMessage(headers.messageIdHeader, user, gmailMessageId, "skipped_bulk", headers.date);
        }
        result.skipped++;
        continue;
      }

      if (opts.dryRun) {
        const match = findContactMatch(headers, legacyContactsByEmail);
        console.log(`[gmail-sync] (dry-run) ${user.email}: "${headers.subject}" -> ${match ? `match: ${match.contact.name}` : "no CRM match"}`);
        if (match) result.processed++; else result.skipped++;
        continue;
      }

      // Placeholder status 'error' — if anything below throws before the
      // final markLedger call, the ledger row already accurately reflects
      // that this message wasn't completed (and, per the dedup rule, won't
      // be retried, since the Message-ID is already claimed).
      const ledgerId = await claimMessage(headers.messageIdHeader, user, gmailMessageId, "error", headers.date);
      if (!ledgerId) {
        result.skipped++; // already claimed by another mailbox this run or a prior run
        continue;
      }

      const match = findContactMatch(headers, legacyContactsByEmail);
      if (!match) {
        await markLedger(ledgerId, "skipped_no_contact_match");
        result.skipped++;
        continue;
      }

      const primaryEmployee = findPrimaryEmployee(headers, employeeEmails);
      const primaryEmployeeId = primaryEmployee
        ? (await queryOne<{ id: string }>(`SELECT id FROM users WHERE lower(email) = $1`, [primaryEmployee.email]))?.id ?? null
        : null;
      // The employee's own CRM contact record — used as author/assignee on
      // the activity entry, same as a human adding a note via the UI.
      const employeeContact = primaryEmployee ? legacyContactsByEmail.get(primaryEmployee.email) ?? null : null;

      const body = extractPlainTextBody(message.data.payload);
      const summaryResult = await generateEmailSummary({
        subject: headers.subject,
        from: headers.from,
        to: headers.to,
        date: headers.date,
        body,
        contactName: match.contact.name,
      });

      if (!summaryResult) {
        await markLedger(ledgerId, "skipped_no_body", { contactId: match.contact.id });
        result.skipped++;
        continue;
      }

      const now = new Date().toISOString();
      const noteEntry: NewActivityEntry = {
        id: crypto.randomUUID(),
        text: summaryResult.summary,
        type: "note",
        createdAt: now,
        authorContactId: employeeContact?.id,
        authorName: employeeContact?.name,
        assigneeContactId: employeeContact?.id,
        assigneeName: employeeContact?.name,
      };
      const actionEntries: NewActivityEntry[] = summaryResult.actionItems.map((item) => ({
        id: crypto.randomUUID(),
        text: item,
        type: "action",
        createdAt: now,
        authorContactId: employeeContact?.id,
        authorName: employeeContact?.name,
        assigneeContactId: employeeContact?.id,
        assigneeName: employeeContact?.name,
      }));

      await appendContactActivities(match.contact.id, [noteEntry, ...actionEntries]);

      // Only the note gets embedded/searchable — matches how a manually
      // added note behaves today (server/routes/notes.ts's /notes/embed is
      // only ever called for type==='note' entries, see CRM.tsx addActivity).
      await upsertNoteEmbedding({
        noteSource: "activity",
        noteId: noteEntry.id,
        originCollection: "contacts",
        originId: match.contact.id,
        mountainId: match.contact.mountainId ?? undefined,
        content: summaryResult.summary,
      });

      // Updates-feed entry (+ Slack mirror) for the note and each action
      // item, same as the UI's logActivity — this is what actually rolls
      // the new activity up to the contact's mountain for visibility.
      await logContactActivity(match.contact, noteEntry);
      for (const entry of actionEntries) {
        await logContactActivity(match.contact, entry);
      }

      await markLedger(ledgerId, "processed", {
        contactId: match.contact.id,
        noteId: noteEntry.id,
        primaryEmployeeId: primaryEmployeeId ?? undefined,
        actionItemCount: actionEntries.length,
      });
      result.processed++;
    } catch (e) {
      console.error(`[gmail-sync] ${user.email} message ${gmailMessageId} failed:`, e);
      result.errors++;
    }
  }

  if (!opts.dryRun) {
    await saveCursor(user, newHistoryId, "ok");
  }

  return result;
}
