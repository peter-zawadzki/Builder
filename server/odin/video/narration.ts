// Generates narration for a video, scaled to the user's chosen detail level
// (1-5), in ODIN's brand voice. Runs once per {flow, detail level, script
// version} — the manifest (which UI actions execute) is shared across all
// detail levels; only the narration/pacing differs.
//
// Structured as intro + one line per manifest step + outro, not just
// per-step lines — a per-step-only script has no beat that isn't tied to a
// UI click, so there's nowhere for a real opening/sign-off to live. The
// outro specifically draws on docs/BRAND_VOICE.md's own "Ski Humor" example
// lines rather than leaving the model to invent generic phrasing.
import Anthropic from "@anthropic-ai/sdk";
import { TONE_GUIDE } from "../../data/brandVoice";
import type { ManifestStep } from "./manifestGenerator";

const MODEL = "claude-sonnet-4-5";
export const SCRIPT_VERSION = "v5"; // v5: product is called "YULLR Builder", not "the CRM"

export interface NarrationLine {
  stepIndex: number;
  text: string; // "" is allowed (low detail levels, or a step with no visible action) — that step gets a brief pause with no audio
}

export interface NarrationScript {
  intro: string;
  lines: NarrationLine[];
  outro: string;
}

const DETAIL_GUIDANCE: Record<number, string> = {
  1: "Very brief, outcome-focused. Narrate only the 2-3 most major steps (e.g. opening the form, the overall fill-in, saving it) — for minor individual field-fill steps, leave narration text as an empty string so the video just pauses briefly on them without commentary. No tips or asides.",
  2: "Short, one line per major step, in a phrase rather than a full sentence where possible. Skip narration for the most minor steps (empty string) but cover most of the flow.",
  3: "Full one-sentence narration for most steps. Add a basic tip only where one naturally fits — don't force it.",
  4: "Full narration with a bit of context for every step, including minor UI interactions. Include a tip or a common mistake to avoid where relevant.",
  5: "Full narration with the rationale for every single step — not just what to do, but why it matters. Include tips, common mistakes, and edge cases where relevant.",
};

// Pulled directly from the brand voice guide's own "Ski Humor" section
// rather than left to the model to invent — a genuine sign-off should sound
// like it came from the same document that defines the voice, not a
// generic paraphrase of it.
const SIGN_OFF_EXAMPLES = [
  "That's a clean line.",
  "Smooth as fresh corduroy.",
  "You're at the finish line.",
  "From here, it's all downhill.",
  "Nice — that's one less thing to think about before first chair.",
];

export async function generateNarration(steps: ManifestStep[], detailLevel: number): Promise<NarrationScript> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey });

  const guidance = DETAIL_GUIDANCE[detailLevel] ?? DETAIL_GUIDANCE[3];
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `You write narration for a short screen-recorded tutorial video of YULLR Builder, an internal tool. Brand voice — write every line in this tone: ${TONE_GUIDE}

The viewer is a Yullr team member (sales, ops, or support) entering mountain data into YULLR Builder as part of their job — NOT a skier, NOT a customer of a consumer ski app. Refer to the product as "YULLR Builder" (or just "Builder") if you need to name it — never call it "the CRM" or "a CRM tool". Explain each field in terms of why complete, accurate data matters for the team (so the record is useful for reporting, search, and whoever else on the team relies on it later) — never frame a field around what "skiers" or "riders" would want to know; that reader doesn't exist in this room. Keep mountain/ski culture as a light personality touch — an occasional turn of phrase, not the framing of every instruction — matching the brand voice guide's own pacing (roughly one lighthearted moment every 30-60 seconds, not a ski reference in every line). Most per-step lines should just be plain, clear, professional instruction in ODIN's voice. Detail level ${detailLevel}/5 guidance: ${guidance}

Write three things:
1. intro — one short, warm opening line establishing what's about to be shown. Not tied to any specific step, not a click-by-click instruction — just context, in ODIN's voice.
2. lines — exactly one narration entry per manifest step given below, in order, stepIndex matching the step's 0-based position. If a step's action is "waitForURL" (a pure wait for navigation, nothing for a viewer to see happen), its narration text MUST be an empty string — there's no visual moment to narrate, and the outro carries the wrap-up instead.
3. outro — one genuine ski-culture sign-off line marking that the flow is done. Pull the style (not necessarily the exact wording) from real examples already used in Yullr's brand voice guide: ${SIGN_OFF_EXAMPLES.map((s) => `"${s}"`).join(", ")}. It should feel like an authentic close, not another instruction, and it MUST end with an exclamation point — an upbeat, energetic close, not a flat statement.

Narrate as if a person is walking a colleague through the real product — never mention Playwright, selectors, locators, or that this is an automated recording.`,
    tools: [
      {
        name: "provide_narration",
        description: "Return the intro, per-step lines, and outro.",
        input_schema: {
          type: "object",
          properties: {
            intro: { type: "string" },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  stepIndex: { type: "number" },
                  text: { type: "string", description: "Narration for this step, or an empty string to skip narrating it (low detail level, or a waitForURL step)" },
                },
                required: ["stepIndex", "text"],
              },
            },
            outro: { type: "string" },
          },
          required: ["intro", "lines", "outro"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "provide_narration" },
    messages: [
      {
        role: "user",
        content: `Steps:\n${steps.map((s, i) => `${i}. [${s.action}] ${s.description}`).join("\n")}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Model did not return narration");
  const script = toolUse.input as NarrationScript;
  if (!Array.isArray(script.lines) || script.lines.length !== steps.length) {
    throw new Error(`Narration line count (${script.lines?.length}) doesn't match step count (${steps.length})`);
  }
  if (!script.intro?.trim() || !script.outro?.trim()) {
    throw new Error("Model returned an empty intro or outro");
  }
  // Belt and suspenders: don't rely on the model always following the
  // punctuation instruction — guarantee the sign-off reads as upbeat.
  const outro = script.outro.trim();
  script.outro = /[!]$/.test(outro) ? outro : outro.replace(/[.?]+$/, "") + "!";
  return script;
}
