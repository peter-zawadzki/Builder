// Shared Clerk sign-in-token auth for unattended Playwright sessions —
// extracted from scripts/captureHelpShots.ts so the ODIN video pipeline
// (server/odin/video/*) and that script use one auth code path, not two.
import { createClerkClient } from "@clerk/backend";
import type { Browser, BrowserContext, Page } from "playwright";
import { pool } from "../db";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:5173";

export async function createAuthenticatedPage(
  browser: Browser,
  opts?: {
    email?: string;
    viewport?: { width: number; height: number };
    recordVideo?: { dir: string; size: { width: number; height: number } };
    initScript?: string; // e.g. runner.ts's CURSOR_OVERLAY_SCRIPT — must be registered before the first goto to be present on it
    suppressActivityLogging?: boolean; // ODIN video fixture runs: don't let the real "Add Mountain" submission mirror an activity entry to Slack
  }
): Promise<{ context: BrowserContext; page: Page; recordingStart: number }> {
  const email = opts?.email ?? "peter@yullr.com";
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("Missing CLERK_SECRET_KEY");
  const clerk = createClerkClient({ secretKey });

  const { rows } = await pool.query<{ clerk_user_id: string }>(
    `SELECT clerk_user_id FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  if (!rows[0]) throw new Error(`${email} not found in users table`);
  const { token } = await clerk.signInTokens.createSignInToken({
    userId: rows[0].clerk_user_id,
    expiresInSeconds: 120,
  });

  const context = await browser.newContext({
    viewport: opts?.viewport ?? { width: 1400, height: 900 },
    recordVideo: opts?.recordVideo,
  });
  if (opts?.initScript) await context.addInitScript(opts.initScript);
  const page = await context.newPage();
  // Fixture generation submits the real "Add Mountain" form, which fires the
  // app's normal logActivity() -> POST /api/legacy/activity -> Slack mirror
  // for "mountain_added". Intercepted here, entirely within this automated
  // page's own network traffic — never touches the route or any real user's
  // session, so it can't suppress a genuine team member's activity.
  if (opts?.suppressActivityLogging) {
    await page.route("**/api/legacy/activity", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
    );
  }
  // Playwright's recordVideo starts capturing from context/page creation,
  // right here — NOT from whenever a caller happens to call Date.now() after
  // this function returns. The sign-in redirect + networkidle wait below
  // takes real seconds that would otherwise be invisible "dead time" at the
  // start of the recording, silently shifting every later audio-placement
  // timestamp late relative to the video's actual timeline (heard as
  // "video ahead of audio"). Capturing the reference point here, before that
  // dead time happens, is what fixes it.
  const recordingStart = Date.now();

  await page.goto(`${APP_BASE_URL}/sign-in?__clerk_ticket=${token}`, { waitUntil: "networkidle" });
  try {
    await page.getByTitle("Mountains").waitFor({ timeout: 15000 });
  } catch (err) {
    console.error("Login check failed. Current URL:", page.url());
    throw err;
  }
  return { context, page, recordingStart };
}
