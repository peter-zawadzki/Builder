import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const app = new Hono();

// ─── Supabase Storage client ──────────────────────────────────────────────────

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const PHOTO_BUCKET = "make-a0d4ba78-photos";

// Idempotently create the photo bucket on cold start
(async () => {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b: { name: string }) => b.name === PHOTO_BUCKET)) {
      await supabase.storage.createBucket(PHOTO_BUCKET, { public: false });
      console.log(`Created storage bucket: ${PHOTO_BUCKET}`);
    }
  } catch (err) {
    console.error("Error creating photo bucket:", err);
  }
})();

// Enable logger
app.use('*', logger(console.log));

// ─── Postmark email helper ─────────────────────────────────────────────────────

async function sendPostmarkEmail(
  subject: string,
  htmlBody: string,
  textBody: string,
  to: string = 'support@yullr.com',
  cc?: string
): Promise<void> {
  const apiKey = Deno.env.get('POSTMARK_API_KEY');
  if (!apiKey) { console.log('POSTMARK_API_KEY not set — skipping email'); return; }
  try {
    const payload: Record<string, any> = {
      From: 'support@yullr.com',
      To: to,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      MessageStream: 'outbound',
    };
    if (cc) payload.Cc = cc;

    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': apiKey,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json() as any;
    if (!res.ok || data.ErrorCode) {
      console.error('Postmark send error:', JSON.stringify(data));
    } else {
      console.log('Postmark email sent:', data.MessageID);
    }
  } catch (err) {
    console.error('Failed to send Postmark email:', err);
  }
}

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// ─── Retry helper ─────────────────────────────────────────────────────────────
// Wraps any async KV operation and retries up to `maxAttempts` times on
// transient network failures (connection reset, fetch errors, etc.).

const RETRY_DELAYS_MS = [150, 500, 1200]; // waits between attempt 1→2, 2→3, 3→4

function isTransientError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes('connection reset') ||
    msg.includes('connection error') ||
    msg.includes('connection refused') ||
    msg.includes('network error') ||
    msg.includes('fetch failed') ||
    msg.includes('client error') ||
    msg.includes('sendrequest') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout')
  );
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label = 'kv operation',
  maxAttempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransientError(err)) {
        const delay = RETRY_DELAYS_MS[attempt - 1] ?? 1200;
        console.log(`[retry] ${label} — attempt ${attempt} failed (${err}), retrying in ${delay}ms…`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        break;
      }
    }
  }
  throw lastErr;
}

// Photo fields — never stored server-side
const PHOTO_FIELDS = ["serialPhoto", "installPhoto", "internalPhoto", "externalPhoto", "miscPhotos"];
function stripPhotos(obj: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...obj };
  PHOTO_FIELDS.forEach(f => delete copy[f]);
  return copy;
}

// Index key helpers — store arrays of IDs so we can mget instead of getByPrefix
const MOUNTAIN_INDEX = "idx:mountains";
const LOCATION_INDEX = "idx:locations";
const ASSET_INDEX    = "idx:assets";
const SI_INDEX       = "idx:siteInspections";
const NOTE_INDEX     = "idx:notes";
const TRAIL_INDEX    = "idx:trails";

async function addToIndex(indexKey: string, id: string): Promise<void> {
  const ids: string[] = (await withRetry(() => kv.get(indexKey), `get index ${indexKey}`)) || [];
  if (!ids.includes(id)) {
    ids.push(id);
    await withRetry(() => kv.set(indexKey, ids), `set index ${indexKey}`);
  }
}

// Fetch records in small sequential batches to stay within Edge Function
// memory limits. A single mget with hundreds of keys can exhaust resources.
const MGET_BATCH_SIZE = 40;

async function batchedMget(keys: string[]): Promise<(Record<string, unknown> | null)[]> {
  if (keys.length === 0) return [];
  const results: (Record<string, unknown> | null)[] = [];
  for (let i = 0; i < keys.length; i += MGET_BATCH_SIZE) {
    const batch = keys.slice(i, i + MGET_BATCH_SIZE);
    const batchResults = (await withRetry(
      () => kv.mget(batch),
      `mget batch [${batch[0]}…]`,
    )) as (Record<string, unknown> | null)[];
    results.push(...batchResults);
  }
  return results;
}

async function getByIndex(indexKey: string, prefix: string): Promise<Record<string, unknown>[]> {
  const ids: string[] = (await withRetry(() => kv.get(indexKey), `get index ${indexKey}`)) || [];
  if (ids.length === 0) {
    // Fall back to getByPrefix for any records written before the index existed.
    try {
      const results = await withRetry(() => kv.getByPrefix(prefix), `getByPrefix ${prefix}`);
      if (!results) return [];
      return (results as (Record<string, unknown> | null)[]).filter(Boolean) as Record<string, unknown>[];
    } catch {
      return [];
    }
  }
  const keys = ids.map(id => `${prefix}${id}`);
  const results = await batchedMget(keys);
  return results.filter(Boolean) as Record<string, unknown>[];
}

// ─── Location Media Upload / Download / Delete ────────────────────────────────

/**
 * POST /location-media/upload
 * { locationId, mediaType: 'loc'|'insp', field: 'photos'|'videos', index, dataUrl }
 * Compressed by client (photos only — videos are too large for edge functions).
 */
