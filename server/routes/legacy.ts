import { Hono } from "hono";
import { query, queryOne } from "../db";
import type { HonoEnv } from "../auth";

// Serves the ORIGINAL record shapes from legacy_records, matching the contract
// the existing app's data layer expects. This lets MountainsList and every other
// current screen run on the local DB unchanged and lossless.
export const legacy = new Hono<HonoEnv>();

// Proxy for the UPC lookup — upcitemdb only sends Access-Control-Allow-Origin
// for its own domain, so the browser can't call it directly; the server has
// no such restriction.
legacy.get("/upc-lookup/:upc", async (c) => {
  const upc = c.req.param("upc");
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`);
    const data = await res.json();
    const item = data?.items?.[0];
    return c.json({ brand: item?.brand ?? null, model: item?.model ?? null });
  } catch (e) {
    return c.json({ brand: null, model: null });
  }
});

// collection -> the key the old app expects in the GET response
const ARRAY_KEY: Record<string, string> = {
  mountains: "mountains",
  trails: "trails",
  locations: "locations",
  assets: "assets",
  notes: "notes",
  "site-inspections": "siteInspections",
  projects: "projects",
  proposals: "proposals",
  "customer-agreements": "customerAgreements",
  contacts: "contacts",
  organizations: "organizations",
  teams: "teams",
};
const SINGLETON_KEY: Record<string, string> = {
  options: "options",
  "item-prices": "prices",
  "proposal-terms": "proposalTerms",
  "payment-terms": "defaultPaymentTerms",
  "proposal-template": "proposalTemplate",
  "agreement-template": "agreementTemplate",
};

async function listArray(collection: string) {
  const rows = await query<{ data: any }>(
    `SELECT data FROM legacy_records WHERE collection = $1 ORDER BY updated_at`,
    [collection]
  );
  return rows.map((r) => r.data);
}

export async function upsert(collection: string, id: string, data: any) {
  await query(
    `INSERT INTO legacy_records (collection, id, data, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [collection, id, JSON.stringify(data)]
  );
}

// ── GET list (arrays) ────────────────────────────────────────────────────────
for (const [collection, key] of Object.entries(ARRAY_KEY)) {
  legacy.get(`/${collection}`, async (c) => {
    const items = await listArray(collection);
    return c.json({ [key]: items });
  });
}

// ── GET singletons ───────────────────────────────────────────────────────────
for (const [collection, key] of Object.entries(SINGLETON_KEY)) {
  legacy.get(`/${collection}`, async (c) => {
    const row = await queryOne<{ data: any }>(
      `SELECT data FROM legacy_records WHERE collection = $1 AND id = '__all__'`,
      [collection]
    );
    return c.json({ [key]: row?.data ?? {} });
  });
}

// ── Writes for array collections (create / update / delete + cascade) ─────────
for (const collection of Object.keys(ARRAY_KEY)) {
  // create
  legacy.post(`/${collection}`, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const id = body?.id ?? crypto.randomUUID();
    await upsert(collection, id, { ...body, id });
    return c.json({ ok: true, id });
  });
  // update
  legacy.put(`/${collection}/:id`, async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const existing = await queryOne<{ data: any }>(
      `SELECT data FROM legacy_records WHERE collection = $1 AND id = $2`,
      [collection, id]
    );
    await upsert(collection, id, { ...(existing?.data ?? {}), ...body, id });
    return c.json({ ok: true });
  });
  // delete (+ cascade for mountains/locations)
  legacy.delete(`/${collection}/:id`, async (c) => {
    const id = c.req.param("id");
    await query(`DELETE FROM legacy_records WHERE collection = $1 AND id = $2`, [collection, id]);
    if (collection === "mountains") {
      await query(
        `DELETE FROM legacy_records
          WHERE collection IN ('trails','locations','assets','notes','site-inspections','customer-agreements')
            AND data->>'mountainId' = $1`,
        [id]
      );
    } else if (collection === "locations") {
      await query(
        `DELETE FROM legacy_records
          WHERE collection IN ('assets','site-inspections')
            AND data->>'locationId' = $1`,
        [id]
      );
    }
    return c.json({ ok: true });
  });
  // cascade-delete alias (old app calls /mountains/:id/cascade and /locations/:id/cascade)
  legacy.delete(`/${collection}/:id/cascade`, async (c) => {
    const id = c.req.param("id");
    await query(`DELETE FROM legacy_records WHERE collection = $1 AND id = $2`, [collection, id]);
    if (collection === "mountains") {
      await query(
        `DELETE FROM legacy_records
          WHERE collection IN ('trails','locations','assets','notes','site-inspections','customer-agreements')
            AND data->>'mountainId' = $1`,
        [id]
      );
    } else if (collection === "locations") {
      await query(
        `DELETE FROM legacy_records
          WHERE collection IN ('assets','site-inspections')
            AND data->>'locationId' = $1`,
        [id]
      );
    }
    return c.json({ ok: true });
  });
}

