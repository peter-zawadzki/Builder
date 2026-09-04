import type { MonthIndex, StaffRole, StaffRoleOverride } from './types';

export interface ResolvedStaffRole {
  role: StaffRole;
  enabled: boolean;
  headcount: number;
  loadedAnnual: number;
  effectiveStartMonth: MonthIndex;
  monthlySchedule: number[]; // 12 values, Jul..Jun (FY26/27 only)
  nextFyJuly: number;
  fy2627Cost: number;
}

export interface StaffingResult {
  roles: ResolvedStaffRole[];
  fy2627Total: number;
  monthlySchedule: number[]; // sum across roles, 12 values
}

export function buildFlatSchedule(loadedAnnual: number, startMonth: MonthIndex): { monthly: number[]; nextFyJuly: number } {
  const monthlyAmount = loadedAnnual / 12;
  const monthly = new Array(12).fill(0);
  if (startMonth <= 12) {
    for (let m = startMonth; m <= 12; m++) monthly[m - 1] = monthlyAmount;
    return { monthly, nextFyJuly: 0 };
  }
  return { monthly, nextFyJuly: monthlyAmount };
}

export function withAddedRoles(roles: StaffRole[], added: StaffRole[] = []): StaffRole[] {
  return added.length ? [...roles, ...added] : roles;
}

export function resolveStaffing(roles: StaffRole[], overrides: StaffRoleOverride[] = []): StaffingResult {
  const overrideByRoleId = new Map(overrides.map((o) => [o.staffRoleId, o]));
  const resolved: ResolvedStaffRole[] = roles.map((role) => {
    const override = overrideByRoleId.get(role.id);
    const enabled = override?.enabled ?? true;
    const headcount = override?.headcount ?? 1;
    const baselineLoadedAnnual = role.loadedAnnual;
    const loadedAnnual =
      override?.salary !== undefined ? override.salary * (1 + role.loadPct) : baselineLoadedAnnual;
    const effectiveStartMonth = override?.startMonth ?? role.effectiveStartMonth;

    let monthly: number[];
    let nextFyJuly: number;
    const scheduleUnchanged =
      override?.salary === undefined && override?.startMonth === undefined;
    if (scheduleUnchanged) {
      monthly = role.baselineMonthlySchedule.slice();
      nextFyJuly = role.nextFyJuly;
    } else {
      const built = buildFlatSchedule(loadedAnnual, effectiveStartMonth);
      monthly = built.monthly;
      nextFyJuly = built.nextFyJuly;
    }

    if (!enabled) {
      monthly = monthly.map(() => 0);
      nextFyJuly = 0;
    } else if (headcount !== 1) {
      monthly = monthly.map((v) => v * headcount);
      nextFyJuly = nextFyJuly * headcount;
    }

    const fy2627Cost = monthly.reduce((a, b) => a + b, 0);

    return {
      role,
      enabled,
      headcount,
      loadedAnnual,
      effectiveStartMonth,
      monthlySchedule: monthly,
      nextFyJuly,
      fy2627Cost,
    };
  });

  const monthlySchedule = new Array(12).fill(0);
  let fy2627Total = 0;
  for (const r of resolved) {
    fy2627Total += r.fy2627Cost;
    for (let i = 0; i < 12; i++) monthlySchedule[i] += r.monthlySchedule[i];
  }

  return { roles: resolved, fy2627Total, monthlySchedule };
}
