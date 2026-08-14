// Extracts text from an uploaded knowledge document, chunks it, embeds each
// chunk, and stores the result in document_chunks — the pipeline that makes
// an uploaded document actually searchable by ODIN's search_documents tool
// (server/routes/faqAgent.ts). Triggered fire-and-forget right after an
// admin/super_admin upload, or after an admin approves a pending upload
// (server/routes/knowledgeDocuments.ts) — never awaited from a request
// handler, so a slow/failed extraction can't hang the HTTP response.
import { createHash } from "node:crypto";
import mammoth from "mammoth";
import { query, queryOne } from "../db";
import { getObjectBuffer } from "../s3";
import { embedTexts } from "../utils/embeddings";
import { chunkText } from "../utils/chunkText";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// Voyage's embeddings endpoint accepts at most 128 inputs per call — batch
// larger chunk sets rather than assuming any one document stays under that.
const EMBED_BATCH_SIZE = 128;

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return buffer.toString("utf-8");
  }
  if (mimeType === "application/pdf") {
    // pdf-parse v2's API is class-based (PDFParse), not the old v1
    // default-function-call shape — destroy() releases the parsed doc.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  if (mimeType === DOCX_MIME) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new Error(`Unsupported mime type for extraction: ${mimeType}`);
}

export async function processDocument(documentId: string): Promise<void> {
  const doc = await queryOne<{ s3_key: string; mime_type: string }>(
    `SELECT s3_key, mime_type FROM knowledge_documents WHERE id = $1`,
    [documentId]
  );
  if (!doc) throw new Error(`knowledge_documents row not found: ${documentId}`);

  const buffer = await getObjectBuffer(doc.s3_key);
  const text = await extractText(buffer, doc.mime_type);
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    console.warn(`[processDocument] ${documentId}: no extractable text, leaving zero chunks`);
    return;
  }

  const embeddings: (number[] | null)[] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    embeddings.push(...(await embedTexts(batch)));
  }

  // Delete-and-reinsert rather than diffing — chunks have no stable external
  // identity (only document_id + chunk_index, which shifts if the chunker
  // ever changes), so this is simpler and correct for v1's reprocessing needs.
  await query(`DELETE FROM document_chunks WHERE document_id = $1`, [documentId]);

  let stored = 0;
  for (let i = 0; i < chunks.length; i++) {
    const embedding = embeddings[i];
    if (!embedding) continue; // Voyage not configured, or this chunk's embed call failed — skip, don't fail the whole document
    await query(
      `INSERT INTO document_chunks (document_id, chunk_index, content, content_hash, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)`,
      [documentId, i, chunks[i], hashContent(chunks[i]), `[${embedding.join(",")}]`]
    );
    stored++;
  }
  console.log(`[processDocument] ${documentId}: stored ${stored}/${chunks.length} chunks`);
}

// Fire-and-forget wrapper — callers trigger processing without awaiting,
// same pattern as embedNoteAsync (server/notes/embedNote.ts).
export function processDocumentAsync(documentId: string): void {
  void processDocument(documentId).catch((e) => console.error("[processDocument] failed:", e));
}
