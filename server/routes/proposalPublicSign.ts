import { Hono } from "hono";
import { queryOne } from "../db";
import { upsert, insertActivity, getContactByEmail, pushMountainActivity } from "./legacy";

interface TechnicalContactInput {
  firstName?: string;
  lastName?: string;
  title?: string;
  email?: string;
  phone?: string;
}
interface InstallWindowInput {
  start?: string;
  end?: string;
}

async function countTechnicalContacts(mountainId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*) FROM legacy_records
      WHERE collection = 'contacts'
        AND data->>'mountainId' = $1
        AND (data->>'archived' IS DISTINCT FROM 'true')
        AND data->'tags' ? 'Technical'`,
    [mountainId]
  );
  return row ? parseInt(row.count, 10) : 0;
}

async function getPreferredInstallWindows(mountainId: string): Promise<InstallWindowInput[]> {
  const row = await queryOne<{ data: any }>(
    `SELECT data FROM legacy_records WHERE collection = 'mountains' AND id = $1`,
    [mountainId]
  );
  return Array.isArray(row?.data?.preferredInstallWindows) ? row.data.preferredInstallWindows : [];
}

// Public — no Clerk session. A customer reaches these routes by clicking the
// signing link in their email; the token itself is the only credential. Kept
// as a separate router (mounted without requireAuth in server/index.ts)
// rather than adding to legacy.ts, which is authenticated end to end.
export const proposalPublicSign = new Hono();

async function findProposalByToken(token: string) {
  return queryOne<{ id: string; data: any }>(
    `SELECT id, data FROM legacy_records WHERE collection = 'proposals' AND data->>'signToken' = $1`,
    [token]
  );
}

// Only the fields the signing page actually needs — never the whole app's data.
proposalPublicSign.get("/:token", async (c) => {
  const row = await findProposalByToken(c.req.param("token"));
  if (!row) return c.json({ error: "Not found" }, 404);
  const { id, data } = row;
  const mountainId = data.mountainId as string | undefined;

  // Outstanding-items status (the post-sign Technical Contact & Install
  // Preferences modal) — booleans only, computed server-side, never the
  // actual contact list, since this is a public unauthenticated route.
  const [technicalContactCount, preferredInstallWindows] = mountainId
    ? await Promise.all([countTechnicalContacts(mountainId), getPreferredInstallWindows(mountainId)])
    : [0, []];

  return c.json({
    proposal: {
      id,
      mountainId: data.mountainId,
      title: data.title,
      form: data.form,
      sentAt: data.sentAt,
      sentTo: data.sentTo,
      sentToName: data.sentToName,
      viewedAt: data.viewedAt,
      clientSignature: data.clientSignature ?? null,
      yullrSignature: data.yullrSignature ?? null,
    },
    hasTechnicalContact: technicalContactCount > 0,
    hasPreferredInstallWindows: preferredInstallWindows.length > 0,
  });
});

proposalPublicSign.post("/:token/viewed", async (c) => {
  const row = await findProposalByToken(c.req.param("token"));
  if (!row) return c.json({ error: "Not found" }, 404);
  if (!row.data.viewedAt) {
    await upsert("proposals", row.id, { ...row.data, viewedAt: new Date().toISOString() });
  }
  return c.json({ ok: true });
});

proposalPublicSign.post("/:token/client", async (c) => {
  const row = await findProposalByToken(c.req.param("token"));
  if (!row) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const { name, title, legalEntity, signatureImage } = body as { name?: string; title?: string; legalEntity?: string; signatureImage?: string };
  if (!name) return c.json({ error: "Name is required" }, 400);
  if (row.data.clientSignature) return c.json({ error: "Already signed" }, 409);

  const clientSignature = { name, title: title || null, legalEntity: legalEntity || null, signatureImage: signatureImage || null, signedAt: new Date().toISOString() };
  const proposal = { ...row.data, clientSignature };
  await upsert("proposals", row.id, proposal);

  // Assign a countersign task to Peter, the same way any assigned action item
  // works elsewhere in the app — via a ContactActivity on the mountain, so it
  // shows up in his homepage/notification feed and (being tagged) mirrors to
  // Slack through the normal path.
  const peter = await getContactByEmail("peter@yullr.com");
  const mountainId = proposal.mountainId as string | undefined;
  if (peter && mountainId) {
    await pushMountainActivity(mountainId, {
      id: crypto.randomUUID(),
      text: `Customer signed the "${proposal.title || "Proposal"}" proposal — countersign it to finish.`,
      type: "action",
      createdAt: new Date().toISOString(),
      assigneeContactId: peter.id,
      assigneeName: peter.data.name || "Peter Zawadzki",
      authorName: "YULLR",
    });
    const peterName = peter.data.name || "Peter Zawadzki";
    const peterMention = peter.data.slackUserId ? `<@${peter.data.slackUserId}>` : peterName;
    await insertActivity({
      mountainId,
      type: "action_added",
      summary: `${peterName} you have been assigned a task: countersign the "${proposal.title || "Proposal"}" proposal`,
      slackText: `${peterMention} you have been assigned a task: countersign the "${proposal.title || "Proposal"}" proposal`,
      path: `/mountains/${mountainId}/proposal/${row.id}`,
      tagged: true,
      actor: "YULLR System",
    });
  }

  return c.json({ ok: true });
});

// Post-sign Technical Contact & Install Preferences modal. Runs on the same
// token-only trust model as the rest of this router — creates real CRM
// contact records (mountainId set directly, tagged 'Technical', the first
// one marked isPrimary) and/or saves the mountain's preferred install
// windows. Either piece may be submitted alone (the modal is skippable and
// re-completable later from the same link).
proposalPublicSign.post("/:token/onboarding", async (c) => {
  const row = await findProposalByToken(c.req.param("token"));
  if (!row) return c.json({ error: "Not found" }, 404);
  const mountainId = row.data.mountainId as string | undefined;
  if (!mountainId) return c.json({ error: "Proposal has no associated mountain" }, 400);

  const body = await c.req.json().catch(() => ({}));
  const technicalContacts = Array.isArray(body?.technicalContacts) ? (body.technicalContacts as TechnicalContactInput[]) : [];
  const installWindows = Array.isArray(body?.installWindows) ? (body.installWindows as InstallWindowInput[]) : [];

  let createdCount = 0;
  for (const [i, tc] of technicalContacts.entries()) {
    const firstName = (tc.firstName || "").trim();
    const lastName = (tc.lastName || "").trim();
    const email = (tc.email || "").trim();
    if (!firstName || !lastName || !email) continue; // skip incomplete rows rather than fail the whole submission
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await upsert("contacts", id, {
      id,
      name: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      email,
      phone: (tc.phone || "").trim(),
      title: (tc.title || "").trim() || undefined,
      type: "General",
      tags: ["Technical"],
      isPrimary: i === 0,
      mountainId,
      primaryAssociation: "mountain",
      createdAt: now,
      updatedAt: now,
    });
    createdCount++;
  }

  const cleanWindows = installWindows
    .map(w => ({ start: (w.start || "").trim(), end: (w.end || "").trim() || undefined }))
    .filter(w => !!w.start);
  if (cleanWindows.length > 0) {
    const mountainRow = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection = 'mountains' AND id = $1`, [mountainId]);
    if (mountainRow) {
      const existing = Array.isArray(mountainRow.data.preferredInstallWindows) ? mountainRow.data.preferredInstallWindows : [];
      await upsert("mountains", mountainId, { ...mountainRow.data, preferredInstallWindows: [...existing, ...cleanWindows] });
    }
  }

  if (createdCount > 0 || cleanWindows.length > 0) {
    await insertActivity({
      mountainId,
      type: "update",
      summary: [
        createdCount > 0 ? `${createdCount} technical contact${createdCount !== 1 ? "s" : ""} added` : null,
        cleanWindows.length > 0 ? `${cleanWindows.length} preferred install ${cleanWindows.length !== 1 ? "windows" : "window"} added` : null,
      ].filter(Boolean).join(" · ") + " (via proposal sign link)",
      path: `/mountains/${mountainId}`,
      actor: "Customer",
    });
  }

  return c.json({ ok: true, technicalContactsCreated: createdCount, installWindowsSaved: cleanWindows.length });
});
