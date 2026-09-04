
import { useState } from 'react';
import { useScenario } from '../lib/scenario-context';
import { baselineModel } from '../data/baseline';
import { baselineResults } from '../lib/baseline-results';
import { BaselineSlider } from '../components/controls/BaselineSlider';
import { formatCurrency } from '../lib/format';
import { FISCAL_PERIODS } from '../engine/types';
import type { FiscalPeriod } from '../engine/types';

const PAGE = 'Pricing & Revenue';

const YEAR_FIELDS = [
  {
    key: 'installationRevenuePerArea',
    label: 'Installation Revenue per Area',
    min: 0,
    max: null,
    step: 500,
    anchorPeriod: 'FY26/27' as FiscalPeriod,
  },
  { key: 'athleteArpu', label: 'Athlete ARPU', min: 0, max: null, step: 5, anchorPeriod: 'FY26/27' as FiscalPeriod },
  // Social ARPU (and the whole social-subscription line) is genuinely $0 in FY26/27 —
  // there's no social product to price yet — so the slider anchors on FY27/28 instead,
  // the first year with a real rate, and never touches FY26/27.
  { key: 'socialArpu', label: 'Social ARPU', min: 0, max: null, step: 2, anchorPeriod: 'FY27/28' as FiscalPeriod },
] as const;

type FieldKey = (typeof YEAR_FIELDS)[number]['key'];

