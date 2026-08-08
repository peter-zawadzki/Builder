// Ensures a thin "content" template exists in Postmark, wrapped in the
// YULLRMAIN-1 layout (logo + footer already defined there) — a Postmark
// Layout only wraps Standard templates, not raw /email sends, so the digest
// needs a real (if minimal) template resource to attach to it. All actual
// formatting/content is still generated server-side in render.ts and passed
// through as one HTML blob via the `content` merge variable.
const DIGEST_TEMPLATE_ALIAS = "daily-digest";
const LAYOUT_ALIAS = "YULLRMAIN-1";

function postmarkHeaders(token: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Postmark-Server-Token": token,
  };
}

export async function ensureDigestTemplate(): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.POSTMARK_API_KEY;
  if (!token) return { ok: false, error: "POSTMARK_API_KEY not configured" };

  const headers = postmarkHeaders(token);
  const body = {
    Name: "Daily Digest (content)",
    Subject: "{{subject}}",
    HtmlBody: "{{{content}}}",
    TextBody: "{{content}}",
    LayoutTemplate: LAYOUT_ALIAS,
  };

  const existing = await fetch(`https://api.postmarkapp.com/templates/${DIGEST_TEMPLATE_ALIAS}`, { headers });
  if (existing.ok) {
    const res = await fetch(`https://api.postmarkapp.com/templates/${DIGEST_TEMPLATE_ALIAS}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `Update failed: ${res.status} ${await res.text().catch(() => "")}` };
    return { ok: true };
  }

  const res = await fetch("https://api.postmarkapp.com/templates", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, Alias: DIGEST_TEMPLATE_ALIAS, TemplateType: "Standard" }),
  });
  if (!res.ok) return { ok: false, error: `Create failed: ${res.status} ${await res.text().catch(() => "")}` };
  return { ok: true };
}

export { DIGEST_TEMPLATE_ALIAS };
