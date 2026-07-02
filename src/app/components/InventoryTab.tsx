import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  MultiFormatReader, BinaryBitmap, HybridBinarizer, HTMLCanvasElementLuminanceSource,
  DecodeHintType, BarcodeFormat,
} from '@zxing/library';
import {
  Plus, Search, X, ChevronDown, ChevronRight, Check,
  Package, Server as ServerIcon, Camera, Wifi, Wrench,
  Pencil, Trash2, Building2, BarChart3, Filter, Scan, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../context/DataContext';
import type {
  Asset, InventoryCategory, InventoryStatus,
} from '../context/DataContext';
import {
  INVENTORY_SUBCATEGORIES, MOUNTAIN_DEPLOYMENTS,
} from '../context/DataContext';
import { DeleteConfirmModal } from './DeleteConfirmModal';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES: InventoryCategory[] = [
  'Server Hardware', 'Network Equipment', 'Cameras', 'Miscellaneous Items',
];

const STATUSES: InventoryStatus[] = ['In Stock', 'Deployed', 'In a Build', 'Retired'];

const STATUS_COLORS: Record<InventoryStatus, string> = {
  'In Stock':   'bg-[#e8f5e9] text-[#2e7d32]',
  'Deployed':   'bg-[#e3f2fd] text-[#1565c0]',
  'In a Build': 'bg-[#fff3e0] text-[#e65100]',
  'Retired':    'bg-[#f5f5f5] text-[#757575]',
};

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactNode> = {
  'Server Hardware':        <ServerIcon size={14} />,
  'Network Equipment':      <Wifi size={14} />,
  'Cameras':                <Camera size={14} />,
  'Miscellaneous Items': <Wrench size={14} />,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function assetDisplayName(a: Asset) {
  const mfr = a.customManufacturer || a.manufacturer || '';
  const mdl = a.customModel || a.model || '';
  if (mfr && mdl) return `${mfr} ${mdl}`;
  if (mfr) return mfr;
  if (mdl) return mdl;
  return a.inventorySubcategory || a.inventoryCategory || 'Unnamed Item';
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

interface AssetFormData {
  yullrInventoryNumber: string;
  dateAddedToInventory: string;
  inventoryCategory: InventoryCategory | '';
  inventorySubcategory: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  upc: string;
  dateOfPurchase: string;
  vendor: string;
  cost: string;
  mountainDeployment: string;
  notes: string;
  locationId: string;
  ipAddress: string;
  serverId: string;
  serverSlotAssignments: Record<string, string>; // slot label → asset id
}

// Fixed server component slots — Drive 1/2/3 all pull from the "Drive" subcategory
export const SERVER_SLOTS: { label: string; subcat: string }[] = [
  { label: 'Case',        subcat: 'Case' },
  { label: 'Power',       subcat: 'Power' },
  { label: 'Motherboard', subcat: 'Motherboard' },
  { label: 'CPU',         subcat: 'CPU' },
  { label: 'GPU',         subcat: 'GPU' },
  { label: 'RAM',         subcat: 'RAM' },
  { label: 'Drive 1',     subcat: 'Drive' },
  { label: 'Drive 2',     subcat: 'Drive' },
  { label: 'Drive 3',     subcat: 'Drive' },
  { label: 'Cooling',     subcat: 'Cooling' },
];

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM: AssetFormData = {
  yullrInventoryNumber: '',
  dateAddedToInventory: today(),
  inventoryCategory: '',
  inventorySubcategory: '',
  manufacturer: '',
  model: '',
  serialNumber: '',
  upc: '',
  dateOfPurchase: '',
  vendor: '',
  cost: '',
  mountainDeployment: 'Unassigned / Warehouse',
  notes: '',
  locationId: '',
  ipAddress: '',
  serverId: '',
  serverSlotAssignments: {},
};

function slotAssignmentsFromIds(ids: string[], assets: Asset[]): Record<string, string> {
  const assignments: Record<string, string> = {};
  const usedIds = new Set<string>();
  SERVER_SLOTS.forEach(slot => {
    const match = ids.find(id => {
      if (usedIds.has(id)) return false;
      const a = assets.find(x => x.id === id);
      return a?.inventorySubcategory === slot.subcat;
    });
    if (match) { assignments[slot.label] = match; usedIds.add(match); }
  });
  return assignments;
}

function assetToForm(a: Asset, assets: Asset[]): AssetFormData {
  return {
    yullrInventoryNumber: a.yullrInventoryNumber || '',
    dateAddedToInventory: a.dateAddedToInventory || today(),
    inventoryCategory: (a.inventoryCategory as InventoryCategory) || '',
    inventorySubcategory: a.inventorySubcategory || '',
    manufacturer: a.customManufacturer || a.manufacturer || '',
    model: a.customModel || a.model || '',
    serialNumber: a.serialNumber || '',
    upc: a.upc || '',
    dateOfPurchase: a.dateOfPurchase || '',
    vendor: a.vendor || '',
    cost: a.cost !== undefined ? String(a.cost) : '',
    mountainDeployment: a.mountainDeployment || 'Unassigned / Warehouse',
    notes: a.notes || '',
    locationId: a.locationId || '',
    ipAddress: a.ipAddress || '',
    serverId: (a.inventoryCategory === 'Cameras' ? a.serverId : '') || '',
    serverSlotAssignments: slotAssignmentsFromIds(a.serverComponentIds || [], assets),
  };
}

// ─── Barcode decode helper (runs outside React, no hooks) ────────────────────

const BARCODE_HINTS = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
  ]],
  [DecodeHintType.TRY_HARDER, true],
]);

