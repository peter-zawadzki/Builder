-- 0009_project_work.sql
-- Project-centric work model + the Updates feed + email-review table.
-- Additive only. Existing trails/locations/inspections are backfilled into each
-- mountain's initial project so the new views have real data; nothing is dropped.

CREATE TYPE trail_work_status AS ENUM ('pending', 'in-process', 'completed', 'live');
CREATE TYPE location_type AS ENUM ('Install', 'Other');
CREATE TYPE inbound_update_status AS ENUM ('pending', 'approved', 'rejected');

-- ─── project_trails (per-project trail status) ───────────────────────────────
CREATE TABLE project_trails (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trail_id   uuid NOT NULL REFERENCES trails(id) ON DELETE CASCADE,
  status     trail_work_status NOT NULL DEFAULT 'pending',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, trail_id)
);
CREATE INDEX idx_project_trails_trail ON project_trails (trail_id);
CREATE TRIGGER trg_project_trails_updated_at BEFORE UPDATE ON project_trails
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── project_locations (per-project install/other) ───────────────────────────
CREATE TABLE project_locations (
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  location_id   uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  location_type location_type NOT NULL DEFAULT 'Install',
  PRIMARY KEY (project_id, location_id)
);
CREATE INDEX idx_project_locations_location ON project_locations (location_id);

-- ─── inspections belong to a (project, location) ─────────────────────────────
ALTER TABLE location_inspections
  ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX idx_location_inspections_project ON location_inspections (project_id);

-- ─── activity_log (Updates feed) ─────────────────────────────────────────────
CREATE TABLE activity_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id   uuid REFERENCES mountains(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  type          text NOT NULL,  -- note_added | status_changed | inspection_logged | email_update | ...
  summary       text NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_log_mountain ON activity_log (mountain_id, created_at DESC);

-- ─── inbound_email_updates (build@yullr.com, human-in-the-loop) ──────────────
CREATE TABLE inbound_email_updates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_email       text NOT NULL,
  subject          text,
  body             text,
  mountain_id      uuid REFERENCES mountains(id) ON DELETE SET NULL,
  project_id       uuid REFERENCES projects(id) ON DELETE SET NULL,
  proposed_actions jsonb NOT NULL,   -- Claude's structured interpretation
  status           inbound_update_status NOT NULL DEFAULT 'pending',
  reviewed_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inbound_email_updates_mountain ON inbound_email_updates (mountain_id, status);

-- ─── backfill existing data into each mountain's initial project ─────────────
INSERT INTO project_trails (project_id, trail_id)
SELECT p.id, t.id
  FROM trails t
  JOIN LATERAL (SELECT id FROM projects pr WHERE pr.mountain_id = t.mountain_id ORDER BY created_at LIMIT 1) p ON true
ON CONFLICT DO NOTHING;

INSERT INTO project_locations (project_id, location_id)
SELECT p.id, l.id
  FROM locations l
  JOIN LATERAL (SELECT id FROM projects pr WHERE pr.mountain_id = l.mountain_id ORDER BY created_at LIMIT 1) p ON true
ON CONFLICT DO NOTHING;

UPDATE location_inspections li
   SET project_id = p.id
  FROM locations l
  JOIN LATERAL (SELECT id FROM projects pr WHERE pr.mountain_id = l.mountain_id ORDER BY created_at LIMIT 1) p ON true
 WHERE li.location_id = l.id AND li.project_id IS NULL;
