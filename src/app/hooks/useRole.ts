import { useUser } from "@clerk/clerk-react";

export type UserRole = "user" | "admin" | "super_admin";

// App-level role, stored in Clerk user publicMetadata (`role: 'admin' |
// 'super_admin'`, defaulting to 'user'). Set server-side via the Clerk API —
// users cannot grant it to themselves. Falls back to the legacy
// `super_admin: true` boolean for accounts promoted before the three-tier
// system (Dev Story 10.1) existed.
export function useUserRole(): UserRole {
  const { user } = useUser();
  const metaRole = user?.publicMetadata?.role;
  if (metaRole === "admin" || metaRole === "super_admin") return metaRole;
  if (user?.publicMetadata?.super_admin === true) return "super_admin";
  return "user";
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
