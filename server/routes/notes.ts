// Replies, reply notifications, and semantic search over notes — the
// backend for the notes-overhaul feature. Reply/notification routes work
// across every note "shape" (MountainNote and ContactActivity embedded on
// six different entity types) via the same note_source/note_id/
// origin_collection/origin_id reference used in server/notes/embedNote.ts.
import { Hono } from "hono";
import type { HonoEnv } from "../auth";
import { query, queryOne } from "../db";
import { resolveOriginalPoster, resolveMountainId, type NoteRef } from "../notes/resolveOriginalPoster";
import { embedNoteAsync } from "../notes/embedNote";
import { embedText, toVectorLiteral } from "../utils/embeddings";

export const notes = new Hono<HonoEnv>();

// Notes/activities are written via the generic legacy_records upsert
// endpoint (server/routes/legacy.ts), not a dedicated route — there's no
// natural server-side hook to detect "a note just changed". The client
// calls this, fire-and-forget, right after any note add/edit succeeds.
notes.post("/embed", async (c) => {
  const body = await c.req.json<{
    noteSource: "mountain_note" | "activity";
    noteId: string;
    originCollection?: string;
    originId?: string;
    mountainId?: string;
    content: string;
  }>().catch(() => null);
  if (!body?.noteId || !body?.noteSource || !body?.content?.trim()) {
    return c.json({ error: "noteSource, noteId, and content are required" }, 400);
  }
  embedNoteAsync(body);
  return c.json({ ok: true });
});

async function resolveUserIdForContact(contactId: string | null): Promise<string | null> {
  if (!contactId) return null;
  const contact = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='contacts' AND id=$1`, [contactId]);
  const email = contact?.data?.email;
  if (!email) return null;
  const user = await queryOne<{ id: string }>(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
  return user?.id ?? null;
}

interface ReplyBody extends NoteRef {
  text: string;
}

notes.post("/replies", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<ReplyBody>().catch(() => null);
  if (!body?.noteId || !body?.noteSource || !body?.text?.trim()) {
    return c.json({ error: "noteSource, noteId, and text are required" }, 400);
  }

  const authorContact = await queryOne<{ id: string }>(`SELECT id FROM legacy_records WHERE collection='contacts' AND lower(data->>'email') = lower($1)`, [user.email ?? ""]);
  const authorContactId = authorContact?.id ?? null;
  const authorName = user.name || user.email || "Someone";

  const reply = await queryOne<{ id: string; created_at: string }>(
    `INSERT INTO note_replies (note_source, note_id, origin_collection, origin_id, author_contact_id, author_name, text)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
    [body.noteSource, body.noteId, body.originCollection ?? null, body.originId ?? null, authorContactId, authorName, body.text.trim()]
  );

  // Notify the original poster — unless they're replying to their own note.
  const poster = await resolveOriginalPoster(body);
  if (poster.authorContactId && poster.authorContactId !== authorContactId) {
    const posterUserId = await resolveUserIdForContact(poster.authorContactId);
    if (posterUserId) {
      const mountainId = await resolveMountainId(body);
      await query(
        `INSERT INTO note_notifications (user_id, kind, note_source, note_id, reply_id, text, origin_collection, origin_id, mountain_id)
         VALUES ($1, 'reply', $2, $3, $4, $5, $6, $7, $8)`,
        [posterUserId, body.noteSource, body.noteId, reply!.id, `${authorName} replied: "${body.text.trim().slice(0, 140)}"`, body.originCollection ?? null, body.originId ?? null, mountainId]
      );
    }
  }

  embedNoteAsync({
    noteSource: "reply",
    noteId: reply!.id,
    originCollection: body.originCollection,
    originId: body.originId,
    content: body.text.trim(),
  });

  return c.json({ id: reply!.id, createdAt: reply!.created_at });
});

notes.get("/replies", async (c) => {
  const noteSource = c.req.query("noteSource");
  const noteId = c.req.query("noteId");
  if (!noteSource || !noteId) return c.json({ error: "noteSource and noteId are required" }, 400);
  const rows = await query<{ id: string; author_name: string; text: string; created_at: string }>(
    `SELECT id, author_name, text, created_at FROM note_replies WHERE note_source=$1 AND note_id=$2 ORDER BY created_at ASC`,
    [noteSource, noteId]
  );
  return c.json({ replies: rows.map((r) => ({ id: r.id, authorName: r.author_name, text: r.text, createdAt: r.created_at })) });
});

// Static path before "/:id" — same lesson as odinVideo.ts.
notes.get("/notifications", async (c) => {
  const user = c.get("user");
  const rows = await query<{
    id: string; note_source: string; note_id: string; text: string; created_at: string;
    origin_collection: string | null; origin_id: string | null; mountain_id: string | null;
  }>(
    `SELECT id, note_source, note_id, text, created_at, origin_collection, origin_id, mountain_id
     FROM note_notifications WHERE user_id=$1 AND read_at IS NULL ORDER BY created_at DESC LIMIT 20`,
    [user.id]
  );
  return c.json({
    notifications: rows.map((r) => ({
      id: r.id, noteSource: r.note_source, noteId: r.note_id, text: r.text, createdAt: r.created_at,
      originCollection: r.origin_collection, originId: r.origin_id, mountainId: r.mountain_id,
    })),
  });
});

notes.post("/notifications/:id/read", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await query(`UPDATE note_notifications SET read_at=now() WHERE id=$1 AND user_id=$2`, [id, user.id]);
  return c.json({ ok: true });
});

notes.get("/search", async (c) => {
  const q = c.req.query("q");
  const mountainId = c.req.query("mountainId");
  if (!q?.trim()) return c.json({ error: "q is required" }, 400);

  const embedding = await embedText(q.trim());
  if (!embedding) return c.json({ error: "Semantic search isn't configured (missing VOYAGE_API_KEY)" }, 503);

  const rows = mountainId
    ? await query<{ note_source: string; note_id: string; origin_collection: string | null; origin_id: string | null; mountain_id: string | null; content: string; distance: number }>(
        `SELECT note_source, note_id, origin_collection, origin_id, mountain_id, content, embedding <=> $1::vector AS distance
         FROM note_embeddings WHERE mountain_id = $2 ORDER BY embedding <=> $1::vector LIMIT 20`,
        [toVectorLiteral(embedding), mountainId]
      )
    : await query<{ note_source: string; note_id: string; origin_collection: string | null; origin_id: string | null; mountain_id: string | null; content: string; distance: number }>(
        `SELECT note_source, note_id, origin_collection, origin_id, mountain_id, content, embedding <=> $1::vector AS distance
         FROM note_embeddings ORDER BY embedding <=> $1::vector LIMIT 20`,
        [toVectorLiteral(embedding)]
      );

  return c.json({
    results: rows.map((r) => ({
      noteSource: r.note_source, noteId: r.note_id, originCollection: r.origin_collection, originId: r.origin_id,
      mountainId: r.mountain_id, content: r.content, score: 1 - r.distance,
    })),
  });
});
