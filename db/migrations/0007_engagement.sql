-- 0007_engagement.sql
-- Cross-cutting engagement records: contact activity timeline, notes (attach to
-- one of mountain/contact/organization), documents (attach to one of
-- mountain/location/asset, with sync_status for offline capture), and the
-- notification log that backs the stage-change / stall-reminder automation.

CREATE TYPE contact_activity_type AS ENUM ('note', 'action');
CREATE TYPE note_topic AS ENUM ('Demo', 'Site Visit', 'Proposal', 'Install', 'Training', 'Updates');
CREATE TYPE document_kind AS ENUM ('photo', 'video', 'file', 'trail_map');
CREATE TYPE notification_channel AS ENUM ('Email', 'Slack', 'In-App');
CREATE TYPE notification_status AS ENUM ('sent', 'failed');

-- ─── contact_activities ──────────────────────────────────────────────────────
CREATE TABLE contact_activities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  text         text NOT NULL,
  type         contact_activity_type NOT NULL DEFAULT 'note',
  completed    boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_contact_activities_contact ON contact_activities (contact_id);

-- ─── notes ───────────────────────────────────────────────────────────────────
-- Attaches to exactly one of a mountain, contact, or organization.
CREATE TABLE notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id      uuid REFERENCES mountains(id) ON DELETE CASCADE,
  contact_id       uuid REFERENCES contacts(id) ON DELETE CASCADE,
  organization_id  uuid REFERENCES organizations(id) ON DELETE CASCADE,
  text             text NOT NULL,
  topic            note_topic,
  scheduled        boolean NOT NULL DEFAULT false,
  completed        boolean NOT NULL DEFAULT false,
  install_progress integer,
  follow_up_date   date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT notes_one_parent CHECK (num_nonnulls(mountain_id, contact_id, organization_id) = 1)
);
CREATE INDEX idx_notes_mountain ON notes (mountain_id);
CREATE INDEX idx_notes_contact ON notes (contact_id);
CREATE INDEX idx_notes_organization ON notes (organization_id);
CREATE TRIGGER trg_notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── note_entries (threaded replies) ─────────────────────────────────────────
CREATE TABLE note_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id    uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_note_entries_note ON note_entries (note_id);

-- ─── documents ───────────────────────────────────────────────────────────────
-- Photos, videos, files, trail maps. Attaches to exactly one of a mountain,
-- location, or asset. One sync path for every file type; storage_path points at
-- a real object store (Supabase Storage now, S3 on AWS), not inline base64.
CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id  uuid REFERENCES mountains(id) ON DELETE CASCADE,
  location_id  uuid REFERENCES locations(id) ON DELETE CASCADE,
  asset_id     uuid REFERENCES assets(id) ON DELETE CASCADE,
  kind         document_kind NOT NULL,
  storage_path text NOT NULL,
  annotations  jsonb,
  sync_status  sync_status NOT NULL DEFAULT 'Synced',
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  uploaded_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT documents_one_parent CHECK (num_nonnulls(mountain_id, location_id, asset_id) = 1)
);
CREATE INDEX idx_documents_mountain ON documents (mountain_id);
CREATE INDEX idx_documents_location ON documents (location_id);
CREATE INDEX idx_documents_asset ON documents (asset_id);

-- ─── notification_log ────────────────────────────────────────────────────────
-- Every automated email / Slack / in-app notification, success or failure.
CREATE TABLE notification_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel    notification_channel NOT NULL,
  recipient  text,
  status     notification_status NOT NULL DEFAULT 'sent',
  sent_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_log_project ON notification_log (project_id);
