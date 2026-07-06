-- 0004_assets.sql
-- Installed on-site equipment. Split into its own migration (after inventory) so
-- its foreign keys to inventory_items and equipment_catalog resolve. An asset's
-- trail is derived through its location — there is no free-text trail field.
-- Photos live in the documents table (0007), not inline here.

CREATE TYPE asset_type AS ENUM ('Camera', 'Network Gear', 'Server', 'Miscellaneous');

CREATE TABLE assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mountain_id       uuid NOT NULL REFERENCES mountains(id) ON DELETE CASCADE,
  location_id       uuid REFERENCES locations(id) ON DELETE SET NULL,
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  type              asset_type NOT NULL,
  manufacturer_id   uuid REFERENCES equipment_catalog(id) ON DELETE SET NULL,
  model_id          uuid REFERENCES equipment_catalog(id) ON DELETE SET NULL,
  serial_number     text,
  ip_address        text,
  network_category  text,
  server_spec       jsonb,   -- form factor / cpu / gpu / ram / disks, when type = Server
  misc_items        jsonb,   -- counted sub-items, when type = Miscellaneous
  is_draft          boolean NOT NULL DEFAULT false,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_assets_mountain ON assets (mountain_id);
CREATE INDEX idx_assets_location ON assets (location_id);
CREATE INDEX idx_assets_project ON assets (project_id);
CREATE INDEX idx_assets_inventory_item ON assets (inventory_item_id);
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
