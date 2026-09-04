
import { useMemo, useRef, useState } from 'react';

export interface PresetAnchor {
  key: string;
  label: string;
  value: number;
}

export interface PresetBlendSliderProps {
  label?: string;
  value: number;
  /** Ordered ascending by value, at least 2 entries — e.g. Conservative/Balanced/
   * Accelerated, or Slow/Modest/Rapid/Wildfire. Landing exactly on an anchor (via
   * magnetic snap) means "use the real named plan," not an interpolated approximation. */
  anchors: PresetAnchor[];
  /** Which anchor is the current "official" selection (drives the badge/thumb fill and
   * the "X Default" stat). */
  activeAnchorKey: string;
  onChange: (value: number) => void;
  onReset: () => void;
  formatValue: (v: number) => string;
  /** Formats a plain difference (e.g. value - default) — NOT a point on the same scale
   * as formatValue, since a delta isn't itself a valid position to label. */
  formatVariance?: (delta: number) => string;
  impacts?: { label: string; value: string }[];
  /** Show the "{min} – {max}" range caption below the anchor labels. Default true. */
  showRangeCaption?: boolean;
}

interface Breakpoints {
  values: number[];
  pcts: number[];
  min: number;
  max: number;
}

function buildBreakpoints(anchors: PresetAnchor[]): Breakpoints {
  const n = anchors.length;
  const values = anchors.map((a) => a.value);
  const firstSlope = values[1] - values[0];
  const lastSlope = values[n - 1] - values[n - 2];
  const min = values[0] - firstSlope;
  const max = values[n - 1] + lastSlope;
  const bpValues = [min, ...values, max];
  const bpPcts = [0, ...anchors.map((_, i) => ((i + 1) / (n + 1)) * 100), 100];
  return { values: bpValues, pcts: bpPcts, min, max };
}

function pctFromValue(value: number, bp: Breakpoints): number {
  const v = clamp(value, bp.min, bp.max);
  for (let i = 0; i < bp.values.length - 1; i++) {
    if (v <= bp.values[i + 1] || i === bp.values.length - 2) {
      const span = bp.values[i + 1] - bp.values[i];
      const frac = span === 0 ? 0 : (v - bp.values[i]) / span;
      return bp.pcts[i] + frac * (bp.pcts[i + 1] - bp.pcts[i]);
    }
  }
  return 0;
}

function valueFromPct(pct: number, bp: Breakpoints): number {
  const p = clamp(pct, 0, 100);
  for (let i = 0; i < bp.pcts.length - 1; i++) {
    if (p <= bp.pcts[i + 1] || i === bp.pcts.length - 2) {
      const span = bp.pcts[i + 1] - bp.pcts[i];
      const frac = span === 0 ? 0 : (p - bp.pcts[i]) / span;
      return bp.values[i] + frac * (bp.values[i + 1] - bp.values[i]);
    }
  }
  return bp.min;
}

/** Width of whichever segment `value` currently sits in — used to size a "1 percentage
 * point" keyboard nudge consistently no matter how unevenly the anchors are spaced. */
