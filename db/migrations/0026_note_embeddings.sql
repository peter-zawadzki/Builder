CREATE EXTENSION IF NOT EXISTS vector;

-- One embedding per note/activity/reply, kept in sync on every create/edit
-- via server/notes/embedNote.ts (fire-and-forget, same pattern as
-- mirrorToSlack). content_hash lets that upsert skip re-embedding text that
-- hasn't actually changed.
CREATE TABLE note_embeddings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_source        text NOT NULL CHECK (note_source IN ('mountain_note', 'activity', 'reply')),
  note_id            text NOT NULL,        -- the note/activity/reply's own id
  origin_collection  text,
  origin_id          text,
  mountain_id        text,                 -- denormalized for fast "notes about mountain X" filtering
  content            text NOT NULL,        -- the exact text that was embedded, for display in search results
  content_hash       text NOT NULL,
  embedding          vector(1024) NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_source, note_id)
);
CREATE INDEX idx_note_embeddings_vector ON note_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_note_embeddings_mountain ON note_embeddings (mountain_id);
