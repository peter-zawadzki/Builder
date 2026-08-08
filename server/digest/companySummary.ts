// The digest's shared "here's what happened" paragraph — one Claude call,
// same for every recipient, built from the Updates feed (`legacy_records`
// collection 'activity'). Reuses the same "what's meaningful" allowlist as
// the Slack mirror (server/routes/legacy.ts) so the digest and Slack never
// disagree about what counts as noteworthy.
import Anthropic from "@anthropic-ai/sdk";
import { query } from "../db";
import { SLACK_MIRROR_TYPES, TAGGED_ONLY_TYPES } from "../routes/legacy";
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
  return `You write one short paragraph (3-5 sentences) summarizing a day's worth of activity in YULLR's internal Builder app, for a company-wide staff email. Plain, factual, upbeat but not gushing — state what happened (mountains added, projects created, proposals created/signed), grouped naturally rather than as a bullet list. Never invent details not present in the activity log given to you. If the log is thin, keep the paragraph short rather than padding it.`;
}

export async function generateCompanySummary(sinceIso: string): Promise<string | null> {
  const rows = await query<{ data: ActivityRecord }>(
    `SELECT data FROM legacy_records WHERE collection='activity' AND data->>'timestamp' >= $1 ORDER BY data->>'timestamp' ASC`,
    [sinceIso]
  );

  const relevant = rows
    .map((r) => r.data)
    .filter((a) => SLACK_MIRROR_TYPES.has(a.type) && (!TAGGED_ONLY_TYPES.has(a.type) || a.tagged));

  if (relevant.length === 0) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });

  const activityBlock = relevant.map((a) => `- [${a.type}] ${a.summary} — ${a.actor}`).join("\n");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: cachedSystem(systemPrompt()),
    messages: [{ role: "user", content: `Today's activity log:\n${activityBlock}` }],
  });

  return response.content.find((b) => b.type === "text")?.text?.trim() ?? null;
}
