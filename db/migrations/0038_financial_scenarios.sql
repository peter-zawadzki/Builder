-- Backs the Financial Planning tool (folded in from a standalone Next.js
-- app — see src/app/financial-planning/). That app's Prisma schema had 11
-- models, but only ever actually read/wrote a single Scenario row (as a
-- JSON overrides blob) plus its latest calculation snapshot — every other
-- table (ModelVersion, ModelItem, BaselineValue, StaffRole, ContractorItem,
-- GaItem, and the granular *Override tables) was vestigial, never touched
-- by either API route. Collapsed here into one table, matching Builder's
-- own preference for a JSON payload over a fully normalized schema when
-- the payload is always read/written as a whole.
CREATE TABLE financial_scenarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  growth_preset   text,
  adoption_preset text,
  overrides_json  jsonb,
  override_count  integer NOT NULL DEFAULT 0,
  results_json    jsonb,
  engine_version  text,
  is_archived     boolean NOT NULL DEFAULT false,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_financial_scenarios_created_at ON financial_scenarios (created_at);
