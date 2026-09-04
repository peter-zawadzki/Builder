// Manages the app-level role (server/auth.ts's `role` column — user / admin /
// super_admin / viewer). This is a different axis than Clerk's own
// organization role (org:member / org:admin) — that one only controls
// Clerk's own org console permissions and has no bearing on what this app
// lets someone do. Before this route existed, the only way to grant/change
// the app role (including "viewer") was editing publicMetadata.role by hand
// in the Clerk Dashboard.
import { Hono } from "hono";
import { createClerkClient } from "@clerk/backend";
import { requireAdmin, type HonoEnv, type UserRole } from "../auth";
import { query, queryOne } from "../db";

export const team = new Hono<HonoEnv>();

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

const ASSIGNABLE_ROLES = new Set<UserRole>(["user", "admin", "super_admin", "viewer"]);

// Clerk's org role only exists because its invite/membership APIs require
// one — Admin/Super Admin get org:admin (so they can also manage the org
// from Clerk's own console if ever needed), everyone else org:member.
function orgRoleFor(role: UserRole): "org:admin" | "org:member" {
  return role === "admin" || role === "super_admin" ? "org:admin" : "org:member";
}

interface LocalRoleRow {
  clerkUserId: string;
  role: UserRole;
}

team.get("/", requireAdmin, async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId) return c.json({ error: "organizationId is required" }, 400);

  const [localRows, pendingRows, membershipList] = await Promise.all([
    query<LocalRoleRow>(`SELECT clerk_user_id AS "clerkUserId", role FROM users`),
    query<{ email: string; role: UserRole }>(`SELECT email, role FROM pending_role_assignments`),
    clerk.organizations.getOrganizationMembershipList({ organizationId, limit: 200 }),
  ]);
  const localRoleByUserId = new Map(localRows.map((r) => [r.clerkUserId, r.role]));

  // Every current org member gets a row here, defaulting to 'user' if they
  // haven't signed into Builder yet (no local `users` row) — the point is
  // the role selector always has something real to show/edit, not just a
  // static pill, regardless of whether that person has ever logged in.
  const members = membershipList.data
    .filter((m) => m.publicUserData?.userId)
    .map((m) => ({
      clerkUserId: m.publicUserData!.userId!,
      role: localRoleByUserId.get(m.publicUserData!.userId!) ?? "user",
    }));

  const pending = Object.fromEntries(pendingRows.map((r) => [r.email, r.role]));

  return c.json({ members, pending });
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

  const target = await queryOne<{ role: UserRole }>(`SELECT role FROM users WHERE clerk_user_id = $1`, [
    targetClerkUserId,
  ]);

  // Granting OR revoking super_admin is itself a super_admin-only action —
  // an admin promoting someone straight past their own level, or demoting an
  // existing super admin, would otherwise be a privilege-escalation hole.
  if ((role === "super_admin" || target?.role === "super_admin") && caller.role !== "super_admin") {
    return c.json({ error: "Only a super admin can grant or revoke super admin." }, 403);
  }

  if (target) {
    await query(`UPDATE users SET role = $1, is_super_admin = $2 WHERE clerk_user_id = $3`, [
      role,
      role === "super_admin",
      targetClerkUserId,
    ]);
  } else {
    // This member exists in the Clerk org but has never signed into Builder
    // (no `users` row yet, see requireAuth) — pre-create one with the chosen
    // role so it's already correct the first time they do sign in, instead
    // of silently falling back to 'user'.
    const cu = await clerk.users.getUser(targetClerkUserId);
    const email = cu.primaryEmailAddress?.emailAddress ?? cu.emailAddresses[0]?.emailAddress ?? null;
    const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || null;
    await query(
      `INSERT INTO users (clerk_user_id, email, name, role, is_super_admin) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (clerk_user_id) DO UPDATE SET role = EXCLUDED.role, is_super_admin = EXCLUDED.is_super_admin`,
      [targetClerkUserId, email, name, role, role === "super_admin"]
    );
  }

  // Best-effort mirror to Clerk publicMetadata so a re-provisioned `users`
  // row (see requireAuth's first-login resolution) picks up the same role
  // instead of quietly resetting to 'user'. Not the source of truth at
  // runtime — the DB row above is — so a failure here doesn't roll back.
  await clerk.users.updateUserMetadata(targetClerkUserId, { publicMetadata: { role } }).catch(() => {});
  await clerk.organizations
    .updateOrganizationMembership({ organizationId: body.organizationId, userId: targetClerkUserId, role: orgRoleFor(role) })
    .catch(() => {});

  return c.json({ ok: true, clerkUserId: targetClerkUserId, role });
});

// Invites someone brand new — there's no Clerk User object yet to carry
// publicMetadata.role, so the chosen role is staged in
// pending_role_assignments (server/auth.ts consumes it on their first sign-in).
team.post("/invite", requireAdmin, async (c) => {
  const caller = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const organizationId = body?.organizationId as string | undefined;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body?.role as UserRole | undefined;

  if (!organizationId) return c.json({ error: "organizationId is required" }, 400);
  if (!email) return c.json({ error: "A valid email address is required." }, 400);
  if (!role || !ASSIGNABLE_ROLES.has(role)) {
    return c.json({ error: "role must be one of: user, admin, super_admin, viewer" }, 400);
  }
  if (role === "super_admin" && caller.role !== "super_admin") {
    return c.json({ error: "Only a super admin can invite someone as super admin." }, 403);
  }

  await clerk.organizations.createOrganizationInvitation({
    organizationId,
    emailAddress: email,
    role: orgRoleFor(role),
    inviterUserId: caller.clerkUserId,
  });
  await query(
    `INSERT INTO pending_role_assignments (email, role) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role`,
    [email, role]
  );

  return c.json({ ok: true }, 201);
});
