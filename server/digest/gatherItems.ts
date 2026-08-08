// Pulls everything the daily digest needs in one pass — all projects,
// mountain-level notes, proposals, mountains, and contacts — and groups it
// by the assignee/owner's `contacts` id. run.ts then resolves each `users`
// row to its matching contact (by email) and looks up its bucket here,
// rather than issuing a separate query per staff member.
import { query } from "../db";
import { isProjectStale, isProposalStale } from "./staleDetection";

export interface DigestActionItem {
  kind: "action" | "note";
  mountainId: string | null;
  mountainName: string;
  text: string;
  createdAt: string;
}

export interface DigestStaleItem {
  kind: "project" | "proposal";
  mountainId: string | null;
  mountainName: string;
  name: string;
  sinceDate: string;
}

export interface UserDigestItems {
  outstandingActions: DigestActionItem[];
  newNotes: DigestActionItem[];
  staleItems: DigestStaleItem[];
}

export interface DigestData {
  byContact: Map<string, UserDigestItems>;
  contactIdByEmail: Map<string, string>;
}

function emptyBucket(): UserDigestItems {
  return { outstandingActions: [], newNotes: [], staleItems: [] };
}

export async function loadDigestData(sinceIso: string): Promise<DigestData> {
  const [mountains, projects, notesRows, proposals, contacts] = await Promise.all([
    query<{ id: string; data: any }>(`SELECT id, data FROM legacy_records WHERE collection='mountains'`),
    query<{ id: string; data: any }>(`SELECT id, data FROM legacy_records WHERE collection='projects'`),
    query<{ id: string; data: any }>(`SELECT id, data FROM legacy_records WHERE collection='notes'`),
    query<{ id: string; data: any }>(`SELECT id, data FROM legacy_records WHERE collection='proposals'`),
    query<{ id: string; data: any }>(`SELECT id, data FROM legacy_records WHERE collection='contacts'`),
  ]);

  const mountainNameById = new Map(mountains.map((m) => [m.id, m.data?.name ?? "Unknown mountain"]));
  const contactIdByEmail = new Map<string, string>();
  for (const c of contacts) {
    const email = (c.data?.email ?? "").toLowerCase();
    if (email) contactIdByEmail.set(email, c.id);
  }

  const byContact = new Map<string, UserDigestItems>();
  function bucket(contactId: string): UserDigestItems {
    if (!byContact.has(contactId)) byContact.set(contactId, emptyBucket());
    return byContact.get(contactId)!;
  }

  for (const row of projects) {
    const project = row.data;
    const mountainId: string | null = project.mountainId ?? null;
    const mountainName = mountainId ? mountainNameById.get(mountainId) ?? "Unknown mountain" : "Team project";

    for (const activity of project.activities ?? []) {
      if (activity.archived || !activity.assigneeContactId) continue;
      if (activity.type === "action" && !activity.completed) {
        bucket(activity.assigneeContactId).outstandingActions.push({
          kind: "action", mountainId, mountainName, text: activity.text, createdAt: activity.createdAt,
        });
      } else if (activity.type === "note" && activity.createdAt >= sinceIso) {
        bucket(activity.assigneeContactId).newNotes.push({
          kind: "note", mountainId, mountainName, text: activity.text, createdAt: activity.createdAt,
        });
      }
    }

    if (project.ownerContactId && isProjectStale(project)) {
      bucket(project.ownerContactId).staleItems.push({
        kind: "project", mountainId, mountainName, name: project.name, sinceDate: project.updatedAt,
      });
    }
  }

  for (const row of notesRows) {
    const note = row.data;
    if (note.archived || !note.assigneeContactId || note.createdAt < sinceIso) continue;
    const mountainName = mountainNameById.get(note.mountainId) ?? "Unknown mountain";
    bucket(note.assigneeContactId).newNotes.push({
      kind: "note", mountainId: note.mountainId ?? null, mountainName, text: note.text, createdAt: note.createdAt,
    });
  }

  for (const row of proposals) {
    const proposal = row.data;
    if (!proposal.createdByEmail || !isProposalStale(proposal)) continue;
    const contactId = contactIdByEmail.get(proposal.createdByEmail.toLowerCase());
    if (!contactId) continue;
    const mountainName = mountainNameById.get(proposal.mountainId) ?? "Unknown mountain";
    bucket(contactId).staleItems.push({
      kind: "proposal", mountainId: proposal.mountainId ?? null, mountainName,
      name: proposal.title || "Proposal", sinceDate: proposal.sentAt || proposal.createdAt,
    });
  }

  return { byContact, contactIdByEmail };
}

export function getUserDigestItems(data: DigestData, email: string): UserDigestItems {
  const contactId = data.contactIdByEmail.get(email.toLowerCase());
  if (!contactId) return emptyBucket();
  return data.byContact.get(contactId) ?? emptyBucket();
}
