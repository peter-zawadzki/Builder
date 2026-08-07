// Developer-ready "Claude Code" briefs — covers everything analysis.ts's
// Builder-bug fix recommendation doesn't: Builder feature requests (which
// only got a visual mockup before), and every YULLR.com/Portal bug or
// feature (which previously got no write-up at all, just an email). Builder
// gets real code search since this repo IS that codebase; the other
// platforms don't, so the brief stays a plain user story rather than
// guessing at files that don't exist here.
import Anthropic from "@anthropic-ai/sdk";
import { searchCode, readFileTool, ALLOWED_ROOTS } from "../utils/codeSearch";
import type { CollectedSummary } from "../routes/feedbackAgent";

const MODEL = "claude-sonnet-4-5";
const MAX_TOOL_ITERATIONS = 6;

function fieldsBlock(summary: CollectedSummary): string {
  return Object.entries(summary.fields).map(([k, v]) => `- ${k}: ${v}`).join("\n");
}

function systemPrompt(summary: CollectedSummary, hasCodeAccess: boolean): string {
  return `You write a single, self-contained developer brief for a ${summary.type} report submitted for the ${summary.platform} platform — meant to be pasted directly into Claude Code or handed to a developer to implement, so it must stand alone with everything needed to start work.

Submitted ${summary.type === "bug" ? "bug report" : "feature request"}:
- Summary: ${summary.summary}
${fieldsBlock(summary)}

Write in this exact Markdown structure:
## Title
A short, specific title.
## User story
As a <role>, I want <capability>, so that <benefit>.
${summary.type === "bug" ? "## Steps to reproduce\n## Expected vs. actual behavior" : "## Desired behavior"}
## Acceptance criteria
- Bulleted, testable criteria.
${hasCodeAccess ? "## Relevant code\nCite specific files/functions you actually found via search_code/read_file — never guess at a file you haven't verified." : ""}

${
  hasCodeAccess
    ? "Use search_code/read_file to find the actually relevant code in this repo before writing the brief — don't guess. Always finish by calling provide_brief."
    : `You do NOT have access to the ${summary.platform} codebase (it isn't in this repo) — describe what should happen, never invent specific file names or implementation details you haven't verified. Always finish by calling provide_brief.`
}`;
}

const CODE_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_code",
    description: `Token-OR-ranked search over this app's own source (${ALLOWED_ROOTS.join(", ")}).`,
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "read_file",
    description: "Read a slice of a source file found via search_code, to see full context around a match.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, start_line: { type: "number" }, end_line: { type: "number" } },
      required: ["path"],
    },
  },
];

const PROVIDE_BRIEF_TOOL: Anthropic.Tool = {
  name: "provide_brief",
  description: "Give the final written developer brief. Always call this to finish.",
  input_schema: {
    type: "object",
    properties: { brief: { type: "string", description: "The full Markdown brief." } },
    required: ["brief"],
  },
};

export async function generateDevBrief(summary: CollectedSummary): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey });
  const hasCodeAccess = summary.platform === "Builder";

  if (!hasCodeAccess) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt(summary, false),
      tools: [PROVIDE_BRIEF_TOOL],
      tool_choice: { type: "tool", name: "provide_brief" },
      messages: [{ role: "user", content: "Write the developer brief now." }],
    });
    const call = response.content.find((b) => b.type === "tool_use");
    return call?.type === "tool_use" ? (call.input as { brief: string }).brief : "Could not generate a brief.";
  }

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: "Investigate and write the developer brief now." }];
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt(summary, true),
      tools: [...CODE_TOOLS, PROVIDE_BRIEF_TOOL],
      messages,
    });
    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const finalCall = toolUses.find((c) => c.name === "provide_brief");
    if (finalCall) return (finalCall.input as { brief: string }).brief;
    if (toolUses.length === 0) {
      return response.content.find((b) => b.type === "text")?.text ?? "Could not generate a brief.";
    }

    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      let result = "";
      if (call.name === "search_code") result = await searchCode((call.input as { query: string }).query);
      else if (call.name === "read_file") {
        const input = call.input as { path: string; start_line?: number; end_line?: number };
        result = await readFileTool(input.path, input.start_line, input.end_line);
      } else result = `Unknown tool: ${call.name}`;
      toolResults.push({ type: "tool_result", tool_use_id: call.id, content: result });
    }
    messages.push({ role: "user", content: toolResults });
  }

  messages.push({ role: "user", content: "You're out of tool calls. Write the brief now using only what you've found — call provide_brief." });
  const finalResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt(summary, true),
    tools: [PROVIDE_BRIEF_TOOL],
    tool_choice: { type: "tool", name: "provide_brief" },
    messages,
  });
  const call = finalResponse.content.find((b) => b.type === "tool_use");
  return call?.type === "tool_use" ? (call.input as { brief: string }).brief : "Could not generate a brief.";
}
