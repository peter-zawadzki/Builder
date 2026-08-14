-- A double-click/slow-network race in useAddLocationToMap.ts's start()
-- (check-then-create, no atomicity) could POST two site_assessments rows
-- for the same mountain before the first one's response updated client
-- state, with nothing at the DB layer to stop it — confirmed 7 real
-- duplicate pairs in production. This constraint is the backstop; the
-- actual race is also fixed by making POST /site-assessments idempotent
-- (server/routes/siteAssessments.ts).
--
-- Partial (WHERE archived_at IS NULL) rather than a plain unique index — a
-- mountain can have any number of archived/historical assessments, just at
-- most one active one at a time.
CREATE UNIQUE INDEX idx_site_assessments_one_active_per_mountain
  ON site_assessments (mountain_id) WHERE archived_at IS NULL;
