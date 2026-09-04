-- Lets an admin choose someone's Builder role (including "viewer") at invite
-- time, before that person has ever signed in — there's no Clerk User object
-- yet to attach a role to, so it can't live on publicMetadata.role like an
-- existing member's does. Keyed by email (lowercased), consumed and deleted
-- by requireAuth (server/auth.ts) the first time that person actually signs
-- in and a real `users` row gets created for them.
CREATE TABLE pending_role_assignments (
  email      text PRIMARY KEY,
  role       user_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
