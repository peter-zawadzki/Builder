-- FEEDBACK section: ODIN-guided bug reports, feature requests, and general
-- feedback. Every submission lands here (queryable status, not email-only),
-- and Builder bug-review notifications get their own small table — same
-- shape as odin_notifications (0020) but deliberately separate, since that
-- one's kind CHECK and video_id FK are video-specific by design.

CREATE TABLE feedback_submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                  text NOT NULL CHECK (type IN ('bug', 'feature', 'general')),
  platform              text NOT NULL CHECK (platform IN ('Builder', 'YULLR.com', 'Portal')),
  status                text NOT NULL DEFAULT 'in_review' CHECK (status IN ('in_review', 'approved', 'submitted', 'resolved')),
  submitted_by          uuid REFERENCES users(id),
  submitter_name        text,
  submitter_email       text,
  summary               text NOT NULL,
  details               jsonb NOT NULL,
  bug_analysis          text,
  affected_files        jsonb,
  bug_revision_count    integer NOT NULL DEFAULT 0,
  mockup_html           text,
  mockup_revision_count integer NOT NULL DEFAULT 0,
  approved_at           timestamptz,
  emailed_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_feedback_submissions_platform_type ON feedback_submissions (platform, type, created_at DESC);

CREATE TABLE feedback_notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('review_requested', 'revised')),
  submission_id  uuid REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  text           text NOT NULL,
  read_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_feedback_notifications_user ON feedback_notifications (user_id, read_at, created_at DESC);
