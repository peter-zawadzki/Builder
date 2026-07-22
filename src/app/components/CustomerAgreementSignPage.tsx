import React, { Fragment, useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { CheckCircle, AlertCircle, PenLine, Printer } from 'lucide-react';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import { CA_INTRO_PARAGRAPHS, CA_BODY_PARAGRAPHS } from '../data/customerAgreementText';
import { renderTemplate } from '../utils/templateRenderer';

// Falls back to the built-in default (same shape as DataContext's
// DEFAULT_AGREEMENT_TEMPLATE, without the {{splice:parties}} token since
// this page has never rendered party info) until the admin-editable
// template loads from the public /template endpoint.
const FALLBACK_AGREEMENT_TEMPLATE = [...CA_INTRO_PARAGRAPHS, ...CA_BODY_PARAGRAPHS].join('\n\n');

// Public — token-authenticated, no Clerk session (server/routes/agreementPublicSign.ts).
const API_BASE = '/api/public/agreement-sign';

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
  'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
  'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
  'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
  'Wisconsin','Wyoming',
];

const ENTITY_TYPES = ['C-Corp', 'S-Corp', 'LLC', 'LLP', 'Sole Proprietorship', 'Non-Profit', 'Other'];

interface CAFormData {
  yullrEmail?: string;
  customerLegalName?: string;
  entityType?: string;
  stateOfFormation?: string;
  authorizedSignatory?: string;
  addressForNotices?: string;
  emailForNotices?: string;
  facilityName?: string;
  facilityLocation?: string;
  effectiveDate?: string;
}

interface AgreementRecord {
  id: string;
  mountainId: string;
  formData: CAFormData;
  clientSignature: { name: string; title: string; signedAt: string; signatureImage?: string } | null;
  yullrSignature: { name: string; signedAt: string; signatureImage?: string } | null;
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const INP: React.CSSProperties = {
  width: '100%', border: '1px solid rgba(0,0,0,0.14)', borderRadius: 7,
  padding: '10px 12px', fontSize: 14, color: '#1a1a1a', outline: 'none',
  boxSizing: 'border-box', background: '#fff', fontFamily: 'Inter, sans-serif',
};
const INP_PREFILLED: React.CSSProperties = { ...INP, background: '#f9f9fb', color: '#374151', border: '1px solid rgba(0,0,0,0.09)' };
const LBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, fontFamily: 'Inter, sans-serif' };
const REQUIRED_DOT = <span style={{ color: '#FF5C39' }}> *</span>;

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid #f3f3f5', fontFamily: 'Inter, sans-serif' }}>
      <span style={{ fontSize: 12, color: '#aaa', width: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>{value || '—'}</span>
    </div>
  );
}

