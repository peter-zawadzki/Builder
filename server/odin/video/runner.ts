// Executes a ManifestStep[] against a live Playwright page — the one place
// that turns manifest JSON into real browser actions. Shared by the dry run
// (fast, .click()/.fill(), nothing recorded) and the real recording run
// (paced to each step's narration length, explicit mouse movement so the
// injected cursor overlay animates, visible per-keystroke typing).
import type { Locator, Page } from "playwright";
import type { ManifestStep } from "./manifestGenerator";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:5173";

// Playwright's recordVideo captures Chromium's own rendered frames — there is
// no OS cursor in that capture at all, so an in-page overlay is the only
// thing that will ever show up, not just the simplest option. Only animates
// with real intermediate mousemove events, which is why the real run drives
// page.mouse.move()/.down()/.up() explicitly instead of locator.click().
export const CURSOR_OVERLAY_SCRIPT = `(() => {
  const el = document.createElement('div');
  el.id = '__odin_cursor__';
  Object.assign(el.style, {
    position: 'fixed', zIndex: 999999, pointerEvents: 'none',
    width: '18px', height: '18px', borderRadius: '50%',
    background: 'rgba(255,92,57,0.85)', left: '-100px', top: '-100px',
    boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
  });
  document.documentElement.appendChild(el);
  window.addEventListener('mousemove', e => { el.style.left = (e.clientX - 9) + 'px'; el.style.top = (e.clientY - 9) + 'px'; });
  window.addEventListener('mousedown', () => { el.style.transform = 'scale(1.6)'; el.style.background = 'rgba(255,92,57,1)'; });
  window.addEventListener('mouseup', () => { el.style.transform = 'scale(1)'; el.style.background = 'rgba(255,92,57,0.85)'; });
})();`;

function resolveLocator(page: Page, locator: ManifestStep["locator"]): Locator {
  const base = resolveLocatorBase(page, locator);
  return locator?.first ? base.first() : base;
}

function resolveLocatorBase(page: Page, locator: ManifestStep["locator"]): Locator {
  if (!locator) throw new Error("Step is missing a locator");
  const opts = locator.exact !== undefined ? { exact: locator.exact } : undefined;
  switch (locator.by) {
    case "role":
      // Default to exact name matching, not Playwright's own substring
      // default — a button's accessible name is usually short/precise, and
      // substring matching keeps colliding with unrelated elements whose
      // longer accessible name happens to contain the target text (e.g. a
      // project card titled "...Install..." matching a button literally
      // named "Install"). Manifest steps can still opt into substring
      // matching explicitly via locator.exact === false.
      return page.getByRole(locator.role as any, { ...(locator.value ? { name: locator.value } : {}), exact: true, ...(opts ?? {}) });
    case "text":
      return page.getByText(locator.value, opts);
    case "label":
      return page.getByLabel(locator.value, opts);
    case "title":
      return page.getByTitle(locator.value, opts);
    case "placeholder":
      return page.getByPlaceholder(locator.value, opts);
    case "labelSibling":
      // Fallback for a <label> that isn't programmatically associated with
      // its control (no `for`/wrapping, no aria-labelledby) — still driven
      // by the label's visible text, not a class/id/data-testid, and mirrors
      // the same working pattern scripts/captureHelpShots.ts already uses
      // for this exact codebase's unlabeled <select> elements. Uses
      // :text-is() (exact match) rather than :has-text() (substring) —
      // substring matching false-positives whenever one label's text is a
      // prefix of another's (e.g. "Serial Number" vs "Serial Number Photo").
      return page.locator(`label:text-is("${(locator.value ?? "").replace(/"/g, '\\"')}") + *`);
    case "headingScoped": {
      // A component embedded alongside several structurally-identical
      // siblings (a mountain detail page's Projects/Proposals/Trails/etc.
      // panes each render their own generic "New" button) can't be told
      // apart by text/role alone — the LLM only reads ONE pane's source, so
      // it has no way to know sibling panes exist with the same button
      // text. Scope by the pane's own heading instead, walking up to the
      // heading's parent then back down for the target — the same manual
      // disambiguation scripts/captureHelpShots.ts already uses for this
      // exact page.
      if (!locator.headingText) throw new Error("headingScoped locator requires headingText");
      const heading = page.getByRole("heading", { name: locator.headingText, exact: false });
      return heading.locator("xpath=..").getByRole((locator.role as any) ?? "button", { name: locator.value, exact: true });
    }
    default:
      throw new Error(`Unknown locator.by: ${locator.by}`);
  }
}

