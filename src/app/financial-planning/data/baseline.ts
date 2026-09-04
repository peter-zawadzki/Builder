import type {
  AnnualAssumptions,
  BaselineModel,
  ContractorItem,
  GaItem,
  GrowthPresetTable,
  MonthlyCurves,
  PeriodSeries,
  StaffRole,
} from '../engine/types';

type RawStaffRole = Omit<StaffRole, 'id'>;
type RawContractorItem = Omit<ContractorItem, 'id'>;
type RawGaItem = Omit<GaItem, 'id'>;
type RawAnnualBaseline = {
  growthPreset: AnnualAssumptions['growthPreset'];
  adoptionPreset: AnnualAssumptions['adoptionPreset'];
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
  carryForwardInventoryOffset: PeriodSeries;
  vehicleCapex: PeriodSeries;
  otherCapex: PeriodSeries;
  minimumCashReserve: PeriodSeries;
  beginningCash: PeriodSeries;
  marketing: PeriodSeries;
};

import annualBaselineRaw from './generated/annual-baseline.json';
import growthPresetsRaw from './generated/growth-presets.json';
import growthAdoptionMatrixRaw from './generated/growth-adoption-matrix.json';
import staffRolesRaw from './generated/staff-roles.json';
import contractorItemsRaw from './generated/contractor-items.json';
import gaItemsRaw from './generated/ga-items.json';
import monthlyCurvesRaw from './generated/monthly-curves.json';

function slug(...parts: (string | number)[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const staffRoles: StaffRole[] = (staffRolesRaw as RawStaffRole[]).map((r) => ({
  id: slug('staff', r.sourceRow, r.title),
  ...r,
}));

const contractorItems: ContractorItem[] = (contractorItemsRaw as RawContractorItem[]).map((r) => ({
  id: slug('contractor', r.sourceRow, r.title),
  ...r,
}));

const gaItems: GaItem[] = (gaItemsRaw as { items: RawGaItem[] }).items.map((r) => ({
  id: slug('ga', r.sourceRow, r.title),
  ...r,
}));

const growthPresets = growthPresetsRaw as Record<string, GrowthPresetTable>;
const growthAdoptionMatrix = growthAdoptionMatrixRaw as BaselineModel['growthAdoptionMatrix'];
const monthlyCurves = monthlyCurvesRaw as MonthlyCurves;
const ab = annualBaselineRaw as RawAnnualBaseline;

const zeroSeries = { 'FY26/27': 0, 'FY27/28': 0, 'FY28/29': 0, 'FY29/30': 0 };

const assumptions: AnnualAssumptions = {
  growthPreset: ab.growthPreset,
  adoptionPreset: ab.adoptionPreset,
  newAreaRevenueFraction: ab.newAreaRevenueFraction,
  uniqueSkierFactor: ab.uniqueSkierFactor,
  subscriptionCogsPct: ab.subscriptionCogsPct,
  revenueSharePct: ab.revenueSharePct,
  depreciationPct: ab.depreciationPct,
  incomeTaxPct: ab.incomeTaxPct,
  hardwareMarginPct: ab.hardwareMarginPct,
  safetyStockPct: ab.safetyStockPct,

  installationRevenuePerArea: ab.installationRevenuePerArea,
  athletesPerArea: ab.athletesPerArea,
  athleteAdoptionRate: ab.athleteAdoptionRate,
  athleteArpu: ab.athleteArpu,
  skierVisitsPerArea: ab.skierVisitsPerArea,
  socialArpu: ab.socialArpu,
  newSkiAreas: ab.newSkiAreas,

  interest: ab.interest,
  workingCapitalChange: zeroSeries,
  carryForwardInventoryOffset: ab.carryForwardInventoryOffset,
  vehicleCapex: ab.vehicleCapex,
  otherCapex: ab.otherCapex,
  minimumCashReserve: ab.minimumCashReserve,
  beginningCashFy1: ab.beginningCash['FY26/27'],

  marketingFy1: ab.marketing['FY26/27'],
};

export const baselineModel: BaselineModel = {
  assumptions,
  growthPresets,
  growthAdoptionMatrix,
  staffRoles,
  contractorItems,
  gaItems,
  monthlyCurves,
};

export { ab as rawAnnualBaseline };
