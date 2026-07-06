-- 0001_core.sql
-- Foundation + Party/Project core spine for YULLR Builder.
-- Target: PostgreSQL 17 (local dev today, Amazon RDS later — same engine).
--
-- Covers: users (Clerk-synced), the updated_at trigger, core enums, and the
-- organizations / mountains / contacts / mountain_organizations / projects
-- tables. Site, Inventory, Sales-document, and metrics domains follow in
-- later migrations.
--
-- gen_random_uuid() is a core function in PG13+, so no extension is required.

-- ─── Shared: updated_at trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE org_type AS ENUM (
  'Corporate Group', 'Vendor', 'Partner', 'Investor', 'Advisor',
  'Team', 'School', 'General'
);

CREATE TYPE mountain_status AS ENUM ('Prospect', 'Active', 'Inactive');

CREATE TYPE contact_role AS ENUM (
  'Admin', 'Technical', 'Operations', 'Billing', 'Legal',
  'Decision Maker', 'Champion', 'Signatory'
);

CREATE TYPE contact_phone_type AS ENUM ('Office', 'Cell');

CREATE TYPE project_kind AS ENUM ('Initial Install', 'Expansion');

CREATE TYPE project_stage AS ENUM (
  'Intro / Lead', 'Demo', 'Site Assessment', 'Proposal', 'Invoice',
  'Install', 'Commissioning', 'Training'
);

CREATE TYPE project_status AS ENUM ('Active', 'On Hold', 'Complete', 'Cancelled');

CREATE TYPE stall_reminder_level AS ENUM ('None', 'Day 3', 'Day 7', 'Day 14');

-- ─── users (Clerk-synced) ────────────────────────────────────────────────────
-- One row per app user, kept in sync with Clerk via webhook. Every created_by /
-- updated_by / changed_by reference points here, not at Clerk's ID directly, so
-- the app owns durable user records even if Clerk is ever swapped out.
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id  text UNIQUE NOT NULL,
  email          text,
  name           text,
  is_super_admin boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── organizations ───────────────────────────────────────────────────────────
-- Any party that isn't the resort itself: vendor, partner, corporate group that
-- owns mountains, a school, or a race team. `type` distinguishes them.
CREATE TABLE organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  type       org_type NOT NULL DEFAULT 'General',
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── mountains ───────────────────────────────────────────────────────────────
-- The operational resort record. Pipeline lives on projects, not here.
CREATE TABLE mountains (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  address            text,
  region             text,
  legal_entity       text,
  billing_address    text,
  phone              text,
  email              text,
  website            text,
  acreage            numeric,
  vertical_drop      numeric,
  trail_count_stated integer,
  ip_subnet          text,
  timing_systems     text[],
  status             mountain_status NOT NULL DEFAULT 'Prospect',
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_mountains_updated_at BEFORE UPDATE ON mountains
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── mountain_organizations (many ↔ many) ────────────────────────────────────
-- Links a mountain to an organization. A corporate group owning the mountain, a
-- vendor servicing it, or a team/school racing there are all rows here.
-- participant_count is meaningful when the org is a Team or School.
CREATE TABLE mountain_organizations (
  mountain_id       uuid NOT NULL REFERENCES mountains(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  participant_count integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mountain_id, organization_id)
);
CREATE INDEX idx_mountain_organizations_org ON mountain_organizations (organization_id);

-- ─── contacts ────────────────────────────────────────────────────────────────
-- One unified contact shape. mountain_id and organization_id are each optional
-- and independent: a contact may belong to a mountain, an organization, both, or
-- neither (a standalone lead). Roles are tags in contact_roles.
CREATE TABLE contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id     uuid REFERENCES mountains(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  title           text,
  email           text,
  phone           text,
  phone_type      contact_phone_type,
  is_primary      boolean NOT NULL DEFAULT false,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_contacts_mountain ON contacts (mountain_id);
CREATE INDEX idx_contacts_organization ON contacts (organization_id);
CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── contact_roles ───────────────────────────────────────────────────────────
-- A contact can hold several roles at once (e.g. Technical + Decision Maker).
CREATE TABLE contact_roles (
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role       contact_role NOT NULL,
  PRIMARY KEY (contact_id, role)
);

-- ─── projects ────────────────────────────────────────────────────────────────
-- A discrete piece of work at a mountain: the initial install, then any later
-- expansion. Each carries its own pipeline stage and (later) its own
-- proposal → agreement → invoice chain.
CREATE TABLE projects (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id          uuid NOT NULL REFERENCES mountains(id) ON DELETE CASCADE,
  kind                 project_kind NOT NULL DEFAULT 'Initial Install',
  stage                project_stage NOT NULL DEFAULT 'Intro / Lead',
  status               project_status NOT NULL DEFAULT 'Active',
  stage_entered_at     timestamptz NOT NULL DEFAULT now(),
  stall_reminder_level stall_reminder_level NOT NULL DEFAULT 'None',
  is_stalled           boolean NOT NULL DEFAULT false,
  stall_reason         text,
  stalled_at           timestamptz,
  next_action          text,
  next_action_date     date,
  estimated_value      numeric,
  close_probability    numeric,
  portal_token         text UNIQUE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_projects_mountain ON projects (mountain_id);
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── project_stage_history ───────────────────────────────────────────────────
-- Append-only log of every stage transition. Drives the stale-stage watchdog
-- and the notification trail.
CREATE TABLE project_stage_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_stage project_stage,
  to_stage   project_stage NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_project_stage_history_project ON project_stage_history (project_id);
