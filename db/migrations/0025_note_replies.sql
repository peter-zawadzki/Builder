-- One reply table for every note "shape" in the app: ContactActivity is
-- embedded across six different entity types (mountains, projects,
-- contacts, teams, organizations, inspections), and MountainNote is its own
-- top-level collection — a polymorphic reference beats seven near-identical
-- reply tables. Real relational rows (not more embedded JSON) so replies
-- can be indexed for search/RAG and trigger notifications.
CREATE TABLE note_replies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_source        text NOT NULL CHECK (note_source IN ('mountain_note', 'activity')),
  note_id            text NOT NULL,       -- MountainNote.id or ContactActivity.id
  origin_collection  text,                -- legacy_records collection holding the parent record, when note_source='activity'
  origin_id          text,                -- that parent record's id
  author_contact_id  text NOT NULL,
  author_name        text NOT NULL,
  text               text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_note_replies_note ON note_replies (note_source, note_id);

-- Same shape as feedback_notifications/odin_notifications.
CREATE TABLE note_notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('reply')),
  note_source  text NOT NULL,
  note_id      text NOT NULL,
  reply_id     uuid REFERENCES note_replies(id) ON DELETE CASCADE,
  text         text NOT NULL,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_note_notifications_user ON note_notifications (user_id, read_at, created_at DESC);
