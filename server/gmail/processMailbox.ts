// Orchestrates one employee mailbox for one nightly run. This is the unit of
// idempotent work: the per-mailbox historyId cursor only advances after the
// whole batch finishes, and every message is claimed via a unique-constraint
// insert into processed_email_messages before any real work happens (see
// processMessage.ts), so a crash/rerun only ever redoes cheap, already-
// ledgered skips plus at most one in-flight message. Messages that land in
// the same Gmail thread (e.g. a back-and-forth reply chain) are grouped and
// summarized together into ONE note, not one per message — see
// processMessage.ts's finalizeGroups for why.
import { query, queryOne } from "../db";
import { getGmailClientForUser } from "./client";
import { fetchNewMessageIds } from "./historySync";
import { previewMessage, evaluateMessage, finalizeGroups, type EvaluatedMessage } from "./processMessage";
import type { LegacyContact } from "./legacyCrm";
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

  if (opts.dryRun) {
    for (const gmailMessageId of messageIds) {
      try {
        const outcome = await previewMessage(gmail, user, employeeEmails, legacyContactsByEmail, gmailMessageId);
        result[outcome === "error" ? "errors" : outcome]++;
      } catch (e) {
        console.error(`[gmail-sync] ${user.email} message ${gmailMessageId} failed:`, e);
        result.errors++;
      }
    }
    return result;
  }

  const evaluated: EvaluatedMessage[] = [];
  for (const gmailMessageId of messageIds) {
    try {
      const e = await evaluateMessage(gmail, user, employeeEmails, legacyContactsByEmail, gmailMessageId);
      if (e) evaluated.push(e);
      else result.skipped++;
    } catch (e) {
      console.error(`[gmail-sync] ${user.email} message ${gmailMessageId} failed:`, e);
      result.errors++;
    }
  }

  const { processed, skipped } = await finalizeGroups(evaluated);
  result.processed += processed;
  result.skipped += skipped;

  await saveCursor(user, newHistoryId, "ok");
  return result;
}
