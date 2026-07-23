// crypto.randomUUID() is spec'd to only exist in secure contexts (HTTPS or
// localhost) — browsers throw "crypto.randomUUID is not a function" over
// plain HTTP on anything else (e.g. a bare IP), which breaks every "create"
// action in the app. crypto.getRandomValues() has no such restriction, so
// fall back to building a UUID v4 from it when randomUUID isn't present.
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
