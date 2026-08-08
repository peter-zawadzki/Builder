// Pulls everything the daily digest needs in one pass — all mountains,
// projects, mountain-level notes, proposals, and contacts — and groups it
// by the assignee/owner's `contacts` id. run.ts then resolves each `users`
// row to its matching contact (by email) and looks up its bucket here,
// rather than issuing a separate query per staff member.
import { query } from "../db";
import { isProjectStale, isProposalStale } from "./staleDetection";

export interface DigestActionItem {
  kind: "action" | "note" | "project";
  mountainId: string | null;
  mountainName: string;
  projectId?: string; // set when this item lives on a project (or is one) — links via ?openProject=
  itemId: string; // the activity/note/project's own id — links via ?highlightActivity=/?highlightNote=
  text: string;
  createdAt: string;
}

export interface DigestStaleItem {
  kind: "project" | "proposal";
  mountainId: string | null;
  mountainName: string;
  projectId?: string; // set when kind === 'project', for the ?openProject= link
  name: string;
  sinceDate: string;
}

export interface UserDigestItems {
  outstandingActions: DigestActionItem[];
  newItems: DigestActionItem[]; // new notes assigned + new projects you now own
  staleItems: DigestStaleItem[];
}

export interface DigestData {
  byContact: Map<string, UserDigestItems>;
  contactIdByEmail: Map<string, string>;
}

function emptyBucket(): UserDigestItems {
  return { outstandingActions: [], newItems: [], staleItems: [] };
}

// Mountains and projects both carry an embedded `activities: ContactActivity[]`
// list (notes/action items assignable to a YULLR-org contact) — same shape,
// same filter logic, just a different parent record for attribution.
// `projectId` is only set when scanning a project's own activities — it
// drives the digest email's deep link (open that project directly), since
// getMountainRollupActivities (client-side) surfaces project-origin actions
// in the same mountain-wide Status rollup as mountain-level ones, but
// mountain.activities items have no project to open instead.
function scanActivities(
  activities: any[] | undefined,
  mountainId: string | null,
  mountainName: string,
  projectId: string | undefined,
  sinceIso: string,
  bucket: (contactId: string) => UserDigestItems
) {
  for (const activity of activities ?? []) {
    if (activity.archived || !activity.assigneeContactId) continue;
    if (activity.type === "action" && !activity.completed) {
      bucket(activity.assigneeContactId).outstandingActions.push({
        kind: "action", mountainId, mountainName, projectId, itemId: activity.id, text: activity.text, createdAt: activity.createdAt,
      });
    } else if (activity.type === "note" && activity.createdAt >= sinceIso) {
      bucket(activity.assigneeContactId).newItems.push({
        kind: "note", mountainId, mountainName, projectId, itemId: activity.id, text: activity.text, createdAt: activity.createdAt,
      });
    }
  }
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

  for (const row of mountains) {
    scanActivities(row.data.activities, row.id, row.data.name ?? "Unknown mountain", undefined, sinceIso, bucket);
  }

  for (const row of projects) {
    const project = row.data;
    const mountainId: string | null = project.mountainId ?? null;
    const mountainName = mountainId ? mountainNameById.get(mountainId) ?? "Unknown mountain" : "Team project";

    scanActivities(project.activities, mountainId, mountainName, row.id, sinceIso, bucket);

    if (project.ownerContactId && project.createdAt >= sinceIso) {
      bucket(project.ownerContactId).newItems.push({
        kind: "project", mountainId, mountainName, projectId: row.id, itemId: row.id, text: `New project: "${project.name}"`, createdAt: project.createdAt,
      });
    }

    if (project.ownerContactId && isProjectStale(project)) {
      bucket(project.ownerContactId).staleItems.push({
        kind: "project", mountainId, mountainName, projectId: row.id, name: project.name, sinceDate: project.updatedAt,
      });
    }
  }

  for (const row of notesRows) {
    const note = row.data;
    if (note.archived || !note.assigneeContactId || note.createdAt < sinceIso) continue;
    const mountainName = mountainNameById.get(note.mountainId) ?? "Unknown mountain";
    bucket(note.assigneeContactId).newItems.push({
      kind: "note", mountainId: note.mountainId ?? null, mountainName, itemId: note.id, text: note.text, createdAt: note.createdAt,
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
