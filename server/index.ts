import "./env";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
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

export { app };
