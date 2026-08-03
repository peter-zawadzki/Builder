// Shared by SiteAssessmentWorkspace (the deep virtual-inspection workspace)
// and MountainMapView (the quick overview map) — both let you select a
// device on the map and edit/view it here, so devices behave identically
// regardless of which map you're looking at them from.
import { useEffect, useRef, useState } from 'react';
import {
  X, Trash2, Pencil, Lock, Unlock, Image, Video, Loader2, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { type Location } from '../context/DataContext';
import {
  type DeviceType, type CameraProperties, type NetworkItem, type NetworkProperties,
  DEVICE_TYPE_CONFIG, DEFAULT_CAMERA_PROPS, NETWORK_CONNECTION_TYPES, NETWORK_SUBTYPES, CAMERA_COLOR_PRESETS,
} from '../utils/deviceTypes';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';
import { compassLabel, METERS_PER_FOOT } from '../utils/geo';
import * as locMediaDB from '../utils/locationMediaDB';
import * as cloudLocSync from '../utils/cloudLocationSync';

function CameraFields({
  properties, onUpdate,
}: { properties: Record<string, unknown> | undefined; onUpdate: (patch: Partial<CameraProperties>) => void }) {
  const props = (properties || {}) as Partial<CameraProperties>;
  const heading = props.heading ?? 0;
  const rangeFt = Math.round((props.rangeMeters ?? DEFAULT_CAMERA_PROPS.rangeMeters) / METERS_PER_FOOT);

  return (
    <div className="space-y-3 pb-3 mb-1 border-b border-[rgba(0,0,0,0.08)]">
      <div>
        <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">
          Heading — {Math.round(heading)}° {compassLabel(heading)}
        </label>
        <input
          type="range" min={0} max={359} value={Math.round(heading)}
          onChange={e => onUpdate({ heading: Number(e.target.value) })}
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">
          Horizontal FOV — {Math.round(props.horizontalFov ?? DEFAULT_CAMERA_PROPS.horizontalFov)}°
        </label>
        <input
          type="range" min={1} max={180} value={Math.round(props.horizontalFov ?? DEFAULT_CAMERA_PROPS.horizontalFov)}
          onChange={e => onUpdate({ horizontalFov: Number(e.target.value) })}
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">
          Range — {rangeFt.toLocaleString()} ft
        </label>
        <input
          type="range" min={10} max={2000} step={10} value={rangeFt}
          onChange={e => onUpdate({ rangeMeters: Number(e.target.value) * METERS_PER_FOOT })}
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Network connection</label>
        <select
          value={props.networkConnection ?? ''}
          onChange={e => onUpdate({ networkConnection: e.target.value as CameraProperties['networkConnection'] })}
          className="w-full bg-[#f3f3f5] rounded-[8px] px-2.5 py-2 text-[#0a0a0a] text-[13px] outline-none"
        >
          <option value="">—</option>
          {NETWORK_CONNECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Color</label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {CAMERA_COLOR_PRESETS.map(c => (
            <button
              key={c} type="button" onClick={() => onUpdate({ color: c })}
              className="w-6 h-6 rounded-full shrink-0"
              style={{ background: c, outline: (props.color ?? DEFAULT_CAMERA_PROPS.color) === c ? '2px solid #0a0a0a' : 'none', outlineOffset: '2px' }}
            />
          ))}
        </div>
      </div>
      <PowerFields
        status={props.powerStatus} voltage={props.powerVoltage}
        onUpdate={patch => onUpdate({
          ...(patch.status !== undefined ? { powerStatus: patch.status as CameraProperties['powerStatus'] } : {}),
          ...(patch.voltage !== undefined ? { powerVoltage: patch.voltage as CameraProperties['powerVoltage'] } : {}),
        })}
      />
    </div>
  );
}

// Network fields — a single marker often represents a rack/cabinet with
// several distinct pieces of gear at once (e.g. a Switch that already exists
// plus a Wireless Transmitter still needed), not exactly one subtype. Tap a
// subtype to add/remove it from the list; each added item gets its own
// Required/Existing status.
function NetworkFields({
  properties, onUpdate,
}: { properties: Record<string, unknown> | undefined; onUpdate: (patch: Partial<NetworkProperties>) => void }) {
  const props = (properties || {}) as Partial<NetworkProperties>;
  const list = props.items || [];

  function toggleSubtype(subtype: string) {
    const exists = list.some(i => i.subtype === subtype);
    onUpdate({ items: exists ? list.filter(i => i.subtype !== subtype) : [...list, { subtype, status: 'Existing' }] });
  }
  function setStatus(subtype: string, status: NetworkItem['status']) {
    onUpdate({ items: list.map(i => i.subtype === subtype ? { ...i, status } : i) });
  }

  return (
    <div className="space-y-3 pb-3 mb-1 border-b border-[rgba(0,0,0,0.08)]">
      <div>
        <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1.5">Equipment at this location</label>
        <div className="grid grid-cols-2 gap-1.5">
          {NETWORK_SUBTYPES.map(s => (
            <button
              key={s} type="button" onClick={() => toggleSubtype(s)}
              className={`py-2 rounded-[8px] text-[12px] font-['Inter:Medium',sans-serif] transition-colors ${
                list.some(i => i.subtype === s) ? 'bg-[#ff5c39] text-white' : 'bg-[#f3f3f5] text-[#6a7282] active:bg-[#e8e8ea]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {list.length > 0 && (
        <div className="space-y-1.5">
          {list.map(item => (
            <div key={item.subtype} className="flex items-center justify-between gap-2 bg-[#f9fafb] rounded-[8px] px-2.5 py-1.5">
              <span className="text-[12px] text-[#0a0a0a] font-['Inter:Regular',sans-serif] truncate">{item.subtype}</span>
              <div className="flex gap-1 shrink-0">
                {(['Required', 'Existing'] as const).map(s => (
                  <button
                    key={s} type="button" onClick={() => setStatus(item.subtype, s)}
                    className={`px-2 py-1 rounded-[6px] text-[11px] font-['Inter:Medium',sans-serif] ${
                      item.status === s ? 'bg-[#1D2930] text-white' : 'bg-white text-[#6a7282] border border-[rgba(0,0,0,0.08)]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Network connection</label>
        <select
          value={props.networkConnection ?? ''}
          onChange={e => onUpdate({ networkConnection: e.target.value as NetworkProperties['networkConnection'] })}
          className="w-full bg-[#f3f3f5] rounded-[8px] px-2.5 py-2 text-[#0a0a0a] text-[13px] outline-none"
        >
          <option value="">—</option>
          {NETWORK_CONNECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );
}

// Power fields — shared by the standalone Power Source device and Camera
// (a camera needs power too, and it's often simpler to note that inline
// than to place a separate Power marker right next to it). Voltage only
// appears once marked Existing — a Needed power source has no known voltage yet.
function PowerFields({
  status, voltage, onUpdate,
}: { status: string | undefined; voltage: string | undefined; onUpdate: (patch: { status?: string; voltage?: string }) => void }) {
  return (
    <div className="space-y-3 pb-3 mb-1 border-b border-[rgba(0,0,0,0.08)]">
      <div>
        <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-2">Power</label>
        <div className="grid grid-cols-2 gap-2">
          {(['Existing', 'Needed'] as const).map(s => (
            <button
              key={s} type="button"
              onClick={() => onUpdate({ status: s, ...(s !== 'Existing' ? { voltage: undefined } : {}) })}
              className={`h-10 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] transition-colors ${
                status === s ? 'bg-[#ff5c39] text-white' : 'bg-[#f3f3f5] text-[#6a7282] active:bg-[#e8e8ea]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {status === 'Existing' && (
        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Voltage</label>
          <select
            value={voltage ?? ''}
            onChange={e => onUpdate({ voltage: e.target.value })}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-2.5 py-2 text-[#0a0a0a] text-[13px] outline-none"
          >
            <option value="">—</option>
            <option value="120V">120V</option>
            <option value="480V">480V</option>
          </select>
        </div>
      )}
    </div>
  );
}

// Start/Finish-only fields — race discipline plus which end of the course
// this marks. Reuses the pre-existing Location.locationType ('Start' |
// 'Finish') rather than inventing a new field, so it stays consistent with
// the classic CreateLocation.tsx flow's Start/Finish locations.
const RACE_DISCIPLINES = ['GS', 'SL', 'SG', 'DH', 'Misc'];

function StartFinishFields({
  disciplines, locationType, onUpdateDisciplines, onUpdateLocationType,
}: {
  disciplines: string[] | undefined;
  locationType: string | undefined;
  onUpdateDisciplines: (disciplines: string[]) => void;
  onUpdateLocationType: (locationType: 'Start' | 'Finish') => void;
}) {
  const selected = disciplines || [];
  const toggle = (d: string) => {
    onUpdateDisciplines(selected.includes(d) ? selected.filter(x => x !== d) : [...selected, d]);
  };
  return (
    <div className="space-y-3 pb-3 mb-1 border-b border-[rgba(0,0,0,0.08)]">
      <div>
        <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-2">Type</label>
        <div className="grid grid-cols-3 gap-2">
          {RACE_DISCIPLINES.map(d => {
            const checked = selected.includes(d);
            return (
              <button
                key={d} type="button"
                onClick={() => toggle(d)}
                className={`h-10 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] transition-colors flex items-center justify-center gap-1.5 ${
                  checked ? 'bg-[#ff5c39] text-white' : 'bg-[#f3f3f5] text-[#6a7282] active:bg-[#e8e8ea]'
                }`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center ${
                    checked ? 'border-white bg-white/20' : 'border-[#6a7282]'
                  }`}
                >
                  {checked && <Check size={10} className="text-white" strokeWidth={3} />}
                </span>
                {d}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-2">Start or Finish</label>
        <div className="grid grid-cols-2 gap-2">
          {(['Start', 'Finish'] as const).map(t => (
            <button
              key={t} type="button"
              onClick={() => onUpdateLocationType(t)}
              className={`h-10 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] transition-colors ${
                locationType === t ? 'bg-[#ff5c39] text-white' : 'bg-[#f3f3f5] text-[#6a7282] active:bg-[#e8e8ea]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function deviceSummaryLines(location: Location): { label: string; value: string }[] {
  const deviceType = location.deviceType as DeviceType | undefined;
  const props = (location.deviceProperties || {}) as any;
  if (deviceType === 'camera') {
    return [
      { label: 'Heading', value: `${Math.round(props.heading ?? 0)}° ${compassLabel(props.heading ?? 0)}` },
      { label: 'Horizontal FOV', value: `${Math.round(props.horizontalFov ?? DEFAULT_CAMERA_PROPS.horizontalFov)}°` },
      { label: 'Range', value: `${Math.round((props.rangeMeters ?? DEFAULT_CAMERA_PROPS.rangeMeters) / METERS_PER_FOOT).toLocaleString()} ft` },
      { label: 'Network connection', value: props.networkConnection || '—' },
      { label: 'Power', value: props.powerStatus || '—' },
      ...(props.powerStatus === 'Existing' ? [{ label: 'Voltage', value: props.powerVoltage || '—' }] : []),
    ];
  }
  if (deviceType === 'network') {
    const items = (props.items || []) as NetworkItem[];
    return items.length > 0
      ? items.map(i => ({ label: i.subtype, value: i.status }))
      : [{ label: 'Equipment', value: '—' }];
  }
  if (deviceType === 'power') return [
    { label: 'Power', value: props.status || '—' },
    ...(props.status === 'Existing' ? [{ label: 'Voltage', value: props.voltage || '—' }] : []),
  ];
  if (deviceType === 'startfinish') {
    const disciplines: string[] = props.disciplines || (props.discipline ? [props.discipline] : []);
    return [
      { label: 'Type', value: disciplines.length > 0 ? disciplines.join(', ') : '—' },
      { label: 'Start or Finish', value: location.locationType || '—' },
    ];
  }
  return [];
}

// Same photo/video capability as the classic CreateLocation.tsx flow — every
// Location gets it regardless of how it was added, so devices placed here
// aren't a second-class kind of Location. Loads any existing media on mount
// (IndexedDB first, cloud fallback — same as LocationDetail.tsx), and
// persists immediately on every add/remove rather than waiting for a
// separate Save step, matching how every other field in this panel behaves.
function LocationMediaFields({ locationId }: { locationId: string }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Reconciles with cloud every time (not just when local is empty) —
    // otherwise once this device has any local copy, it never sees another
    // device's later uploads or deletions for this location again.
    cloudLocSync.reconcileLocationMedia(locationId, 'loc').then(m => {
      if (cancelled) return;
      setPhotos(m.photos); setVideos(m.videos);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [locationId]);

  async function persist(nextPhotos: string[], nextVideos: string[]) {
    await locMediaDB.saveLocationMedia(locationId, { photos: nextPhotos, videos: nextVideos });
    if (!navigator.onLine) {
      cloudLocSync.addPendingLocMedia(locationId, 'loc');
    } else {
      cloudLocSync.uploadLocationMedia(locationId, { photos: nextPhotos, videos: nextVideos }, 'loc')
        .then(ok => {
          if (!ok) {
            cloudLocSync.addPendingLocMedia(locationId, 'loc');
            toast.error('Media upload failed — will retry when reconnected', { duration: 4000 });
          }
        })
        .catch(() => {
          cloudLocSync.addPendingLocMedia(locationId, 'loc');
          toast.error('Media upload failed — will retry when reconnected', { duration: 4000 });
        });
    }
  }

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setMediaLoading(true);
    try {
      const b64s = await Promise.all(files.map(f => locMediaDB.fileToBase64(f)));
      const next = [...photos, ...b64s];
      setPhotos(next);
      await persist(next, videos);
    } catch {
      toast.error('Failed to load photo');
    } finally {
      setMediaLoading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  async function handleVideoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setMediaLoading(true);
    try {
      const b64s = await Promise.all(files.map(f => locMediaDB.fileToBase64(f)));
      const next = [...videos, ...b64s];
      setVideos(next);
      await persist(photos, next);
    } catch {
      toast.error('Failed to load video');
    } finally {
      setMediaLoading(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  }

  function removePhoto(i: number) {
    const next = photos.filter((_, idx) => idx !== i);
    setPhotos(next);
    persist(next, videos);
  }
  function removeVideo(i: number) {
    const next = videos.filter((_, idx) => idx !== i);
    setVideos(next);
    persist(photos, next);
  }

  return (
    <div className="space-y-3 pb-3 mb-1 border-b border-[rgba(0,0,0,0.08)]">
      <div>
        <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1.5">Photos</label>
        {photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
            {photos.map((src, i) => (
              <div key={i} className="relative shrink-0">
                <img src={src} alt={`Photo ${i + 1}`} className="w-16 h-16 object-cover rounded-[8px]" />
                <button type="button" onClick={() => removePhoto(i)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#0a0a0a] rounded-full flex items-center justify-center active:opacity-60">
                  <X size={10} className="text-white" strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        )}
        <input ref={photoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handlePhotoCapture} />
        <button type="button" onClick={() => photoInputRef.current?.click()} disabled={mediaLoading}
          className="w-full bg-[#f3f3f5] rounded-[8px] py-2 flex items-center justify-center gap-1.5 text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] active:bg-[#e8e8ea] disabled:opacity-50">
          {mediaLoading ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />} Add Photo
        </button>
      </div>

      <div>
        <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1.5">Videos</label>
        {videos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
            {videos.map((src, i) => (
              <div key={i} className="relative shrink-0">
                <video src={src} className="w-16 h-16 object-cover rounded-[8px] bg-black" muted playsInline />
                <button type="button" onClick={() => removeVideo(i)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#0a0a0a] rounded-full flex items-center justify-center active:opacity-60">
                  <X size={10} className="text-white" strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        )}
        <input ref={videoInputRef} type="file" accept="video/*" capture="environment" multiple className="hidden" onChange={handleVideoCapture} />
        <button type="button" onClick={() => videoInputRef.current?.click()} disabled={mediaLoading}
          className="w-full bg-[#f3f3f5] rounded-[8px] py-2 flex items-center justify-center gap-1.5 text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] active:bg-[#e8e8ea] disabled:opacity-50">
          {mediaLoading ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />} Add Video
        </button>
      </div>
    </div>
  );
}

// Matches ContactDetailModal's pattern (MountainDetail.tsx): a read-only
// summary by default, with a pencil to enter edit mode — where the actual
// fields (and Delete) live. Prevents "clicked the marker, accidentally
// changed a field" and keeps Delete from being one accidental tap away.
// Read-only thumbnail strip for the summary (non-editing) view — replaces
// the old "View Photos & Videos" button so photos/videos are visible at a
// glance without an extra tap. Clicking a thumbnail opens a larger lightbox
// view of just that image/video.
function LocationMediaThumbnails({ locationId, onOpenFull }: { locationId: string; onOpenFull?: () => void }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lightbox, setLightbox] = useState<{ type: 'photo' | 'video'; src: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reconciles with cloud every time — see LocationMediaFields above.
    cloudLocSync.reconcileLocationMedia(locationId, 'loc').then(m => {
      if (cancelled) return;
      setPhotos(m.photos); setVideos(m.videos);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [locationId]);

  if (!loaded || (photos.length === 0 && videos.length === 0)) return null;

  return (
    <>
      <div>
        <p className="text-[#8992a0] font-['Inter:Regular',sans-serif] text-[11px] uppercase tracking-wide mb-1.5">Photos & Videos</p>
        <div className="flex gap-2 flex-wrap">
          {photos.map((src, i) => (
            <button key={`p${i}`} type="button" onClick={() => setLightbox({ type: 'photo', src })} className="shrink-0 active:opacity-70">
              <img src={src} alt={`Photo ${i + 1}`} className="w-14 h-14 object-cover rounded-[8px]" />
            </button>
          ))}
          {videos.map((src, i) => (
            <button key={`v${i}`} type="button" onClick={() => setLightbox({ type: 'video', src })} className="relative shrink-0 active:opacity-70">
              <video src={src} className="w-14 h-14 object-cover rounded-[8px] bg-black" muted playsInline />
              <span className="absolute inset-0 flex items-center justify-center">
                <Video size={16} className="text-white drop-shadow" />
              </span>
            </button>
          ))}
        </div>
        {onOpenFull && (
          <button
            onClick={onOpenFull}
            className="mt-2 text-[12px] font-['Inter:Medium',sans-serif] text-[#307fe2] active:opacity-70"
          >
            Open full view & annotations
          </button>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/85 z-[2000] flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-9 h-9 bg-white/10 rounded-full flex items-center justify-center active:bg-white/20"
          >
            <X size={20} className="text-white" />
          </button>
          {lightbox.type === 'photo' ? (
            <img src={lightbox.src} alt="Full view" className="max-w-full max-h-full object-contain rounded-[8px]" onClick={e => e.stopPropagation()} />
          ) : (
            <video src={lightbox.src} controls autoPlay className="max-w-full max-h-full object-contain rounded-[8px]" onClick={e => e.stopPropagation()} />
          )}
        </div>
      )}
    </>
  );
}

export function LocationPropertiesPanel({
  location, trails, defaultEditing, onUpdate, onDelete, onClose, onEditingChange, onViewFullDetails,
}: {
  location: Location;
  trails: { id: string; name: string }[];
  defaultEditing?: boolean;
  onUpdate: (data: Partial<Location>) => void;
  onDelete: () => void;
  onClose: () => void;
  // Lets a caller (MountainMapView) gate marker draggability on whether this
  // specific item's panel is currently in edit mode, instead of a page-wide
  // toggle — dragging the wrong pin by accident is easy when everything on
  // the map is draggable at once.
  onEditingChange?: (editing: boolean) => void;
  // Opens the full LocationDetail page (in a modal) for photos, videos, and
  // annotations — this compact panel only shows a quick technical summary.
  onViewFullDetails?: () => void;
}) {
  const [editing, setEditingState] = useState(!!defaultEditing);
  const [name, setName] = useState(location.name);
  const [notes, setNotes] = useState(location.notes || '');

  function setEditing(value: boolean) {
    setEditingState(value);
    onEditingChange?.(value);
  }

  useEffect(() => { onEditingChange?.(editing); }, []);

  const debouncedUpdate = useDebouncedCallback((data: Partial<Location>) => onUpdate(data), 500);

  const deviceType = location.deviceType as DeviceType | undefined;
  const config = deviceType ? DEVICE_TYPE_CONFIG[deviceType] : null;
  const title = deviceType === 'startfinish'
    ? (location.locationType || 'Start/Finish')
    : (config?.label || location.locationType || 'Location');

  return (
    <div className="absolute top-4 right-4 bottom-20 w-72 bg-white rounded-[12px] shadow-lg z-10 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,0,0,0.08)] shrink-0">
        <div className="flex items-center gap-2">
          {config && <span className="w-3 h-3 rounded-full shrink-0" style={{ background: config.color }} />}
          <span className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif]">{title}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {editing ? (
            <button
              onClick={() => setEditing(false)}
              className="px-2.5 py-1 rounded-full bg-[#ff5c39] text-white text-[11px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80"
            >
              Apply
            </button>
          ) : (
            <button onClick={() => setEditing(true)} className="p-1 active:opacity-60" title="Edit">
              <Pencil size={15} className="text-[#6a7282]" />
            </button>
          )}
          <button onClick={onClose} className="p-1 active:opacity-60"><X size={16} className="text-[#6a7282]" /></button>
        </div>
      </div>

      {editing ? (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div>
              <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Name</label>
              <input
                type="text" value={name}
                onChange={e => { setName(e.target.value); debouncedUpdate({ name: e.target.value }); }}
                className="w-full bg-[#f3f3f5] rounded-[8px] px-2.5 py-2 text-[#0a0a0a] text-[13px] outline-none"
              />
            </div>

            {deviceType === 'camera' && (
              <CameraFields
                properties={location.deviceProperties}
                onUpdate={patch => onUpdate({ deviceProperties: { ...(location.deviceProperties || {}), ...patch } })}
              />
            )}

            {deviceType === 'network' && (
              <NetworkFields
                properties={location.deviceProperties}
                onUpdate={patch => onUpdate({ deviceProperties: { ...(location.deviceProperties || {}), ...patch } })}
              />
            )}

            {deviceType === 'power' && (
              <PowerFields
                status={(location.deviceProperties as any)?.status}
                voltage={(location.deviceProperties as any)?.voltage}
                onUpdate={patch => onUpdate({ deviceProperties: { ...(location.deviceProperties || {}), ...patch } })}
              />
            )}

            {deviceType === 'startfinish' && (
              <StartFinishFields
                disciplines={
                  (location.deviceProperties as any)?.disciplines
                  || ((location.deviceProperties as any)?.discipline ? [(location.deviceProperties as any).discipline] : undefined)
                }
                locationType={location.locationType}
                onUpdateDisciplines={disciplines => onUpdate({ deviceProperties: { ...(location.deviceProperties || {}), disciplines } })}
                onUpdateLocationType={locationType => onUpdate({ locationType })}
              />
            )}

            <LocationMediaFields locationId={location.id} />

            {trails.length > 0 && (
              <div>
                <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Trail (optional)</label>
                <select
                  value={location.trailId || ''}
                  onChange={e => {
                    const trail = trails.find(t => t.id === e.target.value);
                    onUpdate({ trailId: e.target.value || undefined, trailName: trail?.name });
                  }}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-2.5 py-2 text-[#0a0a0a] text-[13px] outline-none"
                >
                  <option value="">No trail</option>
                  {trails.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Notes</label>
              <textarea
                value={notes} rows={3}
                onChange={e => { setNotes(e.target.value); debouncedUpdate({ notes: e.target.value }); }}
                className="w-full bg-[#f3f3f5] rounded-[8px] px-2.5 py-2 text-[#0a0a0a] text-[13px] outline-none resize-none"
              />
            </div>

            {/* Same "Install Difficulty" pattern as the old Inspection flow —
                reuses Location.difficulty rather than a new field. Doesn't
                apply to Start/Finish lines or Buildings — neither is
                something that gets "installed." */}
            {deviceType !== 'startfinish' && deviceType !== 'building' && (
              <div>
                <label className="block text-[#6a7282] font-['Inter:Medium',sans-serif] text-[12px] mb-2 uppercase tracking-wider">Install Difficulty</label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n} type="button"
                      onClick={() => onUpdate({ difficulty: (location.difficulty === n ? undefined : n) as Location['difficulty'] })}
                      className={`flex-1 py-2 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] ${
                        location.difficulty === n ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[#8992a0] mt-1.5">1 = easy · 5 = hard</p>
              </div>
            )}

            <button
              onClick={() => onUpdate({ isLocked: !location.isLocked })}
              className="w-full flex items-center justify-center gap-1.5 text-[12px] font-['Inter:Medium',sans-serif] bg-[#f3f3f5] text-[#6a7282] py-2 rounded-[8px] active:opacity-70"
            >
              {location.isLocked ? <Unlock size={13} /> : <Lock size={13} />}
              {location.isLocked ? 'Unlock position' : 'Lock position'}
            </button>
          </div>

          <div className="p-3 border-t border-[rgba(0,0,0,0.08)] shrink-0">
            <button
              onClick={onDelete}
              className="w-full flex items-center justify-center gap-1.5 text-[12px] font-['Inter:Medium',sans-serif] text-[#ef4444] bg-[#fef2f2] py-2 rounded-[8px] active:opacity-70"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">{location.name}</p>
            {location.isLocked && (
              <span className="inline-flex items-center gap-1 mt-1 text-[11px] text-[#6a7282]"><Lock size={11} /> Locked</span>
            )}
          </div>
          {deviceSummaryLines(location).map(line => (
            <div key={line.label}>
              <p className="text-[#8992a0] font-['Inter:Regular',sans-serif] text-[11px] uppercase tracking-wide">{line.label}</p>
              <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">{line.value}</p>
            </div>
          ))}
          {location.trailName && (
            <div>
              <p className="text-[#8992a0] font-['Inter:Regular',sans-serif] text-[11px] uppercase tracking-wide">Trail</p>
              <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">{location.trailName}</p>
            </div>
          )}
          {location.difficulty && (
            <div>
              <p className="text-[#8992a0] font-['Inter:Regular',sans-serif] text-[11px] uppercase tracking-wide">Install Difficulty</p>
              <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">{location.difficulty} / 5</p>
            </div>
          )}
          {location.notes && (
            <div>
              <p className="text-[#8992a0] font-['Inter:Regular',sans-serif] text-[11px] uppercase tracking-wide">Notes</p>
              <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px] whitespace-pre-wrap">{location.notes}</p>
            </div>
          )}
          {deviceSummaryLines(location).length === 0 && !location.trailName && !location.difficulty && !location.notes && (
            <p className="text-[#8992a0] font-['Inter:Regular',sans-serif] text-[13px]">No details yet — tap the pencil to add some.</p>
          )}
          <LocationMediaThumbnails locationId={location.id} onOpenFull={onViewFullDetails} />
        </div>
      )}
    </div>
  );
}
