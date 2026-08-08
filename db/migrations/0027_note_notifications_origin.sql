-- The notification bell needs enough info to deep-link back to the actual
-- note (via the same ?highlightNote=/?highlightActivity=/?openProject=
-- mechanism the digest email uses) — note_notifications didn't originally
-- carry origin/mountain info, just the bare note reference.
ALTER TABLE note_notifications ADD COLUMN origin_collection text;
ALTER TABLE note_notifications ADD COLUMN origin_id text;
ALTER TABLE note_notifications ADD COLUMN mountain_id text;
