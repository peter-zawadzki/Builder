-- 0010_legacy_records.sql
-- Full-fidelity store of the original records, exactly as the current app's data
-- layer expects them. This is what lets the existing UI (MountainsList, etc.)
-- run on the local DB unchanged and lossless: every field of every record is
-- preserved verbatim. The normalized tables are the "organized" projection;
-- this is the "keep everything, change nothing" copy the old screens read/write.

CREATE TABLE legacy_records (
  collection text NOT NULL,          -- mountains | trails | locations | assets | notes | ...
  id         text NOT NULL,          -- the record's own id (or '__all__' for singletons)
  data       jsonb NOT NULL,         -- the complete record, untouched
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);
CREATE INDEX idx_legacy_records_collection ON legacy_records (collection);
