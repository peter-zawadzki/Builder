// Admin review/promote workflow that turns real ODIN usage (logged gaps
// and good-but-uncached answers) into permanent, cited faq_entries — the
// "growth loop" that makes the knowledge base actually grow from real
// questions instead of only hand-written seed content.
import { Hono } from "hono";
import { requireAdmin, type HonoEnv } from "../auth";
import { query, queryOne } from "../db";
import { tokenSet, overlapScore } from "../utils/similarity";

export const knowledgeBase = new Hono<HonoEnv>();

const GROUP_SIMILARITY_THRESHOLD = 0.7;

function slugify(question: string): string {
  const base = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base}-${Date.now().toString(36)}`;
}

knowledgeBase.get("/gaps", requireAdmin, async (c) => {
  const rows = await query<{ id: number; question: string; path_tried: string; created_at: string; user_name: string | null; user_email: string | null }>(
    `SELECT l.id, l.question, l.path_tried, l.created_at, u.name AS user_name, u.email AS user_email
     FROM faq_unanswered_log l LEFT JOIN users u ON u.id = l.user_id
     WHERE l.dismissed = false ORDER BY l.created_at DESC LIMIT 500`
  );

  // Group similar phrasings of the same underlying question together —
  // greedy clustering by token overlap, same idea as the duplicate-report
  // check, just grouping a whole list instead of matching one new item.
  // Different people can hit the same gap, so each group tracks every
  // asker (deduped by email) rather than just the first/last one.
  const groups: {
    ids: number[];
    question: string;
    count: number;
    pathTried: string;
    latestAt: string;
    tokens: Set<string>;
    askers: { name: string | null; email: string | null }[];
  }[] = [];
  for (const row of rows) {
    const tokens = tokenSet(row.question);
    const match = groups.find((g) => overlapScore(tokens, g.tokens) >= GROUP_SIMILARITY_THRESHOLD || overlapScore(g.tokens, tokens) >= GROUP_SIMILARITY_THRESHOLD);
    const asker = { name: row.user_name, email: row.user_email };
    if (match) {
      match.ids.push(row.id);
      match.count++;
      if (!match.askers.some((a) => a.email === asker.email)) match.askers.push(asker);
    } else {
      groups.push({ ids: [row.id], question: row.question, count: 1, pathTried: row.path_tried, latestAt: row.created_at, tokens, askers: [asker] });
    }
  }
  groups.sort((a, b) => b.count - a.count);

  return c.json({
    gaps: groups.map((g) => ({ ids: g.ids, question: g.question, count: g.count, pathTried: g.pathTried, latestAt: g.latestAt, askers: g.askers })),
  });
});

knowledgeBase.post("/gaps/dismiss", requireAdmin, async (c) => {
  const body = await c.req.json<{ ids: number[] }>();
  if (!Array.isArray(body.ids) || body.ids.length === 0) return c.json({ error: "ids is required" }, 400);
  await query(`UPDATE faq_unanswered_log SET dismissed = true, reviewed_at = now() WHERE id = ANY($1)`, [body.ids]);
  return c.json({ ok: true });
});

knowledgeBase.get("/candidates", requireAdmin, async (c) => {
  // Confident answers that used real code/data search and were never
  // cached (faqAgent.ts only caches confident, non-follow-up, non-data
  // answers) — today these vanish the moment they're sent, even though
  // they're real, good answers worth turning into permanent knowledge.
  const rows = await query<{ id: number; question: string; answer: string; sources: any; created_at: string; user_name: string | null; user_email: string | null }>(
    `SELECT i.id, i.question, i.answer, i.sources, i.created_at, u.name AS user_name, u.email AS user_email
     FROM odin_interactions i LEFT JOIN users u ON u.id = i.user_id
     WHERE i.agent='faq' AND i.confident = true AND i.cache_hit = false AND (i.used_code = true OR i.used_data = true)
     ORDER BY i.created_at DESC LIMIT 100`
  );
  return c.json({
    candidates: rows.map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      sources: r.sources,
      createdAt: r.created_at,
      askedBy: r.user_name || r.user_email,
    })),
  });
});

knowledgeBase.get("/entries", async (c) => {
  const rows = await query<{ id: string; category: string; question: string; answer: string; status: string }>(
    `SELECT id, category, question, answer, status FROM faq_entries WHERE status != 'archived' ORDER BY category, question`
  );
  return c.json({ entries: rows });
});

knowledgeBase.get("/stats", requireAdmin, async (c) => {
  const [totals, confidentRate, feedbackBreakdown, topGaps] = await Promise.all([
    queryOne<{ count: string }>(`SELECT count(*) FROM odin_interactions`),
    queryOne<{ rate: string }>(`SELECT round(100.0 * count(*) FILTER (WHERE confident) / greatest(count(*), 1), 1) AS rate FROM odin_interactions`),
    query<{ rating: string; count: string }>(`SELECT rating, count(*) FROM faq_feedback GROUP BY rating`),
    query<{ question: string; created_at: string }>(`SELECT question, created_at FROM faq_unanswered_log WHERE dismissed = false ORDER BY created_at DESC LIMIT 5`),
  ]);
  return c.json({
    totalInteractions: Number(totals?.count ?? 0),
    confidentRatePct: Number(confidentRate?.rate ?? 0),
    feedback: feedbackBreakdown.reduce((acc, r) => ({ ...acc, [r.rating]: Number(r.count) }), {} as Record<string, number>),
    recentGaps: topGaps,
  });
});

knowledgeBase.post("/promote", requireAdmin, async (c) => {
  const body = await c.req.json<{ question: string; category: string; answer: string; gapIds?: number[] }>();
  if (!body.question?.trim() || !body.category?.trim() || !body.answer?.trim()) {
    return c.json({ error: "question, category, and answer are required" }, 400);
  }

  const id = slugify(body.question);
  await query(
    // faq_entries has a unique index on lower(question) — promoting a
    // question that already has an entry (e.g. the same gap promoted
    // twice) updates that entry instead of erroring.
    `INSERT INTO faq_entries (id, category, question, answer, status) VALUES ($1, $2, $3, $4, 'active')
     ON CONFLICT (lower(question)) DO UPDATE
       SET category = EXCLUDED.category, answer = EXCLUDED.answer, status = 'active', updated_at = now()`,
    [id, body.category, body.question.trim(), body.answer.trim()]
  );
  // Promoting a FAQ entry makes the old cached/logged answer stale — clear
  // any cache row for this exact question so the next ask uses the new
  // curated entry instead of a stale cached response.
  await query(`DELETE FROM faq_answer_cache WHERE question_norm = $1`, [body.question.trim().toLowerCase().replace(/\s+/g, " ")]);

  if (body.gapIds?.length) {
    await query(`UPDATE faq_unanswered_log SET dismissed = true, reviewed_at = now() WHERE id = ANY($1)`, [body.gapIds]);
  }

  return c.json({ ok: true, id });
});
