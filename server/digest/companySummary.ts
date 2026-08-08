// The digest's shared "here's what happened" paragraph(s) — one Claude
// call, same for every recipient. Pulls from three sources: the Updates
// feed (`legacy_records` collection 'activity', reusing the same "what's
// meaningful" allowlist as the Slack mirror in server/routes/legacy.ts so
// the digest and Slack never disagree about what counts as noteworthy),
// new/promoted FAQ entries (the Resource Center's knowledge base), and
// newly-generated ODIN video tutorials.
import Anthropic from "@anthropic-ai/sdk";
import { query } from "../db";
import { SLACK_MIRROR_TYPES, TAGGED_ONLY_TYPES } from "../routes/legacy";
import { ODIN_VIDEO_FLOWS } from "../data/odinVideoFlows";
import { cachedSystem } from "../utils/promptCache";

const MODEL = "claude-sonnet-4-5";

interface ActivityRecord {
  type: string;
  summary: string;
  actor: string;
  tagged?: boolean;
  timestamp: string;
}

function systemPrompt(): string {
  return `You write one short update (1-2 short paragraphs) summarizing a day's worth of activity in YULLR's internal Builder app, for a company-wide staff email — the same text goes to everyone, so keep it general company news, not addressed to any one person. Plain, factual, upbeat but not gushing.

Cover whatever is actually present in the log given to you, grouped naturally rather than as a bullet list: mountains added, projects created, proposals created/signed, new items added to the Resource Center's FAQ/knowledge base, and new video tutorials generated. Never invent details not present in the log. If a category has nothing, just don't mention it — don't say "no X happened." If the whole log is thin, keep the update short rather than padding it.`;
}

export async function generateCompanySummary(sinceIso: string): Promise<string | null> {
  const [activityRows, faqRows, videoRows] = await Promise.all([
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
  ]);

  const relevantActivity = activityRows
    .map((r) => r.data)
    .filter((a) => SLACK_MIRROR_TYPES.has(a.type) && (!TAGGED_ONLY_TYPES.has(a.type) || a.tagged));

  if (relevantActivity.length === 0 && faqRows.length === 0 && videoRows.length === 0) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });

  const logLines = [
    ...relevantActivity.map((a) => `- [${a.type}] ${a.summary} — ${a.actor}`),
    ...faqRows.map((f) => `- [faq_added] New FAQ entry added to the Resource Center: "${f.question}" (${f.category})`),
    ...videoRows.map((v) => `- [video_added] New video tutorial generated: "${ODIN_VIDEO_FLOWS[v.flow_key]?.label ?? v.flow_key}"`),
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 350,
    system: cachedSystem(systemPrompt()),
    messages: [{ role: "user", content: `Activity log since the last digest:\n${logLines.join("\n")}` }],
  });

  return response.content.find((b) => b.type === "text")?.text?.trim() ?? null;
}
