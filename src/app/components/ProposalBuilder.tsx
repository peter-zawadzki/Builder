import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useData } from '../context/DataContext';
import { ArrowLeft, Plus, X, Printer, FileText, ChevronLeft, Cloud, CloudOff, Pencil, Save, Copy, CheckCircle, Clock, RefreshCw, PenLine, Send, Lock, Trash2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;
const API_HEADERS = { Authorization: `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' };

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrailRow {
  id: string;
  trailId?: string;      // set when this row is backed by a DB Trail record
  name: string;
  capturePoints: string;
  notes: string;
  unitPrice: string;
}

interface ReqRow {
  id: string;
  location: string;
  requirement: string;
  details: string;
  responsibility: string;
}

interface BulkRow {
  id: string;
  passType: string;
  qty: string;
  unitPrice: string;
}

interface ProposalForm {
  proposalNumber: string;
  date: string;
  validUntil: string;
  legalEntity: string;
  clientName: string;
  mountainName: string;
  clientAddress: string;
  trails: TrailRow[];
  installDays: string;
  installNotes: string;
  requirements: ReqRow[];
  integrationFee: string;
  installFee: string;
  bulkRows: BulkRow[];
  miscFee: string;
  paymentTerms: string;
  additionalTerms: string;
  termYears: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2); }
function parseAmt(v: string) { return parseFloat((v || '').replace(/[$,]/g, '')) || 0; }
function fmtMoney(n: number) {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtDate(d: string) {
  if (!d) return '[Date]';
  const [y, m, dd] = d.split('-');
  return `${m}/${dd}/${y}`;
}
function todayISO() {
  return new Date().toISOString().split('T')[0];
}
function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function numberToWord(n: string): string {
  const map: Record<string, string> = {
    '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five',
    '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten',
  };
  return map[n] || n;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProposalBuilder() {
  const navigate = useNavigate();
  const { mountainId } = useParams<{ mountainId: string }>();
  const {
    getMountainById, getTrailsByMountainId, getLocationsByMountainId,
    addTrail: saveTrailToDB,
    updateMountain,
    addNote,
    getNotesByMountainId,
  } = useData();

  const mountain = mountainId ? getMountainById(mountainId) : null;
  const dbTrails = mountainId ? getTrailsByMountainId(mountainId) : [];
  const allLocations = mountainId ? getLocationsByMountainId(mountainId) : [];

  const [showPreview, setShowPreview] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const hiddenPrintRef = useRef<HTMLDivElement>(null);
  const [pdfGenerationMode, setPdfGenerationMode] = useState(false);
  const [newTrailMode, setNewTrailMode] = useState<Record<string, boolean>>({});

  // Edit mode: false when proposal already saved (locked), true when new or explicitly unlocked
  const alreadySaved = !!mountain?.proposalCreated;
  const [isEditMode, setIsEditMode] = useState(!alreadySaved);

  // ── Signing state ──────────────────────────────────────────────────────────
  const [signToken, setSignToken] = useState<string | null>(null);
  const [signRecord, setSignRecord] = useState<any | null>(null);
  const [signLoading, setSignLoading] = useState(false);
  const [yullrSignerName, setYullrSignerName] = useState('');
  const [yullrSigning, setYullrSigning] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const yullrSigPadRef = useRef<SignaturePadHandle>(null);
  const [yullrSigEmpty, setYullrSigEmpty] = useState(true);

  // ── Confirmation modal ─────────────────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState<'clearSigs' | 'deleteProposal' | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // ── Email sending ──────────────────────────────────────────────────────────
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailRecipientName, setEmailRecipientName] = useState('');
  const [emailCc, setEmailCc] = useState('support@yullr.com');
  const [emailSending, setEmailSending] = useState(false);

  // Derived state - signature status (must come after signRecord/signToken state declarations)
  const signingUrl = signToken ? `${window.location.origin}/sign/${signToken}` : null;
  const yullrSigned = !!signRecord?.yullrSignature;
  const clientSigned = !!signRecord?.clientSignature;
  const bothSigned = yullrSigned && clientSigned;
  const ro = !isEditMode || bothSigned;

  // Seed trails from DB Trail records (falling back to a blank row)
  const seedTrails = (): TrailRow[] => {
    if (dbTrails.length > 0) {
      return dbTrails.map(t => {
        // Proposals count Install Site locations only (camera capture points).
        const locCount = allLocations.filter(l => l.trailId === t.id && l.locationType === 'Install Site').length;
        return {
          id: uid(),
          trailId: t.id,
          name: t.name,
          capturePoints: locCount > 0 ? String(locCount) : '',
          notes: t.notes || '',
          unitPrice: '1000',
        };
      });
    }
    return [{ id: uid(), trailId: undefined, name: '', capturePoints: '', notes: '', unitPrice: '1000' }];
  };

  const today = todayISO();
  const [form, setForm] = useState<ProposalForm>(() => {
    // Try to load a previously saved proposal for this mountain
    if (mountainId) {
      try {
        const saved = localStorage.getItem(`proposal:${mountainId}`);
        if (saved) return JSON.parse(saved) as ProposalForm;
      } catch {}
    }
    // Fresh form
    const mountainPrefix = (mountain?.name || '').replace(/\s+/g, '').toUpperCase().slice(0, 4);
    const [y, m, dd] = today.split('-');
    const dateStr = `${m}${dd}${y.slice(2)}`;
    const proposalNumber = mountainPrefix ? `YLR-${mountainPrefix}-${dateStr}` : `YLR-${dateStr}`;
    return {
      proposalNumber,
      date: today,
      validUntil: addDays(today, 30),
      legalEntity: mountain?.legalEntity || '',
      clientName: mountain?.legalEntity || mountain?.name || '',
      mountainName: mountain?.name || '',
      clientAddress: mountain?.address || '',
      trails: seedTrails(),
      installDays: '',
      installNotes: '',
      requirements: [],
      integrationFee: '3000',
      installFee: '',
      bulkRows: [
        { id: uid(), passType: 'Day Passes', qty: '', unitPrice: '10' },
        { id: uid(), passType: 'Mountain Passes', qty: '', unitPrice: '75' },
        { id: uid(), passType: 'Season Passes', qty: '', unitPrice: '100' },
      ],
      miscFee: '',
      paymentTerms: `50% deposit is due upon execution of the Customer Agreement. The remaining 50% balance is due on or before November 1, ${new Date().getFullYear()}.`,
      additionalTerms: '',
      termYears: '5',
    };
  });

  // Auto-save proposal to localStorage whenever form changes
  useEffect(() => {
    if (mountainId) {
      try {
        localStorage.setItem(`proposal:${mountainId}`, JSON.stringify(form));
      } catch {}
    }
  }, [form, mountainId]);

  // ── Trail calcs ──
  function trailTotal(t: TrailRow) {
    return (parseFloat(t.capturePoints) || 0) * parseAmt(t.unitPrice);
  }
  function bulkTotal(b: BulkRow) {
    return (parseFloat(b.qty) || 0) * parseAmt(b.unitPrice);
  }

  const trailSubtotal = form.trails.reduce((s, t) => s + trailTotal(t), 0);
  const bulkSubtotal = form.bulkRows.reduce((s, b) => s + bulkTotal(b), 0);
  const hwTotal = trailSubtotal + parseAmt(form.integrationFee) + parseAmt(form.installFee) + parseAmt(form.miscFee);

  // ── Field helpers ──
  const setField = (k: keyof ProposalForm, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // ── Trail helpers ── (prefixed to avoid conflict with DataContext addTrail)
  const addProposalTrail = () =>
    setForm(prev => ({ ...prev, trails: [...prev.trails, { id: uid(), trailId: undefined, name: '', capturePoints: '', notes: '', unitPrice: '1000' }] }));
  const removeTrail = (id: string) => {
    setNewTrailMode(prev => { const n = { ...prev }; delete n[id]; return n; });
    setForm(prev => ({ ...prev, trails: prev.trails.filter(t => t.id !== id) }));
  };
  const setTrail = (id: string, k: keyof TrailRow, v: string) =>
    setForm(prev => ({ ...prev, trails: prev.trails.map(t => t.id === id ? { ...t, [k]: v } : t) }));
  const setTrailFields = (id: string, fields: Partial<TrailRow>) =>
    setForm(prev => ({ ...prev, trails: prev.trails.map(t => t.id === id ? { ...t, ...fields } : t) }));

  // Save any proposal trail rows that haven't been persisted to DB yet
  const saveNewTrailsToDB = () => {
    if (!mountainId) return;
    const unsaved = form.trails.filter(t => t.name.trim() && !t.trailId);
    if (unsaved.length === 0) { toast('No new trails to save'); return; }
    const newIds: Record<string, string> = {};
    unsaved.forEach(t => {
      const id = saveTrailToDB({ mountainId: mountainId!, name: t.name.trim(), notes: t.notes || undefined });
      newIds[t.id] = id;
    });
    setForm(prev => ({
      ...prev,
      trails: prev.trails.map(t => newIds[t.id] ? { ...t, trailId: newIds[t.id] } : t),
    }));
    toast.success(`${unsaved.length} trail${unsaved.length !== 1 ? 's' : ''} saved to mountain`);
  };

  // Immediately save a single new trail to DB and update row's trailId
  const persistNewTrail = (rowId: string, name: string, notes: string) => {
    if (!mountainId || !name.trim()) return;
    const newId = saveTrailToDB({ mountainId, name: name.trim(), notes: notes || undefined });
    setTrailFields(rowId, { trailId: newId });
    setNewTrailMode(prev => { const n = { ...prev }; delete n[rowId]; return n; });
    toast.success(`Trail "${name.trim()}" added to mountain`);
  };

  // Open preview (never changes edit-lock state)
  const openPreview = () => {
    setShowPreview(true);
  };

  // Save & lock proposal
  const handleSave = () => {
    if (mountainId) {
      try { localStorage.setItem(`proposal:${mountainId}`, JSON.stringify(form)); } catch {}
      const updates: Record<string, any> = {
        proposalCreated: true,
        proposalCreatedAt: new Date().toISOString()
      };
      if (form.legalEntity.trim()) updates.legalEntity = form.legalEntity.trim();
      updateMountain(mountainId, updates);
    }
    setIsEditMode(false);
    toast.success('Proposal saved');
  };

  // Unsaved changes protection (only when in edit mode and not fully executed)
  const { showPrompt, handleSave: handleSaveDialog, handleDiscard, handleCancel } = useUnsavedChanges({
    when: isEditMode && !bothSigned,
    message: 'You have unsaved changes to this proposal. Do you want to save before leaving?',
    onSave: handleSave,
  });

  // ── Req helpers ──
  const addReq = () =>
    setForm(prev => ({ ...prev, requirements: [...prev.requirements, { id: uid(), location: '', requirement: '', details: '', responsibility: 'Client' }] }));
  const removeReq = (id: string) =>
    setForm(prev => ({ ...prev, requirements: prev.requirements.filter(r => r.id !== id) }));
  const setReq = (id: string, k: keyof ReqRow, v: string) =>
    setForm(prev => ({ ...prev, requirements: prev.requirements.map(r => r.id === id ? { ...r, [k]: v } : r) }));

  // ── Bulk helpers ──
  const addBulk = () =>
    setForm(prev => ({ ...prev, bulkRows: [...prev.bulkRows, { id: uid(), passType: '', qty: '', unitPrice: '' }] }));
  const removeBulk = (id: string) =>
    setForm(prev => ({ ...prev, bulkRows: prev.bulkRows.filter(b => b.id !== id) }));
  const setBulk = (id: string, k: keyof BulkRow, v: string) =>
    setForm(prev => ({ ...prev, bulkRows: prev.bulkRows.map(b => b.id === id ? { ...b, [k]: v } : b) }));

  // ── Print / PDF export ──
  async function handlePrint() {
    if (!printRef.current) return;
    setPrintLoading(true);
    try {
      const el = printRef.current;

      // ── Step 1: Proxy all <img> through the server so CORS is never an issue ──
      const imgEls = Array.from(el.querySelectorAll('img')) as HTMLImageElement[];
      const origSrcs: string[] = imgEls.map(i => i.src);
      await Promise.all(imgEls.map(async (imgEl, idx) => {
        const src = origSrcs[idx];
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
        try {
          const proxyUrl = `${API_BASE}/proxy-image?url=${encodeURIComponent(src)}`;
          const resp = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${publicAnonKey}` } });
          if (!resp.ok) return;
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((res) => {
            const fr = new FileReader();
            fr.onloadend = () => res(fr.result as string);
            fr.readAsDataURL(blob);
          });
          imgEl.src = dataUrl;
          await new Promise<void>((res) => {
            if (imgEl.complete) { res(); return; }
            imgEl.onload = () => res();
            imgEl.onerror = () => res();
            setTimeout(res, 3000);
          });
        } catch (e) {
          console.warn('Image proxy failed for', src, e);
        }
      }));

      // ── Step 2: Expand container to fixed width + measure section positions ──
      const origStyle = el.style.cssText;
      el.style.maxWidth = 'none';
      el.style.width = '860px';
      el.style.margin = '0';
      el.style.boxShadow = 'none';
      void el.offsetHeight; // force reflow

      const expandedWidth = el.offsetWidth; // 860
      const containerTop = el.getBoundingClientRect().top;
      const sectionEls = Array.from(el.querySelectorAll('[data-pdf-section]')) as HTMLElement[];
      // CSS-pixel offsets from container top — used to snap page breaks
      const sectionCssTops = sectionEls.map(s => s.getBoundingClientRect().top - containerTop);

      // ── Step 3: Capture full canvas ──
      const fullCanvas = await html2canvas(el, {
        scale: 2,
        useCORS: false,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
      });

      // Restore DOM
      el.style.cssText = origStyle;
      imgEls.forEach((imgEl, idx) => { imgEl.src = origSrcs[idx]; });

      // ── Step 4: Compute page layout constants ──
      const PDF_W_MM = 210;
      const PDF_H_MM = 297;
      const MARGIN_MM = 14;               // 14 mm on all sides
      const CONTENT_W_MM = PDF_W_MM - MARGIN_MM * 2; // 182 mm
      const CONTENT_H_MM = PDF_H_MM - MARGIN_MM * 2; // 269 mm

      // How many canvas px correspond to 1 mm in the PDF content area
      const cssToCanvas = fullCanvas.width / expandedWidth; // ≈ 2
      const pxPerMM = fullCanvas.width / CONTENT_W_MM;
      const contentHeightPx = CONTENT_H_MM * pxPerMM;

      // Section top positions in canvas pixels
      const sectionPxTops = sectionCssTops.map(t => t * cssToCanvas);

      // ── Step 5: Build page-start list, snapping breaks to section boundaries ──
      const totalPx = fullCanvas.height;
      const pageStarts: number[] = [0];

      while (true) {
        const last = pageStarts[pageStarts.length - 1];
        const ideal = last + contentHeightPx;
        if (ideal >= totalPx) break;

        // Prefer to break at the latest section top that falls at or before the
        // ideal break, but no earlier than 25 % into the current page.
        const minBreak = last + contentHeightPx * 0.25;
        let bestBreak = ideal;
        for (const st of sectionPxTops) {
          if (st >= minBreak && st <= ideal) bestBreak = st;
        }
        pageStarts.push(Math.round(bestBreak));
      }

      // ── Step 6: Render one PDF page per slice ──
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      for (let p = 0; p < pageStarts.length; p++) {
        if (p > 0) pdf.addPage();

        const yStart = pageStarts[p];
        const yEnd   = p + 1 < pageStarts.length ? pageStarts[p + 1] : totalPx;
        const sliceH = yEnd - yStart;

        // Slice into a fresh canvas (white background)
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width  = fullCanvas.width;
        sliceCanvas.height = Math.ceil(sliceH);
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(fullCanvas, 0, yStart, fullCanvas.width, sliceH, 0, 0, fullCanvas.width, sliceH);

        const sliceHeightMM = sliceH / pxPerMM;
        pdf.addImage(
          sliceCanvas.toDataURL('image/jpeg', 0.93),
          'JPEG',
          MARGIN_MM,   // x — left margin
          MARGIN_MM,   // y — top margin
          CONTENT_W_MM,
          sliceHeightMM,
        );
      }

      const filename = `YULLR-Proposal-${form.proposalNumber || 'Draft'}-${(form.mountainName || 'Mountain').replace(/\s+/g, '-')}.pdf`;
      pdf.save(filename);
      toast.success('PDF downloaded');
    } catch (e: any) {
      console.error('PDF export error:', e);
      toast.error(`PDF export failed: ${e.message}`);
    } finally {
      setPrintLoading(false);
    }
  }

  // ── Input style ──
  const inp = (readonly?: boolean) =>
    `w-full rounded-[8px] px-3 py-2.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] border transition-colors ${
      readonly
        ? 'bg-white border-transparent text-[#0a0a0a] cursor-default select-none'
        : 'bg-[#f3f3f5] border-transparent focus:border-[#ff5c39] focus:outline-none'
    }`;
  const label = "block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-1.5";
  const section = "bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4";
  const sectionH = "text-[12px] font-['Inter:Medium',sans-serif] font-semibold uppercase tracking-wider text-[#ff5c39] mb-3";

  // Load existing sign status when proposal is already saved
  useEffect(() => {
    if (!alreadySaved || !mountainId) return;
    fetch(`${API_BASE}/proposals/sign-status/${mountainId}`, { headers: API_HEADERS })
      .then(r => r.json())
      .then((data: any) => {
        if (data.token) setSignToken(data.token);
        if (data.record) {
          setSignRecord(data.record);

          // Check if proposal is signed and add note if not already tracked
          if (data.record.clientSignature && data.record.yullrSignature) {
            // Both signed - proposal is fully executed
            const signerName = data.record.clientSignature.name || 'Client';
            const signedDate = new Date(data.record.clientSignature.signedAt).toLocaleDateString();
            const existingNotes = getNotesByMountainId(mountainId);
            const isDuplicate = existingNotes.some(note =>
              note.text.includes(`Proposal #${form.proposalNumber}`) &&
              (note.text.includes('signed') || note.text.includes('executed'))
            );

            if (!isDuplicate) {
              addNote(
                mountainId,
                `Proposal #${form.proposalNumber} fully executed - signed by ${signerName} on ${signedDate}`,
                'Proposal',
                false,
                true
              );
            }
          }
        }
      })
      .catch(e => console.error('Error loading sign status:', e));
  }, [alreadySaved, mountainId]);

  async function sendSignedProposalPDF() {
    console.log('[sendSignedProposalPDF] Called with signToken:', signToken, 'mountainId:', mountainId);

    if (!signToken || !mountainId) {
      console.log('[sendSignedProposalPDF] Missing signToken or mountainId, aborting');
      return;
    }

    console.log('[sendSignedProposalPDF] Starting PDF generation...');
    toast('Generating signed proposal PDF...', { duration: Infinity, id: 'pdf-gen' });

    try {
      // Enable PDF generation mode to render hidden preview
      setPdfGenerationMode(true);

      // Wait for DOM to update and ref to be available
      let el = hiddenPrintRef.current || printRef.current;
      let attempts = 0;
      while (!el && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        el = hiddenPrintRef.current || printRef.current;
        attempts++;
      }

      if (!el) {
        console.error('[sendSignedProposalPDF] Neither hidden nor visible print ref available after waiting');
        toast.dismiss('pdf-gen');
        toast.error('Unable to generate PDF - preview rendering failed');
        setPdfGenerationMode(false);
        return;
      }

      console.log('[sendSignedProposalPDF] Preview element ready, generating PDF...');

      // Proxy images
      const imgEls = Array.from(el.querySelectorAll('img')) as HTMLImageElement[];
      const origSrcs: string[] = imgEls.map(i => i.src);
      await Promise.all(imgEls.map(async (imgEl, idx) => {
        const src = origSrcs[idx];
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
        try {
          const proxyUrl = `${API_BASE}/proxy-image?url=${encodeURIComponent(src)}`;
          const resp = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${publicAnonKey}` } });
          if (!resp.ok) return;
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((res) => {
            const fr = new FileReader();
            fr.onloadend = () => res(fr.result as string);
            fr.readAsDataURL(blob);
          });
          imgEl.src = dataUrl;
          await new Promise<void>((res) => {
            if (imgEl.complete) { res(); return; }
            imgEl.onload = () => res();
            imgEl.onerror = () => res();
            setTimeout(res, 3000);
          });
        } catch (e) {
          console.warn('Image proxy failed for', src, e);
        }
      }));

      // Expand container
      const origStyle = el.style.cssText;
      el.style.maxWidth = 'none';
      el.style.width = '860px';
      el.style.margin = '0';
      el.style.boxShadow = 'none';
      void el.offsetHeight;

      const expandedWidth = el.offsetWidth;
      const containerTop = el.getBoundingClientRect().top;
      const sectionEls = Array.from(el.querySelectorAll('[data-pdf-section]')) as HTMLElement[];
      const sectionCssTops = sectionEls.map(s => s.getBoundingClientRect().top - containerTop);

      // Capture canvas
      const fullCanvas = await html2canvas(el, {
        scale: 2,
        useCORS: false,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
      });

      // Restore DOM
      el.style.cssText = origStyle;
      imgEls.forEach((imgEl, idx) => { imgEl.src = origSrcs[idx]; });

      // PDF constants
      const PDF_W_MM = 210;
      const PDF_H_MM = 297;
      const MARGIN_MM = 14;
      const CONTENT_W_MM = PDF_W_MM - MARGIN_MM * 2;
      const CONTENT_H_MM = PDF_H_MM - MARGIN_MM * 2;

      const cssToCanvas = fullCanvas.width / expandedWidth;
      const pxPerMM = fullCanvas.width / CONTENT_W_MM;
      const contentHeightPx = CONTENT_H_MM * pxPerMM;

      const sectionPxTops = sectionCssTops.map(t => t * cssToCanvas);

      // Build pages
      const totalPx = fullCanvas.height;
      const pageStarts: number[] = [0];

      while (true) {
        const last = pageStarts[pageStarts.length - 1];
        const ideal = last + contentHeightPx;
        if (ideal >= totalPx) break;

        const minBreak = last + contentHeightPx * 0.25;
        let bestBreak = ideal;
        for (const st of sectionPxTops) {
          if (st >= minBreak && st <= ideal) bestBreak = st;
        }
        pageStarts.push(Math.round(bestBreak));
      }

      // Render PDF
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      for (let p = 0; p < pageStarts.length; p++) {
        if (p > 0) pdf.addPage();

        const yStart = pageStarts[p];
        const yEnd = p + 1 < pageStarts.length ? pageStarts[p + 1] : totalPx;
        const sliceH = yEnd - yStart;

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = fullCanvas.width;
        sliceCanvas.height = Math.ceil(sliceH);
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(fullCanvas, 0, yStart, fullCanvas.width, sliceH, 0, 0, fullCanvas.width, sliceH);

        const sliceHeightMM = sliceH / pxPerMM;
        pdf.addImage(
          sliceCanvas.toDataURL('image/jpeg', 0.93),
          'JPEG',
          MARGIN_MM,
          MARGIN_MM,
          CONTENT_W_MM,
          sliceHeightMM,
        );
      }

      // Convert to base64
      const pdfBase64 = pdf.output('dataurlstring').split(',')[1];

      // Get client email from the email log or use a placeholder
      let clientEmail = 'customer@example.com';
      if (signRecord?.emailLog && Array.isArray(signRecord.emailLog) && signRecord.emailLog.length > 0) {
        // Use the most recent email recipient
        clientEmail = signRecord.emailLog[signRecord.emailLog.length - 1].recipientEmail;
      }

      const res = await fetch(`${API_BASE}/proposals/send-signed-pdf`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({
          mountainId,
          proposalNumber: form.proposalNumber,
          mountainName: form.mountainName,
          recipientEmail: clientEmail,
          pdfBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send PDF');

      toast.dismiss('pdf-gen');
      toast.success('Signed proposal PDF emailed to customer');
      console.log('[sendSignedProposalPDF] PDF sent successfully to:', clientEmail);

      // Add note
      const noteText = `Signed proposal PDF #${form.proposalNumber} emailed to customer`;
      const existingNotes = getNotesByMountainId(mountainId);
      const isDuplicate = existingNotes.some(note => note.text.includes(noteText));

      if (!isDuplicate) {
        addNote(mountainId, noteText, 'Proposal', false, true);
      }
    } catch (e: any) {
      toast.dismiss('pdf-gen');
      console.error('[sendSignedProposalPDF] PDF send error:', e);
      toast.error(`Failed to send PDF: ${e.message}`);
    } finally {
      setPdfGenerationMode(false);
    }
  }

  async function generateSignLink() {
    if (!mountainId) return;
    setSignLoading(true);
    try {
      const res = await fetch(`${API_BASE}/proposals/sign-request`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ mountainId, proposalSnapshot: form }),
      });
      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to generate link');
      setSignToken(data.token);
      setSignRecord({ token: data.token, mountainId, createdAt: new Date().toISOString(), proposalSnapshot: form, yullrSignature: null, clientSignature: null });
      toast.success('Signing link generated');
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setSignLoading(false);
    }
  }

  async function refreshSignStatus() {
    if (!signToken || !mountainId) return;
    try {
      const res = await fetch(`${API_BASE}/proposals/sign/${signToken}`, { headers: API_HEADERS });
      const data = await res.json() as any;
      if (!data.error) {
        // Check if client just signed
        const wasClientSigned = !!signRecord?.clientSignature;
        const wasYullrSigned = !!signRecord?.yullrSignature;
        const isClientSigned = !!data.clientSignature;
        const isYullrSigned = !!data.yullrSignature;

        if (!wasClientSigned && isClientSigned) {
          // Client just signed - add note
          const signerName = data.clientSignature.name || 'Client';
          const noteText = `Proposal #${form.proposalNumber} signed by ${signerName}`;
          const existingNotes = getNotesByMountainId(mountainId);
          const isDuplicate = existingNotes.some(note => note.text.includes(`Proposal #${form.proposalNumber} signed`));

          if (!isDuplicate) {
            addNote(mountainId, noteText, 'Proposal', false, true);
          }

          // If YULLR already signed and client just signed, both are now signed - send PDF
          if (wasYullrSigned) {
            await sendSignedProposalPDF();
          }
        }

        setSignRecord(data);
        toast('Status refreshed');
      }
    } catch (e) { console.error('Error refreshing sign status:', e); }
  }

  async function signAsYullr() {
    if (!signToken || !yullrSignerName.trim()) { toast.error('Please enter your name'); return; }
    if (yullrSigEmpty) { toast.error('Please draw your signature'); return; }
    const signatureImage = yullrSigPadRef.current?.getDataURL() ?? null;

    // Check if client has already signed BEFORE we update state
    const clientAlreadySigned = !!signRecord?.clientSignature;

    setYullrSigning(true);
    try {
      const res = await fetch(`${API_BASE}/proposals/sign/${signToken}/yullr`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ name: yullrSignerName.trim(), signatureImage }),
      });
      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to sign');
      const newSignature = { name: yullrSignerName.trim(), signatureImage, signedAt: new Date().toISOString() };
      setSignRecord((prev: any) => prev ? { ...prev, yullrSignature: newSignature } : prev);
      toast.success('Signed as YULLR');

      // Check if both parties have now signed - if so, email PDF
      if (clientAlreadySigned && mountainId) {
        console.log('[signAsYullr] Both parties signed, triggering PDF email...');
        await sendSignedProposalPDF();
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setYullrSigning(false);
    }
  }

  function copySignLink() {
    if (!signToken) return;
    navigator.clipboard.writeText(`${window.location.origin}/sign/${signToken}`).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  }

  async function clearSignatures() {
    if (!signToken) return;
    setConfirmBusy(true);
    try {
      const res = await fetch(`${API_BASE}/proposals/sign/${signToken}/clear-signatures`, {
        method: 'POST',
        headers: API_HEADERS,
      });
      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to clear signatures');
      setSignRecord((prev: any) => prev ? { ...prev, yullrSignature: null, clientSignature: null } : prev);
      setConfirmModal(null);
      toast.success('Signatures cleared — proposal unlocked for editing');
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function deleteProposal() {
    // Prevent deletion if any signatures exist
    if (yullrSigned || clientSigned) {
      toast.error('Cannot delete a signed proposal');
      setConfirmModal(null);
      return;
    }

    setConfirmBusy(true);
    try {
      if (signToken) {
        await fetch(`${API_BASE}/proposals/sign/${signToken}`, {
          method: 'DELETE',
          headers: API_HEADERS,
        });
      }
      if (mountainId) {
        localStorage.removeItem(`proposal:${mountainId}`);
        updateMountain(mountainId, { proposalCreated: false });
      }
      toast.success('Proposal deleted');
      navigate(mountainId ? `/mountains/${mountainId}` : '/');
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
      setConfirmBusy(false);
    }
  }

  async function sendProposalEmail() {
    if (!mountainId || !emailRecipient.trim()) {
      toast.error('Please enter recipient email');
      return;
    }
    setEmailSending(true);
    try {
      const res = await fetch(`${API_BASE}/proposals/send-email`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({
          mountainId,
          recipientEmail: emailRecipient.trim(),
          recipientName: emailRecipientName.trim() || undefined,
          ccEmails: emailCc.trim() || undefined,
          proposalSnapshot: form,
        }),
      });
      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send email');

      // Update local state with new token if created
      if (data.token && !signToken) {
        setSignToken(data.token);
        // Refresh sign record
        const signRes = await fetch(`${API_BASE}/proposals/sign/${data.token}`, { headers: API_HEADERS });
        const signData = await signRes.json() as any;
        if (!signData.error) setSignRecord(signData);
      } else if (signToken) {
        // Refresh to get updated emailLog
        await refreshSignStatus();
      }

      // Add note about proposal being sent
      const recipientDisplay = emailRecipientName.trim() || emailRecipient.trim();
      const noteText = `Proposal #${form.proposalNumber} emailed to ${recipientDisplay}`;
      const existingNotes = getNotesByMountainId(mountainId);
      const isDuplicate = existingNotes.some(note => note.text === noteText);

      if (!isDuplicate) {
        addNote(mountainId, noteText, 'Proposal', true, false);
      }

      setShowEmailModal(false);
      setEmailRecipient('');
      setEmailRecipientName('');
      setEmailCc('support@yullr.com');
      toast.success(`Proposal sent to ${emailRecipient.trim()}`);
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setEmailSending(false);
    }
  }

  // Helper to render the proposal document content
  function renderProposalDocument(ref: React.RefObject<HTMLDivElement>) {
    const installNotesArr = form.installNotes.split('\n').filter(l => l.trim());
    const extraTermsArr = form.additionalTerms.split('\n').filter(l => l.trim());

    return (
      <div ref={ref} style={{ maxWidth: 860, margin: '24px auto', background: '#fff', padding: '60px 70px 100px', boxShadow: '0 2px 20px rgba(0,0,0,0.10)' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #FF5C39', paddingBottom: 24, marginBottom: 32 }}>
            <img src="https://race.yullr.com/_assets/v11/8b719608599361ca2b1d142742df531a9af04c08.png" alt="YULLR" style={{ height: 48 }} />
            <div style={{ textAlign: 'right', color: '#555', fontSize: 12, lineHeight: 1.9 }}>
              <div><strong style={{ color: '#1a1a1a' }}>Proposal #:</strong> {form.proposalNumber}</div>
              <div><strong style={{ color: '#1a1a1a' }}>Date:</strong> {fmtDate(form.date)}</div>
              <div><strong style={{ color: '#1a1a1a' }}>Valid until:</strong> {fmtDate(form.validUntil)}</div>
            </div>
          </div>

          {/* Title */}
          <div style={{ background: '#fff3f0', borderLeft: '4px solid #FF5C39', padding: '16px 20px', marginBottom: 28, borderRadius: '0 6px 6px 0' }}>
            <h1 style={{ fontSize: 19, color: '#FF5C39', marginBottom: 4 }}>Project Proposal</h1>
            <h2 style={{ fontSize: 15, color: '#555', fontWeight: 400 }}>{form.legalEntity || form.clientName}</h2>
            {form.legalEntity && form.mountainName && form.legalEntity !== form.mountainName && (
              <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{form.mountainName}</p>
            )}
          </div>

          {/* 1. Project Summary */}
          <PreviewH2>1. Project Summary</PreviewH2>
          <p style={pStyle}>This proposal outlines the scope, hardware, subscription services, and associated costs for deploying the YULLR platform at <strong>{form.mountainName}</strong>, located at <strong>{form.clientAddress}</strong>.</p>
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
              {form.trails.map((t, i) => (
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
            <li>Installation is estimated to take <strong>{form.installDays || '[X]'}</strong> to complete.</li>
            <li>All installations will be scheduled and coordinated with designated on mountain contact.</li>
            <li>Each Capture Point will be mounted, aligned, and tested on-site before sign-off.</li>
            <li>YULLR will provide full system commissioning and staff orientation prior to the start of the season.</li>
            {installNotesArr.map((n, i) => <li key={i}>{n}</li>)}
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
              {form.requirements.map((r, i) => (
                <tr key={r.id} style={i % 2 === 1 ? evenRow : {}}>
                  <td style={td}>{r.location}</td>
                  <td style={td}>{r.requirement}</td>
                  <td style={td}>{r.details}</td>
                  <td style={td}>{r.responsibility}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 5. YULLR Subscriptions */}
          <PreviewH2>5. YULLR Subscriptions</PreviewH2>
          <p style={pStyle}>Skiers and riders at {form.mountainName} can purchase YULLR subscriptions to receive their footage. The following subscription types are available at published rates:</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 10 }}>
            {[
              { name: 'Day Pass', price: '$20', scope: '1 Mountain · 1 Day', desc: `Access to all YULLR footage captured at ${form.mountainName} for a single visit day.` },
              { name: 'Mountain Pass', price: '$150', scope: '1 Mountain · Full Season', desc: `Unlimited footage access at ${form.mountainName} for the entire ski season.` },
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
              {['A 50% discount applies to all bulk purchases of 25 or more passes of any type.',
                'Bulk passes may be resold up to the published retail rate.',
                'Bulk passes are non-refundable and valid for the current season only.',
                'Additional bulk pass purchases after the initial order must be made in increments of 25.']
                .map((item, i) => <li key={i} style={{ paddingLeft: 14, position: 'relative' }}><span style={{ color: '#FF5C39', fontWeight: 700, position: 'absolute', left: 0 }}>-</span>{item}</li>)}
            </ul>
          </div>
          <div style={{ background: '#f0fdf4', border: '2px solid #22c55e', borderRadius: 8, padding: '14px 18px', marginTop: 12 }}>
            <h3 style={{ color: '#15803d', fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Revenue Share — YULLR.COM Sales</h3>
            <p style={{ color: '#166534', fontSize: 12.5, lineHeight: 1.8 }}>
              {form.mountainName} will receive a <strong>15% profit share</strong> on all pass purchases completed through YULLR.COM that are attributable to {form.mountainName}. This includes all sales tracked through referral links, promo codes, QR codes, on-mountain signage, and any other trackable attribution method. Revenue share payments will be calculated per season and remitted within <strong>30 days</strong> of the end of the season, accompanied by a detailed sales report.
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
              {form.trails.filter(t => trailTotal(t) > 0).map(t => (
                <tr key={t.id}>
                  <td style={{ ...td, paddingLeft: 24 }}>{t.name || '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{t.capturePoints}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(parseAmt(t.unitPrice))}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(trailTotal(t))}</td>
                </tr>
              ))}
              {parseAmt(form.integrationFee) > 0 && (
                <tr><td style={td}>Integration Fee</td><td style={{ ...td, textAlign: 'right' }}>—</td><td style={{ ...td, textAlign: 'right' }}>—</td><td style={{ ...td, textAlign: 'right' }}>{fmtMoney(parseAmt(form.integrationFee))}</td></tr>
              )}
              {parseAmt(form.installFee) > 0 && (
                <tr><td style={td}>Installation &amp; Commissioning</td><td style={{ ...td, textAlign: 'right' }}>—</td><td style={{ ...td, textAlign: 'right' }}>—</td><td style={{ ...td, textAlign: 'right' }}>{fmtMoney(parseAmt(form.installFee))}</td></tr>
              )}
              {parseAmt(form.miscFee) > 0 && (
                <tr><td style={td}>Miscellaneous / Travel</td><td style={{ ...td, textAlign: 'right' }}>—</td><td style={{ ...td, textAlign: 'right' }}>—</td><td style={{ ...td, textAlign: 'right' }}>{fmtMoney(parseAmt(form.miscFee))}</td></tr>
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
                  {form.bulkRows.filter(b => bulkTotal(b) > 0).map(b => (
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
            </tbody>
          </table>
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '10px 14px', marginTop: 10, fontSize: 12, color: '#78350f' }}>
            <strong style={{ display: 'block', marginBottom: 3 }}>Payment Terms</strong>
            {form.paymentTerms}
          </div>

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
              `The YULLR Customer Agreement is for a ${numberToWord(form.termYears || '5')} (${form.termYears || '5'}) year Initial Term.`,
              'Where Customer does not own or operate the Facility, a Facility Authorization Addendum signed by the Facility operator will be required prior to installation.',
              ...extraTermsArr,
            ].map((term, i) => (
              <li key={i} style={{ counterIncrement: 'terms', padding: '7px 0 7px 26px', position: 'relative', borderBottom: '1px solid #f0f0f0', fontSize: 12.5, lineHeight: 1.6, color: '#444' }}>
                <span style={{ position: 'absolute', left: 0, fontWeight: 700, color: '#FF5C39' }}>{i + 1}.</span>
                {term}
              </li>
            ))}
          </ol>

          {/* Footer / Signatures */}
          <div data-pdf-section style={{ marginTop: 40, paddingTop: 20, borderTop: '2px solid #FF5C39', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, color: '#555', width: 340 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Accepted by ({form.clientName})</div>
              {signRecord?.clientSignature ? (
                <div>
                  {(signRecord.clientSignature as any).signatureImage && (
                    <div style={{ marginTop: 8, marginBottom: 8 }}>
                      <img src={(signRecord.clientSignature as any).signatureImage} alt="Client signature" style={{ maxHeight: 50, maxWidth: 200 }} />
                    </div>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 600, color: '#1a1a1a' }}>{signRecord.clientSignature.name}</div>
                    {signRecord.clientSignature.title && (
                      <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{signRecord.clientSignature.title}</div>
                    )}
                    <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                      {new Date(signRecord.clientSignature.signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #999', width: 340, marginTop: 36, paddingTop: 5 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>Signature</span>
                  <span style={{ fontSize: 11, color: '#888' }}>Date</span>
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#555', width: 340, textAlign: 'right' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Authorized by (YULLR)</div>
              {signRecord?.yullrSignature ? (
                <div>
                  {(signRecord.yullrSignature as any).signatureImage && (
                    <div style={{ marginTop: 8, marginBottom: 8, textAlign: 'right' }}>
                      <img src={(signRecord.yullrSignature as any).signatureImage} alt="YULLR signature" style={{ maxHeight: 50, maxWidth: 200 }} />
                    </div>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 600, color: '#1a1a1a' }}>{signRecord.yullrSignature.name}</div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>YULLR, Inc.</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                      {new Date(signRecord.yullrSignature.signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #999', width: 340, marginTop: 36, paddingTop: 5 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>Signature</span>
                  <span style={{ fontSize: 11, color: '#888' }}>Date</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 16 }}>
            YULLR, Inc. &nbsp;|&nbsp; Confidential Proposal &nbsp;|&nbsp; Proposal # {form.proposalNumber}
          </div>
        </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PREVIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (showPreview) {
    return (
      <div id="proposal-print-root" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 13, color: '#1a1a1a', background: '#f4f4f4', minHeight: '100vh' }}>
        {/* Top action bar - hidden on print */}
        <div className="no-print" style={{ background: '#1D2930', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 100 }}>
          <button
            onClick={() => setShowPreview(false)}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <ChevronLeft size={16} /> Edit Proposal
          </button>
          <button
            onClick={handlePrint}
            disabled={printLoading}
            style={{ background: '#ff5c39', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 20px', cursor: printLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, opacity: printLoading ? 0.7 : 1 }}
          >
            {printLoading
              ? <><div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Generating PDF…</>
              : <><Printer size={16} /> Download PDF</>
            }
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>

        {/* Proposal Document */}
        {renderProposalDocument(printRef)}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILDER FORM
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#F2F3F5]">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => mountainId ? navigate(`/mountains/${mountainId}`) : navigate('/')}
            className="p-1 active:opacity-60"
          >
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>
          <div className="flex-1">
            <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px] leading-tight">
              Proposal Builder
            </h1>
            {mountain && (
              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">{mountain.name}</p>
            )}
          </div>

          {/* Right-side actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {bothSigned ? (
              /* Fully executed — only Preview allowed */
              <button
                onClick={openPreview}
                className="flex items-center gap-2 bg-[#ff5c39] text-white rounded-[8px] px-3 py-2 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80"
              >
                <FileText size={16} />
                Preview
              </button>
            ) : ro ? (
              /* Saved / locked state: pencil to the left of Preview */
              <>
                <button
                  onClick={() => setIsEditMode(true)}
                  className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e5e7eb]"
                  title="Edit proposal"
                  aria-label="Edit proposal"
                >
                  <Pencil size={17} className="text-[#1D2930]" />
                </button>
                <button
                  onClick={openPreview}
                  className="flex items-center gap-2 bg-[#ff5c39] text-white rounded-[8px] px-3 py-2 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80"
                >
                  <FileText size={16} />
                  Preview
                </button>
              </>
            ) : (
              /* Editing / new state: Save Proposal + Preview */
              <>
                <button
                  onClick={openPreview}
                  className="flex items-center gap-1.5 bg-[#f3f3f5] text-[#0a0a0a] rounded-[8px] px-3 py-2 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:bg-[#e5e7eb]"
                >
                  <FileText size={15} />
                  Preview
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 bg-[#ff5c39] text-white rounded-[8px] px-3 py-2 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80"
                >
                  <Save size={15} />
                  Save Proposal
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Saved / locked banner */}
      {bothSigned ? (
        <div className="bg-[#fff7ed] border-b border-[#fed7aa] px-4 py-2.5 flex items-center gap-2">
          <Lock size={13} className="text-[#c2410c] flex-shrink-0" />
          <p className="text-[#c2410c] font-['Inter:Regular',sans-serif] text-[13px] flex-1">
            This proposal is fully executed and cannot be edited. Clear signatures to make changes.
          </p>
        </div>
      ) : ro && (
        <div className="bg-[#f0fdf4] border-b border-[#bbf7d0] px-4 py-2.5 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#22c55e] flex-shrink-0" />
          <p className="text-[#166534] font-['Inter:Regular',sans-serif] text-[13px] flex-1">
            Proposal saved — tap the pencil icon to make edits.
          </p>
        </div>
      )}

      <div className="p-4 space-y-4 pb-24">

        {/* ── Proposal Info ── */}
        <div className={section}>
          <h2 className={sectionH}>Proposal Info</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Proposal #</label>
              <input className={inp(ro)} readOnly={ro} value={form.proposalNumber} onChange={e => setField('proposalNumber', e.target.value)} placeholder="YLR-2026-001" />
            </div>
            <div>
              <label className={label}>Date</label>
              <input className={inp(ro)} readOnly={ro} type="date" value={form.date} onChange={e => setField('date', e.target.value)} />
            </div>
          </div>
          <div className="max-w-[50%]">
            <label className={label}>Valid Until</label>
            <input className={inp(ro)} readOnly={ro} type="date" value={form.validUntil} onChange={e => setField('validUntil', e.target.value)} />
          </div>
        </div>

        {/* ── Client Details ── */}
        <div className={section}>
          <h2 className={sectionH}>Client Details</h2>
          <div>
            <label className={label}>Legal Entity Name</label>
            <input
              className={inp(ro)}
              readOnly={ro}
              value={form.legalEntity}
              onChange={e => { setField('legalEntity', e.target.value); setField('clientName', e.target.value); }}
              placeholder="e.g., Whistler Mountain Resort Ltd."
            />
            {!ro && <p className="text-[11px] text-[#9ca3af] mt-1">This will also update the Legal Entity field on the mountain record when saved.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Mountain Name</label>
              <input className={inp(ro)} readOnly={ro} value={form.mountainName} onChange={e => setField('mountainName', e.target.value)} placeholder="Mountain name" />
            </div>
            <div>
              <label className={label}>Site Address</label>
              <input className={inp(ro)} readOnly={ro} value={form.clientAddress} onChange={e => setField('clientAddress', e.target.value)} placeholder="Address" />
            </div>
          </div>
        </div>

        {/* ── Trails / Capture Points ── */}
        <div className={section}>
          <h2 className={sectionH}>Trails / Capture Points</h2>
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[1.8fr_0.8fr_2fr_1fr_1fr_28px] gap-2 mb-1">
            {['Trail Name', 'Capture Points', 'Notes', 'Unit $', 'Total', ''].map(h => (
              <span key={h} className="text-[11px] text-[#9ca3af] font-semibold uppercase">{h}</span>
            ))}
          </div>
          <div className="space-y-3">
            {form.trails.map((t) => {
              // DB trails already used in the form (excluding this row itself)
              const usedIds = form.trails.filter(x => x.trailId && x.id !== t.id).map(x => x.trailId!);
              const availableDbTrails = dbTrails.filter(dt => !usedIds.includes(dt.id));
              const hasDropdown = !t.trailId && !newTrailMode[t.id] && availableDbTrails.length > 0;
              return (
              <div key={t.id} className="border border-[rgba(0,0,0,0.08)] rounded-[8px] p-3 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-[1.8fr_0.8fr_2fr_1fr_1fr_28px] sm:gap-2 sm:items-center">
                <div>
                  <span className="sm:hidden text-[11px] text-[#9ca3af] font-semibold uppercase block mb-1">Trail Name</span>
                  {t.trailId ? (
                    /* Existing DB trail — editable name with cloud badge */
                    <div className="relative">
                      <input className={inp(ro)} readOnly={ro} value={t.name} onChange={e => setTrail(t.id, 'name', e.target.value)} placeholder="Trail name" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2" title="Saved to mountain">
                        <Cloud size={12} className="text-[#22c55e]" />
                      </span>
                    </div>
                  ) : hasDropdown ? (
                    /* Dropdown: pick existing trail or create new */
                    <select
                      className={inp(ro)}
                      value=""
                      onChange={e => {
                        if (e.target.value === '__new__') {
                          setNewTrailMode(prev => ({ ...prev, [t.id]: true }));
                        } else {
                          const sel = dbTrails.find(dt => dt.id === e.target.value);
                          if (sel) setTrailFields(t.id, { name: sel.name, trailId: sel.id });
                        }
                      }}
                    >
                      <option value="">Select trail…</option>
                      {availableDbTrails.map(dt => (
                        <option key={dt.id} value={dt.id}>{dt.name}</option>
                      ))}
                      <option value="__new__">＋ New trail…</option>
                    </select>
                  ) : (
                    /* Free-text for brand new trail — auto-saves to DB on blur */
                    <input
                      className={inp(ro)}
                      readOnly={ro}
                      value={t.name}
                      onChange={e => setTrail(t.id, 'name', e.target.value)}
                      onBlur={() => persistNewTrail(t.id, t.name, t.notes)}
                      placeholder="Trail name"
                      autoFocus={!!newTrailMode[t.id]}
                    />
                  )}
                </div>
                <div>
                  <span className="sm:hidden text-[11px] text-[#9ca3af] font-semibold uppercase block mb-1">Capture Points</span>
                  <input className={inp(ro)} readOnly={ro} type="number" min="1" value={t.capturePoints} onChange={e => setTrail(t.id, 'capturePoints', e.target.value)} placeholder="1" />
                </div>
                <div>
                  <span className="sm:hidden text-[11px] text-[#9ca3af] font-semibold uppercase block mb-1">Notes</span>
                  <input className={inp(ro)} readOnly={ro} value={t.notes} onChange={e => setTrail(t.id, 'notes', e.target.value)} placeholder="Notes" />
                </div>
                <div>
                  <span className="sm:hidden text-[11px] text-[#9ca3af] font-semibold uppercase block mb-1">Unit Price</span>
                  <input className={inp(ro)} readOnly={ro} value={t.unitPrice} onChange={e => setTrail(t.id, 'unitPrice', e.target.value)} placeholder="1000" />
                </div>
                <div>
                  <span className="sm:hidden text-[11px] text-[#9ca3af] font-semibold uppercase block mb-1">Total</span>
                  <input className={`${inp} bg-[#f9f9f9] text-right`} readOnly value={trailTotal(t) ? fmtMoney(trailTotal(t)) : ''} placeholder="$0.00" />
                </div>
                <button onClick={() => removeTrail(t.id)} className="flex-shrink-0 text-[#d1d5db] hover:text-[#ff5c39] active:opacity-60 self-center">
                  <X size={16} />
                </button>
              </div>
              );
            })}
          </div>
          <button
            onClick={addProposalTrail}
            className="mt-2 w-full border border-dashed border-[#ff5c39] text-[#ff5c39] rounded-[8px] py-2.5 text-[13px] font-['Inter:Medium',sans-serif] flex items-center justify-center gap-2 active:bg-[#fff3f0]"
          >
            <Plus size={14} /> Add Trail
          </button>

          {/* Unsaved trails banner */}
          {(() => {
            const unsaved = form.trails.filter(t => t.name.trim() && !t.trailId);
            if (!unsaved.length) return null;
            return (
              <div className="flex items-center gap-3 bg-[#fffbeb] border border-[#fcd34d] rounded-[8px] p-3 mt-2">
                <CloudOff size={16} className="text-[#d97706] flex-shrink-0" />
                <span className="flex-1 text-[#78350f] font-['Inter:Regular',sans-serif] text-[13px]">
                  {unsaved.length} new trail{unsaved.length !== 1 ? 's' : ''} not yet saved to this mountain
                </span>
                <button
                  onClick={saveNewTrailsToDB}
                  className="bg-[#1D2930] text-white rounded-[6px] px-3 py-1.5 text-[12px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80 flex-shrink-0"
                >
                  Save to Mountain
                </button>
              </div>
            );
          })()}
          {trailSubtotal > 0 && (
            <div className="flex justify-between items-center pt-2 border-t border-[rgba(0,0,0,0.08)] mt-2">
              <span className="text-[13px] text-[#6a7282] font-['Inter:Medium',sans-serif]">Trail Subtotal</span>
              <span className="text-[14px] font-['Inter:Medium',sans-serif] font-semibold text-[#0a0a0a]">{fmtMoney(trailSubtotal)}</span>
            </div>
          )}
        </div>

        {/* ── Installation Notes ── */}
        <div className={section}>
          <h2 className={sectionH}>Installation Notes</h2>
          <div>
            <label className={label}>Estimated Install Duration</label>
            <input className={inp(ro)} readOnly={ro} value={form.installDays} onChange={e => setField('installDays', e.target.value)} placeholder="e.g. 2 days" />
          </div>
          <div>
            <label className={label}>Additional Notes <span className="text-[#9ca3af] font-normal">(one per line)</span></label>
            <textarea
              className={`${inp(ro)} min-h-[80px] resize-y`}
              readOnly={ro}
              value={form.installNotes}
              onChange={e => setField('installNotes', e.target.value)}
              placeholder="e.g. All installs during non-operational hours"
            />
          </div>
        </div>

        {/* ── Site Requirements ── */}
        <div className={section}>
          <h2 className={sectionH}>Site Requirements</h2>
          <div className="space-y-3">
            {form.requirements.map(r => (
              <div key={r.id} className="border border-[rgba(0,0,0,0.08)] rounded-[8px] p-3 space-y-2">
                <div className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 items-end">
                  <div>
                    <span className="text-[11px] text-[#9ca3af] font-semibold uppercase block mb-1">Location</span>
                    <input className={inp(ro)} readOnly={ro} value={r.location} onChange={e => setReq(r.id, 'location', e.target.value)} placeholder="e.g. Summit" />
                  </div>
                  <div>
                    <span className="text-[11px] text-[#9ca3af] font-semibold uppercase block mb-1">Requirement</span>
                    <input className={inp(ro)} readOnly={ro} value={r.requirement} onChange={e => setReq(r.id, 'requirement', e.target.value)} placeholder="Power Supply" />
                  </div>
                  <div>
                    <span className="text-[11px] text-[#9ca3af] font-semibold uppercase block mb-1">Responsibility</span>
                    <input className={inp(ro)} readOnly={ro} value={r.responsibility} onChange={e => setReq(r.id, 'responsibility', e.target.value)} placeholder="Client" />
                  </div>
                  <button onClick={() => removeReq(r.id)} className="text-[#d1d5db] hover:text-[#ff5c39] active:opacity-60 pb-1">
                    <X size={16} />
                  </button>
                </div>
                <div>
                  <span className="text-[11px] text-[#9ca3af] font-semibold uppercase block mb-1">Details</span>
                  <input className={inp(ro)} readOnly={ro} value={r.details} onChange={e => setReq(r.id, 'details', e.target.value)} placeholder="Details" />
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={addReq}
            className="mt-2 w-full border border-dashed border-[#ff5c39] text-[#ff5c39] rounded-[8px] py-2.5 text-[13px] font-['Inter:Medium',sans-serif] flex items-center justify-center gap-2 active:bg-[#fff3f0]"
          >
            <Plus size={14} /> Add Requirement
          </button>
        </div>

        {/* ── Final Quote ── */}
        <div className={section}>
          <h2 className={sectionH}>Final Quote</h2>

          <p className="text-[12px] text-[#ff5c39] font-['Inter:Medium',sans-serif] font-semibold uppercase tracking-wider mb-2">Hardware &amp; Installation</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[#6a7282] text-[11px] font-['Inter:Medium',sans-serif] leading-tight">Integration Fee</label>
              <input className={`${inp(ro)} text-right`} readOnly={ro} value={form.integrationFee} onChange={e => setField('integrationFee', e.target.value)} placeholder="$0.00" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[#6a7282] text-[11px] font-['Inter:Medium',sans-serif] leading-tight">Install &amp; Commissioning</label>
              <input className={`${inp(ro)} text-right`} readOnly={ro} value={form.installFee} onChange={e => setField('installFee', e.target.value)} placeholder="$0.00" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[#6a7282] text-[11px] font-['Inter:Medium',sans-serif] leading-tight">Misc / Travel</label>
              <input className={`${inp(ro)} text-right`} readOnly={ro} value={form.miscFee} onChange={e => setField('miscFee', e.target.value)} placeholder="$0.00" />
            </div>
          </div>

          <p className="text-[12px] text-[#ff5c39] font-['Inter:Medium',sans-serif] font-semibold uppercase tracking-wider mt-4 mb-2">Annual Bulk Subscriptions <span className="text-[#9ca3af] font-normal normal-case tracking-normal">(Optional)</span></p>
          <div className="hidden sm:grid grid-cols-[2fr_0.8fr_1fr_1fr_28px] gap-2 mb-1">
            {['Pass Type', 'Qty', 'Unit $', 'Total', ''].map(h => (
              <span key={h} className="text-[11px] text-[#9ca3af] font-semibold uppercase">{h}</span>
            ))}
          </div>
          <div className="space-y-2">
            {form.bulkRows.map(b => (
              <div key={b.id} className="border border-[rgba(0,0,0,0.08)] rounded-[8px] p-2.5 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-[2fr_0.8fr_1fr_1fr_28px] sm:gap-2 sm:items-center">
                <input className={inp(ro)} readOnly={ro} value={b.passType} onChange={e => setBulk(b.id, 'passType', e.target.value)} placeholder="Pass type" />
                <input className={inp(ro)} readOnly={ro} type="number" min="0" value={b.qty} onChange={e => setBulk(b.id, 'qty', e.target.value)} placeholder="0" />
                <input className={inp(ro)} readOnly={ro} value={b.unitPrice} onChange={e => setBulk(b.id, 'unitPrice', e.target.value)} placeholder="$0.00" />
                <input className={`${inp} bg-[#f9f9f9] text-right`} readOnly value={bulkTotal(b) ? fmtMoney(bulkTotal(b)) : ''} placeholder="$0.00" />
                <button onClick={() => removeBulk(b.id)} className="text-[#d1d5db] hover:text-[#ff5c39] active:opacity-60">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addBulk}
            className="mt-2 w-full border border-dashed border-[#ff5c39] text-[#ff5c39] rounded-[8px] py-2.5 text-[13px] font-['Inter:Medium',sans-serif] flex items-center justify-center gap-2 active:bg-[#fff3f0]"
          >
            <Plus size={14} /> Add Pass Type
          </button>

          {hwTotal > 0 && (
            <div className="flex justify-between items-center pt-3 border-t border-[rgba(0,0,0,0.08)] mt-3">
              <span className="text-[13px] text-[#6a7282] font-['Inter:Medium',sans-serif]">Hardware &amp; Installation Total</span>
              <span className="text-[16px] font-['Inter:Medium',sans-serif] font-bold text-[#ff5c39]">{fmtMoney(hwTotal)}</span>
            </div>
          )}

          <div className="mt-4">
            <label className={label}>Payment Terms</label>
            <textarea
              className={`${inp(ro)} min-h-[72px] resize-y`}
              readOnly={ro}
              value={form.paymentTerms}
              onChange={e => setField('paymentTerms', e.target.value)}
            />
          </div>

          <div className="mt-4">
            <label className={label}>Contract Term (Years)</label>
            <input
              className={inp(ro)}
              readOnly={ro}
              type="number"
              min="1"
              max="10"
              value={form.termYears}
              onChange={e => setField('termYears', e.target.value)}
              placeholder="5"
            />
            <p className="text-[11px] text-[#9ca3af] mt-1">
              The Initial Term length for the YULLR Customer Agreement (default: 5 years)
            </p>
          </div>
        </div>

        {/* ── Additional Terms ── */}
        <div className={section}>
          <h2 className={sectionH}>Additional Terms <span className="text-[#9ca3af] font-normal normal-case tracking-normal">(optional — one per line)</span></h2>
          <textarea
            className={`${inp(ro)} min-h-[72px] resize-y`}
            readOnly={ro}
            value={form.additionalTerms}
            onChange={e => setField('additionalTerms', e.target.value)}
            placeholder="e.g. All installations are covered by a 12-month workmanship warranty."
          />
        </div>

        {/* Bottom CTA */}
        {isEditMode ? (
          <button
            onClick={handleSave}
            className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-4 font-['Inter:Medium',sans-serif] font-bold text-[15px] active:opacity-80 flex items-center justify-center gap-2"
          >
            <Save size={18} />
            Save Proposal
          </button>
        ) : (
          <button
            onClick={openPreview}
            className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-4 font-['Inter:Medium',sans-serif] font-bold text-[15px] active:opacity-80 flex items-center justify-center gap-2"
          >
            <FileText size={18} />
            Preview Proposal
          </button>
        )}

        {/* ── Signatures ── (visible once proposal is saved) */}
        {alreadySaved && (
          <div className={section}>
            <div className="flex items-center justify-between">
              <h2 className={sectionH} style={{ marginBottom: 0 }}>Signatures</h2>
              <div className="flex items-center gap-2">
                {bothSigned && (
                  <span className="flex items-center gap-1 bg-[#f0fdf4] text-[#22c55e] text-[11px] font-['Inter:Medium',sans-serif] font-medium px-2.5 py-1 rounded-full">
                    <CheckCircle size={11} /> Fully Executed
                  </span>
                )}
                {(yullrSigned || clientSigned) && (
                  <button
                    onClick={() => setConfirmModal('clearSigs')}
                    className="flex items-center gap-1 text-[11px] font-['Inter:Medium',sans-serif] font-medium text-[#d97706] bg-[#fffbeb] border border-[#fde68a] px-2.5 py-1 rounded-full active:opacity-70"
                    title="Clear signatures to unlock editing"
                  >
                    <XCircle size={11} /> Clear Signatures
                  </button>
                )}
                {signToken && !yullrSigned && !clientSigned && (
                  <button
                    onClick={() => setConfirmModal('deleteProposal')}
                    className="flex items-center gap-1 text-[11px] font-['Inter:Medium',sans-serif] font-medium text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] px-2.5 py-1 rounded-full active:opacity-70"
                    title="Delete this proposal"
                  >
                    <Trash2 size={11} /> Delete
                  </button>
                )}
              </div>
            </div>

            {/* Email and Signing link - hide when both parties have signed */}
            {!bothSigned && (
              <div className="mt-3 space-y-2">
                {/* Send via Email button */}
                <button
                  onClick={() => setShowEmailModal(true)}
                  className="w-full flex items-center justify-center gap-2 bg-[#ff5c39] text-white rounded-[8px] py-3 text-[13px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80"
                >
                  <Send size={14} />
                  Send via Email
                </button>

                {/* Or divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-[rgba(0,0,0,0.08)]" />
                  <span className="text-[11px] text-[#9ca3af] font-['Inter:Medium',sans-serif]">OR</span>
                  <div className="flex-1 border-t border-[rgba(0,0,0,0.08)]" />
                </div>

                {/* Copy link */}
                <div>
                  <p className="text-[11px] text-[#6a7282] font-['Inter:Regular',sans-serif] mb-1.5">
                    Copy link to share manually
                  </p>
                  {signingUrl ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif] truncate min-w-0">
                        {signingUrl}
                      </div>
                      <button
                        onClick={copySignLink}
                        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-[8px] text-[12px] font-['Inter:Medium',sans-serif] font-medium flex-shrink-0 transition-colors ${linkCopied ? 'bg-[#f0fdf4] text-[#22c55e]' : 'bg-[#1D2930] text-white active:opacity-80'}`}
                      >
                        {linkCopied ? <><CheckCircle size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={generateSignLink}
                      disabled={signLoading}
                      className="w-full flex items-center justify-center gap-2 bg-[#1D2930] text-white rounded-[8px] py-2.5 text-[12px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80 disabled:opacity-60"
                    >
                      {signLoading
                        ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating…</>
                        : <>Generate Link</>
                      }
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Email send log - hide when both parties have signed */}
            {!bothSigned && signRecord && Array.isArray((signRecord as any).emailLog) && (signRecord as any).emailLog.length > 0 && (
              <div className="mt-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[10px] px-3 py-2.5">
                <p className="text-[11px] font-['Inter:SemiBold',sans-serif] font-semibold text-[#15803d] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <CheckCircle size={11} /> Email Sent · {(signRecord as any).emailLog.length} {(signRecord as any).emailLog.length === 1 ? 'time' : 'times'}
                </p>
                <div className="space-y-1">
                  {[...(signRecord as any).emailLog].reverse().slice(0, 3).map((log: any, i: number) => (
                    <p key={i} className="text-[11px] text-[#166534] font-['Inter:Regular',sans-serif]">
                      {log.recipientName ? `${log.recipientName} (${log.recipientEmail})` : log.recipientEmail} · {new Date(log.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(log.sentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  ))}
                  {(signRecord as any).emailLog.length > 3 && (
                    <p className="text-[11px] text-[#22c55e] font-['Inter:Regular',sans-serif]">+ {(signRecord as any).emailLog.length - 3} earlier</p>
                  )}
                </div>
              </div>
            )}

            {/* View activity log - hide when both parties have signed */}
            {!bothSigned && signRecord && Array.isArray((signRecord as any).viewLog) && (signRecord as any).viewLog.length > 0 && (
              <div className="mt-3 bg-[#f9f9fb] border border-[rgba(0,0,0,0.07)] rounded-[10px] px-3 py-2.5">
                <p className="text-[11px] font-['Inter:SemiBold',sans-serif] font-semibold text-[#6a7282] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#22c55e]" /> Link Opened · {(signRecord as any).viewLog.length} {(signRecord as any).viewLog.length === 1 ? 'view' : 'views'}
                </p>
                <div className="space-y-1">
                  {[...(signRecord as any).viewLog].reverse().slice(0, 5).map((v: any, i: number) => (
                    <p key={i} className="text-[11px] text-[#6a7282] font-['Inter:Regular',sans-serif]">
                      {new Date(v.viewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(v.viewedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  ))}
                  {(signRecord as any).viewLog.length > 5 && (
                    <p className="text-[11px] text-[#9ca3af] font-['Inter:Regular',sans-serif]">+ {(signRecord as any).viewLog.length - 5} earlier views</p>
                  )}
                </div>
              </div>
            )}

            {/* Signature status cards */}
            {signRecord && (
              bothSigned ? (
                /* Compact view when both parties signed */
                <div className="bg-[#f0fdf4] border-2 border-[#22c55e] rounded-[10px] p-4 mt-1">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle size={20} className="text-[#22c55e] flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-[#0a0a0a] font-['Inter:SemiBold',sans-serif] font-semibold text-[15px]">Proposal Fully Executed</p>
                      <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px]">Both parties have signed this proposal</p>
                    </div>
                  </div>

                  {/* Signature details */}
                  <div className="space-y-2 mb-3 bg-white/60 rounded-[8px] p-3">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-[#6a7282] font-['Inter:Regular',sans-serif]">YULLR</span>
                      <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif]">
                        {signRecord.yullrSignature.name} · {new Date(signRecord.yullrSignature.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-[#6a7282] font-['Inter:Regular',sans-serif]">Client</span>
                      <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif]">
                        {signRecord.clientSignature.name} · {new Date(signRecord.clientSignature.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>

                  {/* Email sent log */}
                  {Array.isArray((signRecord as any).emailLog) && (signRecord as any).emailLog.length > 0 && (
                    <div className="mb-3 bg-white/60 rounded-[8px] p-3">
                      <p className="text-[10px] font-['Inter:SemiBold',sans-serif] font-semibold text-[#15803d] uppercase tracking-wider mb-2">
                        Email Sent · {(signRecord as any).emailLog.length} {(signRecord as any).emailLog.length === 1 ? 'time' : 'times'}
                      </p>
                      <div className="space-y-1">
                        {[...(signRecord as any).emailLog].reverse().slice(0, 2).map((log: any, i: number) => (
                          <p key={i} className="text-[11px] text-[#166534] font-['Inter:Regular',sans-serif]">
                            {log.recipientName ? `${log.recipientName} (${log.recipientEmail})` : log.recipientEmail}
                            <br />
                            <span className="text-[10px] text-[#6a7282]">
                              {new Date(log.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(log.sentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </p>
                        ))}
                        {(signRecord as any).emailLog.length > 2 && (
                          <p className="text-[10px] text-[#22c55e] font-['Inter:Regular',sans-serif]">+ {(signRecord as any).emailLog.length - 2} earlier</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Link opened log */}
                  {Array.isArray((signRecord as any).viewLog) && (signRecord as any).viewLog.length > 0 && (
                    <div className="mb-3 bg-white/60 rounded-[8px] p-3">
                      <p className="text-[10px] font-['Inter:SemiBold',sans-serif] font-semibold text-[#6a7282] uppercase tracking-wider mb-2">
                        Link Opened · {(signRecord as any).viewLog.length} {(signRecord as any).viewLog.length === 1 ? 'view' : 'views'}
                      </p>
                      <div className="space-y-1">
                        {[...(signRecord as any).viewLog].reverse().slice(0, 3).map((v: any, i: number) => (
                          <p key={i} className="text-[11px] text-[#6a7282] font-['Inter:Regular',sans-serif]">
                            {new Date(v.viewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(v.viewedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        ))}
                        {(signRecord as any).viewLog.length > 3 && (
                          <p className="text-[10px] text-[#9ca3af] font-['Inter:Regular',sans-serif]">+ {(signRecord as any).viewLog.length - 3} earlier</p>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={openPreview}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-[#22c55e] text-[#22c55e] rounded-[8px] px-4 py-2.5 text-[13px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80"
                  >
                    <FileText size={15} />
                    View Signed Proposal
                  </button>
                </div>
              ) : (
                /* Individual signature cards when not both signed */
                <div className="space-y-3 mt-1">
                  {/* YULLR signature */}
                  <div className={`rounded-[10px] border p-4 ${yullrSigned ? 'bg-[#f0fdf4] border-[#bbf7d0]' : 'bg-[#f9f9f9] border-[rgba(0,0,0,0.08)]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[12px] font-['Inter:Medium',sans-serif] font-semibold text-[#0a0a0a] uppercase tracking-wider">Your Signature (YULLR)</p>
                      {yullrSigned
                        ? <span className="flex items-center gap-1 text-[#22c55e] text-[11px] font-['Inter:Medium',sans-serif]"><CheckCircle size={11} /> Signed</span>
                        : <span className="flex items-center gap-1 text-[#d97706] text-[11px] font-['Inter:Medium',sans-serif]"><Clock size={11} /> Pending</span>
                      }
                    </div>
                    {yullrSigned ? (
                      <div>
                        {(signRecord.yullrSignature as any)?.signatureImage && (
                          <div className="mb-2 p-2 bg-white border border-[#bbf7d0] rounded-[8px] inline-block">
                            <img
                              src={(signRecord.yullrSignature as any).signatureImage}
                              alt="YULLR signature"
                              style={{ maxHeight: 52, maxWidth: 200, display: 'block' }}
                            />
                          </div>
                        )}
                        <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[15px]">{signRecord.yullrSignature.name}</p>
                        <p className="text-[#6a7282] text-[12px] font-['Inter:Regular',sans-serif] mt-0.5">
                          YULLR, Inc. · {new Date(signRecord.yullrSignature.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 mt-1">
                        <div>
                          <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[12px] mb-1.5">
                            Your Full Name
                          </label>
                          <input
                            className={`${inp(false)} text-[14px]`}
                            placeholder="Your full name"
                            value={yullrSignerName}
                            onChange={e => setYullrSignerName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[12px] mb-1.5">
                            Your Signature
                          </label>
                          <SignaturePad
                            ref={yullrSigPadRef}
                            onChange={(isEmpty) => setYullrSigEmpty(isEmpty)}
                            height={120}
                          />
                        </div>
                        <button
                          onClick={signAsYullr}
                          disabled={yullrSigning || !yullrSignerName.trim() || yullrSigEmpty}
                          className="w-full flex items-center justify-center gap-2 bg-[#ff5c39] text-white rounded-[8px] py-2.5 text-[13px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80 disabled:opacity-50"
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

                  {/* Client signature */}
                  <div className={`rounded-[10px] border p-4 ${clientSigned ? 'bg-[#f0fdf4] border-[#bbf7d0]' : 'bg-[#f9f9f9] border-[rgba(0,0,0,0.08)]'}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[12px] font-['Inter:Medium',sans-serif] font-semibold text-[#0a0a0a] uppercase tracking-wider">Client Signature</p>
                      <div className="flex items-center gap-2">
                        <button onClick={refreshSignStatus} className="p-1 text-[#9ca3af] active:text-[#6a7282]" title="Refresh status">
                          <RefreshCw size={12} />
                        </button>
                        {clientSigned
                          ? <span className="flex items-center gap-1 text-[#22c55e] text-[11px] font-['Inter:Medium',sans-serif]"><CheckCircle size={11} /> Signed</span>
                          : <span className="flex items-center gap-1 text-[#d97706] text-[11px] font-['Inter:Medium',sans-serif]"><Clock size={11} /> Awaiting</span>
                        }
                      </div>
                    </div>
                    {clientSigned ? (
                      <div>
                        {(signRecord.clientSignature as any)?.signatureImage && (
                          <div className="mb-2 p-2 bg-white border border-[#bbf7d0] rounded-[8px] inline-block">
                            <img
                              src={(signRecord.clientSignature as any).signatureImage}
                              alt="Client signature"
                              style={{ maxHeight: 52, maxWidth: 200, display: 'block' }}
                            />
                          </div>
                        )}
                        <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[15px]">{signRecord.clientSignature.name}</p>
                        {signRecord.clientSignature.title && (
                          <p className="text-[#6a7282] text-[12px] font-['Inter:Regular',sans-serif]">{signRecord.clientSignature.title}</p>
                        )}
                        <p className="text-[#6a7282] text-[12px] font-['Inter:Regular',sans-serif] mt-0.5">
                          {new Date(signRecord.clientSignature.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[#9ca3af] text-[12px] font-['Inter:Regular',sans-serif]">
                        Waiting for client to sign via the link above. Tap the refresh icon to check for updates.
                      </p>
                    )}
                  </div>
                </div>
              )
            )}

            {/* ── Continue to Customer Agreement CTA ── */}
            {bothSigned && (
              <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.07)]">
                <p className="text-[11px] text-[#6a7282] font-['Inter:Regular',sans-serif] mb-2 text-center">
                  Proposal fully executed — next step
                </p>
                <button
                  onClick={() => navigate(`/mountains/${mountainId}/agreement`)}
                  className="w-full flex items-center justify-center gap-2 bg-[#f0fdf4] border border-[#86efac] text-[#15803d] rounded-[10px] py-3.5 text-[13px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80"
                >
                  <FileText size={15} />
                  Review &amp; Sign Customer Agreement →
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Confirmation Modal ── */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-[16px] w-full max-w-sm shadow-2xl overflow-hidden">
            {/* Header */}
            <div className={`px-6 pt-6 pb-4 ${confirmModal === 'deleteProposal' ? 'bg-[#fef2f2]' : 'bg-[#fffbeb]'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${confirmModal === 'deleteProposal' ? 'bg-[#fee2e2]' : 'bg-[#fef3c7]'}`}>
                  <AlertTriangle size={20} className={confirmModal === 'deleteProposal' ? 'text-[#dc2626]' : 'text-[#d97706]'} />
                </div>
                <div>
                  <h3 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-semibold text-[16px] leading-snug">
                    {confirmModal === 'deleteProposal' ? 'Delete Proposal?' : 'Clear Signatures?'}
                  </h3>
                  <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mt-1 leading-relaxed">
                    {confirmModal === 'deleteProposal'
                      ? 'This will permanently delete the proposal and all signature data. This cannot be undone.'
                      : 'This will clear both the YULLR and client signatures. The proposal will be unlocked for editing and can be re-submitted for signatures.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={confirmBusy}
                className="flex-1 bg-[#f3f3f5] text-[#0a0a0a] rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:bg-[#e5e7eb] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal === 'deleteProposal' ? deleteProposal : clearSignatures}
                disabled={confirmBusy}
                className={`flex-1 text-white rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2 ${confirmModal === 'deleteProposal' ? 'bg-[#dc2626]' : 'bg-[#d97706]'}`}
              >
                {confirmBusy
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : confirmModal === 'deleteProposal'
                    ? <><Trash2 size={15} /> Delete Proposal</>
                    : <><XCircle size={15} /> Clear Signatures</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved changes dialog */}
      <UnsavedChangesDialog
        isOpen={showPrompt}
        onSave={handleSaveDialog}
        onDiscard={handleDiscard}
        onCancel={handleCancel}
      />

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-[16px] w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-[#1D2930] px-6 pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-white font-['Inter:Medium',sans-serif] font-semibold text-[18px] leading-snug">
                    Send Proposal via Email
                  </h3>
                </div>
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="text-[#9ca3af] hover:text-white active:opacity-70 p-1"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-1.5">
                  Recipient Email <span className="text-[#ff5c39]">*</span>
                </label>
                <input
                  type="email"
                  className={inp(false)}
                  value={emailRecipient}
                  onChange={e => setEmailRecipient(e.target.value)}
                  placeholder="client@example.com"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-1.5">
                  Recipient Name <span className="text-[#9ca3af] font-normal">(optional)</span>
                </label>
                <input
                  className={inp(false)}
                  value={emailRecipientName}
                  onChange={e => setEmailRecipientName(e.target.value)}
                  placeholder="John Smith"
                />
              </div>

              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-1.5">
                  CC <span className="text-[#9ca3af] font-normal">(optional, comma-separated)</span>
                </label>
                <input
                  type="text"
                  className={inp(false)}
                  value={emailCc}
                  onChange={e => setEmailCc(e.target.value)}
                  placeholder="support@yullr.com, team@example.com"
                />
              </div>

              <div className="bg-[#f0f9ff] border border-[#bae6fd] rounded-[8px] p-3">
                <p className="text-[#0369a1] font-['Inter:Regular',sans-serif] text-[12px] leading-relaxed">
                  The recipient will receive an email with a link to review and digitally sign the proposal.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-[#f9fafb] border-t border-[rgba(0,0,0,0.08)] flex gap-3">
              <button
                onClick={() => setShowEmailModal(false)}
                disabled={emailSending}
                className="flex-1 bg-white border border-[rgba(0,0,0,0.1)] text-[#0a0a0a] rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:bg-[#f3f3f5] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={sendProposalEmail}
                disabled={emailSending || !emailRecipient.trim()}
                className="flex-1 bg-[#ff5c39] text-white rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {emailSending ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                ) : (
                  <><Send size={15} /> Send Email</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden preview container for PDF generation */}
      {pdfGenerationMode && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0, opacity: 0, pointerEvents: 'none' }}>
          {renderProposalDocument(hiddenPrintRef)}
        </div>
      )}
    </div>
  );
}

// ─── Preview helpers ───────────────────────────────────────────────────────────

function PreviewH2({ children }: { children: React.ReactNode }) {
  return (
    <div data-pdf-section style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: '#FF5C39', borderBottom: '1px solid #ffd5cc', paddingBottom: 6, margin: '28px 0 12px' }}>
      {children}
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th style={{ background: '#FF5C39', color: '#fff', textAlign: right ? 'right' : 'left', padding: '9px 12px', fontWeight: 600, fontSize: 12 }}>
      {children}
    </th>
  );
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 12.5 };
const td: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #fde8e3' };
const evenRow: React.CSSProperties = { background: '#fff8f7' };
const totalRow: React.CSSProperties = { fontWeight: 700, background: '#fff3f0', borderTop: '2px solid #FF5C39' };
const subtotalRow: React.CSSProperties = { fontWeight: 600, background: '#fef6f4', borderTop: '1px solid #ffd5cc', fontSize: 12 };
const sectionRow: React.CSSProperties = {};
const pStyle: React.CSSProperties = { lineHeight: 1.75, color: '#333', marginBottom: 10, fontSize: 13 };