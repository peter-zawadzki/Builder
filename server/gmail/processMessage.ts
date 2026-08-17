// Per-message evaluation + per-thread finalization — shared by the nightly
// incremental sync (processMailbox.ts) and the one-time backfill
// (backfill.ts) so both apply the exact same rules.
//
// This is two phases, not one, because of a real bug found in production:
// when a reply thread has multiple new messages in the same sync window
// (e.g. a back-and-forth with a contact spanning a few replies), summarizing
// each message independently produced multiple near-duplicate notes and
// overlapping/fragmented action items for what a human would see as ONE
// exchange. Phase 1 (evaluateMessage) fetches/parses/filters/matches/claims
// each raw message individually — the claim step is what dedup still
// depends on. Phase 2 (finalizeGroups) groups the claimed messages by
// (contact, Gmail threadId) and generates exactly ONE note + one
// consolidated action-item list per group, even when the group spans
// several messages.
import { query, queryOne } from "../db";
import { upsertNoteEmbedding } from "../notes/embedNote";
import { parseMessageHeaders, isBulkOrAutomated, extractPlainTextBody, normalizeDateForSql, type ParsedHeaders } from "./messageParser";
import { findContactMatch, findPrimaryEmployee } from "./matcher";
import { generateEmailSummary } from "./summarize";
import { appendContactActivities, logContactActivity, AUTOMATED_AUTHOR_NAME, type LegacyContact, type NewActivityEntry } from "./legacyCrm";
import type { EmployeeMailbox } from "./employees";
import type { gmail_v1 } from "googleapis";

export type MessageOutcome = "processed" | "skipped" | "error";

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

// Dry-run preview only — no writes, no grouping needed since nothing gets
// created either way. Kept as its own simple path.
export async function previewMessage(
  gmail: gmail_v1.Gmail,
  user: EmployeeMailbox,
  employeeEmails: Set<string>,
  legacyContactsByEmail: Map<string, LegacyContact>,
  gmailMessageId: string
): Promise<MessageOutcome> {
  const message = await gmail.users.messages.get({ userId: "me", id: gmailMessageId, format: "full" });
  const headers = parseMessageHeaders(message.data);
  if (!headers.messageIdHeader) return "skipped";
  if (isBulkOrAutomated(headers, message.data.payload)) return "skipped";
  const match = findContactMatch(headers, legacyContactsByEmail, employeeEmails);
  console.log(`[gmail-sync] (dry-run) ${user.email}: "${headers.subject}" -> ${match ? `match: ${match.contact.name}` : "no CRM match"}`);
  return match ? "processed" : "skipped";
}

export interface EvaluatedMessage {
  ledgerId: string;
  threadId: string;
  contact: LegacyContact;
  employeeContact: LegacyContact | null;
  primaryEmployeeId: string | null;
  headers: ParsedHeaders;
  body: string;
  dateIso: string | null;
}

// Phase 1: fetch, parse, bulk-filter, contact-match, and claim ONE raw
// Gmail message. Returns null for anything that doesn't need (or already
// has) a ledger entry pointing at real content — the caller just counts it
// as skipped/errored. A non-null result is claimed and waiting for phase 2.
export async function evaluateMessage(
  gmail: gmail_v1.Gmail,
  user: EmployeeMailbox,
  employeeEmails: Set<string>,
  legacyContactsByEmail: Map<string, LegacyContact>,
  gmailMessageId: string
): Promise<EvaluatedMessage | null> {
  const message = await gmail.users.messages.get({ userId: "me", id: gmailMessageId, format: "full" });
  const headers = parseMessageHeaders(message.data);
  if (!headers.messageIdHeader) return null; // shouldn't happen for real mail, nothing to dedup-key on

  const dateIso = normalizeDateForSql(headers.date);

  if (isBulkOrAutomated(headers, message.data.payload)) {
    await claimMessage(headers.messageIdHeader, user, gmailMessageId, "skipped_bulk", dateIso);
    return null;
  }

  const match = findContactMatch(headers, legacyContactsByEmail, employeeEmails);
  if (!match) {
    await claimMessage(headers.messageIdHeader, user, gmailMessageId, "skipped_no_contact_match", dateIso);
    return null;
  }

  // Placeholder status 'error' — if the process crashes before phase 2
  // finalizes this message's group, the ledger row already accurately
  // reflects that it wasn't completed (and, per the dedup rule, won't be
  // retried, since the Message-ID is already claimed).
  const ledgerId = await claimMessage(headers.messageIdHeader, user, gmailMessageId, "error", dateIso);
  if (!ledgerId) return null; // already claimed by another mailbox/run

  const primaryEmployee = findPrimaryEmployee(headers, employeeEmails);
  const primaryEmployeeId = primaryEmployee
    ? (await queryOne<{ id: string }>(`SELECT id FROM users WHERE lower(email) = $1`, [primaryEmployee.email]))?.id ?? null
    : null;
  const employeeContact = primaryEmployee ? legacyContactsByEmail.get(primaryEmployee.email) ?? null : null;

  return {
    ledgerId,
    threadId: message.data.threadId ?? gmailMessageId,
    contact: match.contact,
    employeeContact,
    primaryEmployeeId,
    headers,
    body: extractPlainTextBody(message.data.payload),
    dateIso,
  };
}

