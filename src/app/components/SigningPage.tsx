import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { CheckCircle, AlertCircle, PenLine, Printer } from 'lucide-react';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

// Proposal send/view/sign, and now Customer Agreement auto-creation, run
// through our own local server — public, token-authenticated, no Clerk
// session (server/routes/proposalPublicSign.ts, agreementPublicSign.ts).
const PROPOSAL_SIGN_BASE = '/api/public/proposal-sign';
const AGREEMENT_SIGN_BASE = '/api/public/agreement-sign';

function parseAmt(v: string) { return parseFloat((v || '').replace(/[$,]/g, '')) || 0; }
function fmtMoney(n: number) { return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtDate(d: string) {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  if (!y) return d;
  return `${m}/${dd}/${y}`;
}

interface Signature { name: string; title?: string | null; legalEntity?: string | null; signatureImage?: string | null; signedAt: string; }
interface SignRecord {
  token: string;
  mountainId: string;
  createdAt: string;
  proposalSnapshot: any;
  yullrSignature: Signature | null;
  clientSignature: Signature | null;
}

// ─── PDF-style helpers (inline styles to match the print preview) ──────────────
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 10 };
const td: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #f0f0f0', color: '#444', verticalAlign: 'top' };
const thStyle: React.CSSProperties = { ...td, background: '#f8f8f8', color: '#333', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '2px solid #e0e0e0' };
const evenRow: React.CSSProperties = { background: '#fafafa' };
const totalRow: React.CSSProperties = { background: '#fff3f0', fontWeight: 700 };
const subtotalRow: React.CSSProperties = { background: '#fff8f6', fontWeight: 600 };
const sectionRow: React.CSSProperties = {};
const pStyle: React.CSSProperties = { fontSize: 12.5, color: '#444', lineHeight: 1.75, marginBottom: 10 };

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th style={{ ...thStyle, textAlign: right ? 'right' : 'left' }}>{children}</th>;
}
function PreviewH2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 12px' }}>
      <div style={{ width: 4, height: 18, background: '#FF5C39', borderRadius: 2, flexShrink: 0 }} />
      <h2 style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: 0.6 }}>{children}</h2>
    </div>
  );
}

