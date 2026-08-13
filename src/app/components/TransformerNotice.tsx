import { WARNING_480V_COLOR, WARNING_480V_BADGE_TEXT } from '../utils/deviceTypes';

// Small badge overlaid on the top-right corner of a trail's addendum map —
// shown per-map (not in the shared icon key) only when that trail actually
// has a 480V Power Source / camera. Caller must wrap the <img> in a
// position:relative container.
export function TransformerBadge() {
  return (
    <div
      style={{
        position: 'absolute', top: 10, right: 10, maxWidth: 190,
        background: WARNING_480V_COLOR, border: '1px solid rgba(0,0,0,0.25)',
        borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 600,
        color: '#1a1a1a', lineHeight: 1.35, boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}
    >
      {WARNING_480V_BADGE_TEXT}
    </div>
  );
}

// One-time footnote explaining the 480V transformer requirement — rendered
// once at the very end of the document (after every trail's addendum, not
// per-trail) even when several trails each have their own 480V badge above.
export function TransformerFootnote() {
  return (
    <p style={{ fontSize: 11, color: '#666', marginTop: 24, paddingTop: 16, borderTop: '1px solid #eee', lineHeight: 1.6 }}>
      *** A typical on-mountain YULLR location draws less than 1 amp at 120V under normal operating conditions.
      Because the total power requirement is relatively small, a 0.5 kVA, NEMA 3R (or better), 480V to 120/240V
      encapsulated transformer is sufficient. These transformers are commonly available from manufacturers such
      as Acme Electric, Hammond Power Solutions, Schneider Electric, and others, with typical pricing ranging
      from $150-$250 USD depending on supplier and availability. A commonly used example is the Acme Electric T253008S.
    </p>
  );
}
