-- Production has no git history (`.git` is excluded from the rsync deploy),
-- so there's no way for the digest to know what shipped without a real
-- record. One row per deploy, written manually at deploy time — a short
-- human-readable summary, not a commit dump.
CREATE TABLE deployments (
  id          bigserial PRIMARY KEY,
  summary     text NOT NULL,
  deployed_at timestamptz NOT NULL DEFAULT now()
);
