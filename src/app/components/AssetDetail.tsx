import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useData } from '../context/DataContext';
import type { Asset, MiscItem } from '../context/DataContext';
import {
  ArrowLeft, Camera, Wifi, Box, Server as ServerIcon,
  Pencil, Trash2, X, Check, Plus, Minus, Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from './DeleteConfirmModal';

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSET_TYPE_ICONS = {
  'Camera': Camera,
  'Network Gear': Wifi,
  'Miscellaneous': Box,
  'Server': ServerIcon,
};
const ASSET_TYPE_COLORS = {
  'Camera': 'text-[#ff5c39] bg-[#fff5f3]',
  'Network Gear': 'text-[#307FE2] bg-[#EBF3FF]',
  'Miscellaneous': 'text-[#6a7282] bg-[#f3f3f5]',
  'Server': 'text-[#6a3bd6] bg-[#f3edff]',
};

const MANUFACTURERS = {
  Camera: ['Axis', 'Hikvision', 'Dahua', 'Hanwha', 'Bosch', 'Other'],
  'Network Gear': ['Ubiquiti', 'Cambium', 'Mimosa', 'Siklu', 'Cisco', 'Netgear', 'HPE', 'Other'],
};
const MODELS: Record<string, string[]> = {
  Axis: ['P1367-E', 'Q1615-E', 'P3245-LVE', 'Other'],
  Hikvision: ['DS-2CD2385G1', 'DS-2CD2T85G1', 'DS-2CD2H85G1', 'Other'],
  Dahua: ['IPC-HFW5831E-ZE', 'IPC-HDBW5831E-ZE', 'Other'],
  Hanwha: ['XNV-8080R', 'QNO-8080R', 'Other'],
  Bosch: ['NBE-6502-AL', 'NDI-5503-A', 'Other'],
  Ubiquiti: ['airFiber 60', 'PowerBeam 5AC', 'UniFi Switch 24', 'EdgeSwitch 24', 'Other'],
  Cambium: ['PTP 820', 'ePMP 3000', 'Other'],
  Mimosa: ['B5c', 'C5c', 'Other'],
  Siklu: ['EH-600TX', 'EH-1200TX', 'Other'],
  Cisco: ['IE-3400', 'Catalyst 9300', 'Other'],
  Netgear: ['GS748T', 'M4250', 'Other'],
  HPE: ['Aruba 2930F', 'Aruba 2540', 'Other'],
  Other: ['Custom'],
};
const NETWORK_CATEGORIES = ['Wireless Links', 'Network Hardware', 'Miscellaneous'];
const SERVER_OPTIONS = {
  processors: ['AMD Ryzen 7 7700', 'AMD Ryzen 9 9700'],
  gpus: ['Nvidia RTX 3060', 'Nvidia RTX 3060 Ti', 'Nvidia RTX 5060 Ti'],
  ram: ['32GB', '64GB'],
  motherboards: ['MSI B650 Pro', 'AsusRock B650'],
  osDiskSizes: ['512GB', '1TB', '2TB', '4TB'],
  captureDiskSizes: ['2TB', '4TB', '6TB', '8TB'],
  archiveDiskSizes: ['8TB', '10TB', '12TB', '14TB'],
  formFactors: ['Tower', 'Rack Mount'] as const,
};
const MISC_NAMED_ITEMS = [
  'Ethernet Cable 50ft', 'Antenna Mount', 'POE Injector', 'Passive POE Adapter',
  'Waterproof Enclosure', 'Battery Box', 'GRK 3 Inch', 'GRK 2 Inch', 'Spacers',
] as const;

// ─── Helper sub-components ────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px]">{label}</p>
      <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] mt-0.5">{value}</p>
    </div>
  );
}

