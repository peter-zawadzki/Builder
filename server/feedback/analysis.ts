// Builder bug analysis: a tool-use loop (same shape as faqAgent.ts's
// runAgent) that reads real repo files via server/utils/codeSearch.ts and
// writes a human-readable bug analysis + fix recommendation for Peter to
// review — this never modifies or commits code, only produces a
// recommendation. Each cited file's content is hashed the same way
// server/odin/video/manifestGenerator.ts hashes flow source files, so the
// review UI can detect and flag if the code has changed since the
// analysis was written.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { searchCode, readFileTool, ALLOWED_ROOTS, resolveWithinRepo } from "../utils/codeSearch";
import { cachedSystem, cacheableTools } from "../utils/promptCache";
import type { CollectedSummary } from "../routes/feedbackAgent";

const MODEL = "claude-sonnet-4-5";
const MAX_TOOL_ITERATIONS = 8;

export interface AffectedFile {
  path: string;
  sha256: string;
}

export interface BugAnalysisResult {
  analysis: string;
  affectedFiles: AffectedFile[];
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_code",
    description: `Token-OR-ranked search over this app's own source (${ALLOWED_ROOTS.join(", ")}). Use plain descriptive words from the bug report, not exact phrases.`,
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "read_file",
    description: "Read a slice of a source file found via search_code, to see full context around a match.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        start_line: { type: "number" },
        end_line: { type: "number" },
      },
      required: ["path"],
    },
  },
  {
    name: "provide_analysis",
    description: "Give the final written bug analysis and fix recommendation. Always call this to finish.",
    input_schema: {
      type: "object",
      properties: {
        analysis: {
          type: "string",
          description: "Plain-language write-up: what's happening, the likely root cause, the affected file(s), and a specific recommended fix. This is a recommendation for a human developer to review — never claim the fix has been applied.",
        },
        affectedFiles: {
          type: "array",
          items: { type: "string" },
          description: "Repo-relative paths of every file actually read/cited in the analysis.",
        },
      },
      required: ["analysis", "affectedFiles"],
    },
  },
];
const CACHED_TOOLS = cacheableTools(TOOLS);

function systemPrompt(summary: CollectedSummary): string {
  return `You are ODIN, investigating a bug report on the Builder app for internal review — you write an analysis and fix recommendation, you never modify or commit any code. Use search_code/read_file to actually locate the relevant code before concluding anything; don't guess at a cause you haven't verified by reading real source. If you can't find anything conclusive after a real search effort, say so plainly in the analysis rather than inventing a plausible-sounding but unverified cause.

Bug report:
- Platform: ${summary.platform}
- Summary: ${summary.summary}
${Object.entries(summary.fields).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Always finish by calling provide_analysis.`;
}

async function hashFile(relPath: string): Promise<string | null> {
  const abs = resolveWithinRepo(relPath);
  if (!abs) return null;
  const content = await readFile(abs, "utf8").catch(() => null);
  if (content === null) return null;
  return createHash("sha256").update(content).digest("hex");
}

export async function analyzeBug(summary: CollectedSummary, priorFeedback?: string): Promise<BugAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: priorFeedback
        ? `Investigate this bug report and write a fix recommendation. A previous analysis was reviewed and needs revision — here's the requested change: "${priorFeedback}"`
        : "Investigate this bug report and write a fix recommendation.",
    },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: cachedSystem(systemPrompt(summary)),
      tools: CACHED_TOOLS,
      messages,
    });

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const finalCall = toolUses.find((c) => c.name === "provide_analysis");
    if (finalCall) return await finalizeResult(finalCall.input as { analysis: string; affectedFiles: string[] });

    if (toolUses.length === 0) {
      return { analysis: response.content.find((b) => b.type === "text")?.text ?? "No analysis produced.", affectedFiles: [] };
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

  messages.push({ role: "user", content: "You're out of tool calls. Write your analysis now using only what you've found — call provide_analysis." });
  const finalResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: cachedSystem(systemPrompt(summary)),
    tools: [TOOLS.find((t) => t.name === "provide_analysis")!],
    tool_choice: { type: "tool", name: "provide_analysis" },
    messages,
  });
  const call = finalResponse.content.find((b) => b.type === "tool_use");
  if (!call || call.type !== "tool_use") return { analysis: "Analysis could not be completed.", affectedFiles: [] };
  return await finalizeResult(call.input as { analysis: string; affectedFiles: string[] });
}

async function finalizeResult(input: { analysis: string; affectedFiles: string[] }): Promise<BugAnalysisResult> {
  const affectedFiles: AffectedFile[] = [];
  for (const path of input.affectedFiles ?? []) {
    const sha256 = await hashFile(path);
    if (sha256) affectedFiles.push({ path, sha256 });
  }
  return { analysis: input.analysis, affectedFiles };
}

// Used by the review page to detect drift between when the analysis was
// written and when Peter actually looks at it.
export async function checkStaleness(affectedFiles: AffectedFile[]): Promise<{ path: string; stale: boolean }[]> {
  return Promise.all(
    affectedFiles.map(async (f) => {
      const current = await hashFile(f.path);
      return { path: f.path, stale: current !== f.sha256 };
    })
  );
}
