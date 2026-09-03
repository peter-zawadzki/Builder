-- Adds a 4th role tier: read-only "viewer" — can see everything, but
-- requireAuth (server/auth.ts) rejects any non-GET request from this role
-- outright, regardless of what the UI does or doesn't hide elsewhere.
-- Assigned the same way admin/super_admin already are: manually via the
-- Clerk Dashboard's publicMetadata.role (nothing in this app writes that
-- field — see server/auth.ts's comment on requireAuth).
ALTER TYPE user_role ADD VALUE 'viewer';
