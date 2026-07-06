-- 0003_inventory.sql
-- Inventory domain: one shared manufacturer/model catalog, warehouse stock, and
-- an append-only deployment history. Stock is separate from installed Assets
-- (0004) so an item can exist before it's deployed and cleanly return to the
-- warehouse without leaving a dangling link.

CREATE TYPE inventory_category AS ENUM (
  'Server Hardware', 'Network Equipment', 'Cameras',
  'Office Equipment', 'Miscellaneous Items'
);

CREATE TYPE inventory_status AS ENUM ('In Stock', 'In a Build', 'Deployed', 'Retired');

CREATE TYPE equipment_kind AS ENUM ('manufacturer', 'model');

-- ─── equipment_catalog ───────────────────────────────────────────────────────
-- One admin-managed list of manufacturers and models, shared by inventory and
-- assets. A model's parent_id points at its manufacturer.
CREATE TABLE equipment_catalog (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category  inventory_category NOT NULL,
  kind      equipment_kind NOT NULL,
  parent_id uuid REFERENCES equipment_catalog(id) ON DELETE CASCADE,
  name      text NOT NULL
);
CREATE INDEX idx_equipment_catalog_cat_kind ON equipment_catalog (category, kind);
CREATE INDEX idx_equipment_catalog_parent ON equipment_catalog (parent_id);

-- ─── inventory_items ─────────────────────────────────────────────────────────
-- Warehouse stock. deployed_location_id is the single "where is it right now"
-- field — NULL means the warehouse. Setting it to NULL is the return action.
CREATE TABLE inventory_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yullr_inventory_number text,
  upc                  text,
  serial_number        text,
  category             inventory_category NOT NULL,
  subcategory          text,
  manufacturer_id      uuid REFERENCES equipment_catalog(id) ON DELETE SET NULL,
  model_id             uuid REFERENCES equipment_catalog(id) ON DELETE SET NULL,
  vendor               text,
  cost                 numeric,
  date_of_purchase     date,
  quantity             integer NOT NULL DEFAULT 1,
  status               inventory_status NOT NULL DEFAULT 'In Stock',
  deployed_location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  build_parent_id      uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_inventory_items_location ON inventory_items (deployed_location_id);
CREATE INDEX idx_inventory_items_build_parent ON inventory_items (build_parent_id);
CREATE INDEX idx_inventory_items_category ON inventory_items (category);
CREATE TRIGGER trg_inventory_items_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── inventory_deployments ───────────────────────────────────────────────────
-- History of moves. A NULL location_id row records a return to the warehouse.
CREATE TABLE inventory_deployments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  location_id       uuid REFERENCES locations(id) ON DELETE SET NULL,
  moved_at          timestamptz NOT NULL DEFAULT now(),
  moved_by          uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_inventory_deployments_item ON inventory_deployments (inventory_item_id);
