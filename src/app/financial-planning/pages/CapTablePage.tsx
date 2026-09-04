
import { useMemo, useState } from 'react';
import { computeCapTable } from '../engine/capTable';
import { DEFAULT_NOTE_TERMS, EXISTING_NOTES, FOUNDING_HOLDERS, TOTAL_NOTE_PRINCIPAL } from '../data/capTable';
import { BaselineSlider } from '../components/controls/BaselineSlider';
import { formatCurrency, formatCount, formatPercent } from '../lib/format';
import type { PendingNoteInput, PendingRoundInput } from '../engine/types';

const TODAY_ISO = new Date().toISOString().slice(0, 10);

const DEFAULT_PENDING_NOTE: PendingNoteInput = {
  holderName: '',
  principal: 250_000,
  issueDate: TODAY_ISO,
  interestRatePct: DEFAULT_NOTE_TERMS.interestRatePct,
  valuationCap: DEFAULT_NOTE_TERMS.valuationCap,
  discountPct: DEFAULT_NOTE_TERMS.discountPct,
};

const DEFAULT_PENDING_ROUND: PendingRoundInput = {
  amountRaised: 4_000_000,
  preMoneyValuation: 16_000_000,
  closeDate: TODAY_ISO,
  optionPoolRefreshEnabled: true,
  optionPoolTargetPct: 0.1,
};

const BAR_COLORS = {
  founders: 'var(--color-regular-blue)',
  pool: 'var(--color-functional-amber)',
  notes: 'var(--color-primary-orange)',
  investor: 'var(--color-additional-green-dark)',
};

function ToggleButton({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className={`ds-btn ds-btn--sm ${on ? 'ds-btn--primary' : 'ds-btn--outline'}`}
      onClick={onClick}
    >
      {label}: {on ? 'On' : 'Off'}
    </button>
  );
}