function decodeWithZxing(canvas: HTMLCanvasElement): string | null {
  try {
    const luminance = new HTMLCanvasElementLuminanceSource(canvas);
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));
    const reader = new MultiFormatReader();
    reader.setHints(BARCODE_HINTS);
    return reader.decode(bitmap).getText();
  } catch {
    return null;
  }
}

async function decodeBarcode(file: File): Promise<string | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      // Try native BarcodeDetector first (Chrome/Android — fastest)
      if (typeof (window as any).BarcodeDetector !== 'undefined') {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39'],
          });
          const results = await detector.detect(canvas);
          if (results.length > 0) { resolve(results[0].rawValue); return; }
        } catch { /* fall through to ZXing */ }
      }
      resolve(decodeWithZxing(canvas));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── Select with inline Add New ───────────────────────────────────────────────

function SelectWithAdd({
  value, options, placeholder, disabled = false, onSelect, onAdd,
}: {
  value: string;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  onSelect: (v: string) => void;
  onAdd: (v: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '__add__') { setAdding(true); setNewVal(''); }
    else onSelect(e.target.value);
  };

  const commit = () => {
    const trimmed = newVal.trim();
    if (trimmed) { onAdd(trimmed); }
    setAdding(false);
    setNewVal('');
  };

  if (adding) {
    return (
      <div className="flex gap-1.5">
        <input
          type="text"
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setAdding(false); }}
          autoFocus
          placeholder="Type and press Enter…"
          className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none border border-[#F95C39]"
        />
        <button type="button" onClick={commit} className="px-3 py-2.5 bg-[#F95C39] text-white rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] active:opacity-80">
          Add
        </button>
        <button type="button" onClick={() => setAdding(false)} className="px-3 py-2.5 bg-[#f3f3f5] text-[#6a7282] rounded-[8px] text-[13px] active:bg-[#e5e7eb]">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={disabled}
      className={`w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[14px] appearance-none ${disabled ? 'text-[#6a7282] cursor-not-allowed' : 'text-[#0a0a0a]'}`}
    >
      <option value="">{placeholder || 'Select…'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
      <option value="__add__">+ Add New…</option>
    </select>
  );
}

// ─── Shared camera viewfinder ─────────────────────────────────────────────────

function ScanViewfinder({
  onStop,
  videoRef,
  canvasRef,
}: {
  onStop: () => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}) {
  return (
    <div className="mt-2 rounded-[10px] overflow-hidden bg-black relative">
      <video ref={videoRef} muted playsInline className="w-full h-40 object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-56 h-14 border-2 border-[#F95C39] rounded-[4px] opacity-80" />
      </div>
      <button
        type="button"
        onClick={onStop}
        className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 active:opacity-70"
      >
        <X size={14} />
      </button>
      <p className="absolute bottom-2 left-0 right-0 text-center text-white text-[11px] opacity-80">
        Hold barcode steady inside the box
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const SERVER_EMPTY: AssetFormData = {
  ...EMPTY_FORM,
  inventoryCategory: 'Server Hardware',
  inventorySubcategory: 'Complete Server',
};


function AddEditModal({
  editAsset,
  isServerBuild = false,
  onClose,
}: {
  editAsset: Asset | null;
  isServerBuild?: boolean;
  onClose: () => void;
}) {
  const { addAsset, updateAsset, assets, options, addOption, mountains, getLocationsByMountainId } = useData();
  const mountainOptions = useMemo(
    () => ['Unassigned / Warehouse', ...mountains.map(m => m.name).sort()],
    [mountains],
  );

  const initialForm = editAsset ? assetToForm(editAsset, assets) : isServerBuild ? SERVER_EMPTY : EMPTY_FORM;
  const [form, setForm] = useState<AssetFormData>(initialForm);
  // Step 1 = category picker, Step 2 = fields. Skip step 1 when editing or server build.
  const [step, setStep] = useState<'category' | 'form'>(
    editAsset || isServerBuild || initialForm.inventoryCategory ? 'form' : 'category',
  );

  const [scanTarget, setScanTarget] = useState<'upc' | 'serial' | 'yin' | null>(null);
  const [upcLooking, setUpcLooking] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const cat = form.inventoryCategory as InventoryCategory | '';
  const isServer = cat === 'Server Hardware' && form.inventorySubcategory === 'Complete Server';
  const isServerPart = cat === 'Server Hardware' && form.inventorySubcategory !== 'Complete Server';
  const isCamera = cat === 'Cameras';

  const assignedComponentIds = useMemo(
    () => Object.values(form.serverSlotAssignments).filter(Boolean),
    [form.serverSlotAssignments],
  );

  const availableComponents = useMemo(() =>
    assets.filter(a =>
      a.id !== editAsset?.id &&
      a.inventoryCategory === 'Server Hardware' &&
      a.inventorySubcategory !== 'Complete Server' &&
      // Unassigned, or already belongs to the server being edited
      (!a.serverId || a.serverId === editAsset?.id),
    ),
    [assets, editAsset],
  );


  const selectedMountainId = mountains.find(m => m.name === form.mountainDeployment)?.id;
  const mountainLocations = selectedMountainId ? getLocationsByMountainId(selectedMountainId) : [];
  const showLocationPicker = !!selectedMountainId;

  const set = (k: keyof AssetFormData, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  // ── Scanner ──────────────────────────────────────────────────────────────────

  const stopScan = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanTarget(null);
  }, []);

  useEffect(() => () => { stopScan(); }, [stopScan]);

  const startScan = useCallback(async (target: 'upc' | 'serial' | 'yin') => {
    if (!navigator.mediaDevices?.getUserMedia) { toast.error('Camera not supported'); return; }
    setScanTarget(target);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const reader = new MultiFormatReader();
      reader.setHints(BARCODE_HINTS);
      const tick = () => {
        if (!streamRef.current || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        try {
          const lum = new HTMLCanvasElementLuminanceSource(canvas);
          const bmp = new BinaryBitmap(new HybridBinarizer(lum));
          const code = reader.decode(bmp).getText();
          stopScan();
          if (target === 'upc') { setForm(p => ({ ...p, upc: code })); lookupUpcCode(code); }
          else if (target === 'serial') setForm(p => ({ ...p, serialNumber: code }));
          else if (target === 'yin') setForm(p => ({ ...p, yullrInventoryNumber: code }));
          return;
        } catch { /* no barcode this frame */ }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err: any) {
      stopScan();
      if (err?.name === 'NotAllowedError') toast.error('Camera permission denied');
      else if (err?.name === 'NotFoundError') toast.error('No camera found');
      else toast.error('Could not start camera');
    }
  }, [stopScan]);

  const lookupUpcCode = useCallback(async (upc: string) => {
    setUpcLooking(true);
    try {
      const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`);
      const data = await res.json();
      const item = data?.items?.[0];
      if (item) {
        if (item.brand) setForm(p => ({ ...p, manufacturer: p.manufacturer || item.brand }));
        if (item.model) setForm(p => ({ ...p, model: p.model || item.model }));
        toast.success('Product info found');
      }
    } catch { /* silent */ } finally { setUpcLooking(false); }
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = () => {
    if (!cat) { toast.error('Select a category'); return; }
    if (isServerPart && !form.inventorySubcategory) { toast.error('Select a subcategory'); return; }

    const costVal = isServer
      ? (assignedComponentIds.reduce((s, id) => s + (assets.find(a => a.id === id)?.cost || 0), 0) || undefined)
      : (form.cost.trim() ? parseFloat(form.cost) : undefined);

    const patch: Omit<Asset, 'id'> = {
      type: cat === 'Cameras' ? 'Camera' : cat === 'Network Equipment' ? 'Network Gear' : cat === 'Server Hardware' ? 'Server' : 'Miscellaneous',
      yullrInventoryNumber: form.yullrInventoryNumber.trim() || undefined,
      dateAddedToInventory: form.dateAddedToInventory || today(),
      inventoryCategory: cat,
      inventorySubcategory: form.inventorySubcategory || undefined,
      manufacturer: form.manufacturer || undefined,
      customManufacturer: form.manufacturer || undefined,
      model: form.model || undefined,
      customModel: form.model || undefined,
      serialNumber: form.serialNumber || undefined,
      upc: form.upc || undefined,
      dateOfPurchase: form.dateOfPurchase || undefined,
      vendor: form.vendor || undefined,
      cost: costVal,
      mountainDeployment: form.mountainDeployment,
      notes: form.notes || undefined,
      locationId: form.locationId || undefined,
      ipAddress: form.ipAddress || undefined,
      serverComponentIds: isServer ? assignedComponentIds : undefined,
      buildDate: isServer && !editAsset ? new Date().toISOString().slice(0, 10) : editAsset?.buildDate,
    };

    const resolvedMountainId = mountains.find(m => m.name === form.mountainDeployment)?.id;
    if (resolvedMountainId) (patch as any).mountainId = resolvedMountainId;

    if (form.manufacturer.trim()) {
      addOption(`inventory:mfr:${cat}`, form.manufacturer.trim());
      if (form.model.trim()) addOption(`inventory:mdl:${cat}:${form.manufacturer.trim()}`, form.model.trim());
    }

    if (editAsset) {
      const newLog = [...(editAsset.deploymentLog || [])];
      if (form.mountainDeployment !== editAsset.mountainDeployment)
        newLog.push({ mountainName: form.mountainDeployment, timestamp: new Date().toISOString() });
      updateAsset(editAsset.id, { ...patch, deploymentLog: newLog });
      if (isServer) {
        const prev = editAsset.serverComponentIds || [];
        const added = assignedComponentIds.filter(id => !prev.includes(id));
        const removed = prev.filter(id => !assignedComponentIds.includes(id));
        const mp = { mountainDeployment: form.mountainDeployment, ...(resolvedMountainId ? { mountainId: resolvedMountainId } : {}) };
        added.forEach(id => updateAsset(id, { inventoryStatus: 'In a Build', serverId: editAsset.id, ...mp }));
        removed.forEach(id => updateAsset(id, { inventoryStatus: 'In Stock', serverId: undefined }));
        if (form.mountainDeployment !== editAsset.mountainDeployment)
          assignedComponentIds.filter(id => !added.includes(id)).forEach(id => updateAsset(id, mp));
      }
      toast.success('Item updated');
    } else {
      const newId = addAsset({ ...patch, deploymentLog: [{ mountainName: form.mountainDeployment, timestamp: new Date().toISOString() }] });
      if (isServer) {
        const mp = { mountainDeployment: form.mountainDeployment, ...(resolvedMountainId ? { mountainId: resolvedMountainId } : {}) };
        assignedComponentIds.forEach(id => updateAsset(id, { inventoryStatus: 'In a Build', serverId: newId, ...mp }));
      }
      toast.success('Item added to inventory');
    }
    onClose();
  };

  // ── Shared field helpers ──────────────────────────────────────────────────────

  const ScanBtn = ({ target }: { target: 'upc' | 'serial' | 'yin' }) => (
    <button
      type="button"
      onClick={() => scanTarget === target ? stopScan() : startScan(target)}
      className={`shrink-0 w-10 h-10 rounded-[8px] flex items-center justify-center transition-colors ${scanTarget === target ? 'bg-[#F95C39] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
    >
      {target === 'upc' && upcLooking ? <Loader2 size={15} className="animate-spin" /> : <Scan size={15} />}
    </button>
  );

  const subcats = cat ? INVENTORY_SUBCATEGORIES[cat] : [];

  // ── Mountain + Location shared block ─────────────────────────────────────────

  const MountainLocationFields = () => (
    <>
      <div>
        <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Mountain Deployment</label>
        <select
          value={form.mountainDeployment}
          onChange={e => { set('mountainDeployment', e.target.value); set('locationId', ''); }}
          className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] appearance-none"
        >
          {mountainOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {showLocationPicker && (
        <div>
          <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Location (optional)</label>
          <select value={form.locationId} onChange={e => set('locationId', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] appearance-none">
            <option value="">— No specific location —</option>
            {mountainLocations.length === 0
              ? <option disabled value="">No locations for this mountain yet</option>
              : mountainLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}
    </>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  const title = editAsset ? 'Edit Item'
    : isServerBuild ? 'Build a Server'
    : step === 'category' ? 'Add Inventory Item'
    : cat ? `Add ${cat}` : 'Add Inventory Item';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[16px] w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          {step === 'form' && !editAsset && !isServerBuild && (
            <button type="button" onClick={() => { setStep('category'); set('inventoryCategory', ''); set('inventorySubcategory', ''); }} className="p-1.5 rounded-full bg-[#f3f3f5] active:bg-[#e5e7eb]">
              <ChevronRight size={16} className="text-[#6a7282] rotate-180" />
            </button>
          )}
          <h2 className="flex-1 text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[17px]">{title}</h2>
          {editAsset?.yullrInventoryNumber && (
            <span className="text-[11px] font-mono text-[#6a7282] bg-[#f3f3f5] px-2 py-1 rounded-full">{editAsset.yullrInventoryNumber}</span>
          )}
          <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5] active:bg-[#e5e7eb]">
            <X size={16} className="text-[#6a7282]" />
          </button>
        </div>

        {/* ── STEP 1: Category picker ── */}
        {step === 'category' ? (
          <div className="p-5 space-y-3">
            <p className="text-[13px] text-[#6a7282]">What type of item are you adding?</p>
            <div className="grid grid-cols-1 gap-3">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    set('inventoryCategory', c);
                    set('inventorySubcategory', '');
                    setStep('form');
                  }}
                  className="flex items-center gap-4 px-4 py-4 rounded-[12px] border border-[rgba(0,0,0,0.1)] bg-white text-left active:bg-[#f9fafb] transition-colors"
                >
                  <div className="w-10 h-10 rounded-[10px] bg-[#f3f3f5] flex items-center justify-center text-[#6a7282]">
                    {CATEGORY_ICONS[c]}
                  </div>
                  <span className="text-[15px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{c}</span>
                  <ChevronRight size={16} className="text-[#d1d5db] ml-auto" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── STEP 2: Form ── */
          <>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">

              {/* YIN + Date Added — always shown */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">YULLR Inventory #</label>
                  <div className="flex gap-1.5">
                    <input type="text" value={form.yullrInventoryNumber} onChange={e => set('yullrInventoryNumber', e.target.value)} placeholder="YIN-000001" className="flex-1 min-w-0 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none font-mono" />
                    <ScanBtn target="yin" />
                  </div>
                  {scanTarget === 'yin' && <ScanViewfinder onStop={stopScan} videoRef={videoRef} canvasRef={canvasRef} />}
                </div>
                <div>
                  <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Date Added</label>
                  <input type="date" value={form.dateAddedToInventory} onChange={e => set('dateAddedToInventory', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
                </div>
              </div>

              {/* ── CAMERA FORM ── */}
              {isCamera && (
                <>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Manufacturer</label>
                    <SelectWithAdd
                      value={form.manufacturer}
                      options={options['inventory:mfr:Cameras'] || []}
                      placeholder="Select manufacturer…"
                      onSelect={v => { set('manufacturer', v); set('model', ''); }}
                      onAdd={v => { addOption('inventory:mfr:Cameras', v); set('manufacturer', v); set('model', ''); }}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Model</label>
                    <SelectWithAdd
                      value={form.model}
                      options={form.manufacturer ? (options[`inventory:mdl:Cameras:${form.manufacturer}`] || []) : []}
                      placeholder={form.manufacturer ? 'Select model…' : 'Select manufacturer first'}
                      disabled={!form.manufacturer}
                      onSelect={v => set('model', v)}
                      onAdd={v => { addOption(`inventory:mdl:Cameras:${form.manufacturer}`, v); set('model', v); }}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Serial Number</label>
                    <div className="flex gap-1.5">
                      <input type="text" value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} placeholder="S/N" className="flex-1 min-w-0 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none font-mono" />
                      <ScanBtn target="serial" />
                    </div>
                    {scanTarget === 'serial' && <ScanViewfinder onStop={stopScan} videoRef={videoRef} canvasRef={canvasRef} />}
                  </div>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">UPC</label>
                    <div className="flex gap-1.5">
                      <input type="text" value={form.upc} onChange={e => { set('upc', e.target.value); if (e.target.value.length >= 12) lookupUpcCode(e.target.value); }} placeholder="Barcode" className="flex-1 min-w-0 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none font-mono" />
                      <ScanBtn target="upc" />
                    </div>
                    {scanTarget === 'upc' && <ScanViewfinder onStop={stopScan} videoRef={videoRef} canvasRef={canvasRef} />}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Vendor</label>
                      <input type="text" value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="e.g. CDW" className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Date of Purchase</label>
                      <input type="date" value={form.dateOfPurchase} onChange={e => set('dateOfPurchase', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Cost</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282] text-[14px]">$</span>
                      <input type="number" min="0" step="0.01" value={form.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00" className="w-full bg-[#f3f3f5] rounded-[8px] pl-7 pr-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
                    </div>
                  </div>
                  <MountainLocationFields />
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Notes</label>
                    <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Any additional notes…" className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none resize-none" />
                  </div>
                </>
              )}

              {/* ── SERVER HARDWARE PART FORM ── */}
              {isServerPart && (
                <>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">
                      Subcategory <span className="text-[#F95C39]">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['Case', 'Power', 'Motherboard', 'CPU', 'GPU', 'RAM', 'NVME', 'SSD', 'HDD', 'Cooling', 'Other'].map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => set('inventorySubcategory', s)}
                          className={`px-3 py-2.5 rounded-[8px] border text-[13px] font-['Inter:Medium',sans-serif] transition-colors ${
                            form.inventorySubcategory === s
                              ? 'border-[#F95C39] bg-[#fff4f1] text-[#F95C39]'
                              : 'border-[rgba(0,0,0,0.1)] bg-white text-[#0a0a0a]'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Manufacturer</label>
                    <SelectWithAdd
                      value={form.manufacturer}
                      options={options[`inventory:mfr:Server Hardware`] || []}
                      placeholder="Select manufacturer…"
                      onSelect={v => { set('manufacturer', v); set('model', ''); }}
                      onAdd={v => { addOption(`inventory:mfr:Server Hardware`, v); set('manufacturer', v); set('model', ''); }}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Model</label>
                    <SelectWithAdd
                      value={form.model}
                      options={form.manufacturer ? (options[`inventory:mdl:Server Hardware:${form.manufacturer}`] || []) : []}
                      placeholder={form.manufacturer ? 'Select model…' : 'Select manufacturer first'}
                      disabled={!form.manufacturer}
                      onSelect={v => set('model', v)}
                      onAdd={v => { addOption(`inventory:mdl:Server Hardware:${form.manufacturer}`, v); set('model', v); }}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Serial Number</label>
                    <div className="flex gap-1.5">
                      <input type="text" value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} placeholder="S/N" className="flex-1 min-w-0 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none font-mono" />
                      <ScanBtn target="serial" />
                    </div>
                    {scanTarget === 'serial' && <ScanViewfinder onStop={stopScan} videoRef={videoRef} canvasRef={canvasRef} />}
                  </div>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">UPC</label>
                    <div className="flex gap-1.5">
                      <input type="text" value={form.upc} onChange={e => { set('upc', e.target.value); if (e.target.value.length >= 12) lookupUpcCode(e.target.value); }} placeholder="Barcode" className="flex-1 min-w-0 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none font-mono" />
                      <ScanBtn target="upc" />
                    </div>
                    {scanTarget === 'upc' && <ScanViewfinder onStop={stopScan} videoRef={videoRef} canvasRef={canvasRef} />}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Vendor</label>
                      <input type="text" value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="e.g. Newegg" className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Date of Purchase</label>
                      <input type="date" value={form.dateOfPurchase} onChange={e => set('dateOfPurchase', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Cost</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282] text-[14px]">$</span>
                      <input type="number" min="0" step="0.01" value={form.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00" className="w-full bg-[#f3f3f5] rounded-[8px] pl-7 pr-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
                    </div>
                  </div>
                  <MountainLocationFields />
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Notes</label>
                    <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Any additional notes…" className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none resize-none" />
                  </div>
                </>
              )}

              {/* ── SERVER BUILD FORM ── */}
              {isServer && (
                <>
                  <div className="flex items-center justify-between bg-[#f9fafb] border border-[rgba(0,0,0,0.08)] rounded-[8px] px-4 py-3">
                    <span className="text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide">Total Build Cost</span>
                    <span className="text-[16px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                      {(() => { const t = assignedComponentIds.reduce((s, id) => s + (assets.find(a => a.id === id)?.cost || 0), 0); return t > 0 ? fmt(t) : <span className="text-[#6a7282] text-[13px]">Assign components to calculate</span>; })()}
                    </span>
                  </div>
                  <MountainLocationFields />
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-2 uppercase tracking-wide">
                      Components {assignedComponentIds.length > 0 && <span className="normal-case text-[#F95C39]">· {assignedComponentIds.length} assigned</span>}
                    </label>
                    <div className="border border-[rgba(0,0,0,0.08)] rounded-[10px] divide-y divide-[rgba(0,0,0,0.06)] overflow-hidden">
                      {SERVER_SLOTS.map(slot => {
                        const slotItems = availableComponents.filter(a =>
                          a.inventorySubcategory === slot.subcat &&
                          (!assignedComponentIds.includes(a.id) || form.serverSlotAssignments[slot.label] === a.id),
                        );
                        const currentId = form.serverSlotAssignments[slot.label] || '';
                        const currentAsset = currentId ? assets.find(a => a.id === currentId) : null;
                        return (
                          <div key={slot.label} className="flex items-center gap-3 px-3 py-2.5 bg-white">
                            <span className="text-[12px] font-['Inter:Medium',sans-serif] text-[#1D2930] w-24 shrink-0">{slot.label}</span>
                            <select value={currentId} onChange={e => set('serverSlotAssignments', { ...form.serverSlotAssignments, [slot.label]: e.target.value })}
                              className={`flex-1 rounded-[6px] px-2.5 py-2 text-[13px] appearance-none border ${currentId ? 'bg-[#fff4f1] border-[rgba(249,92,57,0.2)] text-[#0a0a0a]' : 'bg-[#f3f3f5] border-transparent text-[#6a7282]'}`}>
                              <option value="">— None —</option>
                              {slotItems.map(item => (
                                <option key={item.id} value={item.id}>
                                  {assetDisplayName(item)}{item.serialNumber ? ` · ...${item.serialNumber.slice(-4)}` : item.yullrInventoryNumber ? ` · ${item.yullrInventoryNumber}` : ''}
                                </option>
                              ))}
                            </select>
                            {currentAsset?.cost !== undefined && <span className="text-[11px] text-[#6a7282] shrink-0">{fmt(currentAsset.cost)}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Notes</label>
                    <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Any additional notes…" className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none resize-none" />
                  </div>
                </>
              )}

              {/* ── REGULAR FORM (Network, Misc, Office) ── */}
              {!isCamera && !isServer && !isServerPart && cat && (
                <>
                  {subcats.length > 0 && (
                    <div>
                      <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Subcategory</label>
                      <select value={form.inventorySubcategory} onChange={e => set('inventorySubcategory', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] appearance-none">
                        <option value="">Select subcategory…</option>
                        {subcats.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Manufacturer</label>
                    <SelectWithAdd
                      value={form.manufacturer}
                      options={options[`inventory:mfr:${cat}`] || []}
                      placeholder="Select manufacturer…"
                      onSelect={v => { set('manufacturer', v); set('model', ''); }}
                      onAdd={v => { addOption(`inventory:mfr:${cat}`, v); set('manufacturer', v); set('model', ''); }}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Model</label>
                    <SelectWithAdd
                      value={form.model}
                      options={form.manufacturer ? (options[`inventory:mdl:${cat}:${form.manufacturer}`] || []) : []}
                      placeholder={form.manufacturer ? 'Select model…' : 'Select manufacturer first'}
                      disabled={!form.manufacturer}
                      onSelect={v => set('model', v)}
                      onAdd={v => { addOption(`inventory:mdl:${cat}:${form.manufacturer}`, v); set('model', v); }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Serial Number</label>
                      <div className="flex gap-1.5">
                        <input type="text" value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} placeholder="S/N" className="flex-1 min-w-0 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none font-mono" />
                        <ScanBtn target="serial" />
                      </div>
                      {scanTarget === 'serial' && <ScanViewfinder onStop={stopScan} videoRef={videoRef} canvasRef={canvasRef} />}
                    </div>
                    <div>
                      <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">UPC</label>
                      <div className="flex gap-1.5">
                        <input type="text" value={form.upc} onChange={e => { set('upc', e.target.value); if (e.target.value.length >= 12) lookupUpcCode(e.target.value); }} placeholder="Barcode" className="flex-1 min-w-0 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none font-mono" />
                        <ScanBtn target="upc" />
                      </div>
                      {scanTarget === 'upc' && <ScanViewfinder onStop={stopScan} videoRef={videoRef} canvasRef={canvasRef} />}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Vendor</label>
                      <input type="text" value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="e.g. CDW" className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Date of Purchase</label>
                      <input type="date" value={form.dateOfPurchase} onChange={e => set('dateOfPurchase', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Cost</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282] text-[14px]">$</span>
                      <input type="number" min="0" step="0.01" value={form.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00" className="w-full bg-[#f3f3f5] rounded-[8px] pl-7 pr-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
                    </div>
                  </div>
                  <MountainLocationFields />
                  <div>
                    <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Notes</label>
                    <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Any additional notes…" className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none resize-none" />
                  </div>
                </>
              )}

            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] active:bg-[#e5e7eb]">Cancel</button>
              <button type="button" onClick={handleSave} className="flex-1 bg-[#F95C39] text-white rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] active:opacity-80">
                {editAsset ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Asset Card ───────────────────────────────────────────────────────────────

function AssetCard({
  asset,
  onEdit,
  onDelete,
  componentCount,
}: {
  asset: Asset;
  onEdit: () => void;
  onDelete: () => void;
  componentCount?: number;
}) {
  const cat = asset.inventoryCategory;

  return (
    <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Category icon */}
        <div className="w-9 h-9 rounded-[8px] bg-[#f3f3f5] flex items-center justify-center shrink-0 text-[#6a7282]">
          {cat ? CATEGORY_ICONS[cat] : <Package size={14} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[14px] truncate leading-tight">
                {assetDisplayName(asset)}
              </p>
              <p className="text-[11px] text-[#6a7282] mt-0.5">
                {asset.yullrInventoryNumber || <span className="italic">No YIN</span>}
                {asset.inventorySubcategory && ` · ${asset.inventorySubcategory}`}
                {asset.dateAddedToInventory && ` · Added ${asset.dateAddedToInventory}`}
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-2">
            {asset.serialNumber && (
              <span className="text-[11px] text-[#6a7282] font-mono">{asset.serialNumber}</span>
            )}
            {asset.mountainDeployment && asset.mountainDeployment !== 'Unassigned / Warehouse' && (
              <span className="text-[11px] text-[#1D2930] flex items-center gap-1">
                <Building2 size={10} />
                {asset.mountainDeployment}
              </span>
            )}
            {asset.cost !== undefined && (
              <span className="text-[11px] text-[#6a7282]">{fmt(asset.cost)}</span>
            )}
            {componentCount !== undefined && componentCount > 0 && (
              <span className="text-[11px] text-[#6a7282]">{componentCount} component{componentCount !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-[6px] bg-[#eef3fb] active:bg-[#dce8f4]">
            <Pencil size={13} className="text-[#307fe2]" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-[6px] bg-[#fff0ee] active:bg-[#ffe0da]">
            <Trash2 size={14} className="text-[#F95C39]" />
          </button>
        </div>
      </div>

      {/* Deployment log strip */}
      {asset.deploymentLog && asset.deploymentLog.length > 1 && (
        <div className="px-4 py-2 bg-[#f9fafb] border-t border-[rgba(0,0,0,0.05)]">
          <p className="text-[11px] text-[#6a7282]">
            Previously at: {asset.deploymentLog.slice(0, -1).map(e => e.mountainName).join(' → ')}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

interface Filters {
  search: string;
  category: InventoryCategory | '';
  mountain: string;
}

function FilterBar({ filters, onChange, mountainOptions }: { filters: Filters; onChange: (f: Filters) => void; mountainOptions: string[] }) {
  const set = (k: keyof Filters, v: string) => onChange({ ...filters, [k]: v });
  const active = filters.category || filters.mountain;

  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const stopScan = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => () => { stopScan(); }, [stopScan]);

  const startScan = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { toast.error('Camera not supported'); return; }
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const reader = new MultiFormatReader();
      reader.setHints(BARCODE_HINTS);
      const tick = () => {
        if (!streamRef.current || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        try {
          const lum = new HTMLCanvasElementLuminanceSource(canvas);
          const bmp = new BinaryBitmap(new HybridBinarizer(lum));
          const code = reader.decode(bmp).getText();
          stopScan();
          onChange({ ...filters, search: code });
          return;
        } catch { /* no barcode yet */ }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err: any) {
      stopScan();
      if (err?.name === 'NotAllowedError') toast.error('Camera permission denied');
      else toast.error('Could not start camera');
    }
  }, [stopScan, filters, onChange]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
          <input
            type="text"
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            placeholder="Search YIN, model, serial, manufacturer…"
            className="w-full bg-[#f3f3f5] rounded-[8px] pl-9 pr-8 py-2.5 text-[#0a0a0a] text-[13px] outline-none"
          />
          {filters.search && (
            <button onClick={() => set('search', '')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X size={13} className="text-[#6a7282]" />
            </button>
          )}
        </div>
        <button
          onClick={() => scanning ? stopScan() : startScan()}
          title="Scan barcode to search"
          className={`shrink-0 w-10 h-10 rounded-[8px] flex items-center justify-center transition-colors ${scanning ? 'bg-[#F95C39] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
        >
          <Scan size={15} />
        </button>
        {active && (
          <button
            onClick={() => onChange({ search: filters.search, category: '', mountain: '' })}
            className="px-3 py-2.5 text-[12px] text-[#F95C39] bg-[#fff4f1] rounded-[8px] font-['Inter:Medium',sans-serif] whitespace-nowrap"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Live scan viewfinder */}
      {scanning && (
        <div className="rounded-[10px] overflow-hidden bg-black relative">
          <video ref={videoRef} muted playsInline className="w-full h-36 object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-56 h-14 border-2 border-[#F95C39] rounded-[4px] opacity-80" />
          </div>
          <button type="button" onClick={stopScan} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5">
            <X size={14} />
          </button>
          <p className="absolute bottom-2 left-0 right-0 text-center text-white text-[11px] opacity-80">
            Scan serial number, UPC, or YULLR Inventory #
          </p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        <select
          value={filters.category}
          onChange={e => set('category', e.target.value)}
          className={`bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[12px] appearance-none whitespace-nowrap shrink-0 ${filters.category ? 'text-[#F95C39] bg-[#fff4f1]' : 'text-[#6a7282]'}`}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filters.mountain}
          onChange={e => set('mountain', e.target.value)}
          className={`bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[12px] appearance-none whitespace-nowrap shrink-0 ${filters.mountain ? 'text-[#F95C39] bg-[#fff4f1]' : 'text-[#6a7282]'}`}
        >
          <option value="">All Mountains</option>
          {mountainOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
    </div>
  );
}

// ─── Main Inventory Tab ───────────────────────────────────────────────────────

export function InventoryTab() {
  const { assets, deleteAsset, updateAsset, mountains } = useData();
  const mountainOptions = useMemo(
    () => ['Unassigned / Warehouse', ...mountains.map(m => m.name).sort()],
    [mountains],
  );
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Asset | null>(null);
  const [preloadServer, setPreloadServer] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'mountain'>('list');
  const [filters, setFilters] = useState<Filters>({ search: '', category: '', mountain: '' });
  const [expandedMountains, setExpandedMountains] = useState<Set<string>>(new Set());

  // Only show assets that have a yullrInventoryNumber (managed through admin inventory)
  // OR have an inventoryCategory set — this separates admin inventory from location-assigned assets
  const inventoryAssets = useMemo(
    () => assets.filter(a => a.yullrInventoryNumber || a.inventoryCategory),
    [assets],
  );

  const filtered = useMemo(() => {
    let list = inventoryAssets;
    const q = filters.search.toLowerCase();
    if (q) {
      list = list.filter(a =>
        (a.yullrInventoryNumber || '').toLowerCase().includes(q) ||
        (a.manufacturer || '').toLowerCase().includes(q) ||
        (a.customManufacturer || '').toLowerCase().includes(q) ||
        (a.model || '').toLowerCase().includes(q) ||
        (a.customModel || '').toLowerCase().includes(q) ||
        (a.serialNumber || '').toLowerCase().includes(q) ||
        (a.upc || '').toLowerCase().includes(q) ||
        (a.inventorySubcategory || '').toLowerCase().includes(q),
      );
    }
    if (filters.category) list = list.filter(a => a.inventoryCategory === filters.category);
    if (filters.mountain) list = list.filter(a => (a.mountainDeployment || 'Unassigned / Warehouse') === filters.mountain);
    return list;
  }, [inventoryAssets, filters]);

  const totalCost = filtered.reduce((sum, a) => sum + (a.cost || 0), 0);

  const byMountain = useMemo(() => {
    const map: Record<string, Asset[]> = {};
    filtered.forEach(a => {
      const key = a.mountainDeployment || 'Unassigned / Warehouse';
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [filtered]);

  const toggleMountain = (m: string) => {
    setExpandedMountains(prev => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  };

  const handleDelete = async (asset: Asset) => {
    // Release any components assigned to this server back to In Stock
    if (asset.serverComponentIds?.length) {
      asset.serverComponentIds.forEach(id =>
        updateAsset(id, { inventoryStatus: 'In Stock', serverId: undefined }),
      );
    }
    await deleteAsset(asset.id);
    toast.success('Item deleted');
    setDeleteTarget(null);
  };

  const componentCountFor = (asset: Asset) =>
    asset.serverComponentIds?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-[#fff4f1] flex items-center justify-center">
            <BarChart3 size={15} className="text-[#F95C39]" />
          </div>
          <div>
            <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[15px]">
              {inventoryAssets.length} item{inventoryAssets.length !== 1 ? 's' : ''}
            </p>
            <p className="text-[11px] text-[#6a7282]">
              {inventoryAssets.filter(a => a.cost).length > 0 && `Total value: ${fmt(inventoryAssets.reduce((s, a) => s + (a.cost || 0), 0))}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setEditTarget(null); setPreloadServer(true); setShowAdd(true); }}
            className="flex items-center gap-1.5 bg-[#1D2930] text-white px-3 py-2 rounded-[8px] text-[12px] font-['Inter:Medium',sans-serif] active:opacity-80"
          >
            <ServerIcon size={13} />
            Build Server
          </button>
          <button
            onClick={() => { setEditTarget(null); setPreloadServer(false); setShowAdd(true); }}
            className="flex items-center gap-1.5 bg-[#F95C39] text-white px-3.5 py-2 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] active:opacity-80"
          >
            <Plus size={14} />
            Add Item
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} mountainOptions={mountainOptions} />

      {/* View toggle */}
      <div className="flex gap-1 bg-[#f3f3f5] rounded-[8px] p-1">
        {[
          { id: 'list' as const, label: 'List View', icon: <Filter size={12} /> },
          { id: 'mountain' as const, label: 'By Mountain', icon: <Building2 size={12} /> },
        ].map(v => (
          <button
            key={v.id}
            onClick={() => setViewMode(v.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[6px] text-[11px] font-['Inter:Medium',sans-serif] transition-colors ${
              viewMode === v.id ? 'bg-white text-[#0a0a0a] shadow-sm' : 'text-[#6a7282]'
            }`}
          >
            {v.icon}
            {v.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Package size={32} className="text-[#d1d5db] mx-auto mb-3" />
          <p className="text-[#6a7282] text-[14px]">
            {inventoryAssets.length === 0
              ? 'No inventory items yet. Tap "Add Item" to get started.'
              : 'No items match your current filters.'}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* List view */
        <div className="space-y-2">
          {filtered.length > 0 && totalCost > 0 && (
            <p className="text-[12px] text-[#6a7282] text-right">
              Showing {filtered.length} item{filtered.length !== 1 ? 's' : ''} · {fmt(totalCost)}
            </p>
          )}
          {filtered.map(a => (
            <AssetCard
              key={a.id}
              asset={a}
              componentCount={componentCountFor(a)}
              onEdit={() => { setEditTarget(a); setShowAdd(true); }}
              onDelete={() => setDeleteTarget(a)}
            />
          ))}
        </div>
      ) : (
        /* Mountain grouped view */
        <div className="space-y-3">
          {Object.entries(byMountain)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([mountain, items]) => {
              const expanded = expandedMountains.has(mountain);
              const subtotal = items.reduce((s, a) => s + (a.cost || 0), 0);
              return (
                <div key={mountain} className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] overflow-hidden">
                  <button
                    onClick={() => toggleMountain(mountain)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <Building2 size={15} className="text-[#1D2930]" />
                      <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[14px]">{mountain}</span>
                      <span className="text-[11px] text-[#6a7282] bg-[#f3f3f5] px-2 py-0.5 rounded-full">
                        {items.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {subtotal > 0 && (
                        <span className="text-[12px] text-[#6a7282]">{fmt(subtotal)}</span>
                      )}
                      {expanded ? <ChevronDown size={15} className="text-[#6a7282]" /> : <ChevronRight size={15} className="text-[#6a7282]" />}
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-[rgba(0,0,0,0.06)] divide-y divide-[rgba(0,0,0,0.04)]">
                      {items.map(a => (
                        <div key={a.id} className="px-4 py-3 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-[6px] bg-[#f3f3f5] flex items-center justify-center shrink-0 text-[#6a7282]">
                            {a.inventoryCategory ? CATEGORY_ICONS[a.inventoryCategory] : <Package size={12} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-[#0a0a0a] font-['Inter:Medium',sans-serif] truncate">{assetDisplayName(a)}</p>
                            <p className="text-[11px] text-[#6a7282]">
                              {a.yullrInventoryNumber}
                              {a.inventorySubcategory && ` · ${a.inventorySubcategory}`}
                              {a.serialNumber && ` · ${a.serialNumber}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {a.cost !== undefined && (
                              <span className="text-[11px] text-[#6a7282]">{fmt(a.cost)}</span>
                            )}
                            <button onClick={() => { setEditTarget(a); setShowAdd(true); }} className="p-1.5 rounded-[6px] bg-[#eef3fb] active:bg-[#dce8f4]">
                              <Pencil size={12} className="text-[#307fe2]" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Add / Edit modal */}
      {showAdd && (
        <AddEditModal
          editAsset={editTarget}
          isServerBuild={preloadServer}
          onClose={() => { setShowAdd(false); setEditTarget(null); setPreloadServer(false); }}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteConfirmModal
          title="Delete inventory item"
          description={<>Remove <strong>{assetDisplayName(deleteTarget)}</strong> ({deleteTarget.yullrInventoryNumber}) from inventory? This cannot be undone.</>}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
