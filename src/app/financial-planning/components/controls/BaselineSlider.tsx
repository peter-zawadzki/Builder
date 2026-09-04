
import { useId } from 'react';
import { formatDelta } from '../../lib/format';

export type SliderColorMode = 'favorable-right' | 'favorable-left' | 'aggressiveness' | 'red-green-fade';

export interface SliderImpact {
  label: string;
  value: string;
}

export interface SliderMarker {
  value: number;
  label: string;
  active?: boolean;
}

export interface BaselineSliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  baseline: number;
  value: number;
  onChange: (value: number) => void;
  onReset?: () => void;
  formatValue: (value: number) => string;
  colorMode?: SliderColorMode;
  impacts?: SliderImpact[];
  disabled?: boolean;
  markers?: SliderMarker[];
  /** Show the "{min} – {max}" range caption below the track. Default true. */
  showRangeCaption?: boolean;
}

function zoneColor(pct: number, colorMode: SliderColorMode): string {
  // pct is 0..1 position of the *current value* relative to min..max.
  if (colorMode === 'aggressiveness') {
    // Neutral framing: more growth/aggression isn't "good" or "bad" — use the
    // brand blue ramp rather than red/green per spec §7.
    return 'var(--color-regular-blue)';
  }
  const favorableRight = colorMode === 'favorable-right';
  const favorableness = favorableRight ? pct : 1 - pct;
  if (favorableness < 0.4) return 'var(--color-functional-red)';
  if (favorableness < 0.6) return 'var(--color-functional-amber)';
  return 'var(--color-functional-green)';
}

export function BaselineSlider({
  label,
  min,
  max,
  step = 1,
  baseline,
  value,
  onChange,
  onReset,
  formatValue,
  colorMode = 'aggressiveness',
  impacts,
  disabled,
  markers,
  showRangeCaption = true,
}: BaselineSliderProps) {
  const id = useId();
  const range = max - min || 1;
  const valuePct = (value - min) / range;
  const baselinePct = (baseline - min) / range;
  const isOverridden = value !== baseline;
  const variance = value - baseline;
  const isGradient = colorMode === 'red-green-fade';
  const thumbColor = isGradient ? undefined : zoneColor(valuePct, colorMode);

  return (
    <div className="ds-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <label htmlFor={id} className="ds-label" style={{ color: 'var(--color-gray-900)' }}>
          {label}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isOverridden && <span className="ds-chip ds-chip--modified">Modified</span>}
          {onReset && (
            <button
              type="button"
              className="ds-btn ds-btn--ghost ds-btn--sm"
              onClick={onReset}
              disabled={!isOverridden}
              aria-label={`Reset ${label} to baseline`}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 8 }}>
        <Stat label="Current" value={formatValue(value)} />
        <Stat label="Default" value={formatValue(baseline)} />
        <Stat
          label="Variance vs Default"
          value={variance === 0 ? '—' : formatDelta(variance, formatValue)}
          emphasize={variance !== 0}
        />
      </div>

      <div style={{ position: 'relative', padding: '14px 0 6px' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: `${baselinePct * 100}%`,
            top: 6,
            bottom: 6,
            width: 2,
            background: 'var(--color-dark)',
            transform: 'translateX(-1px)',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className={isGradient ? 'ds-slider ds-slider--gradient' : 'ds-slider'}
          style={{ width: '100%', accentColor: thumbColor, position: 'relative', zIndex: 1 }}
          aria-valuetext={formatValue(value)}
        />
      </div>

      {markers && markers.some((m) => m.value >= min - 0.001 && m.value <= max + 0.001) && (
        <div style={{ position: 'relative', height: 30, marginTop: 2 }} aria-hidden>
          {markers
            .filter((m) => m.value >= min - 0.001 && m.value <= max + 0.001)
            .map((marker) => {
            const pct = Math.min(1, Math.max(0, (marker.value - min) / range));
            return (
              <div
                key={marker.label}
                style={{
                  position: 'absolute',
                  left: `${pct * 100}%`,
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <div
                  style={{
                    width: 2,
                    height: 6,
                    background: marker.active ? 'var(--color-primary-orange)' : 'var(--color-gray-400)',
                  }}
                />
                <span
                  className="ds-caption"
                  style={{
                    whiteSpace: 'nowrap',
                    fontWeight: marker.active ? 700 : 400,
                    color: marker.active ? 'var(--color-primary-orange)' : 'var(--color-gray-500)',
                  }}
                >
                  {marker.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showRangeCaption && (
        <div style={{ marginTop: 8 }}>
          <span className="ds-caption">
            {formatValue(min)} – {formatValue(max)}
          </span>
        </div>
      )}

      {impacts && impacts.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 20,
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--color-gray-200)',
          }}
        >
          {impacts.map((impact) => (
            <Stat key={impact.label} label={impact.label} value={impact.value} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <div className="ds-caption">{label}</div>
      <div
        className="ds-mono"
        style={{ fontSize: 14, fontWeight: 600, color: emphasize ? 'var(--color-primary-orange)' : undefined }}
      >
        {value}
      </div>
    </div>
  );
}
