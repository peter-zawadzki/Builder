// HTML mockup generation/revision for Builder feature requests — a single
// Anthropic call, no tools (nothing to look up; this is a visual sketch of
// the requested feature, not a real implementation). Reuses the same brand
// voice guide as ODIN's video narration so any copy inside the mockup
// sounds like the rest of the product, not generic placeholder text.
import Anthropic from "@anthropic-ai/sdk";
import { TONE_GUIDE } from "../data/brandVoice";
import type { CollectedSummary } from "../routes/feedbackAgent";

const MODEL = "claude-sonnet-4-5";

function systemPrompt(): string {
  return `You create a single self-contained HTML mockup file representing a requested feature for the Yullr Builder app, for an employee to review before it's sent to the dev team. This is a visual sketch to communicate the idea, not a real implementation — static markup and inline CSS is enough, no JavaScript needed unless it's trivial (e.g. a details/summary toggle).

Visual style: clean, minimal, Inter font, white background, #0a0a0a text, #307fe2 (Mountain Blue) for links/primary actions, #ff5c39 (YULLR Orange) for accents, rounded-corner cards (8-12px radius) — matches the rest of this app's existing UI. Any copy/labels inside the mockup should read in this tone: ${TONE_GUIDE}

Output ONLY the raw HTML (starting with <!DOCTYPE html> or <html>) — no markdown fences, no commentary before or after.`;
}

export async function generateMockup(summary: CollectedSummary): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: systemPrompt(),
    messages: [
      {
        role: "user",
        content: `Feature request for ${summary.platform}:\n- Summary: ${summary.summary}\n${Object.entries(summary.fields)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n")}`,
      },
    ],
  });

  return extractHtml(response);
}

export async function reviseMockup(summary: CollectedSummary, previousHtml: string, feedback: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: systemPrompt(),
    messages: [
      {
        role: "user",
        content: `Feature request for ${summary.platform}:\n- Summary: ${summary.summary}\n${Object.entries(summary.fields)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n")}\n\nHere is the previous mockup:\n\n${previousHtml}\n\nRequested changes: ${feedback}\n\nReturn the full revised HTML file.`,
      },
    ],
  });

  return extractHtml(response);
}

function extractHtml(response: Anthropic.Message): string {
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  // Strip markdown code fences if the model wrapped its output despite being told not to.
  return text.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "").trim();
}