async function pacedMoveTo(page: Page, locator: Locator): Promise<void> {
  // Manual mouse.move()/down()/up() (needed so the cursor overlay animates)
  // does NOT auto-scroll like locator.click()/.fill() do — an off-screen
  // boundingBox() would target coordinates outside the real viewport.
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
}

async function pacedClick(page: Page, locator: Locator): Promise<void> {
  await pacedMoveTo(page, locator);
  const box = await locator.boundingBox();
  if (!box) {
    await locator.click();
    return;
  }
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
}

function matchesUrlValue(url: URL, value: string | undefined): boolean {
  if (!value) return true;
  if (value === "/") return url.pathname === "/";
  if (value.includes("*")) {
    const pattern = value.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${pattern}$`).test(url.pathname);
  }
  return url.pathname === value || url.pathname.startsWith(value + "/");
}

async function executeStep(page: Page, step: ManifestStep, paced: boolean): Promise<void> {
  switch (step.action) {
    case "goto": {
      const url = new URL(step.value ?? "/", APP_BASE_URL).toString();
      await page.goto(url, { waitUntil: "networkidle" });
      return;
    }
    case "click": {
      const locator = resolveLocator(page, step.locator);
      if (paced) await pacedClick(page, locator);
      else await locator.click();
      return;
    }
    case "fill": {
      const locator = resolveLocator(page, step.locator);
      if (paced) {
        await pacedMoveTo(page, locator);
        await locator.click();
        await locator.pressSequentially(step.value ?? "", { delay: 30 });
      } else {
        await locator.fill(step.value ?? "");
      }
      return;
    }
    case "select": {
      const locator = resolveLocator(page, step.locator);
      if (paced) await pacedMoveTo(page, locator);
      await locator.selectOption({ label: step.value ?? "" }).catch(() => locator.selectOption(step.value ?? ""));
      return;
    }
    case "press": {
      await page.keyboard.press(step.value ?? "Escape");
      return;
    }
    case "waitForText": {
      await page
        .getByText(step.value ?? "", { exact: false })
        .first()
        .waitFor({ timeout: 10_000 });
      return;
    }
    case "waitForURL": {
      await page.waitForURL((url) => matchesUrlValue(url, step.value), { timeout: 15_000 });
      return;
    }
    default:
      throw new Error(`Unknown step action: ${(step as any).action}`);
  }
}

export interface RunResult {
  stepOffsets: { stepIndex: number; startMs: number }[];
  postStepsMs: number; // elapsed ms (from recordingStart) once all steps + pacing finish — where the outro gets placed
}

// Dry run: fast, unrecorded, no pacing — the sole safety net before a real
// recording. Any locator/action failure here means generation fails
// gracefully (see pipeline.ts) instead of ever producing a broken video.
export async function runManifestDry(page: Page, steps: ManifestStep[]): Promise<void> {
  for (const step of steps) {
    await executeStep(page, step, false);
  }
}

// Real (recording) run: paced to each step's already-known narration clip
// duration so audio never bleeds into the next step's visual, with observed
// step-start timestamps returned for authoritative audio placement in
// assemble.ts (plan pacing from TTS duration, sync placement from reality).
// `recordingStart` MUST be the timestamp captured at context/page creation
// (authSession.ts's createAuthenticatedPage) — not a fresh Date.now() here —
// since Playwright's recordVideo starts from that moment, including the
// sign-in redirect that happens before this function is ever called.
// `introMs` holds the video on the landing page long enough for an intro
// line to play before step 0 begins.
export async function runManifestRecorded(
  page: Page,
  steps: ManifestStep[],
  stepDurationsMs: number[],
  recordingStart: number,
  introMs: number
): Promise<RunResult> {
  if (introMs > 0) await page.waitForTimeout(introMs);
  const stepOffsets: RunResult["stepOffsets"] = [];
  for (let i = 0; i < steps.length; i++) {
    stepOffsets.push({ stepIndex: i, startMs: Date.now() - recordingStart });
    await executeStep(page, steps[i], true);
    const pause = stepDurationsMs[i] ?? 0;
    if (pause > 0) await page.waitForTimeout(pause);
  }
  return { stepOffsets, postStepsMs: Date.now() - recordingStart };
}
