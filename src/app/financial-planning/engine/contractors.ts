import type { ContractorItem, ContractorOverride } from './types';

export interface ContractorsResult {
  fy2627Total: number;
  monthlySchedule: number[];
}

export function resolveContractors(items: ContractorItem[], overrides: ContractorOverride[] = []): ContractorsResult {
  const overrideById = new Map(overrides.map((o) => [o.contractorItemId, o]));
  const monthlySchedule = new Array(12).fill(0);
  let fy2627Total = 0;

  for (const item of items) {
    const override = overrideById.get(item.id);
    let monthly: number[];
    if (override?.monthlySchedule) {
      monthly = override.monthlySchedule;
    } else if (override?.annualAmount !== undefined && item.baselineAnnual > 0) {
      const ratio = override.annualAmount / item.baselineAnnual;
      monthly = item.baselineMonthlySchedule.map((v) => v * ratio);
    } else {
      monthly = item.baselineMonthlySchedule;
    }
    const annual = monthly.reduce((a, b) => a + b, 0);
    fy2627Total += annual;
    for (let i = 0; i < 12; i++) monthlySchedule[i] += monthly[i];
  }

  return { fy2627Total, monthlySchedule };
}
