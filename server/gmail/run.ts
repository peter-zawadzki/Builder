// Entry point for the nightly Gmail-to-CRM sync — invoked by the
// builder-gmail-sync systemd timer (1am daily; see docs/DEPLOYMENT.md).
// Run directly with `npx tsx server/gmail/run.ts --dry-run` to preview
// without writing anything, or `--only=someone@yullr.com` to target one
// mailbox while testing.
import "../env";
import { listEmployeeMailboxes } from "./employees";
import { processMailbox } from "./processMailbox";
import { loadLegacyContacts, contactsByEmail } from "./legacyCrm";

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_EMAIL = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];

async function main() {
  console.log(`[gmail-sync] starting dryRun=${DRY_RUN}`);

  const employees = await listEmployeeMailboxes();
  const employeeEmails = new Set(employees.map((e) => e.email.toLowerCase()));
  const legacyContacts = contactsByEmail(await loadLegacyContacts());
  const targets = ONLY_EMAIL ? employees.filter((e) => e.email.toLowerCase() === ONLY_EMAIL.toLowerCase()) : employees;

  let processed = 0, skipped = 0, failed = 0;

  for (const user of targets) {
    try {
      const result = await processMailbox(user, employeeEmails, legacyContacts, { dryRun: DRY_RUN });
      console.log(`[gmail-sync] ${user.email}: processed=${result.processed} skipped=${result.skipped} errors=${result.errors}`);
      processed += result.processed;
      skipped += result.skipped;
      failed += result.errors;
    } catch (e) {
      // One mailbox's auth/config failure (e.g. delegation not yet granted
      // for a new hire) shouldn't block the rest of the run.
      console.error(`[gmail-sync] ${user.email} FAILED:`, e);
      failed++;
    }
  }

  console.log(`[gmail-sync] done. processed=${processed} skipped=${skipped} failed=${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[gmail-sync] fatal error:", e);
    process.exit(1);
  });
