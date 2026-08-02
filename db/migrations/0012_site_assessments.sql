-- 0012_site_assessments.sql
-- Site Assessment module: a mountain-wide virtual GIS site-survey tool
-- (cameras with coverage cones, network/power/building objects, freehand
-- annotations, measurements, notes, action items), distinct from the
-- existing per-Location equipment-checklist "Inspection" flow.
--
-- IMPORTANT: mountain_id/project_id are plain uuid columns with NO foreign
-- key constraint. The real `mountains`/`projects` tables (0001_core.sql)
-- have zero rows in production — every mountain/project the app actually
-- uses lives only in legacy_records (JSONB), since the client exclusively
-- calls /api/legacy/*. A hard FK here would reject every real insert the
-- moment a real mountain was selected. trail_id is the same kind of soft
-- reference, added specifically so a placed object can optionally be
-- tagged to a trail. created_by/updated_by/actor/owner columns DO use real
-- FKs to users(id), since that table is genuinely populated by requireAuth.

CREATE TABLE site_assessments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id                 uuid NOT NULL,     -- soft reference — see note above
  project_id                  uuid,              -- soft reference, optional
  name                        text NOT NULL,
  status                      text NOT NULL DEFAULT 'Draft',
  inspection_type             text,
  description                 text,
  general_notes               text,
  inspection_date             date,
  resort_representative_name  text,
  resort_representative_title text,
  resort_representative_email text,
  map_center_lat              double precision,
  map_center_lng              double precision,
  map_zoom                    double precision,
  map_bearing                 double precision,
  map_pitch                   double precision,
  map_style                   text NOT NULL DEFAULT 'satellite',
  created_by                  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by                  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  archived_at                 timestamptz
);
CREATE INDEX idx_site_assessments_mountain ON site_assessments (mountain_id);
CREATE INDEX idx_site_assessments_project ON site_assessments (project_id);
CREATE TRIGGER trg_site_assessments_updated_at BEFORE UPDATE ON site_assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE site_assessment_participants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_assessment_id uuid NOT NULL REFERENCES site_assessments(id) ON DELETE CASCADE,
  name               text NOT NULL,
  title              text,
  organization       text,
  email              text,
  participant_type   text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sa_participants_assessment ON site_assessment_participants (site_assessment_id);

CREATE TABLE site_assessment_objects (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_assessment_id uuid NOT NULL REFERENCES site_assessments(id) ON DELETE CASCADE,
  trail_id           uuid,   -- soft reference, optional — see note above
  object_type        text NOT NULL,
  object_subtype     text,
  name               text NOT NULL,
  description        text,
  geometry_json      jsonb NOT NULL,  -- GeoJSON Point/LineString/Polygon
  latitude           double precision,
  longitude          double precision,
  elevation          double precision,
  status             text,
  verification_status text NOT NULL DEFAULT 'Unverified',
  properties_json    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- camera FOV/heading/range, building type, etc.
  notes              text,
  is_hidden          boolean NOT NULL DEFAULT false,
  is_locked          boolean NOT NULL DEFAULT false,
  display_order      integer NOT NULL DEFAULT 0,
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX idx_sa_objects_assessment ON site_assessment_objects (site_assessment_id);
CREATE INDEX idx_sa_objects_trail ON site_assessment_objects (trail_id);
CREATE INDEX idx_sa_objects_type ON site_assessment_objects (object_type);
CREATE TRIGGER trg_sa_objects_updated_at BEFORE UPDATE ON site_assessment_objects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE site_assessment_object_relationships (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_assessment_id uuid NOT NULL REFERENCES site_assessments(id) ON DELETE CASCADE,
  source_object_id   uuid NOT NULL REFERENCES site_assessment_objects(id) ON DELETE CASCADE,
  target_object_id   uuid NOT NULL REFERENCES site_assessment_objects(id) ON DELETE CASCADE,
  relationship_type  text NOT NULL,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sa_relationships_assessment ON site_assessment_object_relationships (site_assessment_id);
CREATE INDEX idx_sa_relationships_source ON site_assessment_object_relationships (source_object_id);
CREATE INDEX idx_sa_relationships_target ON site_assessment_object_relationships (target_object_id);

CREATE TABLE site_assessment_annotations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_assessment_id uuid NOT NULL REFERENCES site_assessments(id) ON DELETE CASCADE,
  annotation_type    text NOT NULL,
  geometry_json      jsonb NOT NULL,
  properties_json    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- color/width/opacity/rotation
  text               text,
  is_hidden          boolean NOT NULL DEFAULT false,
  is_locked          boolean NOT NULL DEFAULT false,
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX idx_sa_annotations_assessment ON site_assessment_annotations (site_assessment_id);
CREATE TRIGGER trg_sa_annotations_updated_at BEFORE UPDATE ON site_assessment_annotations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE site_assessment_measurements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_assessment_id  uuid NOT NULL REFERENCES site_assessments(id) ON DELETE CASCADE,
  measurement_type    text NOT NULL,
  geometry_json       jsonb NOT NULL,
  horizontal_distance double precision,
  terrain_distance    double precision,  -- unused until Phase 2 (terrain-following)
  elevation_gain      double precision,
  elevation_loss      double precision,
  start_elevation     double precision,
  end_elevation       double precision,
  bearing             double precision,
  area                double precision,
  units               text NOT NULL DEFAULT 'feet',
  properties_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX idx_sa_measurements_assessment ON site_assessment_measurements (site_assessment_id);
CREATE TRIGGER trg_sa_measurements_updated_at BEFORE UPDATE ON site_assessment_measurements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE site_assessment_notes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_assessment_id uuid NOT NULL REFERENCES site_assessments(id) ON DELETE CASCADE,
  object_id          uuid REFERENCES site_assessment_objects(id) ON DELETE CASCADE,
  note_text          text NOT NULL,
  is_resolved        boolean NOT NULL DEFAULT false,
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sa_notes_assessment ON site_assessment_notes (site_assessment_id);
CREATE INDEX idx_sa_notes_object ON site_assessment_notes (object_id);
CREATE TRIGGER trg_sa_notes_updated_at BEFORE UPDATE ON site_assessment_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE site_assessment_action_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_assessment_id uuid NOT NULL REFERENCES site_assessments(id) ON DELETE CASCADE,
  object_id          uuid REFERENCES site_assessment_objects(id) ON DELETE SET NULL,
  title              text NOT NULL,
  description        text,
  owner_user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date           date,
  priority           text,
  status             text NOT NULL DEFAULT 'Open',
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);
CREATE INDEX idx_sa_action_items_assessment ON site_assessment_action_items (site_assessment_id);
CREATE INDEX idx_sa_action_items_object ON site_assessment_action_items (object_id);
CREATE TRIGGER trg_sa_action_items_updated_at BEFORE UPDATE ON site_assessment_action_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Mirrors the real, actually-used activity_log table shape (0009_project_work.sql),
-- not the dead JSONB insertActivity() path in server/routes/legacy.ts.
CREATE TABLE site_assessment_activity (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_assessment_id uuid NOT NULL REFERENCES site_assessments(id) ON DELETE CASCADE,
  type               text NOT NULL,
  summary            text NOT NULL,
  actor_user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sa_activity_assessment ON site_assessment_activity (site_assessment_id, created_at DESC);
