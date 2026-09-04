import type { FiscalPeriod, PeriodSeries, ScalarOverrides, YearOverrides } from './types';
import { FISCAL_PERIODS } from './types';

export function resolveScalar(baseValue: number, key: string, scalars?: ScalarOverrides): number {
  const override = scalars?.[key];
  return override === undefined ? baseValue : override;
}

export function resolveYearSeries(base: PeriodSeries, key: string, years?: YearOverrides): PeriodSeries {
  const overrideSeries = years?.[key];
  if (!overrideSeries) return base;
  const result = {} as PeriodSeries;
  for (const period of FISCAL_PERIODS) {
    result[period] = overrideSeries[period] ?? base[period];
  }
  return result;
}

export function seriesValue(series: PeriodSeries, period: FiscalPeriod): number {
  return series[period];
}
