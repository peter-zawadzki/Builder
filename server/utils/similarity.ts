// Shared token-overlap similarity scoring — the same basic keyword-match
// idea used by server/utils/codeSearch.ts's ranked search and the FAQ tab's
// own client-side search, extracted here so server/feedback/duplicates.ts
// and server/routes/knowledgeBase.ts's gap-grouping share one implementation
// instead of a third copy. No embeddings/fuzzy matching — deliberately
// simple, matching the "basic keyword match" scope this was designed for.
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "do", "does", "did", "how", "what", "when", "where",
  "why", "on", "in", "of", "for", "to", "and", "or", "it", "this", "that", "was", "were",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

// Fraction of `tokens`' distinct words that also appear in `candidateTokens`
// — directional (asks "how much of THIS is covered by THAT"), matching the
// existing duplicate-detection semantics rather than a symmetric measure.
export function overlapScore(tokens: Set<string>, candidateTokens: Set<string>): number {
  if (tokens.size === 0 || candidateTokens.size === 0) return 0;
  let overlap = 0;
  for (const t of tokens) if (candidateTokens.has(t)) overlap++;
  return overlap / tokens.size;
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}
