-- Admin-uploaded files shown in the Resource Center's Training Materials,
-- Sales Tools, and Marketing Assets tabs — replaces the old pattern of
-- hand-editing salesToolsData.ts and manually dropping files into
-- public/resource-assets/ with hand-generated thumbnails. Any authenticated
-- user can list/download; only admin/super_admin can upload or delete
-- (enforced server-side in server/routes/resourceFiles.ts, not just UI
-- hiding).
CREATE TABLE resource_files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category          text NOT NULL CHECK (category IN ('training', 'sales', 'marketing')),
  name              text NOT NULL,
  original_filename text NOT NULL,
  mime_type         text NOT NULL,
  s3_key            text NOT NULL,
  file_size         bigint,
  uploaded_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_resource_files_category ON resource_files (category, created_at);
