
import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useScenario } from '../lib/scenario-context';
import { baselineModel } from '../data/baseline';
import { baselineResults } from '../lib/baseline-results';
import { BaselineSlider } from '../components/controls/BaselineSlider';
import { formatCurrency } from '../lib/format';
import { FISCAL_PERIODS } from '../engine/types';
import type { CalendarMonthIndex, FiscalPeriod, MonthlyCashResult } from '../engine/types';

const PAGE = 'Cash & Capital';
const ALL_CALENDAR_MONTHS: CalendarMonthIndex[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// The capital raise is modeled as a single lump-sum cash infusion landing in one month,
// restricted to October–June (CalendarMonthIndex 4–12; FY26/27 runs Jul–Jun, see
// MONTH_LABELS in engine/monthlyCash.ts).
const RAISE_MONTHS: { value: CalendarMonthIndex; label: string }[] = [
  { value: 4, label: 'Oct' },
  { value: 5, label: 'Nov' },
  { value: 6, label: 'Dec' },
  { value: 7, label: 'Jan' },
  { value: 8, label: 'Feb' },
  { value: 9, label: 'Mar' },
  { value: 10, label: 'Apr' },
  { value: 11, label: 'May' },
  { value: 12, label: 'Jun' },
];
const DEFAULT_RAISE_MONTH: CalendarMonthIndex = RAISE_MONTHS[0].value;
const MAX_RAISE_AMOUNT = 10_000_000;

const YEAR_FIELDS = [
  {
    key: 'minimumCashReserve',
    label: 'Minimum Desired Cash Reserve',
    min: 0,
    max: null,
    step: 50000,
    anchorPeriod: 'FY26/27' as FiscalPeriod,
  },
  // Working capital change is genuinely zero every year at baseline (no real curve to
  // preserve), and can legitimately go negative, so it keeps a fixed symmetric range
  // around its zero baseline rather than the 2x-baseline centering technique.
  {
    key: 'workingCapitalChange',
    label: 'Working Capital Change',
    min: -2000000,
    max: 2000000,
    step: 25000,
    anchorPeriod: 'FY26/27' as FiscalPeriod,
  },
] as const;

type FieldKey = (typeof YEAR_FIELDS)[number]['key'];

export default function CashCapitalPage() {
  const scenario = useScenario();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [bufferPct, setBufferPct] = useState(0.2);
  // Periods pinned by an explicit Advanced-by-year edit, per field — tracked separately
  // from the sliders' own uniform shift so a slider never clobbers a year the user
  // deliberately set by hand (same pattern as Pricing & Revenue / Mountain Growth).
  const [pinnedPeriods, setPinnedPeriods] = useState<Record<FieldKey, Set<FiscalPeriod>>>({
    minimumCashReserve: new Set(),
    workingCapitalChange: new Set(),
  });

  const annual = scenario.results.annual.periods;
  const baselineAnnual = baselineResults.annual.periods;
  const monthly = scenario.results.monthly;
  const baselineMonthly = baselineResults.monthly;
  const capitalRequirement = scenario.results.capitalRequirement;

  const minCashReserve = scenario.overrides.years?.minimumCashReserve ?? {};
  const workingCapitalChange = scenario.overrides.years?.workingCapitalChange ?? {};

  const raiseEntries = scenario.overrides.capitalRaiseEvents ?? [];
  const raiseAmount = raiseEntries.reduce((sum, e) => sum + e.amount, 0);
  const raiseMonth = raiseEntries[0]?.month ?? DEFAULT_RAISE_MONTH;

  // Enforces single-lump-sum semantics: clears every month, then (re)writes exactly one.
  function setCapitalRaise(month: CalendarMonthIndex, amount: number) {
    for (const m of ALL_CALENDAR_MONTHS) scenario.setCapitalRaiseEvent(m, 0);
    if (amount) scenario.setCapitalRaiseEvent(month, amount);
  }

  const minMonth = useMemo(() => {
    let min: MonthlyCashResult | null = null;
    for (const m of monthly) {
      if (min === null || m.endingCash < min.endingCash) min = m;
    }
    return min;
  }, [monthly]);

  const recommendedRaise = capitalRequirement.requiredCapitalToReserve * (1 + bufferPct);

  const chartData = monthly.map((m, i) => ({
    label: m.label,
    endingCash: m.endingCash,
    baselineEndingCash: baselineMonthly[i]?.endingCash ?? 0,
    capitalRaise: m.capitalRaise,
  }));

  const isMinimumCashReserveOverridden = FISCAL_PERIODS.some(
    (p) => minCashReserve[p] !== undefined
  );
  const isWorkingCapitalOverridden = FISCAL_PERIODS.some(
    (p) => workingCapitalChange[p] !== undefined
  );

  // Shifts every fiscal year from the field's anchor period onward by the same amount
  // the user moves the anchor, preserving the baseline curve's own shape. Minimum cash
  // reserve can't go negative, but working capital change legitimately can.
  function applyUniformShift(key: FieldKey, anchorValue: number) {
    const field = YEAR_FIELDS.find((f) => f.key === key)!;
    const baselineSeries = baselineModel.assumptions[key];
    const anchorIndex = FISCAL_PERIODS.indexOf(field.anchorPeriod);
    const delta = anchorValue - baselineSeries[field.anchorPeriod];
    FISCAL_PERIODS.forEach((period, i) => {
      if (i < anchorIndex) return;
      if (pinnedPeriods[key].has(period)) return;
      const baselineValue = baselineSeries[period];
      const shifted = baselineValue + delta;
      const newValue = key === 'minimumCashReserve' ? Math.max(0, shifted) : shifted;
      const isDefault = Math.abs(newValue - baselineValue) < 1e-9;
      scenario.setYearOverride(key, field.label, PAGE, period, isDefault ? undefined : newValue);
    });
  }

  function resetField(key: FieldKey) {
    scenario.resetControl(key);
    setPinnedPeriods((prev) => ({ ...prev, [key]: new Set() }));
  }

  function resetCashCapitalPage() {
    scenario.resetPage('Cash & Capital');
    scenario.resetControl('minimumCashReserve');
    scenario.resetControl('workingCapitalChange');
    setPinnedPeriods({ minimumCashReserve: new Set(), workingCapitalChange: new Set() });
  }

  return (
    <div>
      <h2 style={{ fontSize: 32, marginBottom: 8 }}>Cash &amp; Capital</h2>
      <p className="ds-body" style={{ marginBottom: 20, maxWidth: 760 }}>
        Annual cash bridge, FY26/27 monthly cash flow detail, and a single lump-sum capital-raise event. Baseline
        preserves a zero raise and zero working-capital change.
      </p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button type="button" className="ds-btn ds-btn--outline ds-btn--sm" onClick={resetCashCapitalPage}>
          Reset Cash &amp; Capital
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {YEAR_FIELDS.map((field) => {
          const baselineAtAnchor = baselineModel.assumptions[field.key][field.anchorPeriod];
          const value = scenario.overrides.years?.[field.key]?.[field.anchorPeriod] ?? baselineAtAnchor;
          // A fixed min/max won't generally center the baseline on the track. When max is
          // left unset, center it exactly by spanning 0 to 2x the baseline instead.
          const max = field.max ?? Math.max(baselineAtAnchor * 2, field.step * 10);
          return (
            <BaselineSlider
              key={field.key}
              label={`${field.label} (${field.anchorPeriod})`}
              min={field.min}
              max={max}
              step={field.step}
              baseline={baselineAtAnchor}
              value={value}
              onChange={(v) => applyUniformShift(field.key, v)}
              onReset={() => resetField(field.key)}
              formatValue={(v) => formatCurrency(v, { compact: true })}
              colorMode="red-green-fade"
              showRangeCaption={false}
            />
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <BaselineSlider
          label="Capital Raise Amount"
          min={0}
          max={MAX_RAISE_AMOUNT}
          step={100000}
          baseline={0}
          value={raiseAmount}
          onChange={(v) => setCapitalRaise(raiseMonth, v)}
          onReset={() => setCapitalRaise(raiseMonth, 0)}
          formatValue={(v) => formatCurrency(v, { compact: true })}
          colorMode="red-green-fade"
          showRangeCaption={false}
        />
        <BaselineSlider
          label="Capital Raise Month"
          min={RAISE_MONTHS[0].value}
          max={RAISE_MONTHS[RAISE_MONTHS.length - 1].value}
          step={1}
          baseline={DEFAULT_RAISE_MONTH}
          value={raiseMonth}
          onChange={(v) => setCapitalRaise(v as CalendarMonthIndex, raiseAmount)}
          onReset={() => setCapitalRaise(DEFAULT_RAISE_MONTH, raiseAmount)}
          formatValue={(v) => RAISE_MONTHS.find((m) => m.value === v)?.label ?? String(v)}
          colorMode="aggressiveness"
          showRangeCaption={false}
          markers={RAISE_MONTHS.map((m) => ({ value: m.value, label: m.label, active: m.value === raiseMonth }))}
        />
      </div>

      <button
        type="button"
        className="ds-btn ds-btn--ghost ds-btn--sm"
        onClick={() => setAdvancedOpen((v) => !v)}
        style={{ marginBottom: 12 }}
      >
        {advancedOpen ? 'Hide' : 'Show'} Advanced / By Year
      </button>

      {advancedOpen && (
        <div className="ds-card" style={{ padding: 16, marginBottom: 20 }}>
          {YEAR_FIELDS.map((field) => {
            const baselineSeries = baselineModel.assumptions[field.key];
            return (
              <div key={field.key} style={{ marginBottom: 16 }}>
                <div className="ds-label" style={{ marginBottom: 10 }}>
                  {field.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {FISCAL_PERIODS.map((period) => {
                    const defaultValue = baselineSeries[period];
                    const value = scenario.overrides.years?.[field.key]?.[period] ?? defaultValue;
                    return (
                      <YearInput
                        key={period}
                        period={period}
                        value={value}
                        defaultValue={defaultValue}
                        onChange={(n, isDefault) => {
                          scenario.setYearOverride(field.key, field.label, PAGE, period, isDefault ? undefined : n);
                          setPinnedPeriods((prev) => {
                            const next = new Set(prev[field.key]);
                            if (isDefault) next.delete(period);
                            else next.add(period);
                            return { ...prev, [field.key]: next };
                          });
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          {(isMinimumCashReserveOverridden || isWorkingCapitalOverridden) && (
            <p className="ds-caption" style={{ marginTop: 12 }}>
              Modified from baseline — use the sliders above ({YEAR_FIELDS[0].anchorPeriod}) or Reset Cash &amp;
              Capital to clear all years.
            </p>
          )}
        </div>
      )}

      <div className="ds-card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
              <th style={cellStyle('left')}>Annual Cash Bridge</th>
              {FISCAL_PERIODS.map((p) => (
                <th key={p} style={cellStyle('right')}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Beginning Cash" current={FISCAL_PERIODS.map((p) => annual[p].beginningCash)} baseline={FISCAL_PERIODS.map((p) => baselineAnnual[p].beginningCash)} />
            <Row label="Net Income" current={FISCAL_PERIODS.map((p) => annual[p].netIncome)} baseline={FISCAL_PERIODS.map((p) => baselineAnnual[p].netIncome)} />
            <Row label="Depreciation" current={FISCAL_PERIODS.map((p) => annual[p].depreciation)} baseline={FISCAL_PERIODS.map((p) => baselineAnnual[p].depreciation)} />
            <Row
              label="Change in Working Capital"
              current={FISCAL_PERIODS.map((p) => annual[p].workingCapitalChange)}
              baseline={FISCAL_PERIODS.map((p) => baselineAnnual[p].workingCapitalChange)}
            />
            <Row label="Net Asset Spend" current={FISCAL_PERIODS.map((p) => annual[p].netAssetSpend)} baseline={FISCAL_PERIODS.map((p) => baselineAnnual[p].netAssetSpend)} />
            <Row
              label="Year End Cash Balance without Raise"
              current={FISCAL_PERIODS.map((p) => annual[p].yearEndCashWithoutRaise)}
              baseline={FISCAL_PERIODS.map((p) => baselineAnnual[p].yearEndCashWithoutRaise)}
            />
            <Row label="Capital Raise" current={FISCAL_PERIODS.map((p) => annual[p].capitalRaise)} baseline={FISCAL_PERIODS.map((p) => baselineAnnual[p].capitalRaise)} />
            <Row label="Ending Cash" current={FISCAL_PERIODS.map((p) => annual[p].endingCash)} baseline={FISCAL_PERIODS.map((p) => baselineAnnual[p].endingCash)} bold />
            <Row
              label="Minimum Desired Cash Reserve"
              current={FISCAL_PERIODS.map((p) => annual[p].minimumCashReserve)}
              baseline={FISCAL_PERIODS.map((p) => baselineAnnual[p].minimumCashReserve)}
            />
            <Row
              label="Cash Above / (Below) Reserve"
              current={FISCAL_PERIODS.map((p) => annual[p].cashVsReserve)}
              baseline={FISCAL_PERIODS.map((p) => baselineAnnual[p].cashVsReserve)}
              bold
            />
          </tbody>
        </table>
      </div>

      <div className="ds-card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="ds-label" style={{ marginBottom: 12 }}>
          FY26/27 Monthly Ending Cash
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--color-gray-600)' }} />
            <YAxis
              tickFormatter={(v) => formatCurrency(Number(v), { compact: true })}
              tick={{ fontSize: 11, fill: 'var(--color-gray-600)' }}
              width={70}
            />
            <Tooltip formatter={(v) => formatCurrency(Number(v))} />
            <Bar dataKey="capitalRaise" name="Capital Raise" fill="var(--color-regular-blue)" barSize={16} />
            <Line
              type="monotone"
              dataKey="baselineEndingCash"
              name="Baseline Ending Cash"
              stroke="var(--color-gray-400)"
              strokeDasharray="4 3"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="endingCash"
              name="Ending Cash"
              stroke="var(--color-primary-orange)"
              dot={{ r: 3 }}
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
        {minMonth && (
          <p className="ds-caption" style={{ marginTop: 8 }}>
            Minimum cash month: <strong>{minMonth.label}</strong> at {formatCurrency(minMonth.endingCash)} ending cash.
          </p>
        )}
      </div>

      <div className="ds-card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
              <th style={cellStyle('left')}>FY26/27 Monthly Detail</th>
              {monthly.map((m) => (
                <th key={m.month} style={cellStyle('right')}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Beginning Cash" current={monthly.map((m) => m.beginningCash)} baseline={baselineMonthly.map((m) => m.beginningCash)} />
            <Row label="Cash Inflow" current={monthly.map((m) => m.cashInflow)} baseline={baselineMonthly.map((m) => m.cashInflow)} />
            <Row label="Gross Cash Burn" current={monthly.map((m) => m.grossCashBurn)} baseline={baselineMonthly.map((m) => m.grossCashBurn)} />
            <Row label="Net Cash Burn" current={monthly.map((m) => m.netCashBurn)} baseline={baselineMonthly.map((m) => m.netCashBurn)} />
            <Row label="Ending Cash" current={monthly.map((m) => m.endingCash)} baseline={baselineMonthly.map((m) => m.endingCash)} bold highlightMin={minMonth?.month} months={monthly.map((m) => m.month)} />
          </tbody>
        </table>
      </div>

      <div className="ds-card" style={{ padding: 16 }}>
        <div className="ds-label" style={{ marginBottom: 12 }}>
          Capital Planning Outputs
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 16 }}>
          <Stat label="Required Capital to Zero" value={formatCurrency(capitalRequirement.requiredCapitalToZero)} />
          <Stat label="Required Capital to Reserve" value={formatCurrency(capitalRequirement.requiredCapitalToReserve)} />
          <Stat label="Max Annual Reserve Deficit" value={formatCurrency(capitalRequirement.maxAnnualReserveDeficit)} />
        </div>
        <div style={{ borderTop: '1px solid var(--color-gray-200)', paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
            <label className="ds-label" htmlFor="buffer-pct">
              Recommendation Buffer %
            </label>
            <input
              id="buffer-pct"
              type="number"
              className="ds-input"
              style={{ width: 100 }}
              value={Math.round(bufferPct * 100)}
              min={0}
              max={200}
              step={5}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) setBufferPct(n / 100);
              }}
            />
            <Stat label="Recommended Raise" value={formatCurrency(recommendedRaise)} emphasize />
          </div>
        </div>
      </div>
    </div>
  );
}

function cellStyle(align: 'left' | 'right'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 16px',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    color: 'var(--color-gray-600)',
  };
}

function Row({
  label,
  current,
  baseline,
  bold,
  highlightMin,
  months,
}: {
  label: string;
  current: number[];
  baseline: number[];
  bold?: boolean;
  highlightMin?: CalendarMonthIndex;
  months?: CalendarMonthIndex[];
}) {
  return (
    <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{label}</td>
      {current.map((v, i) => {
        const changed = Math.abs(v - baseline[i]) > 0.5;
        const isMin = months && highlightMin !== undefined && months[i] === highlightMin;
        return (
          <td
            key={i}
            style={{
              padding: '10px 16px',
              textAlign: 'right',
              background: isMin ? 'var(--color-functional-red-bg, rgba(220,53,69,0.08))' : undefined,
            }}
          >
            <span
              style={{
                fontWeight: changed || bold ? 700 : 400,
                color: changed ? 'var(--color-primary-orange)' : undefined,
              }}
            >
              {formatCurrency(v)}
            </span>
            {changed && <div className="ds-caption">was {formatCurrency(baseline[i])}</div>}
          </td>
        );
      })}
    </tr>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <div className="ds-caption">{label}</div>
      <div
        className="ds-mono"
        style={{ fontSize: 14, fontWeight: 600, color: emphasize ? 'var(--color-primary-orange)' : undefined }}
      >
        {value}
      </div>
    </div>
  );
}

function YearInput({
  period,
  value,
  defaultValue,
  onChange,
}: {
  period: FiscalPeriod;
  value: number;
  defaultValue: number;
  onChange: (value: number, isDefault: boolean) => void;
}) {
  return (
    <div>
      <div className="ds-label" style={{ marginBottom: 6 }}>
        {period}
      </div>
      <input
        type="number"
        className="ds-input"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(n, n === defaultValue);
        }}
      />
      <div className="ds-caption" style={{ marginTop: 4 }}>
        Default {formatCurrency(defaultValue, { compact: true })}
      </div>
    </div>
  );
}
