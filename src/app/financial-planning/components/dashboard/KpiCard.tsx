import { formatDelta } from '../../lib/format';

export function KpiCard({
  label,
  current,
  baseline,
  format,
}: {
  label: string;
  current: number;
  baseline: number;
  format: (v: number) => string;
}) {
  const delta = current - baseline;
  const changed = Math.abs(delta) > 0.005;
  return (
    <div className="ds-card" style={{ padding: 16 }}>
      <div className="ds-label" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-dark)' }}>{format(current)}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'baseline' }}>
        <span className="ds-caption">Baseline {format(baseline)}</span>
        {changed && (
          <span
            className="ds-caption"
            style={{
              color: delta > 0 ? 'var(--color-functional-green)' : 'var(--color-functional-red)',
              fontWeight: 700,
            }}
          >
            {formatDelta(delta, format)}
          </span>
        )}
      </div>
    </div>
  );
}