function PhotoGrid({ photos, label }: { photos: (string | undefined)[]; label?: string }) {
  const valid = photos.filter(Boolean) as string[];
  if (!valid.length) return null;
  return (
    <div>
      {label && <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-2">{label}</p>}
      <div className={`grid gap-2 ${valid.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {valid.map((src, i) => (
          <img key={i} src={src} alt={`${label || 'Photo'} ${i + 1}`}
            className="w-full rounded-[8px] border border-[rgba(0,0,0,0.1)] object-cover aspect-square"
          />
        ))}
      </div>
    </div>
  );
}

function MiscItemChip({ item }: { item: MiscItem }) {
  return (
    <div className="inline-flex items-center gap-1.5 bg-[#f3f3f5] border border-[rgba(0,0,0,0.1)] rounded-full px-3 py-1.5">
      <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[13px]">
        {item.type === 'Other' ? (item.customName || 'Other') : item.type}
      </span>
      {item.count > 1 && (
        <span className="bg-[#ff5c39] text-white text-[11px] font-['Inter:Medium',sans-serif] font-medium px-1.5 py-0.5 rounded-full leading-none">
          ×{item.count}
        </span>
      )}
    </div>
  );
}

function MiscItemButton({
  label, count, onAdd, onRemove,
}: { label: string; count: number; onAdd: () => void; onRemove: () => void; }) {
  const selected = count > 0;
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onAdd}
        className={`flex-1 rounded-[10px] px-3 h-[64px] flex items-center justify-center border transition-colors active:scale-[0.97] ${
          selected ? 'bg-[#ff5c39] border-[#ff5c39]' : 'bg-white border-[rgba(0,0,0,0.12)]'
        }`}
      >
        <span className={`font-['Inter:Medium',sans-serif] font-medium text-[13px] text-center leading-tight ${
          selected ? 'text-white' : 'text-[#0a0a0a]'
        }`}>{label}</span>
      </button>
      {selected && (
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className="min-w-[28px] h-[28px] bg-[#ff5c39] text-white text-[13px] font-['Inter:Medium',sans-serif] font-medium rounded-full flex items-center justify-center px-1">{count}</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-7 h-7 bg-[#0a0a0a] rounded-full flex items-center justify-center active:opacity-60"
          >
            <Minus size={13} className="text-white" strokeWidth={3} />
          </button>
        </div>
      )}
    </div>
  );
}

function OtherItemRow({
  item, onChange, onRemove,
}: { item: { id: string; name: string; count: number }; onChange: (id: string, name: string, count: number) => void; onRemove: (id: string) => void; }) {
  return (
    <div className="bg-[#f3f3f5] rounded-[10px] p-3 space-y-2">
      <input type="text" value={item.name} onChange={(e) => onChange(item.id, e.target.value, item.count)}
        placeholder="Describe item…"
        className="w-full bg-white rounded-[8px] px-3 py-2.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] border border-[rgba(0,0,0,0.1)] focus:outline-none focus:border-[#ff5c39]"
      />
      <div className="flex items-center justify-between">
        <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">Quantity</span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onChange(item.id, item.name, Math.max(1, item.count - 1))}
            className="w-8 h-8 bg-white border border-[rgba(0,0,0,0.15)] rounded-full flex items-center justify-center active:bg-[#e8e8ea]">
            <Minus size={14} className="text-[#0a0a0a]" />
          </button>
          <span className="w-6 text-center text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">{item.count}</span>
          <button type="button" onClick={() => onChange(item.id, item.name, item.count + 1)}
            className="w-8 h-8 bg-white border border-[rgba(0,0,0,0.15)] rounded-full flex items-center justify-center active:bg-[#e8e8ea]">
            <Plus size={14} className="text-[#0a0a0a]" />
          </button>
          <button type="button" onClick={() => onRemove(item.id)}
            className="w-8 h-8 bg-[#fff0ee] rounded-full flex items-center justify-center active:bg-[#ffe0da]">
            <X size={14} className="text-[#ff5c39]" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AssetDetail() {
  const { mountainId, locationId, assetId } = useParams();
  const navigate = useNavigate();
  const { getAssetById, updateAsset, deleteAsset, getAssetsByLocationId, getMountainById } = useData();

  const asset = getAssetById(assetId!);
  const locationAssets = getAssetsByLocationId(locationId!);
  const mountain = getMountainById(mountainId!);
  const ipSubnet = mountain?.ipSubnet || '';

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Edit form state ────────────────────────────────────────────────────────
  const [formData, setFormData] = useState<Partial<Asset>>({});
  const [namedCounts, setNamedCounts] = useState<Record<string, number>>({});
  const [otherItems, setOtherItems] = useState<{ id: string; name: string; count: number }[]>([]);
  const [miscPhotos, setMiscPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentCaptureMode = useRef<'serial' | 'install' | 'internal' | 'external' | 'misc' | null>(null);

  const enterEditMode = () => {
    if (!asset) return;
    setFormData({ ...asset });
    // Init misc named counts
    const counts = Object.fromEntries(MISC_NAMED_ITEMS.map(t => [t, 0]));
    asset.miscItems?.filter(i => i.type !== 'Other').forEach(i => { counts[i.type] = i.count; });
    setNamedCounts(counts);
    // Init other items
    setOtherItems(
      asset.miscItems?.filter(i => i.type === 'Other')
        .map(i => ({ id: crypto.randomUUID(), name: i.customName || '', count: i.count })) || []
    );
    setMiscPhotos(asset.miscPhotos || []);
    setIsEditing(true);
  };

  const updateField = (field: keyof Asset, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const buildMiscItems = (): MiscItem[] => {
    const named: MiscItem[] = MISC_NAMED_ITEMS
      .filter(t => (namedCounts[t] || 0) > 0)
      .map(t => ({ type: t, count: namedCounts[t] }));
    const others: MiscItem[] = otherItems
      .filter(i => i.name.trim())
      .map(i => ({ type: 'Other', customName: i.name.trim(), count: i.count }));
    return [...named, ...others];
  };

  const takePhoto = (mode: typeof currentCaptureMode.current) => {
    currentCaptureMode.current = mode;
    if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const mode = currentCaptureMode.current;
    if (!file || !mode) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const data = reader.result as string;
      if (mode === 'serial') { updateField('serialPhoto', data); toast.success('Serial photo captured'); }
      else if (mode === 'install') { updateField('installPhoto', data); toast.success('Install photo captured'); }
      else if (mode === 'internal') { updateField('internalPhoto', data); toast.success('Internal photo captured'); }
      else if (mode === 'external') { updateField('externalPhoto', data); toast.success('External photo captured'); }
      else if (mode === 'misc') { setMiscPhotos(prev => [...prev, data]); toast.success('Photo added'); }
      currentCaptureMode.current = null;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!asset) return;
    const updates: Partial<Asset> = { ...formData };
    if (asset.type === 'Miscellaneous') {
      updates.miscItems = buildMiscItems();
      updates.miscPhotos = miscPhotos;
    }
    updateAsset(assetId!, updates);
    toast.success('Asset updated');
    setIsEditing(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteAsset(assetId!);
      toast.success(`${asset.type} deleted`);
      navigate(`/mountains/${mountainId}/locations/${locationId}`);
    } catch {
      toast.error('Failed to delete.');
      setIsDeleting(false);
    }
  };

  const PhotoCaptureButton = ({
    mode, label, photoField,
  }: { mode: 'serial' | 'install' | 'internal' | 'external'; label: string; photoField: string | undefined; }) => {
    if (photoField) {
      return (
        <div className="relative">
          <img src={photoField} alt={label} className="w-full rounded-[8px] border border-[rgba(0,0,0,0.1)]" />
          <button type="button"
            onClick={() => { const m = { serial: 'serialPhoto', install: 'installPhoto', internal: 'internalPhoto', external: 'externalPhoto' } as const; updateField(m[mode], ''); }}
            className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full"
          ><X size={16} /></button>
        </div>
      );
    }
    return (
      <button type="button" onClick={() => takePhoto(mode)}
        className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-8 flex flex-col items-center justify-center gap-2 active:bg-[#e8e8ea]"
      >
        <Camera size={32} className="text-[#6a7282]" />
        <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif]">{label}</span>
      </button>
    );
  };

  if (!asset) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">Asset not found</p>
          <button onClick={() => navigate(`/mountains/${mountainId}/locations/${locationId}`)}
            className="mt-4 text-[#307fe2] font-['Inter:Medium',sans-serif]">Go back</button>
        </div>
      </div>
    );
  }

  const TypeIcon = ASSET_TYPE_ICONS[asset.type];
  const typeColor = ASSET_TYPE_COLORS[asset.type];
  const availableModels = formData.manufacturer ? (MODELS[formData.manufacturer] || []) : [];

  // ── View Mode ──────────────────────────────────────────────────────────────
  const viewContent = () => {
    const isCamera = asset.type === 'Camera';
    const isNetworkGear = asset.type === 'Network Gear';
    const isMisc = asset.type === 'Miscellaneous';
    const isServer = asset.type === 'Server';

    return (
      <div className="px-4 pt-5 space-y-4 pb-8">

        {/* Camera / Network Gear details */}
        {(isCamera || isNetworkGear) && (
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
            {isNetworkGear && <DetailRow label="Network Category" value={asset.networkCategory} />}
            <DetailRow label="Manufacturer" value={asset.customManufacturer || asset.manufacturer} />
            <DetailRow label="Model" value={asset.customModel || asset.model} />
            <DetailRow label="Serial Number" value={asset.serialNumber} />
            <DetailRow label="IP Address" value={asset.ipAddress} />
            {asset.isDraft && (
              <div className="inline-flex items-center">
                <span className="bg-red-600 text-white text-[11px] px-2 py-0.5 rounded-[4px] font-['Inter:Medium',sans-serif]">DRAFT</span>
              </div>
            )}
          </div>
        )}

        {/* Camera / Network Gear photos */}
        {(isCamera || isNetworkGear) && (asset.serialPhoto || asset.installPhoto) && (
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Photos</h2>
            <PhotoGrid photos={[asset.serialPhoto]} label="Serial Number" />
            <PhotoGrid photos={[asset.installPhoto]} label="Installation" />
          </div>
        )}

        {/* Miscellaneous */}
        {isMisc && (
          <>
            {asset.miscItems && asset.miscItems.length > 0 && (
              <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Items</h2>
                  <span className="bg-[#ff5c39] text-white text-[12px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                    {asset.miscItems.reduce((s, i) => s + i.count, 0)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {asset.miscItems.map((item, i) => <MiscItemChip key={i} item={item} />)}
                </div>
              </div>
            )}
            {asset.miscPhotos && asset.miscPhotos.length > 0 && (
              <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
                <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-3">Photos</h2>
                <div className="grid grid-cols-2 gap-2">
                  {asset.miscPhotos.map((src, i) => (
                    <img key={i} src={src} alt={`Photo ${i + 1}`} className="w-full aspect-square object-cover rounded-[8px] border border-[rgba(0,0,0,0.1)]" />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Server */}
        {isServer && (
          <>
            <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
              <DetailRow label="Form Factor" value={asset.formFactor} />
              <DetailRow label="Processor" value={asset.processorModel} />
              <DetailRow label="GPU" value={asset.gpuModel} />
              <DetailRow label="RAM" value={asset.ram} />
              <DetailRow label="Motherboard" value={asset.motherboard} />
              <DetailRow label="OS Disk" value={asset.osDiskSize} />
              <DetailRow label="Capture Disk" value={asset.captureDiskSize} />
              <DetailRow label="Archive Disk" value={asset.archiveDiskSize} />
              <DetailRow label="IP Address" value={asset.ipAddress} />
            </div>
            {(asset.internalPhoto || asset.externalPhoto) && (
              <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
                <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Photos</h2>
                <PhotoGrid photos={[asset.internalPhoto]} label="Internal" />
                <PhotoGrid photos={[asset.externalPhoto]} label="External" />
              </div>
            )}
          </>
        )}

        {/* Notes */}
        {asset.notes && (
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">Notes</h2>
            <p className="text-[#3d3d3d] font-['Inter:Regular',sans-serif] text-[14px] leading-relaxed whitespace-pre-wrap">{asset.notes}</p>
          </div>
        )}
      </div>
    );
  };

  // ── Edit Mode ──────────────────────────────────────────────────────────────
  const editContent = () => {
    const isCamera = asset.type === 'Camera';
    const isNetworkGear = asset.type === 'Network Gear';
    const isMisc = asset.type === 'Miscellaneous';
    const isServer = asset.type === 'Server';

    return (
      <div className="px-4 pt-5 space-y-4 pb-32">

        {/* Miscellaneous edit */}
        {isMisc && (
          <>
            <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Items</h2>
              <div className="grid grid-cols-2 gap-3">
                {MISC_NAMED_ITEMS.map((item) => (
                  <MiscItemButton key={item} label={item} count={namedCounts[item] || 0}
                    onAdd={() => setNamedCounts(prev => ({ ...prev, [item]: (prev[item] || 0) + 1 }))}
                    onRemove={() => setNamedCounts(prev => ({ ...prev, [item]: Math.max(0, (prev[item] || 0) - 1) }))}
                  />
                ))}
                <button type="button"
                  onClick={() => setOtherItems(prev => [...prev, { id: crypto.randomUUID(), name: '', count: 1 }])}
                  className="rounded-[10px] px-3 h-[64px] flex items-center justify-center border border-dashed border-[rgba(0,0,0,0.2)] bg-[#f3f3f5] active:bg-[#e8e8ea] col-span-2 gap-2"
                >
                  <Plus size={16} className="text-[#6a7282]" />
                  <span className="font-['Inter:Medium',sans-serif] font-medium text-[13px] text-[#6a7282]">Other</span>
                </button>
              </div>
              {otherItems.length > 0 && (
                <div className="space-y-2 pt-1">
                  {otherItems.map(item => (
                    <OtherItemRow key={item.id} item={item}
                      onChange={(id, name, count) => setOtherItems(prev => prev.map(i => i.id === id ? { ...i, name, count } : i))}
                      onRemove={(id) => setOtherItems(prev => prev.filter(i => i.id !== id))}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
                Photos <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px] font-normal">(optional)</span>
              </h2>
              {miscPhotos.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {miscPhotos.map((photo, idx) => (
                    <div key={idx} className="relative">
                      <img src={photo} alt={`Photo ${idx + 1}`} className="w-full aspect-square object-cover rounded-[8px] border border-[rgba(0,0,0,0.1)]" />
                      <button type="button" onClick={() => setMiscPhotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1.5 right-1.5 bg-red-500 text-white p-1.5 rounded-full"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => takePhoto('misc')}
                className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-6 flex flex-col items-center justify-center gap-2 active:bg-[#e8e8ea]">
                <ImageIcon size={28} className="text-[#6a7282]" />
                <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[14px]">Add Photo</span>
              </button>
            </div>
          </>
        )}

        {/* Camera / Network Gear edit */}
        {(isCamera || isNetworkGear) && (
          <>
            {isNetworkGear && (
              <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">Network Category</label>
                <select value={formData.networkCategory || ''} onChange={e => updateField('networkCategory', e.target.value)}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]">
                  <option value="">Select category</option>
                  {NETWORK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Equipment Details</h2>
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">Manufacturer</label>
                <select value={formData.manufacturer || ''}
                  onChange={e => { updateField('manufacturer', e.target.value); if (e.target.value !== 'Other') updateField('customManufacturer', ''); updateField('model', ''); updateField('customModel', ''); }}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]">
                  <option value="">Select manufacturer</option>
                  {MANUFACTURERS[asset.type as keyof typeof MANUFACTURERS]?.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {formData.manufacturer === 'Other' && (
                <div>
                  <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">Custom Manufacturer</label>
                  <input type="text" value={formData.customManufacturer || ''} onChange={e => updateField('customManufacturer', e.target.value)}
                    className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]" placeholder="Enter manufacturer" />
                </div>
              )}
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">Model</label>
                <select value={formData.model || ''} disabled={!formData.manufacturer}
                  onChange={e => { updateField('model', e.target.value); if (e.target.value !== 'Other') updateField('customModel', ''); }}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px] disabled:opacity-50">
                  <option value="">Select model</option>
                  {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {formData.model === 'Other' && (
                <div>
                  <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">Custom Model</label>
                  <input type="text" value={formData.customModel || ''} onChange={e => updateField('customModel', e.target.value)}
                    className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]" placeholder="Enter model" />
                </div>
              )}
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">Serial Number{isCamera && ' *'}</label>
                <input type="text" value={formData.serialNumber || ''} onChange={e => updateField('serialNumber', e.target.value)}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]" placeholder="Enter serial number" />
              </div>
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">IP Address</label>
                <input type="text" value={formData.ipAddress || ''} onChange={e => updateField('ipAddress', e.target.value)}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]" placeholder={ipSubnet ? `${ipSubnet}…` : '192.168.1.100'} />
              </div>
            </div>

            <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Photos</h2>
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Serial Number Photo{isCamera && ' *'}</label>
                <PhotoCaptureButton mode="serial" label="Take Photo" photoField={formData.serialPhoto} />
              </div>
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Installation Photo{isCamera && ' *'}</label>
                <PhotoCaptureButton mode="install" label="Take Photo" photoField={formData.installPhoto} />
              </div>
            </div>
          </>
        )}

        {/* Server edit */}
        {isServer && (
          <>
            <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Server Configuration</h2>
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">Form Factor</label>
                <div className="grid grid-cols-2 gap-3">
                  {SERVER_OPTIONS.formFactors.map(f => (
                    <button key={f} type="button" onClick={() => updateField('formFactor', f)}
                      className={`py-4 rounded-[8px] border-2 font-['Inter:Medium',sans-serif] text-[15px] ${formData.formFactor === f ? 'border-[#ff5c39] bg-[#fff5f3] text-[#ff5c39]' : 'border-[rgba(0,0,0,0.1)] bg-[#f3f3f5] text-[#0a0a0a]'}`}
                    >{f}</button>
                  ))}
                </div>
              </div>
              {[
                { label: 'Processor', field: 'processorModel', opts: SERVER_OPTIONS.processors },
                { label: 'GPU', field: 'gpuModel', opts: SERVER_OPTIONS.gpus },
                { label: 'RAM', field: 'ram', opts: SERVER_OPTIONS.ram },
                { label: 'Motherboard', field: 'motherboard', opts: SERVER_OPTIONS.motherboards },
                { label: 'OS Disk Size', field: 'osDiskSize', opts: SERVER_OPTIONS.osDiskSizes },
                { label: 'Capture Disk Size', field: 'captureDiskSize', opts: SERVER_OPTIONS.captureDiskSizes },
                { label: 'Archive Disk Size', field: 'archiveDiskSize', opts: SERVER_OPTIONS.archiveDiskSizes },
              ].map(({ label, field, opts }) => (
                <div key={field}>
                  <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">{label}</label>
                  <select value={(formData as any)[field] || ''} onChange={e => updateField(field as keyof Asset, e.target.value)}
                    className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]">
                    <option value="">Select {label.toLowerCase()}</option>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">IP Address</label>
                <input type="text" value={formData.ipAddress || ''} onChange={e => updateField('ipAddress', e.target.value)}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]" placeholder={ipSubnet ? `${ipSubnet}…` : '192.168.1.100'} />
              </div>
            </div>
            <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Photos</h2>
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Internal Photo</label>
                <PhotoCaptureButton mode="internal" label="Take Internal Photo" photoField={formData.internalPhoto} />
              </div>
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">External Photo</label>
                <PhotoCaptureButton mode="external" label="Take External Photo" photoField={formData.externalPhoto} />
              </div>
            </div>
          </>
        )}

        {/* Notes */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
          <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">Notes</label>
          <textarea value={formData.notes || ''} onChange={e => updateField('notes', e.target.value)} rows={4}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px] resize-none"
            placeholder="Additional notes…" />
        </div>

        {/* Fixed bottom */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[rgba(0,0,0,0.1)] p-4 space-y-3">
          <button type="button" onClick={handleSave}
            className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-3 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium active:opacity-80">
            <Check size={18} />Save Changes
          </button>
          <button type="button" onClick={() => setIsEditing(false)}
            className="w-full bg-[#f3f3f5] text-[#0a0a0a] rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium active:bg-[#e8e8ea]">
            Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Hidden camera input */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

      {/* Delete modal */}
      {showDeleteModal && (
        <DeleteConfirmModal
          title={`Delete this ${asset.type}?`}
          description="This will permanently delete this asset and all its photos. This cannot be undone."
          isDeleting={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { if (isEditing) setIsEditing(false); else navigate(`/mountains/${mountainId}/locations/${locationId}`); }}
            className="p-1 active:opacity-60"
          >
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>

          {/* Type badge + title */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-['Inter:Medium',sans-serif] font-medium flex-shrink-0 ${typeColor}`}>
              <TypeIcon size={14} />
              {asset.type}
            </span>
            {asset.isDraft && !isEditing && (
              <span className="bg-red-600 text-white text-[11px] px-2 py-0.5 rounded-[4px] font-['Inter:Medium',sans-serif] flex-shrink-0">DRAFT</span>
            )}
            {isEditing && (
              <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px]">Editing</span>
            )}
          </div>

          {!isEditing && (
            <>
              <button onClick={enterEditMode} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" aria-label="Edit asset">
                <Pencil size={18} className="text-[#0a0a0a]" />
              </button>
              <button onClick={() => setShowDeleteModal(true)} className="p-2 bg-[#fff0ee] rounded-[8px] active:bg-[#ffe0da]" aria-label="Delete asset">
                <Trash2 size={18} className="text-[#ff5c39]" />
              </button>
            </>
          )}
        </div>
      </div>

      {isEditing ? editContent() : viewContent()}
    </div>
  );
}