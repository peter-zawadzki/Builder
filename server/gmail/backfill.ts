// One-time catch-up for the gap between "code deployed" and "first nightly
// baseline" (2026-08-14 through go-live) — the nightly sync deliberately
// never backfills on its own (see historySync.ts), so this is a manual,
// explicitly-run alternative: list messages in a date range via Gmail search
// instead of the History API, then run them through the exact same
// processOneMessage logic the nightly job uses (same matching/dedup/write
// rules — see processMessage.ts). Independent of gmail_sync_state's cursor;
// doesn't touch it, so it can't interfere with the nightly incremental sync.
//
// Usage: npx tsx server/gmail/backfill.ts --since=2026/08/14 [--dry-run] [--only=email]
import "../env";
import { getGmailClientForUser } from "./client";
import { listEmployeeMailboxes } from "./employees";
import { loadLegacyContacts, contactsByEmail } from "./legacyCrm";
import { previewMessage, evaluateMessage, finalizeGroups, type EvaluatedMessage } from "./processMessage";
import type { EmployeeMailbox } from "./employees";

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_EMAIL = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
const SINCE = process.argv.find((a) => a.startsWith("--since="))?.split("=")[1];

if (!SINCE) {
  console.error("Usage: npx tsx server/gmail/backfill.ts --since=YYYY/MM/DD [--dry-run] [--only=email]");
  process.exit(1);
}

async function listMessageIdsSince(gmail: ReturnType<typeof getGmailClientForUser>, since: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({ userId: "me", q: `after:${since}`, pageToken, maxResults: 500 });
    for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}

async function backfillMailbox(user: EmployeeMailbox, employeeEmails: Set<string>, legacyContactsByEmail: ReturnType<typeof contactsByEmail>) {
  const gmail = getGmailClientForUser(user.email);
  const messageIds = await listMessageIdsSince(gmail, SINCE!);
  let processed = 0, skipped = 0, errors = 0;

  if (DRY_RUN) {
    for (const id of messageIds) {
      try {
        const outcome = await previewMessage(gmail, user, employeeEmails, legacyContactsByEmail, id);
        if (outcome === "processed") processed++; else if (outcome === "error") errors++; else skipped++;
      } catch (e) {
        console.error(`[gmail-backfill] ${user.email} message ${id} failed:`, e);
        errors++;
      }
    }
  } else {
    const evaluated: EvaluatedMessage[] = [];
    for (const id of messageIds) {
      try {
        const e = await evaluateMessage(gmail, user, employeeEmails, legacyContactsByEmail, id);
        if (e) evaluated.push(e);
        else skipped++;
      } catch (e) {
        console.error(`[gmail-backfill] ${user.email} message ${id} failed:`, e);
        errors++;
      }
    }
    const result = await finalizeGroups(evaluated);
    processed += result.processed;
    skipped += result.skipped;
  }

  console.log(`[gmail-backfill] ${user.email}: found=${messageIds.length} processed=${processed} skipped=${skipped} errors=${errors}`);
}

async function main() {
  console.log(`[gmail-backfill] starting since=${SINCE} dryRun=${DRY_RUN}`);
  const employees = await listEmployeeMailboxes();
  const employeeEmails = new Set(employees.map((e) => e.email.toLowerCase()));
  const legacyContacts = contactsByEmail(await loadLegacyContacts());
  const targets = ONLY_EMAIL ? employees.filter((e) => e.email.toLowerCase() === ONLY_EMAIL.toLowerCase()) : employees;

  for (const user of targets) {
    try {
      await backfillMailbox(user, employeeEmails, legacyContacts);
    } catch (e) {
      console.error(`[gmail-backfill] ${user.email} FAILED:`, e);
    }
  }
  console.log(`[gmail-backfill] done.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[gmail-backfill] fatal error:", e);
    process.exit(1);
  });
