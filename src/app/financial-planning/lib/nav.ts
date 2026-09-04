export interface NavItem {
  href: string;
  label: string;
  status: 'live' | 'stub';
}

// Mounted under /financial-planning in Builder's router (see src/app/routes.tsx) —
// hrefs are absolute paths under that prefix, not bare Next.js App Router paths.
const BASE = '/financial-planning';

export const NAV_ITEMS: NavItem[] = [
  { href: `${BASE}/dashboard`, label: 'Dashboard', status: 'live' },
  { href: `${BASE}/mountain-growth`, label: 'Mountain Growth', status: 'live' },
  { href: `${BASE}/adoption-customers`, label: 'Adoption & Customers', status: 'live' },
  { href: `${BASE}/pricing-revenue`, label: 'Pricing & Revenue', status: 'live' },
  { href: `${BASE}/staffing`, label: 'Staffing', status: 'live' },
  { href: `${BASE}/contractors`, label: 'Contractors', status: 'live' },
  { href: `${BASE}/ga`, label: 'G&A', status: 'live' },
  { href: `${BASE}/operating-expenses`, label: 'Operating Expenses', status: 'live' },
  { href: `${BASE}/inventory-capex`, label: 'Inventory & CapEx', status: 'live' },
  { href: `${BASE}/cash-capital`, label: 'Cash & Capital', status: 'live' },
  { href: `${BASE}/profitability`, label: 'Profitability', status: 'live' },
  { href: `${BASE}/capital-efficiency`, label: 'Capital Efficiency', status: 'live' },
  { href: `${BASE}/cap-table`, label: 'Cap Table', status: 'live' },
  { href: `${BASE}/scenario-library`, label: 'Scenario Library', status: 'live' },
  { href: `${BASE}/model-explorer`, label: 'Model Explorer', status: 'live' },
];
