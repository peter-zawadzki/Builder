// Given a reference to a note (either a MountainNote or a ContactActivity
// embedded on one of six different entity types), finds who originally
// wrote it — needed so a reply can notify the right person.
import { queryOne } from "../db";

export interface NoteRef {
  noteSource: "mountain_note" | "activity";
  noteId: string;
  originCollection?: string;
  originId?: string;
}

export interface OriginalPoster {
  authorContactId: string | null;
  authorName: string | null;
}

export async function resolveOriginalPoster(ref: NoteRef): Promise<OriginalPoster> {
  if (ref.noteSource === "mountain_note") {
    const row = await queryOne<{ data: any }>(
      `SELECT data FROM legacy_records WHERE collection='notes' AND id=$1`,
      [ref.noteId]
    );
    return { authorContactId: row?.data?.authorContactId ?? null, authorName: row?.data?.authorName ?? null };
  }

  if (!ref.originCollection || !ref.originId) return { authorContactId: null, authorName: null };
  const row = await queryOne<{ data: any }>(
    `SELECT data FROM legacy_records WHERE collection=$1 AND id=$2`,
    [ref.originCollection, ref.originId]
  );
  const activity = (row?.data?.activities ?? []).find((a: any) => a.id === ref.noteId);
  return { authorContactId: activity?.authorContactId ?? null, authorName: activity?.authorName ?? null };
}

// The mountainId a note reference actually lives under — needed to build
// the notification bell's deep link (/mountains/{id}?highlight...). Returns
// null for origins with no single mountain (teams/organizations can span
// several) or a team project.
export async function resolveMountainId(ref: NoteRef): Promise<string | null> {
  if (ref.noteSource === "mountain_note") {
    const row = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='notes' AND id=$1`, [ref.noteId]);
    return row?.data?.mountainId ?? null;
  }
  if (ref.originCollection === "mountains") return ref.originId ?? null;
  if (ref.originCollection === "projects" || ref.originCollection === "contacts") {
    if (!ref.originId) return null;
    const row = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection=$1 AND id=$2`, [ref.originCollection, ref.originId]);
    return row?.data?.mountainId ?? null;
  }
  return null;
}

// The reverse lookup replies.ts also needs: given a note reference, the
// actual note/activity's own text (for embedding, and for the notification
// text shown to the original poster).
export async function resolveNoteText(ref: NoteRef): Promise<string | null> {
  if (ref.noteSource === "mountain_note") {
    const row = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='notes' AND id=$1`, [ref.noteId]);
    return row?.data?.text ?? null;
  }
  if (!ref.originCollection || !ref.originId) return null;
  const row = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection=$1 AND id=$2`, [ref.originCollection, ref.originId]);
  const activity = (row?.data?.activities ?? []).find((a: any) => a.id === ref.noteId);
  return activity?.text ?? null;
}
