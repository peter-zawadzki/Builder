-- 0035_gmail_sync_legacy_contacts.sql
-- The live CRM's contacts/notes actually live in `legacy_records`
-- (collection='contacts', notes appended into each contact's own
-- `activities` JSON array) — the normalized `contacts`/`notes` SQL tables
-- from 0001_core.sql/0007_engagement.sql are not read by the frontend at
-- all. processed_email_messages.contact_id/note_id must reference legacy
-- record ids instead, which aren't FK-checkable against those unused SQL
-- tables, so drop the (now-wrong) foreign keys.
ALTER TABLE processed_email_messages
  DROP CONSTRAINT processed_email_messages_contact_id_fkey,
  DROP CONSTRAINT processed_email_messages_note_id_fkey;
