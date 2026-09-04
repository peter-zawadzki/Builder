import type {
  AnnualPeriodResult,
  AnnualResults,
  FiscalPeriod,
  ModelContext,
  PeriodSeries,
} from './types';
import { FISCAL_PERIODS } from './types';
import { resolveScalar, resolveYearSeries } from './overrides';
import { resolveStaffing, withAddedRoles } from './staffing';
import { resolveContractors } from './contractors';
import { resolveGa } from './ga';
import { resolveNewSkiAreas, resolveLaterYearOpexSeries, resolveSocialAdoption } from './presets';

export function calculateAnnual(context: ModelContext): AnnualResults {
  const { baseline, overrides } = context;
  const { assumptions } = baseline;

  const growthPreset = overrides.growthPreset ?? assumptions.growthPreset;
  const adoptionPreset = overrides.adoptionPreset ?? assumptions.adoptionPreset;
  const scalars = overrides.scalars;
  const years = overrides.years;

  const newAreaRevenueFraction = resolveScalar(assumptions.newAreaRevenueFraction, 'newAreaRevenueFraction', scalars);
  const uniqueSkierFactor = resolveScalar(assumptions.uniqueSkierFactor, 'uniqueSkierFactor', scalars);
  const subscriptionCogsPct = resolveScalar(assumptions.subscriptionCogsPct, 'subscriptionCogsPct', scalars);
  const revenueSharePct = resolveScalar(assumptions.revenueSharePct, 'revenueSharePct', scalars);
  const depreciationPct = resolveScalar(assumptions.depreciationPct, 'depreciationPct', scalars);
  const incomeTaxPct = resolveScalar(assumptions.incomeTaxPct, 'incomeTaxPct', scalars);
  const hardwareMarginPct = resolveScalar(assumptions.hardwareMarginPct, 'hardwareMarginPct', scalars);
  const safetyStockPct = resolveScalar(assumptions.safetyStockPct, 'safetyStockPct', scalars);

  const newSkiAreas = resolveYearSeries(resolveNewSkiAreas(baseline, growthPreset), 'newSkiAreas', years);
  const installationRevenuePerArea = resolveYearSeries(
    assumptions.installationRevenuePerArea,
    'installationRevenuePerArea',
    years
  );
  const athletesPerArea = resolveYearSeries(assumptions.athletesPerArea, 'athletesPerArea', years);
  const athleteAdoptionRate = resolveYearSeries(assumptions.athleteAdoptionRate, 'athleteAdoptionRate', years);
  const athleteArpu = resolveYearSeries(assumptions.athleteArpu, 'athleteArpu', years);
  const skierVisitsPerArea = resolveYearSeries(assumptions.skierVisitsPerArea, 'skierVisitsPerArea', years);
  const socialArpu = resolveYearSeries(assumptions.socialArpu, 'socialArpu', years);
  const socialAdoptionRate = resolveYearSeries(
    resolveSocialAdoption(baseline, growthPreset, adoptionPreset),
    'socialAdoptionRate',
    years
  );
  const interest = resolveYearSeries(assumptions.interest, 'interest', years);
  const workingCapitalChange = resolveYearSeries(assumptions.workingCapitalChange, 'workingCapitalChange', years);
  const carryForwardInventoryOffset = resolveYearSeries(
    assumptions.carryForwardInventoryOffset,
    'carryForwardInventoryOffset',
    years
  );
  const vehicleCapex = resolveYearSeries(assumptions.vehicleCapex, 'vehicleCapex', years);
  const otherCapex = resolveYearSeries(assumptions.otherCapex, 'otherCapex', years);
  const minimumCashReserve = resolveYearSeries(assumptions.minimumCashReserve, 'minimumCashReserve', years);

  const staffing = resolveStaffing(withAddedRoles(baseline.staffRoles, overrides.addedStaffRoles), overrides.staff);
  const contractors = resolveContractors(baseline.contractorItems, overrides.contractors);
  const ga = resolveGa(baseline.gaItems, overrides.ga);

  const staff = resolveYearSeries(
    resolveLaterYearOpexSeries(baseline, growthPreset, 'staff', staffing.fy2627Total),
    'staff',
    years
  );
  const contractLabor = resolveYearSeries(
    resolveLaterYearOpexSeries(baseline, growthPreset, 'contractLabor', contractors.fy2627Total),
    'contractLabor',
    years
  );
  const marketing = resolveYearSeries(
    resolveLaterYearOpexSeries(baseline, growthPreset, 'marketing', assumptions.marketingFy1),
    'marketing',
    years
  );
  const gaSeries = resolveYearSeries(
    resolveLaterYearOpexSeries(baseline, growthPreset, 'ga', ga.fy2627Total),
    'ga',
    years
  );

  const capitalRaiseAnnual = (overrides.capitalRaiseEvents ?? []).reduce((a, e) => a + e.amount, 0);

  const periods = {} as Record<FiscalPeriod, AnnualPeriodResult>;
  let priorEndingCash = assumptions.beginningCashFy1;
  let priorSkiAreasEnd = 0;

  FISCAL_PERIODS.forEach((period, index) => {
    const skiAreasStart = index === 0 ? 8 : priorSkiAreasEnd;
    const skiAreasEnd = skiAreasStart + newSkiAreas[period];
    const revenueGeneratingAreas = Math.round(newSkiAreas[period] * newAreaRevenueFraction) + skiAreasStart;

    const installationRevenue = installationRevenuePerArea[period] * newSkiAreas[period];

    const payingAthletesPerArea = Math.round(athletesPerArea[period] * athleteAdoptionRate[period]);
    const athleteSubscriptionRevenue = athleteArpu[period] * payingAthletesPerArea * revenueGeneratingAreas;

    const uniqueSkiersPerArea = skierVisitsPerArea[period] * uniqueSkierFactor;
    const payingSocialSkiersPerArea = uniqueSkiersPerArea * socialAdoptionRate[period];
    const socialSubscriptionRevenue = socialArpu[period] * payingSocialSkiersPerArea * revenueGeneratingAreas;

    const subscriptionRevenue = athleteSubscriptionRevenue + socialSubscriptionRevenue;
    const totalRevenue = installationRevenue + subscriptionRevenue;

    const subscriptionCogs = subscriptionCogsPct * subscriptionRevenue;
    const grossProfit = totalRevenue - subscriptionCogs;
    const grossMargin = totalRevenue !== 0 ? grossProfit / totalRevenue : 0;

    const revenueShare = revenueSharePct * subscriptionRevenue;
    const totalOpex = revenueShare + staff[period] + contractLabor[period] + marketing[period] + gaSeries[period];
    const ebitda = grossProfit - totalOpex;
    const depreciation = depreciationPct * totalRevenue;
    const ebt = ebitda - depreciation - interest[period];
    const incomeTax = ebt > 0 ? incomeTaxPct * ebt : 0;
    const netIncome = ebt - incomeTax;

    const inventoryDemand = newSkiAreas[period] * installationRevenuePerArea[period] * (1 - hardwareMarginPct);
    const safetyStock = inventoryDemand * safetyStockPct;
    const netAssetSpend =
      Math.max(inventoryDemand - carryForwardInventoryOffset[period], 0) +
      safetyStock +
      vehicleCapex[period] +
      otherCapex[period];

    const beginningCash = index === 0 ? assumptions.beginningCashFy1 : priorEndingCash;
    const capitalRaise = index === 0 ? capitalRaiseAnnual : 0;
    const yearEndCashWithoutRaise =
      beginningCash + netIncome + depreciation + workingCapitalChange[period] - netAssetSpend;
    const endingCash = yearEndCashWithoutRaise + capitalRaise;
    const cashVsReserve = endingCash - minimumCashReserve[period];

    const hardwareInvestmentPerArea = newSkiAreas[period] !== 0 ? inventoryDemand / newSkiAreas[period] : 0;
    const opexPerSkiArea = skiAreasEnd !== 0 ? totalOpex / skiAreasEnd : 0;
    const fixedOpexPerSkiArea =
      skiAreasEnd !== 0
        ? (staff[period] + contractLabor[period] + marketing[period] + gaSeries[period]) / skiAreasEnd
        : 0;
    const revenuePerRgArea = revenueGeneratingAreas !== 0 ? totalRevenue / revenueGeneratingAreas : 0;
    const subscriptionRevenuePerArea = revenueGeneratingAreas !== 0 ? subscriptionRevenue / revenueGeneratingAreas : 0;
    const grossProfitPerRgArea = revenueGeneratingAreas !== 0 ? grossProfit / revenueGeneratingAreas : 0;
    const ebitdaPerRgArea = revenueGeneratingAreas !== 0 ? ebitda / revenueGeneratingAreas : 0;

    periods[period] = {
      skiAreasStart,
      newSkiAreas: newSkiAreas[period],
      skiAreasEnd,
      revenueGeneratingAreas,
      installationRevenuePerArea: installationRevenuePerArea[period],
      installationRevenue,
      athletesPerArea: athletesPerArea[period],
      athleteAdoptionRate: athleteAdoptionRate[period],
      payingAthletesPerArea,
      athleteArpu: athleteArpu[period],
      athleteSubscriptionRevenue,
      skierVisitsPerArea: skierVisitsPerArea[period],
      uniqueSkiersPerArea,
      socialAdoptionRate: socialAdoptionRate[period],
      payingSocialSkiersPerArea,
      socialArpu: socialArpu[period],
      socialSubscriptionRevenue,
      subscriptionRevenue,
      totalRevenue,
      subscriptionCogs,
      grossProfit,
      grossMargin,
      revenueShare,
      staff: staff[period],
      contractLabor: contractLabor[period],
      marketing: marketing[period],
      ga: gaSeries[period],
      totalOpex,
      ebitda,
      depreciation,
      interest: interest[period],
      ebt,
      incomeTax,
      netIncome,
      inventoryDemand,
      safetyStock,
      carryForwardInventoryOffset: carryForwardInventoryOffset[period],
      vehicleCapex: vehicleCapex[period],
      otherCapex: otherCapex[period],
      netAssetSpend,
      beginningCash,
      workingCapitalChange: workingCapitalChange[period],
      yearEndCashWithoutRaise,
      capitalRaise,
      endingCash,
      minimumCashReserve: minimumCashReserve[period],
      cashVsReserve,
      hardwareInvestmentPerArea,
      opexPerSkiArea,
      fixedOpexPerSkiArea,
      revenuePerRgArea,
      subscriptionRevenuePerArea,
      grossProfitPerRgArea,
      ebitdaPerRgArea,
    };

    priorEndingCash = endingCash;
    priorSkiAreasEnd = skiAreasEnd;
  });

  return { periods };
}
