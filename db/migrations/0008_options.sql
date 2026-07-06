-- 0008_options.sql
-- Generic picklists and item prices. The old app kept these as KV singletons
-- (options: many key -> [values]; item-prices: name -> price). The normalized
-- schema has no home for arbitrary picklists, so these two tables preserve that
-- behavior. Manufacturer/model picklists are ALSO seeded into equipment_catalog
-- during ETL; app_options keeps the rest (parent orgs, categories, inspection
-- checklist items, etc.).

CREATE TABLE app_options (
  key        text NOT NULL,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, value)
);
CREATE INDEX idx_app_options_key ON app_options (key);

CREATE TABLE item_prices (
  name       text PRIMARY KEY,
  price      numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_item_prices_updated_at BEFORE UPDATE ON item_prices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
