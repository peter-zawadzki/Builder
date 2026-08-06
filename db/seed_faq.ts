// Seeds/refreshes faq_entries from the curated source file. faqData.ts stays
// the single source of truth for FAQ content (the resource-center list UI
// reads it directly); this just mirrors it into Postgres so the FAQ agent can
// query it like any other table. Re-run any time faqData.ts changes.
import "./../server/env";
import { pool } from "../server/db";
import { FAQ_ENTRIES } from "../src/app/data/faqData";

// FAQs whose answer text says something isn't fully live yet — flagged so the
// agent hedges ("currently rolling out") instead of stating it as settled fact.
const ROLLING_OUT_IDS = new Set(["timing-integrations", "tech-support"]);

async function main() {
  const seen = new Set<string>();
  for (const entry of FAQ_ENTRIES) {
    const key = entry.question.trim().toLowerCase();
    if (seen.has(key)) {
      console.warn(`skip duplicate question: "${entry.question}"`);
      continue;
    }
    seen.add(key);

    await pool.query(
      `INSERT INTO faq_entries (id, category, question, answer, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET category = EXCLUDED.category,
             question = EXCLUDED.question,
             answer = EXCLUDED.answer,
             status = EXCLUDED.status,
             updated_at = now()`,
      [
        entry.id,
        entry.category,
        entry.question,
        entry.answer,
        ROLLING_OUT_IDS.has(entry.id) ? "rolling_out" : "active",
      ]
    );
  }
  // FAQ content changed — cached chat answers referencing the old text would
  // otherwise linger for up to CACHE_TTL_HOURS (see faqAgent.ts).
  await pool.query(`TRUNCATE faq_answer_cache`);
  console.log(`seeded ${seen.size} FAQ entries. Cleared cached answers.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
