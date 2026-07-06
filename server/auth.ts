import { createClerkClient, verifyToken } from "@clerk/backend";
import type { MiddlewareHandler } from "hono";
import { queryOne } from "./db";

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  throw new Error("Missing CLERK_SECRET_KEY — run `clerk env pull` to write it to .env.local");
}

const clerk = createClerkClient({ secretKey });

export interface AppUser {
  id: string;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  isSuperAdmin: boolean;
}

// Hono env: handlers can read the authenticated app user via c.get("user").
export type HonoEnv = { Variables: { user: AppUser } };

const SELECT_USER = `
  SELECT id, clerk_user_id AS "clerkUserId", email, name, is_super_admin AS "isSuperAdmin"
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
    const isSuperAdmin = cu.publicMetadata?.super_admin === true;
    user = await queryOne<AppUser>(
      `INSERT INTO users (clerk_user_id, email, name, is_super_admin)
         VALUES ($1, $2, $3, $4)
       ON CONFLICT (clerk_user_id) DO UPDATE
         SET email = EXCLUDED.email, name = EXCLUDED.name
       RETURNING id, clerk_user_id AS "clerkUserId", email, name, is_super_admin AS "isSuperAdmin"`,
      [sub, email, name, isSuperAdmin]
    );
  }

  c.set("user", user!);
  await next();
};

// Gate a route to super admins (server-side enforcement, not just UI hiding).
export const requireSuperAdmin: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user?.isSuperAdmin) return c.json({ error: "Forbidden" }, 403);
  await next();
};
