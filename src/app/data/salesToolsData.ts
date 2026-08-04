// Manifest for the Resource Center's Sales Tools tab. Files live in
// public/resource-assets/sales-tools/ (dropped in via the "Sales Tools"
// staging folder — same pattern as logoAssets.ts/demoHubData.ts), so these
// are root-relative public paths. Hand-maintained: add an entry here
// whenever a new file lands in that staging folder.
export interface SalesTool {
  label: string;
  type: 'PDF' | 'PNG';
  url: string;
  // For PDFs, a pre-rendered first-page thumbnail (there's no in-browser way
  // to rasterize a PDF for a preview image, so this is generated up front —
  // `sips -s format png file.pdf --out thumb.png` on macOS — and committed
  // alongside it). For PNGs, a downscaled copy of the same image.
  thumbnailUrl: string;
  sizeKB: number;
}

const BASE = '/resource-assets/sales-tools';

export const SALES_TOOLS: SalesTool[] = [
  {
    label: 'YULLR Coaches One Pager',
    type: 'PDF',
    url: `${BASE}/YULLR Coaches One Pager.pdf`,
    thumbnailUrl: `${BASE}/thumbnails/coaches-one-pager.png`,
    sizeKB: 9814,
  },
  {
    label: 'YULLR Install Overview',
    type: 'PNG',
    url: `${BASE}/YULLR Install Overview.png`,
    thumbnailUrl: `${BASE}/thumbnails/install-overview.png`,
    sizeKB: 2258,
  },
  {
    label: 'YULLR Subscription Pricing',
    type: 'PDF',
    url: `${BASE}/YULLR Subscription Pricing.pdf`,
    thumbnailUrl: `${BASE}/thumbnails/subscription-pricing.png`,
    sizeKB: 253,
  },
];
