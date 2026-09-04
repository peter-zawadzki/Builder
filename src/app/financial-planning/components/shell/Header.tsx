
import { useState } from 'react';
import { useScenario } from '../../lib/scenario-context';
import { OverrideDrawer } from './OverrideDrawer';
import { SaveScenarioModal } from './SaveScenarioModal';
import { baselineResults } from '../../lib/baseline-results';
import { FISCAL_PERIODS } from '../../engine/types';
import { formatCurrency } from '../../lib/format';

export function Header() {
  const scenario = useScenario();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  return (
    <header
      style={{
        height: 'var(--app-header-height)',
        borderBottom: '1px solid var(--color-gray-200)',
        background: 'var(--color-white)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        gap: 16,
      }}
    >
      <input
        className="ds-input"
        style={{ width: 180, flexShrink: 0, border: 'none', fontWeight: 700, fontSize: 16, padding: '4px 0' }}
        value={scenario.scenarioName}
        onChange={(e) => scenario.setScenarioName(e.target.value)}
        aria-label="Scenario name"
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto repeat(4, minmax(76px, 1fr))',
          columnGap: 14,
          rowGap: 2,
          alignItems: 'center',
          overflowX: 'auto',
        }}
        aria-label="Revenue and EBITDA by fiscal year, current scenario vs baseline"
      >
        <div />
        {FISCAL_PERIODS.map((period) => (
          <div key={period} className="ds-caption" style={{ fontSize: 10, textAlign: 'right', whiteSpace: 'nowrap' }}>
            {period}
          </div>
        ))}

        <div className="ds-caption" style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
          Revenue
        </div>
        {FISCAL_PERIODS.map((period) => (
          <MetricCell
            key={period}
            value={scenario.results.annual.periods[period].totalRevenue}
            baseline={baselineResults.annual.periods[period].totalRevenue}
          />
        ))}

        <div className="ds-caption" style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
          EBITDA
        </div>
        {FISCAL_PERIODS.map((period) => (
          <MetricCell
            key={period}
            value={scenario.results.annual.periods[period].ebitda}
            baseline={baselineResults.annual.periods[period].ebitda}
          />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button
          type="button"
          className="ds-chip"
          style={{ cursor: 'pointer' }}
          onClick={() => setDrawerOpen(true)}
        >
          {scenario.overrideCount} {scenario.overrideCount === 1 ? 'Override' : 'Overrides'} Active
        </button>
        <button
          type="button"
          className="ds-btn ds-btn--outline ds-btn--sm"
          disabled={!scenario.isModified}
          onClick={() => {
            if (window.confirm('Return every control to the imported baseline? This removes all active overrides.')) {
              scenario.resetAll();
            }
          }}
        >
          Return to Defaults
        </button>
        <button type="button" className="ds-btn ds-btn--primary ds-btn--sm" onClick={() => setSaveOpen(true)}>
          Save Scenario
        </button>
      </div>

      {drawerOpen && <OverrideDrawer onClose={() => setDrawerOpen(false)} />}
      {saveOpen && <SaveScenarioModal onClose={() => setSaveOpen(false)} />}
    </header>
  );
}

function MetricCell({ value, baseline }: { value: number; baseline: number }) {
  const delta = value - baseline;
  const changed = Math.abs(delta) > 0.5;
  const pctChange = baseline !== 0 ? (delta / baseline) * 100 : 0;

  return (
    <div className="ds-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-dark)', textAlign: 'right', whiteSpace: 'nowrap' }}>
      {formatCurrency(value, { compact: true })}
      {changed && (
        <span
          style={{
            marginLeft: 4,
            fontWeight: 700,
            color: delta > 0 ? 'var(--color-functional-green)' : 'var(--color-functional-red)',
          }}
        >
          {delta > 0 ? '+' : ''}
          {pctChange.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
