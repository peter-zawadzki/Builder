
import { useState } from 'react';
import { Link } from 'react-router';
import { useScenario } from '../lib/scenario-context';
import { baselineModel } from '../data/baseline';
import { baselineResults } from '../lib/baseline-results';
import { BaselineSlider } from '../components/controls/BaselineSlider';
import { formatCurrency, formatPercent } from '../lib/format';
import { FISCAL_PERIODS } from '../engine/types';
import type { FiscalPeriod } from '../engine/types';

const PAGE = 'Operating Expenses';

export default function OperatingExpensesPage() {
  const scenario = useScenario();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const results = scenario.results.annual.periods;
  const baseline = baselineResults.annual.periods;

  const revenueSharePct =
    scenario.overrides.scalars?.revenueSharePct ?? baselineModel.assumptions.revenueSharePct;

  const marketingOverridden =
    FISCAL_PERIODS.some((p) => scenario.overrides.years?.marketing?.[p] !== undefined) ||
    scenario.overrides.scalars?.revenueSharePct !== undefined;

  function resetAll() {
    scenario.resetControl('revenueSharePct');
    scenario.resetControl('marketing');
  }

  return (
    <div>
      <h2 style={{ fontSize: 32, marginBottom: 8 }}>Operating Expenses</h2>
      <p className="ds-body" style={{ marginBottom: 20, maxWidth: 720 }}>
        Summary of revenue share, staff, contractors, marketing and G&amp;A. Edit the revenue-share rate and the
        marketing plan here; detailed staff, contractor, and G&amp;A line items are edited on their own pages.
      </p>

      <div style={{ marginBottom: 20 }}>
        <BaselineSlider
          label="Sales Commission / Revenue Share %"
          min={0}
          max={0.4}
          step={0.01}
          baseline={baselineModel.assumptions.revenueSharePct}
          value={revenueSharePct}
          onChange={(v) =>
            scenario.setScalarOverride(
              'revenueSharePct',
              'Sales Commission / Revenue Share %',
              PAGE,
              v === baselineModel.assumptions.revenueSharePct ? undefined : v
            )
          }
          onReset={() => scenario.setScalarOverride('revenueSharePct', 'Sales Commission / Revenue Share %', PAGE, undefined)}
          formatValue={(v) => formatPercent(v, 0)}
          colorMode="red-green-fade"
          showRangeCaption={false}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={() => setAdvancedOpen((v) => !v)}>
          {advancedOpen ? 'Hide' : 'Show'} Advanced / By Year
        </button>
        <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={resetAll} disabled={!marketingOverridden}>
          Reset Operating Expenses
        </button>
      </div>

      {advancedOpen && (
        <div className="ds-card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="ds-label" style={{ marginBottom: 10 }}>
            Marketing Plan by Fiscal Year
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {FISCAL_PERIODS.map((period) => {
              const defaultValue = baseline[period].marketing;
              const value = scenario.overrides.years?.marketing?.[period] ?? defaultValue;
              return (
                <div key={period}>
                  <div className="ds-label" style={{ marginBottom: 6 }}>
                    {period}
                  </div>
                  <input
                    type="number"
                    className="ds-input"
                    value={value}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const isDefault = Math.abs(n - defaultValue) < 0.005;
                      scenario.setYearOverride('marketing', 'Marketing', PAGE, period, isDefault ? undefined : n);
                    }}
                  />
                  <div className="ds-caption" style={{ marginTop: 4 }}>
                    Default {formatCurrency(defaultValue)}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="ds-caption" style={{ marginTop: 10 }}>
            FY26/27 marketing normally comes from the detailed monthly marketing schedule (a single authoritative
            annual figure); years FY27/28–FY29/30 come from the active growth preset&apos;s marketing table. All four
            years can be overridden here.
          </p>
        </div>
      )}

      <div className="ds-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
              <th style={cellStyle('left')}>Metric</th>
              {FISCAL_PERIODS.map((p) => (
                <th key={p} style={cellStyle('right')}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Revenue Share" current={FISCAL_PERIODS.map((p) => results[p].revenueShare)} baseline={FISCAL_PERIODS.map((p) => baseline[p].revenueShare)} format={formatCurrency} />
            <Row
              label={
                <span>
                  Staff{' '}
                  <Link to="/financial-planning/staffing" className="ds-caption">
                    (edit on Staffing)
                  </Link>
                </span>
              }
              current={FISCAL_PERIODS.map((p) => results[p].staff)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].staff)}
              format={formatCurrency}
            />
            <Row
              label={
                <span>
                  Contract Labor{' '}
                  <Link to="/financial-planning/contractors" className="ds-caption">
                    (edit on Contractors)
                  </Link>
                </span>
              }
              current={FISCAL_PERIODS.map((p) => results[p].contractLabor)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].contractLabor)}
              format={formatCurrency}
            />
            <Row label="Marketing" current={FISCAL_PERIODS.map((p) => results[p].marketing)} baseline={FISCAL_PERIODS.map((p) => baseline[p].marketing)} format={formatCurrency} />
            <Row
              label={
                <span>
                  G&amp;A{' '}
                  <Link to="/financial-planning/ga" className="ds-caption">
                    (edit on G&amp;A)
                  </Link>
                </span>
              }
              current={FISCAL_PERIODS.map((p) => results[p].ga)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].ga)}
              format={formatCurrency}
            />
            <Row label="Total OPEX" current={FISCAL_PERIODS.map((p) => results[p].totalOpex)} baseline={FISCAL_PERIODS.map((p) => baseline[p].totalOpex)} format={formatCurrency} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cellStyle(align: 'left' | 'right'): React.CSSProperties {
  return { textAlign: align, padding: '10px 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--color-gray-600)' };
}

function Row({
  label,
  current,
  baseline,
  format,
}: {
  label: React.ReactNode;
  current: number[];
  baseline: number[];
  format: (v: number) => string;
}) {
  return (
    <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{label}</td>
      {current.map((v, i) => {
        const changed = Math.abs(v - baseline[i]) > 0.5;
        return (
          <td key={FISCAL_PERIODS[i] as FiscalPeriod} style={{ padding: '10px 16px', textAlign: 'right' }}>
            <span style={{ fontWeight: changed ? 700 : 400, color: changed ? 'var(--color-primary-orange)' : undefined }}>
              {format(v)}
            </span>
            {changed && <div className="ds-caption">was {format(baseline[i])}</div>}
          </td>
        );
      })}
    </tr>
  );
}
