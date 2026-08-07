-- Complete ODIN interaction history — orthogonal to faq_answer_cache (pure
-- speed optimization) and faq_unanswered_log (the dedicated gap-review
-- queue). Today those two only capture the exceptions; a confident follow-up
-- or a confident answer that used live code/data search leaves no trace at
-- all. Every /ask and /turn call gets exactly one row here regardless.
CREATE TABLE odin_interactions (
  id                bigserial PRIMARY KEY,
  agent             text NOT NULL CHECK (agent IN ('faq', 'feedback')),
  session_id        text,
  user_id           uuid REFERENCES users(id),
  question          text NOT NULL,
  answer            text NOT NULL,
  confident         boolean,
  needs_user_input  boolean,
  used_code         boolean NOT NULL DEFAULT false,
  used_data         boolean NOT NULL DEFAULT false,
  sources           jsonb,
  is_follow_up      boolean NOT NULL DEFAULT false,
  cache_hit         boolean NOT NULL DEFAULT false,
  latency_ms        integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_odin_interactions_created ON odin_interactions (created_at DESC);
CREATE INDEX idx_odin_interactions_question ON odin_interactions (lower(question));

-- Lets a gap get dismissed ("not worth adding to the FAQ") without it
-- resurfacing every time the review queue is opened.
ALTER TABLE faq_unanswered_log ADD COLUMN reviewed_at timestamptz;
ALTER TABLE faq_unanswered_log ADD COLUMN dismissed boolean NOT NULL DEFAULT false;
