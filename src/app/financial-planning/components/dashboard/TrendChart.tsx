
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FISCAL_PERIODS } from '../../engine/types';
import type { AnnualResults } from '../../engine/types';

export function TrendChart({
  title,
  current,
  baseline,
  metricKey,
  formatY,
}: {
  title: string;
  current: AnnualResults;
  baseline: AnnualResults;
  metricKey: keyof AnnualResults['periods']['FY26/27'];
  formatY: (v: number) => string;
}) {
  const data = FISCAL_PERIODS.map((period) => ({
    period,
    current: current.periods[period][metricKey] as number,
    baseline: baseline.periods[period][metricKey] as number,
  }));

  return (
    <div className="ds-card" style={{ padding: 16 }}>
      <div className="ds-label" style={{ marginBottom: 12 }}>
        {title}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" />
          <XAxis dataKey="period" tick={{ fontSize: 12, fill: 'var(--color-gray-600)' }} />
          <YAxis tickFormatter={formatY} tick={{ fontSize: 11, fill: 'var(--color-gray-600)' }} width={64} />
          <Tooltip formatter={(v) => formatY(Number(v))} />
          <Line
            type="monotone"
            dataKey="baseline"
            name="Baseline"
            stroke="var(--color-gray-400)"
            strokeDasharray="4 3"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="current"
            name="Current Scenario"
            stroke="var(--color-primary-orange)"
            dot={{ r: 3 }}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