app.post("/make-server-a0d4ba78/location-media/upload", async (c) => {
  try {
    const { locationId, mediaType, field, index, dataUrl } = await c.req.json();
    if (!locationId || !mediaType || !field || !dataUrl) {
      return c.json({ error: "locationId, mediaType, field, and dataUrl are required" }, 400);
    }

    const commaIdx = (dataUrl as string).indexOf(",");
    if (commaIdx === -1) return c.json({ error: "Invalid dataUrl" }, 400);
    const header = (dataUrl as string).slice(0, commaIdx);
    const b64    = (dataUrl as string).slice(commaIdx + 1);
    const mime   = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
    const ext    = mime.includes("png") ? "png" : mime.includes("video") ? "mp4" : "jpg";

    let binary: string;
    try { binary = atob(b64); } catch { return c.json({ error: "Invalid base64" }, 400); }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const storagePath = `locations/${locationId}/${mediaType}/${field}/${index}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(storagePath, bytes, { contentType: mime, upsert: true });

    if (uploadError) {
      console.error(`Location media upload error (${storagePath}):`, uploadError);
      return c.json({ error: `Upload failed: ${uploadError.message}` }, 500);
    }

    // Record path in KV
    const kvKey = `locMediaRefs:${mediaType}:${locationId}`;
    const refs = ((await withRetry(() => kv.get(kvKey), "get locMediaRefs")) ?? {}) as Record<string, string[]>;
    if (!Array.isArray(refs[field])) refs[field] = [];
    refs[field][index] = storagePath;
    await withRetry(() => kv.set(kvKey, refs), "set locMediaRefs");

    console.log(`Location media uploaded: ${storagePath} (${bytes.length} bytes)`);
    return c.json({ success: true, path: storagePath });
  } catch (err) {
    console.error("Error uploading location media:", err);
    return c.json({ error: `Failed to upload location media: ${err}` }, 500);
  }
});

/**
 * POST /location-media/presign-video
 * Returns a short-lived signed upload URL so the browser can PUT a video
 * file directly to Supabase Storage without going through the edge function.
 * { locationId, mediaType, index, ext? }
 */
app.post("/make-server-a0d4ba78/location-media/presign-video", async (c) => {
  try {
    const { locationId, mediaType = "loc", index, ext = "mp4" } = await c.req.json();
    if (!locationId || index === undefined) {
      return c.json({ error: "locationId and index are required" }, 400);
    }
    const storagePath = `locations/${locationId}/${mediaType}/videos/${index}.${ext}`;
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error) {
      console.error("Video presign error:", error);
      return c.json({ error: error.message }, 500);
    }
    return c.json({ signedUrl: data.signedUrl, path: storagePath });
  } catch (err) {
    console.error("Error creating video presign URL:", err);
    return c.json({ error: `Failed to create presign URL: ${err}` }, 500);
  }
});

/**
 * POST /location-media/register-video
 * After a successful presigned PUT, record the storage path in KV.
 * { locationId, mediaType, index, path }
 */
app.post("/make-server-a0d4ba78/location-media/register-video", async (c) => {
  try {
    const { locationId, mediaType = "loc", index, path } = await c.req.json();
    if (!locationId || !path || index === undefined) {
      return c.json({ error: "locationId, path, and index are required" }, 400);
    }
    const kvKey = `locMediaRefs:${mediaType}:${locationId}`;
    const refs = ((await withRetry(() => kv.get(kvKey), "get locMediaRefs for video")) ?? {}) as Record<string, any>;
    if (!Array.isArray(refs.videos)) refs.videos = [];
    refs.videos[index] = path;
    await withRetry(() => kv.set(kvKey, refs), "set locMediaRefs for video");
    console.log(`Video registered: ${path}`);
    return c.json({ success: true, path });
  } catch (err) {
    console.error("Error registering video:", err);
    return c.json({ error: `Failed to register video: ${err}` }, 500);
  }
});

/** POST /location-media/batch-urls — signed download URLs for multiple locations */
app.post("/make-server-a0d4ba78/location-media/batch-urls", async (c) => {
  try {
    const { locationIds } = await c.req.json() as { locationIds: string[] };
    if (!Array.isArray(locationIds) || locationIds.length === 0) return c.json({ urlMap: {} });

    const urlMap: Record<string, Record<string, Record<string, string[]>>> = {};

    for (const locationId of locationIds) {
      const locKey  = `locMediaRefs:loc:${locationId}`;
      const inspKey = `locMediaRefs:insp:${locationId}`;
      const [locRefs, inspRefs] = (await withRetry(
        () => kv.mget([locKey, inspKey]),
        "mget locMediaRefs",
      )) as [Record<string, string[]> | null, Record<string, string[]> | null];

      const locationResult: Record<string, Record<string, string[]>> = {};

      for (const [type, refs] of [["loc", locRefs], ["insp", inspRefs]] as [string, Record<string, string[]> | null][]) {
        if (!refs) continue;
        const typeUrls: Record<string, string[]> = {};
        for (const [field, paths] of Object.entries(refs)) {
          if (!Array.isArray(paths)) continue;
          const signed: string[] = [];
          for (const p of paths) {
            if (!p) continue;
            const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(p, 86400);
            if (data?.signedUrl) signed.push(data.signedUrl);
          }
          if (signed.length) typeUrls[field] = signed;
        }
        if (Object.keys(typeUrls).length) locationResult[type] = typeUrls;
      }

      if (Object.keys(locationResult).length) urlMap[locationId] = locationResult;
    }

    return c.json({ urlMap });
  } catch (err) {
    console.error("Error fetching location media URLs:", err);
    return c.json({ error: `Failed to fetch location media URLs: ${err}` }, 500);
  }
});

/** DELETE /location-media/:locationId — remove all media for a location from storage + KV */
app.delete("/make-server-a0d4ba78/location-media/:locationId", async (c) => {
  try {
    const locationId = c.req.param("locationId");
    const locKey  = `locMediaRefs:loc:${locationId}`;
    const inspKey = `locMediaRefs:insp:${locationId}`;
    const [locRefs, inspRefs] = (await withRetry(
      () => kv.mget([locKey, inspKey]),
      "mget locMediaRefs for delete",
    )) as [Record<string, string[]> | null, Record<string, string[]> | null];

    const paths: string[] = [];
    for (const refs of [locRefs, inspRefs]) {
      if (!refs) continue;
      for (const pathArr of Object.values(refs)) {
        if (Array.isArray(pathArr)) paths.push(...pathArr.filter(Boolean));
      }
    }

    if (paths.length > 0) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
      if (error) console.error("Storage remove error for location media:", error);
    }
    await withRetry(() => kv.mdel([locKey, inspKey]), "mdel locMediaRefs");
    return c.json({ success: true, deletedFiles: paths.length });
  } catch (err) {
    console.error("Error deleting location media:", err);
    return c.json({ error: `Failed to delete location media: ${err}` }, 500);
  }
});

// ─── Trail Map Upload / Download / Delete ─────────────────────────────────────

/**
 * POST /trail-map/upload
 * { mountainId, dataUrl, mimeType, fileName }
 * Stores the trail map in Supabase Storage and records the path in KV.
 */
app.post("/make-server-a0d4ba78/trail-map/upload", async (c) => {
  try {
    const { mountainId, dataUrl, mimeType, fileName } = await c.req.json();
    if (!mountainId || !dataUrl || !mimeType) {
      return c.json({ error: "mountainId, dataUrl, and mimeType are required" }, 400);
    }

    const commaIdx = (dataUrl as string).indexOf(",");
    if (commaIdx === -1) return c.json({ error: "Invalid dataUrl" }, 400);
    const b64 = (dataUrl as string).slice(commaIdx + 1);

    let binary: string;
    try { binary = atob(b64); } catch { return c.json({ error: "Invalid base64" }, 400); }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const ext = (mimeType as string).includes("pdf") ? "pdf"
              : (mimeType as string).includes("png") ? "png"
              : (mimeType as string).includes("webp") ? "webp"
              : "jpg";
    const storagePath = `trail-maps/${mountainId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error(`Trail map upload error (${storagePath}):`, uploadError);
      return c.json({ error: `Upload failed: ${uploadError.message}` }, 500);
    }

    await withRetry(
      () => kv.set(`trailMap:${mountainId}`, { path: storagePath, mimeType, fileName: fileName || storagePath }),
      "set trailMap kv"
    );

    // Return a fresh signed URL (24 h)
    const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(storagePath, 86400);
    console.log(`Trail map uploaded: ${storagePath} (${bytes.length} bytes)`);
    return c.json({ success: true, url: signed?.signedUrl ?? null });
  } catch (err) {
    console.error("Error uploading trail map:", err);
    return c.json({ error: `Failed to upload trail map: ${err}` }, 500);
  }
});

/** GET /trail-map/:mountainId — returns a signed URL + metadata for the trail map */
app.get("/make-server-a0d4ba78/trail-map/:mountainId", async (c) => {
  try {
    const mountainId = c.req.param("mountainId");
    const meta = (await withRetry(() => kv.get(`trailMap:${mountainId}`), "get trailMap kv")) as
      { path: string; mimeType: string; fileName: string } | null;

    if (!meta?.path) return c.json({ url: null, mimeType: null, fileName: null });

    const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(meta.path, 86400);
    return c.json({ url: signed?.signedUrl ?? null, mimeType: meta.mimeType, fileName: meta.fileName });
  } catch (err) {
    console.error("Error fetching trail map URL:", err);
    return c.json({ error: `Failed to fetch trail map: ${err}` }, 500);
  }
});

/** DELETE /trail-map/:mountainId — removes trail map from storage + KV */
app.delete("/make-server-a0d4ba78/trail-map/:mountainId", async (c) => {
  try {
    const mountainId = c.req.param("mountainId");
    const meta = (await withRetry(() => kv.get(`trailMap:${mountainId}`), "get trailMap kv for delete")) as
      { path: string } | null;

    if (meta?.path) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([meta.path]);
      if (error) console.error("Storage remove error for trail map:", error);
    }
    await withRetry(() => kv.del(`trailMap:${mountainId}`), "del trailMap kv");
    return c.json({ success: true });
  } catch (err) {
    console.error("Error deleting trail map:", err);
    return c.json({ error: `Failed to delete trail map: ${err}` }, 500);
  }
});

// ─── Proposal Email Sending ───────────────────────────────────────────────────

/**
 * POST /proposals/send-email
 * { mountainId, recipientEmail, recipientName?, ccEmails?, proposalSnapshot }
 * Sends proposal link via email to recipient with optional CC recipients
 */
app.post("/make-server-a0d4ba78/proposals/send-email", async (c) => {
  try {
    const { mountainId, recipientEmail, recipientName, ccEmails, proposalSnapshot } = await c.req.json();
    if (!mountainId || !recipientEmail || !proposalSnapshot) {
      return c.json({ error: "mountainId, recipientEmail, and proposalSnapshot are required" }, 400);
    }

    // Get or create signing token
    let token = (await withRetry(() => kv.get(`proposalSignToken:${mountainId}`), "get proposalSignToken")) as string | null;
    if (!token) {
      // Create new signing record
      token = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
      const record = {
        token,
        mountainId,
        createdAt: new Date().toISOString(),
        proposalSnapshot,
        yullrSignature: null,
        clientSignature: null,
      };
      await withRetry(() => kv.set(`proposalSign:${token}`, record), "set proposalSign");
      await withRetry(() => kv.set(`proposalSignToken:${mountainId}`, token), "set proposalSignToken");
    }

    const signingUrl = `${c.req.header('origin') || 'https://builder.yullr.com'}/sign/${token}`;
    const mountainName = proposalSnapshot.mountainName || proposalSnapshot.clientName || 'your mountain';
    const proposalNumber = proposalSnapshot.proposalNumber || 'Draft';
    const displayName = recipientName || recipientEmail;

    const emailHtml = `
<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#1D2930;padding:32px">
    <img src="https://race.yullr.com/_assets/v11/8b719608599361ca2b1d142742df531a9af04c08.png" alt="YULLR" style="height:44px;margin-bottom:8px" />
    <h1 style="color:#fff;font-size:24px;margin:8px 0 4px">Your YULLR Proposal</h1>
    <p style="color:#F95C39;font-size:14px;margin:0;font-weight:600">#${proposalNumber}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px">Hi ${displayName},</p>
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px">Thank you for your interest in YULLR. We're excited to share our proposal for deploying the YULLR platform at <strong>${mountainName}</strong>.</p>
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px">Click the button below to review the full proposal and digitally sign when ready:</p>
    <div style="text-align:center;margin:0 0 24px">
      <a href="${signingUrl}" style="display:inline-block;background:#FF5C39;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">Review &amp; Sign Proposal</a>
    </div>
    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0">If you have any questions about this proposal, please don't hesitate to reach out. We're here to help.</p>
  </div>
  <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
    <p style="color:#9ca3af;font-size:12px;margin:0">YULLR, Inc. · support@yullr.com</p>
  </div>
</div>`;

    const emailText = `YULLR Proposal #${proposalNumber}

Hi ${displayName},

Thank you for your interest in YULLR. We're excited to share our proposal for deploying the YULLR platform at ${mountainName}.

Review and sign your proposal here:
${signingUrl}

If you have any questions about this proposal, please don't hesitate to reach out. We're here to help.

YULLR, Inc.
support@yullr.com`;

    await sendPostmarkEmail(
      `YULLR Proposal for ${mountainName} — #${proposalNumber}`,
      emailHtml,
      emailText,
      recipientEmail,
      ccEmails || undefined
    );

    // Log email send event in signing record
    const record = (await withRetry(() => kv.get(`proposalSign:${token}`), "get proposalSign for log")) as Record<string, any> | null;
    if (record) {
      if (!Array.isArray(record.emailLog)) record.emailLog = [];
      record.emailLog.push({
        sentAt: new Date().toISOString(),
        recipientEmail,
        recipientName: recipientName || null,
        ccEmails: ccEmails || null,
      });
      await withRetry(() => kv.set(`proposalSign:${token}`, record), "set proposalSign log");
    }

    console.log(`Proposal email sent: token=${token} to=${recipientEmail}`);
    return c.json({ success: true, token });
  } catch (err) {
    console.error("Error sending proposal email:", err);
    return c.json({ error: `Failed to send email: ${err}` }, 500);
  }
});