export default function PricingRevenuePage() {
  const scenario = useScenario();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Periods pinned by an explicit Advanced-by-year edit, per field — tracked separately
  // from the sliders' own uniform shift so a slider never clobbers a year the user
  // deliberately set by hand (same pattern as Mountain Growth / Adoption & Customers).
  const [pinnedPeriods, setPinnedPeriods] = useState<Record<FieldKey, Set<FiscalPeriod>>>({
    installationRevenuePerArea: new Set(),
    athleteArpu: new Set(),
    socialArpu: new Set(),
  });

  const results = scenario.results.annual.periods;
  const baseline = baselineResults.annual.periods;

  // Shifts every fiscal year from the field's anchor period onward by the same amount
  // the user moves the anchor, preserving the baseline curve's own shape. Years before
  // the anchor (e.g. FY26/27 for Social ARPU, which is genuinely $0 pre-launch) are
  // never touched by the slider.
  function applyUniformShift(key: FieldKey, anchorValue: number) {
    const field = YEAR_FIELDS.find((f) => f.key === key)!;
    const baselineSeries = baselineModel.assumptions[key];
    const anchorIndex = FISCAL_PERIODS.indexOf(field.anchorPeriod);
    const delta = anchorValue - baselineSeries[field.anchorPeriod];
    FISCAL_PERIODS.forEach((period, i) => {
      if (i < anchorIndex) return;
      if (pinnedPeriods[key].has(period)) return;
      const baselineValue = baselineSeries[period];
      const newValue = Math.max(0, baselineValue + delta);
      const isDefault = Math.abs(newValue - baselineValue) < 1e-9;
      scenario.setYearOverride(key, field.label, PAGE, period, isDefault ? undefined : newValue);
    });
  }

  function resetField(key: FieldKey) {
    scenario.resetControl(key);
    setPinnedPeriods((prev) => ({ ...prev, [key]: new Set() }));
  }

  return (
    <div>
      <h2 style={{ fontSize: 32, marginBottom: 8 }}>Pricing &amp; Revenue</h2>
      <p className="ds-body" style={{ marginBottom: 20, maxWidth: 720 }}>
        Installation revenue per area, athlete ARPU, and social ARPU drive installation, subscription, and total
        revenue outputs shown read-only below.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {YEAR_FIELDS.map((field) => {
          const baselineAtAnchor = baselineModel.assumptions[field.key][field.anchorPeriod];
          const value = scenario.overrides.years?.[field.key]?.[field.anchorPeriod] ?? baselineAtAnchor;
          // A fixed min/max won't generally center the baseline on the track (e.g. $50
          // isn't the midpoint of 0-300). When max is left unset, center it exactly by
          // spanning 0 to 2x the baseline instead, same idea as Mountain Growth's ranges.
          const max = field.max ?? Math.max(baselineAtAnchor * 2, field.step * 10);
          return (
            <BaselineSlider
              key={field.key}
              label={field.label}
              min={field.min}
              max={max}
              step={field.step}
              baseline={baselineAtAnchor}
              value={value}
              onChange={(v) => applyUniformShift(field.key, v)}
              onReset={() => resetField(field.key)}
              formatValue={(v) => formatCurrency(v)}
              colorMode="red-green-fade"
              showRangeCaption={false}
            />
          );
        })}
      </div>

      <button
        type="button"
        className="ds-btn ds-btn--ghost ds-btn--sm"
        onClick={() => setAdvancedOpen((v) => !v)}
        style={{ marginBottom: 12 }}
      >
        {advancedOpen ? 'Hide' : 'Show'} Advanced / By Year
      </button>

      {advancedOpen && (
        <div className="ds-card" style={{ padding: 16, marginBottom: 20 }}>
          {YEAR_FIELDS.map((field) => {
            const baselineSeries = baselineModel.assumptions[field.key];
            return (
              <div key={field.key} style={{ marginBottom: 16 }}>
                <div className="ds-label" style={{ marginBottom: 6 }}>
                  {field.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {FISCAL_PERIODS.map((period) => {
                    const baselineValue = baselineSeries[period];
                    const overrideValue = scenario.overrides.years?.[field.key]?.[period];
                    const value = overrideValue ?? baselineValue;
                    return (
                      <div key={period}>
                        <div className="ds-caption" style={{ marginBottom: 4 }}>
                          {period}
                        </div>
                        <input
                          type="number"
                          className="ds-input"
                          step={field.step}
                          value={value}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            const isDefault = Math.abs(n - baselineValue) < 1e-9;
                            scenario.setYearOverride(field.key, field.label, PAGE, period, isDefault ? undefined : n);
                            setPinnedPeriods((prev) => {
                              const next = new Set(prev[field.key]);
                              if (isDefault) next.delete(period);
                              else next.add(period);
                              return { ...prev, [field.key]: next };
                            });
                          }}
                        />
                        <div className="ds-caption" style={{ marginTop: 4 }}>
                          Default {formatCurrency(baselineValue)}
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
              label="Installation Revenue per Area"
              current={FISCAL_PERIODS.map((p) => results[p].installationRevenuePerArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].installationRevenuePerArea)}
              format={(v) => formatCurrency(v)}
            />
            <Row
              label="Annual Installation Revenue"
              current={FISCAL_PERIODS.map((p) => results[p].installationRevenue)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].installationRevenue)}
              format={(v) => formatCurrency(v)}
            />
            <Row
              label="Athlete ARPU"
              current={FISCAL_PERIODS.map((p) => results[p].athleteArpu)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].athleteArpu)}
              format={(v) => formatCurrency(v)}
            />
            <Row
              label="Athlete Subscription Revenue"
              current={FISCAL_PERIODS.map((p) => results[p].athleteSubscriptionRevenue)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].athleteSubscriptionRevenue)}
              format={(v) => formatCurrency(v)}
            />
            <Row
              label="Social ARPU"
              current={FISCAL_PERIODS.map((p) => results[p].socialArpu)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].socialArpu)}
              format={(v) => formatCurrency(v)}
            />
            <Row
              label="Social Subscription Revenue"
              current={FISCAL_PERIODS.map((p) => results[p].socialSubscriptionRevenue)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].socialSubscriptionRevenue)}
              format={(v) => formatCurrency(v)}
            />
            <Row
              label="All Subscription Revenue"
              current={FISCAL_PERIODS.map((p) => results[p].subscriptionRevenue)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].subscriptionRevenue)}
              format={(v) => formatCurrency(v)}
            />
            <Row
              label="Total Revenue"
              current={FISCAL_PERIODS.map((p) => results[p].totalRevenue)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].totalRevenue)}
              format={(v) => formatCurrency(v)}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cellStyle(align: 'left' | 'right'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 16px',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    color: 'var(--color-gray-600)',
  };
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
