-- 0002_site.sql
-- Site domain: the physical mountain — trails, install locations, and the
-- inspection log. Introduces sync_status for records that are created in the
-- field (often offline) and reconciled to the server later.

CREATE TYPE sync_status AS ENUM ('Local Only', 'Pending Upload', 'Synced');

-- ─── trails ──────────────────────────────────────────────────────────────────
CREATE TABLE trails (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id uuid NOT NULL REFERENCES mountains(id) ON DELETE CASCADE,
  name       text NOT NULL,
  notes      text,
  is_nastar  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_trails_mountain ON trails (mountain_id);
CREATE TRIGGER trg_trails_updated_at BEFORE UPDATE ON trails
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── locations ───────────────────────────────────────────────────────────────
-- Install (or documentation) point on the mountain. trail_id is the only link
-- to a trail — no parallel free-text name. Real lat/long columns.
CREATE TABLE locations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id       uuid NOT NULL REFERENCES mountains(id) ON DELETE CASCADE,
  trail_id          uuid REFERENCES trails(id) ON DELETE SET NULL,
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  name              text NOT NULL,
  difficulty        integer,
  notes             text,
  latitude          numeric,
  longitude         numeric,
  original_latitude numeric,
  original_longitude numeric,
  sync_status       sync_status NOT NULL DEFAULT 'Synced',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT locations_difficulty_range CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5)
);
CREATE INDEX idx_locations_mountain ON locations (mountain_id);
CREATE INDEX idx_locations_trail ON locations (trail_id);
CREATE INDEX idx_locations_project ON locations (project_id);
CREATE TRIGGER trg_locations_updated_at BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── location_inspections ────────────────────────────────────────────────────
-- One row per site visit (a log, not a single overwriting snapshot).
CREATE TABLE location_inspections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  items        jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes        text,
  inspected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  sync_status  sync_status NOT NULL DEFAULT 'Synced',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_location_inspections_location ON location_inspections (location_id);
