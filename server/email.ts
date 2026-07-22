// Postmark integration — real outbound email for proposal/customer-agreement
// send + countersign-complete notifications. Replaces the dead Supabase Edge
// Function that used to (silently, since its env var was never set) no-op.
export async function sendEmail({
  to,
  cc,
  subject,
  html,
}: {
  to: string;
  cc?: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const token = process.env.POSTMARK_API_KEY;
  const from = process.env.POSTMARK_FROM;
  if (!token || !from) {
    console.warn("Postmark not configured (POSTMARK_API_KEY/POSTMARK_FROM) — skipping email send");
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: from,
        To: to,
        ...(cc ? { Cc: cc } : {}),
        Subject: subject,
        HtmlBody: html,
        MessageStream: "outbound",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Postmark send failed:", res.status, body);
      return { ok: false, error: `Postmark ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("Postmark send error:", e);
    return { ok: false, error: String(e) };
  }
}

// Sends using a Postmark template (subject/body live in Postmark itself, not
// in this codebase) — used for the proposal-ready email, which uses the
// "proposal" template alias with a `product_url` merge variable.
export async function sendTemplateEmail({
  to,
  cc,
  templateAlias,
  templateId,
  model,
}: {
  to: string;
  cc?: string;
  templateAlias?: string;
  templateId?: number;
  model: Record<string, unknown>;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const token = process.env.POSTMARK_API_KEY;
  const from = process.env.POSTMARK_FROM;
  if (!token || !from) {
    console.warn("Postmark not configured (POSTMARK_API_KEY/POSTMARK_FROM) — skipping email send");
    return { ok: false, skipped: true };
  }
  if (!templateAlias && !templateId) {
    return { ok: false, error: "sendTemplateEmail requires templateAlias or templateId" };
  }
  try {
    const res = await fetch("https://api.postmarkapp.com/email/withTemplate", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: from,
        To: to,
        ...(cc ? { Cc: cc } : {}),
        ...(templateId ? { TemplateId: templateId } : { TemplateAlias: templateAlias }),
        TemplateModel: model,
        MessageStream: "outbound",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Postmark template send failed:", res.status, body);
      return { ok: false, error: `Postmark ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("Postmark template send error:", e);
    return { ok: false, error: String(e) };
  }
}
