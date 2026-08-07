// Basic keyword-overlap duplicate detection for bug reports — compares a
// new report against existing ones on the same platform. See
// server/utils/similarity.ts for the shared scoring implementation.
import { query } from "../db";
import { tokenSet, overlapScore } from "../utils/similarity";

const SIMILARITY_THRESHOLD = 0.6; // fraction of the new report's tokens that must appear in a candidate

export interface SimilarSubmission {
  id: string;
  summary: string;
  createdAt: string;
}

export async function findSimilarSubmission(platform: string, summary: string, detailsText: string): Promise<SimilarSubmission | null> {
  const tokens = tokenSet(`${summary} ${detailsText}`);
  if (tokens.size === 0) return null;

  const candidates = await query<{ id: string; summary: string; details: any; created_at: string }>(
    `SELECT id, summary, details, created_at FROM feedback_submissions WHERE type='bug' AND platform=$1 ORDER BY created_at DESC LIMIT 100`,
    [platform]
  );

  let best: { row: (typeof candidates)[number]; score: number } | null = null;
  for (const row of candidates) {
    const candidateText = `${row.summary} ${Object.values(row.details ?? {}).join(" ")}`;
    const score = overlapScore(tokens, tokenSet(candidateText));
    if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) best = { row, score };
  }

  if (!best) return null;
  return { id: best.row.id, summary: best.row.summary, createdAt: best.row.created_at };
}
