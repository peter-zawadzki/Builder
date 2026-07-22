import { Hono } from "hono";
import { queryOne } from "../db";
import { upsert, insertActivity, getContactByEmail, pushMountainActivity } from "./legacy";

// Public — no Clerk session, same pattern as proposalPublicSign.ts. The
// customer reaches this from the "Review & Sign Customer Agreement" link
// after signing their proposal; the token is the only credential.
export const agreementPublicSign = new Hono();

async function findAgreementByToken(token: string) {
  return queryOne<{ id: string; data: any }>(
    `SELECT id, data FROM legacy_records WHERE collection = 'customer-agreements' AND data->>'signToken' = $1`,
    [token]
  );
}

// Same outstanding-items checks as proposalPublicSign.ts, duplicated here
// (rather than imported) since this page needs them for its own progress
// bar and the two public routers are intentionally kept independent.
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

async function getPreferredInstallWindows(mountainId: string): Promise<any[]> {
  const row = await queryOne<{ data: any }>(
    `SELECT data FROM legacy_records WHERE collection = 'mountains' AND id = $1`,
    [mountainId]
  );
  return Array.isArray(row?.data?.preferredInstallWindows) ? row.data.preferredInstallWindows : [];
}

// The admin-editable raw agreement template (Super Admin "edit the entire
// raw content" feature) — plain boilerplate text, not sensitive, so this is
// safe to expose without a token. The customer-facing sign page has no
// Clerk session and can't hit the authenticated /api/legacy/agreement-template
// route, so it reads the same underlying value through here instead.
agreementPublicSign.get("/template", async (c) => {
  const row = await queryOne<{ data: any }>(
    `SELECT data FROM legacy_records WHERE collection = 'agreement-template' AND id = '__all__'`
  );
  return c.json({ agreementTemplate: typeof row?.data === "string" ? row.data : null });
});

// Lets the proposal-signing page auto-create (or find the existing) Customer
// Agreement for this mountain right after the customer signs the proposal —
// same "guided straight into the next document" flow the CA template
// describes, without requiring the customer to have a Clerk session.
agreementPublicSign.get("/by-mountain/:mountainId", async (c) => {
  const mountainId = c.req.param("mountainId");
  const row = await queryOne<{ id: string; data: any }>(
    `SELECT id, data FROM legacy_records WHERE collection = 'customer-agreements' AND data->>'mountainId' = $1 AND (data->>'archived' IS DISTINCT FROM 'true') ORDER BY updated_at DESC LIMIT 1`,
    [mountainId]
  );
  if (!row) return c.json({ token: null });
  const signed = !!(row.data.clientSignature && row.data.yullrSignature);
  return c.json({ token: row.data.signToken ?? null, signed });
});

agreementPublicSign.post("/create-for-mountain", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { mountainId, formData } = body as { mountainId?: string; formData?: Record<string, unknown> };
  if (!mountainId) return c.json({ error: "mountainId is required" }, 400);

  const existing = await queryOne<{ id: string; data: any }>(
    `SELECT id, data FROM legacy_records WHERE collection = 'customer-agreements' AND data->>'mountainId' = $1 AND (data->>'archived' IS DISTINCT FROM 'true') ORDER BY updated_at DESC LIMIT 1`,
    [mountainId]
  );
  if (existing) return c.json({ token: existing.data.signToken ?? null });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const agreement = { id, mountainId, formData: formData || {}, signToken: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await upsert("customer-agreements", id, agreement);
  return c.json({ token: agreement.signToken });
});

agreementPublicSign.get("/:token", async (c) => {
  const row = await findAgreementByToken(c.req.param("token"));
  if (!row) return c.json({ error: "Not found" }, 404);
  const { id, data } = row;
  const mountainId = data.mountainId as string | undefined;

  // Progress-bar status — same "Sign Proposal / Technical Contact / Install
  // Preferences" steps shown on the proposal signing page, carried over here
  // so the customer sees consistent progress across both public pages.
  const [technicalContactCount, preferredInstallWindows] = mountainId
    ? await Promise.all([countTechnicalContacts(mountainId), getPreferredInstallWindows(mountainId)])
    : [0, []];

  return c.json({
    agreement: {
      id,
      mountainId: data.mountainId,
      formData: data.formData,
      clientSignature: data.clientSignature ?? null,
      yullrSignature: data.yullrSignature ?? null,
    },
    hasTechnicalContact: technicalContactCount > 0,
    hasPreferredInstallWindows: preferredInstallWindows.length > 0,
  });
});

agreementPublicSign.post("/:token/client", async (c) => {
  const row = await findAgreementByToken(c.req.param("token"));
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.data.clientSignature) return c.json({ error: "Already signed" }, 409);

  const body = await c.req.json().catch(() => ({}));
  const { name, title, signatureImage, formData } = body as {
    name?: string; title?: string; signatureImage?: string; formData?: Record<string, unknown>;
  };
  if (!name) return c.json({ error: "Name is required" }, 400);

  const clientSignature = { name, title: title || null, signatureImage: signatureImage || null, signedAt: new Date().toISOString() };
  const mergedFormData = { ...(row.data.formData || {}), ...(formData || {}) };
  const agreement = { ...row.data, formData: mergedFormData, clientSignature };
  await upsert("customer-agreements", row.id, agreement);

  // Same countersign-task pattern as the proposal public sign route.
  const peter = await getContactByEmail("peter@yullr.com");
  const mountainId = agreement.mountainId as string | undefined;
  if (peter && mountainId) {
    await pushMountainActivity(mountainId, {
      id: crypto.randomUUID(),
      text: `Customer signed the Customer Agreement — countersign it to finish.`,
      type: "action",
      createdAt: new Date().toISOString(),
      assigneeContactId: peter.id,
      assigneeName: peter.data.name || "Peter Zawadzki",
      authorName: "YULLR",
    });
    await insertActivity({
      mountainId,
      type: "action_added",
      summary: `${peter.data.name || "Peter Zawadzki"} you have been assigned a task: countersign the Customer Agreement`,
      path: `/mountains/${mountainId}/agreement`,
      tagged: true,
      actor: "YULLR System",
    });
  }

  return c.json({ ok: true });
});
