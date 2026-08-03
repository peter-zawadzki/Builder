-- 0013_documents_storage.sql
-- Wires the `documents` table (0007_engagement.sql) up for real use: photos,
-- videos, trail maps, and asset/location media were still going through the
-- legacy Supabase Storage Edge Function instead of this table + S3. `field`
-- and `slot_index` let one row represent a specific named slot (e.g. an
-- asset's serialPhoto, a location's loc-vs-inspection photos/videos array
-- index, a mountain's single trail map) instead of just "a photo on this
-- parent" — mirroring what the old storage_path naming scheme encoded.

ALTER TABLE documents
  ADD COLUMN field      text,
  ADD COLUMN slot_index integer;

-- One row per (parent, kind, field, slot_index) — re-uploading a slot
-- replaces its row rather than accumulating duplicates.
CREATE UNIQUE INDEX idx_documents_slot ON documents (
  COALESCE(mountain_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(location_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(asset_id, '00000000-0000-0000-0000-000000000000'),
  kind,
  COALESCE(field, ''),
  COALESCE(slot_index, -1)
);
