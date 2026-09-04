import type {
  AdoptionPreset,
  BaselineModel,
  FiscalPeriod,
  GrowthPreset,
  PeriodSeries,
} from './types';
import { FISCAL_PERIODS } from './types';

export function resolveNewSkiAreas(baseline: BaselineModel, growthPreset: GrowthPreset): PeriodSeries {
  return baseline.growthPresets[growthPreset].newSkiAreas;
}

export function resolveLaterYearOpexSeries(
  baseline: BaselineModel,
  growthPreset: GrowthPreset,
  key: 'staff' | 'contractLabor' | 'marketing' | 'ga',
  fy1Value: number
): PeriodSeries {
  const table = baseline.growthPresets[growthPreset][key];
  const result = {} as PeriodSeries;
  for (const period of FISCAL_PERIODS) {
    result[period] = period === 'FY26/27' ? fy1Value : table[period] ?? 0;
  }
  return result;
}

export function resolveSocialAdoption(
  baseline: BaselineModel,
  growthPreset: GrowthPreset,
  adoptionPreset: AdoptionPreset
): PeriodSeries {
  const entry = baseline.growthAdoptionMatrix.find(
    (e) => e.growthPreset === growthPreset && e.adoptionPreset === adoptionPreset
  );
  if (!entry) {
    throw new Error(`No growth/adoption matrix entry for ${growthPreset} x ${adoptionPreset}`);
  }
  const result = {} as PeriodSeries;
  for (const period of FISCAL_PERIODS) result[period] = entry[period];
  return result;
}

export function periodIndex(period: FiscalPeriod): number {
  return FISCAL_PERIODS.indexOf(period);
}
