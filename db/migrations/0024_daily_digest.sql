-- Daily staff digest email (Mon-Fri). Opt-out defaults to enabled since this
-- is meant to reach everyone by default; the run log makes the job
-- idempotent (a retry after a crash won't double-send) and gives an audit
-- trail of what actually went out each day.
ALTER TABLE users ADD COLUMN daily_digest_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE digest_runs (
  id           bigserial PRIMARY KEY,
  run_date     date NOT NULL,
  user_id      uuid NOT NULL REFERENCES users(id),
  status       text NOT NULL CHECK (status IN ('sent', 'skipped_no_email', 'skipped_opted_out', 'skipped_empty', 'failed')),
  item_counts  jsonb,
  error        text,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_date, user_id)
);