// ── options / item-prices writes (whole-dict replace) ─────────────────────────
legacy.post("/options", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  // old app posts { key, value } to append; keep a merged dict
  const row = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='options' AND id='__all__'`);
  const dict = row?.data ?? {};
  if (body?.key) {
    const arr: string[] = Array.isArray(dict[body.key]) ? dict[body.key] : [];
    if (body.value && !arr.includes(body.value)) arr.push(body.value);
    dict[body.key] = arr;
  }
  await upsert("options", "__all__", dict);
  return c.json({ ok: true });
});
legacy.post("/item-prices", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const row = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='item-prices' AND id='__all__'`);
  const dict = row?.data ?? {};
  if (body?.name != null) dict[body.name] = body.price;
  await upsert("item-prices", "__all__", dict);
  return c.json({ ok: true });
});

// Default proposal terms — a full ordered-array replace (not append-only like
// /options), since term order and wording both matter and the super-admin
// editor needs to add/remove/reorder freely.
legacy.put("/proposal-terms", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const terms = Array.isArray(body?.terms) ? body.terms.filter((t: unknown) => typeof t === "string") : [];
  await upsert("proposal-terms", "__all__", terms);
  return c.json({ ok: true, terms });
});

// Default Payment Terms boilerplate seeded onto every new proposal — same
// super-admin-only template-copy editing as /proposal-terms (Dev Story
// 10.2), just a single string instead of an ordered array.
legacy.put("/payment-terms", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text : "";
  await upsert("payment-terms", "__all__", text);
  return c.json({ ok: true, text });
});

// Full raw Proposal / Customer Agreement document templates — Super Admin
// "edit the entire raw content and language template" feature. Each is one
// big text blob parsed by src/app/utils/templateRenderer.tsx; the server
// just stores/returns it verbatim, same singleton pattern as payment-terms.
legacy.put("/proposal-template", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text : "";
  await upsert("proposal-template", "__all__", text);
  return c.json({ ok: true, text });
});

legacy.put("/agreement-template", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text : "";
  await upsert("agreement-template", "__all__", text);
  return c.json({ ok: true, text });
});

// Slack mirror — Builder is the record; Slack is a notification mirror. Peter
// only wants to hear about: a new mountain, a new project, a proposal being
// created or signed, and notes/tasks that are actually tagged (assigned) to
// someone — not every stage checkbox, stall, or untagged note.
const SLACK_MIRROR_TYPES = new Set([
  "mountain_added", "project_created", "proposal_created", "proposal_signed",
  "note_added", "action_added",
]);
// note_added/action_added only mirror when the entry was assigned to someone
// (`tagged`); an untagged note/task is too noisy to post.
const TAGGED_ONLY_TYPES = new Set(["note_added", "action_added"]);
// note_added/action_added summaries are built client-side with full
// attribution (and an @mention when the assignee has a Slack ID on file),
// so we don't also append "— actor" for those — it'd be redundant.
const SELF_ATTRIBUTED_TYPES = new Set(["note_added", "action_added"]);
// Base URL for links in Slack messages. Defaults to the local dev web app;
// set APP_BASE_URL once this is deployed so links point at the real domain.
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";

export async function mirrorToSlack(rec: { type: string; summary: string; actor: string; path?: string | null; slackText?: string | null; tagged?: boolean }) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url || !SLACK_MIRROR_TYPES.has(rec.type)) return;
  if (TAGGED_ONLY_TYPES.has(rec.type) && !rec.tagged) return;
  // slackText (when provided) carries a real <@USERID> mention instead of a
  // plain name — Slack-only, never shown in the app's own Updates feed. It
  // can't be nested inside a Slack link label (<url|label> renders its
  // label as plain text), so the link is appended separately instead.
  const text = rec.slackText || rec.summary;
  const link = rec.path ? ` <${APP_BASE_URL}${rec.path}|View in Builder>` : "";
  const attribution = SELF_ATTRIBUTED_TYPES.has(rec.type) ? "" : ` — ${rec.actor}`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `:round_pushpin: ${text}${attribution}${link}` }),
    });
  } catch (e) {
    console.warn("Slack mirror failed:", e);
  }
}