// ─── Proposal Signing ─────────────────────────────────────────────────────────

/**
 * POST /proposals/sign-request
 * { mountainId, proposalSnapshot }
 * Creates a signing record in KV and returns a unique token.
 */
app.post("/make-server-a0d4ba78/proposals/sign-request", async (c) => {
  try {
    const { mountainId, proposalSnapshot } = await c.req.json();
    if (!mountainId || !proposalSnapshot) {
      return c.json({ error: "mountainId and proposalSnapshot are required" }, 400);
    }
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const record = {
      token,
      mountainId,
      createdAt: new Date().toISOString(),
      proposalSnapshot,
      yullrSignature: null,
      clientSignature: null,
    };
    await withRetry(() => kv.set(`proposalSign:${token}`, record), "set proposalSign");
    await withRetry(() => kv.set(`proposalSignToken:${mountainId}`, token), "set proposalSignToken");
    console.log(`Proposal signing request created: token=${token} mountainId=${mountainId}`);
    return c.json({ token });
  } catch (err) {
    console.error("Error creating proposal sign request:", err);
    return c.json({ error: `Failed to create sign request: ${err}` }, 500);
  }
});

/**
 * GET /proposals/sign/:token — public, no auth required
 * Returns the full signing record (snapshot + signatures).
 */
app.get("/make-server-a0d4ba78/proposals/sign/:token", async (c) => {
  try {
    const token = c.req.param("token");
    const record = await withRetry(() => kv.get(`proposalSign:${token}`), "get proposalSign");
    if (!record) return c.json({ error: "Signing request not found" }, 404);
    return c.json(record);
  } catch (err) {
    console.error("Error fetching signing record:", err);
    return c.json({ error: `Failed to fetch signing record: ${err}` }, 500);
  }
});

/**
 * POST /proposals/sign/:token/viewed — public, no auth required
 * Called when a client opens the signing link. Appends a timestamped entry to viewLog.
 */
app.post("/make-server-a0d4ba78/proposals/sign/:token/viewed", async (c) => {
  try {
    const token = c.req.param("token");
    const record = (await withRetry(() => kv.get(`proposalSign:${token}`), "get proposalSign for view")) as Record<string, any> | null;
    if (!record) return c.json({ error: "Not found" }, 404);
    if (!Array.isArray(record.viewLog)) record.viewLog = [];
    record.viewLog.push({ viewedAt: new Date().toISOString() });
    await withRetry(() => kv.set(`proposalSign:${token}`, record), "set proposalSign view");
    console.log(`Proposal link viewed: token=${token} total_views=${record.viewLog.length}`);
    return c.json({ success: true });
  } catch (err) {
    console.error("Error recording proposal view:", err);
    return c.json({ error: `Failed: ${err}` }, 500);
  }
});

/**
 * GET /proposals/sign-status/:mountainId
 * Returns the current token + signing record for a mountain (builder use).
 */
app.get("/make-server-a0d4ba78/proposals/sign-status/:mountainId", async (c) => {
  try {
    const mountainId = c.req.param("mountainId");
    const token = (await withRetry(() => kv.get(`proposalSignToken:${mountainId}`), "get proposalSignToken")) as string | null;
    if (!token) return c.json({ token: null, record: null });
    const record = await withRetry(() => kv.get(`proposalSign:${token}`), "get proposalSign for status");
    return c.json({ token, record: record ?? null });
  } catch (err) {
    console.error("Error fetching sign status:", err);
    return c.json({ error: `Failed to fetch sign status: ${err}` }, 500);
  }
});

/**
 * POST /proposals/sign/:token/client
 * { name, title } — client submits their signature via the public signing page.
 */
