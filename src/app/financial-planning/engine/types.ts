export type FiscalPeriod = 'FY26/27' | 'FY27/28' | 'FY28/29' | 'FY29/30';
export const FISCAL_PERIODS: FiscalPeriod[] = ['FY26/27', 'FY27/28', 'FY28/29', 'FY29/30'];

export type MonthIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type CalendarMonthIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type GrowthPreset = 'Accelerated Growth' | 'Balanced Growth' | 'Conservative Growth';
export type AdoptionPreset = 'Wildfire' | 'Rapid' | 'Modest' | 'Slow';

export type PeriodSeries = Record<FiscalPeriod, number>;

export interface AnnualAssumptions {
  growthPreset: GrowthPreset;
  adoptionPreset: AdoptionPreset;
  newAreaRevenueFraction: number;
  uniqueSkierFactor: number;
  subscriptionCogsPct: number;
  revenueSharePct: number;
  depreciationPct: number;
  incomeTaxPct: number;
  hardwareMarginPct: number;
  safetyStockPct: number;

  installationRevenuePerArea: PeriodSeries;
  athletesPerArea: PeriodSeries;
  athleteAdoptionRate: PeriodSeries;
  athleteArpu: PeriodSeries;
  skierVisitsPerArea: PeriodSeries;
  socialArpu: PeriodSeries;
  newSkiAreas: PeriodSeries;

  interest: PeriodSeries;
  workingCapitalChange: PeriodSeries;
  carryForwardInventoryOffset: PeriodSeries;
  vehicleCapex: PeriodSeries;
  otherCapex: PeriodSeries;
  minimumCashReserve: PeriodSeries;
  beginningCashFy1: number;

  /** FY26/27 authoritative marketing total (no line-item detail sheet; single annual figure). */
  marketingFy1: number;
}

export interface GrowthPresetTable {
  name: GrowthPreset;
  staff: Partial<PeriodSeries>;
  contractLabor: Partial<PeriodSeries>;
  marketing: Partial<PeriodSeries>;
  ga: Partial<PeriodSeries>;
  newSkiAreas: PeriodSeries;
}

export interface GrowthAdoptionEntry {
  growthPreset: GrowthPreset;
  adoptionPreset: AdoptionPreset;
  'FY26/27': number;
  'FY27/28': number;
  'FY28/29': number;
  'FY29/30': number;
}

export interface StaffRole {
  id: string;
  sourceRow: number;
  section: string;
  title: string;
  person: string | null;
  region: string;
  roleType: string;
  sourceStartLabel: string;
  effectiveStartMonth: MonthIndex;
  baselineSalary: number;
  loadPct: number;
  loadedAnnual: number;
  baselineMonthlySchedule: number[]; // 12 values, Jul..Jun
  nextFyJuly: number;
  fy2627Cost: number;
}

export interface ContractorItem {
  id: string;
  sourceRow: number;
  section: string;
  title: string;
  person: string | null;
  region: string | null;
  baselineAnnual: number;
  baselineMonthlySchedule: number[]; // 12 values, Jul..Jun
}

export interface GaItem {
  id: string;
  sourceRow: number;
  category: string;
  title: string;
  type: 'allocation_curve' | 'expense_line';
  baselineAnnual: number | null;
  baselineAllocationCurve?: number[];
  baselineMonthlySchedule?: number[];
}

export interface MonthlyCurves {
  beginningCashMonth1: number;
  installationRevenuePct: number[];
  subscriptionRevenuePct: number[];
  subscriptionCogsPct: number[];
  revenueSharePct: number[];
  marketingPct: number[];
  assetPurchasesPct: number[];
}

export interface StaffRoleOverride {
  staffRoleId: string;
  enabled?: boolean;
  headcount?: number;
  salary?: number;
  startMonth?: MonthIndex;
}

export interface ContractorOverride {
  contractorItemId: string;
  annualAmount?: number;
  monthlySchedule?: number[];
}

export interface GaOverride {
  gaItemId: string;
  annualAmount?: number;
  allocationCurve?: number[];
}

export interface ScalarOverrides {
  [engineKey: string]: number | undefined;
}

export interface YearOverrides {
  [engineKey: string]: Partial<PeriodSeries> | undefined;
}

export interface CapitalRaiseEvent {
  month: CalendarMonthIndex; // month 1..12 within FY26/27 (Jul..Jun)
  amount: number;
}

export interface ScenarioOverrides {
  growthPreset?: GrowthPreset;
  adoptionPreset?: AdoptionPreset;
  scalars?: ScalarOverrides;
  years?: YearOverrides;
  staff?: StaffRoleOverride[];
  addedStaffRoles?: StaffRole[];
  contractors?: ContractorOverride[];
  ga?: GaOverride[];
  capitalRaiseEvents?: CapitalRaiseEvent[];
}

