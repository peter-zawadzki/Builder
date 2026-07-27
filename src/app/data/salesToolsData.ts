// Manifest for the Resource Center's Sales Tools tab. Files live in
// public/resource-assets/sales-tools/ (dropped in via the "Sales Tools"
// staging folder — same pattern as logoAssets.ts/demoHubData.ts), so these
// are root-relative public paths. Hand-maintained: add an entry here
// whenever a new file lands in that staging folder.
export interface SalesTool {
  label: string;
  type: 'PDF' | 'PNG';
  url: string;
  sizeKB: number;
}

const BASE = '/resource-assets/sales-tools';

export const SALES_TOOLS: SalesTool[] = [
  {
    label: 'YULLR Coaches One Pager',
    type: 'PDF',
    url: `${BASE}/YULLR Coaches One Pager.pdf`,
    sizeKB: 9814,
  },
  {
    label: 'YULLR Install Overview',
    type: 'PNG',
    url: `${BASE}/YULLR Install Overview.png`,
    sizeKB: 2258,
  },
];
