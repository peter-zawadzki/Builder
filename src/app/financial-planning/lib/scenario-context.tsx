
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { baselineModel } from '../data/baseline';
import { calculateModel, ENGINE_VERSION } from '../engine/index';
import { buildFlatSchedule } from '../engine/staffing';
import type {
  AdoptionPreset,
  CalendarMonthIndex,
  CapitalRaiseEvent,
  ContractorOverride,
  FiscalPeriod,
  GaOverride,
  GrowthPreset,
  ModelResults,
  MonthIndex,
  ScenarioOverrides,
  StaffRole,
  StaffRoleOverride,
} from '../engine/types';

export interface NewHireInput {
  title: string;
  region: string;
  baselineSalary: number;
  effectiveStartMonth: MonthIndex;
}

const NEW_HIRE_LOAD_PCT = 0.12;
const NEW_HIRE_SECTION = 'New Hires (Added)';

interface OverrideEntry {
  key: string;
  label: string;
  page: string;
}

interface ScenarioContextValue {
  scenarioName: string;
  setScenarioName: (name: string) => void;
  overrides: ScenarioOverrides;
  results: ModelResults;
  overrideCount: number;
  overrideEntries: OverrideEntry[];
  isModified: boolean;

  setGrowthPreset: (preset: GrowthPreset) => void;
  setAdoptionPreset: (preset: AdoptionPreset) => void;
  setScalarOverride: (key: string, label: string, page: string, value: number | undefined) => void;
  setYearOverride: (
    key: string,
    label: string,
    page: string,
    period: FiscalPeriod,
    value: number | undefined
  ) => void;
  addedStaffRoles: StaffRole[];
  addStaffRole: (input: NewHireInput) => void;
  removeStaffRole: (roleId: string) => void;
  setStaffOverride: (roleId: string, patch: Partial<StaffRoleOverride>) => void;
  setContractorOverride: (itemId: string, patch: Partial<ContractorOverride>) => void;
  setGaOverride: (itemId: string, patch: Partial<GaOverride>) => void;
  /** Sets (or, if amount is 0/undefined, clears) the capital raise amount for one calendar
   * month within FY26/27. Monthly capital raise events are additive inputs, not a preset-
   * derived series, so there's no "reset to baseline" needed beyond clearing to 0. */
  setCapitalRaiseEvent: (month: CalendarMonthIndex, amount: number) => void;

  resetControl: (key: string) => void;
  resetStaffRole: (roleId: string) => void;
  resetPage: (page: string) => void;
  resetAll: () => void;
  /** Replaces every override bucket wholesale with a previously-saved ScenarioOverrides
   * payload (e.g. loaded from the Scenario Library), and renames the scenario to match. */
  loadOverrides: (overrides: ScenarioOverrides, name: string) => void;
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null);

const CONTROL_METADATA_STORE = new Map<string, { label: string; page: string }>();

