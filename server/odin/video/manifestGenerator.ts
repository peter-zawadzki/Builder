// Fully automated step-manifest generation for ODIN video tutorials: no
// human authors or reviews this — a single-shot Anthropic call reads the
// flow's actual component source (server/data/odinVideoFlows.ts identifies
// WHICH FILES, never the steps) and infers the ordered browser-automation
// steps itself. Cached in odin_video_manifests, keyed to a hash of the
// source files (+ fixture data) so it's only regenerated when either
// changes.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { queryOne, query } from "../../db";
import { HELP_VISUALS } from "../../data/helpVisuals";
import { ODIN_VIDEO_FLOWS, type OdinVideoFlow } from "../../data/odinVideoFlows";

const MODEL = "claude-sonnet-4-5";
const MANIFEST_VERSION = "v11"; // v11: locator.first for legitimately duplicated functionally-identical elements
const REPO_ROOT = resolve(process.cwd());

export type LocatorBy = "role" | "text" | "label" | "title" | "placeholder" | "labelSibling" | "headingScoped";

export interface ManifestStep {
  action: "goto" | "click" | "fill" | "select" | "press" | "waitForText" | "waitForURL";
  locator?: { by: LocatorBy; value: string; role?: string; exact?: boolean; headingText?: string; first?: boolean };
  value?: string;
  description: string;
}

async function readFlowSources(flow: OdinVideoFlow): Promise<string[]> {
  return Promise.all(flow.sourceFiles.map((f) => readFile(resolve(REPO_ROOT, f), "utf8")));
}

export async function resolveEntryUrl(flow: OdinVideoFlow): Promise<string> {
  return typeof flow.entryUrl === "string" ? flow.entryUrl : flow.entryUrl();
}

export async function hashFlowSource(flowKey: string): Promise<string> {
  const flow = ODIN_VIDEO_FLOWS[flowKey];
  if (!flow) throw new Error(`Unknown flow: ${flowKey}`);
  const contents = await readFlowSources(flow);
  const hash = createHash("sha256");
  hash.update(contents.join("\n---\n"));
  hash.update(JSON.stringify(flow.fixtureData ?? {}));
  hash.update(flow.hint ?? "");
  return hash.digest("hex");
}

