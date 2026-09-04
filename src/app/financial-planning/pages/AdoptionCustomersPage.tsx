
import { useState } from 'react';
import { useScenario } from '../lib/scenario-context';
import { baselineModel } from '../data/baseline';
import { baselineResults } from '../lib/baseline-results';
import { BaselineSlider } from '../components/controls/BaselineSlider';
import { PresetBlendSlider, type PresetAnchor } from '../components/controls/PresetBlendSlider';
import { formatCount, formatCurrency, formatPercent } from '../lib/format';
import { FISCAL_PERIODS } from '../engine/types';
import type { AdoptionPreset, FiscalPeriod } from '../engine/types';
import { resolveSocialAdoption } from '../engine/presets';

const PAGE = 'Adoption & Customers';

// Ascending by adoption intensity (matches the Growth x Adoption matrix's own ordering
// of outcomes at a fixed growth preset — Slow has the lowest FY29/30 social adoption
// rate, Wildfire the highest).
const ADOPTION_ORDER: AdoptionPreset[] = ['Slow', 'Modest', 'Rapid', 'Wildfire'];
const SOCIAL_ANCHORS: PresetAnchor[] = ADOPTION_ORDER.map((preset, i) => ({ key: preset, label: preset, value: i }));

const YEAR_FIELDS = [
  { key: 'athletesPerArea', label: 'Athletes per Area', format: (v: number) => formatCount(v) },
  { key: 'skierVisitsPerArea', label: 'Skier Visits per Area', format: (v: number) => formatCount(v) },
] as const;

function blendAcrossAnchors(t: number, values: number[]): number {
  const n = values.length;
  let i = Math.floor(t);
  if (i < 0) i = 0;
  if (i > n - 2) i = n - 2;
  const frac = t - i;
  return values[i] + frac * (values[i + 1] - values[i]);
}

function presetForSocialLevel(s: number): AdoptionPreset | null {
  for (let i = 0; i < ADOPTION_ORDER.length; i++) {
    if (Math.abs(s - i) < 0.005) return ADOPTION_ORDER[i];
  }
  return null;
}

function formatSocialLevelDelta(delta: number): string {
  const points = Math.round(delta * 100);
  return `${points > 0 ? '+' : ''}${points} pts`;
}

function formatSocialLevel(s: number): string {
  const exact = presetForSocialLevel(s);
  if (exact) return exact;
  if (s < 0) return `${Math.round(-s * 100)}% below Slow`;
  if (s < 1) return `${Math.round(s * 100)}% Slow→Modest`;
  if (s < 2) return `${Math.round((s - 1) * 100)}% Modest→Rapid`;
  if (s < 3) return `${Math.round((s - 2) * 100)}% Rapid→Wildfire`;
  return `${Math.round((s - 3) * 100)}% above Wildfire`;
}