app.post("/make-server-a0d4ba78/proposals/sign/:token/client", async (c) => {
  try {
    const token = c.req.param("token");
    const { name, title, legalEntity, signatureImage } = await c.req.json();
    if (!name?.trim()) return c.json({ error: "Name is required" }, 400);
    const record = (await withRetry(() => kv.get(`proposalSign:${token}`), "get proposalSign for client sig")) as Record<string, any> | null;
    if (!record) return c.json({ error: "Signing request not found" }, 404);
    if (record.clientSignature) return c.json({ error: "Already signed by client" }, 409);
    record.clientSignature = {
      name: name.trim(),
      title: title?.trim() || "",
      legalEntity: legalEntity?.trim() || "",
      signatureImage: signatureImage || null,
      signedAt: new Date().toISOString(),
    };
    await withRetry(() => kv.set(`proposalSign:${token}`, record), "set proposalSign client sig");
    console.log(`Client signed proposal: token=${token} name=${name.trim()}`);

    // ── Fire notification email (non-blocking) ───────────────────────────────
    const snap = record.proposalSnapshot as any;
    const mountainName = snap?.mountainName || snap?.projectName || record.mountainId || 'Unknown';
    const signedAt = new Date(record.clientSignature.signedAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
    const signerName = record.clientSignature.name;
    const signerTitle = record.clientSignature.title || '—';
    const signerEntity = record.clientSignature.legalEntity || '—';
    const proposalHtml = `
<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#1D2930;padding:24px 32px">
    <p style="color:#F95C39;font-size:13px;font-weight:600;letter-spacing:.08em;margin:0 0 4px">YULLR BUILDER</p>
    <h1 style="color:#fff;font-size:22px;margin:0">Proposal Signed</h1>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:15px;margin:0 0 24px">A client has signed the proposal. Here are the details:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:8px 0;color:#6b7280;width:40%">Mountain / Project</td><td style="padding:8px 0;color:#111827;font-weight:600">${mountainName}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px 6px;color:#6b7280">Signer Name</td><td style="padding:8px 6px;color:#111827;font-weight:600">${signerName}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Title / Role</td><td style="padding:8px 0;color:#111827">${signerTitle}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px 6px;color:#6b7280">Legal Entity</td><td style="padding:8px 6px;color:#111827">${signerEntity}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Signed At</td><td style="padding:8px 0;color:#111827">${signedAt}</td></tr>
    </table>
    <div style="margin-top:24px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
      <p style="color:#15803d;font-size:13px;margin:0">✅ The proposal has been signed by the client. You can now proceed to the Customer Agreement.</p>
    </div>
  </div>
  <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
    <p style="color:#9ca3af;font-size:12px;margin:0">YULLR Builder · Automated Notification</p>
  </div>
</div>`;
    const proposalText = `Proposal Signed\n\nMountain/Project: ${mountainName}\nSigner: ${signerName}\nTitle: ${signerTitle}\nLegal Entity: ${signerEntity}\nSigned At: ${signedAt}\n\nLog in to YULLR Builder to proceed.`;
    sendPostmarkEmail(`✅ Proposal Signed — ${mountainName} — ${signerName}`, proposalHtml, proposalText).catch(console.error);

    return c.json({ success: true });
  } catch (err) {
    console.error("Error saving client signature:", err);
    return c.json({ error: `Failed to save client signature: ${err}` }, 500);
  }
});

/**
 * POST /proposals/sign/:token/clear-signatures
 * Clears both YULLR and client signatures, unlocking the proposal for editing.
 */
app.post("/make-server-a0d4ba78/proposals/sign/:token/clear-signatures", async (c) => {
  try {
    const token = c.req.param("token");
    const record = (await withRetry(() => kv.get(`proposalSign:${token}`), "get proposalSign for clear")) as Record<string, any> | null;
    if (!record) return c.json({ error: "Signing request not found" }, 404);
    record.yullrSignature = null;
    record.clientSignature = null;
    await withRetry(() => kv.set(`proposalSign:${token}`, record), "set proposalSign clear sigs");
    console.log(`Signatures cleared for proposal token=${token}`);
    return c.json({ success: true });
  } catch (err) {
    console.error("Error clearing signatures:", err);
    return c.json({ error: `Failed to clear signatures: ${err}` }, 500);
  }
});

/**
 * DELETE /proposals/sign/:token
 * Removes the sign record and the token index for the mountain.
 */
app.delete("/make-server-a0d4ba78/proposals/sign/:token", async (c) => {
  try {
    const token = c.req.param("token");
    const record = (await withRetry(() => kv.get(`proposalSign:${token}`), "get proposalSign for delete")) as Record<string, any> | null;

    // Prevent deletion if any signatures exist
    if (record?.yullrSignature || record?.clientSignature) {
      console.log(`Proposal deletion blocked - signatures exist: token=${token}`);
      return c.json({ error: "Cannot delete a signed proposal" }, 403);
    }

    if (record?.mountainId) {
      await withRetry(() => kv.del(`proposalSignToken:${record.mountainId}`), "del proposalSignToken");
    }
    await withRetry(() => kv.del(`proposalSign:${token}`), "del proposalSign");
    console.log(`Proposal sign record deleted: token=${token}`);
    return c.json({ success: true });
  } catch (err) {
    console.error("Error deleting proposal sign record:", err);
    return c.json({ error: `Failed to delete sign record: ${err}` }, 500);
  }
});

/**
 * POST /proposals/sign/:token/yullr
 * { name, signatureImage } — YULLR rep signs from inside the Proposal Builder.
 */
app.post("/make-server-a0d4ba78/proposals/sign/:token/yullr", async (c) => {
  try {
    const token = c.req.param("token");
    const { name, signatureImage } = await c.req.json();
    if (!name?.trim()) return c.json({ error: "Name is required" }, 400);
    const record = (await withRetry(() => kv.get(`proposalSign:${token}`), "get proposalSign for yullr sig")) as Record<string, any> | null;
    if (!record) return c.json({ error: "Signing request not found" }, 404);
    record.yullrSignature = {
      name: name.trim(),
      signatureImage: signatureImage || null,
      signedAt: new Date().toISOString(),
    };
    await withRetry(() => kv.set(`proposalSign:${token}`, record), "set proposalSign yullr sig");
    console.log(`YULLR signed proposal: token=${token} name=${name.trim()}`);
    return c.json({ success: true });
  } catch (err) {
    console.error("Error saving YULLR signature:", err);
    return c.json({ error: `Failed to save YULLR signature: ${err}` }, 500);
  }
});

/**
 * POST /proposals/send-signed-pdf
 * { mountainId, proposalNumber, mountainName, recipientEmail, pdfBase64 }
 * Sends the fully signed proposal PDF to the customer via email
 */
app.post("/make-server-a0d4ba78/proposals/send-signed-pdf", async (c) => {
  try {
    const { mountainId, proposalNumber, mountainName, recipientEmail, pdfBase64 } = await c.req.json();
    if (!pdfBase64 || !recipientEmail) {
      return c.json({ error: "pdfBase64 and recipientEmail are required" }, 400);
    }

    const emailHtml = `
<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#1D2930;padding:32px">
    <img src="https://race.yullr.com/_assets/v11/8b719608599361ca2b1d142742df531a9af04c08.png" alt="YULLR" style="height:44px;margin-bottom:8px" />
    <h1 style="color:#fff;font-size:24px;margin:8px 0 4px">Fully Executed Proposal</h1>
    <p style="color:#F95C39;font-size:14px;margin:0;font-weight:600">#${proposalNumber || 'Draft'}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px">Thank you for signing the YULLR proposal for <strong>${mountainName || 'your mountain'}</strong>.</p>
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px">Please find the fully executed proposal attached to this email as a PDF. Both parties have signed and the agreement is now in effect.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0">
      <p style="color:#15803d;font-size:14px;margin:0">✅ <strong>Next Steps:</strong> Your YULLR representative will be in touch shortly to coordinate installation and deployment.</p>
    </div>
    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0">If you have any questions, please don't hesitate to reach out at support@yullr.com.</p>
  </div>
  <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
    <p style="color:#9ca3af;font-size:12px;margin:0">YULLR, Inc. · support@yullr.com</p>
  </div>
</div>`;

    const emailText = `YULLR Fully Executed Proposal #${proposalNumber || 'Draft'}

Thank you for signing the YULLR proposal for ${mountainName || 'your mountain'}.

Please find the fully executed proposal attached to this email as a PDF. Both parties have signed and the agreement is now in effect.

Next Steps: Your YULLR representative will be in touch shortly to coordinate installation and deployment.

If you have any questions, please don't hesitate to reach out.

YULLR, Inc.
support@yullr.com`;

    // Send email with PDF attachment
    const apiKey = Deno.env.get("POSTMARK_API_KEY");
    if (!apiKey) throw new Error("POSTMARK_API_KEY not configured");

    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": apiKey,
      },
      body: JSON.stringify({
        From: "YULLR Builder <support@yullr.com>",
        To: recipientEmail,
        Subject: `✅ Signed Proposal — ${mountainName || 'Mountain'} — #${proposalNumber || 'Draft'}`,
        HtmlBody: emailHtml,
        TextBody: emailText,
        MessageStream: "outbound",
        Attachments: [
          {
            Name: `YULLR-Proposal-${proposalNumber || 'Draft'}-${(mountainName || 'Mountain').replace(/\s+/g, '-')}-Signed.pdf`,
            Content: pdfBase64,
            ContentType: "application/pdf",
          }
        ],
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("Postmark error:", result);
      throw new Error(result.Message || "Failed to send email");
    }

    console.log(`Signed proposal PDF sent: mountainId=${mountainId} to=${recipientEmail}`);
    return c.json({ success: true });
  } catch (err) {
    console.error("Error sending signed PDF:", err);
    return c.json({ error: `Failed to send PDF: ${err}` }, 500);
  }
});

// ─── Asset Photo Upload / Download / Delete ───────────────────────────────────

/**
 * POST /photos/upload
 * { assetId, field, index?, dataUrl }
 * Client-compresses photos to ≤1600px JPEG; body stays well under the 6 MB limit.
 */
app.post("/make-server-a0d4ba78/photos/upload", async (c) => {
  try {
    const { assetId, field, index, dataUrl } = await c.req.json();
    if (!assetId || !field || !dataUrl) {
      return c.json({ error: "assetId, field, and dataUrl are required" }, 400);
    }

    const commaIdx = (dataUrl as string).indexOf(",");
    if (commaIdx === -1) return c.json({ error: "Invalid dataUrl" }, 400);
    const header = (dataUrl as string).slice(0, commaIdx);
    const b64    = (dataUrl as string).slice(commaIdx + 1);
    const mime   = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
    const ext    = mime.includes("png") ? "png" : "jpg";

    let binary: string;
    try { binary = atob(b64); } catch { return c.json({ error: "Invalid base64" }, 400); }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const suffix = (index !== undefined && index !== null) ? `_${index}` : "";
    const storagePath = `assets/${assetId}/${field}${suffix}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(storagePath, bytes, { contentType: mime, upsert: true });

    if (uploadError) {
      console.error(`Asset photo upload error (${storagePath}):`, uploadError);
      return c.json({ error: `Upload failed: ${uploadError.message}` }, 500);
    }

    // Record path in KV under photoRefs:{assetId}
    const kvKey = `photoRefs:${assetId}`;
    const refs = ((await withRetry(() => kv.get(kvKey), "get photoRefs")) ?? {}) as Record<string, any>;
    if (index !== undefined && index !== null) {
      if (!Array.isArray(refs[field])) refs[field] = [];
      refs[field][index] = storagePath;
    } else {
      refs[field] = storagePath;
    }
    await withRetry(() => kv.set(kvKey, refs), "set photoRefs");

    console.log(`Asset photo uploaded: ${storagePath} (${bytes.length} bytes)`);
    return c.json({ success: true, path: storagePath });
  } catch (err) {
    console.error("Error uploading asset photo:", err);
    return c.json({ error: `Failed to upload asset photo: ${err}` }, 500);
  }
});

/** POST /photos/batch-urls — signed 24-hour download URLs for a batch of asset IDs */
app.post("/make-server-a0d4ba78/photos/batch-urls", async (c) => {
  try {
    const { assetIds } = await c.req.json() as { assetIds: string[] };
    if (!Array.isArray(assetIds) || assetIds.length === 0) return c.json({ urlMap: {} });

    const urlMap: Record<string, Record<string, string | string[]>> = {};

    for (const assetId of assetIds) {
      const refs = ((await withRetry(() => kv.get(`photoRefs:${assetId}`), "get photoRefs for batch")) ?? {}) as Record<string, any>;
      if (!refs || Object.keys(refs).length === 0) continue;

      const assetUrls: Record<string, string | string[]> = {};
      for (const [field, value] of Object.entries(refs)) {
        if (Array.isArray(value)) {
          const signed: string[] = [];
          for (const p of value as string[]) {
            if (!p) continue;
            const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(p, 86400);
            if (data?.signedUrl) signed.push(data.signedUrl);
          }
          if (signed.length) assetUrls[field] = signed;
        } else if (typeof value === "string" && value) {
          const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(value as string, 86400);
          if (data?.signedUrl) assetUrls[field] = data.signedUrl;
        }
      }
      if (Object.keys(assetUrls).length) urlMap[assetId] = assetUrls;
    }

    return c.json({ urlMap });
  } catch (err) {
    console.error("Error fetching asset photo URLs:", err);
    return c.json({ error: `Failed to fetch asset photo URLs: ${err}` }, 500);
  }
});

/** DELETE /photos/:assetId — remove all photos for an asset from storage + KV */
app.delete("/make-server-a0d4ba78/photos/:assetId", async (c) => {
  try {
    const assetId = c.req.param("assetId");
    const refs = ((await withRetry(() => kv.get(`photoRefs:${assetId}`), "get photoRefs")) ?? {}) as Record<string, any>;

    const paths: string[] = [];
    for (const v of Object.values(refs)) {
      if (Array.isArray(v)) paths.push(...(v as string[]).filter(Boolean));
      else if (v) paths.push(v as string);
    }
    if (paths.length > 0) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
      if (error) console.error("Storage remove error:", error);
    }
    await withRetry(() => kv.del(`photoRefs:${assetId}`), "del photoRefs");
    return c.json({ success: true, deletedFiles: paths.length });
  } catch (err) {
    console.error("Error deleting asset photos:", err);
    return c.json({ error: `Failed to delete photos: ${err}` }, 500);
  }
});

// ─── Image Annotations ────────────────────────────────────────────────────────

/** POST /annotations/upload — save annotations for an image */
app.post("/make-server-a0d4ba78/annotations/upload", async (c) => {
  try {
    const { imageId, annotations } = await c.req.json();
    if (!imageId) return c.json({ error: "Missing imageId" }, 400);

    const key = `annotations:${imageId}`;
    await kv.set(key, { imageId, annotations, updatedAt: new Date().toISOString() });

    return c.json({ success: true });
  } catch (err) {
    console.error("[annotations/upload] error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

/** POST /annotations/batch-get — get annotations for multiple images */
app.post("/make-server-a0d4ba78/annotations/batch-get", async (c) => {
  try {
    const { imageIds } = await c.req.json();
    if (!Array.isArray(imageIds)) return c.json({ error: "imageIds must be an array" }, 400);

    const keys = imageIds.map(id => `annotations:${id}`);
    const results = await kv.mget(...keys);

    // Build map of imageId -> annotations
    const annotationsMap: Record<string, any[]> = {};
    results.forEach((result, index) => {
      if (result) {
        annotationsMap[imageIds[index]] = result.annotations || [];
      }
    });

    return c.json({ annotationsMap });
  } catch (err) {
    console.error("[annotations/batch-get] error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

/** DELETE /annotations/:imageId — delete annotations for an image */
app.delete("/make-server-a0d4ba78/annotations/:imageId", async (c) => {
  try {
    const imageId = c.req.param("imageId");
    const key = `annotations:${imageId}`;
    await kv.del(key);
    return c.json({ success: true });
  } catch (err) {
    console.error("[annotations/delete] error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// Health check endpoint
app.get("/make-server-a0d4ba78/health", (c) => {
  return c.json({ status: "ok" });
});

// ─── Image proxy (used by PDF export to bypass browser CORS on external images) ─
app.get("/make-server-a0d4ba78/proxy-image", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.text("Missing url parameter", 400);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "YULLR-PDF-Export/1.0" },
    });
    if (!resp.ok) return c.text(`Upstream returned ${resp.status}`, 502);
    const bytes = await resp.arrayBuffer();
    const ct = resp.headers.get("content-type") || "image/png";
    return c.body(bytes, 200, {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=3600",
    });
  } catch (e) {
    console.log("Image proxy error:", e);
    return c.text(`Proxy fetch failed: ${e}`, 502);
  }
});

// ─── Mountains ────────────────────────────────────────────���───────────────────

// ─── Customer Agreement Signing ────────────────────────────────────────────────

app.post("/make-server-a0d4ba78/customer-agreements", async (c) => {
  try {
    const { mountainId, formData } = await c.req.json();
    if (!mountainId || !formData) return c.json({ error: "mountainId and formData are required" }, 400);
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const record = { token, mountainId, createdAt: new Date().toISOString(), formData, yullrSignature: null, clientSignature: null };
    await withRetry(() => kv.set(`ca:${token}`, record), "set ca");
    await withRetry(() => kv.set(`caToken:${mountainId}`, token), "set caToken");
    console.log(`Customer Agreement created: token=${token} mountainId=${mountainId}`);
    return c.json({ token });
  } catch (err) { console.error("Error creating CA:", err); return c.json({ error: `Failed: ${err}` }, 500); }
});

app.get("/make-server-a0d4ba78/customer-agreements/status/:mountainId", async (c) => {
  try {
    const mountainId = c.req.param("mountainId");
    const token = (await withRetry(() => kv.get(`caToken:${mountainId}`), "get caToken")) as string | null;
    if (!token) return c.json({ token: null, record: null });
    const record = await withRetry(() => kv.get(`ca:${token}`), "get ca for status");
    return c.json({ token, record: record ?? null });
  } catch (err) { console.error("Error fetching CA status:", err); return c.json({ error: `Failed: ${err}` }, 500); }
});

app.get("/make-server-a0d4ba78/customer-agreements/sign/:token", async (c) => {
  try {
    const token = c.req.param("token");
    const record = await withRetry(() => kv.get(`ca:${token}`), "get ca");
    if (!record) return c.json({ error: "Agreement not found" }, 404);
    return c.json(record);
  } catch (err) { console.error("Error fetching CA:", err); return c.json({ error: `Failed: ${err}` }, 500); }
});

app.put("/make-server-a0d4ba78/customer-agreements/:token/form", async (c) => {
  try {
    const token = c.req.param("token");
    const { formData } = await c.req.json();
    const record = (await withRetry(() => kv.get(`ca:${token}`), "get ca for update")) as Record<string, any> | null;
    if (!record) return c.json({ error: "Not found" }, 404);
    record.formData = { ...record.formData, ...formData };
    await withRetry(() => kv.set(`ca:${token}`, record), "set ca form");
    return c.json({ success: true });
  } catch (err) { console.error("Error updating CA form:", err); return c.json({ error: `Failed: ${err}` }, 500); }
});

app.post("/make-server-a0d4ba78/customer-agreements/sign/:token/client", async (c) => {
  try {
    const token = c.req.param("token");
    const { name, title, signatureImage } = await c.req.json();
    if (!name?.trim()) return c.json({ error: "Name is required" }, 400);
    const record = (await withRetry(() => kv.get(`ca:${token}`), "get ca for client sig")) as Record<string, any> | null;
    if (!record) return c.json({ error: "Not found" }, 404);
    if (record.clientSignature) return c.json({ error: "Already signed" }, 409);
    record.clientSignature = { name: name.trim(), title: title?.trim() || "", signatureImage: signatureImage || null, signedAt: new Date().toISOString() };
    await withRetry(() => kv.set(`ca:${token}`, record), "set ca client sig");
    console.log(`Client signed CA: token=${token}`);

    // ── Fire notification email (non-blocking) ───────────────────────────────
    const fd = record.formData as any;
    const caMountainName = fd?.facilityName || fd?.customerLegalName || record.mountainId || 'Unknown';
    const caSignerName = record.clientSignature.name;
    const caSignerTitle = record.clientSignature.title || '—';
    const caSignedAt = new Date(record.clientSignature.signedAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
    const caHtml = `
<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#1D2930;padding:24px 32px">
    <p style="color:#F95C39;font-size:13px;font-weight:600;letter-spacing:.08em;margin:0 0 4px">YULLR BUILDER</p>
    <h1 style="color:#fff;font-size:22px;margin:0">Customer Agreement Signed</h1>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:15px;margin:0 0 24px">A customer has signed the Customer Agreement. Here are the details:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:8px 0;color:#6b7280;width:40%">Facility / Mountain</td><td style="padding:8px 0;color:#111827;font-weight:600">${caMountainName}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px 6px;color:#6b7280">Legal Entity</td><td style="padding:8px 6px;color:#111827;font-weight:600">${fd?.customerLegalName || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Entity Type</td><td style="padding:8px 0;color:#111827">${fd?.entityType || '—'}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px 6px;color:#6b7280">State of Formation</td><td style="padding:8px 6px;color:#111827">${fd?.stateOfFormation || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Authorized Signatory</td><td style="padding:8px 0;color:#111827">${fd?.authorizedSignatory || caSignerName}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px 6px;color:#6b7280">Signer Name</td><td style="padding:8px 6px;color:#111827;font-weight:600">${caSignerName}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Title / Role</td><td style="padding:8px 0;color:#111827">${caSignerTitle}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px 6px;color:#6b7280">Email for Notices</td><td style="padding:8px 6px;color:#111827">${fd?.emailForNotices || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Signed At</td><td style="padding:8px 0;color:#111827">${caSignedAt}</td></tr>
    </table>
    <div style="margin-top:24px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
      <p style="color:#15803d;font-size:13px;margin:0">✅ The Customer Agreement is now fully executed by the customer. Log in to YULLR Builder to countersign.</p>
    </div>
  </div>
  <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
    <p style="color:#9ca3af;font-size:12px;margin:0">YULLR Builder · Automated Notification</p>
  </div>
</div>`;
    const caText = `Customer Agreement Signed\n\nFacility: ${caMountainName}\nLegal Entity: ${fd?.customerLegalName || '—'}\nEntity Type: ${fd?.entityType || '—'}\nState: ${fd?.stateOfFormation || '—'}\nSigner: ${caSignerName}\nTitle: ${caSignerTitle}\nEmail: ${fd?.emailForNotices || '—'}\nSigned At: ${caSignedAt}`;
    sendPostmarkEmail(`✅ Customer Agreement Signed — ${caMountainName} — ${caSignerName}`, caHtml, caText).catch(console.error);

    return c.json({ success: true });
  } catch (err) { console.error("Error saving CA client sig:", err); return c.json({ error: `Failed: ${err}` }, 500); }
});

app.post("/make-server-a0d4ba78/customer-agreements/sign/:token/yullr", async (c) => {
  try {
    const token = c.req.param("token");
    const { name, signatureImage } = await c.req.json();
    if (!name?.trim()) return c.json({ error: "Name is required" }, 400);
    const record = (await withRetry(() => kv.get(`ca:${token}`), "get ca for yullr sig")) as Record<string, any> | null;
    if (!record) return c.json({ error: "Not found" }, 404);
    record.yullrSignature = {
      name: name.trim(),
      signatureImage: signatureImage || null,
      signedAt: new Date().toISOString(),
    };
    await withRetry(() => kv.set(`ca:${token}`, record), "set ca yullr sig");
    console.log(`YULLR signed CA: token=${token} name=${name.trim()}`);
    return c.json({ success: true });
  } catch (err) { console.error("Error saving CA YULLR sig:", err); return c.json({ error: `Failed: ${err}` }, 500); }
});

app.post("/make-server-a0d4ba78/customer-agreements/sign/:token/clear", async (c) => {
  try {
    const token = c.req.param("token");
    const record = (await withRetry(() => kv.get(`ca:${token}`), "get ca for clear")) as Record<string, any> | null;
    if (!record) return c.json({ error: "Not found" }, 404);
    record.yullrSignature = null; record.clientSignature = null;
    await withRetry(() => kv.set(`ca:${token}`, record), "set ca clear sigs");
    return c.json({ success: true });
  } catch (err) { console.error("Error clearing CA sigs:", err); return c.json({ error: `Failed: ${err}` }, 500); }
});

app.delete("/make-server-a0d4ba78/customer-agreements/:token", async (c) => {
  try {
    const token = c.req.param("token");
    const record = (await withRetry(() => kv.get(`ca:${token}`), "get ca for delete")) as Record<string, any> | null;
    if (record?.mountainId) await withRetry(() => kv.del(`caToken:${record.mountainId}`), "del caToken");
    await withRetry(() => kv.del(`ca:${token}`), "del ca");
    return c.json({ success: true });
  } catch (err) { console.error("Error deleting CA:", err); return c.json({ error: `Failed: ${err}` }, 500); }
});

app.get("/make-server-a0d4ba78/mountains", async (c) => {
  try {
    const mountains = await getByIndex(MOUNTAIN_INDEX, "mountain:");
    return c.json({ mountains });
  } catch (error) {
    console.error("Error fetching mountains:", error);
    return c.json({ error: `Failed to fetch mountains: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/mountains", async (c) => {
  try {
    const mountain = await c.req.json();
    await withRetry(() => kv.set(`mountain:${mountain.id}`, mountain), 'set mountain');
    await addToIndex(MOUNTAIN_INDEX, mountain.id);
    return c.json({ success: true, mountain });
  } catch (error) {
    console.error("Error creating mountain:", error);
    return c.json({ error: `Failed to create mountain: ${error}` }, 500);
  }
});

app.put("/make-server-a0d4ba78/mountains/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = (await withRetry(() => kv.get(`mountain:${id}`), 'get mountain')) as Record<string, unknown> | null;
    if (!existing) {
      return c.json({ error: "Mountain not found" }, 404);
    }
    const updated = { ...existing, ...updates };
    await withRetry(() => kv.set(`mountain:${id}`, updated), 'set mountain');
    await addToIndex(MOUNTAIN_INDEX, id);
    return c.json({ success: true, mountain: updated });
  } catch (error) {
    console.error("Error updating mountain:", error);
    return c.json({ error: `Failed to update mountain: ${error}` }, 500);
  }
});

