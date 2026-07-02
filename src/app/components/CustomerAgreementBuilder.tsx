import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import type { TechAdmin } from '../context/DataContext';
import {
  ArrowLeft, Download, Send, Copy, CheckCircle, Clock, PenLine,
  RefreshCw, XCircle, Lock, AlertTriangle, ExternalLink, FileCheck, Plus, X, Edit2,
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import pdfUrl from '../../imports/YULLR_CUSTOMER_AGREEMENT_v10FF.pdf';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;
const API_HEADERS = { Authorization: `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' };

// ─── Types ────────────────────────────────────────────────────────────────────

interface CAFormData {
  yullrEmail: string;
  customerLegalName: string;
  entityType: string;
  stateOfFormation: string;
  authorizedSignatory: string;
  addressForNotices: string;
  emailForNotices: string;
  facilityName: string;
  facilityLocation: string;
  effectiveDate: string;
  technicalAdministrators: TechAdmin[];
}

interface CARecord {
  token: string;
  mountainId: string;
  createdAt: string;
  formData: CAFormData;
  yullrSignature: { name: string; signedAt: string; signatureImage?: string } | null;
  clientSignature: { name: string; title: string; signedAt: string; signatureImage?: string } | null;
}

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

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/** Build a clean CAFormData from raw server data (handles old schemas) + mountain fallbacks */
function buildForm(raw: any, mountain: any): CAFormData {
  return {
    yullrEmail:
      raw?.yullrEmail || 'support@yullr.com',
    customerLegalName:
      raw?.customerLegalName || raw?.clientName || raw?.legalEntity ||
      mountain?.legalEntity || mountain?.name || '',
    entityType:
      ENTITY_TYPES.includes(raw?.entityType) ? raw.entityType : 'LLC',
    stateOfFormation:
      raw?.stateOfFormation || raw?.stateCountry || '',
    authorizedSignatory:
      raw?.authorizedSignatory || '',
    addressForNotices:
      raw?.addressForNotices || raw?.billingAddress || raw?.clientAddress ||
      mountain?.billingAddress || mountain?.address || '',
    emailForNotices:
      raw?.emailForNotices || raw?.contactEmail || mountain?.email || '',
    facilityName:
      raw?.facilityName || raw?.mountainName || mountain?.name || '',
    facilityLocation:
      raw?.facilityLocation || mountain?.address || '',
    effectiveDate:
      raw?.effectiveDate || todayISO(),
    technicalAdministrators:
      Array.isArray(raw?.technicalAdministrators) && raw.technicalAdministrators.length > 0
        ? raw.technicalAdministrators
        : [{ id: crypto.randomUUID(), name: '', role: '', email: '', phone: '' }],
  };
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const INP = "w-full bg-white border border-[rgba(0,0,0,0.14)] rounded-[8px] px-3 py-2.5 text-[14px] text-[#0a0a0a] font-['Inter:Regular',sans-serif] outline-none focus:border-[#F95C39] focus:ring-2 focus:ring-[#F95C39]/20 transition placeholder-[#b0b8c1]";
const INP_RO = "w-full bg-[#f5f5f7] border border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-2.5 text-[14px] text-[#6a7282] font-['Inter:Regular',sans-serif]";
const LBL = "block text-[11px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282] uppercase tracking-wider mb-1";
const SECTION = 'bg-white rounded-[14px] border border-[rgba(0,0,0,0.08)] p-5 mb-4';
const SECTION_H = "text-[13px] font-['Inter:SemiBold',sans-serif] font-semibold text-[#0a0a0a] uppercase tracking-wider mb-4";
const SEC_LABEL = "text-[11px] font-['Inter:SemiBold',sans-serif] font-semibold text-[#F95C39] uppercase tracking-wider mb-3";

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Editable / Read-only field wrappers ──────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className={LBL}>{label}</label>
      {children}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomerAgreementBuilder() {
  const { mountainId } = useParams<{ mountainId: string }>();
  const navigate = useNavigate();
  const { getMountainById, updateMountain } = useData();
  const mountain = getMountainById(mountainId || '');

  const [form, setForm] = useState<CAFormData>(() => buildForm(null, mountain));

  const [caToken, setCaToken] = useState<string | null>(null);
  const [caRecord, setCaRecord] = useState<CARecord | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [yullrSignerName, setYullrSignerName] = useState('');
  const [yullrSigning, setYullrSigning] = useState(false);
  const yullrSigPadRef = useRef<SignaturePadHandle>(null);
  const [yullrSigEmpty, setYullrSigEmpty] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showDeleteAgreementModal, setShowDeleteAgreementModal] = useState(false);

  // Load existing CA on mount
  useEffect(() => {
    if (!mountainId) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/customer-agreements/status/${mountainId}`, { headers: API_HEADERS });
        const data = await res.json() as any;
        if (data.token && data.record) {
          setCaToken(data.token);
          setCaRecord(data.record as CARecord);
          setForm(buildForm(data.record.formData, mountain));
          // ── Sync tech admins to Mountain Info ──────────────────────────────
          const caAdmins = (data.record.formData?.technicalAdministrators || [])
            .filter((a: any) => a.name?.trim());
          if (caAdmins.length > 0 && mountainId) {
            updateMountain(mountainId, { technicalAdministrators: caAdmins });
          }
        } else {
          // No CA yet — pre-fill from mountain data
          setForm(buildForm(null, mountain));
        }
      } catch (e) {
        console.error('Error loading CA status:', e);
      } finally {
        setLoadingStatus(false);
      }
    })();
  }, [mountainId]);

  // ── Field setters ──────────────────────────────────────────────────────────
  const set = <K extends keyof CAFormData>(key: K, val: CAFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  // ── Tech admin helpers ──────────────────────────────────────────────────────
  const addAdmin = () => {
    setForm(prev => ({
      ...prev,
      technicalAdministrators: [
        ...prev.technicalAdministrators,
        { id: crypto.randomUUID(), name: '', role: '', email: '', phone: '' },
      ],
    }));
    setDirty(true);
  };

  const setAdmin = (i: number, field: keyof TechAdmin, val: string) => {
    setForm(prev => ({
      ...prev,
      technicalAdministrators: prev.technicalAdministrators.map((a, idx) =>
        idx === i ? { ...a, [field]: val } : a
      ),
    }));
    setDirty(true);
  };

  const removeAdmin = (i: number) => {
    setForm(prev => ({
      ...prev,
      technicalAdministrators: prev.technicalAdministrators.filter((_, idx) => idx !== i),
    }));
    setDirty(true);
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const createAgreement = async () => {
    if (!mountainId) return;
    if (form.technicalAdministrators.length === 0) {
      toast.error('At least one Technical Administrator is required'); return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/customer-agreements`, {
        method: 'POST', headers: API_HEADERS,
        body: JSON.stringify({ mountainId, formData: form }),
      });
      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to create');
      setCaToken(data.token);
      setCaRecord({ token: data.token, mountainId: mountainId!, createdAt: new Date().toISOString(), formData: form, yullrSignature: null, clientSignature: null });
      setDirty(false);
      toast.success('Agreement created — signing link is ready');
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setCreating(false);
    }
  };

  const saveForm = async () => {
    if (!caToken) return;
    if (form.technicalAdministrators.length === 0) {
      toast.error('At least one Technical Administrator is required'); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/customer-agreements/${caToken}/form`, {
        method: 'PUT', headers: API_HEADERS,
        body: JSON.stringify({ formData: form }),
      });
      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to save');
      setCaRecord(prev => prev ? { ...prev, formData: form } : prev);
      setDirty(false);
      toast.success('Agreement details saved');
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const refreshStatus = useCallback(async () => {
    if (!caToken) return;
    try {
      const res = await fetch(`${API_BASE}/customer-agreements/sign/${caToken}`, { headers: API_HEADERS });
      const data = await res.json() as any;
      if (res.ok && !data.error) setCaRecord(data as CARecord);
    } catch (e) { console.error('Refresh error:', e); }
  }, [caToken]);

  const signAsYullr = async () => {
    if (!caToken || !yullrSignerName.trim()) { toast.error('Enter your name first'); return; }
    if (yullrSigEmpty) { toast.error('Please draw your signature'); return; }

    setYullrSigning(true);
    try {
      const signatureImage = yullrSigPadRef.current?.getDataURL() ?? null;

      const res = await fetch(`${API_BASE}/customer-agreements/sign/${caToken}/yullr`, {
        method: 'POST', headers: API_HEADERS,
        body: JSON.stringify({ name: yullrSignerName.trim(), signatureImage }),
      });
      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to sign');
      setCaRecord(prev => prev ? { ...prev, yullrSignature: { name: yullrSignerName.trim(), signedAt: new Date().toISOString(), signatureImage: signatureImage || undefined } } : prev);
      toast.success('Signed as YULLR');

      // Check if both parties have now signed - if so, send PDF
      if (caRecord?.clientSignature && mountainId) {
        // TODO: Implement sendSignedAgreementPDF similar to proposals
        console.log('Both parties signed - PDF generation not yet implemented for agreements');
      }
    } catch (e: any) { toast.error(`Error: ${e.message}`); }
    finally { setYullrSigning(false); }
  };

  const clearSignatures = async () => {
    if (!caToken) return;
    try {
      const res = await fetch(`${API_BASE}/customer-agreements/sign/${caToken}/clear`, { method: 'POST', headers: API_HEADERS });
      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to clear');
      setCaRecord(prev => prev ? { ...prev, yullrSignature: null, clientSignature: null } : prev);
      setConfirmClear(false);
      toast.success('Signatures cleared — form is now editable');
    } catch (e: any) { toast.error(`Error: ${e.message}`); }
  };

  const deleteAgreement = async () => {
    if (!caToken) return;
    setShowDeleteAgreementModal(false);
    try {
      await fetch(`${API_BASE}/customer-agreements/${caToken}`, { method: 'DELETE', headers: API_HEADERS });
      setCaToken(null); setCaRecord(null); setDirty(false);
      setForm(buildForm(null, mountain));
      toast.success('Agreement deleted');
    } catch (e: any) { toast.error(`Error: ${e.message}`); }
  };

  const copyLink = () => {
    if (!caToken) return;
    const url = `${window.location.origin}/agreement-sign/${caToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const signingUrl = caToken ? `${window.location.origin}/agreement-sign/${caToken}` : null;
  const yullrSigned = !!(caRecord?.yullrSignature && caRecord.yullrSignature !== null);
  const clientSigned = !!(caRecord?.clientSignature && caRecord.clientSignature !== null);
  const bothSigned = yullrSigned && clientSigned;
  // LOCKED = only when BOTH parties have signed. Otherwise always editable.
  const locked = bothSigned;

  if (loadingStatus) {
    return (
      <div className="min-h-screen bg-[#F2F3F5] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#F95C39] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F3F5]">

      {/* ── Header ── */}
      <div className="bg-[#1D2930] px-4 pt-10 pb-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/mountains/${mountainId}/proposal`)} className="p-2 -ml-2 text-white/70 active:text-white">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-white/50 uppercase tracking-wider font-['Inter:Medium',sans-serif]">
              {mountain?.name || 'Mountain'}
            </p>
            <h1 className="text-[18px] font-['Inter:SemiBold',sans-serif] font-semibold text-white leading-tight truncate">
              Customer Agreement
            </h1>
          </div>
          {locked ? (
            <span className="flex items-center gap-1 bg-[#22c55e]/20 text-[#4ade80] text-[11px] font-['Inter:Medium',sans-serif] px-2.5 py-1 rounded-full flex-shrink-0">
              <CheckCircle size={11} /> Fully Executed
            </span>
          ) : (
            <span className="flex items-center gap-1 bg-white/10 text-white/60 text-[11px] font-['Inter:Medium',sans-serif] px-2.5 py-1 rounded-full flex-shrink-0">
              <Edit2 size={11} /> Editing
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 pb-8 max-w-2xl mx-auto">

        {/* ── Locked banner ── */}
        {locked && (
          <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-[14px] px-4 py-3 flex items-center gap-3 mb-4">
            <Lock size={14} className="text-[#c2410c] flex-shrink-0" />
            <p className="text-[#c2410c] text-[12px] font-['Inter:Regular',sans-serif] flex-1">
              Agreement is fully executed and locked. Clear signatures to make edits.
            </p>
            <button onClick={() => setConfirmClear(true)} className="text-[#c2410c] text-[11px] font-['Inter:SemiBold',sans-serif] underline flex-shrink-0">
              Clear
            </button>
          </div>
        )}

        {/* ── Fully executed banner ── */}
        {locked && (
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[14px] p-4 mb-4 flex items-start gap-3">
            <FileCheck size={20} className="text-[#22c55e] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[#15803d] font-['Inter:SemiBold',sans-serif] font-semibold text-[14px]">Customer Agreement fully executed</p>
              <p className="text-[#166534] text-[12px] font-['Inter:Regular',sans-serif] mt-0.5">Both parties have signed. This agreement is now legally binding.</p>
            </div>
          </div>
        )}

        {/* ── Download PDF ── */}
        <div className={SECTION}>
          <h2 className={SECTION_H}>Agreement Document</h2>
          <p className="text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif] mb-3">
            Download the Customer Agreement to review the full terms before signing.
          </p>
          <a
            href={pdfUrl as string}
            download="YULLR_Customer_Agreement.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-[#1D2930] text-white rounded-[10px] py-3 text-[13px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80"
          >
            <Download size={15} /> Download Customer Agreement (PDF)
          </a>
        </div>

        {/* ── Party Information ── */}
        <div className={SECTION}>
          <div className="flex items-start justify-between mb-4">
            <h2 className={SECTION_H} style={{ marginBottom: 0 }}>Party Information</h2>
            {caToken && !locked && (
              <button
                onClick={saveForm}
                disabled={saving || !dirty}
                className="flex items-center gap-1.5 bg-[#F95C39] text-white text-[12px] font-['Inter:Medium',sans-serif] px-3 py-1.5 rounded-[8px] active:opacity-80 disabled:opacity-40"
              >
                {saving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                {dirty ? 'Save Changes' : 'Saved'}
              </button>
            )}
          </div>

          {/* §1.1 YULLR */}
          <p className={SEC_LABEL}>§1.1 — YULLR</p>
          <Field label="YULLR Email for Notices">
            {locked
              ? <div className={INP_RO}>{form.yullrEmail || '—'}</div>
              : <input className={INP} value={form.yullrEmail} onChange={e => set('yullrEmail', e.target.value)} placeholder="support@yullr.com" />
            }
          </Field>

          {/* §1.2 Customer */}
          <p className={`${SEC_LABEL} mt-5`}>§1.2 — Customer</p>

          <Field label="Legal Name *">
            {locked
              ? <div className={INP_RO}>{form.customerLegalName || '—'}</div>
              : <input className={INP} value={form.customerLegalName} onChange={e => set('customerLegalName', e.target.value)} placeholder="Legal entity name" />
            }
          </Field>

          <Field label="Entity Type *">
            {locked
              ? <div className={INP_RO}>{form.entityType || '—'}</div>
              : (
                <select className={INP} value={form.entityType} onChange={e => set('entityType', e.target.value)}>
                  {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )
            }
          </Field>

          <Field label="State of Formation *">
            {locked
              ? <div className={INP_RO}>{form.stateOfFormation || '—'}</div>
              : (
                <select className={INP} value={form.stateOfFormation} onChange={e => set('stateOfFormation', e.target.value)}>
                  <option value="">Select state…</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )
            }
          </Field>

          <Field label="Authorized Signatory *">
            {locked
              ? <div className={INP_RO}>{form.authorizedSignatory || '—'}</div>
              : <input className={INP} value={form.authorizedSignatory} onChange={e => set('authorizedSignatory', e.target.value)} placeholder="Full legal name of authorized signer" />
            }
          </Field>

          <Field label="Address for Notices">
            {locked
              ? <div className={`${INP_RO} whitespace-pre-line`}>{form.addressForNotices || '—'}</div>
              : <textarea className={`${INP} resize-none`} rows={3} value={form.addressForNotices} onChange={e => set('addressForNotices', e.target.value)} placeholder={"Street address\nCity, State ZIP"} />
            }
          </Field>

          <Field label="Email for Notices">
            {locked
              ? <div className={INP_RO}>{form.emailForNotices || '—'}</div>
              : <input className={INP} type="email" value={form.emailForNotices} onChange={e => set('emailForNotices', e.target.value)} placeholder="contact@mountain.com" />
            }
          </Field>

          {/* §1.3 Facility */}
          <p className={`${SEC_LABEL} mt-5`}>§1.3 — Facility</p>

          <Field label="Primary Facility Name *">
            {locked
              ? <div className={INP_RO}>{form.facilityName || '—'}</div>
              : <input className={INP} value={form.facilityName} onChange={e => set('facilityName', e.target.value)} placeholder="Ski area / facility name" />
            }
          </Field>

          <Field label="Facility Location (City / State / Country) *">
            {locked
              ? <div className={INP_RO}>{form.facilityLocation || '—'}</div>
              : <input className={INP} value={form.facilityLocation} onChange={e => set('facilityLocation', e.target.value)} placeholder="e.g. Stowe, VT, USA" />
            }
          </Field>

          {/* §1.4 Effective Date */}
          <p className={`${SEC_LABEL} mt-5`}>§1.4 — Effective Date</p>
          <div>
            <label className={LBL}>Effective Date *</label>
            {locked
              ? <div className={INP_RO}>{form.effectiveDate ? fmtDate(form.effectiveDate) : '—'}</div>
              : <input className={INP} type="date" value={form.effectiveDate} onChange={e => set('effectiveDate', e.target.value)} />
            }
          </div>
        </div>

        {/* ── Technical Administrators ── */}
        <div className={SECTION}>
          <div className="mb-4">
            <h2 className={SECTION_H} style={{ marginBottom: 4 }}>Technical Administrator(s)</h2>
            <p className="text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif] leading-relaxed">
              Designate the individuals responsible for configuring camera field-of-view, positioning, and related technical settings at the Facility.
            </p>
          </div>

          {form.technicalAdministrators.length === 0 && (
            <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-[8px] px-3 py-2.5 mb-3 flex items-center gap-2">
              <AlertTriangle size={13} className="text-[#c2410c] flex-shrink-0" />
              <p className="text-[#c2410c] text-[12px] font-['Inter:Regular',sans-serif]">At least one Technical Administrator is required.</p>
            </div>
          )}

          <div className="space-y-3">
            {form.technicalAdministrators.map((admin, i) => (
              <div key={admin.id || i} className="border border-[rgba(0,0,0,0.1)] rounded-[10px] p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[12px] font-['Inter:SemiBold',sans-serif] font-semibold text-[#0a0a0a]">
                    Admin {i + 1}{admin.name ? ` — ${admin.name}` : ''}
                  </p>
                  {!locked && (
                    <button type="button" onClick={() => removeAdmin(i)} className="p-1.5 rounded-[6px] bg-[#fff0ee] active:bg-[#ffe0da]">
                      <X size={13} className="text-[#F95C39]" />
                    </button>
                  )}
                </div>
                {locked ? (
                  <div className="space-y-1">
                    <p className="text-[13px] text-[#0a0a0a]">{admin.name} — <span className="text-[#6a7282]">{admin.role}</span></p>
                    {admin.email && <p className="text-[12px] text-[#6a7282]">{admin.email}</p>}
                    {admin.phone && <p className="text-[12px] text-[#6a7282]">{admin.phone}</p>}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className={LBL}>Name *</label>
                        <input className={INP} value={admin.name} onChange={e => setAdmin(i, 'name', e.target.value)} placeholder="Full name" />
                      </div>
                      <div>
                        <label className={LBL}>Role *</label>
                        <input className={INP} value={admin.role} onChange={e => setAdmin(i, 'role', e.target.value)} placeholder="e.g. IT Manager" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={LBL}>Email *</label>
                        <input className={INP} type="email" value={admin.email} onChange={e => setAdmin(i, 'email', e.target.value)} placeholder="admin@mountain.com" />
                      </div>
                      <div>
                        <label className={LBL}>Phone</label>
                        <input className={INP} type="tel" value={admin.phone} onChange={e => setAdmin(i, 'phone', e.target.value)} placeholder="(000) 000-0000" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {!locked && (
            <button type="button" onClick={addAdmin}
              className="mt-3 w-full flex items-center justify-center gap-2 border border-dashed border-[rgba(0,0,0,0.18)] rounded-[10px] py-2.5 text-[13px] text-[#6a7282] font-['Inter:Medium',sans-serif] active:bg-[#f9f9f9]"
            >
              <Plus size={14} /> Add Another Administrator
            </button>
          )}
        </div>

        {/* ── Bottom save bar ── */}
        {!locked && (
          <div className={`${SECTION} border-[#F95C39]/30 bg-[#fff8f6]`}>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                {caToken
                  ? <p className="text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif]">Changes are not auto-saved. Tap Save to update the agreement.</p>
                  : <p className="text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif]">Fill in the details above, then create the agreement to generate a signing link.</p>
                }
              </div>
              {caToken ? (
                <button
                  onClick={saveForm}
                  disabled={saving}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-[#F95C39] text-white text-[13px] font-['Inter:Medium',sans-serif] px-4 py-2.5 rounded-[10px] active:opacity-80 disabled:opacity-60"
                >
                  {saving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                  Save Changes
                </button>
              ) : (
                <button
                  onClick={createAgreement}
                  disabled={creating || !form.customerLegalName.trim() || !form.facilityName.trim()}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-[#1D2930] text-white text-[13px] font-['Inter:Medium',sans-serif] px-4 py-2.5 rounded-[10px] active:opacity-80 disabled:opacity-60"
                >
                  {creating
                    ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating…</>
                    : <><Send size={14} /> Create Agreement</>
                  }
                </button>
              )}
            </div>
            {!form.customerLegalName.trim() && !caToken && (
              <p className="text-[11px] text-[#d97706] mt-2 font-['Inter:Regular',sans-serif]">Legal Name and Facility Name are required to create the agreement.</p>
            )}
          </div>
        )}

        {/* ── Signing Section ── */}
        <div className={SECTION}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={SECTION_H} style={{ marginBottom: 0 }}>Signatures</h2>
            {(yullrSigned || clientSigned) && !bothSigned && (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1 text-[11px] text-[#d97706] bg-[#fffbeb] border border-[#fde68a] px-2.5 py-1 rounded-full font-['Inter:Medium',sans-serif] active:opacity-70"
              >
                <XCircle size={11} /> Clear Signatures
              </button>
            )}
          </div>

          {/* Signing link - hide when both parties have signed */}
          {!bothSigned && (
            caToken ? (
              <div className="mb-4">
                <p className="text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif] mb-2">
                  Share this link with your customer to sign digitally.
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif] truncate min-w-0">
                    {signingUrl}
                  </div>
                  <button
                    onClick={copyLink}
                    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-[8px] text-[12px] font-['Inter:Medium',sans-serif] flex-shrink-0 transition-colors ${linkCopied ? 'bg-[#f0fdf4] text-[#22c55e]' : 'bg-[#1D2930] text-white active:opacity-80'}`}
                  >
                    {linkCopied ? <><CheckCircle size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
                  </button>
                  <a href={signingUrl!} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-[8px] bg-[#f3f3f5] text-[#6a7282] active:opacity-70 flex-shrink-0">
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            ) : (
              <div className="bg-[#f9f9f9] rounded-[10px] p-3 mb-4 text-center">
                <p className="text-[12px] text-[#9ca3af] font-['Inter:Regular',sans-serif]">
                  Create the agreement above to generate a customer signing link.
                </p>
              </div>
            )
          )}

          {/* Signature cards */}
          {caRecord && (
            bothSigned ? (
              /* Compact view when both parties have signed */
              <div className="bg-[#f0fdf4] border border-[#22c55e] rounded-[10px] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileCheck size={20} className="text-[#22c55e] flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-[#0a0a0a] font-['Inter:SemiBold',sans-serif] font-semibold text-[15px]">Agreement Fully Executed</p>
                    <p className="text-[#6a7282] text-[12px] font-['Inter:Regular',sans-serif]">Both parties have signed this customer agreement</p>
                  </div>
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#6a7282] font-['Inter:Regular',sans-serif]">YULLR</span>
                    <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif]">{caRecord.yullrSignature!.name} · {fmtDate(caRecord.yullrSignature!.signedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#6a7282] font-['Inter:Regular',sans-serif]">Customer</span>
                    <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif]">{caRecord.clientSignature!.name} · {fmtDate(caRecord.clientSignature!.signedAt)}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <a
                    href={pdfUrl as string}
                    download="YULLR_Customer_Agreement.pdf"
                    className="flex-1 flex items-center justify-center gap-2 bg-white border border-[#22c55e] text-[#22c55e] rounded-[8px] px-4 py-2.5 text-[13px] font-['Inter:Medium',sans-serif] active:opacity-80"
                  >
                    <Download size={15} />
                    Download Agreement
                  </a>
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="px-3 py-2.5 rounded-[8px] bg-[#fffbeb] border border-[#fde68a] text-[#d97706] text-[13px] active:opacity-70 flex-shrink-0"
                    title="Clear signatures to edit agreement"
                  >
                    <XCircle size={15} />
                  </button>
                </div>
              </div>
            ) : (
              /* Full signature cards when not yet both signed */
              <div className="space-y-3">
                {/* YULLR */}
                <div className={`rounded-[10px] border p-4 ${yullrSigned ? 'bg-[#f0fdf4] border-[#bbf7d0]' : 'bg-[#f9f9f9] border-[rgba(0,0,0,0.08)]'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12px] font-['Inter:SemiBold',sans-serif] font-semibold text-[#0a0a0a] uppercase tracking-wider">Your Signature (YULLR)</p>
                    {yullrSigned
                      ? <span className="flex items-center gap-1 text-[#22c55e] text-[11px]"><CheckCircle size={11} /> Signed</span>
                      : <span className="flex items-center gap-1 text-[#d97706] text-[11px]"><Clock size={11} /> Pending</span>}
                  </div>
                  {yullrSigned ? (
                    <div>
                      {(caRecord.yullrSignature as any)?.signatureImage && (
                        <div className="mb-2 p-2 bg-white border border-[#22c55e] rounded-[8px] inline-block">
                          <img src={(caRecord.yullrSignature as any).signatureImage} alt="YULLR signature" className="max-h-12 max-w-[200px]" />
                        </div>
                      )}
                      <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[15px]">{caRecord.yullrSignature!.name}</p>
                      <p className="text-[#6a7282] text-[12px] mt-0.5">YULLR, Inc. · {fmtDate(caRecord.yullrSignature!.signedAt)}</p>
                    </div>
                  ) : (
                    <div className="space-y-3 mt-1">
                      <div>
                        <input
                          className={`${INP}`}
                          placeholder="Your full name"
                          value={yullrSignerName}
                          onChange={e => setYullrSignerName(e.target.value)}
                        />
                      </div>
                      <div>
                        <SignaturePad
                          ref={yullrSigPadRef}
                          onChange={(isEmpty) => setYullrSigEmpty(isEmpty)}
                          height={120}
                        />
                      </div>
                      <button
                        onClick={signAsYullr}
                        disabled={yullrSigning || !yullrSignerName.trim() || yullrSigEmpty}
                        className="w-full flex items-center justify-center gap-2 bg-[#F95C39] text-white rounded-[8px] py-2.5 text-[13px] font-['Inter:Medium',sans-serif] active:opacity-80 disabled:opacity-50"
                      >
                        {yullrSigning ? (
                          <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing...</>
                        ) : (
                          <><PenLine size={15} /> Sign as YULLR</>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Client */}
                <div className={`rounded-[10px] border p-4 ${clientSigned ? 'bg-[#f0fdf4] border-[#bbf7d0]' : 'bg-[#f9f9f9] border-[rgba(0,0,0,0.08)]'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[12px] font-['Inter:SemiBold',sans-serif] font-semibold text-[#0a0a0a] uppercase tracking-wider">Customer Signature</p>
                    <div className="flex items-center gap-2">
                      <button onClick={refreshStatus} className="p-1 text-[#9ca3af] active:text-[#6a7282]" title="Refresh"><RefreshCw size={12} /></button>
                      {clientSigned
                        ? <span className="flex items-center gap-1 text-[#22c55e] text-[11px]"><CheckCircle size={11} /> Signed</span>
                        : <span className="flex items-center gap-1 text-[#d97706] text-[11px]"><Clock size={11} /> Awaiting</span>}
                    </div>
                  </div>
                  {clientSigned ? (
                    <div>
                      {(caRecord.clientSignature as any)?.signatureImage && (
                        <div className="mb-2 p-2 bg-white border border-[#bbf7d0] rounded-[8px] inline-block">
                          <img
                            src={(caRecord.clientSignature as any).signatureImage}
                            alt="Customer signature"
                            style={{ maxHeight: 52, maxWidth: 200, display: 'block' }}
                          />
                        </div>
                      )}
                      <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[15px]">{caRecord.clientSignature!.name}</p>
                      {caRecord.clientSignature!.title && <p className="text-[#6a7282] text-[12px]">{caRecord.clientSignature!.title}</p>}
                      <p className="text-[#6a7282] text-[12px] mt-0.5">{fmtDate(caRecord.clientSignature!.signedAt)}</p>
                    </div>
                  ) : (
                    <p className="text-[#9ca3af] text-[12px] font-['Inter:Regular',sans-serif]">
                      Waiting for customer to sign via the link above.
                    </p>
                  )}
                </div>
              </div>
            )
          )}

          {caToken && !bothSigned && (
            <button onClick={() => setShowDeleteAgreementModal(true)} className="mt-4 text-[11px] text-[#9ca3af] underline w-full text-center active:text-[#6a7282]">
              Delete this agreement and start over
            </button>
          )}
        </div>

      </div>

      {/* ── Clear Signatures Modal ── */}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-[16px] w-full max-w-sm shadow-2xl overflow-hidden mb-2">
            <div className="bg-[#fffbeb] px-6 pt-6 pb-4">
              <AlertTriangle size={24} className="text-[#d97706] mb-2" />
              <p className="text-[#0a0a0a] font-['Inter:SemiBold',sans-serif] font-semibold text-[16px]">Clear signatures?</p>
              <p className="text-[#6a7282] text-[13px] font-['Inter:Regular',sans-serif] mt-1">
                Both signatures will be removed. The agreement fields will become editable again.
              </p>
            </div>
            <div className="flex gap-3 px-6 py-4">
              <button onClick={() => setConfirmClear(false)} className="flex-1 py-2.5 rounded-[10px] border border-[rgba(0,0,0,0.12)] text-[#0a0a0a] text-[14px] font-['Inter:Medium',sans-serif] active:bg-[#f3f3f5]">
                Cancel
              </button>
              <button onClick={clearSignatures} className="flex-1 py-2.5 rounded-[10px] bg-[#d97706] text-white text-[14px] font-['Inter:Medium',sans-serif] active:opacity-80">
                Clear Signatures
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete agreement confirmation */}
      {showDeleteAgreementModal && (
        <DeleteConfirmModal
          title="Delete agreement?"
          description={
            <>
              This will permanently delete the customer agreement for{' '}
              <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                {mountain?.name || 'this property'}
              </span>
              . This cannot be undone.
            </>
          }
          onConfirm={deleteAgreement}
          onCancel={() => setShowDeleteAgreementModal(false)}
        />
      )}
    </div>
  );
}