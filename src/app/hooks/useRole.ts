import { useUser } from "@clerk/clerk-react";

// Super admin is an app-level role stored in Clerk user publicMetadata. It is
// set server-side (via the Clerk API) — users cannot grant it to themselves.
// Only super admins can see and manage the Team (invite / remove users).
export function useIsSuperAdmin(): boolean {
  const { user } = useUser();
  return user?.publicMetadata?.super_admin === true;
}
