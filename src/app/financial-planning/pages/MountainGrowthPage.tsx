
import { useState } from 'react';
import { useScenario } from '../lib/scenario-context';
import { baselineModel } from '../data/baseline';
import { baselineResults } from '../lib/baseline-results';
import { BaselineSlider } from '../components/controls/BaselineSlider';
import { PresetBlendSlider, type PresetAnchor } from '../components/controls/PresetBlendSlider';
import { formatCount, formatPercent, formatCurrency } from '../lib/format';
import { FISCAL_PERIODS } from '../engine/types';
import type { FiscalPeriod, GrowthPreset } from '../engine/types';
import { resolveNewSkiAreas } from '../engine/presets';

const PAGE = 'Mountain Growth';
const GROWTH_PRESETS: GrowthPreset[] = ['Conservative Growth', 'Balanced Growth', 'Accelerated Growth'];
const GROWTH_ANCHORS: PresetAnchor[] = [
  { key: 'Conservative Growth', label: 'Conservative', value: 0 },
  { key: 'Balanced Growth', label: 'Balanced', value: 1 },
  { key: 'Accelerated Growth', label: 'Accelerated', value: 2 },
];
const SKI_AREAS_START_FY1 = 8;
const LATER_PERIODS: FiscalPeriod[] = ['FY27/28', 'FY28/29', 'FY29/30'];

const OPEX_KEYS = ['staff', 'contractLabor', 'marketing', 'ga'] as const;
const OPEX_META: Record<(typeof OPEX_KEYS)[number], { label: string; page: string }> = {
  staff: { label: 'Staff', page: 'Staffing' },
  contractLabor: { label: 'Contract Labor', page: 'Contractors' },
  marketing: { label: 'Marketing', page: 'Operating Expenses' },
  ga: { label: 'G&A', page: 'G&A' },
};

// Blends linearly between the three real preset curves: g=0 is Conservative, g=1 is
// Balanced, g=2 is Accelerated. Each fiscal year's value is interpolated independently
// (not compounded), so it can never run away exponentially, and it reproduces a real
// preset's exact numbers at g=0/1/2. Beyond that range it extrapolates using the same
// slope as the nearest real segment.
function blend(g: number, conservative: number, balanced: number, accelerated: number): number {
  return g <= 1 ? conservative + g * (balanced - conservative) : balanced + (g - 1) * (accelerated - balanced);
}

function levelOfPreset(preset: GrowthPreset): number {
  return preset === 'Conservative Growth' ? 0 : preset === 'Accelerated Growth' ? 2 : 1;
}

function presetForLevel(g: number): GrowthPreset | null {
  if (Math.abs(g) < 0.005) return 'Conservative Growth';
  if (Math.abs(g - 1) < 0.005) return 'Balanced Growth';
  if (Math.abs(g - 2) < 0.005) return 'Accelerated Growth';
  return null;
}

function formatGrowthLevelDelta(delta: number): string {
  const points = Math.round(delta * 100);
  return `${points > 0 ? '+' : ''}${points} pts`;
}

function formatGrowthLevel(g: number): string {
  if (Math.abs(g) < 0.005) return 'Conservative';
  if (Math.abs(g - 1) < 0.005) return 'Balanced';
  if (Math.abs(g - 2) < 0.005) return 'Accelerated';
  if (g < 0) return `${Math.round(-g * 100)}% below Conservative`;
  if (g < 1) return `${Math.round(g * 100)}% Conservative→Balanced`;
  if (g < 2) return `${Math.round((g - 1) * 100)}% Balanced→Accelerated`;
  return `${Math.round((g - 2) * 100)}% above Accelerated`;
}

