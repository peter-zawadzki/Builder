import { MAP_ICON_LEGEND } from '../utils/deviceTypes';

// Matches CONNECTION_COLORS/CONNECTION_STATIC_COLORS in
// SiteAssessmentWorkspace.tsx/MountainMapView.tsx/ProposalBuilder.tsx — kept
// as a plain local list (not imported) since this component is also used by
// the public SigningPage, which shouldn't need to know about the
// site-assessment map tooling that produces these lines.
const CONNECTION_LINE_LEGEND: { color: string; label: string; style: 'dashed' | 'solid' | 'double' }[] = [
  { color: '#0ea5e9', label: 'Wireless Link', style: 'dashed' },
  { color: '#22c55e', label: 'Wired PoE Link', style: 'solid' },
  { color: '#f59e0b', label: '120V Power Run', style: 'double' },
];

function LineSwatch({ color, style }: { color: string; style: 'dashed' | 'solid' | 'double' }) {
  if (style === 'double') {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, width: 22, flexShrink: 0 }}>
        <span style={{ height: 2, background: color, borderRadius: 1 }} />
        <span style={{ height: 2, background: color, borderRadius: 1 }} />
      </span>
    );
  }
  return (
    <span
      style={{
        width: 22, height: 0, borderTop: `2px ${style === 'dashed' ? 'dashed' : 'solid'} ${color}`,
        flexShrink: 0,
      }}
    />
  );
}

// Reference key for the proposal-addendum map — shared by ProposalBuilder's
// preview/PDF and the public SigningPage, so both render the same key.
// Inline styles (not Tailwind) since SigningPage's addendum section is
// plain inline-styled to match its print/PDF rendering.
export function MapIconLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 10, fontSize: 11, color: '#555' }}>
      {MAP_ICON_LEGEND.map(({ Icon, color, iconColor, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 18, height: 18, borderRadius: '50%', background: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              border: '1px solid rgba(0,0,0,0.15)',
            }}
          >
            <Icon size={11} color={iconColor} strokeWidth={2.5} />
          </span>
          <span>{label}</span>
        </div>
      ))}
      {CONNECTION_LINE_LEGEND.map(({ color, label, style }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <LineSwatch color={color} style={style} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
