
import { useMemo, useState } from 'react';
import { useScenario } from '../lib/scenario-context';
import type { NewHireInput } from '../lib/scenario-context';
import { baselineModel } from '../data/baseline';
import { baselineResults } from '../lib/baseline-results';
import { resolveStaffing, withAddedRoles } from '../engine/staffing';
import type { ResolvedStaffRole } from '../engine/staffing';
import { FISCAL_PERIODS } from '../engine/types';
import type { MonthIndex, StaffRole } from '../engine/types';
import { formatCurrency, formatCount, formatDelta } from '../lib/format';

const NEW_HIRE_SECTION = 'New Hires (Added)';
const REGION_OPTIONS = Array.from(new Set(baselineModel.staffRoles.map((r) => r.region))).sort();

const PAGE = 'Staffing';

const MONTH_LABELS: Record<MonthIndex, string> = {
  1: 'Month 1 / Jul',
  2: 'Month 2 / Aug',
  3: 'Month 3 / Sep',
  4: 'Month 4 / Oct',
  5: 'Month 5 / Nov',
  6: 'Month 6 / Dec',
  7: 'Month 7 / Jan',
  8: 'Month 8 / Feb',
  9: 'Month 9 / Mar',
  10: 'Month 10 / Apr',
  11: 'Month 11 / May',
  12: 'Month 12 / Jun',
  13: 'Month 13 / Next Jul',
};

function shortMonthLabel(m: number): string {
  return MONTH_LABELS[m as MonthIndex] ?? `Month ${m}`;
}

