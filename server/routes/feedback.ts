// Finalize/approve/revise routes for the FEEDBACK section — the intake
// conversation itself lives in feedbackAgent.ts; this is everything that
// happens once a conversation is ready to become a real submission.
import { Hono } from "hono";
import type { HonoEnv } from "../auth";
import { query, queryOne } from "../db";
import { sendEmail } from "../email";
import { analyzeBug, checkStaleness, type AffectedFile } from "../feedback/analysis";
import { generateMockup, reviseMockup as reviseMockupHtml } from "../feedback/mockup";
import { findSimilarSubmission } from "../feedback/duplicates";
import { REQUIRED_FIELDS, type CollectedSummary, type HistoryTurn } from "./feedbackAgent";

export const feedback = new Hono<HonoEnv>();

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const PETER_EMAIL = "peter@yullr.com";
const MOCKUP_REVISION_CAP = 5;

interface SubmissionRow {
  id: string;
  type: "bug" | "feature" | "general";
  platform: "Builder" | "YULLR.com" | "Portal";
  status: string;
  submitted_by: string | null;
  submitter_name: string | null;
  submitter_email: string | null;
  summary: string;
  details: Record<string, string>;
  bug_analysis: string | null;
  affected_files: AffectedFile[] | null;
  bug_revision_count: number;
  mockup_html: string | null;
  mockup_revision_count: number;
  approved_at: string | null;
  emailed_at: string | null;
  created_at: string;
}

function transcriptHtml(details: Record<string, string>): string {
  return `<ul>${Object.entries(details)
    .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`)
    .join("")}</ul>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

async function insertFeedbackNotification(userId: string, kind: "review_requested" | "revised", submissionId: string, text: string): Promise<void> {
  await query(`INSERT INTO feedback_notifications (user_id, kind, submission_id, text) VALUES ($1, $2, $3, $4)`, [
    userId,
    kind,
    submissionId,
    text,
  ]);
}

async function getPeterUserId(): Promise<string | null> {
  const row = await queryOne<{ id: string }>(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [PETER_EMAIL]);
  return row?.id ?? null;
}

function validateSummary(summary: CollectedSummary | undefined): string | null {
  if (!summary) return "collectedSummary is required";
  if (!["bug", "feature", "general"].includes(summary.type)) return "Invalid type";
  if (!["Builder", "YULLR.com", "Portal"].includes(summary.platform)) return "Invalid platform";
  const required = REQUIRED_FIELDS[summary.type];
  const missing = required.filter((f) => !summary.fields?.[f]?.trim());
  if (missing.length > 0) return `Missing required fields: ${missing.join(", ")}`;
  return null;
}

feedback.post("/finalize", async (c) => {
  const body = await c.req.json<{ collectedSummary: CollectedSummary; history: HistoryTurn[]; force?: boolean }>();
  const summary = body.collectedSummary;
  const validationError = validateSummary(summary);
  if (validationError) return c.json({ error: validationError }, 400);

  const user = c.get("user");
  const detailsText = Object.values(summary.fields).join(" ");

  if (summary.type === "bug" && !body.force) {
    const similar = await findSimilarSubmission(summary.platform, summary.summary, detailsText);
    if (similar) return c.json({ duplicateWarning: similar });
  }

  // Builder bugs and Builder features both go through a review step before
  // anything gets emailed (Peter reviewing the analysis, or the submitter
  // reviewing the mockup) — everything else emails immediately below.
  const needsReview = summary.platform === "Builder" && (summary.type === "bug" || summary.type === "feature");
  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO feedback_submissions (type, platform, submitted_by, submitter_name, submitter_email, summary, details, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [summary.type, summary.platform, user.id, user.name, user.email, summary.summary, JSON.stringify(summary.fields), needsReview ? "in_review" : "submitted"]
  );
  const id = inserted!.id;

  if (summary.type === "bug" && summary.platform === "Builder") {
    const { analysis, affectedFiles } = await analyzeBug(summary);
    await query(`UPDATE feedback_submissions SET bug_analysis=$2, affected_files=$3, updated_at=now() WHERE id=$1`, [
      id,
      analysis,
      JSON.stringify(affectedFiles),
    ]);
    const peterId = await getPeterUserId();
    if (peterId) {
      await insertFeedbackNotification(peterId, "review_requested", id, `New Builder bug report ready for review: "${summary.summary}"`);
    }
    return c.json({ id, status: "in_review" });
  }

  if (summary.type === "feature" && summary.platform === "Builder") {
    const html = await generateMockup(summary);
    await query(`UPDATE feedback_submissions SET mockup_html=$2, updated_at=now() WHERE id=$1`, [id, html]);
    return c.json({ id, status: "in_review", mockupHtml: html });
  }

  // Bug/non-Builder, feature/non-Builder, and general (any platform): email immediately.
  await sendSubmissionEmail({ id, type: summary.type, platform: summary.platform, summary: summary.summary, details: summary.fields, submitterName: user.name, submitterEmail: user.email });
  await query(`UPDATE feedback_submissions SET emailed_at=now(), updated_at=now() WHERE id=$1`, [id]);
  return c.json({ id, status: "submitted" });
});