// Cascade-delete a mountain + all its locations + all their assets
app.delete("/make-server-a0d4ba78/mountains/:id/cascade", async (c) => {
  try {
    const mountainId = c.req.param("id");

    // 1. Remove mountain from index + delete its KV entry
    const mountainIds: string[] = (await withRetry(() => kv.get(MOUNTAIN_INDEX), 'get mountain index')) || [];
    await withRetry(() => kv.set(MOUNTAIN_INDEX, mountainIds.filter((id: string) => id !== mountainId)), 'set mountain index');
    await withRetry(() => kv.del(`mountain:${mountainId}`), 'del mountain');

    // 2. Find and delete all trails for this mountain
    const trailIds: string[] = (await withRetry(() => kv.get(TRAIL_INDEX), 'get trail index')) || [];
    const trailKeys = trailIds.map((id: string) => `trail:${id}`);
    const trailRecords = trailKeys.length > 0 ? await batchedMget(trailKeys) : [];
    const orphanTrailIds: string[] = trailRecords
      .filter((t): t is Record<string, unknown> => !!t && (t as any).mountainId === mountainId)
      .map((t: any) => t.id as string);
    if (orphanTrailIds.length > 0) {
      await withRetry(() => kv.set(TRAIL_INDEX, trailIds.filter((id: string) => !orphanTrailIds.includes(id))), 'set trail index');
      await withRetry(() => kv.mdel(orphanTrailIds.map((id: string) => `trail:${id}`)), 'mdel trails');
    }

    // 3. Find all locations for this mountain, delete each one
    const locationIds: string[] = (await withRetry(() => kv.get(LOCATION_INDEX), 'get location index')) || [];
    const locationKeys = locationIds.map((id: string) => `location:${id}`);
    const locationRecords = locationKeys.length > 0 ? await batchedMget(locationKeys) : [];

    const orphanLocationIds: string[] = locationRecords
      .filter((l): l is Record<string, unknown> => !!l && (l as any).mountainId === mountainId)
      .map((l: any) => l.id as string);

    if (orphanLocationIds.length > 0) {
      await withRetry(() => kv.set(LOCATION_INDEX, locationIds.filter((id: string) => !orphanLocationIds.includes(id))), 'set location index');
      await withRetry(() => kv.mdel(orphanLocationIds.map((id: string) => `location:${id}`)), 'mdel locations');
    }

    // 4. Find all assets for those locations, delete each one
    const assetIds: string[] = (await withRetry(() => kv.get(ASSET_INDEX), 'get asset index')) || [];
    const assetKeys = assetIds.map((id: string) => `asset:${id}`);
    const assetRecords = assetKeys.length > 0 ? await batchedMget(assetKeys) : [];

    const orphanAssetIds: string[] = assetRecords
      .filter((a): a is Record<string, unknown> => !!a && orphanLocationIds.includes((a as any).locationId))
      .map((a: any) => a.id as string);

    if (orphanAssetIds.length > 0) {
      await withRetry(() => kv.set(ASSET_INDEX, assetIds.filter((id: string) => !orphanAssetIds.includes(id))), 'set asset index');
      await withRetry(() => kv.mdel(orphanAssetIds.map((id: string) => `asset:${id}`)), 'mdel assets');
    }

    // 5. Find and delete all site inspections for this mountain
    const siIds: string[] = (await withRetry(() => kv.get(SI_INDEX), 'get si index')) || [];
    const siKeys = siIds.map((id: string) => `siLoc:${id}`);
    const siRecords = siKeys.length > 0 ? await batchedMget(siKeys) : [];

    const orphanSiIds: string[] = siRecords
      .filter((s): s is Record<string, unknown> => !!s && (s as any).mountainId === mountainId)
      .map((s: any) => s.id as string);

    if (orphanSiIds.length > 0) {
      await withRetry(() => kv.set(SI_INDEX, siIds.filter((id: string) => !orphanSiIds.includes(id))), 'set si index');
      await withRetry(() => kv.mdel(orphanSiIds.map((id: string) => `siLoc:${id}`)), 'mdel si');
    }

    // 6. Find and delete all notes for this mountain
    const noteIds: string[] = (await withRetry(() => kv.get(NOTE_INDEX), 'get note index')) || [];
    const noteKeys = noteIds.map((id: string) => `note:${id}`);
    const noteRecords = noteKeys.length > 0 ? await batchedMget(noteKeys) : [];

    const orphanNoteIds: string[] = noteRecords
      .filter((n): n is Record<string, unknown> => !!n && (n as any).mountainId === mountainId)
      .map((n: any) => n.id as string);

    if (orphanNoteIds.length > 0) {
      await withRetry(() => kv.set(NOTE_INDEX, noteIds.filter((id: string) => !orphanNoteIds.includes(id))), 'set note index');
      await withRetry(() => kv.mdel(orphanNoteIds.map((id: string) => `note:${id}`)), 'mdel notes');
    }

    console.log(`Cascade-deleted mountain ${mountainId}: ${orphanTrailIds.length} trails, ${orphanLocationIds.length} locations, ${orphanAssetIds.length} assets, ${orphanSiIds.length} site inspections, ${orphanNoteIds.length} notes`);
    return c.json({ success: true, deletedTrails: orphanTrailIds.length, deletedLocations: orphanLocationIds.length, deletedAssets: orphanAssetIds.length, deletedSiteInspections: orphanSiIds.length, deletedNotes: orphanNoteIds.length });
  } catch (error) {
    console.error("Error cascade-deleting mountain:", error);
    return c.json({ error: `Failed to delete mountain: ${error}` }, 500);
  }
});

