import { createClerkClient, verifyToken } from "@clerk/backend";
import type { MiddlewareHandler } from "hono";
import { queryOne } from "./db";

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  throw new Error("Missing CLERK_SECRET_KEY — run `clerk env pull` to write it to .env.local");
}

const clerk = createClerkClient({ secretKey });

export type UserRole = "user" | "admin" | "super_admin" | "viewer";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface AppUser {
  id: string;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  isSuperAdmin: boolean;
  dailyDigestEnabled: boolean;
}

// Hono env: handlers can read the authenticated app user via c.get("user").
export type HonoEnv = { Variables: { user: AppUser } };

const SELECT_USER = `
  SELECT id, clerk_user_id AS "clerkUserId", email, name, role, is_super_admin AS "isSuperAdmin", daily_digest_enabled AS "dailyDigestEnabled"
    FROM users WHERE clerk_user_id = $1`;

// Verify the Clerk session token, then find-or-create the matching users row so
// created_by / audit references are real and super-admin can be enforced
// server-side. This is what makes the local DB the system of record for users.
export const requireAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const authz = c.req.header("Authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return c.json({ error: "Not authenticated" }, 401);

  let sub: string;
  try {
    const claims = await verifyToken(token, { secretKey });
    sub = claims.sub as string;
  } catch {
    return c.json({ error: "Invalid or expired session" }, 401);
  }

  let user = await queryOne<AppUser>(SELECT_USER, [sub]);

  if (!user) {
    // First time we've seen this Clerk user — pull their profile and record it.
    const cu = await clerk.users.getUser(sub);
    const email =
      cu.primaryEmailAddress?.emailAddress ?? cu.emailAddresses[0]?.emailAddress ?? null;
    const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || null;
    // Role source of truth on first sight, in priority order:
    // 1. A role an admin picked for this email at invite time, before this
    //    person ever signed in (server/routes/team.ts's invite endpoint) —
    //    there's no Clerk User object yet at invite time to put this on
    //    publicMetadata.role, so it's staged here instead and consumed once.
    // 2. Clerk publicMetadata.role ('admin' | 'super_admin' | 'viewer', Dev
    //    Story 10.1, extended for read-only investor/observer accounts) —
    //    set either by the Team page's role editor (server/routes/team.ts)
    //    after this person already has a `users` row, or by hand in the
    //    Clerk Dashboard.
    // 3. The legacy publicMetadata.super_admin boolean, or peter@yullr.com
    //    (rollout promotion) — the DB migration also backfills peter@yullr.com
    //    in case this row already existed before the migration ran.
    const pending = email
      ? await queryOne<{ role: UserRole }>(`SELECT role FROM pending_role_assignments WHERE email = $1`, [
          email.toLowerCase(),
        ])
      : null;
    const metaRole = cu.publicMetadata?.role;
    const role: UserRole = pending
      ? pending.role
      : metaRole === "admin" || metaRole === "super_admin" || metaRole === "viewer"
      ? metaRole
      : cu.publicMetadata?.super_admin === true || email?.toLowerCase() === "peter@yullr.com"
      ? "super_admin"
      : "user";
    user = await queryOne<AppUser>(
      `INSERT INTO users (clerk_user_id, email, name, role, is_super_admin)
         VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (clerk_user_id) DO UPDATE
         SET email = EXCLUDED.email, name = EXCLUDED.name
       RETURNING id, clerk_user_id AS "clerkUserId", email, name, role, is_super_admin AS "isSuperAdmin", daily_digest_enabled AS "dailyDigestEnabled"`,
      [sub, email, name, role, role === "super_admin"]
    );
    if (pending && email) {
      await queryOne(`DELETE FROM pending_role_assignments WHERE email = $1`, [email.toLowerCase()]);
    }
  }

  // Viewer accounts (read-only investor/observer access) can hit any route
  // that requireAuth alone protects — most of the app's mutations have no
  // further role check — but nothing they do can actually change data:
  // reject every non-GET/HEAD/OPTIONS request outright, regardless of what
  // the UI does or doesn't hide. This is the one real enforcement point.
  if (user!.role === "viewer" && !SAFE_METHODS.has(c.req.method)) {
    return c.json({ error: "View-only mode — this account can't make changes." }, 403);
  }

  c.set("user", user!);
  await next();
};

// Gate a route to super admins only — proposal template copy, inspection
// item configuration, User Agreement terms (server-side enforcement, not
// just UI hiding).
export const requireSuperAdmin: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "super_admin") return c.json({ error: "Forbidden" }, 403);
  await next();
};

// Gate a route to admins and super admins — user management (add users,
// other admins, and regular users).
export const requireAdmin: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin" && user?.role !== "super_admin") return c.json({ error: "Forbidden" }, 403);
  await next();
};
