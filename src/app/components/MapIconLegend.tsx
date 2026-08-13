import { MAP_ICON_LEGEND } from '../utils/deviceTypes';

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
    </div>
  );
}