export default function AdoptionCustomersPage() {
  const scenario = useScenario();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // The precise social-adoption level the user has dialed in (0=Slow, 1=Modest,
  // 2=Rapid, 3=Wildfire, continuous in between and a bit beyond). null = follow
  // whichever Adoption Preset button is active.
  const [customSocialLevel, setCustomSocialLevel] = useState<number | null>(null);
  // Periods pinned by an explicit Advanced-by-year edit to Athlete Adoption Rate, as
  // opposed to the slider's own uniform shift — tracked separately so the slider never
  // clobbers a year the user deliberately set by hand (same pattern as Mountain Growth).
  const [athletePinnedPeriods, setAthletePinnedPeriods] = useState<Set<FiscalPeriod>>(new Set());

  const adoptionPreset = scenario.overrides.adoptionPreset ?? baselineModel.assumptions.adoptionPreset;
  const growthPreset = scenario.overrides.growthPreset ?? baselineModel.assumptions.growthPreset;

  const results = scenario.results.annual.periods;
  const baseline = baselineResults.annual.periods;

  const activeSocialLevel = ADOPTION_ORDER.indexOf(adoptionPreset);
  const currentSocialLevel = customSocialLevel ?? activeSocialLevel;

  const athleteAdoptionFy1Baseline = baselineModel.assumptions.athleteAdoptionRate['FY26/27'];
  const athleteAdoptionFy1Value = scenario.overrides.years?.athleteAdoptionRate?.['FY26/27'] ?? athleteAdoptionFy1Baseline;

  // Shifts every fiscal year's athlete adoption rate by the same amount the user moves
  // FY26/27, preserving the baseline curve's own shape (55/55/60/65%) rather than
  // flattening it — so the slider reads as "the whole trajectory," not one isolated year.
  function applyAthleteAdoptionRate(fy1Value: number) {
    const delta = fy1Value - athleteAdoptionFy1Baseline;
    for (const period of FISCAL_PERIODS) {
      if (athletePinnedPeriods.has(period)) continue;
      const baselineValue = baselineModel.assumptions.athleteAdoptionRate[period];
      const newValue = Math.min(1, Math.max(0, baselineValue + delta));
      const isDefault = Math.abs(newValue - baselineValue) < 1e-9;
      scenario.setYearOverride('athleteAdoptionRate', 'Athlete Adoption Rate', PAGE, period, isDefault ? undefined : newValue);
    }
  }

  function resetAthleteAdoptionRate() {
    scenario.resetControl('athleteAdoptionRate');
    setAthletePinnedPeriods(new Set());
  }

  function selectAdoptionPreset(preset: AdoptionPreset) {
    scenario.setAdoptionPreset(preset);
    scenario.resetControl('socialAdoptionRate');
    setCustomSocialLevel(null);
  }

  function applySocialLevel(s: number) {
    // Landing exactly on an adoption preset's own level (via magnetic snap, or Reset)
    // means "use that preset for real" — its actual matrix row, not an interpolation
    // that merely matches at this one point. Keeps "drag to Wildfire" and "click
    // Wildfire" in agreement, same as the Mountain Growth Growth Level control.
    const matched = presetForSocialLevel(s);
    if (matched) {
      if (matched !== adoptionPreset) selectAdoptionPreset(matched);
      else {
        scenario.resetControl('socialAdoptionRate');
        setCustomSocialLevel(null);
      }
      return;
    }

    setCustomSocialLevel(s);
    const curves = ADOPTION_ORDER.map((preset) => resolveSocialAdoption(baselineModel, growthPreset, preset));
    for (const period of FISCAL_PERIODS) {
      const values = curves.map((c) => c[period]);
      const rate = blendAcrossAnchors(s, values);
      scenario.setYearOverride('socialAdoptionRate', 'Social Adoption Rate', PAGE, period, Math.round(rate * 100000) / 100000);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 32, marginBottom: 8 }}>Adoption &amp; Customers</h2>
      <p className="ds-body" style={{ marginBottom: 20, maxWidth: 720 }}>
        Athletes per area, athlete adoption, paying athletes, skier visits, unique skiers, and social adoption.
      </p>

      <div className="ds-card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="ds-label" style={{ marginBottom: 10 }}>
          Adoption Preset
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {ADOPTION_ORDER.map((preset) => (
            <button
              key={preset}
              type="button"
              className={preset === adoptionPreset ? 'ds-btn ds-btn--primary ds-btn--sm' : 'ds-btn ds-btn--outline ds-btn--sm'}
              onClick={() => selectAdoptionPreset(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <PresetBlendSlider
            label="Social Adoption Level"
            value={currentSocialLevel}
            anchors={SOCIAL_ANCHORS}
            activeAnchorKey={adoptionPreset}
            onChange={applySocialLevel}
            onReset={() => applySocialLevel(activeSocialLevel)}
            formatValue={formatSocialLevel}
            formatVariance={formatSocialLevelDelta}
            impacts={[
              { label: 'FY29/30 Social Adoption Rate', value: formatPercent(results['FY29/30'].socialAdoptionRate, 1) },
              { label: 'FY29/30 Social Subscription Revenue', value: formatCurrency(results['FY29/30'].socialSubscriptionRevenue) },
            ]}
          />
        </div>

        <div>
          <BaselineSlider
            label="Athlete Adoption Rate"
            min={0}
            max={1}
            step={0.01}
            baseline={athleteAdoptionFy1Baseline}
            value={athleteAdoptionFy1Value}
            onChange={applyAthleteAdoptionRate}
            onReset={resetAthleteAdoptionRate}
            formatValue={(v) => formatPercent(v, 0)}
            colorMode="red-green-fade"
            impacts={[
              { label: 'FY26/27 Paying Athletes per Area', value: formatCount(results['FY26/27'].payingAthletesPerArea) },
              { label: 'FY29/30 Paying Athletes per Area', value: formatCount(results['FY29/30'].payingAthletesPerArea) },
              { label: 'FY29/30 Athlete Subscription Revenue', value: formatCurrency(results['FY29/30'].athleteSubscriptionRevenue) },
            ]}
          />
        </div>
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
          <div style={{ marginBottom: 16 }}>
            <div className="ds-label" style={{ marginBottom: 6 }}>
              Athlete Adoption Rate
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {FISCAL_PERIODS.map((period) => {
                const baselineValue = baselineModel.assumptions.athleteAdoptionRate[period];
                const overrideValue = scenario.overrides.years?.athleteAdoptionRate?.[period];
                const value = overrideValue ?? baselineValue;
                return (
                  <div key={period}>
                    <div className="ds-caption" style={{ marginBottom: 4 }}>
                      {period}
                    </div>
                    <input
                      type="number"
                      className="ds-input"
                      step={0.01}
                      value={Number((value * 100).toFixed(2))}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        const n = raw / 100;
                        const isDefault = Math.abs(n - baselineValue) < 1e-9;
                        scenario.setYearOverride('athleteAdoptionRate', 'Athlete Adoption Rate', PAGE, period, isDefault ? undefined : n);
                        setAthletePinnedPeriods((prev) => {
                          const next = new Set(prev);
                          if (isDefault) next.delete(period);
                          else next.add(period);
                          return next;
                        });
                      }}
                    />
                    <div className="ds-caption" style={{ marginTop: 4 }}>
                      Default {formatPercent(baselineValue, 0)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

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
                          step={1}
                          value={value}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            const isDefault = Math.abs(n - baselineValue) < 1e-9;
                            scenario.setYearOverride(field.key, field.label, PAGE, period, isDefault ? undefined : n);
                          }}
                        />
                        <div className="ds-caption" style={{ marginTop: 4 }}>
                          Default {field.format(baselineValue)}
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
              label="Athletes per Area"
              current={FISCAL_PERIODS.map((p) => results[p].athletesPerArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].athletesPerArea)}
              format={formatCount}
            />
            <Row
              label="Athlete Adoption Rate"
              current={FISCAL_PERIODS.map((p) => results[p].athleteAdoptionRate)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].athleteAdoptionRate)}
              format={(v) => formatPercent(v, 0)}
            />
            <Row
              label="Paying Athletes per Area"
              current={FISCAL_PERIODS.map((p) => results[p].payingAthletesPerArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].payingAthletesPerArea)}
              format={formatCount}
            />
            <Row
              label="Skier Visits per Area"
              current={FISCAL_PERIODS.map((p) => results[p].skierVisitsPerArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].skierVisitsPerArea)}
              format={formatCount}
            />
            <Row
              label="Unique Skiers per Area"
              current={FISCAL_PERIODS.map((p) => results[p].uniqueSkiersPerArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].uniqueSkiersPerArea)}
              format={formatCount}
            />
            <Row
              label="Social Adoption Rate"
              current={FISCAL_PERIODS.map((p) => results[p].socialAdoptionRate)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].socialAdoptionRate)}
              format={(v) => formatPercent(v, 1)}
            />
            <Row
              label="Paying Social Skiers per Area"
              current={FISCAL_PERIODS.map((p) => results[p].payingSocialSkiersPerArea)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].payingSocialSkiersPerArea)}
              format={formatCount}
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