// ─── Trails ───────────────────────────────────────────────────────────────────

app.get("/make-server-a0d4ba78/trails", async (c) => {
  try {
    const trails = await getByIndex(TRAIL_INDEX, "trail:");
    return c.json({ trails });
  } catch (error) {
    console.error("Error fetching trails:", error);
    return c.json({ error: `Failed to fetch trails: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/trails", async (c) => {
  try {
    const trail = await c.req.json();
    await withRetry(() => kv.set(`trail:${trail.id}`, trail), 'set trail');
    await addToIndex(TRAIL_INDEX, trail.id);
    return c.json({ success: true, trail });
  } catch (error) {
    console.error("Error creating trail:", error);
    return c.json({ error: `Failed to create trail: ${error}` }, 500);
  }
});

app.put("/make-server-a0d4ba78/trails/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = (await withRetry(() => kv.get(`trail:${id}`), 'get trail')) as Record<string, unknown> | null;
    const updated = { ...(existing || {}), ...updates, id };
    await withRetry(() => kv.set(`trail:${id}`, updated), 'set trail');
    await addToIndex(TRAIL_INDEX, id);
    return c.json({ success: true, trail: updated });
  } catch (error) {
    console.error("Error updating trail:", error);
    return c.json({ error: `Failed to update trail: ${error}` }, 500);
  }
});

app.delete("/make-server-a0d4ba78/trails/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const trailIds: string[] = (await withRetry(() => kv.get(TRAIL_INDEX), 'get trail index')) || [];
    await withRetry(() => kv.set(TRAIL_INDEX, trailIds.filter((tid: string) => tid !== id)), 'set trail index');
    await withRetry(() => kv.del(`trail:${id}`), 'del trail');
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting trail:", error);
    return c.json({ error: `Failed to delete trail: ${error}` }, 500);
  }
});

// ─── Site Inspections ──────────────────────────────────────────────────────

app.get("/make-server-a0d4ba78/site-inspections", async (c) => {
  try {
    const siteInspections = await getByIndex(SI_INDEX, "siLoc:");
    return c.json({ siteInspections });
  } catch (error) {
    console.error("Error fetching site inspections:", error);
    return c.json({ error: `Failed to fetch site inspections: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/site-inspections", async (c) => {
  try {
    const si = await c.req.json();
    await withRetry(() => kv.set(`siLoc:${si.id}`, si), 'set si');
    await addToIndex(SI_INDEX, si.id);
    return c.json({ success: true, siteInspection: si });
  } catch (error) {
    console.error("Error creating site inspection:", error);
    return c.json({ error: `Failed to create site inspection: ${error}` }, 500);
  }
});

app.put("/make-server-a0d4ba78/site-inspections/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = (await withRetry(() => kv.get(`siLoc:${id}`), 'get si')) as Record<string, unknown> | null;
    const updated = { ...(existing || {}), ...updates, id };
    await withRetry(() => kv.set(`siLoc:${id}`, updated), 'set si');
    await addToIndex(SI_INDEX, id);
    return c.json({ success: true, siteInspection: updated });
  } catch (error) {
    console.error("Error updating site inspection:", error);
    return c.json({ error: `Failed to update site inspection: ${error}` }, 500);
  }
});

app.delete("/make-server-a0d4ba78/site-inspections/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const siIds: string[] = (await withRetry(() => kv.get(SI_INDEX), 'get si index')) || [];
    await withRetry(() => kv.set(SI_INDEX, siIds.filter((sid: string) => sid !== id)), 'set si index');
    await withRetry(() => kv.del(`siLoc:${id}`), 'del si');
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting site inspection:", error);
    return c.json({ error: `Failed to delete site inspection: ${error}` }, 500);
  }
});

