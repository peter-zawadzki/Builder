-- 0034_gmail_sync.sql
-- Nightly Gmail-to-CRM sync: per-employee mailbox cursor, and a dedup ledger
-- keyed by the RFC822 Message-ID header (stable across the multiple mailbox
-- copies the same message can land in — e.g. sender's Sent copy plus a CC'd
-- colleague's Inbox copy — unlike Gmail's own per-mailbox message id).

-- ─── gmail_sync_state ────────────────────────────────────────────────────────
CREATE TABLE gmail_sync_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email           text NOT NULL,
  last_history_id text,              -- NULL = never synced; first run baselines only, no backfill
  last_synced_at  timestamptz,
  last_run_status text,              -- 'ok' | 'error' | 'reauth_required'
  last_error      text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── processed_email_messages ────────────────────────────────────────────────
CREATE TYPE gmail_message_status AS ENUM (
  'processed', 'skipped_bulk', 'skipped_calendar', 'skipped_no_contact_match',
  'skipped_no_body', 'error'
);

CREATE TABLE processed_email_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id_header    text NOT NULL UNIQUE,
  claimed_by_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  gmail_message_id     text,
  status               gmail_message_status NOT NULL,
  contact_id           uuid REFERENCES contacts(id) ON DELETE SET NULL,
  note_id              uuid REFERENCES notes(id) ON DELETE SET NULL,
  primary_employee_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  action_item_count    integer NOT NULL DEFAULT 0,
  error                text,
  message_date         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_processed_email_messages_status ON processed_email_messages (status);

-- ─── contact_activities.assigned_to ──────────────────────────────────────────
-- Action items generated from email are assigned to a "primary employee";
-- no assignee concept existed on this table before.
ALTER TABLE contact_activities
  ADD COLUMN assigned_to uuid REFERENCES users(id) ON DELETE SET NULL;

-- ─── note_topic 'Email' ──────────────────────────────────────────────────────
ALTER TYPE note_topic ADD VALUE 'Email';
