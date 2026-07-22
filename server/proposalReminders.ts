// Automated proposal follow-up cadence (Dev Story 4.2/4.3). Runs on an
// interval from server/index.ts rather than a separate cron process, since
// the API is already a single long-lived Node process.
import { query } from "./db";
import { sendTemplateEmail } from "./email";
import { upsert, getProjectOwnerEmail, withAutoCc, pushMountainActivity, insertActivity } from "./routes/legacy";

// Postmark template "proposal-reminder" (numeric id, not an alias).
const REMINDER_TEMPLATE_ID = 45791871;

// Day-since-sent thresholds and the subject line each one carries. 14+ then
// repeats "Don't Miss Your Place..." every 2 weeks. MAX_DAYS is the 8-week
// hard stop from the acceptance criteria — whichever comes first among
// signed / archived / 8 weeks elapsed halts the cadence.
const MAX_DAYS = 56;
const CADENCE: { day: number; subject: string }[] = [
  { day: 3, subject: "Friendly Reminder: Your YULLR Proposal is Waiting" },
  { day: 7, subject: "Your YULLR Proposal is Ready When You Are" },
  { day: 14, subject: "Let's Get Your Installation on the Calendar" },
  { day: 28, subject: "Don't Miss Your Place in the Installation Queue" },
  { day: 42, subject: "Don't Miss Your Place in the Installation Queue" },
  { day: 56, subject: "Don't Miss Your Place in the Installation Queue" },
];

function isFullyExecuted(p: any): boolean {
  return !!(p.clientSignature && p.yullrSignature);
}

export async function runProposalReminderSweep(): Promise<{ checked: number; sent: number }> {
  const rows = await query<{ id: string; data: any }>(
    `SELECT id, data FROM legacy_records WHERE collection = 'proposals' AND data->>'sentAt' IS NOT NULL`
  );

  let sent = 0;
  for (const row of rows) {
    const p = row.data;
    if (p.archived) continue;
    if (isFullyExecuted(p)) continue;
    if (!p.sentAt || !p.sentTo) continue;

    const elapsedDays = Math.floor((Date.now() - new Date(p.sentAt).getTime()) / 86400000);
    if (elapsedDays > MAX_DAYS) continue;

    const alreadySent: number[] = Array.isArray(p.remindersSentDays) ? p.remindersSentDays : [];
    const due = CADENCE.find((c) => elapsedDays >= c.day && !alreadySent.includes(c.day));
    if (!due) continue;

    const signUrl = `${process.env.APP_BASE_URL || "http://localhost:5173"}/sign/${p.signToken}`;
    const owner = p.projectId ? await getProjectOwnerEmail(p.projectId) : null;

    const result = await sendTemplateEmail({
      to: p.sentTo,
      cc: withAutoCc(undefined, p.sentTo, owner?.email),
      templateId: REMINDER_TEMPLATE_ID,
      model: { email_subject: due.subject, product_url: signUrl },
    });
    if (!result.ok) continue;

    await upsert("proposals", row.id, { ...p, remindersSentDays: [...alreadySent, due.day] });
    sent++;

    if (p.mountainId) {
      await pushMountainActivity(p.mountainId, {
        id: crypto.randomUUID(),
        text: `Proposal follow-up email sent — Day ${due.day}`,
        type: "note",
        createdAt: new Date().toISOString(),
      });
      await insertActivity({
        mountainId: p.mountainId,
        type: "proposal_reminder_sent",
        summary: `Proposal follow-up email sent to ${p.sentTo} (Day ${due.day})`,
        path: `/mountains/${p.mountainId}/proposal/${row.id}`,
        actor: "System",
      });
    }
  }

  return { checked: rows.length, sent };
}

export function startProposalReminderScheduler(intervalMs = 60 * 60 * 1000) {
  const run = () => {
    runProposalReminderSweep()
      .then(({ checked, sent }) => {
        if (sent > 0) console.log(`[proposal-reminders] checked ${checked}, sent ${sent}`);
      })
      .catch((e) => console.error("[proposal-reminders] sweep failed:", e));
  };
  run();
  setInterval(run, intervalMs);
}
