import type { GaItem, GaOverride } from './types';

export interface GaResult {
  fy2627Total: number;
  monthlySchedule: number[];
}

export function resolveGa(items: GaItem[], overrides: GaOverride[] = []): GaResult {
  const overrideById = new Map(overrides.map((o) => [o.gaItemId, o]));
  const categoryCurves = new Map<string, number[]>();
  for (const item of items) {
    if (item.type === 'allocation_curve' && item.baselineAllocationCurve) {
      categoryCurves.set(item.category, item.baselineAllocationCurve);
    }
  }

  const monthlySchedule = new Array(12).fill(0);
  let fy2627Total = 0;

  for (const item of items) {
    if (item.type !== 'expense_line') continue;
    const override = overrideById.get(item.id);
    const annual = override?.annualAmount ?? item.baselineAnnual ?? 0;
    const curve =
      override?.allocationCurve ?? categoryCurves.get(item.category) ?? item.baselineMonthlySchedule?.map((v) =>
        item.baselineAnnual ? v / item.baselineAnnual : 0
      ) ??
      new Array(12).fill(1 / 12);
    const monthly = curve.map((pct) => pct * annual);
    fy2627Total += annual;
    for (let i = 0; i < 12; i++) monthlySchedule[i] += monthly[i];
  }

  return { fy2627Total, monthlySchedule };
}
