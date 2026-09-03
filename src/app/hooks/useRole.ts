import { useUser } from "@clerk/clerk-react";
import { useRoleOverride } from "../context/RoleOverrideContext";

export type UserRole = "user" | "admin" | "super_admin" | "viewer";

// App-level role, stored in Clerk user publicMetadata (`role: 'admin' |
// 'super_admin' | 'viewer'`, defaulting to 'user'). Set server-side via the
// Clerk Dashboard — users cannot grant it to themselves. Falls back to the
// legacy `super_admin: true` boolean for accounts promoted before the
// three-tier system (Dev Story 10.1) existed. Mirrors the same resolution
// logic as server/auth.ts's requireAuth — that server copy is the one that
// actually matters for enforcement (see requireAuth's viewer write-block);
// this is only for what the UI shows.
export function useRealUserRole(): UserRole {
  const { user } = useUser();
  const metaRole = user?.publicMetadata?.role;
  if (metaRole === "admin" || metaRole === "super_admin" || metaRole === "viewer") return metaRole;
  if (user?.publicMetadata?.super_admin === true) return "super_admin";
  return "user";
}

// Effective role for UI gating. A real super admin can preview the app as a
// lower role ("View as" in the header) to see what an Admin or User sees
// without a second account — the override only ever narrows access (ignored
// unless the real role is already super_admin), and nothing server-side
// trusts it, so it can't be used to escalate.
export function useUserRole(): UserRole {
  const real = useRealUserRole();
  const { override } = useRoleOverride();
  return real === "super_admin" && override ? override : real;
}

// Full access: proposal template copy, inspection item configuration, User
// Agreement terms, plus everything Admin can do.
export function useIsSuperAdmin(): boolean {
  return useUserRole() === "super_admin";
}

// Can add users, other admins, and regular users (Team page) — but not
// proposal template copy, inspection items, or User Agreement terms.
export function useIsAdminOrAbove(): boolean {
  const role = useUserRole();
  return role === "admin" || role === "super_admin";
}

// Read-only — can see everything, but every write the server accepts from
// anyone else is rejected outright for this role (server/auth.ts's
// requireAuth). Intended for an investor/observer who needs day-to-day
// visibility without any ability to change data. Use this to hide
// add/edit/delete controls that would otherwise just bounce off the server.
export function useIsViewer(): boolean {
  return useUserRole() === "viewer";
}