export function SigningPage() {
  const { token } = useParams<{ token: string }>();
  const [record, setRecord] = useState<SignRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clientName, setClientName] = useState('');
  const [clientTitle, setClientTitle] = useState('');
  const [clientLegalEntity, setClientLegalEntity] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [caToken, setCaToken] = useState<string | null>(null);
  const sigPadRef = useRef<SignaturePadHandle>(null);
  const [sigEmpty, setSigEmpty] = useState(true);
  const [capturedSigUrl, setCapturedSigUrl] = useState<string | null>(null);

  // Auto-create the CA (if not already created) so the link is ready immediately after both parties sign
  const ensureCaExists = async (mountainId: string, snapshot: any) => {
    try {
      // Check if one already exists
      const statusRes = await fetch(`${AGREEMENT_SIGN_BASE}/by-mountain/${mountainId}`);
      const statusData = await statusRes.json() as any;
      if (statusData.token) { setCaToken(statusData.token); return; }

      // Auto-create with pre-populated data from the proposal snapshot
      // Field names must match CAFormData exactly
      const formData = {
        yullrEmail:          'support@yullr.com',
        customerLegalName:   snapshot?.legalEntity    || snapshot?.clientName    || '',
        entityType:          'LLC',
        stateOfFormation:    '',
        authorizedSignatory: '',
        addressForNotices:   snapshot?.billingAddress || snapshot?.clientAddress || '',
        emailForNotices:     snapshot?.contactEmail   || '',
        facilityName:        snapshot?.mountainName   || '',
        facilityLocation:    snapshot?.clientAddress  || '',
        effectiveDate:       new Date().toISOString().split('T')[0],
        technicalAdministrators: [],
      };
      const createRes = await fetch(`${AGREEMENT_SIGN_BASE}/create-for-mountain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mountainId, formData }),
      });
      const createData = await createRes.json() as any;
      if (createData.token) setCaToken(createData.token);
    } catch { /* non-critical */ }
  };

  useEffect(() => {
    if (!token) { setError('Invalid signing link.'); setLoading(false); return; }
    fetch(`${PROPOSAL_SIGN_BASE}/${token}`)
      .then(r => r.json())
      .then((data: any) => {
        if (data.error) throw new Error(data.error);
        const p = data.proposal;
        const rec: SignRecord = {
          token: token!,
          mountainId: p.mountainId,
          createdAt: p.sentAt || new Date().toISOString(),
          proposalSnapshot: p.form,
          yullrSignature: p.yullrSignature,
          clientSignature: p.clientSignature,
        };
        setRecord(rec);
        // Track that the link was opened (fire-and-forget)
        fetch(`${PROPOSAL_SIGN_BASE}/${token}/viewed`, { method: 'POST' }).catch(() => {});
        if (rec.clientSignature) {
          setSigned(true);
          setClientName(rec.clientSignature.name);
          setClientTitle(rec.clientSignature.title || '');
          setClientLegalEntity(rec.clientSignature.legalEntity || '');
          // Already signed — ensure CA exists and load the link
          if (rec.mountainId) ensureCaExists(rec.mountainId, rec.proposalSnapshot);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSign = async () => {
    if (!clientName.trim()) { setSubmitError('Please enter your full name.'); return; }
    if (!clientTitle.trim()) { setSubmitError('Please enter your title or role.'); return; }
    if (!clientLegalEntity.trim()) { setSubmitError('Please enter the legal entity name.'); return; }
    if (sigEmpty) { setSubmitError('Please draw your signature above.'); return; }
    if (!agreed) { setSubmitError('Please check the agreement box above.'); return; }
    const signatureImage = sigPadRef.current?.getDataURL() ?? null;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${PROPOSAL_SIGN_BASE}/${token}/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clientName.trim(), title: clientTitle.trim(), legalEntity: clientLegalEntity.trim(), signatureImage }),
      });
      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to submit signature');
      if (signatureImage) setCapturedSigUrl(signatureImage);
      setRecord(prev => prev ? {
        ...prev,
        clientSignature: { name: clientName.trim(), title: clientTitle.trim(), legalEntity: clientLegalEntity.trim(), signatureImage, signedAt: new Date().toISOString() }
      } : prev);
      setSigned(true);
      // Auto-create CA and fetch the link after signing
      if (record?.mountainId) ensureCaExists(record.mountainId, record.proposalSnapshot);
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F3F5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#ff5c39] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#6a7282] text-[14px]">Loading proposal…</p>
        </div>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="min-h-screen bg-[#F2F3F5] flex items-center justify-center p-6">
        <div className="bg-white rounded-[16px] border border-[rgba(0,0,0,0.1)] p-8 text-center max-w-sm w-full">
          <AlertCircle size={40} className="text-[#ff5c39] mx-auto mb-4" />
          <h2 className="text-[#0a0a0a] font-medium text-[18px] mb-2">Link Not Found</h2>
          <p className="text-[#6a7282] text-[14px]">
            {error || 'This signing link is invalid or has expired. Please contact YULLR for a new link.'}
          </p>
        </div>
      </div>
    );
  }

  const p = record.proposalSnapshot;

  if (!p) {
    return (
      <div className="min-h-screen bg-[#F2F3F5] flex items-center justify-center p-6">
        <div className="bg-white rounded-[16px] border border-[rgba(0,0,0,0.1)] p-8 text-center max-w-sm w-full">
          <AlertCircle size={40} className="text-[#ff5c39] mx-auto mb-4" />
          <h2 className="text-[#0a0a0a] font-medium text-[18px] mb-2">Proposal Unavailable</h2>
          <p className="text-[#6a7282] text-[14px]">
            This proposal does not contain a valid snapshot. Please contact YULLR for a new signing link.
          </p>
        </div>
      </div>
    );
  }

  // Calculations
  function trailTotal(t: any) { return (parseFloat(t.capturePoints) || 0) * parseAmt(t.unitPrice); }
  function bulkTotal(b: any) { return (parseFloat(b.qty) || 0) * parseAmt(b.unitPrice); }
  const trailSubtotal = (p.trails || []).reduce((s: number, t: any) => s + trailTotal(t), 0);
  const bulkSubtotal = (p.bulkRows || []).reduce((s: number, b: any) => s + bulkTotal(b), 0);
  const hwTotal = trailSubtotal + parseAmt(p.integrationFee) + parseAmt(p.installFee) + parseAmt(p.miscFee);
  const grandTotal = hwTotal + bulkSubtotal;
  const installNotesArr = (p.installNotes || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
  const extraTermsArr = (p.additionalTerms || '').split('\n').map((s: string) => s.trim()).filter(Boolean);

  const yullrSigned = !!record.yullrSignature;
  const clientSigned = signed || !!record.clientSignature;
  const bothSigned = yullrSigned && clientSigned;

  const displayClientName = p.legalEntity || p.clientName || 'Client';

  return (
    <div style={{ background: '#F2F3F5', minHeight: '100vh' }}>
      {/* Minimal top bar — just YULLR logo + print button, no dark background */}
      <div style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <img
          src="https://race.yullr.com/_assets/v11/8b719608599361ca2b1d142742df531a9af04c08.png"
          alt="YULLR"
          style={{ height: 36 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {bothSigned && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', color: '#22c55e', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 20 }}>
              <CheckCircle size={13} /> Fully Executed
            </span>
          )}
          <button
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f3f3f5', border: 'none', color: '#555', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            <Printer size={14} /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* ── Proposal Document ── */}
      <div style={{ maxWidth: 860, margin: '28px auto 60px', background: '#fff', padding: '60px 70px', boxShadow: '0 2px 20px rgba(0,0,0,0.10)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #FF5C39', paddingBottom: 24, marginBottom: 32 }}>
          <img src="https://race.yullr.com/_assets/v11/8b719608599361ca2b1d142742df531a9af04c08.png" alt="YULLR" style={{ height: 48 }} />
          <div style={{ textAlign: 'right', color: '#555', fontSize: 12, lineHeight: 1.9 }}>
            <div><strong style={{ color: '#1a1a1a' }}>Proposal #:</strong> {p.proposalNumber}</div>
            <div><strong style={{ color: '#1a1a1a' }}>Date:</strong> {fmtDate(p.date)}</div>
            <div><strong style={{ color: '#1a1a1a' }}>Valid until:</strong> {fmtDate(p.validUntil)}</div>
          </div>
        </div>

        {/* Title block */}
        <div style={{ background: '#fff3f0', borderLeft: '4px solid #FF5C39', padding: '16px 20px', marginBottom: 28, borderRadius: '0 6px 6px 0' }}>
          <h1 style={{ fontSize: 19, color: '#FF5C39', marginBottom: 4, fontWeight: 700 }}>Project Proposal</h1>
          <h2 style={{ fontSize: 15, color: '#333', fontWeight: 600, marginBottom: 2 }}>{displayClientName}</h2>
          {p.mountainName && p.mountainName !== displayClientName && (
            <p style={{ fontSize: 12.5, color: '#777', margin: 0 }}>{p.mountainName}</p>
          )}
        </div>

        {/* 1. Project Summary */}
        <PreviewH2>1. Project Summary</PreviewH2>
        <p style={pStyle}>This proposal outlines the scope, hardware, subscription services, and associated costs for deploying the YULLR platform at <strong>{p.mountainName}</strong>, located at <strong>{p.clientAddress}</strong>.</p>
        <p style={pStyle}>Built for demanding alpine environments, the YULLR system is designed to operate reliably in sub-zero temperatures, high winds, and heavy snowfall. Each camera is remotely managed through the YULLR cloud platform, providing real-time monitoring, firmware updates, and centralized footage management with minimal on-site maintenance.</p>

        {/* 2. Trails */}
        <PreviewH2>2. Trails</PreviewH2>
        <p style={pStyle}>The following trails have been identified for YULLR Capture Points. Capture Point quantities and positioning are subject to adjustment based on site conditions.</p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Trail Name</Th>
              <Th right>Capture Points</Th>
              <Th>Notes</Th>
              <Th right>Unit Price</Th>
              <Th right>Total</Th>
            </tr>
          </thead>
          <tbody>
            {(p.trails || []).map((t: any, i: number) => (
              <tr key={t.id} style={i % 2 === 1 ? evenRow : {}}>
                <td style={td}>{t.name || '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{t.capturePoints || '—'}</td>
                <td style={td}>{t.notes || '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{parseAmt(t.unitPrice) ? fmtMoney(parseAmt(t.unitPrice)) : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{trailTotal(t) ? fmtMoney(trailTotal(t)) : '—'}</td>
              </tr>
            ))}
            <tr style={totalRow}>
              <td style={td} colSpan={4}>Trail Capture Points Total</td>
              <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(trailSubtotal)}</td>
            </tr>
          </tbody>
        </table>

        {/* 3. Installation Notes */}
        <PreviewH2>3. Installation Notes</PreviewH2>
        <p style={pStyle}>Installation will be carried out by a YULLR technician or approved installation partner. The following conditions apply:</p>
        <ul style={{ marginLeft: 18, lineHeight: 2.2, color: '#444', fontSize: 12.5 }}>
          <li>Installation is estimated to take <strong>{p.installDays || '[X]'}</strong> to complete.</li>
          <li>All installations will be scheduled and coordinated with designated on mountain contact.</li>
          <li>Each Capture Point will be mounted, aligned, and tested on-site before sign-off.</li>
          <li>YULLR will provide full system commissioning and staff orientation prior to the start of the season.</li>
          {installNotesArr.map((n: string, i: number) => <li key={i}>{n}</li>)}
        </ul>

        {/* 4. Site Requirements */}
        <PreviewH2>4. Site Requirements</PreviewH2>
        <p style={pStyle}>The following requirements must be in place at each designated location prior to the installation date. Unless otherwise agreed in writing.</p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Location</Th>
              <Th>Requirement</Th>
              <Th>Details</Th>
              <Th>Responsibility</Th>
            </tr>
          </thead>
          <tbody>
            {(p.requirements || []).map((r: any, i: number) => (
              <tr key={r.id} style={i % 2 === 1 ? evenRow : {}}>
                <td style={td}>{r.location}</td>
                <td style={td}>{r.requirement}</td>
                <td style={td}>{r.details}</td>
                <td style={td}>{r.responsibility}</td>
              </tr>
            ))}
            {(p.requirements || []).length === 0 && (
              <tr><td style={{ ...td, color: '#aaa' }} colSpan={4}>No site requirements specified.</td></tr>
            )}
          </tbody>
        </table>

        {/* 5. YULLR Subscriptions */}
        <PreviewH2>5. YULLR Subscriptions</PreviewH2>
        <p style={pStyle}>Skiers and riders at {p.mountainName} can purchase YULLR subscriptions to receive their footage. The following subscription types are available at published rates:</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 10 }}>
          {[
            { name: 'Day Pass', price: '$20', scope: '1 Mountain · 1 Day', desc: `Access to all YULLR footage captured at ${p.mountainName} for a single visit day.` },
            { name: 'Mountain Pass', price: '$150', scope: '1 Mountain · Full Season', desc: `Unlimited footage access at ${p.mountainName} for the entire ski season.` },
            { name: 'Season Pass', price: '$200', scope: 'All YULLR Mountains · Full Season', desc: `Unlimited footage access across all YULLR-enabled mountains for the full season.` },
          ].map(s => (
            <div key={s.name} style={{ border: '1px solid #ffd5cc', borderRadius: 8, padding: 16, textAlign: 'center' }}>
              <h3 style={{ fontSize: 13, color: '#FF5C39', marginBottom: 4 }}>{s.name}</h3>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>{s.price}</div>
              <div style={{ fontSize: 11, color: '#777', marginBottom: 6 }}>{s.scope}</div>
              <p style={{ fontSize: 11.5, color: '#555', textAlign: 'left' }}>{s.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ background: '#fff3f0', border: '2px solid #FF5C39', borderRadius: 8, padding: '14px 18px', marginTop: 14 }}>
          <h3 style={{ color: '#FF5C39', fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Bulk Purchase Program</h3>
          <ul style={{ listStyle: 'none', fontSize: 12.5, color: '#333', lineHeight: 2 }}>
            {[
              'A 50% discount applies to all bulk purchases of 25 or more passes of any type.',
              'Bulk passes may be resold up to the published retail rate.',
              'Bulk passes are non-refundable and valid for the current season only.',
              'Additional bulk pass purchases after the initial order must be made in increments of 25.',
            ].map((item, i) => (
              <li key={i} style={{ paddingLeft: 14, position: 'relative' }}>
                <span style={{ color: '#FF5C39', fontWeight: 700, position: 'absolute', left: 0 }}>-</span>{item}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ background: '#f0fdf4', border: '2px solid #22c55e', borderRadius: 8, padding: '14px 18px', marginTop: 12 }}>
          <h3 style={{ color: '#15803d', fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Revenue Share — YULLR.COM Sales</h3>
          <p style={{ color: '#166534', fontSize: 12.5, lineHeight: 1.8 }}>
            {p.mountainName} will receive a <strong>15% profit share</strong> on all pass purchases completed through YULLR.COM that are attributable to {p.mountainName}. This includes all sales tracked through referral links, promo codes, QR codes, on-mountain signage, and any other trackable attribution method. Revenue share payments will be calculated per season and remitted within <strong>30 days</strong> of the end of the season, accompanied by a detailed sales report.
          </p>
        </div>

        {/* 6. Final Quote */}
        <PreviewH2>6. Final Quote</PreviewH2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th right>Qty</Th>
              <Th right>Unit Price</Th>
              <Th right>Amount</Th>
            </tr>
          </thead>
          <tbody>
            <tr style={sectionRow}>
              <td colSpan={4} style={{ ...td, fontWeight: 600, color: '#FF5C39', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 12px', background: '#fff3f0' }}>Hardware &amp; Installation</td>
            </tr>
            {(p.trails || []).filter((t: any) => trailTotal(t) > 0).map((t: any) => (
              <tr key={t.id}>
                <td style={{ ...td, paddingLeft: 24 }}>{t.name || '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{t.capturePoints}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(parseAmt(t.unitPrice))}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(trailTotal(t))}</td>
              </tr>
            ))}
            {parseAmt(p.integrationFee) > 0 && (
              <tr><td style={td}>Integration Fee</td><td style={{ ...td, textAlign: 'right' }}>—</td><td style={{ ...td, textAlign: 'right' }}>—</td><td style={{ ...td, textAlign: 'right' }}>{fmtMoney(parseAmt(p.integrationFee))}</td></tr>
            )}
            {parseAmt(p.installFee) > 0 && (
              <tr><td style={td}>Installation &amp; Commissioning</td><td style={{ ...td, textAlign: 'right' }}>—</td><td style={{ ...td, textAlign: 'right' }}>—</td><td style={{ ...td, textAlign: 'right' }}>{fmtMoney(parseAmt(p.installFee))}</td></tr>
            )}
            {parseAmt(p.miscFee) > 0 && (
              <tr><td style={td}>Miscellaneous / Travel</td><td style={{ ...td, textAlign: 'right' }}>—</td><td style={{ ...td, textAlign: 'right' }}>—</td><td style={{ ...td, textAlign: 'right' }}>{fmtMoney(parseAmt(p.miscFee))}</td></tr>
            )}
            <tr style={subtotalRow}>
              <td colSpan={3} style={{ ...td, paddingLeft: 12 }}>Hardware &amp; Installation Total</td>
              <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(hwTotal)}</td>
            </tr>
            {bulkSubtotal > 0 && (
              <>
                <tr><td colSpan={4} style={{ background: '#fff', border: 'none', padding: 6 }}>&nbsp;</td></tr>
                <tr style={sectionRow}>
                  <td colSpan={4} style={{ ...td, fontWeight: 600, color: '#FF5C39', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 12px', background: '#fff3f0' }}>Annual Bulk Subscriptions (Optional)</td>
                </tr>
                {(p.bulkRows || []).filter((b: any) => bulkTotal(b) > 0).map((b: any) => (
                  <tr key={b.id}>
                    <td style={{ ...td, paddingLeft: 24 }}>{b.passType}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{b.qty}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(parseAmt(b.unitPrice))}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(bulkTotal(b))}</td>
                  </tr>
                ))}
                <tr style={subtotalRow}>
                  <td colSpan={3} style={{ ...td, paddingLeft: 12 }}>Annual Bulk Subscriptions Total</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(bulkSubtotal)}</td>
                </tr>
              </>
            )}
            {grandTotal > 0 && (
              <tr style={totalRow}>
                <td colSpan={3} style={{ ...td, paddingLeft: 12, fontWeight: 700, color: '#1a1a1a', fontSize: 13 }}>Grand Total</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#FF5C39', fontSize: 14 }}>{fmtMoney(grandTotal)}</td>
              </tr>
            )}
          </tbody>
        </table>
        {p.paymentTerms && (
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '10px 14px', marginTop: 10, fontSize: 12, color: '#78350f' }}>
            <strong style={{ display: 'block', marginBottom: 3 }}>Payment Terms</strong>
            {p.paymentTerms}
          </div>
        )}

        {/* 7. Terms */}
        <PreviewH2>7. Terms</PreviewH2>
        <ol style={{ listStyle: 'none', counterReset: 'terms' } as React.CSSProperties}>
          {[
            'This proposal is valid for 30 days from the date of issue. After this period, pricing may be subject to change.',
            'Acceptance of this proposal constitutes agreement to execute the Customer Agreement and Order Form within 30 days.',
            'All hardware remains the property of YULLR.',
            'Installation dates are subject to availability and will be confirmed upon receipt of deposit.',
            'YULLR is not responsible for delays caused by site conditions that do not meet the requirements outlined in Section 4.',
            'Subscription and pass pricing is subject to change at the start of each new ski season.',
            'An annual maintenance fee of $250.00 will apply to each Capture Point starting in year 2.',
            'The YULLR Customer Agreement is for a five (5) year Initial Term.',
            ...extraTermsArr,
          ].map((term, i) => (
            <li key={i} style={{ counterIncrement: 'terms', padding: '7px 0 7px 26px', position: 'relative', borderBottom: '1px solid #f0f0f0', fontSize: 12.5, lineHeight: 1.6, color: '#444' }}>
              <span style={{ position: 'absolute', left: 0, fontWeight: 700, color: '#FF5C39' }}>{i + 1}.</span>
              {term}
            </li>
          ))}
        </ol>

        {/* ── Signatures ── */}
        <div style={{ marginTop: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 4, height: 18, background: '#FF5C39', borderRadius: 2 }} />
            <h2 style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: 0.6 }}>Signatures</h2>
          </div>

          {bothSigned ? (
            /* Both signed — display executed signature blocks */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Client */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '20px 24px' }}>
                <div style={{ fontSize: 11, color: '#6a7282', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>
                  Accepted by {displayClientName}
                </div>
                <div style={{ borderTop: '2px solid #1a1a1a', paddingTop: 8, marginBottom: 6 }}>
                  {record.clientSignature?.signatureImage
                    ? <img src={record.clientSignature.signatureImage} alt="Signature" style={{ maxHeight: 60, maxWidth: '100%', display: 'block', marginBottom: 4 }} />
                    : <p style={{ fontSize: 18, color: '#1a1a1a', fontWeight: 600, margin: 0 }}>{record.clientSignature?.name}</p>
                  }
                  <p style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 600, margin: '4px 0 0' }}>{record.clientSignature?.name}</p>
                  {record.clientSignature?.title && (
                    <p style={{ fontSize: 12, color: '#555', margin: '2px 0 0' }}>{record.clientSignature.title}</p>
                  )}
                </div>
                <p style={{ fontSize: 11, color: '#6a7282', margin: 0 }}>
                  Signed {new Date(record.clientSignature!.signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              {/* YULLR */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '20px 24px' }}>
                <div style={{ fontSize: 11, color: '#6a7282', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>
                  Authorized by YULLR, Inc.
                </div>
                <div style={{ borderTop: '2px solid #1a1a1a', paddingTop: 8, marginBottom: 6 }}>
                  <p style={{ fontSize: 18, color: '#1a1a1a', fontWeight: 600, margin: 0 }}>
                    {record.yullrSignature?.name}
                  </p>
                </div>
                <p style={{ fontSize: 11, color: '#6a7282', margin: 0 }}>
                  Signed {new Date(record.yullrSignature!.signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>
          ) : (
            /* Unsigned — show YULLR status + client signing form */
            <>
              {/* YULLR status */}
              <div style={{ background: yullrSigned ? '#f0fdf4' : '#f9f9f9', border: `1px solid ${yullrSigned ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: yullrSigned ? 10 : 0 }}>
                  <span style={{ fontSize: 11, color: '#6a7282', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
                    Authorized by YULLR, Inc.
                  </span>
                  {yullrSigned
                    ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#22c55e', fontSize: 12, fontWeight: 600 }}>✓ Signed</span>
                    : <span style={{ color: '#d97706', fontSize: 12, fontWeight: 600 }}>Pending</span>
                  }
                </div>
                {yullrSigned && (
                  <div>
                    <p style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a', margin: '8px 0 2px' }}>{record.yullrSignature!.name}</p>
                    <p style={{ fontSize: 11, color: '#6a7282', margin: 0 }}>
                      Signed {new Date(record.yullrSignature!.signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                )}
              </div>

              {/* Client signing form */}
              {!clientSigned ? (
                <div style={{ background: '#fff', border: '2px solid #FF5C39', borderRadius: 12, padding: '28px 32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <PenLine size={20} color="#FF5C39" />
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Sign this Proposal</h3>
                  </div>
                  <p style={{ fontSize: 13, color: '#555', lineHeight: 1.7, marginBottom: 20 }}>
                    By signing below, you confirm on behalf of <strong>{displayClientName}</strong> that you have read and agree to the terms of this proposal.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>
                        Full Name <span style={{ color: '#FF5C39' }}>*</span>
                      </label>
                      <input
                        style={{ width: '100%', background: '#f3f3f5', border: '1.5px solid transparent', borderRadius: 8, padding: '10px 12px', fontSize: 15, color: '#1a1a1a', outline: 'none', boxSizing: 'border-box' }}
                        placeholder="Your full legal name"
                        value={clientName}
                        onChange={e => setClientName(e.target.value)}
                        onFocus={e => (e.target.style.borderColor = '#FF5C39')}
                        onBlur={e => (e.target.style.borderColor = 'transparent')}
                        autoComplete="name"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>
                        Title / Role <span style={{ color: '#FF5C39' }}>*</span>
                      </label>
                      <input
                        style={{ width: '100%', background: '#f3f3f5', border: '1.5px solid transparent', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#1a1a1a', outline: 'none', boxSizing: 'border-box' }}
                        placeholder="e.g. General Manager"
                        value={clientTitle}
                        onChange={e => setClientTitle(e.target.value)}
                        onFocus={e => (e.target.style.borderColor = '#FF5C39')}
                        onBlur={e => (e.target.style.borderColor = 'transparent')}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>
                      Legal Entity Name <span style={{ color: '#FF5C39' }}>*</span>
                    </label>
                    <input
                      style={{ width: '100%', background: '#f3f3f5', border: '1.5px solid transparent', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#1a1a1a', outline: 'none', boxSizing: 'border-box' }}
                      placeholder="e.g. Whistler Mountain Resort Ltd."
                      value={clientLegalEntity}
                      onChange={e => setClientLegalEntity(e.target.value)}
                      onFocus={e => (e.target.style.borderColor = '#FF5C39')}
                      onBlur={e => (e.target.style.borderColor = 'transparent')}
                    />
                  </div>

                  {/* Drawn signature */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>
                      Signature <span style={{ color: '#FF5C39' }}>*</span>
                    </label>
                    <SignaturePad
                      ref={sigPadRef}
                      height={140}
                      onChange={isEmpty => setSigEmpty(isEmpty)}
                    />
                  </div>

                  {/* Agreement checkbox */}
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 20, userSelect: 'none' }}>
                    <div
                      onClick={() => setAgreed(!agreed)}
                      style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${agreed ? '#FF5C39' : '#d1d5db'}`, background: agreed ? '#FF5C39' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, cursor: 'pointer', transition: 'all 0.15s' }}
                    >
                      {agreed && (
                        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                          <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 13, color: '#444', lineHeight: 1.65 }} onClick={() => setAgreed(!agreed)}>
                      I agree to the terms of this proposal on behalf of <strong style={{ color: '#1a1a1a' }}>{displayClientName}</strong> and understand this constitutes a binding agreement upon execution by both parties.
                    </span>
                  </label>

                  {submitError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff3f0', border: '1px solid #ffd5cc', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                      <AlertCircle size={14} color="#FF5C39" />
                      <span style={{ fontSize: 13, color: '#FF5C39' }}>{submitError}</span>
                    </div>
                  )}

                  <button
                    onClick={handleSign}
                    disabled={submitting}
                    style={{ width: '100%', background: submitting ? '#ffaa94' : '#FF5C39', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 20px', fontSize: 15, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    {submitting ? (
                      <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Submitting…</>
                    ) : (
                      <><PenLine size={17} /> Sign &amp; Accept Proposal</>
                    )}
                  </button>
                </div>
              ) : (
                /* Just signed — success state */
                <div style={{ background: '#f0fdf4', border: '2px solid #22c55e', borderRadius: 12, padding: '28px 32px', textAlign: 'center' }}>
                  <CheckCircle size={40} color="#22c55e" style={{ margin: '0 auto 12px' }} />
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#166534', marginBottom: 6 }}>Proposal Signed!</h3>
                  <p style={{ fontSize: 14, color: '#166534', margin: '0 0 16px' }}>
                    Thank you, <strong>{clientName}</strong>. Your signature has been recorded.
                  </p>
                  <div style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: 8, padding: '14px 20px', display: 'inline-block', textAlign: 'left', minWidth: 200 }}>
                    {capturedSigUrl && (
                      <img src={capturedSigUrl} alt="Your signature" style={{ maxHeight: 56, maxWidth: '100%', display: 'block', marginBottom: 8 }} />
                    )}
                    <p style={{ fontSize: 13, color: '#555', margin: 0 }}>Signed as: <strong>{clientName}</strong>{clientTitle && ` · ${clientTitle}`}</p>
                    <p style={{ fontSize: 12, color: '#6a7282', margin: '4px 0 0' }}>
                      {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {!yullrSigned && (
                    <p style={{ fontSize: 12, color: '#6a7282', marginTop: 14 }}>YULLR will countersign and send you a copy of the fully executed agreement.</p>
                  )}
                  {/* Customer Agreement CTA */}
                  <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #bbf7d0' }}>
                    <p style={{ fontSize: 12.5, color: '#166534', fontWeight: 600, marginBottom: 8 }}>
                      Next Step: Review &amp; Sign Customer Agreement
                    </p>
                    {caToken ? (
                      <>
                        <p style={{ fontSize: 12, color: '#6a7282', marginBottom: 14 }}>
                          Your Customer Agreement is ready. Click below to review and sign the formal service contract.
                        </p>
                        <a
                          href={`${window.location.origin}/agreement-sign/${caToken}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 7,
                            background: '#1D2930',
                            color: '#fff',
                            borderRadius: 10,
                            padding: '11px 18px',
                            fontSize: 13,
                            fontWeight: 600,
                            textDecoration: 'none',
                            width: '100%',
                            justifyContent: 'center',
                            boxSizing: 'border-box',
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                          Review &amp; Sign Customer Agreement →
                        </a>
                      </>
                    ) : (
                      <p style={{ fontSize: 12, color: '#6a7282' }}>
                        Your YULLR representative will send you a link to sign the Customer Agreement — the formal service contract for your installation.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
          YULLR, Inc. &nbsp;|&nbsp; Confidential Proposal &nbsp;|&nbsp; Proposal # {p.proposalNumber}
        </div>
      </div>

      {/* Spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}