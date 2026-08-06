// A small, hand-maintained "where do I find X" sitemap for the FAQ agent.
// "Where is X located in the app" questions are navigational, not
// implementation questions — grep-ing component source to reverse-engineer
// the Resource Center's tab structure is unreliable and slow (the agent has
// no innate sense that a tab labeled "Brand Assets" is what the user means by
// "logos"). This is authoritative, always in context (same pattern as the
// FAQ set), and should be preferred over code search whenever a question is
// really about locating something rather than how a feature works.
// Resource Center tabs are URL-addressable (?tab=<id>, ResourceCenter.tsx's
// ResourceCenterPage) — give the exact deep link, not just the base route,
// whenever a specific tab is what the user actually wants.
export const APP_NAVIGATION = `
- Resource Center (route: /resources) — reached from the profile menu (top-right avatar) → "Resource Center", or the "?" Help icon in the header (opens a compact version of it, without these tabs). Tabs, each deep-linkable:
  - FAQ — /resources?tab=faq — this chat, plus the curated FAQ list. (Also the default if you just link /resources.)
  - Training Documents — /resources?tab=training
  - Sales Tools — /resources?tab=sales — one-pagers, install overview, pricing sheet.
  - Marketing Assets — /resources?tab=marketing
  - Brand Assets — /resources?tab=logos — brand color palette, fonts, and "Logo Variants" (every logo shape/color combo, downloadable as PNG/WEBP/EPS/AI).
  - Demo Hub — /resources?tab=demo — demo links and the sales pipeline walkthrough.
- Mountains (route: /mountains) — the list of mountains/resorts; each mountain's page has its Projects, Proposals, Trails, Site Assessments, Inventory, and Documents.
- People & Contacts (route: /crm) — Contacts, Organizations, and Teams tabs (/crm?tab=contacts, ?tab=organizations, ?tab=teams).
- Inventory (route: /inventory) — the equipment catalog.
`.trim();
