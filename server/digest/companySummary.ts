// The digest's shared "here's what happened" paragraph(s) — one Claude
// call, same for every recipient. Pulls from four sources: the Updates
// feed (`legacy_records` collection 'activity'), new/promoted FAQ entries
// (the Resource Center's knowledge base), newly-generated ODIN video
// tutorials, and code deployments (`deployments` table — production has no
// git history, since `.git` is excluded from the rsync deploy, so this is
// the only record of what actually shipped; written manually at deploy
// time). This must never call out an individual staff member — limited to
// the impersonal activity types (mountain/project/proposal events, whose
// summary text is always phrased like "Added mountain \"X\"", never a
// name), deliberately excluding note_added/action_added, whose summaries
// are built client-side WITH real name attribution (see
// buildActivitySummaries in DataContext.tsx) specifically for Slack/the
// per-person action-item sections elsewhere in this same email.
import Anthropic from "@anthropic-ai/sdk";
import { query } from "../db";
import { ODIN_VIDEO_FLOWS } from "../data/odinVideoFlows";
import { cachedSystem } from "../utils/promptCache";

const MODEL = "claude-sonnet-4-5";

const IMPERSONAL_ACTIVITY_TYPES = new Set(["mountain_added", "project_created", "proposal_created", "proposal_signed"]);

interface ActivityRecord {
  type: string;
  summary: string;
  timestamp: string;
}

// The model shouldn't have to guess whether it's summarizing "yesterday" or
// "the weekend" — compute the real window in code instead. Anything
// spanning 2+ calendar days (a normal Fri-Mon gap, or a missed run) reads
// as "since <weekday>"; a plain overnight gap reads as "yesterday".
function describeWindow(sinceIso: string, now: Date): string {
  const since = new Date(sinceIso);
  const diffDays = (now.getTime() - since.getTime()) / 86_400_000;
  if (diffDays <= 1.5) return "yesterday";
  if (diffDays <= 4 && since.getUTCDay() === 5) return "this weekend";
  return `since ${since.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`;
}

function systemPrompt(windowPhrase: string): string {
  return `You write one short update (1-2 short paragraphs) summarizing what's happened ${windowPhrase} in YULLR's internal Builder app, for a company-wide staff email — the same text goes to everyone, so it must read as general company news, never addressed to or centered on any one person. Use the exact phrase "${windowPhrase}" (or a natural variant of it) to describe the time period — never guess or invent a different one like "yesterday" if that's not what you were given. Never name or refer to a specific staff member (no "X added...", "X had a busy day", etc.) — describe the activity itself impersonally ("Four new mountains were added...", "Several proposals were created and signed..."). Plain, factual, upbeat but not gushing.

Cover whatever is actually present in the log given to you, grouped naturally rather than as a bullet list: mountains added, projects created, proposals created/signed, new items added to the Resource Center's FAQ/knowledge base, new video tutorials generated, and features/fixes deployed to the app itself (a distinct, worth-highlighting category — staff should know when something new shipped). Never invent details not present in the log. If a category has nothing, just don't mention it — don't say "no X happened." If the whole log is thin, keep the update short rather than padding it.`;
}

export async function generateCompanySummary(sinceIso: string): Promise<string | null> {
  const [activityRows, faqRows, videoRows, deploymentRows] = await Promise.all([
    query<{ data: ActivityRecord }>(
      `SELECT data FROM legacy_records WHERE collection='activity' AND data->>'timestamp' >= $1 ORDER BY data->>'timestamp' ASC`,
      [sinceIso]
    ),
    query<{ question: string; category: string }>(
      `SELECT question, category FROM faq_entries WHERE created_at >= $1 ORDER BY created_at ASC`,
      [sinceIso]
    ),
    query<{ flow_key: string }>(
      `SELECT flow_key FROM odin_videos WHERE status='ready' AND created_at >= $1 ORDER BY created_at ASC`,
      [sinceIso]
    ),
    query<{ summary: string }>(
      `SELECT summary FROM deployments WHERE deployed_at >= $1 ORDER BY deployed_at ASC`,
      [sinceIso]
    ),
  ]);

  const relevantActivity = activityRows.map((r) => r.data).filter((a) => IMPERSONAL_ACTIVITY_TYPES.has(a.type));

  if (relevantActivity.length === 0 && faqRows.length === 0 && videoRows.length === 0 && deploymentRows.length === 0) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });

  const logLines = [
    ...relevantActivity.map((a) => `- [${a.type}] ${a.summary}`),
    ...faqRows.map((f) => `- [faq_added] New FAQ entry added to the Resource Center: "${f.question}" (${f.category})`),
    ...videoRows.map((v) => `- [video_added] New video tutorial generated: "${ODIN_VIDEO_FLOWS[v.flow_key]?.label ?? v.flow_key}"`),
    ...deploymentRows.map((d) => `- [deployed] ${d.summary}`),
  ];

  const windowPhrase = describeWindow(sinceIso, new Date());
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 350,
    system: cachedSystem(systemPrompt(windowPhrase)),
    messages: [{ role: "user", content: `Activity log ${windowPhrase}:\n${logLines.join("\n")}` }],
  });

  return response.content.find((b) => b.type === "text")?.text?.trim() ?? null;
}
