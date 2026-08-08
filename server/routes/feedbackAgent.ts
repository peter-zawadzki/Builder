// The guided intake conversation for the FEEDBACK section (bug reports,
// feature requests, general feedback) — same ODIN, a different context.
// Structurally mirrors server/routes/faqAgent.ts's stateless, history-
// threaded chat pattern, but drives a structured multi-stage intake instead
// of free Q&A: every turn is a single forced-tool call that returns
// {message, stage, quickReplies, readyToFinalize, collectedSummary} rather
// than free-text markdown. No code-search tools here — that only happens
// once a Builder bug report is finalized (see server/feedback/analysis.ts).
import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import type { HonoEnv } from "../auth";
import { logInteraction } from "../utils/interactionLog";
import { cachedSystem } from "../utils/promptCache";

export const feedbackAgent = new Hono<HonoEnv>();

const MODEL = "claude-sonnet-4-5";
const MAX_HISTORY_TURNS = 20; // this conversation legitimately runs longer than a single FAQ Q&A

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export type FeedbackType = "bug" | "feature" | "general";
export type FeedbackPlatform = "Builder" | "YULLR.com" | "Portal";

export interface CollectedSummary {
  type: FeedbackType;
  platform: FeedbackPlatform;
  summary: string;
  fields: Record<string, string>;
}

export interface IntakeTurnResult {
  message: string;
  stage: "choose_type" | "choose_platform" | "gathering_details" | "ready_to_finalize";
  quickReplies?: string[];
  readyToFinalize: boolean;
  collectedSummary?: CollectedSummary;
}

export const REQUIRED_FIELDS: Record<FeedbackType, string[]> = {
  bug: ["whatWereYouTryingToDo", "whatHappened", "whatYouExpected", "stepsToReproduce", "urlOrPage", "approximateTime"],
  feature: ["problem", "whoItsFor", "desiredOutcome", "priority", "constraints"],
  general: ["whatPromptedThis", "areaOrFeature", "sentiment"],
};

function systemPrompt(): string {
  return `You are ODIN, running the FEEDBACK section of the Yullr Builder app — a guided intake conversation for employees to report a bug, request a feature, or leave general feedback. This is a different context from ODIN's usual "how do I do X" help — here you are the intake form, not a Q&A assistant.

Flow:
1. If the conversation has no prior turns, greet briefly and offer exactly three choices via quickReplies: "Report a bug", "Request a feature", "General feedback". stage="choose_type".
2. Once the type is chosen, ask which platform it concerns, via quickReplies: "Builder", "YULLR.com", "Portal". stage="choose_platform".
3. Once type+platform are both known, gather ALL required fields for that type before setting readyToFinalize=true — never rush this. The required fields, and the EXACT key you must use for each in collectedSummary.fields (this is consumed programmatically downstream, so the keys must match exactly, verbatim, not a paraphrase):
   - bug: whatWereYouTryingToDo, whatHappened, whatYouExpected, stepsToReproduce, urlOrPage, approximateTime (a screenshot is nice to have but never block on it since this is a text chat). This applies for EVERY platform — Builder, YULLR.com, and Portal all need full repro detail before anything else happens, no platform skips this.
   - feature: problem, whoItsFor, desiredOutcome, priority, constraints.
   - general: whatPromptedThis, areaOrFeature, sentiment.
   Ask one or two questions at a time, not a giant checklist — this is a conversation, not a form dump, but a single detailed answer covering several fields at once is fine to accept as-is; extract every field it actually answered rather than re-asking for something already covered. stage="gathering_details" until every required field above for that type has a real answer, then stage="ready_to_finalize" and readyToFinalize=true.
4. Once readyToFinalize is true, say something brief confirming you have what you need and that you're processing it next — don't ask anything further.

Every turn, return collectedSummary with your best current extraction of {type, platform, summary (one line), fields (a plain object using EXACTLY the field keys listed above for that type — never invent different key names or nest/rename them — only include a key once you have a real answer for it)}. This is used by the rest of the system to actually process the submission, so keep it accurate and up to date every turn, not just on the final one.

Never ask for the submitter's name, email, or identity — that's captured automatically from their login.`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "provide_turn",
    description: "Return this turn's message and the current state of the intake conversation. Always call this to respond.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "What to say to the user this turn." },
        stage: { type: "string", enum: ["choose_type", "choose_platform", "gathering_details", "ready_to_finalize"] },
        quickReplies: { type: "array", items: { type: "string" }, description: "Button choices to offer, when this turn is a choice rather than free text." },
        readyToFinalize: { type: "boolean" },
        collectedSummary: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["bug", "feature", "general"] },
            platform: { type: "string", enum: ["Builder", "YULLR.com", "Portal"] },
            summary: { type: "string" },
            fields: { type: "object", additionalProperties: { type: "string" } },
          },
        },
      },
      required: ["message", "stage", "readyToFinalize"],
    },
  },
];

export async function runIntakeTurn(question: string, history: HistoryTurn[]): Promise<IntakeTurnResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.text }) as Anthropic.MessageParam),
    ...(question.trim() ? [{ role: "user" as const, content: question }] : []),
  ];
  if (messages.length === 0) {
    // First-ever turn: nothing for the model to react to yet, so give it an
    // explicit nudge to open the conversation rather than sending an empty list.
    messages.push({ role: "user", content: "(The employee just opened the FEEDBACK section. Greet them and offer the three choices.)" });
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: cachedSystem(systemPrompt()),
    tools: TOOLS,
    tool_choice: { type: "tool", name: "provide_turn" },
    messages,
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Model did not return a turn");
  return toolUse.input as IntakeTurnResult;
}

feedbackAgent.post("/turn", async (c) => {
  const startTime = Date.now();
  const body = await c.req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question : "";
  const history: HistoryTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((h: any) => (h?.role === "user" || h?.role === "assistant") && typeof h?.text === "string")
        .slice(-MAX_HISTORY_TURNS)
    : [];

  const user = c.get("user");
  const result = await runIntakeTurn(question, history);

  await logInteraction({
    agent: "feedback",
    sessionId: null,
    userId: user?.id ?? null,
    question: question || "(opened FEEDBACK section)",
    answer: result.message,
    confident: !result.readyToFinalize ? null : true,
    needsUserInput: result.stage !== "ready_to_finalize",
    isFollowUp: history.length > 0,
    latencyMs: Date.now() - startTime,
  });

  return c.json(result);
});
