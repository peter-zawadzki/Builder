import "./env";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pool } from "./db";
import { requireAuth, type HonoEnv } from "./auth";
import { mountains } from "./routes/mountains";
import { trails } from "./routes/trails";
import { locations } from "./routes/locations";
import { assets } from "./routes/assets";
import { catalog } from "./routes/catalog";
import { legacy } from "./routes/legacy";
import { proposalPublicSign } from "./routes/proposalPublicSign";
import { agreementPublicSign } from "./routes/agreementPublicSign";
import { startProposalReminderScheduler } from "./proposalReminders";

const app = new Hono<HonoEnv>();

// Dev CORS: requests normally arrive same-origin via the Vite /api proxy, but
// allow the dev origin directly too for tools/tests.
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

// Health — no auth. Confirms the server is up and the DB is reachable.
app.get("/api/health", async (c) => {
  try {
    const { rows } = await pool.query("select now() as db_time");
    return c.json({ ok: true, db_time: rows[0].db_time });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// Version / latest-release info — no auth (shown in the profile menu).
// Computed fresh per request (not baked in at build time) so it reflects
// the actual last commit even though the API process itself doesn't
// restart on every client-only code change.
const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
app.get("/api/version", (c) => {
  let version = "0.0.0";
  try {
    version = JSON.parse(readFileSync(packageJsonPath, "utf-8")).version;
  } catch { /* fall back to 0.0.0 */ }

  let commitDate: string | null = null;
  let commitHash: string | null = null;
  try {
    // %x09 (tab) instead of a literal "|" — execSync runs this through a
    // shell, where "|" would be parsed as a pipe rather than passed to git.
    const out = execSync("git log -1 --format=%cI%x09%h", { encoding: "utf-8" }).trim();
    [commitDate, commitHash] = out.split("\t");
  } catch { /* not running from a git checkout — omit */ }

  return c.json({ version, commitDate, commitHash });
});

// Public, token-authenticated proposal signing — a customer reaches these
// from an emailed link with no Clerk session, so this is mounted BEFORE the
// blanket requireAuth below (which now only applies to specific route
// groups, not all of /api/*, so this stays exempt).
app.route("/api/public/proposal-sign", proposalPublicSign);
app.route("/api/public/agreement-sign", agreementPublicSign);

// Everything below requires a valid Clerk session.
app.use("/api/mountains/*", requireAuth);
app.use("/api/trails/*", requireAuth);
app.use("/api/locations/*", requireAuth);
app.use("/api/legacy/*", requireAuth);
app.use("/api/me", requireAuth);

// Who am I — verifies the auth chain and returns the synced app user.
app.get("/api/me", (c) => c.json({ user: c.get("user") }));

// Domain routes (all behind requireAuth).
app.route("/api/mountains", mountains);
app.route("/api/trails", trails);
app.route("/api/locations", locations);
// Legacy shapes for the existing UI running losslessly on the local DB.
app.route("/api/legacy", legacy);

const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`[api] listening on http://localhost:${port}`);

// Hourly sweep for proposal follow-up reminders (Dev Story 4.2) — checks
// day-since-sent against the reminder cadence and stops once signed,
// archived, or 8 weeks have elapsed.
startProposalReminderScheduler();

export { app };
