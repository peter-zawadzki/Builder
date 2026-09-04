import type { AnnualPeriodResult, CalendarMonthIndex, CapitalRaiseEvent, MonthlyCashResult, MonthlyCurves } from './types';

const MONTH_LABELS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

export function calculateMonthlyCash(
  fy1: AnnualPeriodResult,
  beginningCashMonth1: number,
  curves: MonthlyCurves,
  staffMonthly: number[],
  contractorsMonthly: number[],
  gaMonthly: number[],
  marketingAnnual: number,
  capitalRaiseEvents: CapitalRaiseEvent[] = []
): MonthlyCashResult[] {
  const results: MonthlyCashResult[] = [];
  let beginningCash = beginningCashMonth1;
  let cashWithoutRevenue = beginningCashMonth1;

  const raiseByMonth = new Map<number, number>();
  for (const event of capitalRaiseEvents) {
    raiseByMonth.set(event.month, (raiseByMonth.get(event.month) ?? 0) + event.amount);
  }

  for (let i = 0; i < 12; i++) {
    const month = (i + 1) as CalendarMonthIndex;
    const installationRevenue = fy1.installationRevenue * curves.installationRevenuePct[i];
    const subscriptionRevenue = fy1.subscriptionRevenue * curves.subscriptionRevenuePct[i];
    const cashInflow = installationRevenue + subscriptionRevenue;
    const capitalRaise = raiseByMonth.get(month) ?? 0;
    const totalCashAvailable = beginningCash + cashInflow + capitalRaise;

    const subscriptionCogs = fy1.subscriptionCogs * curves.subscriptionCogsPct[i];
    const revenueShare = fy1.revenueShare * curves.revenueSharePct[i];
    const staff = staffMonthly[i];
    const contractors = contractorsMonthly[i];
    const marketing = marketingAnnual * curves.marketingPct[i];
    const ga = gaMonthly[i];
    const assetPurchases = fy1.netAssetSpend * curves.assetPurchasesPct[i];

    const grossCashBurn = subscriptionCogs + revenueShare + staff + contractors + marketing + ga + assetPurchases;
    const netCashBurn = grossCashBurn - cashInflow;
    const endingCash = totalCashAvailable - grossCashBurn;
    cashWithoutRevenue = cashWithoutRevenue - grossCashBurn;

    results.push({
      month,
      label: MONTH_LABELS[i],
      beginningCash,
      installationRevenue,
      subscriptionRevenue,
      cashInflow,
      capitalRaise,
      totalCashAvailable,
      subscriptionCogs,
      revenueShare,
      staff,
      contractors,
      marketing,
      ga,
      assetPurchases,
      grossCashBurn,
      netCashBurn,
      endingCash,
      cashWithoutRevenue,
    });

    beginningCash = endingCash;
  }

  return results;
}
