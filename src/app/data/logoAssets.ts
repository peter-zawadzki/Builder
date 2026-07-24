// Manifest for the Resource Center's Logo Files tab. Files live in
// public/resource-assets/logos/ (copied in from the shared "YULLR LOGOS
// (MASTER)" folder) — Vite serves public/ as static files, so these are
// just root-relative URLs, not imports. There's no backend/S3 wiring for
// this yet (deliberately deferred), so this manifest is maintained by hand;
// update it when new logo files are added.
export interface LogoFormat {
  label: string;       // shown on the download button, e.g. "PNG"
  url: string;
  sizeKB?: number;
}

export interface LogoGroup {
  id: string;
  label: string;        // e.g. "Circle — Orange"
  previewUrl: string | null; // a raster (png/webp) to render as a thumbnail; null = no preview available yet
  formats: LogoFormat[];
}

const BASE = '/resource-assets/logos';

export const LOGO_GROUPS: LogoGroup[] = [
  {
    id: 'circle-orange',
    label: 'Circle — Orange',
    previewUrl: `${BASE}/Circle_Orange/yullr_logo_circle_text_orange.png`,
    formats: [
      { label: 'PNG', url: `${BASE}/Circle_Orange/yullr_logo_circle_text_orange.png` },
      { label: 'WEBP', url: `${BASE}/Circle_Orange/yullr_logo_circle_text_orange.webp` },
      { label: 'EPS', url: `${BASE}/Circle_Orange/yullr_logo_circle_text_orange.eps` },
    ],
  },
  {
    id: 'circle-white',
    label: 'Circle — White',
    previewUrl: `${BASE}/Circle_White/yullr_logo_circle_text_white.png`,
    formats: [
      { label: 'PNG', url: `${BASE}/Circle_White/yullr_logo_circle_text_white.png` },
      { label: 'WEBP', url: `${BASE}/Circle_White/yullr_logo_circle_text_white.webp` },
      { label: 'EPS', url: `${BASE}/Circle_White/yullr_logo_circle_text_white.eps` },
    ],
  },
  {
    id: 'icon-orange',
    label: 'Icon (no text) — Orange',
    previewUrl: `${BASE}/Icon_Orange/yullr_logo_no_text_orange.png`,
    formats: [
      { label: 'PNG', url: `${BASE}/Icon_Orange/yullr_logo_no_text_orange.png` },
      { label: 'WEBP', url: `${BASE}/Icon_Orange/yullr_logo_no_text_orange.webp` },
      { label: 'EPS', url: `${BASE}/Icon_Orange/yullr_logo_no_text_orange.eps` },
    ],
  },
  {
    id: 'icon-white',
    label: 'Icon (no text) — White',
    previewUrl: `${BASE}/Icon_White/yullr_logo_no_text_white.png`,
    formats: [
      { label: 'PNG', url: `${BASE}/Icon_White/yullr_logo_no_text_white.png` },
      { label: 'WEBP', url: `${BASE}/Icon_White/yullr_logo_no_text_white.webp` },
      { label: 'EPS', url: `${BASE}/Icon_White/yullr_logo_no_text_white.eps` },
    ],
  },
  {
    id: 'square-orange',
    label: 'Square — Orange',
    previewUrl: `${BASE}/Square_Orange/yullr_logo_square_text_orange.png`,
    formats: [
      { label: 'PNG', url: `${BASE}/Square_Orange/yullr_logo_square_text_orange.png` },
      { label: 'WEBP', url: `${BASE}/Square_Orange/yullr_logo_square_text_orange.webp` },
      { label: 'EPS', url: `${BASE}/Square_Orange/yullr_logo_square_text_orange.eps` },
    ],
  },
  {
    id: 'square-white',
    label: 'Square — White',
    previewUrl: `${BASE}/Square_White/yullr_logo_square_text_white.png`,
    formats: [
      { label: 'PNG', url: `${BASE}/Square_White/yullr_logo_square_text_white.png` },
      { label: 'WEBP', url: `${BASE}/Square_White/yullr_logo_square_text_white.webp` },
      { label: 'EPS', url: `${BASE}/Square_White/yullr_logo_square_text_white.eps` },
    ],
  },
  {
    id: 'wide-orange',
    label: 'Wide — Orange',
    previewUrl: `${BASE}/Wide_Orange/yullr_logo_wide_text_orange.png`,
    formats: [
      { label: 'PNG', url: `${BASE}/Wide_Orange/yullr_logo_wide_text_orange.png` },
      { label: 'WEBP', url: `${BASE}/Wide_Orange/yullr_logo_wide_text_orange.webp` },
      { label: 'EPS', url: `${BASE}/Wide_Orange/yullr_logo_wide_text_orange.eps` },
    ],
  },
  {
    id: 'wide-white',
    label: 'Wide — White',
    previewUrl: `${BASE}/Wide_White/yullr_logo_wide_text_white.png`,
    formats: [
      { label: 'PNG', url: `${BASE}/Wide_White/yullr_logo_wide_text_white.png` },
      { label: 'WEBP', url: `${BASE}/Wide_White/yullr_logo_wide_text_white.webp` },
      { label: 'EPS', url: `${BASE}/Wide_White/yullr_logo_wide_text_white.eps` },
    ],
  },
];

// Raw Adobe Illustrator/EPS source files — not tied to one specific color
// variant above, so listed separately as a flat downloads list.
export const LOGO_SOURCE_FILES: LogoFormat[] = [
  { label: 'Circle logo (text) — AI', url: `${BASE}/Illistrator/yullr_logo_circle_text_orange.ai` },
  { label: 'Icon (no text) — AI', url: `${BASE}/Illistrator/yullr_logo_no_text.ai` },
  { label: 'Square logo (text) — AI', url: `${BASE}/Illistrator/yullr_logo_square_text.ai` },
  { label: 'Text only — EPS', url: `${BASE}/Illistrator/yullr_logo_text_only.eps` },
  { label: 'Wide logo (text) — AI', url: `${BASE}/Illistrator/yullr_logo_wide_text.ai` },
];
