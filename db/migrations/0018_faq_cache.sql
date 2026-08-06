-- Exact-question cache for the FAQ agent. Repeats of the same normalized
-- question skip the Claude call entirely. Only confident answers get cached
-- (see faqAgent.ts) — refusals always re-run so faq_unanswered_log keeps
-- tracking real gaps instead of a stuck cached "I don't know".
CREATE TABLE faq_answer_cache (
  question_norm text PRIMARY KEY,
  answer jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
