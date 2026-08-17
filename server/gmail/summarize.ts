// Email -> CRM note summary + action items, one forced tool call (same
// single-shot forced-tool_choice pattern used for structured output
// elsewhere in this codebase, e.g. provide_analysis in feedback/analysis.ts).
import Anthropic from "@anthropic-ai/sdk";
import { cachedSystem } from "../utils/promptCache";

const MODEL = "claude-sonnet-4-5";

export interface EmailSummaryInput {
  subject: string;
  from: string;
  to: string[];
  date: string | null;
  body: string;
  contactName: string;
}

export interface EmailSummaryResult {
  summary: string;
  actionItems: string[];
}

const SYSTEM_PROMPT = `You summarize a single business email for a CRM note attached to the external contact it involves. Write 2-4 plain-English sentences, third person, naming the contact and what was discussed, decided, or asked — like a rep's own quick recap after reading the thread, not a transcript. Then list any concrete action items implied by the email (things someone now needs to do), as short imperative strings ("Send updated pricing by Friday"). If there are none, return an empty list — don't invent busywork.`;

const PROVIDE_SUMMARY_TOOL: Anthropic.Tool = {
  name: "provide_summary",
  description: "Give the final email summary and action items. Always call this to finish.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      actionItems: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "actionItems"],
  },
};

export async function generateEmailSummary(input: EmailSummaryInput): Promise<EmailSummaryResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });

  const userMessage = [
    `Contact: ${input.contactName}`,
    `From: ${input.from}`,
    `To: ${input.to.join(", ")}`,
    input.date ? `Date: ${input.date}` : null,
    `Subject: ${input.subject}`,
    "",
    input.body,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: cachedSystem(SYSTEM_PROMPT),
    tools: [PROVIDE_SUMMARY_TOOL],
    tool_choice: { type: "tool", name: "provide_summary" },
    messages: [{ role: "user", content: userMessage }],
  });

  const call = response.content.find((b) => b.type === "tool_use");
  if (!call || call.type !== "tool_use") return null;
  const result = call.input as { summary: string; actionItems: string[] };
  return { summary: result.summary, actionItems: result.actionItems ?? [] };
}
