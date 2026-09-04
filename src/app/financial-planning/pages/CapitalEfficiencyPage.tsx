
import { useScenario } from '../lib/scenario-context';
import { baselineResults } from '../lib/baseline-results';
import { KpiCard } from '../components/dashboard/KpiCard';
import { TrendChart } from '../components/dashboard/TrendChart';
import { formatCurrency } from '../lib/format';
import { FISCAL_PERIODS } from '../engine/types';

const KPI_PERIOD = 'FY29/30';

export default function CapitalEfficiencyPage() {
  const scenario = useScenario();
  const results = scenario.results.annual.periods;
  const baseline = baselineResults.annual.periods;

  const fy = results[KPI_PERIOD];
  const fyBaseline = baseline[KPI_PERIOD];

  return (
    <div>
      <h2 style={{ fontSize: 32, marginBottom: 8 }}>Capital Efficiency</h2>
      <p className="ds-body" style={{ marginBottom: 20, maxWidth: 720 }}>
        All figures on this page are derived from other assumptions (ski-area growth, OPEX, revenue, hardware
        capex) rather than being direct inputs. To move these numbers, adjust the underlying drivers on the
        Mountain Growth, Pricing, Staffing, Operating Expenses, or Capex pages.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard
          label={`Hardware Investment per New Area (${KPI_PERIOD})`}
          current={fy.hardwareInvestmentPerArea}
          baseline={fyBaseline.hardwareInvestmentPerArea}
          format={formatCurrency}
        />
        <KpiCard label={`OPEX per Ski Area (${KPI_PERIOD})`} current={fy.opexPerSkiArea} baseline={fyBaseline.opexPerSkiArea} format={formatCurrency} />
        <KpiCard
          label={`Revenue per Revenue-Generating Area (${KPI_PERIOD})`}
          current={fy.revenuePerRgArea}
          baseline={fyBaseline.revenuePerRgArea}
          format={formatCurrency}
        />
        <KpiCard
          label={`EBITDA per Revenue-Generating Area (${KPI_PERIOD})`}
          current={fy.ebitdaPerRgArea}
          baseline={fyBaseline.ebitdaPerRgArea}
          format={formatCurrency}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, marginBottom: 24 }}>
        <TrendChart title="OPEX per Ski Area" current={scenario.results.annual} baseline={baselineResults.annual} metricKey="opexPerSkiArea" formatY={(v) => formatCurrency(v, { compact: true })} />
        <TrendChart title="Revenue per Revenue-Generating Area" current={scenario.results.annual} baseline={baselineResults.annual} metricKey="revenuePerRgArea" formatY={(v) => formatCurrency(v, { compact: true })} />
        <TrendChart title="Gross Profit per Revenue-Generating Area" current={scenario.results.annual} baseline={baselineResults.annual} metricKey="grossProfitPerRgArea" formatY={(v) => formatCurrency(v, { compact: true })} />
        <TrendChart title="EBITDA per Revenue-Generating Area" current={scenario.results.annual} baseline={baselineResults.annual} metricKey="ebitdaPerRgArea" formatY={(v) => formatCurrency(v, { compact: true })} />
      </div>

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
              label="Hardware Investment per New Area"
              current={FISCAL_PERIODS.map((p) => results[p].hardwareInvestmentPerArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].hardwareInvestmentPerArea)}
              format={formatCurrency}
            />
            <Row
              label="OPEX per Ski Area"
              current={FISCAL_PERIODS.map((p) => results[p].opexPerSkiArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].opexPerSkiArea)}
              format={formatCurrency}
            />
            <Row
              label="Fixed OPEX per Ski Area"
              current={FISCAL_PERIODS.map((p) => results[p].fixedOpexPerSkiArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].fixedOpexPerSkiArea)}
              format={formatCurrency}
            />
            <Row
              label="Total Revenue per Revenue-Generating Area"
              current={FISCAL_PERIODS.map((p) => results[p].revenuePerRgArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].revenuePerRgArea)}
              format={formatCurrency}
            />
            <Row
              label="Subscription Revenue per Ski Area"
              current={FISCAL_PERIODS.map((p) => results[p].subscriptionRevenuePerArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].subscriptionRevenuePerArea)}
              format={formatCurrency}
            />
            <Row
              label="Gross Profit per Revenue-Generating Area"
              current={FISCAL_PERIODS.map((p) => results[p].grossProfitPerRgArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].grossProfitPerRgArea)}
              format={formatCurrency}
            />
            <Row
              label="EBITDA per Revenue-Generating Area"
              current={FISCAL_PERIODS.map((p) => results[p].ebitdaPerRgArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].ebitdaPerRgArea)}
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