// ─── Install Locations ──────��─────────────────────────────────────────────────

app.get("/make-server-a0d4ba78/locations", async (c) => {
  try {
    const locations = await getByIndex(LOCATION_INDEX, "location:");
    return c.json({ locations });
  } catch (error) {
    console.error("Error fetching locations:", error);
    return c.json({ error: `Failed to fetch locations: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/locations", async (c) => {
  try {
    const location = await c.req.json();
    await withRetry(() => kv.set(`location:${location.id}`, location), 'set location');
    await addToIndex(LOCATION_INDEX, location.id);
    return c.json({ success: true, location });
  } catch (error) {
    console.error("Error creating location:", error);
    return c.json({ error: `Failed to create location: ${error}` }, 500);
  }
});

app.put("/make-server-a0d4ba78/locations/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = (await withRetry(() => kv.get(`location:${id}`), 'get location')) as Record<string, unknown> | null;
    const updated = { ...(existing || {}), ...updates, id };
    await withRetry(() => kv.set(`location:${id}`, updated), 'set location');
    await addToIndex(LOCATION_INDEX, id);
    return c.json({ success: true, location: updated });
  } catch (error) {
    console.error("Error updating location:", error);
    return c.json({ error: `Failed to update location: ${error}` }, 500);
  }
});

// Cascade-delete a location + all its assets
app.delete("/make-server-a0d4ba78/locations/:id/cascade", async (c) => {
  try {
    const locationId = c.req.param("id");

    // 1. Remove location from index + delete its KV entry
    const locationIds: string[] = (await withRetry(() => kv.get(LOCATION_INDEX), 'get location index')) || [];
    await withRetry(() => kv.set(LOCATION_INDEX, locationIds.filter((id: string) => id !== locationId)), 'set location index');
    await withRetry(() => kv.del(`location:${locationId}`), 'del location');

    // 2. Find all assets for this location, delete each one
    const assetIds: string[] = (await withRetry(() => kv.get(ASSET_INDEX), 'get asset index')) || [];
    const assetKeys = assetIds.map((id: string) => `asset:${id}`);
    const assetRecords = assetKeys.length > 0 ? await batchedMget(assetKeys) : [];

    const orphanAssetIds: string[] = assetRecords
      .filter((a): a is Record<string, unknown> => !!a && (a as any).locationId === locationId)
      .map((a: any) => a.id as string);

    if (orphanAssetIds.length > 0) {
      await withRetry(() => kv.set(ASSET_INDEX, assetIds.filter((id: string) => !orphanAssetIds.includes(id))), 'set asset index');
      await withRetry(() => kv.mdel(orphanAssetIds.map((id: string) => `asset:${id}`)), 'mdel assets');
    }

    console.log(`Cascade-deleted location ${locationId}: ${orphanAssetIds.length} assets`);
    return c.json({ success: true, deletedAssets: orphanAssetIds.length });
  } catch (error) {
    console.error("Error cascade-deleting location:", error);
    return c.json({ error: `Failed to delete location: ${error}` }, 500);
  }
});

// ─── Assets ───────────────────────────────────────────────────────────────────

app.get("/make-server-a0d4ba78/assets", async (c) => {
  try {
    const raw = await getByIndex(ASSET_INDEX, "asset:");
    // Strip photo fields — photos live client-side in IndexedDB only.
    const assets = raw.map(stripPhotos);
    return c.json({ assets });
  } catch (error) {
    console.error("Error fetching assets:", error);
    return c.json({ error: `Failed to fetch assets: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/assets", async (c) => {
  try {
    const asset = await c.req.json();
    // Always strip photos before persisting — photos belong in IndexedDB only
    const safeAsset = stripPhotos(asset as Record<string, unknown>);
    await withRetry(() => kv.set(`asset:${safeAsset.id}`, safeAsset), 'set asset');
    await addToIndex(ASSET_INDEX, safeAsset.id as string);
    return c.json({ success: true, asset: safeAsset });
  } catch (error) {
    console.error("Error creating asset:", error);
    return c.json({ error: `Failed to create asset: ${error}` }, 500);
  }
});

app.put("/make-server-a0d4ba78/assets/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = (await withRetry(() => kv.get(`asset:${id}`), 'get asset')) as Record<string, unknown> | null;
    if (!existing) {
      const safeUpdates = stripPhotos(updates as Record<string, unknown>);
      await withRetry(() => kv.set(`asset:${id}`, { ...safeUpdates, id }), 'set asset');
      await addToIndex(ASSET_INDEX, id);
      return c.json({ success: true, asset: safeUpdates });
    }
    const updated = stripPhotos({ ...existing, ...updates } as Record<string, unknown>);
    await withRetry(() => kv.set(`asset:${id}`, updated), 'set asset');
    await addToIndex(ASSET_INDEX, id);
    return c.json({ success: true, asset: updated });
  } catch (error) {
    console.error("Error updating asset:", error);
    return c.json({ error: `Failed to update asset: ${error}` }, 500);
  }
});

app.delete("/make-server-a0d4ba78/assets/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const assetIds: string[] = (await withRetry(() => kv.get(ASSET_INDEX), 'get asset index')) || [];
    await withRetry(() => kv.set(ASSET_INDEX, assetIds.filter((aid: string) => aid !== id)), 'set asset index');
    await withRetry(() => kv.del(`asset:${id}`), 'del asset');
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting asset:", error);
    return c.json({ error: `Failed to delete asset: ${error}` }, 500);
  }
});

