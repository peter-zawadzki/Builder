-- 0016_documents_file_size.sql
-- Mountain-level "Documents" panel uploads (MountainDocuments.tsx) were saving
-- straight to local IndexedDB (mountainDocumentsDB.ts) with no cloud sync at
-- all — a separate gap from the photo/video/trail-map/annotation migration.
-- Wiring it into `documents` too (kind can be photo/video/file depending on
-- the uploaded mime type, field = 'mountainDoc'); needs file size for the
-- existing file-size display, which photo/video/trail-map rows never needed.

ALTER TABLE documents ADD COLUMN file_size bigint;
