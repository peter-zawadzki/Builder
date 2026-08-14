// Splits extracted document text into embeddable pieces for
// server/knowledge/processDocument.ts. Paragraph-aware: packs whole
// paragraphs together up to chunkSize, only falling back to a hard
// sentence-boundary split for a single paragraph that's too long on its
// own (e.g. a wall-of-text transcript with no paragraph breaks). Carries
// the tail of a chunk forward as overlap only across a hard split, since
// naturally-packed paragraphs already share full context with neighbors.
export interface ChunkTextOptions {
  chunkSize?: number;
  overlap?: number;
}

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 150;

export function chunkText(text: string, opts: ChunkTextOptions = {}): string[] {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = "";
  };

  for (const paragraph of paragraphs) {
    const pieces = paragraph.length > chunkSize ? splitLongParagraph(paragraph, chunkSize) : [paragraph];
    for (const piece of pieces) {
      const candidate = current ? `${current}\n\n${piece}` : piece;
      if (candidate.length <= chunkSize || !current) {
        current = candidate;
      } else {
        // Adding this piece would overflow — close out the current chunk
        // and carry its tail forward as overlap before starting the next.
        const tail = current.slice(-overlap).trim();
        flush();
        current = tail ? `${tail}\n\n${piece}` : piece;
      }
    }
  }
  flush();

  return chunks;
}

// A single paragraph longer than chunkSize (no natural break) — split on
// sentence boundaries instead, carrying overlap between pieces the same way.
function splitLongParagraph(paragraph: string, chunkSize: number): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+/).filter(Boolean);
  const pieces: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= chunkSize || !current) {
      current = candidate;
    } else {
      pieces.push(current);
      current = sentence;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}