export async function getOrGenerateManifest(flowKey: string): Promise<{ id: string; steps: ManifestStep[] }> {
  const flow = ODIN_VIDEO_FLOWS[flowKey];
  if (!flow) throw new Error(`Unknown flow: ${flowKey}`);
  const sourceHash = await hashFlowSource(flowKey);

  // Atomic claim — same INSERT...ON CONFLICT DO NOTHING pattern as
  // odin_videos, so two simultaneous first-time requests for this flow only
  // trigger one generation.
  const claimed = await queryOne<{ id: string }>(
    `INSERT INTO odin_video_manifests (flow_key, source_hash, manifest_version)
     VALUES ($1, $2, $3)
     ON CONFLICT (flow_key, source_hash, manifest_version) DO NOTHING
     RETURNING id`,
    [flowKey, sourceHash, MANIFEST_VERSION]
  );

  if (!claimed) return waitForManifest(flowKey, sourceHash, MANIFEST_VERSION);

  try {
    const steps = await generateSteps(flow, flowKey);
    await query(`UPDATE odin_video_manifests SET status='ready', steps=$2, updated_at=now() WHERE id=$1`, [
      claimed.id,
      JSON.stringify(steps),
    ]);
    return { id: claimed.id, steps };
  } catch (err: any) {
    await query(`UPDATE odin_video_manifests SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [
      claimed.id,
      err?.message ?? String(err),
    ]);
    throw err;
  }
}

async function waitForManifest(
  flowKey: string,
  sourceHash: string,
  manifestVersion: string,
  timeoutMs = 120_000
): Promise<{ id: string; steps: ManifestStep[] }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await queryOne<{ id: string; status: string; steps: ManifestStep[] | null; error: string | null }>(
      `SELECT id, status, steps, error FROM odin_video_manifests WHERE flow_key=$1 AND source_hash=$2 AND manifest_version=$3`,
      [flowKey, sourceHash, manifestVersion]
    );
    if (row?.status === "ready" && row.steps) return { id: row.id, steps: row.steps };
    if (row?.status === "failed") throw new Error(row.error ?? "Manifest generation failed");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for manifest generation");
}

async function generateSteps(flow: OdinVideoFlow, flowKey: string): Promise<ManifestStep[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey });

  const contents = await readFlowSources(flow);
  const sourceBlocks = flow.sourceFiles.map((f, i) => `--- ${f} ---\n${contents[i]}`);
  const helpVisual = HELP_VISUALS.find((h) => h.key === flowKey);
  const steer = helpVisual
    ? `\n\nExisting human-written hint about the happy path for this flow: "${helpVisual.steps.map((s) => s.caption).join(" ")}"`
    : "";
  const hintNote = flow.hint ? `\n\nImportant context about this specific flow: ${flow.hint}` : "";
  const fixtureNote = flow.fixtureData
    ? `\n\nUse these exact values verbatim for any matching input field — do not invent placeholder text: ${JSON.stringify(flow.fixtureData)}`
    : "";
  const entryUrl = await resolveEntryUrl(flow);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system:
      "You infer an ordered list of browser-automation steps for a Playwright script, purely by reading the given React component source — no human writes or reviews these steps, so infer carefully and conservatively. Output ONLY the happy-path steps a real user would take to complete this flow — skip optional/advanced fields unless told to include them. Locators MUST use semantic Playwright terms, read verbatim from the source (exact placeholder text, exact visible button label, etc.) — never invent a CSS selector, class name, or data-testid, since this codebase doesn't use those. For a button, use by='role' with role='button' and the exact visible text as value. This codebase's overwhelmingly common convention for BOTH text inputs and <select> elements is a plain `<label>...</label>` immediately followed by the control as a sibling — NOT wrapped, and with no `for`/`id`/`aria-labelledby` link (confirm this yourself by checking the JSX around each control, but treat it as the default assumption for this codebase). This means: 1) an <input> ONLY gets by='placeholder' if it genuinely has a non-empty placeholder attribute in the source — if you don't see one, it's using the label-sibling pattern instead, use by='labelSibling' with the exact visible label text (e.g. {by:'labelSibling', value:'First Name *'}); never use by='placeholder' with an empty or guessed value. 2) A <select> almost never has an accessible name of its own — `role='combobox'` alone will be ambiguous the instant there's more than one <select>/unlabeled-input on the page, which there usually is. So for EVERY <select>, always use by='labelSibling' with the exact visible label text, never by='role' with role='combobox', unless you can see with your own eyes that this particular control is nested directly inside its <label> tag (rare, verify before deviating). When two different fields share the same label text on one page (uncommon but possible), by='labelSibling' would be ambiguous too — if you notice this, mention it isn't safely automatable rather than guessing which one. If the source file is a small component meant to be embedded inside a larger page ALONGSIDE OTHER STRUCTURALLY SIMILAR SIBLINGS (a pane/section with its own 'New' or 'Add' button, sitting on a page that plausibly has several such panes — e.g. a mountain's detail page has Projects, Proposals, Trails, Inventory, Documents panes, each likely rendering their own generically-labeled button) — you cannot tell from this file alone whether that button's text is unique on the real page. In that case, use by='headingScoped' with headingText set to this pane's own visible section heading (e.g. 'Projects') and value/role set to the target button — this scopes the search to just this pane's container instead of matching every sibling pane's identical button. Use this defensively whenever a component looks like a reusable embedded pane rather than a full standalone page. If a source file shows an address/autocomplete-style input that opens a suggestions dropdown as you type, check exactly how that dropdown closes by reading its useEffect/event-listener code — do not assume it responds to the Escape key. If it closes on an outside click/mousedown listener (common pattern), add a 'click' step targeting a stable, neutral, always-present element elsewhere on the page (e.g. an <h1>/<h2> heading) immediately after filling that input, so the dropdown actually closes before the next field is touched — do not use 'press' with 'Escape' unless the source shows a real keydown handler for it. For that dismissal click specifically, ALWAYS use by='role' with the exact role ('heading') plus the exact text as value — never by='text' — because a page's own <h1> title very often has the EXACT SAME visible text as its primary submit button (an 'Add Mountain' page heading plus an 'Add Mountain' submit button, both at once, is an extremely common pattern), and by='text' has no way to distinguish which one it means, whereas by='role' with role='heading' unambiguously excludes the button. Generally: never use by='text' for any element whose text might plausibly also appear elsewhere on the page in a different role (a heading matching a button label, a button label matching a link, etc.) — use by='role' with the specific role instead whenever you're clicking a heading, button, or link, since role-scoping avoids exactly this class of collision. This applies strongly to clicking a NAMED ITEM in a list or modal (e.g. picking one specific option from a list of options by its name) — that item is virtually always a button or link under the hood, and the same name frequently also appears in the underlying page behind an open modal (a modal doesn't remove the page behind it from the DOM). Always use by='role' with role='button' (or 'link') for that click, never by='text'. Reserve by='text' only for plain, non-interactive content you're confident is unique on the page (e.g. waitForText steps checking for a success message). If any <input> has type=\"url\", its value must be a fully-qualified URL including the scheme (e.g. 'https://example.com'), not a bare domain — browsers reject a bare domain with a native validation error that silently blocks form submission. Every click/select/fill step's locator must resolve to exactly one element — never write a role locator with no name/value at all hoping it matches 'the first' or 'any' matching item (e.g. clicking one of several list items to pick one) — if you don't have a concrete, specific piece of text to target from the source or the fixture data given to you, say in your reasoning that this step can't be automated precisely rather than emitting a locator that matches everything. The first step is always a 'goto' to the flow's entry URL. End with a 'waitForURL' step matching whatever URL the form's successful submit navigates to.",
    tools: [
      {
        name: "provide_manifest",
        description: "Return the ordered list of steps.",
        input_schema: {
          type: "object",
          properties: {
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string", enum: ["goto", "click", "fill", "select", "press", "waitForText", "waitForURL"] },
                  locator: {
                    type: "object",
                    properties: {
                      by: { type: "string", enum: ["role", "text", "label", "title", "placeholder", "labelSibling", "headingScoped"] },
                      value: { type: "string" },
                      role: { type: "string", description: "ARIA role, required when by='role' or by='headingScoped' (e.g. 'button')" },
                      exact: { type: "boolean" },
                      headingText: { type: "string", description: "Required when by='headingScoped' — the visible heading text of the pane/section this control belongs to" },
                      first: { type: "boolean", description: "Set true ONLY when you know from the source that this exact locator legitimately matches 2+ functionally-identical elements (e.g. the same submit button rendered in both a sticky header and the form body) — picks the first match instead of failing on ambiguity. Never use this to paper over a locator that might be matching the WRONG element." },
                    },
                  },
                  value: { type: "string", description: "URL for goto/waitForURL, text to type for fill/press, option label for select" },
                  description: { type: "string", description: "Plain-language description of this step — also used later as the narration cue" },
                },
                required: ["action", "description"],
              },
            },
          },
          required: ["steps"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "provide_manifest" },
    messages: [
      {
        role: "user",
        content: `Flow entry URL: ${entryUrl}\n\nSource file(s):\n${sourceBlocks.join("\n\n")}${steer}${hintNote}${fixtureNote}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Model did not return a manifest");
  const { steps } = toolUse.input as { steps: ManifestStep[] };
  if (!Array.isArray(steps) || steps.length === 0) throw new Error("Model returned an empty manifest");
  return steps;
}
