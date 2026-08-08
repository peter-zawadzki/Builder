// Keeps note_embeddings in sync with actual note/activity/reply content.
// Called fire-and-forget (same pattern as mirrorToSlack in legacy.ts) from
// every write path — skips the real embedding call entirely if the text
// hasn't actually changed since last time.
import { createHash } from "node:crypto";
import { query, queryOne } from "../db";
import { embedText, toVectorLiteral } from "../utils/embeddings";

export interface EmbedNoteInput {
  noteSource: "mountain_note" | "activity" | "reply";
  noteId: string;
  originCollection?: string | null;
  originId?: string | null;
  mountainId?: string | null;
  content: string;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function upsertNoteEmbedding(input: EmbedNoteInput): Promise<void> {
  const contentHash = hashContent(input.content);
  const existing = await queryOne<{ content_hash: string }>(
    `SELECT content_hash FROM note_embeddings WHERE note_source=$1 AND note_id=$2`,
    [input.noteSource, input.noteId]
  );
  if (existing?.content_hash === contentHash) return; // unchanged — skip the embed call

  const embedding = await embedText(input.content);
  if (!embedding) return; // Voyage not configured, or the call failed — logged already, nothing more to do

  await query(
    `INSERT INTO note_embeddings (note_source, note_id, origin_collection, origin_id, mountain_id, content, content_hash, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
     ON CONFLICT (note_source, note_id) DO UPDATE
       SET origin_collection = EXCLUDED.origin_collection, origin_id = EXCLUDED.origin_id,
           mountain_id = EXCLUDED.mountain_id, content = EXCLUDED.content,
           content_hash = EXCLUDED.content_hash, embedding = EXCLUDED.embedding, updated_at = now()`,
    [
      input.noteSource, input.noteId, input.originCollection ?? null, input.originId ?? null,
      input.mountainId ?? null, input.content, contentHash, toVectorLiteral(embedding),
    ]
  );
}

// Fire-and-forget wrapper — write paths call this without awaiting, same as
// `void mirrorToSlack(rec)` in legacy.ts, so a slow/failed embed never blocks
// the actual note save.
export function embedNoteAsync(input: EmbedNoteInput): void {
  void upsertNoteEmbedding(input).catch((e) => console.error("[embedNote] failed:", e));
}
