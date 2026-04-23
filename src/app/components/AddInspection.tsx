import * as locMediaDB from '../utils/locationMediaDB';
import * as cloudLocSync from '../utils/cloudLocationSync';
import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, Plus, Minus, Loader2, Image, Video, X, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData, MULTI_COUNT_ITEMS, SiteInspectionItemType, SiteInspectionItem } from '../context/DataContext';

const ALL_ITEMS: SiteInspectionItemType[] = [
  'Camera', 'Battery Box', 'POE Switch', 'POE Extender',
  'Wireless RX', 'Wireless TX', 'Existing 120V', 'Existing 480V',
  'Transformer Required', 'Existing Data Drop', 'Existing Fiber Drop',
  'Passive POE Adapter', 'Ethernet Cable 50Ft', 'Antenna Mount',
];

const isMulti = (type: SiteInspectionItemType) => MULTI_COUNT_ITEMS.includes(type);

// ─── Equipment item button ────────────────────────────────────────────────────

function ItemButton({
  type, count, onAdd, onRemove,
}: {
  type: SiteInspectionItemType;
  count: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const multi = isMulti(type);
  const selected = count > 0;
  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={onAdd}
        className={`flex-1 rounded-[10px] px-3 h-[64px] flex items-center justify-center border transition-colors active:scale-[0.97] ${
          selected ? 'bg-[#ff5c39] border-[#ff5c39]' : 'bg-white border-[rgba(0,0,0,0.12)]'
        }`}
      >
        <span className={`font-['Inter:Medium',sans-serif] font-medium text-[13px] text-center leading-tight ${
          selected ? 'text-white' : 'text-[#0a0a0a]'
        }`}>
          {type}
        </span>
      </button>
      {selected && (
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          {multi && (
            <span className="min-w-[28px] h-[28px] bg-[#ff5c39] text-white text-[13px] font-['Inter:Medium',sans-serif] font-medium rounded-full flex items-center justify-center px-1">
              {count}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-7 h-7 bg-[#0a0a0a] rounded-full flex items-center justify-center active:opacity-60"
            aria-label={`Remove ${type}`}
          >
            <Minus size={13} className="text-white" strokeWidth={3} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AddInspection() {
  const { mountainId, locationId } = useParams();
  const navigate = useNavigate();
  const { getMountainById, getLocationById, updateLocation } = useData();

  const mountain = getMountainById(mountainId!);
  const location = getLocationById(locationId!);
  const isEditing = !!location?.inspection;

  // Pre-fill from existing inspection if editing
  const [itemCounts, setItemCounts] = useState<Record<SiteInspectionItemType, number>>(() => {
    const base = Object.fromEntries(ALL_ITEMS.map(t => [t, 0])) as Record<SiteInspectionItemType, number>;
    if (location?.inspection) {
      location.inspection.items.forEach(item => { base[item.type] = item.count; });
    }
    return base;
  });

  const [notes, setNotes] = useState(location?.inspection?.notes || '');

  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Load existing inspection media when editing
  useEffect(() => {
    if (isEditing && locationId) {
      locMediaDB.getInspectionMedia(locationId).then(m => {
        setPhotos(m.photos);
        setVideos(m.videos);
      });
    }
  }, [isEditing, locationId]);

  const addItem = (type: SiteInspectionItemType) => {
    if (!isMulti(type) && itemCounts[type] > 0) return;
    setItemCounts(prev => ({ ...prev, [type]: prev[type] + 1 }));
  };

  const removeItem = (type: SiteInspectionItemType) => {
    setItemCounts(prev => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }));
  };

  const totalItems = Object.values(itemCounts).reduce((s, c) => s + c, 0);

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setMediaLoading(true);
    try {
      const b64s = await Promise.all(files.map(f => locMediaDB.fileToBase64(f)));
      setPhotos(prev => [...prev, ...b64s]);
    } catch {
      toast.error('Failed to load photo');
    } finally {
      setMediaLoading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleVideoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setMediaLoading(true);
    try {
      const b64s = await Promise.all(files.map(f => locMediaDB.fileToBase64(f)));
      setVideos(prev => [...prev, ...b64s]);
    } catch {
      toast.error('Failed to load video');
    } finally {
      setMediaLoading(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (totalItems === 0) {
      toast.error('Add at least one equipment item');
      return;
    }
    setSaving(true);
    try {
      const items: SiteInspectionItem[] = ALL_ITEMS
        .filter(t => itemCounts[t] > 0)
        .map(t => ({ type: t, count: itemCounts[t] }));

      updateLocation(locationId!, {
        inspection: {
          items,
          notes: notes.trim() || undefined,
          createdAt: location?.inspection?.createdAt || new Date().toISOString(),
        },
      });

      if (photos.length > 0 || videos.length > 0) {
        await locMediaDB.saveInspectionMedia(locationId!, { photos, videos });
        // Upload inspection photos to cloud
        const localPhotos = photos.filter(p => p.startsWith('data:'));
        if (localPhotos.length > 0) {
          cloudLocSync.uploadLocationMedia(locationId!, { photos: localPhotos }, 'insp')
            .then(ok => {
              if (ok) toast.success('Inspection photos synced to cloud ☁️', { duration: 2500 });
              else toast.error('Inspection photo upload failed — re-save to retry');
            })
            .catch(e => console.error('[AddInspection] cloud upload error:', e));
        }
      }

      toast.success(isEditing ? 'Inspection updated' : 'Inspection added');
      navigate(`/mountains/${mountainId}/locations/${locationId}`);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save inspection. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!mountain || !location) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">Location not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] pb-8">
      {/* Hidden file inputs */}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
        multiple className="hidden" onChange={handlePhotoCapture} />
      <input ref={videoInputRef} type="file" accept="video/*" capture="environment"
        className="hidden" onChange={handleVideoCapture} />

      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">
              {isEditing ? 'Edit Inspection' : 'Add Inspection'}
            </h1>
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] truncate">
              {location.name}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-5">

        {/* ── Equipment ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">
              Equipment <span className="text-[#ff5c39]">*</span>
            </h2>
            {totalItems > 0 && (
              <span className="bg-[#ff5c39] text-white text-[12px] font-['Inter:Medium',sans-serif] font-medium px-2.5 py-1 rounded-full">
                {totalItems} item{totalItems !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-4">
            Tap to select. Camera, Passive POE, and Ethernet Cable can be added multiple times.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {ALL_ITEMS.map(type => (
              <ItemButton
                key={type}
                type={type}
                count={itemCounts[type]}
                onAdd={() => addItem(type)}
                onRemove={() => removeItem(type)}
              />
            ))}
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-3">Notes</h2>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any notes about this inspection…"
            rows={4}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none resize-none"
          />
        </div>

        {/* ── Photos ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Photos</h2>
            {photos.length > 0 && (
              <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">{photos.length}</span>
            )}
          </div>
          {photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
              {photos.map((src, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img src={src} alt={`Photo ${i + 1}`} className="w-20 h-20 object-cover rounded-[8px]" />
                  <button type="button" onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#0a0a0a] rounded-full flex items-center justify-center active:opacity-60">
                    <X size={10} className="text-white" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => photoInputRef.current?.click()} disabled={mediaLoading}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-3.5 flex items-center justify-center gap-2 text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium active:bg-[#e8e8ea] disabled:opacity-50">
            {mediaLoading ? <Loader2 size={20} className="animate-spin text-[#6a7282]" /> : <Image size={20} className="text-[#6a7282]" />}
            Add Photo
          </button>
        </div>

        {/* ── Videos ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Videos</h2>
            {videos.length > 0 && (
              <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">{videos.length}</span>
            )}
          </div>
          {videos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
              {videos.map((src, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <video src={src} className="w-20 h-20 object-cover rounded-[8px] bg-black" muted playsInline />
                  <button type="button" onClick={() => setVideos(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#0a0a0a] rounded-full flex items-center justify-center active:opacity-60">
                    <X size={10} className="text-white" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => videoInputRef.current?.click()} disabled={mediaLoading}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-3.5 flex items-center justify-center gap-2 text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium active:bg-[#e8e8ea] disabled:opacity-50">
            {mediaLoading ? <Loader2 size={20} className="animate-spin text-[#6a7282]" /> : <Video size={20} className="text-[#6a7282]" />}
            Add Video
          </button>
        </div>

        {/* ── Save ── */}
        <button type="button" onClick={handleSave} disabled={saving}
          className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-4 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[16px] active:opacity-80 disabled:opacity-50">
          {saving ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
          {saving ? 'Saving…' : isEditing ? 'Update Inspection' : 'Save Inspection'}
        </button>

      </div>
    </div>
  );
}