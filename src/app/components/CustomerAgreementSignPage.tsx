import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { CheckCircle, AlertCircle, PenLine, Download, Plus, X, AlertTriangle } from 'lucide-react';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import pdfUrl from '../../imports/YULLR_CUSTOMER_AGREEMENT_v10FF.pdf';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;
const HEADERS = { Authorization: `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' };

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

interface TechAdmin {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
}

interface CAFormData {
  yullrEmail?: string;
  customerLegalName?: string;
  entityType?: string;
  stateOfFormation?: string;
  stateCountry?: string;
  authorizedSignatory?: string;
  addressForNotices?: string;
  billingAddress?: string;
  clientAddress?: string;
  emailForNotices?: string;
  contactEmail?: string;
  facilityName?: string;
  mountainName?: string;
  facilityLocation?: string;
  effectiveDate?: string;
  technicalAdministrators?: TechAdmin[];
}

interface CARecord {
  token: string;
  mountainId: string;
  createdAt: string;
  formData: CAFormData;
  yullrSignature: { name: string; signedAt: string } | null;
  clientSignature: { name: string; title: string; signedAt: string } | null;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function pick(fd: CAFormData, ...keys: (keyof CAFormData)[]): string {
  for (const k of keys) {
    const v = fd[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

// ── Style constants ───────────────────────────────────────────────────────────
const INP: React.CSSProperties = {
  width: '100%', border: '1px solid rgba(0,0,0,0.14)', borderRadius: 7,
  padding: '10px 12px', fontSize: 14, color: '#1a1a1a', outline: 'none',
  boxSizing: 'border-box', background: '#fff', fontFamily: 'Inter, sans-serif',
};
const INP_PREFILLED: React.CSSProperties = {
  ...INP, background: '#f9f9fb', color: '#374151', border: '1px solid rgba(0,0,0,0.09)',
};
const LBL: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#888',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5,
  fontFamily: 'Inter, sans-serif',
};
const REQUIRED_DOT = <span style={{ color: '#FF5C39' }}> *</span>;

function SectionH({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 14px' }}>
      <div style={{ width: 4, height: 16, background: '#FF5C39', borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: '#FF5C39', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: 'Inter, sans-serif' }}>
        {tag} — {children}
      </span>
    </div>
  );
}

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

  const [record, setRecord] = useState<CARecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // ── Customer-filled fields ──────────────────────────────────────────────────
  const [customerLegalName, setCustomerLegalName] = useState('');
  const [entityType, setEntityType] = useState('LLC');
  const [stateOfFormation, setStateOfFormation] = useState('');
  const [authorizedSignatory, setAuthorizedSignatory] = useState('');
  const [addressForNotices, setAddressForNotices] = useState('');
  const [emailForNotices, setEmailForNotices] = useState('');
  const [techAdmins, setTechAdmins] = useState<TechAdmin[]>([
    { id: crypto.randomUUID(), name: '', role: '', email: '', phone: '' },
  ]);

  // ── Signature fields ────────────────────────────────────────────────────────
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const sigPadRef = useRef<SignaturePadHandle>(null);
  const [sigEmpty, setSigEmpty] = useState(true);
  const [capturedSigUrl, setCapturedSigUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/customer-agreements/sign/${token}`, { headers: HEADERS })
      .then(r => r.json())
      .then((data: any) => {
        if (data.error) { setError(data.error); return; }
        const rec = data as CARecord;
        setRecord(rec);
        const fd = rec.formData || {};

        // Pre-fill all editable fields from stored formData (seeded from mountain DB)
        setCustomerLegalName(pick(fd, 'customerLegalName'));
        setEntityType(ENTITY_TYPES.includes(fd.entityType || '') ? fd.entityType! : 'LLC');
        setStateOfFormation(pick(fd, 'stateOfFormation', 'stateCountry'));
        setAuthorizedSignatory(pick(fd, 'authorizedSignatory'));
        setAddressForNotices(pick(fd, 'addressForNotices', 'billingAddress', 'clientAddress'));
        setEmailForNotices(pick(fd, 'emailForNotices', 'contactEmail'));

        if (Array.isArray(fd.technicalAdministrators) && fd.technicalAdministrators.length > 0) {
          setTechAdmins(fd.technicalAdministrators);
        }
        if (rec.clientSignature) {
          setSubmitted(true);
          setSignerName(rec.clientSignature.name);
          setSignerTitle(rec.clientSignature.title || '');
        }
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [token]);

  const addAdmin = () =>
    setTechAdmins(prev => [...prev, { id: crypto.randomUUID(), name: '', role: '', email: '', phone: '' }]);

  const removeAdmin = (i: number) =>
    setTechAdmins(prev => prev.filter((_, idx) => idx !== i));

  const setAdminField = (i: number, field: keyof TechAdmin, val: string) =>
    setTechAdmins(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a));

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
      // Save customer-filled data back to the agreement record
      const updatedFormData = {
        customerLegalName: customerLegalName.trim(),
        entityType,
        stateOfFormation,
        authorizedSignatory: authorizedSignatory.trim(),
        addressForNotices: addressForNotices.trim(),
        emailForNotices: emailForNotices.trim(),
        technicalAdministrators: techAdmins.filter(a => a.name.trim()),
      };
      await fetch(`${API_BASE}/customer-agreements/${token}/form`, {
        method: 'PUT', headers: HEADERS,
        body: JSON.stringify({ formData: updatedFormData }),
      });

      // Submit signature
      const res = await fetch(`${API_BASE}/customer-agreements/sign/${token}/client`, {
        method: 'POST', headers: HEADERS,
        body: JSON.stringify({ name: signerName.trim(), title: signerTitle.trim(), signatureImage }),
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

  // ── Loading ────────────────────────────────────────────────────────────────
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

  // ── Error ──────────────────────────────────────────────────────────────────
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
  const facilityName = pick(fd, 'facilityName', 'mountainName') || 'Agreement';
  const facilityLocation = pick(fd, 'facilityLocation', 'clientAddress');
  const effectiveDate = pick(fd, 'effectiveDate') || todayISO();
  const yullrEmail = pick(fd, 'yullrEmail') || 'support@yullr.com';
  const yullrSigned = !!record.yullrSignature;

  // ── Already signed — success screen ───────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#F2F3F5' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <img src="https://race.yullr.com/_assets/v11/8b719608599361ca2b1d142742df531a9af04c08.png" alt="YULLR" style={{ height: 34 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', color: '#22c55e', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 20, fontFamily: 'Inter, sans-serif' }}>
            <CheckCircle size={13} /> Signed
          </span>
        </div>
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
                <img
                  src={capturedSigUrl || record.clientSignature?.signatureImage!}
                  alt="Your signature"
                  style={{ maxHeight: 60, maxWidth: 260, display: 'block' }}
                />
              </div>
            )}
            {record.clientSignature?.signedAt && (
              <p style={{ fontSize: 12, color: '#aaa', marginTop: 10, fontFamily: 'Inter, sans-serif' }}>
                Signed {fmtDate(record.clientSignature.signedAt)}
              </p>
            )}
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 24, paddingTop: 20 }}>
              <a
                href={pdfUrl as string}
                download="YULLR_Customer_Agreement.pdf"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1a1a1a', color: '#fff', borderRadius: 10, padding: '11px 20px', fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}
              >
                <Download size={14} /> Download Agreement (PDF)
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canSubmit = !submitting && customerLegalName.trim() && signerName.trim() && signerTitle.trim() && !sigEmpty && agreed;

  return (
    <div style={{ minHeight: '100vh', background: '#F2F3F5', fontFamily: 'Inter, sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } input:focus, select:focus, textarea:focus { border-color: #FF5C39 !important; box-shadow: 0 0 0 3px rgba(255,92,57,0.12) !important; outline: none !important; }`}</style>

      {/* ── Top bar — matches proposal signing page ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <img
          src="https://race.yullr.com/_assets/v11/8b719608599361ca2b1d142742df531a9af04c08.png"
          alt="YULLR" style={{ height: 34 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        {yullrSigned && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff3f0', color: '#FF5C39', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 20 }}>
            <CheckCircle size={13} /> Signed by YULLR
          </span>
        )}
      </div>

      {/* ── Document wrapper — matches proposal layout ── */}
      <div style={{ maxWidth: 720, margin: '28px auto 60px', background: '#fff', boxShadow: '0 2px 20px rgba(0,0,0,0.10)', padding: '48px 52px' }}>

        {/* Document header — orange underline, same as proposal */}
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

        {/* Instructions banner */}
        <div style={{ background: '#fff8f5', border: '1px solid #ffd5cc', borderRadius: 8, padding: '12px 16px', marginBottom: 28, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AlertTriangle size={15} color="#FF5C39" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: '#c2410c', lineHeight: 1.6, margin: 0 }}>
            Please download the agreement for review, then complete your organization's details below before signing.
          </p>
        </div>

        {/* Download */}
        <a
          href={pdfUrl as string}
          download="YULLR_Customer_Agreement.pdf"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#1a1a1a', color: '#fff', borderRadius: 8, padding: '11px 20px', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginBottom: 32 }}
        >
          <Download size={14} /> Download Customer Agreement (PDF)
        </a>

        {/* ── Party Information ── */}
        <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Party Information</h2>
        <div style={{ height: 2, background: '#f0f0f0', marginBottom: 20 }} />

        {/* §1.1 YULLR — read only */}
        <SectionH tag="§1.1">YULLR (Pre-filled)</SectionH>
        <ReadRow label="Company" value="YULLR, Inc." />
        <ReadRow label="Address" value="173 Tin Mountain Road, Jackson, NH 03846" />
        <ReadRow label="Email for Notices" value={yullrEmail} />

        {/* §1.2 Customer — customer fills in */}
        <SectionH tag="§1.2">Your Organization</SectionH>
        <p style={{ fontSize: 13, color: '#6a7282', marginBottom: 16, lineHeight: 1.6 }}>
          Please review and complete the fields below for your organization.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={LBL}>Legal Entity Name{REQUIRED_DOT}</label>
          <input
            style={customerLegalName ? INP_PREFILLED : INP}
            value={customerLegalName}
            onChange={e => setCustomerLegalName(e.target.value)}
            placeholder="Your full legal entity name (e.g. Peak Adventures LLC)"
          />
          {customerLegalName && <p style={{ fontSize: 11, color: '#22c55e', marginTop: 4 }}>Auto-filled from your records — please verify</p>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={LBL}>Entity Type{REQUIRED_DOT}</label>
            <select style={INP} value={entityType} onChange={e => setEntityType(e.target.value)}>
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
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
          <input
            style={INP}
            value={authorizedSignatory}
            onChange={e => setAuthorizedSignatory(e.target.value)}
            placeholder="Full legal name of the person authorized to sign"
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={LBL}>Address for Notices</label>
          <textarea
            style={{ ...INP, resize: 'none' } as React.CSSProperties}
            rows={3}
            value={addressForNotices}
            onChange={e => setAddressForNotices(e.target.value)}
            placeholder={'Street address\nCity, State ZIP'}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={LBL}>Email for Notices</label>
          <input
            style={INP}
            type="email"
            value={emailForNotices}
            onChange={e => setEmailForNotices(e.target.value)}
            placeholder="contact@yourorganization.com"
          />
        </div>

        {/* §1.3 Facility — read only */}
        <SectionH tag="§1.3">Facility (Pre-filled)</SectionH>
        <ReadRow label="Facility Name" value={facilityName} />
        <ReadRow label="Location" value={facilityLocation} />

        {/* §1.4 Effective Date — read only */}
        <SectionH tag="§1.4">Effective Date (Pre-filled)</SectionH>
        <ReadRow label="Effective Date" value={fmtDate(effectiveDate)} />

        {/* ── Technical Administrators ── */}
        <div style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Technical Administrator(s)</h2>
          <div style={{ height: 2, background: '#f0f0f0', marginBottom: 16 }} />
          <p style={{ fontSize: 13, color: '#6a7282', lineHeight: 1.6, marginBottom: 20 }}>
            Designate the individual(s) at your facility who will be responsible for configuring camera field-of-view, positioning, and related technical settings. At least one is required.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {techAdmins.map((admin, i) => (
              <div key={admin.id || i} style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
                    Technical Administrator {i + 1}{admin.name ? ` — ${admin.name}` : ''}
                  </p>
                  {techAdmins.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAdmin(i)}
                      style={{ background: '#fff0ee', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#FF5C39', fontWeight: 600 }}
                    >
                      <X size={13} /> Remove
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={LBL}>Full Name{REQUIRED_DOT}</label>
                    <input style={INP} value={admin.name} onChange={e => setAdminField(i, 'name', e.target.value)} placeholder="Full name" />
                  </div>
                  <div>
                    <label style={LBL}>Role / Title{REQUIRED_DOT}</label>
                    <input style={INP} value={admin.role} onChange={e => setAdminField(i, 'role', e.target.value)} placeholder="e.g. IT Manager" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={LBL}>Email{REQUIRED_DOT}</label>
                    <input style={INP} type="email" value={admin.email} onChange={e => setAdminField(i, 'email', e.target.value)} placeholder="admin@facility.com" />
                  </div>
                  <div>
                    <label style={LBL}>Phone</label>
                    <input style={INP} type="tel" value={admin.phone} onChange={e => setAdminField(i, 'phone', e.target.value)} placeholder="(000) 000-0000" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addAdmin}
            style={{ marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px dashed rgba(0,0,0,0.16)', borderRadius: 10, padding: '11px 16px', fontSize: 13, color: '#6a7282', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}
          >
            <Plus size={14} /> Add Another Administrator
          </button>
        </div>

        {/* ── Signature Block ── */}
        <div style={{ marginTop: 40, borderTop: '3px solid #FF5C39', paddingTop: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>Customer Signature</h2>
          <p style={{ fontSize: 13, color: '#6a7282', lineHeight: 1.65, marginBottom: 20 }}>
            By signing below, you confirm that you are duly authorized to execute this Agreement on behalf
            of <strong style={{ color: '#1a1a1a' }}>{customerLegalName || 'your organization'}</strong>,
            and that you have read and agree to its terms.
          </p>

          {/* Drawn signature */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Draw Signature <span style={{ color: '#FF5C39' }}>*</span>
            </label>
            <SignaturePad
              ref={sigPadRef}
              height={150}
              onChange={isEmpty => setSigEmpty(isEmpty)}
            />
          </div>

          {/* Agreement checkbox */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20, padding: '14px 16px', background: '#f9f9fb', borderRadius: 8, border: '1px solid rgba(0,0,0,0.07)' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 2, accentColor: '#FF5C39', width: 16, height: 16, flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>
              I have read and agree to all terms of the{' '}
              <a href={pdfUrl as string} target="_blank" rel="noopener noreferrer" style={{ color: '#FF5C39', textDecoration: 'underline' }}>
                Customer Agreement
              </a>{' '}
              and represent that I am authorized to sign on behalf of{' '}
              <strong>{customerLegalName || 'my organization'}</strong>.
            </span>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={LBL}>Full Legal Name{REQUIRED_DOT}</label>
              <input
                type="text"
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="Your full legal name"
                style={INP}
              />
            </div>
            <div>
              <label style={LBL}>Title / Role{REQUIRED_DOT}</label>
              <input
                type="text"
                value={signerTitle}
                onChange={e => setSignerTitle(e.target.value)}
                placeholder="e.g. General Manager, CEO"
                style={INP}
              />
            </div>
          </div>

          {submitError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
              {submitError}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              width: '100%',
              background: canSubmit ? '#FF5C39' : '#e5e7eb',
              color: canSubmit ? '#fff' : '#9ca3af',
              border: 'none', borderRadius: 10, padding: '15px 24px',
              fontSize: 15, fontWeight: 700,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'background 0.15s',
            }}
          >
            {submitting
              ? <><div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Submitting…</>
              : <><PenLine size={17} /> Sign Customer Agreement</>}
          </button>

          <p style={{ fontSize: 11.5, color: '#aaa', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
            This electronic signature is legally binding under the ESIGN Act and applicable e-signature laws.
          </p>
        </div>

      </div>
    </div>
  );
}
