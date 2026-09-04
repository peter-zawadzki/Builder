// Model Explorer registry: one entry per material engine key, giving UI label, source
// provenance (sheet/range), classification and primary UI destination. This is the
// "completeness guarantee" layer described in spec §18 — every row here is queryable
// and diffable against the live scenario value at runtime; it is not itself a formula.
export type ModelItemClassification = 'input' | 'preset' | 'schedule' | 'calculated';

export interface ModelItemDefinition {
  key: string;
  label: string;
  domain: string;
  classification: ModelItemClassification;
  unit: 'currency' | 'percent' | 'count' | 'ratio' | 'text';
  period: 'annual' | 'monthly' | 'scalar';
  sourceSheet: string;
  sourceRange: string;
  uiPage: string;
}

export const ANNUAL_MODEL_ITEMS: ModelItemDefinition[] = [
  { key: 'growthPreset', label: 'Growth Preset', domain: 'Scenario', classification: 'preset', unit: 'text', period: 'scalar', sourceSheet: 'Scenario Planner', sourceRange: 'B2', uiPage: 'Mountain Growth' },
  { key: 'adoptionPreset', label: 'Adoption Preset', domain: 'Scenario', classification: 'preset', unit: 'text', period: 'scalar', sourceSheet: 'Scenario Planner', sourceRange: 'B3', uiPage: 'Adoption & Customers' },
  { key: 'newAreaRevenueFraction', label: 'Current-Year New-Area Revenue Fraction', domain: 'Mountain Growth', classification: 'input', unit: 'percent', period: 'scalar', sourceSheet: 'Scenario Planner', sourceRange: 'D9', uiPage: 'Mountain Growth' },
  { key: 'subscriptionCogsPct', label: 'Subscription COGS %', domain: 'Profitability', classification: 'input', unit: 'percent', period: 'scalar', sourceSheet: 'Scenario Planner', sourceRange: 'D34', uiPage: 'Profitability' },
  { key: 'revenueSharePct', label: 'Sales Commission / Revenue Share %', domain: 'Operating Expenses', classification: 'input', unit: 'percent', period: 'scalar', sourceSheet: 'Scenario Planner', sourceRange: 'D38', uiPage: 'Operating Expenses' },
  { key: 'depreciationPct', label: 'Depreciation Rate', domain: 'Profitability', classification: 'input', unit: 'percent', period: 'scalar', sourceSheet: 'Scenario Planner', sourceRange: 'D49', uiPage: 'Profitability' },
  { key: 'incomeTaxPct', label: 'Income Tax Rate', domain: 'Profitability', classification: 'input', unit: 'percent', period: 'scalar', sourceSheet: 'Scenario Planner', sourceRange: 'D52', uiPage: 'Profitability' },
  { key: 'hardwareMarginPct', label: 'Hardware Margin Assumption', domain: 'Inventory & CapEx', classification: 'input', unit: 'percent', period: 'scalar', sourceSheet: 'Scenario Planner', sourceRange: 'D63', uiPage: 'Inventory & CapEx' },
  { key: 'safetyStockPct', label: 'Safety Stock % of Demand', domain: 'Inventory & CapEx', classification: 'input', unit: 'percent', period: 'scalar', sourceSheet: 'Scenario Planner', sourceRange: 'D64', uiPage: 'Inventory & CapEx' },
  { key: 'uniqueSkierFactor', label: 'Unique Skier Factor', domain: 'Adoption & Customers', classification: 'input', unit: 'percent', period: 'scalar', sourceSheet: 'Scenario Planner', sourceRange: 'row 24 note', uiPage: 'Adoption & Customers' },

  { key: 'skiAreasStart', label: 'Ski Areas at Start of Fiscal Year', domain: 'Mountain Growth', classification: 'calculated', unit: 'count', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 6', uiPage: 'Mountain Growth' },
  { key: 'newSkiAreas', label: 'New Ski Areas Onboarding', domain: 'Mountain Growth', classification: 'preset', unit: 'count', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 7', uiPage: 'Mountain Growth' },
  { key: 'skiAreasEnd', label: 'Total Ski Areas at Year End', domain: 'Mountain Growth', classification: 'calculated', unit: 'count', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 8', uiPage: 'Mountain Growth' },
  { key: 'revenueGeneratingAreas', label: 'Revenue Generating Ski Areas', domain: 'Mountain Growth', classification: 'calculated', unit: 'count', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 9', uiPage: 'Mountain Growth' },
  { key: 'installationRevenuePerArea', label: 'Installation Revenue per Area', domain: 'Pricing & Revenue', classification: 'input', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 12', uiPage: 'Pricing & Revenue' },
  { key: 'installationRevenue', label: 'Annual Installation Revenue', domain: 'Pricing & Revenue', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 13', uiPage: 'Pricing & Revenue' },
  { key: 'athletesPerArea', label: 'Athletes per Area', domain: 'Adoption & Customers', classification: 'input', unit: 'count', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 16', uiPage: 'Adoption & Customers' },
  { key: 'athleteAdoptionRate', label: 'Athlete Adoption Rate', domain: 'Adoption & Customers', classification: 'input', unit: 'percent', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 17', uiPage: 'Adoption & Customers' },
  { key: 'payingAthletesPerArea', label: 'Paying Athletes per Area', domain: 'Adoption & Customers', classification: 'calculated', unit: 'count', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 18', uiPage: 'Adoption & Customers' },
  { key: 'athleteArpu', label: 'Athlete ARPU', domain: 'Pricing & Revenue', classification: 'input', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 19', uiPage: 'Pricing & Revenue' },
  { key: 'athleteSubscriptionRevenue', label: 'Athlete Subscription Revenue', domain: 'Pricing & Revenue', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 20', uiPage: 'Pricing & Revenue' },
  { key: 'skierVisitsPerArea', label: 'Skier Visits per Area', domain: 'Adoption & Customers', classification: 'input', unit: 'count', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 23', uiPage: 'Adoption & Customers' },
  { key: 'uniqueSkiersPerArea', label: 'Unique Skiers per Area', domain: 'Adoption & Customers', classification: 'calculated', unit: 'count', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 24', uiPage: 'Adoption & Customers' },
  { key: 'socialAdoptionRate', label: 'Social Adoption Rate', domain: 'Adoption & Customers', classification: 'preset', unit: 'percent', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 25', uiPage: 'Adoption & Customers' },
  { key: 'payingSocialSkiersPerArea', label: 'Paying Social Skiers per Area', domain: 'Adoption & Customers', classification: 'calculated', unit: 'count', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 26', uiPage: 'Adoption & Customers' },
  { key: 'socialArpu', label: 'Social ARPU', domain: 'Pricing & Revenue', classification: 'input', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 27', uiPage: 'Pricing & Revenue' },
  { key: 'socialSubscriptionRevenue', label: 'Social Subscription Revenue', domain: 'Pricing & Revenue', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 28', uiPage: 'Pricing & Revenue' },
  { key: 'subscriptionRevenue', label: 'All Subscription Revenue', domain: 'Pricing & Revenue', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 30', uiPage: 'Pricing & Revenue' },
  { key: 'totalRevenue', label: 'Total Revenue', domain: 'Pricing & Revenue', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 32', uiPage: 'Dashboard' },
  { key: 'subscriptionCogs', label: 'Subscription COGS', domain: 'Profitability', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 34', uiPage: 'Profitability' },
  { key: 'grossProfit', label: 'Gross Profit', domain: 'Profitability', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 36', uiPage: 'Profitability' },
  { key: 'grossMargin', label: 'Gross Margin', domain: 'Profitability', classification: 'calculated', unit: 'percent', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 36', uiPage: 'Profitability' },
  { key: 'revenueShare', label: 'Sales Commission / Revenue Share', domain: 'Operating Expenses', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 38', uiPage: 'Operating Expenses' },
  { key: 'staff', label: 'Staff', domain: 'Staffing', classification: 'schedule', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner / CY Staff & Contractors', sourceRange: 'row 40', uiPage: 'Staffing' },
  { key: 'contractLabor', label: 'Contract Labor', domain: 'Contractors', classification: 'schedule', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner / CY Staff & Contractors', sourceRange: 'row 41', uiPage: 'Contractors' },
  { key: 'marketing', label: 'Marketing', domain: 'Operating Expenses', classification: 'schedule', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 42', uiPage: 'Operating Expenses' },
  { key: 'ga', label: 'G&A', domain: 'G&A', classification: 'schedule', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner / CY G&A', sourceRange: 'row 43', uiPage: 'G&A' },
  { key: 'totalOpex', label: 'Total OPEX', domain: 'Operating Expenses', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 45', uiPage: 'Operating Expenses' },
  { key: 'ebitda', label: 'EBITDA', domain: 'Profitability', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 47', uiPage: 'Profitability' },
  { key: 'depreciation', label: 'Depreciation', domain: 'Profitability', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 49', uiPage: 'Profitability' },
  { key: 'interest', label: 'Interest Expense / Income', domain: 'Profitability', classification: 'input', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 50', uiPage: 'Profitability' },
  { key: 'ebt', label: 'EBT', domain: 'Profitability', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 51', uiPage: 'Profitability' },
  { key: 'incomeTax', label: 'Income Tax', domain: 'Profitability', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 52', uiPage: 'Profitability' },
  { key: 'netIncome', label: 'Net Income', domain: 'Profitability', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 54', uiPage: 'Profitability' },
  { key: 'beginningCash', label: 'Beginning Cash', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 58', uiPage: 'Cash & Capital' },
  { key: 'workingCapitalChange', label: 'Change in Working Capital', domain: 'Cash & Capital', classification: 'input', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 61', uiPage: 'Cash & Capital' },
  { key: 'carryForwardInventoryOffset', label: 'Carry Forward Inventory Offset', domain: 'Inventory & CapEx', classification: 'input', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 62', uiPage: 'Inventory & CapEx' },
  { key: 'inventoryDemand', label: 'Inventory Purchases (Demand)', domain: 'Inventory & CapEx', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 63', uiPage: 'Inventory & CapEx' },
  { key: 'safetyStock', label: 'Inventory Purchases (Safety Stock)', domain: 'Inventory & CapEx', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 64', uiPage: 'Inventory & CapEx' },
  { key: 'vehicleCapex', label: 'Vehicles CapEx', domain: 'Inventory & CapEx', classification: 'input', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 65', uiPage: 'Inventory & CapEx' },
  { key: 'otherCapex', label: 'Other CapEx', domain: 'Inventory & CapEx', classification: 'input', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 66', uiPage: 'Inventory & CapEx' },
  { key: 'netAssetSpend', label: 'Net Asset Spend', domain: 'Inventory & CapEx', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 67', uiPage: 'Inventory & CapEx' },
  { key: 'yearEndCashWithoutRaise', label: 'Year End Cash Balance without Raise', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 68', uiPage: 'Cash & Capital' },
  { key: 'capitalRaise', label: 'Capital Raise', domain: 'Cash & Capital', classification: 'input', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 70', uiPage: 'Cash & Capital' },
  { key: 'endingCash', label: 'Ending Cash', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 72', uiPage: 'Cash & Capital' },
  { key: 'minimumCashReserve', label: 'Minimum Desired Cash Reserve', domain: 'Cash & Capital', classification: 'input', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 75', uiPage: 'Cash & Capital' },
  { key: 'cashVsReserve', label: 'Cash Above / (Below) Reserve', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 76', uiPage: 'Cash & Capital' },
  { key: 'hardwareInvestmentPerArea', label: 'Hardware Investment per New Area', domain: 'Capital Efficiency', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 80', uiPage: 'Capital Efficiency' },
  { key: 'opexPerSkiArea', label: 'OPEX per Ski Area', domain: 'Capital Efficiency', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 82', uiPage: 'Capital Efficiency' },
  { key: 'fixedOpexPerSkiArea', label: 'Fixed OPEX per Ski Area', domain: 'Capital Efficiency', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 83', uiPage: 'Capital Efficiency' },
  { key: 'revenuePerRgArea', label: 'Total Revenue per Revenue-Generating Area', domain: 'Capital Efficiency', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 84', uiPage: 'Capital Efficiency' },
  { key: 'subscriptionRevenuePerArea', label: 'Subscription Revenue per Ski Area', domain: 'Capital Efficiency', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 85', uiPage: 'Capital Efficiency' },
  { key: 'grossProfitPerRgArea', label: 'Gross Profit per Revenue-Generating Area', domain: 'Capital Efficiency', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 86', uiPage: 'Capital Efficiency' },
  { key: 'ebitdaPerRgArea', label: 'EBITDA per Revenue-Generating Area', domain: 'Capital Efficiency', classification: 'calculated', unit: 'currency', period: 'annual', sourceSheet: 'Scenario Planner', sourceRange: 'row 87', uiPage: 'Capital Efficiency' },
];

export const MONTHLY_MODEL_ITEMS: ModelItemDefinition[] = [
  { key: 'monthly.beginningCash', label: 'Beginning Cash (Monthly)', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'monthly', sourceSheet: 'CY Cashflow', sourceRange: 'row 3', uiPage: 'Cash & Capital' },
  { key: 'monthly.installationRevenue', label: 'Installation Revenue (Monthly)', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'monthly', sourceSheet: 'CY Cashflow', sourceRange: 'row 6', uiPage: 'Cash & Capital' },
  { key: 'monthly.subscriptionRevenue', label: 'Subscription Revenue (Monthly)', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'monthly', sourceSheet: 'CY Cashflow', sourceRange: 'row 8', uiPage: 'Cash & Capital' },
  { key: 'monthly.capitalRaise', label: 'Capital Raise (Monthly)', domain: 'Cash & Capital', classification: 'input', unit: 'currency', period: 'monthly', sourceSheet: 'CY Cashflow', sourceRange: 'row 11', uiPage: 'Cash & Capital' },
  { key: 'monthly.subscriptionCogs', label: 'Subscription COGS (Monthly)', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'monthly', sourceSheet: 'CY Cashflow', sourceRange: 'row 16', uiPage: 'Cash & Capital' },
  { key: 'monthly.revenueShare', label: 'Revenue Share / Commission (Monthly)', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'monthly', sourceSheet: 'CY Cashflow', sourceRange: 'row 18', uiPage: 'Cash & Capital' },
  { key: 'monthly.staff', label: 'Staff (Monthly)', domain: 'Staffing', classification: 'schedule', unit: 'currency', period: 'monthly', sourceSheet: 'CY Staff & Contractors', sourceRange: 'row 36', uiPage: 'Staffing' },
  { key: 'monthly.contractors', label: 'Contractors (Monthly)', domain: 'Contractors', classification: 'schedule', unit: 'currency', period: 'monthly', sourceSheet: 'CY Staff & Contractors', sourceRange: 'row 52', uiPage: 'Contractors' },
  { key: 'monthly.marketing', label: 'Marketing (Monthly)', domain: 'Operating Expenses', classification: 'calculated', unit: 'currency', period: 'monthly', sourceSheet: 'CY Cashflow', sourceRange: 'row 22', uiPage: 'Operating Expenses' },
  { key: 'monthly.ga', label: 'G&A (Monthly)', domain: 'G&A', classification: 'schedule', unit: 'currency', period: 'monthly', sourceSheet: 'CY G&A', sourceRange: 'row 33', uiPage: 'G&A' },
  { key: 'monthly.assetPurchases', label: 'Asset Purchases (Monthly)', domain: 'Inventory & CapEx', classification: 'calculated', unit: 'currency', period: 'monthly', sourceSheet: 'CY Cashflow', sourceRange: 'row 27', uiPage: 'Cash & Capital' },
  { key: 'monthly.grossCashBurn', label: 'Gross Cash Burn (Monthly)', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'monthly', sourceSheet: 'CY Cashflow', sourceRange: 'row 29', uiPage: 'Cash & Capital' },
  { key: 'monthly.netCashBurn', label: 'Net Cash Burn (Monthly)', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'monthly', sourceSheet: 'CY Cashflow', sourceRange: 'row 31', uiPage: 'Cash & Capital' },
  { key: 'monthly.endingCash', label: 'Month End Cash Position', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'monthly', sourceSheet: 'CY Cashflow', sourceRange: 'row 33', uiPage: 'Cash & Capital' },
  { key: 'monthly.cashWithoutRevenue', label: 'Cash Position without Revenue', domain: 'Cash & Capital', classification: 'calculated', unit: 'currency', period: 'monthly', sourceSheet: 'CY Cashflow', sourceRange: 'row 34', uiPage: 'Cash & Capital' },
];

export const ALL_MODEL_ITEMS: ModelItemDefinition[] = [...ANNUAL_MODEL_ITEMS, ...MONTHLY_MODEL_ITEMS];
