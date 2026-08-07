-- ODIN auto-generated video tutorials: LLM-inferred step manifests (cached
-- per flow + source hash), generated videos (cached per flow + detail level
-- + source hash + script/voice version), and a small dedicated notification
-- feed for "your video is ready/failed" — deliberately NOT the existing
-- assignee-task "Notifications" bell (see AppHeader.tsx/DataContext.tsx),
-- which is structurally about entity assignment, not system events.

CREATE TABLE odin_video_manifests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_key          text NOT NULL,
  source_hash       text NOT NULL,
  manifest_version  text NOT NULL,
  status            text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
  steps             jsonb,
  dry_run_error     text,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_key, source_hash, manifest_version)
);

CREATE TABLE odin_videos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_key          text NOT NULL,
  detail_level      integer NOT NULL CHECK (detail_level BETWEEN 1 AND 5),
  source_hash       text NOT NULL,
  script_version    text NOT NULL,
  voice_id          text NOT NULL,
  manifest_id       uuid REFERENCES odin_video_manifests(id),
  status            text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
  s3_key            text,
  duration_ms       integer,
  step_offsets      jsonb,
  error             text,
  requested_by      uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_key, detail_level, source_hash, script_version, voice_id)
);
CREATE INDEX idx_odin_videos_flow ON odin_videos (flow_key, detail_level);

CREATE TABLE odin_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('video_ready', 'video_failed')),
  video_id    uuid REFERENCES odin_videos(id) ON DELETE CASCADE,
  text        text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_odin_notifications_user ON odin_notifications (user_id, read_at, created_at DESC);
