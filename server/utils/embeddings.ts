// Thin Voyage AI wrapper for the notes semantic-search/RAG pipeline.
// Anthropic doesn't offer an embeddings endpoint itself — Voyage AI is
// Anthropic's recommended embeddings partner, hence the separate API key
// (VOYAGE_API_KEY) alongside ANTHROPIC_API_KEY/POSTMARK_API_KEY/etc.
const MODEL = "voyage-3"; // 1024-dim — matches note_embeddings.embedding's vector(1024)
export const EMBEDDING_DIMENSIONS = 1024;

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    console.warn("VOYAGE_API_KEY not configured — skipping embed");
    return null;
  }
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: text, model: MODEL }),
    });
    if (!res.ok) {
      console.error("Voyage embed failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = await res.json();
    return json.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error("Voyage embed error:", e);
    return null;
  }
}

// Voyage accepts up to 128 inputs per call — used by the backfill script to
// avoid one HTTP round-trip per note.
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey || texts.length === 0) return texts.map(() => null);
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: texts, model: MODEL }),
    });
    if (!res.ok) {
      console.error("Voyage batch embed failed:", res.status, await res.text().catch(() => ""));
      return texts.map(() => null);
    }
    const json = await res.json();
    const byIndex = new Map<number, number[]>((json.data ?? []).map((d: any) => [d.index, d.embedding]));
    return texts.map((_, i) => byIndex.get(i) ?? null);
  } catch (e) {
    console.error("Voyage batch embed error:", e);
    return texts.map(() => null);
  }
}

// pgvector's `vector` type is passed as this literal string format over the
// wire ("[0.1,0.2,...]") — `pg` has no native JS-array-to-vector binding.
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
