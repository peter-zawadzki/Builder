import type { AnnualResults, CapitalRaiseEvent, CapitalRequirement, MonthlyCashResult } from './types';
import { FISCAL_PERIODS } from './types';

export function calculateCapitalRequirement(
  monthly: MonthlyCashResult[],
  annual: AnnualResults,
  capitalRaiseEvents: CapitalRaiseEvent[] = []
): CapitalRequirement {
  const minimumMonthEndCash = Math.min(...monthly.map((m) => m.endingCash));
  const requiredCapitalToZero = Math.max(0, -minimumMonthEndCash);

  const fy1 = annual.periods['FY26/27'];
  const requiredCapitalToReserve = Math.max(0, fy1.minimumCashReserve - minimumMonthEndCash);

  const maxAnnualReserveDeficit = Math.max(
    0,
    ...FISCAL_PERIODS.map((p) => -annual.periods[p].cashVsReserve)
  );

  const totalEnteredFinancing = capitalRaiseEvents.reduce((a, e) => a + e.amount, 0);

  return {
    requiredCapitalToZero,
    requiredCapitalToReserve,
    maxAnnualReserveDeficit,
    totalEnteredFinancing,
  };
}
