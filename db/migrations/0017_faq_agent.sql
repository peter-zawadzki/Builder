-- Smart FAQ agent: curated FAQ table (agent context source) plus the two
-- feedback-loop tables from the feature spec — unanswered questions (new FAQ
-- candidates) and per-answer thumbs up/down (separates bad FAQ content from a
-- missed code-search path from a wrong router call).

CREATE TABLE faq_entries (
  id text PRIMARY KEY,
  category text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  -- 'active' answers are the stable company line; 'rolling_out' covers FAQs
  -- that describe something not yet fully live (e.g. Brower timing, the
  -- support library) so the agent can hedge instead of overstating them.
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rolling_out', 'archived')),
  is_active boolean NOT NULL DEFAULT true,
  as_of date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Duplicate-question guard (the source FAQ doc had one dup) — case-insensitive
-- so re-seeding never double-weights the same question in the agent's context.
CREATE UNIQUE INDEX faq_entries_question_uidx ON faq_entries (lower(question));

CREATE TABLE faq_unanswered_log (
  id bigserial PRIMARY KEY,
  question text NOT NULL,
  path_tried text NOT NULL CHECK (path_tried IN ('faq', 'faq_and_code')),
  user_id uuid REFERENCES users(id),
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE faq_feedback (
  id bigserial PRIMARY KEY,
  question text NOT NULL,
  answer text NOT NULL,
  rating text NOT NULL CHECK (rating IN ('up', 'down')),
  sources jsonb NOT NULL DEFAULT '[]',
  user_id uuid REFERENCES users(id),
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
