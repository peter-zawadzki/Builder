
import { useState } from 'react';
import { useScenario } from '../lib/scenario-context';
import { baselineModel } from '../data/baseline';
import { baselineResults } from '../lib/baseline-results';
import { BaselineSlider } from '../components/controls/BaselineSlider';
import { formatCurrency, formatPercent } from '../lib/format';
import { FISCAL_PERIODS } from '../engine/types';
import type { FiscalPeriod, PeriodSeries } from '../engine/types';

const PAGE = 'Inventory & CapEx';

const YEAR_KEYS = ['carryForwardInventoryOffset', 'vehicleCapex', 'otherCapex'] as const;
type YearKey = (typeof YEAR_KEYS)[number];
const YEAR_META: Record<YearKey, string> = {
  carryForwardInventoryOffset: 'Carry Forward Inventory Offset',
  vehicleCapex: 'Vehicles CapEx',
  otherCapex: 'Other CapEx',
};

export default function InventoryCapexPage() {
  const scenario = useScenario();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const results = scenario.results.annual.periods;
  const baseline = baselineResults.annual.periods;

  const hardwareMarginPct =
    scenario.overrides.scalars?.hardwareMarginPct ?? baselineModel.assumptions.hardwareMarginPct;
  const safetyStockPct = scenario.overrides.scalars?.safetyStockPct ?? baselineModel.assumptions.safetyStockPct;

  const anyYearOverridden = YEAR_KEYS.some((key) => scenario.overrides.years?.[key]);

  function resetAll() {
    scenario.resetControl('hardwareMarginPct');
    scenario.resetControl('safetyStockPct');
    for (const key of YEAR_KEYS) scenario.resetControl(key);
  }

  return (
    <div>
      <h2 style={{ fontSize: 32, marginBottom: 8 }}>Inventory &amp; CapEx</h2>
      <p className="ds-body" style={{ marginBottom: 20, maxWidth: 720 }}>
        Carry-forward inventory offset, hardware margin, demand inventory purchases, safety stock %, vehicles, other
        CapEx and net asset spend.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <BaselineSlider
          label="Hardware Margin Assumption"
          min={0}
          max={Math.max(baselineModel.assumptions.hardwareMarginPct * 2, 0.1)}
          step={0.01}
          baseline={baselineModel.assumptions.hardwareMarginPct}
          value={hardwareMarginPct}
          onChange={(v) =>
            scenario.setScalarOverride(
              'hardwareMarginPct',
              'Hardware Margin Assumption',
              PAGE,
              v === baselineModel.assumptions.hardwareMarginPct ? undefined : v
            )
          }
          onReset={() => scenario.setScalarOverride('hardwareMarginPct', 'Hardware Margin Assumption', PAGE, undefined)}
          formatValue={(v) => formatPercent(v, 0)}
          colorMode="red-green-fade"
          showRangeCaption={false}
        />
        <BaselineSlider
          label="Safety Stock % of Demand"
          min={0}
          max={Math.max(baselineModel.assumptions.safetyStockPct * 2, 0.1)}
          step={0.01}
          baseline={baselineModel.assumptions.safetyStockPct}
          value={safetyStockPct}
          onChange={(v) =>
            scenario.setScalarOverride(
              'safetyStockPct',
              'Safety Stock % of Demand',
              PAGE,
              v === baselineModel.assumptions.safetyStockPct ? undefined : v
            )
          }
          onReset={() => scenario.setScalarOverride('safetyStockPct', 'Safety Stock % of Demand', PAGE, undefined)}
          formatValue={(v) => formatPercent(v, 0)}
          colorMode="red-green-fade"
          showRangeCaption={false}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={() => setAdvancedOpen((v) => !v)}>
          {advancedOpen ? 'Hide' : 'Show'} Advanced / By Year
        </button>
        <button
          type="button"
          className="ds-btn ds-btn--ghost ds-btn--sm"
          onClick={resetAll}
          disabled={
            !anyYearOverridden &&
            scenario.overrides.scalars?.hardwareMarginPct === undefined &&
            scenario.overrides.scalars?.safetyStockPct === undefined
          }
        >
          Reset Inventory &amp; CapEx
        </button>
      </div>

      {advancedOpen && (
        <div className="ds-card" style={{ padding: 16, marginBottom: 20 }}>
          {YEAR_KEYS.map((key) => {
            const defaults: PeriodSeries = baselineModel.assumptions[key];
            return (
              <div key={key} style={{ marginBottom: 16 }}>
                <div className="ds-label" style={{ marginBottom: 10 }}>
                  {YEAR_META[key]}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {FISCAL_PERIODS.map((period) => {
                    const defaultValue = defaults[period];
                    const value = scenario.overrides.years?.[key]?.[period] ?? defaultValue;
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
                            scenario.setYearOverride(key, YEAR_META[key], PAGE, period, isDefault ? undefined : n);
                          }}
                        />
                        <div className="ds-caption" style={{ marginTop: 4 }}>
                          Default {formatCurrency(defaultValue)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
            <Row
              label="Carry Forward Inventory Offset"
              current={FISCAL_PERIODS.map((p) => results[p].carryForwardInventoryOffset)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].carryForwardInventoryOffset)}
              format={formatCurrency}
            />
            <Row
              label="Inventory Purchases (Demand)"
              current={FISCAL_PERIODS.map((p) => results[p].inventoryDemand)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].inventoryDemand)}
              format={formatCurrency}
            />
            <Row
              label="Inventory Purchases (Safety Stock)"
              current={FISCAL_PERIODS.map((p) => results[p].safetyStock)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].safetyStock)}
              format={formatCurrency}
            />
            <Row
              label="Vehicles CapEx"
              current={FISCAL_PERIODS.map((p) => results[p].vehicleCapex)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].vehicleCapex)}
              format={formatCurrency}
            />
            <Row
              label="Other CapEx"
              current={FISCAL_PERIODS.map((p) => results[p].otherCapex)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].otherCapex)}
              format={formatCurrency}
            />
            <Row
              label="Net Asset Spend"
              current={FISCAL_PERIODS.map((p) => results[p].netAssetSpend)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].netAssetSpend)}
              format={formatCurrency}
            />
            <Row
              label="Hardware Investment per New Area"
              current={FISCAL_PERIODS.map((p) => results[p].hardwareInvestmentPerArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].hardwareInvestmentPerArea)}
              format={formatCurrency}
            />
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
  label: string;
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
