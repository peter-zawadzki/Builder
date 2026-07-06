-- 0005_sales.sql
-- Sales-document chain, all scoped to a project (the mountain is reachable
-- through it). One shared signatures table replaces the three incompatible
-- signature shapes from the old model.

CREATE TYPE proposal_status AS ENUM ('draft', 'sent', 'signed', 'expired');
CREATE TYPE agreement_status AS ENUM ('draft', 'sent', 'signed');
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'partial', 'overdue');
CREATE TYPE signer_type AS ENUM ('client', 'yullr');

-- ─── proposals ───────────────────────────────────────────────────────────────
CREATE TABLE proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  proposal_number  text,
  date             date,
  valid_until      date,
  line_items       jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_terms    text,
  additional_terms text,
  status           proposal_status NOT NULL DEFAULT 'draft',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_proposals_project ON proposals (project_id);
CREATE TRIGGER trg_proposals_updated_at BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── customer_agreements ─────────────────────────────────────────────────────
-- Pulls legal/entity fields from its proposal instead of re-asking. Technical
-- administrators are Contacts tagged 'Technical', not a field here.
CREATE TABLE customer_agreements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  proposal_id         uuid REFERENCES proposals(id) ON DELETE SET NULL,
  customer_legal_name text,
  entity_type         text,
  state_of_formation  text,
  authorized_signatory text,
  address_for_notices text,
  effective_date      date,
  status              agreement_status NOT NULL DEFAULT 'draft',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_customer_agreements_project ON customer_agreements (project_id);
CREATE TRIGGER trg_customer_agreements_updated_at BEFORE UPDATE ON customer_agreements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── signatures ──────────────────────────────────────────────────────────────
-- Belongs to exactly one document — a proposal or an agreement.
CREATE TABLE signatures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     uuid REFERENCES proposals(id) ON DELETE CASCADE,
  agreement_id    uuid REFERENCES customer_agreements(id) ON DELETE CASCADE,
  signer_type     signer_type NOT NULL,
  name            text,
  title           text,
  signature_image text,
  signed_at       timestamptz,
  CONSTRAINT signatures_one_parent CHECK (num_nonnulls(proposal_id, agreement_id) = 1)
);
CREATE INDEX idx_signatures_proposal ON signatures (proposal_id);
CREATE INDEX idx_signatures_agreement ON signatures (agreement_id);

-- ─── invoices ────────────────────────────────────────────────────────────────
-- Many per project (Invoice A / Invoice B). quickbooks_invoice_id links the row
-- created in QuickBooks when the agreement is signed.
CREATE TABLE invoices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agreement_id          uuid REFERENCES customer_agreements(id) ON DELETE SET NULL,
  invoice_number        text,
  date                  date,
  due_date              date,
  status                invoice_status NOT NULL DEFAULT 'draft',
  quickbooks_invoice_id text,
  line_items            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_invoices_project ON invoices (project_id);
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