const MONTH_OPTIONS: MonthIndex[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const SECTION_ORDER = [
  'Founders',
  'Product Development',
  'Utilization - Mountain Service & Support',
  'Expansion - Sales & Marketing',
  'Administrative',
];

export default function StaffingPage() {
  const scenario = useScenario();
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  const baselineResolved = useMemo(() => resolveStaffing(baselineModel.staffRoles), []);
  const currentResolved = useMemo(
    () =>
      resolveStaffing(
        withAddedRoles(baselineModel.staffRoles, scenario.addedStaffRoles),
        scenario.overrides.staff
      ),
    [scenario.addedStaffRoles, scenario.overrides.staff]
  );

  const baselineById = useMemo(() => {
    const m = new Map<string, ResolvedStaffRole>();
    for (const r of baselineResolved.roles) m.set(r.role.id, r);
    return m;
  }, [baselineResolved]);

  const currentById = useMemo(() => {
    const m = new Map<string, ResolvedStaffRole>();
    for (const r of currentResolved.roles) m.set(r.role.id, r);
    return m;
  }, [currentResolved]);

  const staffOverrides = scenario.overrides.staff ?? [];

  const overridesByRoleId = useMemo(() => {
    const m = new Map<string, (typeof staffOverrides)[number]>();
    for (const o of staffOverrides) m.set(o.staffRoleId, o);
    return m;
  }, [staffOverrides]);

  const baselineHeadcount = baselineResolved.roles.filter((r) => r.enabled && r.fy2627Cost > 0).length;
  const currentHeadcount = currentResolved.roles.filter((r) => r.enabled && r.fy2627Cost > 0).length;

  const annual = scenario.results.annual.periods;

  const sections = useMemo(() => {
    const bySection = new Map<string, StaffRole[]>();
    for (const role of baselineModel.staffRoles) {
      const list = bySection.get(role.section) ?? [];
      list.push(role);
      bySection.set(role.section, list);
    }
    const known = SECTION_ORDER.filter((s) => bySection.has(s));
    const extra = Array.from(bySection.keys()).filter((s) => !known.includes(s));
    const base = [...known, ...extra].map((section) => ({ section, roles: bySection.get(section) ?? [], isAdded: false }));
    if (scenario.addedStaffRoles.length > 0) {
      base.push({ section: NEW_HIRE_SECTION, roles: scenario.addedStaffRoles, isAdded: true });
    }
    return base;
  }, [scenario.addedStaffRoles]);

  const isPageModified = staffOverrides.length > 0 || scenario.addedStaffRoles.length > 0;

  return (
    <div>
      <h2 style={{ fontSize: 32, marginBottom: 8 }}>Staffing</h2>
      <p className="ds-body" style={{ marginBottom: 20, maxWidth: 760 }}>
        Adjust salary, start month, headcount, and whether a role counts toward cost per role.
      </p>

      <div className="ds-card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="ds-label">Staffing Summary</div>
          <button
            type="button"
            className="ds-btn ds-btn--outline ds-btn--sm"
            onClick={() => scenario.resetPage('Staffing')}
            disabled={!isPageModified}
          >
            Reset Staffing
          </button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
              <th style={cellStyle('left')}>Metric</th>
              <th style={cellStyle('right')}>Current</th>
              <th style={cellStyle('right')}>Baseline</th>
              <th style={cellStyle('right')}>Variance</th>
            </tr>
          </thead>
          <tbody>
            <SummaryRow
              label="FY26/27 Total Staff Cost"
              current={currentResolved.fy2627Total}
              baseline={baselineResolved.fy2627Total}
              format={(v) => formatCurrency(v)}
            />
            <SummaryRow
              label="Active Headcount (FY26/27 cost > 0)"
              current={currentHeadcount}
              baseline={baselineHeadcount}
              format={formatCount}
            />
          </tbody>
        </table>
      </div>

      <div className="ds-card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
              <th style={cellStyle('left')}>Staff Cost by Fiscal Year</th>
              {FISCAL_PERIODS.map((p) => (
                <th key={p} style={cellStyle('right')}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '10px 16px', fontWeight: 600 }}>Total Staff Cost</td>
              {FISCAL_PERIODS.map((p) => {
                const value = annual[p].staff;
                const baselineValue = baselineResults.annual.periods[p].staff;
                const changed = Math.abs(value - baselineValue) > 0.5;
                return (
                  <td key={p} style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: changed ? 'var(--color-primary-orange)' : undefined }}>
                      {formatCurrency(value)}
                    </span>
                    {changed && <div className="ds-caption">was {formatCurrency(baselineValue)}</div>}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <AddHireForm onAdd={(input) => scenario.addStaffRole(input)} />

      {sections.map(({ section, roles, isAdded }) => (
        <div key={section} className="ds-card" style={{ padding: 0, marginBottom: 20, overflowX: 'auto' }}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-gray-200)',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            {section}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
                <th style={headStyle}>Role</th>
                <th style={headStyle}>Region / Type</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Baseline Salary</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Loaded Cost</th>
                <th style={headStyle}>Effective Start</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>FY26/27 Cost</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>FY27/28</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>FY28/29</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>FY29/30</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>vs Baseline</th>
                <th style={{ ...headStyle, textAlign: 'center' }}>Active</th>
                <th style={headStyle}></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const current = currentById.get(role.id);
                if (!current) return null;
                const baseline = baselineById.get(role.id);
                const override = overridesByRoleId.get(role.id);
                const isOverridden = override !== undefined;
                const delta = current.fy2627Cost - (baseline?.fy2627Cost ?? 0);
                const expanded = expandedRoleId === role.id;

                return (
                  <RoleRow
                    key={role.id}
                    role={role}
                    current={current}
                    delta={delta}
                    isOverridden={isOverridden}
                    isAdded={isAdded}
                    expanded={expanded}
                    annual={annual}
                    baselineFy2627Total={baselineResolved.fy2627Total}
                    onToggleExpanded={() => setExpandedRoleId(expanded ? null : role.id)}
                    onPatch={(patch) => scenario.setStaffOverride(role.id, patch)}
                    onReset={() => scenario.resetStaffRole(role.id)}
                    onRemove={() => scenario.removeStaffRole(role.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function RoleRow({
  role,
  current,
  delta,
  isOverridden,
  isAdded,
  expanded,
  annual,
  baselineFy2627Total,
  onToggleExpanded,
  onPatch,
  onReset,
  onRemove,
}: {
  role: StaffRole;
  current: ResolvedStaffRole;
  delta: number;
  isOverridden: boolean;
  isAdded: boolean;
  expanded: boolean;
  annual: ReturnType<typeof useScenario>['results']['annual']['periods'];
  baselineFy2627Total: number;
  onToggleExpanded: () => void;
  onPatch: (patch: { enabled?: boolean; headcount?: number; salary?: number; startMonth?: MonthIndex }) => void;
  onReset: () => void;
  onRemove: () => void;
}) {
  const changed = Math.abs(delta) > 0.5;
  const currentSalary = Math.round(current.loadedAnnual / (1 + role.loadPct));
  // Fixed baseline denominator (never the live/edited total), so this role's own projection
  // depends only on its own fy2627Cost and can't be shifted by editing any other role.
  const shareOfBaselineTotal = baselineFy2627Total > 0 ? current.fy2627Cost / baselineFy2627Total : 0;

  return (
    <>
      <tr
        style={{
          borderBottom: expanded ? 'none' : '1px solid var(--color-gray-200)',
          opacity: current.enabled ? 1 : 0.5,
        }}
      >
        <td style={cellStyle('left')}>
          <button
            type="button"
            onClick={onToggleExpanded}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 600 }}>{role.title}</span>
            {isAdded && <span className="ds-chip ds-chip--modified">Added</span>}
            {!isAdded && isOverridden && <span className="ds-chip ds-chip--modified">Modified</span>}
          </button>
          {role.person && <div className="ds-caption">{role.person}</div>}
        </td>
        <td style={cellStyle('left')}>
          <div>{role.region}</div>
          <div className="ds-caption">{role.roleType}</div>
        </td>
        <td style={cellStyle('right')}>
          <input
            type="number"
            className="ds-input"
            style={{ width: 110, textAlign: 'right' }}
            value={currentSalary}
            step={1000}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isNaN(n)) return;
              const rounded = Math.round(n);
              onPatch({ salary: rounded === role.baselineSalary ? undefined : rounded });
            }}
          />
        </td>
        <td style={cellStyle('right')}>{formatCurrency(current.loadedAnnual)}</td>
        <td style={cellStyle('left')}>
          <select
            className="ds-input"
            value={current.effectiveStartMonth}
            onChange={(e) => {
              const v = Number(e.target.value) as MonthIndex;
              onPatch({ startMonth: v === role.effectiveStartMonth ? undefined : v });
            }}
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {shortMonthLabel(m)}
              </option>
            ))}
          </select>
          {current.effectiveStartMonth !== role.effectiveStartMonth && (
            <div className="ds-caption" style={{ marginTop: 4 }}>
              Baseline {shortMonthLabel(role.effectiveStartMonth)}
            </div>
          )}
        </td>
        <td style={{ ...cellStyle('right'), fontWeight: changed ? 700 : 400, color: changed ? 'var(--color-primary-orange)' : undefined }}>
          {formatCurrency(current.fy2627Cost)}
        </td>
        {FISCAL_PERIODS.slice(1).map((period) => (
          <td key={period} style={{ ...cellStyle('right'), color: 'var(--color-gray-600)' }}>
            {formatCurrency(shareOfBaselineTotal * annual[period].staff)}
          </td>
        ))}
        <td style={cellStyle('right')}>
          {isAdded ? (
            <span className="ds-caption">New</span>
          ) : changed ? (
            <span style={{ color: 'var(--color-primary-orange)', fontWeight: 600 }}>
              {formatDelta(delta, (v) => formatCurrency(v))}
            </span>
          ) : (
            <span className="ds-caption">—</span>
          )}
        </td>
        <td style={{ ...cellStyle('right'), textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => onPatch({ enabled: current.enabled ? false : undefined })}
            aria-label={current.enabled ? 'Included in cost — click to exclude' : 'Excluded from cost — click to include'}
            title={current.enabled ? 'Included in cost — click to exclude' : 'Excluded from cost — click to include'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              fontWeight: 700,
              color: current.enabled ? 'var(--color-functional-green)' : 'var(--color-functional-red)',
            }}
          >
            {current.enabled ? '✓' : '✕'}
          </button>
        </td>
        <td style={cellStyle('right')}>
          {isAdded ? (
            <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={onRemove}>
              Remove
            </button>
          ) : (
            <button
              type="button"
              className="ds-btn ds-btn--ghost ds-btn--sm"
              onClick={onReset}
              disabled={!isOverridden}
            >
              Reset Role
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
          <td colSpan={12} style={{ padding: '0 16px 16px', background: 'var(--color-gray-100)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, paddingTop: 12, maxWidth: 200 }}>
              <NumberControl
                label="Headcount"
                baseline={1}
                value={current.headcount}
                step={1}
                min={0}
                format={formatCount}
                onChange={(v) => onPatch({ headcount: v === 1 ? undefined : v })}
                onReset={() => onPatch({ headcount: undefined })}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function NumberControl({
  label,
  baseline,
  value,
  step,
  min,
  format,
  onChange,
  onReset,
}: {
  label: string;
  baseline: number;
  value: number;
  step: number;
  min?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const isOverridden = Math.abs(value - baseline) > 0.005;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="ds-label">{label}</span>
        <button
          type="button"
          className="ds-btn ds-btn--ghost ds-btn--sm"
          onClick={onReset}
          disabled={!isOverridden}
        >
          Reset
        </button>
      </div>
      <input
        type="number"
        className="ds-input"
        style={{ width: '100%' }}
        value={value}
        step={step}
        min={min}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
      <div className="ds-caption" style={{ marginTop: 4 }}>
        Baseline {format(baseline)}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  current,
  baseline,
  format,
}: {
  label: string;
  current: number;
  baseline: number;
  format: (v: number) => string;
}) {
  const changed = Math.abs(current - baseline) > 0.005;
  return (
    <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{label}</td>
      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: changed ? 700 : 400, color: changed ? 'var(--color-primary-orange)' : undefined }}>
        {format(current)}
      </td>
      <td style={{ padding: '10px 16px', textAlign: 'right' }}>{format(baseline)}</td>
      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
        {changed ? formatDelta(current - baseline, format) : <span className="ds-caption">—</span>}
      </td>
    </tr>
  );
}

function AddHireForm({ onAdd }: { onAdd: (input: NewHireInput) => void }) {
  const [title, setTitle] = useState('');
  const [region, setRegion] = useState(REGION_OPTIONS[0] ?? 'US');
  const [baselineSalary, setBaselineSalary] = useState(100000);
  const [effectiveStartMonth, setEffectiveStartMonth] = useState<MonthIndex>(1);

  const canAdd = title.trim().length > 0 && baselineSalary > 0;

  function handleAdd() {
    if (!canAdd) return;
    onAdd({ title: title.trim(), region, baselineSalary, effectiveStartMonth });
    setTitle('');
    setBaselineSalary(100000);
    setEffectiveStartMonth(1);
  }

  return (
    <div className="ds-card" style={{ padding: 16, marginBottom: 20 }}>
      <div className="ds-label" style={{ marginBottom: 12 }}>
        Add a Hire
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
        <div>
          <div className="ds-caption" style={{ marginBottom: 4 }}>
            Role Title
          </div>
          <input
            type="text"
            className="ds-input"
            style={{ width: '100%' }}
            placeholder="e.g. Backend Engineer"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <div className="ds-caption" style={{ marginBottom: 4 }}>
            Region
          </div>
          <select className="ds-input" style={{ width: '100%' }} value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGION_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="ds-caption" style={{ marginBottom: 4 }}>
            Baseline Salary
          </div>
          <input
            type="number"
            className="ds-input"
            style={{ width: '100%' }}
            step={1000}
            min={0}
            value={baselineSalary}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) setBaselineSalary(n);
            }}
          />
        </div>
        <div>
          <div className="ds-caption" style={{ marginBottom: 4 }}>
            Effective Start
          </div>
          <select
            className="ds-input"
            style={{ width: '100%' }}
            value={effectiveStartMonth}
            onChange={(e) => setEffectiveStartMonth(Number(e.target.value) as MonthIndex)}
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {shortMonthLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="ds-btn ds-btn--primary ds-btn--sm" onClick={handleAdd} disabled={!canAdd}>
          Add Hire
        </button>
      </div>
    </div>
  );
}

function cellStyle(align: 'left' | 'right'): React.CSSProperties {
  return { textAlign: align, padding: '10px 16px', verticalAlign: 'top' };
}

const headStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 16px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
  color: 'var(--color-gray-600)',
  whiteSpace: 'nowrap',
};