// Phase 2: group claimed messages by (contact, thread) and write ONE note +
// one consolidated action-item list per group, even when the group spans
// several messages — this is what prevents a multi-message back-and-forth
// from producing several near-duplicate notes.
export async function finalizeGroups(evaluated: EvaluatedMessage[]): Promise<{ processed: number; skipped: number }> {
  let processed = 0;
  let skipped = 0;

  const groups = new Map<string, EvaluatedMessage[]>();
  for (const e of evaluated) {
    const key = `${e.contact.id}::${e.threadId}`;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => (a.dateIso ?? "").localeCompare(b.dateIso ?? ""));
    const contact = group[0].contact;
    // Whoever is primary on the most recent message in the thread — the
    // current owner of the conversation, not whoever happened to reply first.
    const latest = group[group.length - 1];
    const employeeContact = latest.employeeContact;
    const primaryEmployeeId = latest.primaryEmployeeId;

    const combinedBody = group
      .map((e, i) => `--- Message ${i + 1} of ${group.length} (${e.headers.date ?? "unknown date"}) ---\nFrom: ${e.headers.from}\nTo: ${e.headers.to.join(", ")}\nSubject: ${e.headers.subject}\n\n${e.body}`)
      .join("\n\n");

    let summaryResult;
    try {
      summaryResult = await generateEmailSummary({
        subject: latest.headers.subject,
        from: latest.headers.from,
        to: latest.headers.to,
        date: latest.headers.date,
        body: combinedBody,
        contactName: contact.name,
      });
    } catch (e) {
      console.error(`[gmail-sync] summarize failed for contact ${contact.id} thread ${latest.threadId}:`, e);
      summaryResult = null;
    }

    if (!summaryResult) {
      for (const e of group) await markLedger(e.ledgerId, "skipped_no_body", { contactId: contact.id });
      skipped += group.length;
      continue;
    }

    const now = new Date().toISOString();
    const noteEntry: NewActivityEntry = {
      id: crypto.randomUUID(),
      text: summaryResult.summary,
      type: "note",
      createdAt: now,
      authorContactId: employeeContact?.id,
      authorName: AUTOMATED_AUTHOR_NAME,
      assigneeContactId: employeeContact?.id,
      assigneeName: employeeContact?.name,
    };
    const actionEntries: NewActivityEntry[] = summaryResult.actionItems.map((item) => ({
      id: crypto.randomUUID(),
      text: item,
      type: "action",
      createdAt: now,
      authorContactId: employeeContact?.id,
      authorName: AUTOMATED_AUTHOR_NAME,
      assigneeContactId: employeeContact?.id,
      assigneeName: employeeContact?.name,
    }));

    await appendContactActivities(contact.id, [noteEntry, ...actionEntries]);

    await upsertNoteEmbedding({
      noteSource: "activity",
      noteId: noteEntry.id,
      originCollection: "contacts",
      originId: contact.id,
      mountainId: contact.mountainId ?? undefined,
      content: summaryResult.summary,
    });

    await logContactActivity(contact, noteEntry);
    for (const entry of actionEntries) await logContactActivity(contact, entry);

    for (const e of group) {
      await markLedger(e.ledgerId, "processed", {
        contactId: contact.id,
        noteId: noteEntry.id,
        primaryEmployeeId: primaryEmployeeId ?? undefined,
        actionItemCount: actionEntries.length,
      });
    }
    processed += group.length;
  }

  return { processed, skipped };
}
