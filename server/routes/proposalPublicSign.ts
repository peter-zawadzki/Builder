import { Hono } from "hono";
import { queryOne } from "../db";
import { upsert, insertActivity, getContactByEmail, pushMountainActivity } from "./legacy";

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
    await insertActivity({
      mountainId,
      type: "action_added",
      summary: `${peter.data.name || "Peter Zawadzki"} you have been assigned a task: countersign the "${proposal.title || "Proposal"}" proposal`,
      path: `/mountains/${mountainId}/proposal/${row.id}`,
      tagged: true,
      actor: "YULLR System",
    });
  }

  return c.json({ ok: true });
});
