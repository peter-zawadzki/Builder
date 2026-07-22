import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import type { TechAdmin, CAFormData } from '../context/DataContext';
import {
  ArrowLeft, Copy, CheckCircle, Clock, PenLine,
  RefreshCw, XCircle, Lock, AlertTriangle, ExternalLink, FileCheck, FileText, Plus, X, Edit2, Archive, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import { buildPdfFromElement, savePdfToDocuments } from '../utils/pdfExport';
import { renderTemplate } from '../utils/templateRenderer';

// ─── Constants ────────────────────────────────────────────────────────────────

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

function buildForm(raw: any, mountain: any): CAFormData {
  return {
    yullrEmail: raw?.yullrEmail || 'support@yullr.com',
    customerLegalName: raw?.customerLegalName || mountain?.legalEntity || mountain?.name || '',
    entityType: ENTITY_TYPES.includes(raw?.entityType) ? raw.entityType : 'LLC',
    stateOfFormation: raw?.stateOfFormation || '',
    authorizedSignatory: raw?.authorizedSignatory || '',
    addressForNotices: raw?.addressForNotices || mountain?.billingAddress || mountain?.address || '',
    emailForNotices: raw?.emailForNotices || mountain?.email || '',
    facilityName: raw?.facilityName || mountain?.name || '',
    facilityLocation: raw?.facilityLocation || mountain?.address || '',
    effectiveDate: raw?.effectiveDate || todayISO(),
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
  const {
    getMountainById, addCustomerAgreement, updateCustomerAgreement,
    getCustomerAgreementByMountainId, countersignCustomerAgreement, refreshCustomerAgreement,
    agreementTemplate,
  } = useData();
  const mountain = getMountainById(mountainId || '');
  const agreement = mountainId ? getCustomerAgreementByMountainId(mountainId) : undefined;

  const [form, setForm] = useState<CAFormData>(() => buildForm(agreement?.formData, mountain));
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [yullrSignerName, setYullrSignerName] = useState('');
  const [yullrSigning, setYullrSigning] = useState(false);
  const yullrSigPadRef = useRef<SignaturePadHandle>(null);
  const [yullrSigEmpty, setYullrSigEmpty] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [confirmModal, setConfirmModal] = useState<'clearSigs' | 'archive' | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Re-sync the local form whenever the underlying agreement record changes
  // (e.g. after refresh picks up customer edits) — but not while the staff
  // member has unsaved local edits of their own.
  useEffect(() => {
    if (!dirty) setForm(buildForm(agreement?.formData, mountain));
  }, [agreement?.formData, mountain?.id]);

  // Pick up anything the customer did on the public /agreement-sign/:token
  // page (their form edits, signature) — that page writes straight to the
  // server and this authenticated view has no other way to see it live.
  useEffect(() => {
    if (!agreement || agreement.yullrSignature || agreement.clientSignature) return;
    if (!agreement.id) return;
    refreshCustomerAgreement(agreement.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreement?.id]);

  const set = <K extends keyof CAFormData>(key: K, val: CAFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const addAdmin = () => {
    setForm(prev => ({ ...prev, technicalAdministrators: [...prev.technicalAdministrators, { id: crypto.randomUUID(), name: '', role: '', email: '', phone: '' }] }));
    setDirty(true);
  };
  const setAdmin = (i: number, field: keyof TechAdmin, val: string) => {
    setForm(prev => ({ ...prev, technicalAdministrators: prev.technicalAdministrators.map((a, idx) => idx === i ? { ...a, [field]: val } : a) }));
    setDirty(true);
  };
  const removeAdmin = (i: number) => {
    setForm(prev => ({ ...prev, technicalAdministrators: prev.technicalAdministrators.filter((_, idx) => idx !== i) }));
    setDirty(true);
  };

  const createAgreement = () => {
    if (!mountainId) return;
    if (form.technicalAdministrators.length === 0) { toast.error('At least one Technical Administrator is required'); return; }
    if (!form.customerLegalName.trim() || !form.facilityName.trim()) { toast.error('Legal Name and Facility Name are required'); return; }
    setCreating(true);
    try {
      addCustomerAgreement(mountainId, form);
      setDirty(false);
      toast.success('Agreement created — signing link is ready');
    } finally {
      setCreating(false);
    }
  };

  const saveForm = () => {
    if (!agreement) return;
    if (form.technicalAdministrators.length === 0) { toast.error('At least one Technical Administrator is required'); return; }
    updateCustomerAgreement(agreement.id, { formData: form });
    setDirty(false);
    toast.success('Agreement details saved');
  };

  const yullrSigned = !!agreement?.yullrSignature;
  const clientSigned = !!agreement?.clientSignature;
  const bothSigned = yullrSigned && clientSigned;
  const locked = bothSigned;
  const signingUrl = agreement?.signToken ? `${window.location.origin}/agreement-sign/${agreement.signToken}` : null;

  // Once both signatures are in, render the fully-signed agreement to a PDF
  // and drop it into this mountain's Documents pane — same pattern as the
  // Proposal's saveSignedProposalToDocuments, guarded against duplicates.
  useEffect(() => {
    if (!bothSigned || !mountainId || !agreement) return;
    (async () => {
      const docId = `signed-agreement-${agreement.id}`;
      try {
        let el = printRef.current;
        let attempts = 0;
        while (!el && attempts < 20) {
          await new Promise(r => setTimeout(r, 100));
          el = printRef.current;
          attempts++;
        }
        if (!el) { console.error('Signed CA auto-save: preview element never became available'); return; }
        const pdf = await buildPdfFromElement(el);
        const filename = `YULLR-Customer-Agreement-${(mountain?.name || 'Mountain').replace(/\s+/g, '-')} (Signed).pdf`;
        await savePdfToDocuments(mountainId, docId, filename, pdf);
      } catch (e) {
        console.error('Signed CA auto-save failed:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothSigned, mountainId, agreement?.id]);

  const signAsYullr = async () => {
    if (!agreement || !yullrSignerName.trim()) { toast.error('Enter your name first'); return; }
    if (yullrSigEmpty) { toast.error('Please draw your signature'); return; }
    setYullrSigning(true);
    try {
      const signatureImage = yullrSigPadRef.current?.getDataURL() ?? null;
      await countersignCustomerAgreement(agreement.id, yullrSignerName.trim(), signatureImage);
      toast.success('Signed as YULLR');
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setYullrSigning(false);
    }
  };

  const clearSignatures = () => {
    if (!agreement) return;
    if (bothSigned) {
      toast.error("A fully-executed agreement can't be cleared — archive it and start a new one instead.");
      setConfirmModal(null);
      return;
    }
    updateCustomerAgreement(agreement.id, { clientSignature: null as any, yullrSignature: null as any });
    setConfirmModal(null);
    toast.success('Signatures cleared — form is editable again');
  };

  // Agreements are never hard-deleted — archiving keeps the historical record
  // (including any signatures) and lets a fresh agreement be created for this
  // mountain without any risk of the old one's signature state bleeding in.
  const archiveAgreement = () => {
    if (!agreement) return;
    setConfirmBusy(true);
    try {
      updateCustomerAgreement(agreement.id, { archived: true });
      toast.success('Agreement archived');
      navigate(`/mountains/${mountainId}`);
    } finally {
      setConfirmBusy(false);
    }
  };

  const copyLink = () => {
    if (!signingUrl) return;
    navigator.clipboard.writeText(signingUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  };

  return (
    <div className="min-h-screen bg-[#F2F3F5]">

      {/* ── Header ── */}
      <div className="bg-[#1D2930] px-4 pt-10 pb-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/mountains/${mountainId}`)} className="p-2 -ml-2 text-white/70 active:text-white">
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
          {/* Contract/Agreement status pill lifecycle (Dev Story 12.2): grey
              pre-send (mirrors the Proposal's grey draft state — no
              agreement created yet), yellow once created/shared with the
              customer awaiting signature, green once fully executed. */}
          {locked ? (
            <span className="flex items-center gap-1 bg-[#22c55e]/20 text-[#4ade80] text-[11px] font-['Inter:Medium',sans-serif] px-2.5 py-1 rounded-full flex-shrink-0">
              <CheckCircle size={11} /> Fully Executed
            </span>
          ) : agreement ? (
            <span className="flex items-center gap-1 bg-[#fbbf24]/20 text-[#fbbf24] text-[11px] font-['Inter:Medium',sans-serif] px-2.5 py-1 rounded-full flex-shrink-0">
              <Send size={11} /> Sent
            </span>
          ) : (
            <span className="flex items-center gap-1 bg-white/10 text-white/60 text-[11px] font-['Inter:Medium',sans-serif] px-2.5 py-1 rounded-full flex-shrink-0">
              <Edit2 size={11} /> Draft
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 pb-8 max-w-2xl mx-auto">

        {locked && (
          <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-[14px] px-4 py-3 flex items-center gap-3 mb-4">
            <Lock size={14} className="text-[#c2410c] flex-shrink-0" />
            <p className="text-[#c2410c] text-[12px] font-['Inter:Regular',sans-serif] flex-1">
              This agreement is fully executed and cannot be edited. Archive it to create a new one.
            </p>
          </div>
        )}

        {locked && (
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[14px] p-4 mb-4 flex items-start gap-3">
            <FileCheck size={20} className="text-[#22c55e] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[#15803d] font-['Inter:SemiBold',sans-serif] font-semibold text-[14px]">Customer Agreement fully executed</p>
              <p className="text-[#166534] text-[12px] font-['Inter:Regular',sans-serif] mt-0.5">Both parties have signed. This agreement is now legally binding, and the signed PDF is saved to this mountain's Documents.</p>
            </div>
          </div>
        )}

        {/* ── No agreement yet — collect details, then create ── */}
        {!agreement && (
          <div className={`${SECTION} border-[#F95C39]/30 bg-[#fff8f6]`}>
            <h2 className={SECTION_H}>Start a Customer Agreement</h2>
            <p className="text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif]">
              Fill in the party details below, then create the agreement to generate a signing link for the customer.
            </p>
          </div>
        )}

        {/* ── Party Information ── */}
        <div className={SECTION}>
          <div className="flex items-start justify-between mb-4">
            <h2 className={SECTION_H} style={{ marginBottom: 0 }}>Party Information</h2>
            {agreement && !locked && (
              <button
                onClick={saveForm}
                disabled={!dirty}
                className="flex items-center gap-1.5 bg-[#F95C39] text-white text-[12px] font-['Inter:Medium',sans-serif] px-3 py-1.5 rounded-[8px] active:opacity-80 disabled:opacity-40"
              >
                {dirty ? 'Save Changes' : 'Saved'}
              </button>
            )}
          </div>

          <p className={SEC_LABEL}>§1.1 — YULLR</p>
          <Field label="YULLR Email for Notices">
            {locked ? <div className={INP_RO}>{form.yullrEmail || '—'}</div>
              : <input className={INP} value={form.yullrEmail} onChange={e => set('yullrEmail', e.target.value)} placeholder="support@yullr.com" />}
          </Field>

          <p className={`${SEC_LABEL} mt-5`}>§1.2 — Customer</p>
          <Field label="Legal Name *">
            {locked ? <div className={INP_RO}>{form.customerLegalName || '—'}</div>
              : <input className={INP} value={form.customerLegalName} onChange={e => set('customerLegalName', e.target.value)} placeholder="Legal entity name" />}
          </Field>
          <Field label="Entity Type *">
            {locked ? <div className={INP_RO}>{form.entityType || '—'}</div>
              : <select className={INP} value={form.entityType} onChange={e => set('entityType', e.target.value)}>{ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>}
          </Field>
          <Field label="State of Formation *">
            {locked ? <div className={INP_RO}>{form.stateOfFormation || '—'}</div>
              : (
                <select className={INP} value={form.stateOfFormation} onChange={e => set('stateOfFormation', e.target.value)}>
                  <option value="">Select state…</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
          </Field>
          <Field label="Authorized Signatory *">
            {locked ? <div className={INP_RO}>{form.authorizedSignatory || '—'}</div>
              : <input className={INP} value={form.authorizedSignatory} onChange={e => set('authorizedSignatory', e.target.value)} placeholder="Full legal name of authorized signer" />}
          </Field>
          <Field label="Address for Notices">
            {locked ? <div className={`${INP_RO} whitespace-pre-line`}>{form.addressForNotices || '—'}</div>
              : <textarea className={`${INP} resize-none`} rows={3} value={form.addressForNotices} onChange={e => set('addressForNotices', e.target.value)} placeholder={"Street address\nCity, State ZIP"} />}
          </Field>
          <Field label="Email for Notices">
            {locked ? <div className={INP_RO}>{form.emailForNotices || '—'}</div>
              : <input className={INP} type="email" value={form.emailForNotices} onChange={e => set('emailForNotices', e.target.value)} placeholder="contact@mountain.com" />}
          </Field>

          <p className={`${SEC_LABEL} mt-5`}>§1.3 — Facility</p>
          <Field label="Primary Facility Name *">
            {locked ? <div className={INP_RO}>{form.facilityName || '—'}</div>
              : <input className={INP} value={form.facilityName} onChange={e => set('facilityName', e.target.value)} placeholder="Ski area / facility name" />}
          </Field>
          <Field label="Facility Location (City / State / Country) *">
            {locked ? <div className={INP_RO}>{form.facilityLocation || '—'}</div>
              : <input className={INP} value={form.facilityLocation} onChange={e => set('facilityLocation', e.target.value)} placeholder="e.g. Stowe, VT, USA" />}
          </Field>

          <p className={`${SEC_LABEL} mt-5`}>§1.4 — Effective Date</p>
          <div>
            <label className={LBL}>Effective Date *</label>
            {locked ? <div className={INP_RO}>{form.effectiveDate ? fmtDate(form.effectiveDate) : '—'}</div>
              : <input className={INP} type="date" value={form.effectiveDate} onChange={e => set('effectiveDate', e.target.value)} />}
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
                      <div><label className={LBL}>Name *</label><input className={INP} value={admin.name} onChange={e => setAdmin(i, 'name', e.target.value)} placeholder="Full name" /></div>
                      <div><label className={LBL}>Role *</label><input className={INP} value={admin.role} onChange={e => setAdmin(i, 'role', e.target.value)} placeholder="e.g. IT Manager" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className={LBL}>Email *</label><input className={INP} type="email" value={admin.email} onChange={e => setAdmin(i, 'email', e.target.value)} placeholder="admin@mountain.com" /></div>
                      <div><label className={LBL}>Phone</label><input className={INP} type="tel" value={admin.phone} onChange={e => setAdmin(i, 'phone', e.target.value)} placeholder="(000) 000-0000" /></div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {!locked && (
            <button type="button" onClick={addAdmin}
              className="mt-3 w-full flex items-center justify-center gap-2 border border-dashed border-[rgba(0,0,0,0.18)] rounded-[10px] py-2.5 text-[13px] text-[#6a7282] font-['Inter:Medium',sans-serif] active:bg-[#f9f9f9]">
              <Plus size={14} /> Add Another Administrator
            </button>
          )}
        </div>

        {/* ── Full Agreement Text — on screen, no PDF download required ── */}
        <div className={SECTION}>
          <h2 className={SECTION_H}>Agreement Terms</h2>
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 text-[12.5px] text-[#374151] leading-relaxed font-['Inter:Regular',sans-serif]">
            {renderTemplate(agreementTemplate, { paragraphStyle: {} })}
          </div>
        </div>

        {/* ── Bottom save / create bar ── */}
        {!locked && (
          <div className={`${SECTION} border-[#F95C39]/30 bg-[#fff8f6]`}>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                {agreement
                  ? <p className="text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif]">Changes are not auto-saved. Tap Save to update the agreement.</p>
                  : <p className="text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif]">Fill in the details above, then create the agreement to generate a signing link.</p>}
              </div>
              {agreement ? (
                <button onClick={saveForm} disabled={!dirty}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-[#F95C39] text-white text-[13px] font-['Inter:Medium',sans-serif] px-4 py-2.5 rounded-[10px] active:opacity-80 disabled:opacity-60">
                  Save Changes
                </button>
              ) : (
                <button onClick={createAgreement} disabled={creating || !form.customerLegalName.trim() || !form.facilityName.trim()}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-[#1D2930] text-white text-[13px] font-['Inter:Medium',sans-serif] px-4 py-2.5 rounded-[10px] active:opacity-80 disabled:opacity-60">
                  {creating ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating…</> : <><Send size={14} /> Create Agreement</>}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Signing Section ── */}
        {agreement && (
          <div className={SECTION}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={SECTION_H} style={{ marginBottom: 0 }}>Signatures</h2>
              <div className="flex items-center gap-2">
                {!bothSigned && (yullrSigned || clientSigned) && (
                  <button onClick={() => setConfirmModal('clearSigs')}
                    className="flex items-center gap-1 text-[11px] text-[#d97706] bg-[#fffbeb] border border-[#fde68a] px-2.5 py-1 rounded-full font-['Inter:Medium',sans-serif] active:opacity-70">
                    <XCircle size={11} /> Clear Signatures
                  </button>
                )}
                <button onClick={() => setConfirmModal('archive')}
                  className="flex items-center gap-1 text-[11px] text-[#6a7282] bg-[#f3f3f5] border border-[rgba(0,0,0,0.08)] px-2.5 py-1 rounded-full font-['Inter:Medium',sans-serif] active:opacity-70">
                  <Archive size={11} /> Archive
                </button>
              </div>
            </div>

            {!bothSigned && (
              <div className="mb-4">
                <p className="text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif] mb-2">Share this link with your customer to sign digitally.</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif] truncate min-w-0">{signingUrl}</div>
                  <button onClick={copyLink} className={`flex items-center gap-1.5 px-3 py-2.5 rounded-[8px] text-[12px] font-['Inter:Medium',sans-serif] flex-shrink-0 transition-colors ${linkCopied ? 'bg-[#f0fdf4] text-[#22c55e]' : 'bg-[#1D2930] text-white active:opacity-80'}`}>
                    {linkCopied ? <><CheckCircle size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
                  </button>
                  <a href={signingUrl!} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-[8px] bg-[#f3f3f5] text-[#6a7282] active:opacity-70 flex-shrink-0"><ExternalLink size={14} /></a>
                </div>
              </div>
            )}

            {bothSigned ? (
              <div className="bg-[#f0fdf4] border border-[#22c55e] rounded-[10px] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileCheck size={20} className="text-[#22c55e] flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-[#0a0a0a] font-['Inter:SemiBold',sans-serif] font-semibold text-[15px]">Agreement Fully Executed</p>
                    <p className="text-[#6a7282] text-[12px] font-['Inter:Regular',sans-serif]">Both parties have signed this agreement</p>
                  </div>
                </div>
                {signingUrl && (
                  <a
                    href={signingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-white border border-[#22c55e] text-[#22c55e] rounded-[8px] px-4 py-2.5 text-[13px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80"
                  >
                    <FileText size={15} />
                    View Agreement
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className={`rounded-[10px] border p-4 ${yullrSigned ? 'bg-[#f0fdf4] border-[#bbf7d0]' : 'bg-[#f9f9f9] border-[rgba(0,0,0,0.08)]'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12px] font-['Inter:SemiBold',sans-serif] font-semibold text-[#0a0a0a] uppercase tracking-wider">Your Signature (YULLR)</p>
                    {yullrSigned ? <span className="flex items-center gap-1 text-[#22c55e] text-[11px]"><CheckCircle size={11} /> Signed</span> : <span className="flex items-center gap-1 text-[#d97706] text-[11px]"><Clock size={11} /> Pending</span>}
                  </div>
                  {yullrSigned ? (
                    <div>
                      {agreement.yullrSignature?.signatureImage && (
                        <div className="mb-2 p-2 bg-white border border-[#22c55e] rounded-[8px] inline-block">
                          <img src={agreement.yullrSignature.signatureImage} alt="YULLR signature" className="max-h-12 max-w-[200px]" />
                        </div>
                      )}
                      <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[15px]">{agreement.yullrSignature!.name}</p>
                      <p className="text-[#6a7282] text-[12px] mt-0.5">YULLR, Inc. · {fmtDate(agreement.yullrSignature!.signedAt)}</p>
                    </div>
                  ) : (
                    <div className="space-y-3 mt-1">
                      <input className={INP} placeholder="Your full name" value={yullrSignerName} onChange={e => setYullrSignerName(e.target.value)} />
                      <SignaturePad ref={yullrSigPadRef} onChange={isEmpty => setYullrSigEmpty(isEmpty)} height={120} />
                      <button onClick={signAsYullr} disabled={yullrSigning || !yullrSignerName.trim() || yullrSigEmpty}
                        className="w-full flex items-center justify-center gap-2 bg-[#F95C39] text-white rounded-[8px] py-2.5 text-[13px] font-['Inter:Medium',sans-serif] active:opacity-80 disabled:opacity-50">
                        {yullrSigning ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing...</> : <><PenLine size={15} /> Sign as YULLR</>}
                      </button>
                    </div>
                  )}
                </div>

                <div className={`rounded-[10px] border p-4 ${clientSigned ? 'bg-[#f0fdf4] border-[#bbf7d0]' : 'bg-[#f9f9f9] border-[rgba(0,0,0,0.08)]'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[12px] font-['Inter:SemiBold',sans-serif] font-semibold text-[#0a0a0a] uppercase tracking-wider">Customer Signature</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => agreement && refreshCustomerAgreement(agreement.id)} className="p-1 text-[#9ca3af] active:text-[#6a7282]" title="Refresh"><RefreshCw size={12} /></button>
                      {clientSigned ? <span className="flex items-center gap-1 text-[#22c55e] text-[11px]"><CheckCircle size={11} /> Signed</span> : <span className="flex items-center gap-1 text-[#d97706] text-[11px]"><Clock size={11} /> Awaiting</span>}
                    </div>
                  </div>
                  {clientSigned ? (
                    <div>
                      {agreement.clientSignature?.signatureImage && (
                        <div className="mb-2 p-2 bg-white border border-[#bbf7d0] rounded-[8px] inline-block">
                          <img src={agreement.clientSignature.signatureImage} alt="Customer signature" style={{ maxHeight: 52, maxWidth: 200, display: 'block' }} />
                        </div>
                      )}
                      <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[15px]">{agreement.clientSignature!.name}</p>
                      {agreement.clientSignature!.title && <p className="text-[#6a7282] text-[12px]">{agreement.clientSignature!.title}</p>}
                      <p className="text-[#6a7282] text-[12px] mt-0.5">{fmtDate(agreement.clientSignature!.signedAt)}</p>
                    </div>
                  ) : (
                    <p className="text-[#9ca3af] text-[12px] font-['Inter:Regular',sans-serif]">Waiting for customer to sign via the link above.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Hidden render used only to generate the signed PDF ── */}
      {agreement && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0, opacity: 0, pointerEvents: 'none' }}>
          <div ref={printRef} style={{ width: 860, background: '#fff', padding: '48px 52px', fontFamily: 'Inter, sans-serif' }}>
            <div data-pdf-section style={{ borderBottom: '3px solid #FF5C39', paddingBottom: 22, marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#FF5C39', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 4 }}>Customer Agreement</p>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>{form.facilityName || mountain?.name}</h1>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: '#555', lineHeight: 1.9 }}>
                <div><strong style={{ color: '#1a1a1a' }}>Date:</strong> {fmtDate(form.effectiveDate)}</div>
                <div><strong style={{ color: '#1a1a1a' }}>YULLR:</strong> YULLR, Inc.</div>
              </div>
            </div>

            {renderTemplate(agreementTemplate, {
              paragraphStyle: { fontSize: 12.5, color: '#374151', lineHeight: 1.7, marginBottom: 10 },
              pdfSectionEvery: 6,
              spliceNodes: {
                parties: (
                  <>
                    <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', textTransform: 'uppercase', marginTop: 20, marginBottom: 10 }}>1. Parties</h2>
                    <p style={{ fontSize: 12.5, color: '#374151' }}><strong>YULLR:</strong> YULLR, Inc., 173 Tin Mountain Road, Jackson, NH 03846 — {form.yullrEmail}</p>
                    <p style={{ fontSize: 12.5, color: '#374151', marginTop: 6 }}>
                      <strong>Customer:</strong> {form.customerLegalName} ({form.entityType}, {form.stateOfFormation}) — Authorized Signatory: {form.authorizedSignatory}
                    </p>
                    <p style={{ fontSize: 12.5, color: '#374151', marginTop: 6 }}><strong>Facility:</strong> {form.facilityName} — {form.facilityLocation}</p>
                    <p style={{ fontSize: 12.5, color: '#374151', marginTop: 6 }}><strong>Effective Date:</strong> {fmtDate(form.effectiveDate)}</p>

                    <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', textTransform: 'uppercase', marginTop: 24, marginBottom: 10 }}>Technical Administrator(s)</h2>
                    {form.technicalAdministrators.map((a, i) => (
                      <p key={a.id || i} style={{ fontSize: 12.5, color: '#374151', marginBottom: 4 }}>{a.name} — {a.role}{a.email ? ` · ${a.email}` : ''}{a.phone ? ` · ${a.phone}` : ''}</p>
                    ))}
                  </>
                ),
              },
            })}

            <div data-pdf-section style={{ marginTop: 40, paddingTop: 20, borderTop: '2px solid #FF5C39', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, color: '#555', width: 340 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>YULLR, Inc.</div>
                {agreement.yullrSignature?.signatureImage && <img src={agreement.yullrSignature.signatureImage} alt="YULLR signature" style={{ maxHeight: 50, maxWidth: 200, marginTop: 8, marginBottom: 8 }} />}
                <div style={{ fontWeight: 600, color: '#1a1a1a' }}>{agreement.yullrSignature?.name}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{agreement.yullrSignature && new Date(agreement.yullrSignature.signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
              </div>
              <div style={{ fontSize: 12, color: '#555', width: 340 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Customer ({form.customerLegalName})</div>
                {agreement.clientSignature?.signatureImage && <img src={agreement.clientSignature.signatureImage} alt="Customer signature" style={{ maxHeight: 50, maxWidth: 200, marginTop: 8, marginBottom: 8 }} />}
                <div style={{ fontWeight: 600, color: '#1a1a1a' }}>{agreement.clientSignature?.name}</div>
                {agreement.clientSignature?.title && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{agreement.clientSignature.title}</div>}
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{agreement.clientSignature && new Date(agreement.clientSignature.signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm modal (clear signatures / archive) ── */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-[16px] w-full max-w-sm shadow-2xl overflow-hidden mb-2 sm:mb-0">
            <div className={`px-6 pt-6 pb-4 ${confirmModal === 'archive' ? 'bg-[#f3f3f5]' : 'bg-[#fffbeb]'}`}>
              {confirmModal === 'archive' ? <Archive size={24} className="text-[#6a7282] mb-2" /> : <AlertTriangle size={24} className="text-[#d97706] mb-2" />}
              <p className="text-[#0a0a0a] font-['Inter:SemiBold',sans-serif] font-semibold text-[16px]">
                {confirmModal === 'archive' ? 'Archive Agreement?' : 'Clear signatures?'}
              </p>
              <p className="text-[#6a7282] text-[13px] font-['Inter:Regular',sans-serif] mt-1">
                {confirmModal === 'archive'
                  ? "This agreement (including any signatures) is kept for the historical record but hidden from view. Start a fresh agreement for this mountain any time — it will never inherit this one's data."
                  : 'Both signatures will be removed. The agreement fields will become editable again.'}
              </p>
            </div>
            <div className="flex gap-3 px-6 py-4">
              <button onClick={() => setConfirmModal(null)} disabled={confirmBusy} className="flex-1 py-2.5 rounded-[10px] border border-[rgba(0,0,0,0.12)] text-[#0a0a0a] text-[14px] font-['Inter:Medium',sans-serif] active:bg-[#f3f3f5] disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmModal === 'archive' ? archiveAgreement : clearSignatures} disabled={confirmBusy}
                className={`flex-1 py-2.5 rounded-[10px] text-white text-[14px] font-['Inter:Medium',sans-serif] active:opacity-80 disabled:opacity-50 ${confirmModal === 'archive' ? 'bg-[#1D2930]' : 'bg-[#d97706]'}`}>
                {confirmBusy ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : confirmModal === 'archive' ? 'Archive Agreement' : 'Clear Signatures'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