export default function MountainGrowthPage() {
  const scenario = useScenario();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Which periods were pinned by an explicit Advanced-by-year edit (as opposed to the
  // growth-level slider's own writes). Tracked separately from "does an override exist"
  // — the slider itself writes an override for every period it touches, and treating
  // that as "manually pinned" would make it freeze after one adjustment (every
  // subsequent drag would see its own prior write and skip recomputing it).
  const [pinnedPeriods, setPinnedPeriods] = useState<Set<FiscalPeriod>>(new Set());
  // The precise growth level the user has dialed in (0=Conservative, 1=Balanced,
  // 2=Accelerated, continuous in between and a bit beyond). null = follow whichever
  // preset button is active.
  const [customLevel, setCustomLevel] = useState<number | null>(null);

  const growthPreset = scenario.overrides.growthPreset ?? baselineModel.assumptions.growthPreset;
  const baselineNewSkiAreas = resolveNewSkiAreas(baselineModel, growthPreset);
  const activePresetLevel = levelOfPreset(growthPreset);
  const currentGrowthLevel = customLevel ?? activePresetLevel;

  const results = scenario.results.annual.periods;
  const baseline = baselineResults.annual.periods;

  const newSkiAreasByPreset = {
    'Conservative Growth': resolveNewSkiAreas(baselineModel, 'Conservative Growth'),
    'Balanced Growth': resolveNewSkiAreas(baselineModel, 'Balanced Growth'),
    'Accelerated Growth': resolveNewSkiAreas(baselineModel, 'Accelerated Growth'),
  };

  function clearCustomLevel() {
    scenario.resetControl('newSkiAreas');
    for (const key of OPEX_KEYS) scenario.resetControl(key);
    setPinnedPeriods(new Set());
    setCustomLevel(null);
  }

  function selectPreset(preset: GrowthPreset) {
    scenario.setGrowthPreset(preset);
    clearCustomLevel();
  }

  function applyGrowthLevel(g: number) {
    // Landing exactly on a preset's own level (via the slider's magnetic snap, or a
    // Reset) means "use that preset for real" — its actual curve and actual OPEX
    // tables, not an interpolation that merely matches at this one point. This is what
    // keeps "drag to the Accelerated mark" and "click the Accelerated Growth button"
    // in agreement.
    const matchedPreset = presetForLevel(g);
    if (matchedPreset) {
      if (matchedPreset !== growthPreset) selectPreset(matchedPreset);
      else clearCustomLevel();
      return;
    }

    setCustomLevel(g);

    let start = SKI_AREAS_START_FY1;
    for (const period of FISCAL_PERIODS) {
      if (pinnedPeriods.has(period)) {
        start += scenario.overrides.years?.newSkiAreas?.[period] ?? baselineNewSkiAreas[period];
        continue;
      }
      const newAreas = Math.round(
        blend(
          g,
          newSkiAreasByPreset['Conservative Growth'][period],
          newSkiAreasByPreset['Balanced Growth'][period],
          newSkiAreasByPreset['Accelerated Growth'][period]
        )
      );
      scenario.setYearOverride('newSkiAreas', 'New Ski Areas Onboarding', PAGE, period, newAreas);
      start += newAreas;
    }

    // Every other preset-linked cost (staff, contractors, marketing, G&A for FY27/28
    // onward) blends the same way, using the same g — so "Growth Level" is a single
    // dial for the whole scenario, not just ski-area count.
    for (const key of OPEX_KEYS) {
      const meta = OPEX_META[key];
      for (const period of LATER_PERIODS) {
        const c = baselineModel.growthPresets['Conservative Growth'][key][period] ?? 0;
        const b = baselineModel.growthPresets['Balanced Growth'][key][period] ?? 0;
        const a = baselineModel.growthPresets['Accelerated Growth'][key][period] ?? 0;
        const value = Math.round(blend(g, c, b, a));
        scenario.setYearOverride(key, meta.label, meta.page, period, value);
      }
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 32, marginBottom: 8 }}>Mountain Growth</h2>
      <p className="ds-body" style={{ marginBottom: 20, maxWidth: 720 }}>
        Opening ski areas, new ski area onboarding, and the current-year revenue-generating fraction.
      </p>

      <div className="ds-card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="ds-label" style={{ marginBottom: 10 }}>
          Growth Preset
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {GROWTH_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={preset === growthPreset ? 'ds-btn ds-btn--primary ds-btn--sm' : 'ds-btn ds-btn--outline ds-btn--sm'}
              onClick={() => selectPreset(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <PresetBlendSlider
          label="Growth Level"
          value={currentGrowthLevel}
          anchors={GROWTH_ANCHORS}
          activeAnchorKey={growthPreset}
          onChange={applyGrowthLevel}
          onReset={() => applyGrowthLevel(activePresetLevel)}
          formatValue={formatGrowthLevel}
          formatVariance={formatGrowthLevelDelta}
          showRangeCaption={false}
        />
        <BaselineSlider
          label="Current-Year New-Area Revenue Fraction"
          min={0}
          max={1}
          step={0.05}
          baseline={baselineModel.assumptions.newAreaRevenueFraction}
          value={scenario.overrides.scalars?.newAreaRevenueFraction ?? baselineModel.assumptions.newAreaRevenueFraction}
          onChange={(v) =>
            scenario.setScalarOverride(
              'newAreaRevenueFraction',
              'Current-Year New-Area Revenue Fraction',
              PAGE,
              v === baselineModel.assumptions.newAreaRevenueFraction ? undefined : v
            )
          }
          onReset={() => scenario.setScalarOverride('newAreaRevenueFraction', 'Current-Year New-Area Revenue Fraction', PAGE, undefined)}
          formatValue={(v) => formatPercent(v, 0)}
          colorMode="red-green-fade"
          showRangeCaption={false}
        />
      </div>

      <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={() => setAdvancedOpen((v) => !v)} style={{ marginBottom: 12 }}>
        {advancedOpen ? 'Hide' : 'Show'} Advanced / By Year
      </button>

      {advancedOpen && (
        <div className="ds-card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {FISCAL_PERIODS.map((period) => {
              const value = scenario.overrides.years?.newSkiAreas?.[period] ?? baselineNewSkiAreas[period];
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
                      const isDefault = n === baselineNewSkiAreas[period];
                      scenario.setYearOverride(
                        'newSkiAreas',
                        'New Ski Areas Onboarding',
                        PAGE,
                        period,
                        isDefault ? undefined : n
                      );
                      setPinnedPeriods((prev) => {
                        const next = new Set(prev);
                        if (isDefault) next.delete(period);
                        else next.add(period);
                        return next;
                      });
                    }}
                  />
                  <div className="ds-caption" style={{ marginTop: 4 }}>
                    Default {formatCount(baselineNewSkiAreas[period])}
                  </div>
                </div>
              );
            })}
          </div>
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
            <Row label="Ski Areas at Start" current={FISCAL_PERIODS.map((p) => results[p].skiAreasStart)} baseline={FISCAL_PERIODS.map((p) => baseline[p].skiAreasStart)} format={formatCount} />
            <Row label="New Ski Areas Onboarding" current={FISCAL_PERIODS.map((p) => results[p].newSkiAreas)} baseline={FISCAL_PERIODS.map((p) => baseline[p].newSkiAreas)} format={formatCount} />
            <Row label="Total Ski Areas at Year End" current={FISCAL_PERIODS.map((p) => results[p].skiAreasEnd)} baseline={FISCAL_PERIODS.map((p) => baseline[p].skiAreasEnd)} format={formatCount} />
            <Row
              label="Revenue Generating Ski Areas"
              current={FISCAL_PERIODS.map((p) => results[p].revenueGeneratingAreas)}
              baseline={FISCAL_PERIODS.map((p) => baseline[p].revenueGeneratingAreas)}
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
