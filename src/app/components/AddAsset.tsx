import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useData } from '../context/DataContext';
import type { Asset, MiscItem } from '../context/DataContext';
import {
  ArrowLeft, Camera, MapPin, X, Wifi, Box, Server as ServerIcon,
  Plus, Minus, Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { AddableSelect } from './AddableSelect';

const ASSET_TYPES = ['Camera', 'Network Gear', 'Miscellaneous', 'Server'] as const;

const ASSET_TYPE_ICONS = {
  'Camera': Camera,
  'Network Gear': Wifi,
  'Miscellaneous': Box,
  'Server': ServerIcon,
};

const SERVER_FORM_FACTORS = ['Tower', 'Rack Mount'] as const;

// ─── Miscellaneous item definitions ──────────────────────────────────────────

// Fallback list used when no misc:installItems options have been seeded yet
const MISC_NAMED_ITEMS_FALLBACK = [
  'Ethernet Cable 50ft',
  'Antenna Mount',
  'POE Injector',
  'Passive POE Adapter',
  'Waterproof Enclosure',
  'Battery Box',
  'GRK 3 Inch',
  'GRK 2 Inch',
  'Spacers',
];

// ─── Misc item button ─────────────────────────────────────────────────────────

function MiscItemButton({
  label,
  count,
  onAdd,
  onRemove,
}: {
  label: string;
  count: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const selected = count > 0;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onAdd}
        className={`flex-1 rounded-[10px] px-3 h-[64px] flex items-center justify-center border transition-colors active:scale-[0.97] ${
          selected
            ? 'bg-[#ff5c39] border-[#ff5c39]'
            : 'bg-white border-[rgba(0,0,0,0.12)]'
        }`}
      >
        <span className={`font-['Inter:Medium',sans-serif] font-medium text-[13px] text-center leading-tight ${
          selected ? 'text-white' : 'text-[#0a0a0a]'
        }`}>
          {label}
        </span>
      </button>
      {selected && (
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className="min-w-[28px] h-[28px] bg-[#ff5c39] text-white text-[13px] font-['Inter:Medium',sans-serif] font-medium rounded-full flex items-center justify-center px-1">
            {count}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-7 h-7 bg-[#0a0a0a] rounded-full flex items-center justify-center active:opacity-60"
            aria-label={`Remove ${label}`}
          >
            <Minus size={13} className="text-white" strokeWidth={3} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── "Other" item row ─────────────────────────────────────────────────────────

function OtherItemRow({
  item,
  onChange,
  onRemove,
}: {
  item: { id: string; name: string; count: number };
  onChange: (id: string, name: string, count: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="bg-[#f3f3f5] rounded-[10px] p-3 space-y-2">
      <input
        type="text"
        value={item.name}
        onChange={(e) => onChange(item.id, e.target.value, item.count)}
        placeholder="Describe item…"
        className="w-full bg-white rounded-[8px] px-3 py-2.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] border border-[rgba(0,0,0,0.1)] focus:outline-none focus:border-[#ff5c39]"
      />
      <div className="flex items-center justify-between">
        <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">Quantity</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange(item.id, item.name, Math.max(1, item.count - 1))}
            className="w-8 h-8 bg-white border border-[rgba(0,0,0,0.15)] rounded-full flex items-center justify-center active:bg-[#e8e8ea]"
          >
            <Minus size={14} className="text-[#0a0a0a]" />
          </button>
          <span className="w-6 text-center text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
            {item.count}
          </span>
          <button
            type="button"
            onClick={() => onChange(item.id, item.name, item.count + 1)}
            className="w-8 h-8 bg-white border border-[rgba(0,0,0,0.15)] rounded-full flex items-center justify-center active:bg-[#e8e8ea]"
          >
            <Plus size={14} className="text-[#0a0a0a]" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="w-8 h-8 bg-[#fff0ee] rounded-full flex items-center justify-center active:bg-[#ffe0da]"
          >
            <X size={14} className="text-[#ff5c39]" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AddAsset() {
  const { mountainId, locationId, assetId } = useParams();
  const navigate = useNavigate();
  const {
    addAsset, updateAsset, getAssetById, getAssetsByLocationId,
    getMountainById, getTrailsByMountainId, getLocationsByMountainId,
    getOptions
  } = useData();

  const isInventoryMode = !locationId; // accessed from /mountains/:mountainId/inventory/new
  const isEditing = !!assetId;
  const existingAsset = isEditing ? getAssetById(assetId) : undefined;
  const existingAssets = locationId ? getAssetsByLocationId(locationId) : [];
  const mountain = getMountainById(mountainId!);
  const ipSubnet = mountain?.ipSubnet || '';

  // Get trails and locations for inventory mode
  const trails = mountainId ? getTrailsByMountainId(mountainId) : [];
  const allLocations = mountainId ? getLocationsByMountainId(mountainId) : [];

  // Resolve misc install items from context (seeded by AdminCatalog), fallback to hardcoded
  const miscInstallItems = getOptions('misc:installItems').length > 0
    ? getOptions('misc:installItems')
    : MISC_NAMED_ITEMS_FALLBACK;

  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [pendingDraft, setPendingDraft] = useState(false);

  // ── Misc named item counts ─────────────────────────────────────────────────
  const initNamedCounts = (): Record<string, number> => {
    const base = Object.fromEntries(miscInstallItems.map(t => [t, 0]));
    if (existingAsset?.miscItems) {
      existingAsset.miscItems.filter(i => i.type !== 'Other').forEach(i => {
        if (i.type in base) base[i.type] = i.count;
        else base[i.type] = i.count; // keep counts even if item was renamed
      });
    }
    return base;
  };

  const [namedCounts, setNamedCounts] = useState<Record<string, number>>(initNamedCounts);

  // ── Misc "Other" items ─────────────────────────────────────────────────────
  const initOtherItems = () => {
    if (existingAsset?.miscItems) {
      return existingAsset.miscItems
        .filter(i => i.type === 'Other')
        .map(i => ({ id: crypto.randomUUID(), name: i.customName || '', count: i.count }));
    }
    return [] as { id: string; name: string; count: number }[];
  };

  const [otherItems, setOtherItems] = useState<{ id: string; name: string; count: number }[]>(initOtherItems);

  // ── Misc photos ───────────────────────────────────────────────────────────
  const [miscPhotos, setMiscPhotos] = useState<string[]>(existingAsset?.miscPhotos || []);

  // For inventory mode: track selected trail and location separately
  const [selectedTrailId, setSelectedTrailId] = useState(existingAsset?.trail || '');
  const [selectedLocationId, setSelectedLocationId] = useState(existingAsset?.locationId || '');

  // Filter locations by selected trail
  const filteredLocations = selectedTrailId
    ? allLocations.filter(loc => loc.trailId === selectedTrailId)
    : allLocations;

  const [formData, setFormData] = useState<Partial<Asset>>(() => {
    if (existingAsset) {
      return { ...existingAsset };
    }
    return {
      type: 'Camera',
      trail: '',
      manufacturer: '',
      customManufacturer: '',
      model: '',
      customModel: '',
      serialNumber: '',
      ipAddress: '',
      serialPhoto: '',
      installPhoto: '',
      coordinates: undefined,
      notes: '',
      networkCategory: undefined,
      processorModel: '',
      gpuModel: '',
      ram: '',
      motherboard: '',
      osDiskSize: '',
      captureDiskSize: '',
      archiveDiskSize: '',
      formFactor: 'Tower',
      internalPhoto: '',
      externalPhoto: '',
      miscItems: [],
      miscPhotos: [],
      isDraft: false,
    };
  });

  // Single hidden file input for all photo captures
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentCaptureMode = useRef<'serial' | 'install' | 'internal' | 'external' | 'misc' | null>(null);

  // Option key helpers
  const typeKey = formData.type === 'Camera' ? 'camera' : 'network';
  const manufacturerOptionKey = `${typeKey}:manufacturers`;
  const modelOptionKey = formData.manufacturer ? `${typeKey}:models:${formData.manufacturer}` : '';

  // Reset type-specific fields whenever asset type changes (including when editing)
  useEffect(() => {
    setFormData(prev => {
      if (prev.type === 'Camera') {
        return {
          type: prev.type, notes: prev.notes, isDraft: prev.isDraft,
          trail: prev.trail,
          manufacturer: prev.manufacturer, customManufacturer: prev.customManufacturer,
          model: prev.model, customModel: prev.customModel,
          serialNumber: prev.serialNumber, ipAddress: prev.ipAddress,
          serialPhoto: prev.serialPhoto, installPhoto: prev.installPhoto,
          coordinates: prev.coordinates,
        };
      } else if (prev.type === 'Network Gear') {
        return {
          type: prev.type, notes: prev.notes, isDraft: prev.isDraft,
          networkCategory: prev.networkCategory,
          manufacturer: prev.manufacturer, customManufacturer: prev.customManufacturer,
          model: prev.model, customModel: prev.customModel,
          serialNumber: prev.serialNumber, ipAddress: prev.ipAddress,
          serialPhoto: prev.serialPhoto, installPhoto: prev.installPhoto,
        };
      } else if (prev.type === 'Server') {
        return {
          type: prev.type, notes: prev.notes, isDraft: prev.isDraft,
          processorModel: prev.processorModel, gpuModel: prev.gpuModel,
          ram: prev.ram, motherboard: prev.motherboard,
          osDiskSize: prev.osDiskSize, captureDiskSize: prev.captureDiskSize,
          archiveDiskSize: prev.archiveDiskSize, formFactor: prev.formFactor,
          internalPhoto: prev.internalPhoto, externalPhoto: prev.externalPhoto,
          ipAddress: prev.ipAddress,
        };
      } else if (prev.type === 'Miscellaneous') {
        return {
          type: prev.type, notes: prev.notes, isDraft: prev.isDraft,
          miscItems: prev.miscItems || [],
          miscPhotos: prev.miscPhotos || [],
        };
      }
      return prev;
    });
  }, [formData.type]);

  // Trigger the native camera/file picker
  const takePhoto = (mode: 'serial' | 'install' | 'internal' | 'external' | 'misc') => {
    currentCaptureMode.current = mode;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const mode = currentCaptureMode.current;
    if (!file || !mode) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const photoData = reader.result as string;
      if (mode === 'serial') {
        updateField('serialPhoto', photoData);
        toast.success('Serial number photo captured');
      } else if (mode === 'install') {
        updateField('installPhoto', photoData);
        toast.success('Installation photo captured');
      } else if (mode === 'internal') {
        updateField('internalPhoto', photoData);
        toast.success('Internal photo captured');
      } else if (mode === 'external') {
        updateField('externalPhoto', photoData);
        toast.success('External photo captured');
      } else if (mode === 'misc') {
        setMiscPhotos(prev => [...prev, photoData]);
        toast.success('Photo added');
      }
      currentCaptureMode.current = null;
    };
    reader.readAsDataURL(file);
  };

  const captureGPS = () => {
    if (!navigator.geolocation) { toast.error('GPS not supported on this device'); return; }
    toast.info('Getting GPS coordinates...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        updateField('coordinates', coords);
        toast.success(`GPS captured: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`);
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED: toast.error('Location permission denied.'); break;
          case error.POSITION_UNAVAILABLE: toast.error('Location information unavailable.'); break;
          case error.TIMEOUT: toast.error('Location request timed out.'); break;
          default: toast.error('Could not get GPS: ' + error.message);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Build miscItems array from named counts + other items
  const buildMiscItems = () => {
    const named = miscInstallItems
      .filter(t => (namedCounts[t] || 0) > 0)
      .map(t => ({ type: t, count: namedCounts[t] }));
    const others = otherItems
      .filter(i => i.name.trim())
      .map(i => ({ type: 'Other', customName: i.name.trim(), count: i.count }));
    return [...named, ...others];
  };

  const handleSubmit = (isDraft: boolean) => {
    if (!isDraft) {
      if (formData.type === 'Camera') {
        // serial number, serial photo, and install photo are all optional
      } else if (formData.type === 'Server') {
        if (!formData.processorModel) { toast.error('Processor model is required for servers'); return; }
        if (!formData.gpuModel) { toast.error('GPU model is required for servers'); return; }
        if (!formData.ram) { toast.error('RAM is required for servers'); return; }
        if (!formData.motherboard) { toast.error('Motherboard is required for servers'); return; }
        if (!formData.osDiskSize) { toast.error('OS disk size is required for servers'); return; }
        if (!formData.captureDiskSize) { toast.error('Capture disk size is required for servers'); return; }
        if (!formData.ipAddress) { toast.error('IP address is required for servers'); return; }
        // internal and external photos are optional
      }
    }

    if (isEditing && !isDraft) {
      setPendingDraft(false);
      setShowUpdateConfirm(true);
      return;
    }

    submitAsset(isDraft);
  };

  const submitAsset = (isDraft: boolean) => {
    const finalMiscItems = formData.type === 'Miscellaneous' ? buildMiscItems() : undefined;
    const finalMiscPhotos = formData.type === 'Miscellaneous' ? miscPhotos : undefined;

    // In inventory mode, use the selected trail and location
    const finalLocationId = isInventoryMode ? (selectedLocationId || undefined) : locationId;
    const finalTrail = isInventoryMode ? selectedTrailId : formData.trail;

    const assetData = {
      ...formData,
      mountainId: mountainId!,
      locationId: finalLocationId,
      trail: finalTrail,
      isDraft,
      ...(formData.type === 'Miscellaneous' && {
        miscItems: finalMiscItems,
        miscPhotos: finalMiscPhotos,
      }),
    } as Omit<Asset, 'id'>;

    if (isEditing) {
      updateAsset(assetId!, assetData);
      toast.success('Asset updated successfully');
    } else {
      addAsset(assetData);
      toast.success(isDraft ? 'Asset saved as draft' : isInventoryMode ? 'Asset added to inventory' : 'Asset added successfully');
    }
    if (isInventoryMode) {
      navigate(`/mountains/${mountainId}`);
    } else {
      navigate(`/mountains/${mountainId}/locations/${locationId}`);
    }
  };

  const updateField = (field: keyof Asset, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Reusable photo capture button
  const PhotoCaptureButton = ({
    mode, label, photoField,
  }: {
    mode: 'serial' | 'install' | 'internal' | 'external';
    label: string;
    photoField: string | undefined;
  }) => {
    if (photoField) {
      return (
        <div className="relative">
          <img src={photoField} alt={label} className="w-full rounded-[8px] border border-[rgba(0,0,0,0.1)]" />
          <button
            type="button"
            onClick={() => {
              const fieldMap = {
                serial: 'serialPhoto', install: 'installPhoto',
                internal: 'internalPhoto', external: 'externalPhoto',
              } as const;
              updateField(fieldMap[mode], '');
            }}
            className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full"
          >
            <X size={16} />
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => takePhoto(mode)}
        className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-8 flex flex-col items-center justify-center gap-2 active:bg-[#e8e8ea] transition-colors"
      >
        <Camera size={32} className="text-[#6a7282]" />
        <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif]">{label}</span>
      </button>
    );
  };

  const isServer = formData.type === 'Server';
  const isCamera = formData.type === 'Camera';
  const isNetworkGear = formData.type === 'Network Gear';
  const isMisc = formData.type === 'Miscellaneous';

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Hidden native camera input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => isInventoryMode
              ? navigate(`/mountains/${mountainId}`)
              : navigate(`/mountains/${mountainId}/locations/${locationId}`)
            }
            className="p-1 active:opacity-60"
          >
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px]">
            {isEditing ? 'Edit Asset' : isInventoryMode ? 'Add to Inventory' : 'Add New Asset'}
          </h1>
        </div>
      </div>

      {/* Form */}
      <div className="p-4 space-y-4 pb-32">

        {/* Asset Type Selection */}
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
          <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
            {isEditing ? 'Asset Type' : 'Select Asset Type *'}
          </label>
          {isEditing ? (
            /* When editing, show the type as a locked badge — type cannot be changed */
            <div className="flex items-center gap-3 bg-[#f3f3f5] rounded-[8px] px-4 py-3">
              {(() => { const Icon = ASSET_TYPE_ICONS[formData.type as keyof typeof ASSET_TYPE_ICONS] || Box; return <Icon size={20} className="text-[#6a7282]" />; })()}
              <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
                {formData.type}
              </span>
              <span className="ml-auto text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
                Cannot change
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {ASSET_TYPES.map((type) => {
                const Icon = ASSET_TYPE_ICONS[type];
                const isSelected = formData.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateField('type', type)}
                    className={`
                      flex flex-col items-center justify-center gap-2 p-4 rounded-[10px] border-2
                      transition-all min-h-[100px]
                      ${isSelected
                        ? 'border-[#ff5c39] bg-[#fff5f3]'
                        : 'border-[rgba(0,0,0,0.1)] bg-[#f3f3f5] active:bg-[#e8e8ea]'
                      }
                    `}
                  >
                    <Icon size={32} className={isSelected ? 'text-[#ff5c39]' : 'text-[#6a7282]'} />
                    <span className={`text-center font-['Inter:Medium',sans-serif] font-medium text-[13px] ${
                      isSelected ? 'text-[#ff5c39]' : 'text-[#0a0a0a]'
                    }`}>
                      {type}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Trail & Location Selection (Inventory Mode Only) ────────────── */}
        {isInventoryMode && (
          <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
              Installation Location <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px] font-normal">(optional)</span>
            </h2>
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] -mt-2">
              Link this asset to a specific trail and location, or leave unassigned for inventory stock.
            </p>

            <div>
              <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">
                Trail
              </label>
              <select
                value={selectedTrailId}
                onChange={e => {
                  setSelectedTrailId(e.target.value);
                  setSelectedLocationId(''); // Reset location when trail changes
                }}
                className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-3.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none"
              >
                <option value="">Unassigned (In Stock)</option>
                {trails.map(trail => (
                  <option key={trail.id} value={trail.id}>
                    {trail.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedTrailId && (
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">
                  Location
                </label>
                <select
                  value={selectedLocationId}
                  onChange={e => setSelectedLocationId(e.target.value)}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-3.5 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none"
                >
                  <option value="">Select location on this trail</option>
                  {filteredLocations.map(location => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
                {filteredLocations.length === 0 && (
                  <p className="text-[#ff5c39] text-[12px] mt-1.5">
                    No locations found on this trail. Create locations first.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Miscellaneous ──────────────────────────────────────────────── */}
        {isMisc && (
          <>
            {/* Item grid */}
            <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
                Items
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {miscInstallItems.map((item) => (
                  <MiscItemButton
                    key={item}
                    label={item}
                    count={namedCounts[item] || 0}
                    onAdd={() => setNamedCounts(prev => ({ ...prev, [item]: (prev[item] || 0) + 1 }))}
                    onRemove={() => setNamedCounts(prev => ({
                      ...prev,
                      [item]: Math.max(0, (prev[item] || 0) - 1),
                    }))}
                  />
                ))}

                {/* Other button */}
                <button
                  type="button"
                  onClick={() => setOtherItems(prev => [
                    ...prev,
                    { id: crypto.randomUUID(), name: '', count: 1 },
                  ])}
                  className="rounded-[10px] px-3 h-[64px] flex items-center justify-center border border-dashed border-[rgba(0,0,0,0.2)] bg-[#f3f3f5] active:bg-[#e8e8ea] col-span-2 gap-2"
                >
                  <Plus size={16} className="text-[#6a7282]" />
                  <span className="font-['Inter:Medium',sans-serif] font-medium text-[13px] text-[#6a7282]">
                    Other
                  </span>
                </button>
              </div>

              {/* Other item rows */}
              {otherItems.length > 0 && (
                <div className="space-y-2 pt-1">
                  {otherItems.map((item) => (
                    <OtherItemRow
                      key={item.id}
                      item={item}
                      onChange={(id, name, count) =>
                        setOtherItems(prev => prev.map(i => i.id === id ? { ...i, name, count } : i))
                      }
                      onRemove={(id) =>
                        setOtherItems(prev => prev.filter(i => i.id !== id))
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Misc Photos (optional) */}
            <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
                Photos <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px] font-normal">(optional)</span>
              </h2>

              {/* Existing photos */}
              {miscPhotos.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {miscPhotos.map((photo, idx) => (
                    <div key={idx} className="relative">
                      <img
                        src={photo}
                        alt={`Photo ${idx + 1}`}
                        className="w-full aspect-square object-cover rounded-[8px] border border-[rgba(0,0,0,0.1)]"
                      />
                      <button
                        type="button"
                        onClick={() => setMiscPhotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1.5 right-1.5 bg-red-500 text-white p-1.5 rounded-full"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => takePhoto('misc')}
                className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-6 flex flex-col items-center justify-center gap-2 active:bg-[#e8e8ea] transition-colors"
              >
                <ImageIcon size={28} className="text-[#6a7282]" />
                <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[14px]">
                  Add Photo
                </span>
              </button>
            </div>
          </>
        )}

        {/* ── Network Category ─────────────────────────────────────────── */}
        {isNetworkGear && (
          <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
            <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px] mb-2">
              Network Category *
            </label>
            <AddableSelect
              optionKey="network:categories"
              value={formData.networkCategory || ''}
              onChange={v => updateField('networkCategory', v)}
              placeholder="Select category"
            />
          </div>
        )}

        {/* ── Server Configuration ──────────────────────────────────────── */}
        {isServer && (
          <>
            <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
                Server Configuration
              </h2>

              {/* Tower / Rack Mount buttons — no label needed */}
              <div className="grid grid-cols-2 gap-3">
                {SERVER_FORM_FACTORS.map((factor) => (
                  <button key={factor} type="button" onClick={() => updateField('formFactor', factor)}
                    className={`py-4 px-4 rounded-[8px] border-2 transition-all font-['Inter:Medium',sans-serif] text-[15px] ${
                      formData.formFactor === factor
                        ? 'border-[#ff5c39] bg-[#fff5f3] text-[#ff5c39]'
                        : 'border-[rgba(0,0,0,0.1)] bg-[#f3f3f5] text-[#0a0a0a]'
                    }`}
                  >{factor}</button>
                ))}
              </div>

              {[
                { label: 'Processor Model *', field: 'processorModel', optKey: 'server:processors', placeholder: 'Select processor' },
                { label: 'GPU Model *', field: 'gpuModel', optKey: 'server:gpus', placeholder: 'Select GPU' },
                { label: 'RAM *', field: 'ram', optKey: 'server:ram', placeholder: 'Select RAM' },
                { label: 'Motherboard *', field: 'motherboard', optKey: 'server:motherboards', placeholder: 'Select motherboard' },
                { label: 'OS Disk Size *', field: 'osDiskSize', optKey: 'server:os_disks', placeholder: 'Select OS disk size' },
                { label: 'Capture Disk Size *', field: 'captureDiskSize', optKey: 'server:capture_disks', placeholder: 'Select capture disk size' },
                { label: 'Archive Disk Size (Optional)', field: 'archiveDiskSize', optKey: 'server:archive_disks', placeholder: 'Select archive disk size (optional)' },
              ].map(({ label, field, optKey, placeholder }) => (
                <div key={field}>
                  <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">{label}</label>
                  <AddableSelect
                    optionKey={optKey}
                    value={(formData as any)[field] || ''}
                    onChange={v => updateField(field as keyof Asset, v)}
                    placeholder={placeholder}
                  />
                </div>
              ))}

              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">IP Address *</label>
                <input
                  type="text"
                  value={formData.ipAddress || ''}
                  onChange={(e) => updateField('ipAddress', e.target.value)}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]"
                  placeholder={ipSubnet ? `${ipSubnet}…` : '192.168.1.100'}
                />
              </div>
            </div>

            <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Server Photos</h2>
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

        {/* ── Equipment Details (Camera / Network Gear) ─────────────────── */}
        {(isCamera || isNetworkGear) && (
          <>
            <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Equipment Details</h2>

              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">Manufacturer</label>
                <AddableSelect
                  optionKey={manufacturerOptionKey}
                  value={formData.manufacturer || ''}
                  onChange={v => {
                    updateField('manufacturer', v);
                    updateField('customManufacturer', '');
                    updateField('model', '');
                    updateField('customModel', '');
                  }}
                  placeholder="Select manufacturer"
                />
              </div>

              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">Model</label>
                <AddableSelect
                  optionKey={modelOptionKey}
                  value={formData.model || ''}
                  onChange={v => {
                    updateField('model', v);
                    updateField('customModel', '');
                  }}
                  placeholder={formData.manufacturer ? 'Select model' : 'Select manufacturer first'}
                  disabled={!formData.manufacturer}
                />
              </div>

              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">
                  Serial Number
                </label>
                <input
                  type="text"
                  value={formData.serialNumber || ''}
                  onChange={(e) => updateField('serialNumber', e.target.value)}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]"
                  placeholder="Enter serial number"
                />
              </div>

              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-2">IP Address</label>
                <input
                  type="text"
                  value={formData.ipAddress || ''}
                  onChange={(e) => updateField('ipAddress', e.target.value)}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]"
                  placeholder={ipSubnet ? `${ipSubnet}…` : '192.168.1.100'}
                />
              </div>
            </div>

            {/* Photos */}
            <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Photos</h2>
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">
                  Serial Number Photo
                </label>
                <PhotoCaptureButton mode="serial" label="Take Photo" photoField={formData.serialPhoto} />
              </div>
              <div>
                <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">
                  Completed Installation Photo
                </label>
                <PhotoCaptureButton mode="install" label="Take Photo" photoField={formData.installPhoto} />
              </div>
            </div>
          </>
        )}

        {/* Notes */}
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
          <label className="block text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] mb-2">Notes</label>
          <textarea
            value={formData.notes || ''}
            onChange={(e) => updateField('notes', e.target.value)}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px] min-h-[100px]"
            placeholder="Additional notes about this installation..."
          />
        </div>
      </div>

      {/* Fixed Bottom Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[rgba(0,0,0,0.1)] p-4 space-y-3">
        <button
          type="button"
          onClick={() => handleSubmit(false)}
          className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium active:opacity-80"
        >
          {isEditing ? 'Update Asset' : 'Add Asset'}
        </button>
        <button
          type="button"
          onClick={() => handleSubmit(true)}
          className="w-full bg-[#f3f3f5] text-[#0a0a0a] rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium active:bg-[#e8e8ea]"
        >
          Save as Draft
        </button>
      </div>

      {/* Update Confirmation Modal */}
      {showUpdateConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="bg-white w-full max-w-lg rounded-t-[20px] p-6 space-y-4">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-[#fff8ee] flex items-center justify-center">
                <span className="text-[28px]">✏️</span>
              </div>
              <div>
                <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Update Asset?</h2>
                <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px] mt-1">
                  Save your changes to this {formData.type?.toLowerCase()}?
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => { setShowUpdateConfirm(false); submitAsset(pendingDraft); }}
                className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-3.5 font-['Inter:Medium',sans-serif] font-medium active:opacity-80"
              >
                Yes, Update
              </button>
              <button
                onClick={() => setShowUpdateConfirm(false)}
                className="w-full bg-[#f3f3f5] text-[#0a0a0a] rounded-[8px] px-4 py-3.5 font-['Inter:Medium',sans-serif] font-medium active:bg-[#e8e8ea]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}