// ── Activity feed (Updates) — the actor is the authenticated user ─────────────
legacy.get("/activity", async (c) => {
  const mountainId = c.req.query("mountainId");
  const rows = mountainId
    ? await query<{ data: any }>(
        `SELECT data FROM legacy_records WHERE collection='activity' AND data->>'mountainId' = $1 ORDER BY updated_at DESC LIMIT 50`,
        [mountainId]
      )
    : await query<{ data: any }>(
        `SELECT data FROM legacy_records WHERE collection='activity' ORDER BY updated_at DESC LIMIT 200`
      );
  return c.json({ activity: rows.map((r) => r.data) });
});
legacy.post("/activity", async (c) => {
  const user = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  const rec = {
    id: crypto.randomUUID(),
    mountainId: b.mountainId ?? null,
    type: b.type ?? "update",
    summary: b.summary ?? "",
    path: b.path ?? null,
    slackText: b.slackText ?? null,
    tagged: !!b.tagged,
    actor: user.name || user.email || "Someone",
    actorId: user.id,
    timestamp: new Date().toISOString(),
  };
  await upsert("activity", rec.id, rec);
  void mirrorToSlack(rec); // fire-and-forget
  return c.json({ ok: true, activity: rec });
});

// Server-side equivalent of the client's logActivity() — used by routes that
// need to write an Updates-feed entry (and maybe mirror to Slack) without a
// browser present, e.g. the public proposal-signing endpoints below.
export async function insertActivity(rec: {
  mountainId?: string | null; type: string; summary: string; path?: string | null;
  slackText?: string | null; tagged?: boolean; actor: string; actorId?: string | null;
}) {
  const full = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    mountainId: rec.mountainId ?? null,
    type: rec.type,
    summary: rec.summary,
    path: rec.path ?? null,
    slackText: rec.slackText ?? null,
    tagged: !!rec.tagged,
    actor: rec.actor,
    actorId: rec.actorId ?? null,
  };
  await upsert("activity", full.id, full);
  void mirrorToSlack(full);
  return full;
}

// Resolves a project's owner contact email — used to auto-CC the project
// owner on proposal send/reminder emails (Dev Story 4.1) so they have
// visibility into what was sent without the sender remembering to add them.
export async function getProjectOwnerEmail(projectId: string): Promise<{ email: string; name?: string } | null> {
  const project = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='projects' AND id=$1`, [projectId]);
  const ownerContactId = project?.data?.ownerContactId;
  if (!ownerContactId) return null;
  const contact = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='contacts' AND id=$1`, [ownerContactId]);
  if (!contact?.data?.email) return null;
  return { email: contact.data.email, name: contact.data.name };
}