async function sendSubmissionEmail(opts: {
  id: string;
  type: string;
  platform: string;
  summary: string;
  details: Record<string, string>;
  submitterName: string | null;
  submitterEmail: string | null;
  mockupHtml?: string | null;
}): Promise<void> {
  const link = `${APP_BASE_URL}/feedback/${opts.id}`;
  const html = `
    <h2>${escapeHtml(opts.type.toUpperCase())} — ${escapeHtml(opts.platform)}</h2>
    <p><strong>Summary:</strong> ${escapeHtml(opts.summary)}</p>
    <p><strong>Submitted by:</strong> ${escapeHtml(opts.submitterName ?? "Unknown")} (${escapeHtml(opts.submitterEmail ?? "unknown")})</p>
    ${transcriptHtml(opts.details)}
    <p><a href="${link}">View this submission in Builder</a></p>
    ${opts.mockupHtml ? `<h3>Approved mockup</h3>${opts.mockupHtml}` : ""}
  `;
  await sendEmail({
    to: "support@yullr.com",
    subject: `[${opts.type}] ${opts.platform}: ${opts.summary}`,
    html,
  });
}

// Static paths before "/:id" — a dynamic segment would otherwise swallow
// "/notifications" (learned the hard way in odinVideo.ts).
feedback.get("/notifications", async (c) => {
  const user = c.get("user");
  const rows = await query<{ id: string; kind: string; submission_id: string; text: string; created_at: string }>(
    `SELECT id, kind, submission_id, text, created_at FROM feedback_notifications
     WHERE user_id=$1 AND read_at IS NULL ORDER BY created_at DESC LIMIT 20`,
    [user.id]
  );
  return c.json({
    notifications: rows.map((r) => ({ id: r.id, kind: r.kind, submissionId: r.submission_id, text: r.text, createdAt: r.created_at })),
  });
});

feedback.post("/notifications/:id/read", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await query(`UPDATE feedback_notifications SET read_at=now() WHERE id=$1 AND user_id=$2`, [id, user.id]);
  return c.json({ ok: true });
});

feedback.post("/:id/approve-bug", async (c) => {
  const user = c.get("user");
  if (user.email?.toLowerCase() !== PETER_EMAIL) return c.json({ error: "Not authorized" }, 403);
  const id = c.req.param("id");
  await query(`UPDATE feedback_submissions SET status='approved', approved_at=now(), updated_at=now() WHERE id=$1`, [id]);
  return c.json({ ok: true });
});

feedback.post("/:id/request-bug-changes", async (c) => {
  const user = c.get("user");
  if (user.email?.toLowerCase() !== PETER_EMAIL) return c.json({ error: "Not authorized" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json<{ feedback: string }>();
  const row = await queryOne<SubmissionRow>(`SELECT * FROM feedback_submissions WHERE id=$1`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);

  const summary: CollectedSummary = { type: row.type, platform: row.platform, summary: row.summary, fields: row.details };
  const { analysis, affectedFiles } = await analyzeBug(summary, body.feedback);
  const revisionCount = row.bug_revision_count + 1;
  await query(
    `UPDATE feedback_submissions SET bug_analysis=$2, affected_files=$3, bug_revision_count=$4, status='in_review', updated_at=now() WHERE id=$1`,
    [id, analysis, JSON.stringify(affectedFiles), revisionCount]
  );
  if (revisionCount > 3) console.warn(`[feedback] bug ${id} has been revised ${revisionCount} times`);
  const peterId = await getPeterUserId();
  if (peterId) await insertFeedbackNotification(peterId, "revised", id, `Revised analysis ready for review: "${row.summary}"`);
  return c.json({ ok: true, analysis, affectedFiles });
});

feedback.post("/:id/revise-mockup", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const row = await queryOne<SubmissionRow>(`SELECT * FROM feedback_submissions WHERE id=$1`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.submitted_by !== user.id) return c.json({ error: "Not authorized" }, 403);
  if (row.mockup_revision_count >= MOCKUP_REVISION_CAP) return c.json({ capped: true, mockupHtml: row.mockup_html });

  const body = await c.req.json<{ feedback: string }>();
  const summary: CollectedSummary = { type: row.type, platform: row.platform, summary: row.summary, fields: row.details };
  const html = await reviseMockupHtml(summary, row.mockup_html ?? "", body.feedback);
  const revisionCount = row.mockup_revision_count + 1;
  await query(`UPDATE feedback_submissions SET mockup_html=$2, mockup_revision_count=$3, updated_at=now() WHERE id=$1`, [id, html, revisionCount]);
  return c.json({ mockupHtml: html, revisionCount, capped: revisionCount >= MOCKUP_REVISION_CAP });
});

feedback.post("/:id/approve-mockup", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const row = await queryOne<SubmissionRow>(`SELECT * FROM feedback_submissions WHERE id=$1`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.submitted_by !== user.id) return c.json({ error: "Not authorized" }, 403);

  await sendSubmissionEmail({
    id,
    type: row.type,
    platform: row.platform,
    summary: row.summary,
    details: row.details,
    submitterName: row.submitter_name,
    submitterEmail: row.submitter_email,
    mockupHtml: row.mockup_html,
  });
  await query(`UPDATE feedback_submissions SET status='submitted', emailed_at=now(), updated_at=now() WHERE id=$1`, [id]);
  return c.json({ ok: true });
});

feedback.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await queryOne<SubmissionRow>(`SELECT * FROM feedback_submissions WHERE id=$1`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);

  const staleness = row.affected_files?.length ? await checkStaleness(row.affected_files) : [];
  return c.json({
    id: row.id,
    type: row.type,
    platform: row.platform,
    status: row.status,
    submitterName: row.submitter_name,
    submitterEmail: row.submitter_email,
    summary: row.summary,
    details: row.details,
    bugAnalysis: row.bug_analysis,
    affectedFiles: row.affected_files,
    staleness,
    bugRevisionCount: row.bug_revision_count,
    mockupHtml: row.mockup_html,
    mockupRevisionCount: row.mockup_revision_count,
    approvedAt: row.approved_at,
    emailedAt: row.emailed_at,
    createdAt: row.created_at,
  });
});