function currentSegmentWidth(value: number, bp: Breakpoints): number {
  const v = clamp(value, bp.min, bp.max);
  for (let i = 0; i < bp.values.length - 1; i++) {
    if (v <= bp.values[i + 1] || i === bp.values.length - 2) {
      return bp.values[i + 1] - bp.values[i];
    }
  }
  return bp.max - bp.min;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function PresetBlendSlider({
  label = 'Level',
  value,
  anchors,
  activeAnchorKey,
  onChange,
  onReset,
  formatValue,
  formatVariance = (delta) => `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`,
  impacts,
  showRangeCaption = true,
}: PresetBlendSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const bp = useMemo(() => buildBreakpoints(anchors), [anchors]);
  const activeAnchor = anchors.find((a) => a.key === activeAnchorKey) ?? anchors[0];
  const isOverridden = Math.abs(value - activeAnchor.value) > 0.005;
  const variance = value - activeAnchor.value;
  const valuePct = pctFromValue(value, bp);

  function updateFromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    let pct = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    // Magnetic snap: landing a drag/click near an anchor's mark should reproduce that
    // plan's exact numbers, not "close but not quite." Tolerance is in track position
    // so it feels consistent across unevenly-spaced anchors. Keyboard bypasses this.
    for (const anchor of anchors) {
      const anchorPct = bp.pcts[anchors.indexOf(anchor) + 1];
      if (Math.abs(pct - anchorPct) < 2.5) {
        pct = anchorPct;
        break;
      }
    }
    const snappedAnchor = anchors.find((a, i) => Math.abs(pct - bp.pcts[i + 1]) < 0.01);
    const next = snappedAnchor ? snappedAnchor.value : Math.round(valueFromPct(pct, bp) * 1000) / 1000;
    onChange(next);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    updateFromClientX(e.clientX);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    updateFromClientX(e.clientX);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = false;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // 1 percentage point of whichever segment the value currently sits in per press
    // (10 with Shift), no magnetic snapping — fine 1-at-a-time adjustment always works
    // even right next to an anchor mark, regardless of how unevenly anchors are spaced.
    const segWidth = currentSegmentWidth(value, bp);
    const step = segWidth * (e.shiftKey ? 0.1 : 0.01);
    const round = (n: number) => Math.round(n * 1000) / 1000;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(clamp(round(value + step), bp.min, bp.max));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(clamp(round(value - step), bp.min, bp.max));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(bp.min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(bp.max);
    }
  }

  return (
    <div className="ds-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span className="ds-label">{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isOverridden ? (
            <span className="ds-chip ds-chip--modified">Custom Scenario</span>
          ) : (
            <span
              className="ds-chip"
              style={{
                background: 'var(--color-functional-green-light)',
                color: 'var(--color-functional-green)',
                border: 0,
                fontWeight: 700,
              }}
            >
              Official Plan: {activeAnchor.label}
            </span>
          )}
          <button
            type="button"
            className="ds-btn ds-btn--ghost ds-btn--sm"
            onClick={onReset}
            disabled={!isOverridden}
            aria-label={`Reset ${label} to plan default`}
          >
            Reset
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
        <Stat label="Current" value={formatValue(value)} />
        <Stat label={`${activeAnchor.label} Default`} value={formatValue(activeAnchor.value)} />
        <Stat
          label="Variance vs Default"
          value={variance === 0 ? '—' : formatVariance(variance)}
          emphasize={variance !== 0}
        />
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={bp.min}
        aria-valuemax={bp.max}
        aria-valuenow={value}
        aria-valuetext={formatValue(value)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        style={{
          position: 'relative',
          height: 32,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          touchAction: 'none',
          outline: 'none',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 8,
            background:
              'linear-gradient(to right, var(--color-functional-red), var(--color-functional-amber) 50%, var(--color-functional-green))',
            pointerEvents: 'none',
          }}
        />
        {anchors.map((anchor, i) => (
          <div
            key={anchor.key}
            aria-hidden
            style={{
              position: 'absolute',
              left: `${bp.pcts[i + 1]}%`,
              top: -3,
              width: 2,
              height: 14,
              background: anchor.key === activeAnchorKey ? 'var(--color-dark)' : 'rgba(29,37,45,0.35)',
              transform: 'translateX(-1px)',
              pointerEvents: 'none',
            }}
          />
        ))}
        <div
          aria-hidden
          title={isOverridden ? 'Custom scenario (not an official plan)' : `Official plan: ${activeAnchor.label}`}
          style={{
            position: 'absolute',
            left: `${valuePct}%`,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: dragging ? 'var(--color-primary-orange)' : isOverridden ? 'var(--color-white)' : 'var(--color-dark)',
            border: isOverridden ? '3px solid var(--color-primary-orange)' : '3px solid var(--color-white)',
            boxShadow: '0 0 0 1.5px var(--color-dark), 0 1px 3px rgba(0,0,0,0.3)',
            transform: 'translateX(-11px)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div style={{ position: 'relative', height: 20, marginTop: 4 }} aria-hidden>
        {anchors.map((anchor, i) => (
          <span
            key={anchor.key}
            className="ds-caption"
            style={{
              position: 'absolute',
              left: `${bp.pcts[i + 1]}%`,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              fontWeight: anchor.key === activeAnchorKey ? 700 : 400,
              color: anchor.key === activeAnchorKey ? 'var(--color-primary-orange)' : 'var(--color-gray-500)',
            }}
          >
            {anchor.label}
          </span>
        ))}
      </div>

      {showRangeCaption && (
        <div className="ds-caption" style={{ marginTop: 20 }}>
          {formatValue(bp.min)} – {formatValue(bp.max)}
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