export function ScenarioProvider({ children }: { children: React.ReactNode }) {
  const [scenarioName, setScenarioName] = useState('Default Scenario');
  const [growthPreset, setGrowthPresetState] = useState<GrowthPreset | undefined>(undefined);
  const [adoptionPreset, setAdoptionPresetState] = useState<AdoptionPreset | undefined>(undefined);
  const [scalars, setScalars] = useState<Record<string, number>>({});
  const [years, setYears] = useState<Record<string, Partial<Record<FiscalPeriod, number>>>>({});
  const [staff, setStaff] = useState<Record<string, StaffRoleOverride>>({});
  const [addedStaff, setAddedStaff] = useState<Record<string, StaffRole>>({});
  const [contractors, setContractors] = useState<Record<string, ContractorOverride>>({});
  const [ga, setGa] = useState<Record<string, GaOverride>>({});
  const [capitalRaiseEvents, setCapitalRaiseEvents] = useState<Record<number, number>>({});
  const [controlPages, setControlPages] = useState<Record<string, string>>({});

  const overrides: ScenarioOverrides = useMemo(
    () => ({
      growthPreset,
      adoptionPreset,
      scalars,
      years,
      staff: Object.values(staff),
      addedStaffRoles: Object.values(addedStaff),
      contractors: Object.values(contractors),
      ga: Object.values(ga),
      capitalRaiseEvents: Object.entries(capitalRaiseEvents).map(([month, amount]) => ({
        month: Number(month) as CalendarMonthIndex,
        amount,
      })),
    }),
    [growthPreset, adoptionPreset, scalars, years, staff, addedStaff, contractors, ga, capitalRaiseEvents]
  );

  const results = useMemo(
    () =>
      calculateModel({
        modelVersionId: 'baseline-v1',
        engineVersion: ENGINE_VERSION,
        baseline: baselineModel,
        overrides,
      }),
    [overrides]
  );

  const overrideEntries: OverrideEntry[] = useMemo(() => {
    const entries: OverrideEntry[] = [];
    if (growthPreset && growthPreset !== baselineModel.assumptions.growthPreset) {
      entries.push({ key: 'growthPreset', label: 'Growth Preset', page: 'Mountain Growth' });
    }
    if (adoptionPreset && adoptionPreset !== baselineModel.assumptions.adoptionPreset) {
      entries.push({ key: 'adoptionPreset', label: 'Adoption Preset', page: 'Adoption & Customers' });
    }
    for (const key of Object.keys(scalars)) {
      const meta = CONTROL_METADATA_STORE.get(key);
      entries.push({ key, label: meta?.label ?? key, page: meta?.page ?? controlPages[key] ?? 'Unknown' });
    }
    for (const key of Object.keys(years)) {
      const meta = CONTROL_METADATA_STORE.get(key);
      entries.push({ key, label: meta?.label ?? key, page: meta?.page ?? controlPages[key] ?? 'Unknown' });
    }
    for (const roleId of Object.keys(staff)) {
      entries.push({ key: `staff:${roleId}`, label: 'Staffing override', page: 'Staffing' });
    }
    for (const role of Object.values(addedStaff)) {
      entries.push({ key: `addedStaff:${role.id}`, label: `New hire: ${role.title}`, page: 'Staffing' });
    }
    for (const itemId of Object.keys(contractors)) {
      entries.push({ key: `contractor:${itemId}`, label: 'Contractor override', page: 'Contractors' });
    }
    for (const itemId of Object.keys(ga)) {
      entries.push({ key: `ga:${itemId}`, label: 'G&A override', page: 'G&A' });
    }
    for (const month of Object.keys(capitalRaiseEvents)) {
      entries.push({ key: `capitalRaise:${month}`, label: 'Capital raise event', page: 'Cash & Capital' });
    }
    return entries;
  }, [growthPreset, adoptionPreset, scalars, years, staff, addedStaff, contractors, ga, capitalRaiseEvents, controlPages]);

  const setGrowthPreset = useCallback((preset: GrowthPreset) => {
    setGrowthPresetState(preset === baselineModel.assumptions.growthPreset ? undefined : preset);
  }, []);

  const setAdoptionPreset = useCallback((preset: AdoptionPreset) => {
    setAdoptionPresetState(preset === baselineModel.assumptions.adoptionPreset ? undefined : preset);
  }, []);

  const setScalarOverride = useCallback(
    (key: string, label: string, page: string, value: number | undefined) => {
      CONTROL_METADATA_STORE.set(key, { label, page });
      setScalars((prev) => {
        const next = { ...prev };
        if (value === undefined) delete next[key];
        else next[key] = value;
        return next;
      });
    },
    []
  );

  const setYearOverride = useCallback(
    (key: string, label: string, page: string, period: FiscalPeriod, value: number | undefined) => {
      CONTROL_METADATA_STORE.set(key, { label, page });
      setYears((prev) => {
        const next = { ...prev };
        const current = { ...(next[key] ?? {}) };
        if (value === undefined) delete current[period];
        else current[period] = value;
        if (Object.keys(current).length === 0) delete next[key];
        else next[key] = current;
        return next;
      });
    },
    []
  );

  const setStaffOverride = useCallback((roleId: string, patch: Partial<StaffRoleOverride>) => {
    setStaff((prev) => {
      const next = { ...prev };
      const merged = { ...(next[roleId] ?? { staffRoleId: roleId }), ...patch };
      const isEmpty =
        merged.enabled === undefined &&
        merged.headcount === undefined &&
        merged.salary === undefined &&
        merged.startMonth === undefined;
      if (isEmpty) delete next[roleId];
      else next[roleId] = merged;
      return next;
    });
  }, []);

  const addStaffRole = useCallback((input: NewHireInput) => {
    const id = `added-staff-${crypto.randomUUID()}`;
    const loadedAnnual = input.baselineSalary * (1 + NEW_HIRE_LOAD_PCT);
    const { monthly, nextFyJuly } = buildFlatSchedule(loadedAnnual, input.effectiveStartMonth);
    const role: StaffRole = {
      id,
      sourceRow: -1,
      section: NEW_HIRE_SECTION,
      title: input.title,
      person: null,
      region: input.region,
      roleType: 'New Hire',
      sourceStartLabel: `Month ${input.effectiveStartMonth}`,
      effectiveStartMonth: input.effectiveStartMonth,
      baselineSalary: input.baselineSalary,
      loadPct: NEW_HIRE_LOAD_PCT,
      loadedAnnual,
      baselineMonthlySchedule: monthly,
      nextFyJuly,
      fy2627Cost: monthly.reduce((a, b) => a + b, 0),
    };
    setAddedStaff((prev) => ({ ...prev, [id]: role }));
  }, []);

  const removeStaffRole = useCallback((roleId: string) => {
    setAddedStaff((prev) => {
      if (!(roleId in prev)) return prev;
      const next = { ...prev };
      delete next[roleId];
      return next;
    });
    setStaff((prev) => {
      if (!(roleId in prev)) return prev;
      const next = { ...prev };
      delete next[roleId];
      return next;
    });
  }, []);

  const setContractorOverride = useCallback((itemId: string, patch: Partial<ContractorOverride>) => {
    setContractors((prev) => {
      const next = { ...prev };
      const merged = { ...(next[itemId] ?? { contractorItemId: itemId }), ...patch };
      const isEmpty = merged.annualAmount === undefined && merged.monthlySchedule === undefined;
      if (isEmpty) delete next[itemId];
      else next[itemId] = merged;
      return next;
    });
  }, []);

  const setGaOverride = useCallback((itemId: string, patch: Partial<GaOverride>) => {
    setGa((prev) => {
      const next = { ...prev };
      const merged = { ...(next[itemId] ?? { gaItemId: itemId }), ...patch };
      const isEmpty = merged.annualAmount === undefined && merged.allocationCurve === undefined;
      if (isEmpty) delete next[itemId];
      else next[itemId] = merged;
      return next;
    });
  }, []);

  const setCapitalRaiseEvent = useCallback((month: CalendarMonthIndex, amount: number) => {
    setCapitalRaiseEvents((prev) => {
      const next = { ...prev };
      if (!amount) delete next[month];
      else next[month] = amount;
      return next;
    });
  }, []);

  const resetControl = useCallback((key: string) => {
    setScalars((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setYears((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (key === 'growthPreset') setGrowthPresetState(undefined);
    if (key === 'adoptionPreset') setAdoptionPresetState(undefined);
  }, []);

  const resetStaffRole = useCallback((roleId: string) => {
    setStaff((prev) => {
      if (!(roleId in prev)) return prev;
      const next = { ...prev };
      delete next[roleId];
      return next;
    });
  }, []);

  const resetPage = useCallback(
    (page: string) => {
      setScalars((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (CONTROL_METADATA_STORE.get(key)?.page === page) delete next[key];
        }
        return next;
      });
      setYears((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (CONTROL_METADATA_STORE.get(key)?.page === page) delete next[key];
        }
        return next;
      });
      if (page === 'Mountain Growth') setGrowthPresetState(undefined);
      if (page === 'Adoption & Customers') setAdoptionPresetState(undefined);
      if (page === 'Staffing') {
        setStaff({});
        setAddedStaff({});
      }
      if (page === 'Contractors') setContractors({});
      if (page === 'G&A') setGa({});
      if (page === 'Cash & Capital') setCapitalRaiseEvents({});
    },
    []
  );

  const resetAll = useCallback(() => {
    setGrowthPresetState(undefined);
    setAdoptionPresetState(undefined);
    setScalars({});
    setYears({});
    setStaff({});
    setAddedStaff({});
    setContractors({});
    setGa({});
    setCapitalRaiseEvents({});
  }, []);

  const loadOverrides = useCallback((loaded: ScenarioOverrides, name: string) => {
    setScenarioName(name);
    setGrowthPresetState(loaded.growthPreset);
    setAdoptionPresetState(loaded.adoptionPreset);
    setScalars((loaded.scalars ?? {}) as Record<string, number>);
    setYears((loaded.years ?? {}) as Record<string, Partial<Record<FiscalPeriod, number>>>);
    setStaff(Object.fromEntries((loaded.staff ?? []).map((o) => [o.staffRoleId, o])));
    setAddedStaff(Object.fromEntries((loaded.addedStaffRoles ?? []).map((r) => [r.id, r])));
    setContractors(Object.fromEntries((loaded.contractors ?? []).map((o) => [o.contractorItemId, o])));
    setGa(Object.fromEntries((loaded.ga ?? []).map((o) => [o.gaItemId, o])));
    setCapitalRaiseEvents(Object.fromEntries((loaded.capitalRaiseEvents ?? []).map((e) => [e.month, e.amount])));
  }, []);

  const isModified = overrideEntries.length > 0;

  const value: ScenarioContextValue = {
    scenarioName,
    setScenarioName,
    overrides,
    results,
    overrideCount: overrideEntries.length,
    overrideEntries,
    isModified,
    setGrowthPreset,
    setAdoptionPreset,
    setScalarOverride,
    setYearOverride,
    addedStaffRoles: overrides.addedStaffRoles ?? [],
    addStaffRole,
    removeStaffRole,
    setStaffOverride,
    setContractorOverride,
    setGaOverride,
    setCapitalRaiseEvent,
    resetControl,
    resetStaffRole,
    resetPage,
    resetAll,
    loadOverrides,
  };

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

export function useScenario(): ScenarioContextValue {
  const ctx = useContext(ScenarioContext);
  if (!ctx) throw new Error('useScenario must be used within a ScenarioProvider');
  return ctx;
}

export function effectiveGrowthPreset(overrides: ScenarioOverrides): GrowthPreset {
  return overrides.growthPreset ?? baselineModel.assumptions.growthPreset;
}

export function effectiveAdoptionPreset(overrides: ScenarioOverrides): AdoptionPreset {
  return overrides.adoptionPreset ?? baselineModel.assumptions.adoptionPreset;
}