export interface BaselineModel {
  assumptions: AnnualAssumptions;
  growthPresets: Record<GrowthPreset, GrowthPresetTable>;
  growthAdoptionMatrix: GrowthAdoptionEntry[];
  staffRoles: StaffRole[];
  contractorItems: ContractorItem[];
  gaItems: GaItem[];
  monthlyCurves: MonthlyCurves;
}

export interface ModelContext {
  modelVersionId: string;
  engineVersion: string;
  baseline: BaselineModel;
  overrides: ScenarioOverrides;
}

export interface AnnualPeriodResult {
  skiAreasStart: number;
  newSkiAreas: number;
  skiAreasEnd: number;
  revenueGeneratingAreas: number;
  installationRevenuePerArea: number;
  installationRevenue: number;
  athletesPerArea: number;
  athleteAdoptionRate: number;
  payingAthletesPerArea: number;
  athleteArpu: number;
  athleteSubscriptionRevenue: number;
  skierVisitsPerArea: number;
  uniqueSkiersPerArea: number;
  socialAdoptionRate: number;
  payingSocialSkiersPerArea: number;
  socialArpu: number;
  socialSubscriptionRevenue: number;
  subscriptionRevenue: number;
  totalRevenue: number;
  subscriptionCogs: number;
  grossProfit: number;
  grossMargin: number;
  revenueShare: number;
  staff: number;
  contractLabor: number;
  marketing: number;
  ga: number;
  totalOpex: number;
  ebitda: number;
  depreciation: number;
  interest: number;
  ebt: number;
  incomeTax: number;
  netIncome: number;
  inventoryDemand: number;
  safetyStock: number;
  carryForwardInventoryOffset: number;
  vehicleCapex: number;
  otherCapex: number;
  netAssetSpend: number;
  beginningCash: number;
  workingCapitalChange: number;
  yearEndCashWithoutRaise: number;
  capitalRaise: number;
  endingCash: number;
  minimumCashReserve: number;
  cashVsReserve: number;
  hardwareInvestmentPerArea: number;
  opexPerSkiArea: number;
  fixedOpexPerSkiArea: number;
  revenuePerRgArea: number;
  subscriptionRevenuePerArea: number;
  grossProfitPerRgArea: number;
  ebitdaPerRgArea: number;
}

export interface AnnualResults {
  periods: Record<FiscalPeriod, AnnualPeriodResult>;
}

export interface MonthlyCashResult {
  month: CalendarMonthIndex;
  label: string;
  beginningCash: number;
  installationRevenue: number;
  subscriptionRevenue: number;
  cashInflow: number;
  capitalRaise: number;
  totalCashAvailable: number;
  subscriptionCogs: number;
  revenueShare: number;
  staff: number;
  contractors: number;
  marketing: number;
  ga: number;
  assetPurchases: number;
  grossCashBurn: number;
  netCashBurn: number;
  endingCash: number;
  cashWithoutRevenue: number;
}

export interface CapitalRequirement {
  requiredCapitalToZero: number;
  requiredCapitalToReserve: number;
  maxAnnualReserveDeficit: number;
  totalEnteredFinancing: number;
}

export interface ModelResults {
  annual: AnnualResults;
  monthly: MonthlyCashResult[];
  capitalRequirement: CapitalRequirement;
}

// ---------------------------------------------------------------------------
// Cap table — independent of the P&L/cash engine above. See src/engine/capTable.ts
// and src/data/capTable.ts.
// ---------------------------------------------------------------------------

export interface CapTableHolder {
  id: string;
  name: string;
  category: 'founder' | 'option-pool';
  shares: number;
}

export interface ConvertibleNoteTerm {
  id: string;
  holderName: string;
  principal: number;
  issueDate: string; // ISO date
  interestRatePct: number;
  valuationCap: number;
  discountPct: number;
}

export interface PendingNoteInput {
  holderName: string;
  principal: number;
  issueDate: string; // ISO date
  interestRatePct: number;
  valuationCap: number;
  discountPct: number;
}

export interface PendingRoundInput {
  amountRaised: number;
  preMoneyValuation: number;
  closeDate: string; // ISO date
  optionPoolRefreshEnabled: boolean;
  optionPoolTargetPct: number; // 0-1, of post-round fully-diluted shares
}

export interface CapTableRowResult {
  id: string;
  name: string;
  category: 'founder' | 'option-pool' | 'note-holder' | 'new-investor';
  sharesBefore: number;
  pctBefore: number;
  sharesAfter: number;
  pctAfter: number;
  note?: string; // e.g. conversion price/balance detail for display
}

export interface CapTableResult {
  totalSharesBefore: number;
  totalSharesAfter: number;
  rows: CapTableRowResult[];
  roundActive: boolean;
  pricePerShare: number | null;
  postMoneyValuation: number | null;
  newSharesIssued: number;
  founderPctBefore: number;
  founderPctAfter: number;
  founderDilutionPts: number;
}
