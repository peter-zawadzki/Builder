
import { useScenario } from '../lib/scenario-context';
import { baselineModel } from '../data/baseline';
import { baselineResults } from '../lib/baseline-results';
import { KpiCard } from '../components/dashboard/KpiCard';
import { TrendChart } from '../components/dashboard/TrendChart';
import { BaselineSlider } from '../components/controls/BaselineSlider';
import { formatCurrency, formatPercent } from '../lib/format';
import { FISCAL_PERIODS } from '../engine/types';

const PAGE = 'Profitability';
const KPI_PERIOD = 'FY26/27';

export default function ProfitabilityPage() {
  const scenario = useScenario();
  const results = scenario.results.annual.periods;
  const baseline = baselineResults.annual.periods;

  const fy1 = results[KPI_PERIOD];
  const fy1Baseline = baseline[KPI_PERIOD];

  return (
    <div>
      <h2 style={{ fontSize: 32, marginBottom: 8 }}>Profitability</h2>
      <p className="ds-body" style={{ marginBottom: 20, maxWidth: 720 }}>
        Gross profit and margin, EBITDA, depreciation, interest, EBT, tax, and net income — annual trends and
        totals.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard label={`Gross Profit (${KPI_PERIOD})`} current={fy1.grossProfit} baseline={fy1Baseline.grossProfit} format={formatCurrency} />
        <KpiCard
          label={`Gross Margin (${KPI_PERIOD})`}
          current={fy1.grossMargin}
          baseline={fy1Baseline.grossMargin}
          format={(v) => formatPercent(v, 1)}
        />
        <KpiCard label={`EBITDA (${KPI_PERIOD})`} current={fy1.ebitda} baseline={fy1Baseline.ebitda} format={formatCurrency} />
        <KpiCard label={`EBT (${KPI_PERIOD})`} current={fy1.ebt} baseline={fy1Baseline.ebt} format={formatCurrency} />
        <KpiCard label={`Net Income (${KPI_PERIOD})`} current={fy1.netIncome} baseline={fy1Baseline.netIncome} format={formatCurrency} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, marginBottom: 24 }}>
        <TrendChart title="Gross Profit" current={scenario.results.annual} baseline={baselineResults.annual} metricKey="grossProfit" formatY={(v) => formatCurrency(v, { compact: true })} />
        <TrendChart title="EBITDA" current={scenario.results.annual} baseline={baselineResults.annual} metricKey="ebitda" formatY={(v) => formatCurrency(v, { compact: true })} />
        <TrendChart title="Net Income" current={scenario.results.annual} baseline={baselineResults.annual} metricKey="netIncome" formatY={(v) => formatCurrency(v, { compact: true })} />
        <TrendChart title="Depreciation" current={scenario.results.annual} baseline={baselineResults.annual} metricKey="depreciation" formatY={(v) => formatCurrency(v, { compact: true })} />
      </div>

      <div className="ds-label" style={{ marginBottom: 10 }}>
        Interest Expense / Income (by Fiscal Year)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        {FISCAL_PERIODS.map((period) => {
          const baselineValue = baselineModel.assumptions.interest[period];
          const value = scenario.overrides.years?.interest?.[period] ?? baselineValue;
          return (
            <BaselineSlider
              key={period}
              label={period}
              min={-500000}
              max={500000}
              step={5000}
              baseline={baselineValue}
              value={value}
              onChange={(v) =>
                scenario.setYearOverride('interest', 'Interest Expense / Income', PAGE, period, v === baselineValue ? undefined : v)
              }
              onReset={() => scenario.setYearOverride('interest', 'Interest Expense / Income', PAGE, period, undefined)}
              formatValue={formatCurrency}
              colorMode="favorable-left"
            />
          );
        })}
      </div>
      <p className="ds-caption" style={{ marginTop: -12, marginBottom: 24, maxWidth: 720 }}>
        Positive values are interest expense (reduces EBT); negative values are interest income (increases EBT).
        Baseline is $0 in every fiscal year.
      </p>

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
            <Row label="Gross Profit" current={FISCAL_PERIODS.map((p) => results[p].grossProfit)} baseline={FISCAL_PERIODS.map((p) => baseline[p].grossProfit)} format={formatCurrency} />
            <Row label="Gross Margin" current={FISCAL_PERIODS.map((p) => results[p].grossMargin)} baseline={FISCAL_PERIODS.map((p) => baseline[p].grossMargin)} format={(v) => formatPercent(v, 1)} />
            <Row label="EBITDA" current={FISCAL_PERIODS.map((p) => results[p].ebitda)} baseline={FISCAL_PERIODS.map((p) => baseline[p].ebitda)} format={formatCurrency} />
            <Row label="Depreciation" current={FISCAL_PERIODS.map((p) => results[p].depreciation)} baseline={FISCAL_PERIODS.map((p) => baseline[p].depreciation)} format={formatCurrency} />
            <Row label="Interest" current={FISCAL_PERIODS.map((p) => results[p].interest)} baseline={FISCAL_PERIODS.map((p) => baseline[p].interest)} format={formatCurrency} />
            <Row label="EBT" current={FISCAL_PERIODS.map((p) => results[p].ebt)} baseline={FISCAL_PERIODS.map((p) => baseline[p].ebt)} format={formatCurrency} />
            <Row label="Income Tax" current={FISCAL_PERIODS.map((p) => results[p].incomeTax)} baseline={FISCAL_PERIODS.map((p) => baseline[p].incomeTax)} format={formatCurrency} />
            <Row label="Net Income" current={FISCAL_PERIODS.map((p) => results[p].netIncome)} baseline={FISCAL_PERIODS.map((p) => baseline[p].netIncome)} format={formatCurrency} />
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
        const changed = Math.abs(v - baseline[i]) > 0.005;
        return (
          <td key={i} style={{ padding: '10px 16px', textAlign: 'right' }}>
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