export default function CapTablePage() {
  const [noteEnabled, setNoteEnabled] = useState(false);
  const [pendingNote, setPendingNote] = useState<PendingNoteInput>(DEFAULT_PENDING_NOTE);

  const [roundEnabled, setRoundEnabled] = useState(false);
  const [pendingRound, setPendingRound] = useState<PendingRoundInput>(DEFAULT_PENDING_ROUND);

  const [viewingDate, setViewingDate] = useState(TODAY_ISO);

  const result = useMemo(
    () =>
      computeCapTable({
        founders: FOUNDING_HOLDERS,
        existingNotes: EXISTING_NOTES,
        pendingNote: noteEnabled ? pendingNote : undefined,
        pendingRound: roundEnabled ? pendingRound : undefined,
        viewingDate,
      }),
    [noteEnabled, pendingNote, roundEnabled, pendingRound, viewingDate]
  );

  const founderRows = result.rows.filter((r) => r.category === 'founder');
  const poolRows = result.rows.filter((r) => r.category === 'option-pool');
  const noteRows = result.rows.filter((r) => r.category === 'note-holder');
  const investorRows = result.rows.filter((r) => r.category === 'new-investor');

  const foundersSharesBefore = founderRows.reduce((s, r) => s + r.sharesBefore, 0);
  const foundersSharesAfter = founderRows.reduce((s, r) => s + r.sharesAfter, 0);
  const poolSharesBefore = poolRows.reduce((s, r) => s + r.sharesBefore, 0);
  const poolSharesAfter = poolRows.reduce((s, r) => s + r.sharesAfter, 0);
  const noteSharesAfter = noteRows.reduce((s, r) => s + r.sharesAfter, 0);
  const investorSharesAfter = investorRows.reduce((s, r) => s + r.sharesAfter, 0);

  const beforeSegs = [
    { label: 'Founders', shares: foundersSharesBefore, color: BAR_COLORS.founders },
    { label: 'Option Pool', shares: poolSharesBefore, color: BAR_COLORS.pool },
  ];
  const afterSegs = [
    { label: 'Founders', shares: foundersSharesAfter, color: BAR_COLORS.founders },
    { label: 'Option Pool', shares: poolSharesAfter, color: BAR_COLORS.pool },
    { label: 'Note Holders', shares: noteSharesAfter, color: BAR_COLORS.notes },
    { label: 'New Round Investor', shares: investorSharesAfter, color: BAR_COLORS.investor },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 32, marginBottom: 8 }}>Cap Table</h2>
      <p className="ds-body" style={{ marginBottom: 20, maxWidth: 760 }}>
        Current, real cap table — {formatCount(result.totalSharesBefore)} fully-diluted shares, plus{' '}
        {formatCurrency(TOTAL_NOTE_PRINCIPAL)} across {EXISTING_NOTES.length} outstanding convertible notes. Add a
        hypothetical note and/or priced round below to see the pro-forma impact.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, alignItems: 'start' }}>
        {/* ===================== CONTROLS ===================== */}
        <div>
          <div className="ds-card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="ds-label" style={{ marginBottom: 10 }}>
              Founding Cap Table <span className="ds-chip ds-chip--ghost">Fixed</span>
            </div>
            {result.roundActive && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  padding: '0 0 6px',
                  color: 'var(--color-gray-600)',
                  textTransform: 'uppercase',
                }}
              >
                <span>Holder</span>
                <div style={{ display: 'flex', gap: 14 }}>
                  <span style={{ width: 46, textAlign: 'right' }}>Before</span>
                  <span style={{ width: 46, textAlign: 'right' }}>After</span>
                  <span style={{ width: 90, textAlign: 'right' }}>Value</span>
                </div>
              </div>
            )}
            {founderRows.concat(poolRows).map((r) => {
              const value = result.roundActive && result.pricePerShare !== null ? r.sharesAfter * result.pricePerShare : null;
              return (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    padding: '5px 0',
                    borderBottom: '1px dashed var(--color-gray-200)',
                  }}
                >
                  <span className="ds-body">{r.name}</span>
                  {result.roundActive ? (
                    <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                      <span className="ds-caption" style={{ width: 46, textAlign: 'right' }}>
                        {formatPercent(r.pctBefore, 2)}
                      </span>
                      <span className="ds-body-bold" style={{ width: 46, textAlign: 'right' }}>
                        {formatPercent(r.pctAfter, 2)}
                      </span>
                      <span className="ds-body-bold" style={{ width: 90, textAlign: 'right' }}>
                        {value !== null ? formatCurrency(value, { compact: true }) : '—'}
                      </span>
                    </div>
                  ) : (
                    <span className="ds-body-bold">{formatPercent(r.pctBefore, 2)}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="ds-card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="ds-label" style={{ marginBottom: 10 }}>
              Existing Convertible Notes <span className="ds-chip ds-chip--ghost">Fixed</span>
            </div>
            <p className="ds-caption" style={{ marginBottom: 8 }}>
              {EXISTING_NOTES.length} notes, {formatCurrency(TOTAL_NOTE_PRINCIPAL)} total — {DEFAULT_NOTE_TERMS.interestRatePct}% simple
              interest, {formatCurrency(DEFAULT_NOTE_TERMS.valuationCap)} cap, {DEFAULT_NOTE_TERMS.discountPct}% discount.
            </p>
            <details>
              <summary className="ds-caption" style={{ cursor: 'pointer', fontWeight: 700 }}>
                Show all {EXISTING_NOTES.length} notes
              </summary>
              <div style={{ marginTop: 8 }}>
                {EXISTING_NOTES.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12.5,
                      padding: '4px 0',
                      borderBottom: '1px dashed var(--color-gray-200)',
                    }}
                  >
                    <span className="ds-body">
                      {n.holderName} <span className="ds-caption">({n.issueDate})</span>
                    </span>
                    <span className="ds-body-bold">{formatCurrency(n.principal)}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>

          <div className="ds-card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="ds-label">Add a Note</div>
              <ToggleButton on={noteEnabled} onClick={() => setNoteEnabled((v) => !v)} label="Note" />
            </div>
            {noteEnabled && (
              <div style={{ opacity: noteEnabled ? 1 : 0.4, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label className="ds-caption">
                  Holder name
                  <input
                    className="ds-input"
                    style={{ display: 'block', width: '100%', marginTop: 4 }}
                    value={pendingNote.holderName}
                    onChange={(e) => setPendingNote((p) => ({ ...p, holderName: e.target.value }))}
                    placeholder="New Note Holder"
                  />
                </label>
                <BaselineSlider
                  label="Principal"
                  min={0}
                  max={5_000_000}
                  step={5000}
                  baseline={0}
                  value={pendingNote.principal}
                  onChange={(v) => setPendingNote((p) => ({ ...p, principal: v }))}
                  formatValue={(v) => formatCurrency(v, { compact: true })}
                  colorMode="red-green-fade"
                  showRangeCaption={false}
                />
                <label className="ds-caption">
                  Issue date
                  <input
                    type="date"
                    className="ds-input"
                    style={{ display: 'block', width: '100%', marginTop: 4 }}
                    value={pendingNote.issueDate}
                    onChange={(e) => setPendingNote((p) => ({ ...p, issueDate: e.target.value }))}
                  />
                </label>
                <BaselineSlider
                  label="Valuation Cap"
                  min={1_000_000}
                  max={50_000_000}
                  step={500_000}
                  baseline={DEFAULT_NOTE_TERMS.valuationCap}
                  value={pendingNote.valuationCap}
                  onChange={(v) => setPendingNote((p) => ({ ...p, valuationCap: v }))}
                  formatValue={(v) => formatCurrency(v, { compact: true })}
                  colorMode="red-green-fade"
                  showRangeCaption={false}
                />
                <BaselineSlider
                  label="Discount"
                  min={0}
                  max={40}
                  step={1}
                  baseline={DEFAULT_NOTE_TERMS.discountPct}
                  value={pendingNote.discountPct}
                  onChange={(v) => setPendingNote((p) => ({ ...p, discountPct: v }))}
                  formatValue={(v) => `${v}%`}
                  colorMode="red-green-fade"
                  showRangeCaption={false}
                />
              </div>
            )}
          </div>

          <div className="ds-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="ds-label">Add a Priced Round</div>
              <ToggleButton on={roundEnabled} onClick={() => setRoundEnabled((v) => !v)} label="Round" />
            </div>
            {roundEnabled ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <BaselineSlider
                  label="Amount Raised"
                  min={0}
                  max={10_000_000}
                  step={100_000}
                  baseline={0}
                  value={pendingRound.amountRaised}
                  onChange={(v) => setPendingRound((r) => ({ ...r, amountRaised: v }))}
                  formatValue={(v) => formatCurrency(v, { compact: true })}
                  colorMode="red-green-fade"
                  showRangeCaption={false}
                />
                <BaselineSlider
                  label="Pre-Money Valuation"
                  min={5_000_000}
                  max={75_000_000}
                  step={500_000}
                  baseline={16_000_000}
                  value={pendingRound.preMoneyValuation}
                  onChange={(v) => setPendingRound((r) => ({ ...r, preMoneyValuation: v }))}
                  formatValue={(v) => formatCurrency(v, { compact: true })}
                  colorMode="red-green-fade"
                  showRangeCaption={false}
                />
                <label className="ds-caption">
                  Close date
                  <input
                    type="date"
                    className="ds-input"
                    style={{ display: 'block', width: '100%', marginTop: 4 }}
                    value={pendingRound.closeDate}
                    onChange={(e) => setPendingRound((r) => ({ ...r, closeDate: e.target.value }))}
                  />
                </label>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="ds-caption">Refresh option pool at close</span>
                  <ToggleButton
                    on={pendingRound.optionPoolRefreshEnabled}
                    onClick={() =>
                      setPendingRound((r) => ({ ...r, optionPoolRefreshEnabled: !r.optionPoolRefreshEnabled }))
                    }
                    label="Refresh"
                  />
                </div>
                {pendingRound.optionPoolRefreshEnabled && (
                  <BaselineSlider
                    label="Target Pool Size (% of post-round FD shares)"
                    min={5}
                    max={20}
                    step={0.5}
                    baseline={10}
                    value={pendingRound.optionPoolTargetPct * 100}
                    onChange={(v) => setPendingRound((r) => ({ ...r, optionPoolTargetPct: v / 100 }))}
                    formatValue={(v) => `${v}%`}
                    colorMode="red-green-fade"
                    showRangeCaption={false}
                  />
                )}
              </div>
            ) : (
              <label className="ds-caption">
                Viewing date (for outstanding note balances)
                <input
                  type="date"
                  className="ds-input"
                  style={{ display: 'block', width: '100%', marginTop: 4 }}
                  value={viewingDate}
                  onChange={(e) => setViewingDate(e.target.value)}
                />
              </label>
            )}
          </div>
        </div>

        {/* ===================== RESULTS ===================== */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <div className="ds-card" style={{ padding: 14 }}>
              <div className="ds-label" style={{ marginBottom: 6 }}>
                Price / Share
              </div>
              <div style={{ fontSize: 21, fontWeight: 700 }}>
                {result.pricePerShare !== null ? `$${result.pricePerShare.toFixed(3)}` : '—'}
              </div>
            </div>
            <div className="ds-card" style={{ padding: 14 }}>
              <div className="ds-label" style={{ marginBottom: 6 }}>
                Post-Money Valuation
              </div>
              <div style={{ fontSize: 21, fontWeight: 700 }}>
                {result.postMoneyValuation !== null ? formatCurrency(result.postMoneyValuation, { compact: true }) : '—'}
              </div>
            </div>
            <div className="ds-card" style={{ padding: 14 }}>
              <div className="ds-label" style={{ marginBottom: 6 }}>
                Founder Dilution
              </div>
              <div style={{ fontSize: 21, fontWeight: 700 }}>
                {result.roundActive ? `-${result.founderDilutionPts.toFixed(1)} pts` : '0.0 pts'}
              </div>
              <div className="ds-caption">
                {formatPercent(result.founderPctBefore, 1)} → {formatPercent(result.founderPctAfter, 1)}
              </div>
            </div>
            <div className="ds-card" style={{ padding: 14 }}>
              <div className="ds-label" style={{ marginBottom: 6 }}>
                New Shares Issued
              </div>
              <div style={{ fontSize: 21, fontWeight: 700 }}>{formatCount(result.newSharesIssued)}</div>
            </div>
          </div>

          <div className="ds-card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="ds-caption" style={{ marginBottom: 8, fontWeight: 700 }}>
              Before ({formatCount(result.totalSharesBefore)} fully-diluted shares)
            </div>
            <StackBar segments={beforeSegs} total={result.totalSharesBefore} />

            <div className="ds-caption" style={{ margin: '16px 0 8px', fontWeight: 700 }}>
              After {result.roundActive ? `(${formatCount(result.totalSharesAfter)} fully-diluted shares)` : '(unchanged — no round modeled)'}
            </div>
            <StackBar segments={afterSegs} total={result.totalSharesAfter} />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 12 }}>
              {afterSegs.map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
                  <span className="ds-caption">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ds-card" style={{ padding: 16 }}>
            <div className="ds-label" style={{ marginBottom: 12 }}>
              Detailed Cap Table
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['Holder', 'Shares (Before)', '% (Before)', 'Shares (After)', '% (After)'].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 0 ? 'left' : 'right',
                        padding: '8px 10px',
                        borderBottom: '2px solid var(--color-gray-200)',
                        color: 'var(--color-gray-600)',
                        textTransform: 'uppercase',
                        fontSize: 11,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-gray-200)' }}>
                      {r.name}
                      {r.note && (
                        <>
                          <br />
                          <span className="ds-caption">{r.note}</span>
                        </>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-gray-200)', textAlign: 'right' }}>
                      {r.sharesBefore > 0 ? formatCount(r.sharesBefore) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-gray-200)', textAlign: 'right' }}>
                      {r.sharesBefore > 0 ? formatPercent(r.pctBefore, 2) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-gray-200)', textAlign: 'right' }}>
                      {r.sharesAfter > 0 ? formatCount(r.sharesAfter) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-gray-200)', textAlign: 'right' }}>
                      {r.sharesAfter > 0 ? formatPercent(r.pctAfter, 2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StackBar({ segments, total }: { segments: { label: string; shares: number; color: string }[]; total: number }) {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: 36,
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid var(--color-gray-200)',
        background: 'var(--color-gray-100)',
      }}
    >
      {segments
        .filter((s) => s.shares > 0)
        .map((s) => {
          const pct = total > 0 ? (s.shares / total) * 100 : 0;
          return (
            <div
              key={s.label}
              title={`${s.label}: ${pct.toFixed(1)}%`}
              style={{
                width: `${pct}%`,
                background: s.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              {pct > 6 ? `${pct.toFixed(1)}%` : ''}
            </div>
          );
        })}
    </div>
  );
}
