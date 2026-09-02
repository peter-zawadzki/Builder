-- Stores a pre-rendered first-page thumbnail (PNG) for PDF uploads, generated
-- client-side at upload time, so cards don't have to re-download and
-- re-render a multi-MB PDF in the browser on every page load. Nullable —
-- files uploaded before this existed (or where thumbnail generation failed)
-- fall back to on-the-fly client-side rendering.
ALTER TABLE resource_files ADD COLUMN thumbnail_key text;
