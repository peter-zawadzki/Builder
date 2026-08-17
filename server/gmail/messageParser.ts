// Pure header/body parsing over a Gmail API message object — no I/O, so this
// is easy to exercise with hand-built fixtures.
import type { gmail_v1 } from "googleapis";

export interface ParsedHeaders {
  messageIdHeader: string | null;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: string | null;
  listUnsubscribe: string | null;
  precedence: string | null;
}

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | null {
  const h = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

// "Jane Doe" <jane@x.com>, jane@x.com  ->  jane@x.com
export function normalizeEmail(addr: string): string {
  const match = /<([^>]+)>/.exec(addr);
  const raw = (match ? match[1] : addr).trim();
  return raw.toLowerCase();
}

function splitAddressList(value: string | null): string[] {
  if (!value) return [];
  // Split on commas outside quoted display names.
  return value
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(normalizeEmail);
}

export function parseMessageHeaders(message: gmail_v1.Schema$Message): ParsedHeaders {
  const headers = message.payload?.headers;
  return {
    messageIdHeader: headerValue(headers, "Message-ID"),
    from: normalizeEmail(headerValue(headers, "From") ?? ""),
    to: splitAddressList(headerValue(headers, "To")),
    cc: splitAddressList(headerValue(headers, "Cc")),
    subject: headerValue(headers, "Subject") ?? "(no subject)",
    date: headerValue(headers, "Date"),
    listUnsubscribe: headerValue(headers, "List-Unsubscribe"),
    precedence: headerValue(headers, "Precedence"),
  };
}

const NO_REPLY_PATTERN = /^(no-?reply|do-?not-?reply|mailer-daemon|notifications?|noreply)[@.]/i;

function walkParts(part: gmail_v1.Schema$MessagePart | undefined, visit: (p: gmail_v1.Schema$MessagePart) => void): void {
  if (!part) return;
  visit(part);
  for (const child of part.parts ?? []) walkParts(child, visit);
}

export function isBulkOrAutomated(headers: ParsedHeaders, payload: gmail_v1.Schema$MessagePart | undefined): boolean {
  if (headers.listUnsubscribe) return true;
  if (headers.precedence?.toLowerCase() === "bulk") return true;
  if (NO_REPLY_PATTERN.test(headers.from)) return true;
  let hasCalendarPart = false;
  walkParts(payload, (p) => {
    if (p.mimeType === "text/calendar") hasCalendarPart = true;
  });
  return hasCalendarPart;
}

const MAX_BODY_CHARS = 20_000;

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractPlainTextBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  let plain: string | null = null;
  let html: string | null = null;
  walkParts(payload, (p) => {
    const data = p.body?.data;
    if (!data) return;
    if (p.mimeType === "text/plain" && !plain) plain = decodeBase64Url(data);
    if (p.mimeType === "text/html" && !html) html = decodeBase64Url(data);
  });
  const body = plain ?? (html ? stripHtml(html) : "");
  return body.slice(0, MAX_BODY_CHARS);
}
