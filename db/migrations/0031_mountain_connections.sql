-- Physical point-to-point connections drawn on a mountain's map during a
-- Site Assessment: a Wireless Link (dashed), Wired PoE Link (solid), or a
-- 120V power run (rendered as double/parallel lines client-side). Exactly
-- two endpoints, no bent/multi-vertex paths — flat lat/lng columns instead
-- of a geometry_json LineString, since there's never more than 2 points.
--
-- Deliberately its own table, not the `locations` table (or
-- site_assessment_measurements/objects): this needs to be mountain-scoped
-- and persistent (visible on the read-only MountainMapView across visits,
-- not tied to one ephemeral assessment visit) but must structurally never
-- appear in any Location-iterating list/count anywhere in the app. A
-- brand-new table guarantees that — no existing or future call site can
-- accidentally pull these in unless it explicitly queries this table.
--
-- mountain_id/trail_id are soft references (no FK) — same convention as
-- 0012_site_assessments.sql: the real mountains/trails relational tables
-- have zero rows in production, every mountain/trail the app actually uses
-- lives in legacy_records (JSONB), reached via /api/legacy/*. A hard FK
-- here would reject every real insert.
CREATE TABLE mountain_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id       uuid NOT NULL,
  trail_id          uuid,
  name              text NOT NULL,
  connection_type   text NOT NULL CHECK (connection_type IN ('wireless', 'poe', '120v')),
  start_latitude    double precision NOT NULL,
  start_longitude   double precision NOT NULL,
  end_latitude      double precision NOT NULL,
  end_longitude     double precision NOT NULL,
  difficulty        integer CHECK (difficulty BETWEEN 1 AND 5),
  is_locked         boolean NOT NULL DEFAULT false,
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX idx_mountain_connections_mountain ON mountain_connections (mountain_id);
CREATE INDEX idx_mountain_connections_trail ON mountain_connections (trail_id);
CREATE TRIGGER trg_mountain_connections_updated_at BEFORE UPDATE ON mountain_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
