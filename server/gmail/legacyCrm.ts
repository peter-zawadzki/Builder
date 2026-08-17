// The live CRM's contacts (and their notes/action items) are NOT the
// normalized `contacts`/`notes` SQL tables — those exist but nothing in the
// frontend reads them. The real data lives in `legacy_records`
// (collection='contacts'), with each contact's notes/action items embedded
// directly in its own JSON as an `activities` array (see ContactActivity in
// src/app/context/DataContext.tsx). This module is the server-side
// equivalent of that shape for the Gmail sync to read/write.
import { query } from "../db";
import { insertActivity } from "../routes/legacy";

export interface LegacyContact {
  id: string;
  name: string;
  email: string;
  mountainId: string | null;
  organizationId: string | null;
}

interface LegacyContactRow {
  id: string;
  name?: string;
  email?: string;
  mountainId?: string;
  organizationId?: string;
}

// Loaded once per run (not per message) — the contact list doesn't change
// mid-run and this avoids a query per email.
export async function loadLegacyContacts(): Promise<LegacyContact[]> {
  const rows = await query<{ data: LegacyContactRow }>(`SELECT data FROM legacy_records WHERE collection = 'contacts'`);
  return rows
    .map((r) => r.data)
    .filter((d) => !!d.email)
    .map((d) => ({
      id: d.id,
      name: d.name ?? d.email!,
      email: d.email!.toLowerCase(),
      mountainId: d.mountainId ?? null,
      organizationId: d.organizationId ?? null,
    }));
}

export function contactsByEmail(contacts: LegacyContact[]): Map<string, LegacyContact> {
  return new Map(contacts.map((c) => [c.email, c]));
}

// Every note/action item this sync creates is attributed to "Odin" as the
// author — the real employee is still the assignee (assigneeContactId
// keeps pointing at their actual contact record, so they can still
// complete/edit it), but the display name should make it obvious this was
// generated automatically, not typed by that person.
export const AUTOMATED_AUTHOR_NAME = "Odin";

export interface NewActivityEntry {
  id: string;
  text: string;
  type: "note" | "action";
  createdAt: string;
  authorContactId?: string;
  authorName?: string;
  assigneeContactId?: string;
  assigneeName?: string;
}

// Atomically appends entries into the contact's `activities` array — a
// single UPDATE with jsonb concatenation, not a read-modify-write, so
// multiple messages resolving to the same contact within a run (or a
// concurrent manual edit in the UI) can't clobber each other.
export async function appendContactActivities(contactId: string, entries: NewActivityEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await query(
    `UPDATE legacy_records
     SET data = jsonb_set(data, '{activities}', COALESCE(data->'activities', '[]'::jsonb) || $2::jsonb, true),
         updated_at = now()
     WHERE collection = 'contacts' AND id = $1`,
    [contactId, JSON.stringify(entries)]
  );
}

const KIND_LABEL: Record<NewActivityEntry["type"], string> = { note: "note", action: "action item" };
const KIND_ARTICLE: Record<NewActivityEntry["type"], string> = { note: "a", action: "an" };

// Mirrors buildActivitySummaries' plain-text branch in
// src/app/context/DataContext.tsx (no Slack @mention resolution
// server-side — insertActivity's mirrorToSlack falls back to plain names
// same as the client does for contacts with no slackUserId on file).
function activitySummary(entry: NewActivityEntry): string {
  const kind = KIND_LABEL[entry.type];
  const article = KIND_ARTICLE[entry.type];
  if (entry.assigneeContactId) {
    const name = entry.assigneeName || "Someone";
    return `${name} you have been assigned ${article} ${kind} "${entry.text}"`;
  }
  return `New ${kind}: "${entry.text}"`;
}

// Posts the matching Updates-feed entry for a contact activity — same
// `activity` collection + Slack mirror the UI's logActivity() triggers when
// a person adds a note/action item through the CRM, so email-derived
// activity shows up in the mountain's Updates feed too (not just on the
// contact) for the visibility Peter asked for.
export async function logContactActivity(contact: LegacyContact, entry: NewActivityEntry): Promise<void> {
  await insertActivity({
    mountainId: contact.mountainId,
    type: entry.type === "note" ? "note_added" : "action_added",
    summary: activitySummary(entry),
    path: contact.mountainId ? `/mountains/${contact.mountainId}` : `/crm?tab=contacts&open=${contact.id}`,
    tagged: !!entry.assigneeContactId,
    actor: entry.authorName || AUTOMATED_AUTHOR_NAME,
    actorId: entry.authorContactId ?? null,
    skipSlackMirror: true,
  });
}
