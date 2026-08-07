// Complete ODIN interaction history — every /ask (faqAgent.ts) and /turn
// (feedbackAgent.ts) call writes exactly one row here, independent of
// whether it also hit faq_answer_cache or faq_unanswered_log. Those two
// stay exactly as they are (cache for speed, unanswered-log for the
// dedicated gap-review queue) — this is a third, always-fires, complete
// record, the raw material server/routes/knowledgeBase.ts reviews.
import { query } from "../db";

export interface InteractionLogRow {
  agent: "faq" | "feedback";
  sessionId: string | null;
  userId: string | null;
  question: string;
  answer: string;
  confident?: boolean | null;
  needsUserInput?: boolean | null;
  usedCode?: boolean;
  usedData?: boolean;
  sources?: unknown;
  isFollowUp?: boolean;
  cacheHit?: boolean;
  latencyMs?: number;
}

export async function logInteraction(row: InteractionLogRow): Promise<void> {
  await query(
    `INSERT INTO odin_interactions
       (agent, session_id, user_id, question, answer, confident, needs_user_input, used_code, used_data, sources, is_follow_up, cache_hit, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      row.agent,
      row.sessionId,
      row.userId,
      row.question,
      row.answer,
      row.confident ?? null,
      row.needsUserInput ?? null,
      row.usedCode ?? false,
      row.usedData ?? false,
      JSON.stringify(row.sources ?? null),
      row.isFollowUp ?? false,
      row.cacheHit ?? false,
      row.latencyMs ?? null,
    ]
  );
}
