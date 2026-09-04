
import { useState } from 'react';
import { useScenario } from '../lib/scenario-context';
import { baselineModel } from '../data/baseline';
import { baselineResults } from '../lib/baseline-results';
import { resolveGa } from '../engine/ga';
import { formatCurrency, formatPercent } from '../lib/format';
import { FISCAL_PERIODS } from '../engine/types';
import type { GaItem } from '../engine/types';

const CATEGORIES = ['Installation Equipment', 'Travel & Entertainment', 'General Operations', 'Legal & Professional'] as const;
const MONTH_LABELS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const YEAR_COLUMN_STYLE: React.CSSProperties = { minWidth: 130 };

export default function GaPage() {
  const scenario = useScenario();
  const overrides = scenario.overrides.ga ?? [];
  const overrideById = new Map(overrides.map((o) => [o.gaItemId, o]));

  const current = resolveGa(baselineModel.gaItems, overrides);
  const baseline = resolveGa(baselineModel.gaItems, []);
  const totalChanged = Math.abs(current.fy2627Total - baseline.fy2627Total) > 0.5;

  const annual = scenario.results.annual.periods;
  const baselineAnnual = baselineResults.annual.periods;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 32, marginBottom: 8 }}>G&amp;A</h2>
          <p className="ds-body" style={{ maxWidth: 720 }}>
            All source G&amp;A categories and line items. Annual amount is the primary control; each category&rsquo;s
            monthly allocation curve and rollups are read-only outputs.
          </p>
        </div>
        <button type="button" className="ds-btn ds-btn--outline ds-btn--sm" onClick={() => scenario.resetPage('G&A')}>
          Reset G&amp;A
        </button>
      </div>

      <div className="ds-card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 32 }}>
        <SummaryStat label="FY26/27 Total G&A" value={current.fy2627Total} baseline={baseline.fy2627Total} changed={totalChanged} />
      </div>

      <div className="ds-card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
              <th style={headCell('left')}>G&amp;A by Fiscal Year</th>
              {FISCAL_PERIODS.map((p) => (
                <th key={p} style={headCell('right')}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '10px 16px', fontWeight: 600 }}>Total G&amp;A</td>
              {FISCAL_PERIODS.map((p) => {
                const value = annual[p].ga;
                const baselineValue = baselineAnnual[p].ga;
                const changed = Math.abs(value - baselineValue) > 0.5;
                return (
                  <td key={p} style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <span
                      style={{ fontWeight: 700, color: changed ? 'var(--color-primary-orange)' : undefined }}
                    >
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

      {CATEGORIES.map((category) => (
        <CategorySection
          key={category}
          category={category}
          overrideById={overrideById}
          scenario={scenario}
          annual={annual}
          baselineFy2627Total={baseline.fy2627Total}
        />
      ))}
    </div>
  );
}

function CategorySection({
  category,
  overrideById,
  scenario,
  annual,
  baselineFy2627Total,
}: {
  category: string;
  overrideById: Map<string, { annualAmount?: number; allocationCurve?: number[] }>;
  scenario: ReturnType<typeof useScenario>;
  annual: ReturnType<typeof useScenario>['results']['annual']['periods'];
  baselineFy2627Total: number;
}) {
  const curveItem = baselineModel.gaItems.find((i) => i.category === category && i.type === 'allocation_curve');
  const lineItems = baselineModel.gaItems.filter((i) => i.category === category && i.type === 'expense_line');
  const curve = curveItem?.baselineAllocationCurve ?? new Array(12).fill(1 / 12);

  const currentSubtotal = lineItems.reduce((sum, item) => sum + (overrideById.get(item.id)?.annualAmount ?? item.baselineAnnual ?? 0), 0);
  const baselineSubtotal = lineItems.reduce((sum, item) => sum + (item.baselineAnnual ?? 0), 0);
  const subtotalChanged = Math.abs(currentSubtotal - baselineSubtotal) > 0.5;
  const categoryMultiplier = baselineSubtotal > 0 ? currentSubtotal / baselineSubtotal : 1;

  // Scales every line in the category by the same multiplier, relative to each line's own
  // FY26/27 baseline (not its current value), so repeated drags don't compound.
  function applyCategoryMultiplier(multiplier: number) {
    for (const item of lineItems) {
      const baselineItemAnnual = item.baselineAnnual ?? 0;
      // Round to the nearest dollar — these are whole-dollar figures, and multiplying by a
      // step-0.01 slider value otherwise leaves floating-point noise like 3300.0000000000005.
      const newAnnual = Math.round(baselineItemAnnual * multiplier);
      const isDefault = Math.abs(newAnnual - baselineItemAnnual) < 0.5;
      scenario.setGaOverride(item.id, { annualAmount: isDefault ? undefined : newAnnual });
    }
  }

  function resetCategory() {
    for (const item of lineItems) {
      scenario.setGaOverride(item.id, { annualAmount: undefined, allocationCurve: undefined });
    }
  }

  return (
    <div className="ds-card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
        <span className="ds-label" style={{ whiteSpace: 'nowrap' }}>{category}</span>
        <CategorySpendSlider value={categoryMultiplier} onChange={applyCategoryMultiplier} onReset={resetCategory} />
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span className="ds-caption" style={{ marginRight: 8 }}>
            Category Subtotal (FY26/27)
          </span>
          <span
            className="ds-mono"
            style={{ fontWeight: 700, color: subtotalChanged ? 'var(--color-primary-orange)' : undefined }}
          >
            {formatCurrency(currentSubtotal)}
          </span>
          {subtotalChanged && <span className="ds-caption" style={{ marginLeft: 8 }}>was {formatCurrency(baselineSubtotal)}</span>}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
            <th style={headCell('left')}>Line</th>
            {FISCAL_PERIODS.map((p) => (
              <th key={p} style={{ ...headCell('right'), ...YEAR_COLUMN_STYLE }}>
                {p}
              </th>
            ))}
            <th style={headCell('left')}>Advanced</th>
            <th style={headCell('right')}>Reset</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item) => (
            <GaRow
              key={item.id}
              item={item}
              curve={curve}
              override={overrideById.get(item.id)}
              annual={annual}
              baselineFy2627Total={baselineFy2627Total}
              onChange={(annualAmount) =>
                scenario.setGaOverride(item.id, {
                  annualAmount: annualAmount === item.baselineAnnual ? undefined : annualAmount,
                })
              }
              onReset={() => scenario.setGaOverride(item.id, { annualAmount: undefined, allocationCurve: undefined })}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GaRow({
  item,
  curve,
  override,
  annual,
  baselineFy2627Total,
  onChange,
  onReset,
}: {
  item: GaItem;
  curve: number[];
  override: { annualAmount?: number; allocationCurve?: number[] } | undefined;
  annual: ReturnType<typeof useScenario>['results']['annual']['periods'];
  baselineFy2627Total: number;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const baselineAnnual = item.baselineAnnual ?? 0;
  const currentAnnual = override?.annualAmount ?? baselineAnnual;
  const isModified = override?.annualAmount !== undefined || override?.allocationCurve !== undefined;
  const effectiveCurve = override?.allocationCurve ?? curve;
  const monthly = effectiveCurve.map((pct) => pct * currentAnnual);
  // Denominator is the fixed baseline FY26/27 total (never the live/edited total), so this
  // line's own projection depends only on its own currentAnnual — editing any other line
  // can't shift it, since neither this ratio nor the FY27/28+ totals respond to other edits.
  const shareOfBaselineTotal = baselineFy2627Total > 0 ? currentAnnual / baselineFy2627Total : 0;

  return (
    <>
      <tr style={{ borderBottom: advancedOpen ? 'none' : '1px solid var(--color-gray-200)' }}>
        <td style={{ padding: '10px 16px', fontWeight: 600 }}>
          {item.title}
          {isModified && (
            <span className="ds-chip ds-chip--modified" style={{ marginLeft: 8 }}>
              Modified
            </span>
          )}
        </td>
        <td style={{ padding: '10px 16px', textAlign: 'right', ...YEAR_COLUMN_STYLE }}>
          <input
            type="number"
            className="ds-input"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              textAlign: 'right',
              fontWeight: isModified ? 700 : 400,
              color: isModified ? 'var(--color-primary-orange)' : undefined,
            }}
            value={currentAnnual}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isNaN(n)) return;
              onChange(n);
            }}
            aria-label={`${item.title} annual amount`}
          />
          {isModified && <div className="ds-caption">was {formatCurrency(baselineAnnual)}</div>}
        </td>
        {FISCAL_PERIODS.slice(1).map((period) => (
          <td key={period} style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--color-gray-600)', ...YEAR_COLUMN_STYLE }}>
            {formatCurrency(shareOfBaselineTotal * annual[period].ga)}
          </td>
        ))}
        <td style={{ padding: '10px 16px' }}>
          <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={() => setAdvancedOpen((v) => !v)}>
            {advancedOpen ? 'Hide' : 'Show'} Monthly
          </button>
        </td>
        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
          <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={onReset} disabled={!isModified}>
            Reset
          </button>
        </td>
      </tr>
      {advancedOpen && (
        <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
          <td colSpan={FISCAL_PERIODS.length + 2} style={{ padding: '4px 16px 14px', background: 'var(--color-gray-100)' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {monthly.map((v, i) => (
                <div key={i} style={{ textAlign: 'center', minWidth: 44 }}>
                  <div className="ds-caption">{MONTH_LABELS[i]}</div>
                  <div className="ds-mono" style={{ fontSize: 12 }}>
                    {v === 0 ? '—' : formatCurrency(v, { compact: true })}
                  </div>
                </div>
              ))}
            </div>
            <div className="ds-caption" style={{ marginTop: 6 }}>
              FY26/27 monthly dollars = current annual amount &times; category allocation curve (read-only).
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CategorySpendSlider({
  value,
  onChange,
  onReset,
}: {
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const min = 0.5;
  const max = 1.5;
  const baselinePct = ((1 - min) / (max - min)) * 100; // 50% — centered
  const isOverridden = Math.abs(value - 1) > 0.005;

  return (
    <div style={{ flex: '0 1 240px', minWidth: 200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
        <span className="ds-caption" style={{ whiteSpace: 'nowrap' }}>
          Category Spend Adjustment
        </span>
        <span
          className="ds-mono"
          style={{ fontSize: 12, fontWeight: 600, color: isOverridden ? 'var(--color-primary-orange)' : undefined }}
        >
          {formatPercent(value, 0)}
        </span>
      </div>
      <div style={{ position: 'relative', padding: '6px 0' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: `${baselinePct}%`,
            top: 4,
            bottom: 4,
            width: 2,
            background: 'var(--color-dark)',
            transform: 'translateX(-1px)',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={0.01}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="ds-slider ds-slider--gradient"
          style={{ width: '100%', position: 'relative', zIndex: 1 }}
          aria-label="Category spend adjustment"
          aria-valuetext={formatPercent(value, 0)}
        />
      </div>
      {isOverridden && (
        <button
          type="button"
          className="ds-btn ds-btn--ghost ds-btn--sm"
          onClick={onReset}
          style={{ marginTop: 2 }}
        >
          Reset Category
        </button>
      )}
    </div>
  );
}

function headCell(align: 'left' | 'right'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 16px',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    color: 'var(--color-gray-600)',
    whiteSpace: 'nowrap',
  };
}

function SummaryStat({ label, value, baseline, changed }: { label: string; value: number; baseline: number; changed: boolean }) {
  return (
    <div>
      <div className="ds-caption">{label}</div>
      <div className="ds-mono" style={{ fontSize: 20, fontWeight: 700, color: changed ? 'var(--color-primary-orange)' : undefined }}>
        {formatCurrency(value)}
      </div>
      {changed && <div className="ds-caption">was {formatCurrency(baseline)}</div>}
    </div>
  );
}
