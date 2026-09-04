
import { useState } from 'react';
import { useScenario } from '../lib/scenario-context';
import { baselineModel } from '../data/baseline';
import { baselineResults } from '../lib/baseline-results';
import { resolveContractors } from '../engine/contractors';
import { formatCurrency } from '../lib/format';
import { FISCAL_PERIODS } from '../engine/types';
import type { ContractorItem } from '../engine/types';

const SECTIONS = ['Core Contractors', 'Europe'] as const;
const MONTH_LABELS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

export default function ContractorsPage() {
  const scenario = useScenario();
  const overrides = scenario.overrides.contractors ?? [];
  const overrideById = new Map(overrides.map((o) => [o.contractorItemId, o]));

  const current = resolveContractors(baselineModel.contractorItems, overrides);
  const baseline = resolveContractors(baselineModel.contractorItems, []);
  const totalChanged = Math.abs(current.fy2627Total - baseline.fy2627Total) > 0.5;

  const annual = scenario.results.annual.periods;

  const itemsBySection = SECTIONS.map((section) => ({
    section,
    items: baselineModel.contractorItems.filter((i) => i.section === section),
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 32, marginBottom: 8 }}>Contractors</h2>
          <p className="ds-body" style={{ maxWidth: 720 }}>
            Every contractor line across all four fiscal years. Edit the FY26/27 annual amount for a line; the
            engine scales its existing monthly curve proportionally.
          </p>
        </div>
        <button type="button" className="ds-btn ds-btn--outline ds-btn--sm" onClick={() => scenario.resetPage('Contractors')}>
          Reset Contractors
        </button>
      </div>

      <div className="ds-card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 32 }}>
        <SummaryStat label="FY26/27 Total Contractor Cost" value={current.fy2627Total} baseline={baseline.fy2627Total} changed={totalChanged} />
      </div>

      <div className="ds-card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
              <th style={headCell('left')}>Contract Labor by Fiscal Year</th>
              {FISCAL_PERIODS.map((p) => (
                <th key={p} style={headCell('right')}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '10px 16px', fontWeight: 600 }}>Total Contract Labor</td>
              {FISCAL_PERIODS.map((p) => {
                const value = annual[p].contractLabor;
                const baselineValue = baselineResults.annual.periods[p].contractLabor;
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

      {itemsBySection.map(({ section, items }) => (
        <div key={section} className="ds-card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-gray-200)' }}>
            <span className="ds-label">{section}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
                <th style={headCell('left')}>Line</th>
                <th style={headCell('left')}>Person / Region</th>
                {FISCAL_PERIODS.map((p) => (
                  <th key={p} style={headCell('right')}>
                    {p}
                  </th>
                ))}
                <th style={headCell('left')}>Advanced</th>
                <th style={headCell('right')}>Reset</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ContractorRow
                  key={item.id}
                  item={item}
                  override={overrideById.get(item.id)}
                  annual={annual}
                  baselineFy2627Total={baseline.fy2627Total}
                  onChange={(annualAmount) =>
                    scenario.setContractorOverride(item.id, {
                      annualAmount: annualAmount === item.baselineAnnual ? undefined : annualAmount,
                    })
                  }
                  onReset={() => scenario.setContractorOverride(item.id, { annualAmount: undefined, monthlySchedule: undefined })}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ContractorRow({
  item,
  override,
  annual,
  baselineFy2627Total,
  onChange,
  onReset,
}: {
  item: ContractorItem;
  override: { annualAmount?: number; monthlySchedule?: number[] } | undefined;
  annual: ReturnType<typeof useScenario>['results']['annual']['periods'];
  baselineFy2627Total: number;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const currentAnnual = override?.annualAmount ?? item.baselineAnnual;
  const isModified = override?.annualAmount !== undefined || override?.monthlySchedule !== undefined;

  const ratio = item.baselineAnnual > 0 ? currentAnnual / item.baselineAnnual : 1;
  const monthly = override?.monthlySchedule ?? item.baselineMonthlySchedule.map((v) => v * ratio);
  // Fixed baseline denominator (never the live/edited total), so this line's own projection
  // depends only on its own currentAnnual and can't be shifted by editing any other line.
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
        <td style={{ padding: '10px 16px', color: 'var(--color-gray-600)' }}>
          {[item.person, item.region].filter(Boolean).join(' / ') || '—'}
        </td>
        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
          <input
            type="number"
            className="ds-input"
            style={{
              width: 110,
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
          {isModified && <div className="ds-caption">was {formatCurrency(item.baselineAnnual)}</div>}
        </td>
        {FISCAL_PERIODS.slice(1).map((period) => (
          <td key={period} style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--color-gray-600)' }}>
            {formatCurrency(shareOfBaselineTotal * annual[period].contractLabor)}
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
          <td colSpan={FISCAL_PERIODS.length + 4} style={{ padding: '4px 16px 14px', background: 'var(--color-gray-100)' }}>
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
              FY26/27 monthly dollars = current annual amount &times; baseline monthly curve (read-only).
            </div>
          </td>
        </tr>
      )}
    </>
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
