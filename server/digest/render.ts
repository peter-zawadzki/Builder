// Builds the inner content HTML for one person's daily digest. This is sent
// through the "daily-digest" Postmark template (server/digest/
// postmarkTemplate.ts), which wraps it in the YULLRMAIN-1 layout — that
// layout supplies the logo and footer, so this only needs to render the
// body: real brand colors (src/app/data/brandStyle.ts), clearly separated
// sections, no duplicate header/footer.
import type { UserDigestItems, DigestActionItem, DigestStaleItem } from "./gatherItems";

const COLOR = {
  orange: "#FF5C39", // YULLR Orange — accents, section markers
  blue: "#307FE2", // Mountain Blue — links
  darkText: "#1D252D", // primary headings
  bodyText: "#4A5157", // body copy
  muted: "#8992A0",
  cardBg: "#F7F8FA",
  border: "rgba(29,37,45,0.08)",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function mountainLink(appBaseUrl: string, mountainId: string | null, label: string): string {
  if (!mountainId) return escapeHtml(label);
  return `<a href="${appBaseUrl}/mountains/${mountainId}" style="color:${COLOR.blue}; text-decoration:none; font-weight:600;">${escapeHtml(label)}</a>`;
}

function renderActionRow(item: DigestActionItem, appBaseUrl: string): string {
  return `<li style="margin-bottom:8px;">${mountainLink(appBaseUrl, item.mountainId, item.mountainName)} — ${escapeHtml(item.text)}</li>`;
}

function renderStaleRow(item: DigestStaleItem, appBaseUrl: string): string {
  const days = Math.floor((Date.now() - new Date(item.sinceDate).getTime()) / (1000 * 60 * 60 * 24));
  const kindLabel = item.kind === "project" ? "Project" : "Proposal";
  return `<li style="margin-bottom:8px;">${mountainLink(appBaseUrl, item.mountainId, item.mountainName)} — ${kindLabel} "${escapeHtml(item.name)}" hasn't moved in about ${days} days</li>`;
}

// Each section is its own card — a colored left border + light background
// so the three categories are visually distinct at a glance, not just
// separated by a heading.
function section(title: string, rowsHtml: string[]): string {
  if (rowsHtml.length === 0) return "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr>
        <td style="background:${COLOR.cardBg}; border-left:3px solid ${COLOR.orange}; border-radius:6px; padding:14px 16px;">
          <p style="margin:0 0 8px; color:${COLOR.darkText}; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em;">${escapeHtml(title)}</p>
          <ul style="margin:0; padding-left:18px; color:${COLOR.bodyText}; font-size:13px; line-height:1.6;">
            ${rowsHtml.join("\n")}
          </ul>
        </td>
      </tr>
    </table>`;
}

export function renderDigestEmail(opts: {
  name: string;
  companySummary: string | null;
  items: UserDigestItems;
  appBaseUrl: string;
}): { subject: string; html: string } {
  const { name, companySummary, items, appBaseUrl } = opts;
  const firstName = name.split(" ")[0] || name;

  // Outstanding (incomplete) action items lead the list — the ones most
  // likely to need attention — followed by anything newly assigned (notes,
  // or a project you now own).
  const actionItemRows = [
    ...items.outstandingActions.map((i) => renderActionRow(i, appBaseUrl)),
    ...items.newItems.map((i) => renderActionRow(i, appBaseUrl)),
  ];

  const sections = [
    section("Your Action Items", actionItemRows),
    section("Stale — no movement in 5+ business days", items.staleItems.map((i) => renderStaleRow(i, appBaseUrl))),
  ].join("");

  const nothingPersonal = actionItemRows.length === 0 && items.staleItems.length === 0;

  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width:600px; margin:0 auto;">
      <h1 style="color:${COLOR.darkText}; font-size:20px; margin:0 0 20px;">Good morning, ${escapeHtml(firstName)}</h1>

      ${companySummary ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr>
            <td style="border-top:2px solid ${COLOR.orange}; padding-top:12px;">
              <p style="margin:0 0 8px; color:${COLOR.darkText}; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em;">What's happening in Builder</p>
              ${companySummary.split(/\n\s*\n/).map((para) => `<p style="color:${COLOR.bodyText}; font-size:13px; line-height:1.6; margin:0 0 10px;">${escapeHtml(para.trim())}</p>`).join("")}
            </td>
          </tr>
        </table>` : ""}

      ${sections}

      ${nothingPersonal ? `<p style="color:${COLOR.muted}; font-size:13px;">Nothing outstanding assigned to you right now — nice work staying on top of things.</p>` : ""}

      <p style="color:${COLOR.muted}; font-size:11px; margin-top:8px;">
        Manage this in your Builder profile menu (Daily digest: On/Off).
      </p>
    </div>`;

  return { subject: "YULLR Builder — Daily Digest", html };
}