// ─── Notes ────────────────────────────────────────────────────────────────────

app.get("/make-server-a0d4ba78/notes", async (c) => {
  try {
    const notes = await getByIndex(NOTE_INDEX, "note:");
    return c.json({ notes });
  } catch (error) {
    console.error("Error fetching notes:", error);
    return c.json({ error: `Failed to fetch notes: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/notes", async (c) => {
  try {
    const note = await c.req.json();
    await withRetry(() => kv.set(`note:${note.id}`, note), 'set note');
    await addToIndex(NOTE_INDEX, note.id);
    return c.json({ success: true, note });
  } catch (error) {
    console.error("Error creating note:", error);
    return c.json({ error: `Failed to create note: ${error}` }, 500);
  }
});

app.put("/make-server-a0d4ba78/notes/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = (await withRetry(() => kv.get(`note:${id}`), 'get note')) as Record<string, unknown> | null;
    const updated = { ...(existing || {}), ...updates, id };
    await withRetry(() => kv.set(`note:${id}`, updated), 'set note');
    await addToIndex(NOTE_INDEX, id);
    return c.json({ success: true, note: updated });
  } catch (error) {
    console.error("Error updating note:", error);
    return c.json({ error: `Failed to update note: ${error}` }, 500);
  }
});

app.delete("/make-server-a0d4ba78/notes/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const noteIds: string[] = (await withRetry(() => kv.get(NOTE_INDEX), 'get note index')) || [];
    await withRetry(() => kv.set(NOTE_INDEX, noteIds.filter((nid: string) => nid !== id)), 'set note index');
    await withRetry(() => kv.del(`note:${id}`), 'del note');
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting note:", error);
    return c.json({ error: `Failed to delete note: ${error}` }, 500);
  }
});

// ─── Options (custom dropdown values, shared across all mountains) ───────────

app.get("/make-server-a0d4ba78/options", async (c) => {
  try {
    const options = (await withRetry(() => kv.get("all:options"), 'get options')) as Record<string, string[]> | null;
    return c.json({ options: options || {} });
  } catch (error) {
    console.error("Error fetching options:", error);
    return c.json({ error: `Failed to fetch options: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/options", async (c) => {
  try {
    const { key, value } = await c.req.json();
    if (!key || !value) return c.json({ error: "key and value are required" }, 400);
    const current = ((await withRetry(() => kv.get("all:options"), 'get options')) as Record<string, string[]> | null) || {};
    const arr: string[] = current[key] ? [...current[key]] : [];
    if (!arr.includes(value)) {
      arr.push(value);
      arr.sort((a, b) => a.localeCompare(b));
    }
    const updated = { ...current, [key]: arr };
    await withRetry(() => kv.set("all:options", updated), 'set options');
    return c.json({ options: updated });
  } catch (error) {
    console.error("Error saving option:", error);
    return c.json({ error: `Failed to save option: ${error}` }, 500);
  }
});

app.delete("/make-server-a0d4ba78/options", async (c) => {
  try {
    const { key, value } = await c.req.json();
    if (!key || !value) return c.json({ error: "key and value are required" }, 400);
    const current = ((await withRetry(() => kv.get("all:options"), 'get options')) as Record<string, string[]> | null) || {};
    const arr: string[] = (current[key] || []).filter((v: string) => v !== value);
    const updated = { ...current, [key]: arr };
    await withRetry(() => kv.set("all:options", updated), 'set options');
    return c.json({ options: updated });
  } catch (error) {
    console.error("Error deleting option:", error);
    return c.json({ error: `Failed to delete option: ${error}` }, 500);
  }
});

// ─── Item Prices ──────────────────────────────────────────────────────────────

app.get("/make-server-a0d4ba78/item-prices", async (c) => {
  try {
    const prices = (await withRetry(() => kv.get("all:itemPrices"), 'get item prices')) as Record<string, number> | null;
    return c.json({ prices: prices || {} });
  } catch (error) {
    console.error("Error fetching item prices:", error);
    return c.json({ error: `Failed to fetch item prices: ${error}` }, 500);
  }
});

app.post("/make-server-a0d4ba78/item-prices", async (c) => {
  try {
    const { name, price } = await c.req.json();
    if (!name) return c.json({ error: "name is required" }, 400);
    const current = ((await withRetry(() => kv.get("all:itemPrices"), 'get item prices')) as Record<string, number> | null) || {};
    let updated: Record<string, number>;
    if (price === null || price === undefined) {
      const { [name]: _, ...rest } = current;
      updated = rest;
    } else {
      updated = { ...current, [name]: Number(price) };
    }
    await withRetry(() => kv.set("all:itemPrices", updated), 'set item prices');
    return c.json({ prices: updated });
  } catch (error) {
    console.error("Error saving item price:", error);
    return c.json({ error: `Failed to save item price: ${error}` }, 500);
  }
});

// ─── Google Places (proxy — keeps API key server-side) ─────────────────────────

app.get("/make-server-a0d4ba78/places/autocomplete", async (c) => {
  try {
    const input = c.req.query("input");
    if (!input || input.length < 2) return c.json({ suggestions: [] });
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) return c.json({ error: "GOOGLE_PLACES_API_KEY not configured" }, 500);
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json() as any;
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.log("Places autocomplete API error:", data.status, data.error_message);
      return c.json({ error: `Places API: ${data.status}` }, 500);
    }
    const suggestions = (data.predictions || []).map((p: any) => ({
      placeId: p.place_id,
      description: p.description,
    }));
    return c.json({ suggestions });
  } catch (error) {
    console.error("Error fetching place autocomplete:", error);
    return c.json({ error: `Failed to fetch autocomplete: ${error}` }, 500);
  }
});

app.get("/make-server-a0d4ba78/places/details", async (c) => {
  try {
    const placeId = c.req.query("place_id");
    if (!placeId) return c.json({ error: "place_id required" }, 400);
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) return c.json({ error: "GOOGLE_PLACES_API_KEY not configured" }, 500);
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,formatted_address,geometry&key=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json() as any;
    if (data.status !== "OK") {
      console.log("Places details API error:", data.status, data.error_message);
      return c.json({ error: `Places API: ${data.status}` }, 500);
    }
    const result = data.result;
    return c.json({
      name: result.name,
      address: result.formatted_address,
      location: result.geometry?.location ?? null,
    });
  } catch (error) {
    console.error("Error fetching place details:", error);
    return c.json({ error: `Failed to fetch place details: ${error}` }, 500);
  }
});

app.get("/make-server-a0d4ba78/places/geocode", async (c) => {
  try {
    const address = c.req.query("address");
    if (!address) return c.json({ location: null });
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) return c.json({ location: null });
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json() as any;
    if (data.status !== "OK" || !data.results?.length) return c.json({ location: null });
    const location = data.results[0]?.geometry?.location ?? null;
    return c.json({ location });
  } catch (error) {
    console.error("Error geocoding address:", error);
    return c.json({ location: null });
  }
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

// POST /auth/login  { password } → { token } or 401
app.post("/make-server-a0d4ba78/auth/login", async (c) => {
  try {
    const { password } = await c.req.json();
    const correctPassword = Deno.env.get("BUILDER_PASSWORD");
    if (!correctPassword) {
      console.error("BUILDER_PASSWORD env var not set");
      return c.json({ error: "Auth not configured on server" }, 500);
    }
    if (password !== correctPassword) {
      return c.json({ error: "Invalid password" }, 401);
    }
    const token = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    await withRetry(() => kv.set(`session:${token}`, { token, createdAt: now.toISOString(), expiresAt }), "set session");
    return c.json({ token });
  } catch (error) {
    console.error("Auth login error:", error);
    return c.json({ error: `Login failed: ${error}` }, 500);
  }
});

// POST /auth/verify  { token } → { valid: bool }
app.post("/make-server-a0d4ba78/auth/verify", async (c) => {
  try {
    const { token } = await c.req.json();
    if (!token) return c.json({ valid: false });
    const session = await withRetry(() => kv.get(`session:${token}`), "get session") as { expiresAt: string } | null;
    if (!session) return c.json({ valid: false });
    if (new Date(session.expiresAt) < new Date()) {
      await withRetry(() => kv.del(`session:${token}`), "del expired session");
      return c.json({ valid: false });
    }
    return c.json({ valid: true });
  } catch (error) {
    console.error("Auth verify error:", error);
    return c.json({ valid: false });
  }
});

// DELETE /auth/logout  { token } → { success }
app.delete("/make-server-a0d4ba78/auth/logout", async (c) => {
  try {
    const { token } = await c.req.json();
    if (token) await withRetry(() => kv.del(`session:${token}`), "del session");
    return c.json({ success: true });
  } catch (error) {
    console.error("Auth logout error:", error);
    return c.json({ success: false });
  }
});

Deno.serve(app.fetch);