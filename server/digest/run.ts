// Entry point for the daily digest — invoked by the builder-digest systemd
// timer (Mon-Fri mornings; see docs/DEPLOYMENT.md). Run directly with
// `npx tsx server/digest/run.ts --dry-run` to preview without sending.
import "../env";
import { query, queryOne } from "../db";
import { sendTemplateEmail } from "../email";
import { loadDigestData, getUserDigestItems } from "./gatherItems";
import { generateCompanySummary } from "./companySummary";
import { renderDigestEmail } from "./render";
import { ensureDigestTemplate, DIGEST_TEMPLATE_ALIAS } from "./postmarkTemplate";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const DRY_RUN = process.argv.includes("--dry-run");

interface StaffUser {
  id: string;
  email: string | null;
  name: string | null;
  daily_digest_enabled: boolean;
}

async function computeSinceIso(): Promise<string> {
  const last = await queryOne<{ max: string | null }>(`SELECT max(sent_at) AS max FROM digest_runs WHERE status = 'sent'`);
  if (last?.max) return new Date(last.max).toISOString();
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - 1);
  return fallback.toISOString();
}

async function recordRun(runDate: string, userId: string, status: string, itemCounts: object | null, error?: string) {
  if (DRY_RUN) return;
  await query(
    `INSERT INTO digest_runs (run_date, user_id, status, item_counts, error) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (run_date, user_id) DO NOTHING`,
    [runDate, userId, status, itemCounts ? JSON.stringify(itemCounts) : null, error ?? null]
  );
}

async function main() {
  const runDate = new Date().toISOString().slice(0, 10);
  const sinceIso = await computeSinceIso();
  console.log(`[digest] run_date=${runDate} since=${sinceIso} dryRun=${DRY_RUN}`);

  if (!DRY_RUN) {
    const templateResult = await ensureDigestTemplate();
    if (!templateResult.ok) console.warn(`[digest] could not ensure Postmark template: ${templateResult.error}`);
  }

  const [users, data, companySummary] = await Promise.all([
    query<StaffUser>(`SELECT id, email, name, daily_digest_enabled FROM users`),
    loadDigestData(sinceIso),
    generateCompanySummary(sinceIso),
  ]);
  console.log(`[digest] company summary: ${companySummary ? "generated" : "skipped (nothing notable)"}`);

  const alreadyRun = new Set(
    (await query<{ user_id: string }>(`SELECT user_id FROM digest_runs WHERE run_date = $1`, [runDate])).map((r) => r.user_id)
  );

  let sent = 0, skipped = 0, failed = 0;

  for (const user of users) {
    if (alreadyRun.has(user.id)) { skipped++; continue; }

    if (!user.daily_digest_enabled) {
      await recordRun(runDate, user.id, "skipped_opted_out", null);
      skipped++;
      continue;
    }
    if (!user.email) {
      await recordRun(runDate, user.id, "skipped_no_email", null);
      skipped++;
      continue;
    }

    const items = getUserDigestItems(data, user.email);
    const counts = {
      actions: items.outstandingActions.length,
      newItems: items.newItems.length,
      stale: items.staleItems.length,
    };

    // Always send, at minimum, the generic company update since the last
    // digest — even with zero personal items and no notable company
    // activity, everyone still gets a real email (render.ts falls back to
    // a "no major updates" line rather than an empty section).
    const { subject, html } = renderDigestEmail({
      name: user.name || user.email,
      companySummary,
      items,
      appBaseUrl: APP_BASE_URL,
    });

    if (DRY_RUN) {
      console.log(`\n--- ${user.email} (${JSON.stringify(counts)}) ---`);
      console.log(html);
      sent++;
      continue;
    }

    const result = await sendTemplateEmail({
      to: user.email,
      templateAlias: DIGEST_TEMPLATE_ALIAS,
      model: { subject, content: html },
    });
    if (result.ok) {
      await recordRun(runDate, user.id, "sent", counts);
      sent++;
    } else {
      await recordRun(runDate, user.id, "failed", counts, result.error);
      failed++;
    }
  }

  console.log(`[digest] done — sent=${sent} skipped=${skipped} failed=${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[digest] fatal error:", e);
    process.exit(1);
  });