// Merges an auto-CC address into a possibly-already-set cc string/list
// without duplicating the primary recipient or an address already present.
export function withAutoCc(cc: string | undefined, to: string | undefined, autoCcEmail: string | undefined): string | undefined {
  if (!autoCcEmail) return cc;
  const existing = (cc || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (autoCcEmail.toLowerCase() === (to || "").toLowerCase()) return cc;
  if (existing.includes(autoCcEmail.toLowerCase())) return cc;
  return cc ? `${cc},${autoCcEmail}` : autoCcEmail;
}

// Looks up a CRM contact by email (case-insensitive) — used to resolve who
// "Peter Zawadzki" is for the auto-assigned countersign task, without the app
// needing a separate stable "staff id" concept.
export async function getContactByEmail(email: string): Promise<{ id: string; data: any } | null> {
  const row = await queryOne<{ id: string; data: any }>(
    `SELECT id, data FROM legacy_records WHERE collection = 'contacts' AND lower(data->>'email') = lower($1) LIMIT 1`,
    [email]
  );
  return row ?? null;
}

// Appends a ContactActivity onto a Mountain's own `activities` array — the
// server-side equivalent of the client's updateMountain(id, { activities }).
export async function pushMountainActivity(mountainId: string, activity: Record<string, any>) {
  const row = await queryOne<{ data: any }>(
    `SELECT data FROM legacy_records WHERE collection = 'mountains' AND id = $1`,
    [mountainId]
  );
  if (!row) return;
  const activities = Array.isArray(row.data.activities) ? row.data.activities : [];
  await upsert("mountains", mountainId, { ...row.data, activities: [...activities, activity] });
}

// Marks a project pipeline stage 'done' — the server-side equivalent of the
// client's checkbox-cycling in ProjectsPane, used to auto-advance a project
// when its proposal is sent/signed instead of requiring a manual click.
export async function markProjectStageDone(projectId: string, stage: string) {
  const row = await queryOne<{ data: any }>(
    `SELECT data FROM legacy_records WHERE collection = 'projects' AND id = $1`,
    [projectId]
  );
  if (!row) return;
  const stageStatus = { ...(row.data.stageStatus || {}), [stage]: "done" };
  await upsert("projects", projectId, { ...row.data, stageStatus });
}

// ── Proposal send / countersign (authenticated — staff only) ─────────────────
// Customer-side viewing/signing lives in server/routes/proposalPublicSign.ts,
// mounted without requireAuth so an emailed link works with no Clerk session.

legacy.post("/proposals/:id/send", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { to, toName, cc } = body as { to?: string; toName?: string; cc?: string };

  const row = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='proposals' AND id=$1`, [id]);
  if (!row) return c.json({ error: "Proposal not found" }, 404);
  const proposal = row.data;

  // `to` omitted -> just (re)generate the signing link without emailing it,
  // for staff who'd rather share it manually.
  const token = proposal.signToken || crypto.randomUUID();
  const now = new Date().toISOString();
  const updated = to
    ? { ...proposal, signToken: token, sentAt: now, sentTo: to, sentToName: toName || null }
    : { ...proposal, signToken: token };
  await upsert("proposals", id, updated);

  let emailResult: any = { ok: false, skipped: true };
  if (to) {
    const signUrl = `${process.env.APP_BASE_URL || "http://localhost:5173"}/sign/${token}`;
    const owner = proposal.projectId ? await getProjectOwnerEmail(proposal.projectId) : null;
    const { sendTemplateEmail } = await import("../email");
    emailResult = await sendTemplateEmail({
      to,
      cc: withAutoCc(cc, to, owner?.email),
      templateAlias: "proposal",
      model: { product_url: signUrl },
    });

    await insertActivity({
      mountainId: proposal.mountainId ?? null,
      type: "proposal_sent",
      summary: `Proposal sent to ${toName ? `${toName} (${to})` : to}`,
      path: proposal.mountainId ? `/mountains/${proposal.mountainId}/proposal/${id}` : null,
      actor: user.name || user.email || "Someone",
      actorId: user.id,
    });

    if (proposal.projectId) await markProjectStageDone(proposal.projectId, "Proposal Sent");
  }

  return c.json({ ok: true, token, email: emailResult });
});

legacy.post("/proposals/:id/countersign", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { name, signatureImage } = body as { name?: string; signatureImage?: string };
  if (!name) return c.json({ error: "Signer name is required" }, 400);

  const row = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='proposals' AND id=$1`, [id]);
  if (!row) return c.json({ error: "Proposal not found" }, 404);
  const proposal = row.data;

  const now = new Date().toISOString();
  const yullrSignature = { name, signatureImage: signatureImage || null, signedAt: now };
  const updated = { ...proposal, yullrSignature };
  await upsert("proposals", id, updated);

  const bothSigned = !!proposal.clientSignature;
  if (bothSigned) {
    if (proposal.sentTo) {
      const signUrl = `${process.env.APP_BASE_URL || "http://localhost:5173"}/sign/${proposal.signToken}`;
      const { sendTemplateEmail } = await import("../email");
      await sendTemplateEmail({
        to: proposal.sentTo,
        templateAlias: "proposal-executed",
        model: { document_url: signUrl },
      });
    }

    await insertActivity({
      mountainId: proposal.mountainId ?? null,
      type: "proposal_signed",
      summary: `Proposal fully signed (countersigned by ${name})`,
      path: proposal.mountainId ? `/mountains/${proposal.mountainId}/proposal/${id}` : null,
      actor: user.name || user.email || "Someone",
      actorId: user.id,
    });

    if (proposal.projectId) await markProjectStageDone(proposal.projectId, "Proposal Signed");
  }

  return c.json({ ok: true, bothSigned });
});

// Customer Agreement countersign — same shape as the proposal countersign,
// but no email yet (not requested for CA); just an in-app activity entry.
legacy.post("/customer-agreements/:id/countersign", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { name, signatureImage } = body as { name?: string; signatureImage?: string };
  if (!name) return c.json({ error: "Signer name is required" }, 400);

  const row = await queryOne<{ data: any }>(`SELECT data FROM legacy_records WHERE collection='customer-agreements' AND id=$1`, [id]);
  if (!row) return c.json({ error: "Agreement not found" }, 404);
  const agreement = row.data;

  const now = new Date().toISOString();
  const yullrSignature = { name, signatureImage: signatureImage || null, signedAt: now };
  await upsert("customer-agreements", id, { ...agreement, yullrSignature });

  const bothSigned = !!agreement.clientSignature;
  if (bothSigned) {
    await insertActivity({
      mountainId: agreement.mountainId ?? null,
      type: "agreement_signed",
      summary: `Customer Agreement fully signed (countersigned by ${name})`,
      path: agreement.mountainId ? `/mountains/${agreement.mountainId}/agreement` : null,
      actor: user.name || user.email || "Someone",
      actorId: user.id,
    });
  }

  return c.json({ ok: true, bothSigned });
});