export function CustomerAgreementSignPage() {
  const { token } = useParams<{ token: string }>();

  const [record, setRecord] = useState<AgreementRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [agreementTemplate, setAgreementTemplate] = useState(FALLBACK_AGREEMENT_TEMPLATE);
  const [hasTechnicalContact, setHasTechnicalContact] = useState(false);
  const [hasPreferredInstallWindows, setHasPreferredInstallWindows] = useState(false);

  const [customerLegalName, setCustomerLegalName] = useState('');
  const [entityType, setEntityType] = useState('LLC');
  const [stateOfFormation, setStateOfFormation] = useState('');
  const [authorizedSignatory, setAuthorizedSignatory] = useState('');
  const [addressForNotices, setAddressForNotices] = useState('');
  const [emailForNotices, setEmailForNotices] = useState('');

  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const sigPadRef = useRef<SignaturePadHandle>(null);
  const [sigEmpty, setSigEmpty] = useState(true);
  const [capturedSigUrl, setCapturedSigUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/template`)
      .then(r => r.json())
      .then((data: any) => { if (typeof data?.agreementTemplate === 'string' && data.agreementTemplate) setAgreementTemplate(data.agreementTemplate); })
      .catch(() => { /* keep fallback */ });
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/${token}`)
      .then(r => r.json())
      .then((data: any) => {
        if (data.error) { setError(data.error); return; }
        const rec = data.agreement as AgreementRecord;
        setRecord(rec);
        setHasTechnicalContact(!!data.hasTechnicalContact);
        setHasPreferredInstallWindows(!!data.hasPreferredInstallWindows);
        const fd = rec.formData || {};
        setCustomerLegalName(fd.customerLegalName || '');
        setEntityType(ENTITY_TYPES.includes(fd.entityType || '') ? fd.entityType! : 'LLC');
        setStateOfFormation(fd.stateOfFormation || '');
        setAuthorizedSignatory(fd.authorizedSignatory || '');
        setAddressForNotices(fd.addressForNotices || '');
        setEmailForNotices(fd.emailForNotices || '');
        if (rec.clientSignature) {
          setSubmitted(true);
          setSignerName(rec.clientSignature.name);
          setSignerTitle(rec.clientSignature.title || '');
        }
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!token) return;
    if (!customerLegalName.trim()) { setSubmitError('Please enter your Legal Entity Name.'); return; }
    if (!signerName.trim()) { setSubmitError('Please enter your full legal name.'); return; }
    if (!signerTitle.trim()) { setSubmitError('Please enter your title or role.'); return; }
    if (sigEmpty) { setSubmitError('Please draw your signature in the box above.'); return; }
    if (!agreed) { setSubmitError('Please check the agreement box to proceed.'); return; }
    const signatureImage = sigPadRef.current?.getDataURL() ?? null;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE}/${token}/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: signerName.trim(),
          title: signerTitle.trim(),
          signatureImage,
          formData: {
            customerLegalName: customerLegalName.trim(),
            entityType,
            stateOfFormation,
            authorizedSignatory: authorizedSignatory.trim(),
            addressForNotices: addressForNotices.trim(),
            emailForNotices: emailForNotices.trim(),
          },
        }),
      });
      const data = await res.json() as any;
      if (!res.ok || data.error) {
        if (res.status === 409) { setSubmitted(true); return; }
        throw new Error(data.error || 'Failed to submit signature');
      }
      if (signatureImage) setCapturedSigUrl(signatureImage);
      setSubmitted(true);
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F2F3F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #FF5C39', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: '#6a7282', fontSize: 13, fontFamily: 'Inter, sans-serif' }}>Loading agreement…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div style={{ minHeight: '100vh', background: '#F2F3F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 2px 20px rgba(0,0,0,0.08)' }}>
          <AlertCircle size={40} color="#FF5C39" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', marginBottom: 8, fontFamily: 'Inter, sans-serif' }}>Agreement Not Found</h2>
          <p style={{ fontSize: 13, color: '#6a7282', fontFamily: 'Inter, sans-serif' }}>{error || 'This signing link may be invalid or expired. Please contact YULLR.'}</p>
        </div>
      </div>
    );
  }

  const fd = record.formData || {};
  const facilityName = fd.facilityName || 'Agreement';
  const facilityLocation = fd.facilityLocation || '';
  const effectiveDate = fd.effectiveDate || new Date().toISOString().split('T')[0];
  const yullrEmail = fd.yullrEmail || 'support@yullr.com';
  const yullrSigned = !!record.yullrSignature;

  // Same 4-step progress bar shown on the proposal signing page, carried
  // over here so the customer sees consistent progress across both public
  // pages. Reaching this page at all means the proposal was already signed.
  const progressBar = (() => {
    const steps = [
      { label: 'Sign Proposal', done: true },
      { label: 'Technical Contact', done: hasTechnicalContact },
      { label: 'Install Preferences', done: hasPreferredInstallWindows },
      { label: 'Sign Agreement', done: submitted },
    ];
    const nextIdx = steps.findIndex(s => !s.done);
    return (
      <div className="no-print" style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '16px 24px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'flex-start' }}>
          {steps.map((s, i) => (
            <Fragment key={s.label}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 84, flexShrink: 0 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: s.done ? '#22c55e' : i === nextIdx ? '#FF5C39' : '#e5e7eb',
                  color: s.done || i === nextIdx ? '#fff' : '#9ca3af',
                  fontSize: 11, fontWeight: 700,
                }}>
                  {s.done ? '✓' : i + 1}
                </div>
                <span style={{
                  marginTop: 6,
                  textAlign: 'center',
                  fontSize: 10.5,
                  lineHeight: 1.3,
                  fontWeight: s.done || i === nextIdx ? 600 : 400,
                  color: s.done ? '#166534' : i === nextIdx ? '#c2410c' : '#9ca3af',
                }}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 3, background: s.done ? '#22c55e' : '#e5e7eb', marginTop: 11 }} />
              )}
            </Fragment>
          ))}
        </div>
      </div>
    );
  })();

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#F2F3F5' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <img src="https://race.yullr.com/_assets/v11/8b719608599361ca2b1d142742df531a9af04c08.png" alt="YULLR" style={{ height: 34 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', color: '#22c55e', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 20, fontFamily: 'Inter, sans-serif' }}>
            <CheckCircle size={13} /> Signed
          </span>
        </div>
        {progressBar}
        <div style={{ maxWidth: 520, margin: '48px auto', padding: '0 20px' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '36px 32px', textAlign: 'center', boxShadow: '0 2px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ width: 68, height: 68, background: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle size={36} color="#22c55e" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 10, fontFamily: 'Inter, sans-serif' }}>Agreement Signed</h2>
            <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7, fontFamily: 'Inter, sans-serif' }}>
              Thank you, <strong>{record.clientSignature?.name || signerName}</strong>. Your signature on the Customer Agreement for <strong>{facilityName}</strong> has been recorded.
            </p>
            {(capturedSigUrl || record.clientSignature?.signatureImage) && (
              <div style={{ border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', background: '#fff', display: 'inline-block', marginTop: 10 }}>
                <img src={capturedSigUrl || record.clientSignature?.signatureImage!} alt="Your signature" style={{ maxHeight: 60, maxWidth: 260, display: 'block' }} />
              </div>
            )}
            {record.clientSignature?.signedAt && (
              <p style={{ fontSize: 12, color: '#aaa', marginTop: 10, fontFamily: 'Inter, sans-serif' }}>Signed {fmtDate(record.clientSignature.signedAt)}</p>
            )}
            <p style={{ fontSize: 13, color: '#6a7282', marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0', fontFamily: 'Inter, sans-serif' }}>
              {yullrSigned
                ? 'This agreement is now fully executed.'
                : 'YULLR will countersign shortly to complete the agreement.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const canSubmit = !submitting && customerLegalName.trim() && signerName.trim() && signerTitle.trim() && !sigEmpty && agreed;

  return (
    <div style={{ minHeight: '100vh', background: '#F2F3F5', fontFamily: 'Inter, sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, select:focus, textarea:focus { border-color: #FF5C39 !important; box-shadow: 0 0 0 3px rgba(255,92,57,0.12) !important; outline: none !important; }
        @media print {
          .no-print { display: none !important; }
          /* The Agreement Terms box is scrollable on screen so the page
             isn't a mile long, but that clips everything past the visible
             420px when printed — let it flow across pages instead. */
          .agreement-terms-scroll { max-height: none !important; overflow: visible !important; }
        }
      `}</style>

      <div className="no-print" style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <img src="https://race.yullr.com/_assets/v11/8b719608599361ca2b1d142742df531a9af04c08.png" alt="YULLR" style={{ height: 34 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {yullrSigned && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff3f0', color: '#FF5C39', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 20 }}>
              <CheckCircle size={13} /> Signed by YULLR
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
      {progressBar}

      <div style={{ maxWidth: 720, margin: '28px auto 60px', background: '#fff', boxShadow: '0 2px 20px rgba(0,0,0,0.10)', padding: '48px 52px' }}>

        <div style={{ borderBottom: '3px solid #FF5C39', paddingBottom: 22, marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#FF5C39', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 4 }}>Customer Agreement</p>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>{facilityName}</h1>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#555', lineHeight: 1.9 }}>
            <div><strong style={{ color: '#1a1a1a' }}>Date:</strong> {fmtDate(effectiveDate)}</div>
            <div><strong style={{ color: '#1a1a1a' }}>YULLR:</strong> YULLR, Inc.</div>
          </div>
        </div>

        {/* ── Party Information ── */}
        <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Party Information</h2>
        <div style={{ height: 2, background: '#f0f0f0', marginBottom: 20 }} />

        <ReadRow label="YULLR Company" value="YULLR, Inc." />
        <ReadRow label="YULLR Address" value="173 Tin Mountain Road, Jackson, NH 03846" />
        <ReadRow label="Email for Notices" value={yullrEmail} />

        <div style={{ marginTop: 24, marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: '#6a7282', lineHeight: 1.6 }}>Please review and complete the fields below for your organization.</p>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={LBL}>Legal Entity Name{REQUIRED_DOT}</label>
          <input style={customerLegalName ? INP_PREFILLED : INP} value={customerLegalName} onChange={e => setCustomerLegalName(e.target.value)} placeholder="Your full legal entity name (e.g. Peak Adventures LLC)" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={LBL}>Entity Type{REQUIRED_DOT}</label>
            <select style={INP} value={entityType} onChange={e => setEntityType(e.target.value)}>{ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
          </div>
          <div>
            <label style={LBL}>State of Formation{REQUIRED_DOT}</label>
            <select style={INP} value={stateOfFormation} onChange={e => setStateOfFormation(e.target.value)}>
              <option value="">Select state…</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={LBL}>Authorized Signatory{REQUIRED_DOT}</label>
          <input style={INP} value={authorizedSignatory} onChange={e => setAuthorizedSignatory(e.target.value)} placeholder="Full legal name of the person authorized to sign" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={LBL}>Address for Notices</label>
          <textarea style={{ ...INP, resize: 'none' } as React.CSSProperties} rows={3} value={addressForNotices} onChange={e => setAddressForNotices(e.target.value)} placeholder={'Street address\nCity, State ZIP'} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={LBL}>Email for Notices</label>
          <input style={INP} type="email" value={emailForNotices} onChange={e => setEmailForNotices(e.target.value)} placeholder="contact@yourorganization.com" />
        </div>

        <ReadRow label="Facility Name" value={facilityName} />
        <ReadRow label="Location" value={facilityLocation} />
        <ReadRow label="Effective Date" value={fmtDate(effectiveDate)} />


        {/* ── Full Agreement Text — on screen, no PDF download required ── */}
        <div style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Agreement Terms</h2>
          <div style={{ height: 2, background: '#f0f0f0', marginBottom: 16 }} />
          <div className="agreement-terms-scroll" style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 6 }}>
            {renderTemplate(agreementTemplate, { paragraphStyle: { fontSize: 12.5, color: '#374151', lineHeight: 1.7, marginBottom: 10 } })}
          </div>
        </div>

        {/* ── Signature Block ── */}
        <div style={{ marginTop: 40, borderTop: '3px solid #FF5C39', paddingTop: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>Customer Signature</h2>
          <p style={{ fontSize: 13, color: '#6a7282', lineHeight: 1.65, marginBottom: 20 }}>
            By signing below, you confirm that you are duly authorized to execute this Agreement on behalf
            of <strong style={{ color: '#1a1a1a' }}>{customerLegalName || 'your organization'}</strong>, and that you have read and agree to its terms.
          </p>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Draw Signature <span style={{ color: '#FF5C39' }}>*</span>
            </label>
            <SignaturePad ref={sigPadRef} height={150} onChange={isEmpty => setSigEmpty(isEmpty)} />
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20, padding: '14px 16px', background: '#f9f9fb', borderRadius: 8, border: '1px solid rgba(0,0,0,0.07)' }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2, accentColor: '#FF5C39', width: 16, height: 16, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>
              I have read and agree to all terms of the Customer Agreement above and represent that I am authorized to sign on behalf of{' '}
              <strong>{customerLegalName || 'my organization'}</strong>.
            </span>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div><label style={LBL}>Full Legal Name{REQUIRED_DOT}</label><input type="text" value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Your full legal name" style={INP} /></div>
            <div><label style={LBL}>Title / Role{REQUIRED_DOT}</label><input type="text" value={signerTitle} onChange={e => setSignerTitle(e.target.value)} placeholder="e.g. General Manager, CEO" style={INP} /></div>
          </div>

          {submitError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>{submitError}</div>
          )}

          <button onClick={handleSubmit} disabled={!canSubmit}
            style={{
              width: '100%', background: canSubmit ? '#FF5C39' : '#e5e7eb', color: canSubmit ? '#fff' : '#9ca3af',
              border: 'none', borderRadius: 10, padding: '15px 24px', fontSize: 15, fontWeight: 700,
              cursor: canSubmit ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'background 0.15s',
            }}>
            {submitting ? <><div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Submitting…</> : <><PenLine size={17} /> Sign Customer Agreement</>}
          </button>

          <p style={{ fontSize: 11.5, color: '#aaa', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
            This electronic signature is legally binding under the ESIGN Act and applicable e-signature laws.
          </p>
        </div>
      </div>
    </div>
  );
}
