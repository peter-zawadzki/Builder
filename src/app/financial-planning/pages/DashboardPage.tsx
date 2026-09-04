
import { useScenario } from '../lib/scenario-context';
import { baselineResults } from '../lib/baseline-results';
import { KpiCard } from '../components/dashboard/KpiCard';
import { TrendChart } from '../components/dashboard/TrendChart';
import { formatCurrency, formatCount } from '../lib/format';

export default function DashboardPage() {
  const scenario = useScenario();
  const { results, overrideCount, isModified, scenarioName } = scenario;

  const fy1 = results.annual.periods['FY26/27'];
  const fy1Baseline = baselineResults.annual.periods['FY26/27'];
  const fy4 = results.annual.periods['FY29/30'];
  const fy4Baseline = baselineResults.annual.periods['FY29/30'];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 32 }}>{scenarioName}</h2>
        {isModified && (
          <p className="ds-body">
            {overrideCount} active override{overrideCount === 1 ? '' : 's'} vs. the imported baseline.
          </p>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <KpiCard label="Total Revenue (FY26/27)" current={fy1.totalRevenue} baseline={fy1Baseline.totalRevenue} format={formatCurrency} />
        <KpiCard
          label="Subscription Revenue (FY26/27)"
          current={fy1.subscriptionRevenue}
          baseline={fy1Baseline.subscriptionRevenue}
          format={formatCurrency}
        />
        <KpiCard label="EBITDA (FY26/27)" current={fy1.ebitda} baseline={fy1Baseline.ebitda} format={formatCurrency} />
        <KpiCard label="Ending Cash (FY26/27)" current={fy1.endingCash} baseline={fy1Baseline.endingCash} format={formatCurrency} />
        <KpiCard
          label="Revenue Generating Ski Areas (FY26/27)"
          current={fy1.revenueGeneratingAreas}
          baseline={fy1Baseline.revenueGeneratingAreas}
          format={formatCount}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard label="Total Revenue (FY29/30)" current={fy4.totalRevenue} baseline={fy4Baseline.totalRevenue} format={formatCurrency} />
        <KpiCard
          label="Subscription Revenue (FY29/30)"
          current={fy4.subscriptionRevenue}
          baseline={fy4Baseline.subscriptionRevenue}
          format={formatCurrency}
        />
        <KpiCard label="EBITDA (FY29/30)" current={fy4.ebitda} baseline={fy4Baseline.ebitda} format={formatCurrency} />
        <KpiCard label="Ending Cash (FY29/30)" current={fy4.endingCash} baseline={fy4Baseline.endingCash} format={formatCurrency} />
        <KpiCard
          label="Revenue Generating Ski Areas (FY29/30)"
          current={fy4.revenueGeneratingAreas}
          baseline={fy4Baseline.revenueGeneratingAreas}
          format={formatCount}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
        <TrendChart title="Total Revenue" current={results.annual} baseline={baselineResults.annual} metricKey="totalRevenue" formatY={(v) => formatCurrency(v, { compact: true })} />
        <TrendChart title="EBITDA" current={results.annual} baseline={baselineResults.annual} metricKey="ebitda" formatY={(v) => formatCurrency(v, { compact: true })} />
        <TrendChart title="Ending Cash" current={results.annual} baseline={baselineResults.annual} metricKey="endingCash" formatY={(v) => formatCurrency(v, { compact: true })} />
        <TrendChart title="Net Income" current={results.annual} baseline={baselineResults.annual} metricKey="netIncome" formatY={(v) => formatCurrency(v, { compact: true })} />
      </div>
    </div>
  );
}
