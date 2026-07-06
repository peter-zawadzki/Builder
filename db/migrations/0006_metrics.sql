-- 0006_metrics.sql
-- Three distinct kinds of numbers about a mountain, kept separate so their
-- source and update rhythm never get blurred:
--   profile          — discovery-call estimates, one row per mountain, no season
--   participation    — manually entered each season
--   platform_stats   — auto-fed from the YULLR platform each season

-- ─── mountain_program_profile (one per mountain, not seasonal) ────────────────
CREATE TABLE mountain_program_profile (
  mountain_id                   uuid PRIMARY KEY REFERENCES mountains(id) ON DELETE CASCADE,
  mountain_team_athletes        integer,
  usss_racers                   integer,
  high_school_teams_count       integer,
  middle_school_teams_count     integer,
  hs_ms_athletes_estimate       integer,
  usss_also_high_school_pct     numeric,
  adult_league_racers_count     integer,
  adult_league_nights_per_week  numeric,
  masters_racers                integer,
  annual_nastar_racers_estimate integer,
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by                    uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_mountain_program_profile_updated_at BEFORE UPDATE ON mountain_program_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── mountain_season_participation (manual, per season) ──────────────────────
CREATE TABLE mountain_season_participation (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id                    uuid NOT NULL REFERENCES mountains(id) ON DELETE CASCADE,
  season                         text NOT NULL,
  adult_race_league_participants integer,
  overall_race_participants      integer,
  youth_participants             integer,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now(),
  created_by                     uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (mountain_id, season)
);
CREATE TRIGGER trg_mountain_season_participation_updated_at BEFORE UPDATE ON mountain_season_participation
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── mountain_season_platform_stats (auto-fed, per season) ───────────────────
CREATE TABLE mountain_season_platform_stats (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id           uuid NOT NULL REFERENCES mountains(id) ON DELETE CASCADE,
  season                text NOT NULL,
  total_events          integer,
  total_videos          integer,
  total_athletes        integer,
  total_teams           integer,
  total_training_runs   integer,
  total_race_runs       integer,
  total_nastar          integer,
  total_season_passes   integer,
  total_mountain_passes integer,
  total_day_passes      integer,
  last_synced_at        timestamptz,
  UNIQUE (mountain_id, season)
);
