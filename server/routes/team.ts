// Manages the app-level role (server/auth.ts's `role` column — user / admin /
// super_admin / viewer) for existing users. This is a different axis than
// Clerk's own organization role (org:member / org:admin, edited in
// TeamPage.tsx's invite form) — that one only controls Clerk's own org
// console permissions and has no bearing on what this app lets someone do.
// Before this route existed, the only way to grant/change the app role
// (including "viewer") was editing publicMetadata.role by hand in the Clerk
// Dashboard. Only covers users who have signed in at least once (i.e. already
// have a row in `users` — see requireAuth) since there's nothing to manage
// for someone who hasn't.
import { Hono } from "hono";
import { createClerkClient } from "@clerk/backend";
import { requireAdmin, type HonoEnv, type UserRole } from "../auth";
import { query, queryOne } from "../db";

export const team = new Hono<HonoEnv>();

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

const ASSIGNABLE_ROLES = new Set<UserRole>(["user", "admin", "super_admin", "viewer"]);

interface TeamMemberRow {
  clerkUserId: string;
  email: string | null;
  name: string | null;
  role: UserRole;
}

team.get("/", requireAdmin, async (c) => {
  const rows = await query<TeamMemberRow>(
    `SELECT clerk_user_id AS "clerkUserId", email, name, role FROM users ORDER BY name NULLS LAST, email`
  );
  return c.json({ members: rows });
});

team.patch("/:clerkUserId/role", requireAdmin, async (c) => {
  const caller = c.get("user");
  const targetClerkUserId = c.req.param("clerkUserId");
  const body = await c.req.json().catch(() => ({}));
  const role = body?.role as UserRole | undefined;

  if (!role || !ASSIGNABLE_ROLES.has(role)) {
    return c.json({ error: "role must be one of: user, admin, super_admin, viewer" }, 400);
  }
  if (targetClerkUserId === caller.clerkUserId) {
    return c.json({ error: "You can't change your own role." }, 400);
  }

  const target = await queryOne<{ id: string; role: UserRole }>(
    `SELECT id, role FROM users WHERE clerk_user_id = $1`,
    [targetClerkUserId]
  );
  if (!target) return c.json({ error: "That user hasn't signed in yet — nothing to update." }, 404);

  // Granting OR revoking super_admin is itself a super_admin-only action —
  // an admin promoting someone straight past their own level, or demoting an
  // existing super admin, would otherwise be a privilege-escalation hole.
  if ((role === "super_admin" || target.role === "super_admin") && caller.role !== "super_admin") {
    return c.json({ error: "Only a super admin can grant or revoke super admin." }, 403);
  }

  await query(`UPDATE users SET role = $1, is_super_admin = $2 WHERE clerk_user_id = $3`, [
    role,
    role === "super_admin",
    targetClerkUserId,
  ]);

  // Best-effort mirror to Clerk publicMetadata so a re-provisioned `users`
  // row (see requireAuth's first-login resolution) picks up the same role
  // instead of quietly resetting to 'user'. Not the source of truth at
  // runtime — the DB row above is — so a failure here doesn't roll back.
  await clerk.users.updateUserMetadata(targetClerkUserId, { publicMetadata: { role } }).catch(() => {});

  return c.json({ ok: true, clerkUserId: targetClerkUserId, role });
});
