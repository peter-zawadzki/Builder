import type { ModelContext, ModelResults } from './types';
import { calculateAnnual } from './annual';
import { calculateMonthlyCash } from './monthlyCash';
import { calculateCapitalRequirement } from './capitalRaise';
import { resolveStaffing, withAddedRoles } from './staffing';
import { resolveContractors } from './contractors';
import { resolveGa } from './ga';

export const ENGINE_VERSION = '1.0.0';

export function calculateModel(context: ModelContext): ModelResults {
  const annual = calculateAnnual(context);

  const staffing = resolveStaffing(
    withAddedRoles(context.baseline.staffRoles, context.overrides.addedStaffRoles),
    context.overrides.staff
  );
  const contractors = resolveContractors(context.baseline.contractorItems, context.overrides.contractors);
  const ga = resolveGa(context.baseline.gaItems, context.overrides.ga);

  const monthly = calculateMonthlyCash(
    annual.periods['FY26/27'],
    context.baseline.assumptions.beginningCashFy1,
    context.baseline.monthlyCurves,
    staffing.monthlySchedule,
    contractors.monthlySchedule,
    ga.monthlySchedule,
    annual.periods['FY26/27'].marketing,
    context.overrides.capitalRaiseEvents
  );

  const capitalRequirement = calculateCapitalRequirement(monthly, annual, context.overrides.capitalRaiseEvents);

  return { annual, monthly, capitalRequirement };
}

export * from './types';
export { calculateAnnual } from './annual';
export { calculateMonthlyCash } from './monthlyCash';
export { calculateCapitalRequirement } from './capitalRaise';
export { resolveStaffing, withAddedRoles } from './staffing';
export { resolveContractors } from './contractors';
export { resolveGa } from './ga';
export { resolveNewSkiAreas, resolveLaterYearOpexSeries, resolveSocialAdoption } from './presets';
