-- 0015_documents_unconstrained_parents.sql
-- documents.mountain_id/location_id/asset_id were given real FKs into the
-- normalized mountains/locations/assets tables (0007). But per db/README.md
-- "Current runtime data model," the running app reads/writes mountains/
-- locations/assets through the legacy_records JSONB blob table via
-- /api/legacy/*, NOT the normalized tables — those ids are legacy_records.id
-- values with no row in mountains/locations/assets at all. Every real photo/
-- video/trail-map upload would have hit a foreign-key violation in
-- production. site_assessments (0012) hit this exact issue and already
-- switched to unconstrained uuid columns for the same reason — documents
-- follows that precedent.
--
-- Cleanup on delete was never actually driven by these FKs' ON DELETE CASCADE
-- anyway (legacy_records deletes never touched the normalized tables to
-- trigger it) — the app already explicitly calls the photo/location-media/
-- trail-map delete endpoints when an asset/location/mountain is removed
-- (DataContext.tsx deleteAsset, EditLocation/CreateLocation delete flows,
-- EditMountain handleDeleteMap), so no behavior is lost here.

ALTER TABLE documents
  DROP CONSTRAINT documents_mountain_id_fkey,
  DROP CONSTRAINT documents_location_id_fkey,
  DROP CONSTRAINT documents_asset_id_fkey;
