-- Dev Story 10.1 — three-tier role system (Super Admin / Admin / User),
-- replacing the previous binary is_super_admin flag.
--
-- Super Admin: full access, including proposal template copy, inspection
--   item configuration, and User Agreement terms.
-- Admin: can add users/other admins/regular users; cannot edit proposal
--   template copy, inspection items, or the User Agreement terms.
-- User: standard access only.

CREATE TYPE user_role AS ENUM ('user', 'admin', 'super_admin');

ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'user';

-- Backfill: anyone who was a super admin under the old flag stays one.
UPDATE users SET role = 'super_admin' WHERE is_super_admin = true;

-- Promote peter@yullr.com to Super Admin on rollout per Dev Story 10.1,
-- regardless of whether that row already exists (first Clerk sign-in creates
-- it) — this covers both orders of operation.
UPDATE users SET role = 'super_admin' WHERE lower(email) = 'peter@yullr.com';

-- is_super_admin is now derived from role; keep the column (a few queries
-- may still read it) but drive it off role going forward instead of Clerk
-- publicMetadata, and keep it in sync via role.
UPDATE users SET is_super_admin = true WHERE role = 'super_admin';
