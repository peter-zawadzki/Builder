-- 0014_documents_meta.sql
-- Two follow-ups for retiring the legacy Supabase Storage/KV Edge Function:
--
-- 1. documents needs an original filename + content type for trail maps
--    (and any future generic 'file' uploads) — S3 knows the object's stored
--    content type, but not the human-facing filename the user picked.
-- 2. Image annotations were stored in Supabase's generic KV store keyed by an
--    opaque imageId that doesn't line up with a documents row (annotator
--    callers mint their own id, independent of asset/location/slot). Simplest
--    faithful port is a small dedicated KV table, same shape as before.

ALTER TABLE documents
  ADD COLUMN file_name text,
  ADD COLUMN mime_type text;

CREATE TABLE image_annotations (
  image_id    text PRIMARY KEY,
  annotations jsonb NOT NULL DEFAULT '[]',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
