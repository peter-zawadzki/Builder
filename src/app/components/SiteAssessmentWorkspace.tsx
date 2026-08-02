import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import mapboxgl from 'mapbox-gl';
import {
  ArrowLeft, Loader2, LocateFixed, Search, MousePointer2, Server, Router, Zap,
  Building2, Box, ChevronDown, ChevronUp, Trash2, Eye, EyeOff, Lock, Unlock, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../context/DataContext';
import { getSiteAssessment, updateSiteAssessment, type SiteAssessment } from '../utils/siteAssessmentsApi';
import {
  createObject, updateObject, deleteObject, type SiteAssessmentObject, type ObjectType,
} from '../utils/siteAssessmentsApi';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string;

const DEFAULT_CENTER: [number, number] = [-98.35, 39.5]; // continental US, same fallback as Map View
const SATELLITE_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

const OBJECT_TYPE_CONFIG: Record<ObjectType, { label: string; color: string; Icon: typeof Server }> = {
  server: { label: 'Server', color: '#6366f1', Icon: Server },
  network: { label: 'Network Device', color: '#0ea5e9', Icon: Router },
  power: { label: 'Power Source', color: '#f59e0b', Icon: Zap },
  building: { label: 'Building', color: '#64748b', Icon: Building2 },
  misc: { label: 'Miscellaneous', color: '#94a3b8', Icon: Box },
};
const TOOLS: ObjectType[] = ['server', 'network', 'power', 'building', 'misc'];

const VERIFICATION_STATUSES = [
  'Unverified', 'Visible in map imagery', 'Reported by resort',
  'Confirmed during virtual inspection', 'Field verified', 'Installed', 'Operationally validated',
];

// Mapbox Geocoding — only used when the mountain has neither a cached
// Mountain.coordinates (from the existing Nominatim-based Map View feature,
// reused here as the first-choice cache per the plan) nor one already
// resolved for this specific assessment. Public token is fine for this;
// there's no secret-scope operation involved in forward geocoding.
async function geocodeWithMapbox(address: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxgl.accessToken}&limit=1`
    );
    const data = await res.json();
    const center = data?.features?.[0]?.center;
    return Array.isArray(center) && center.length === 2 ? [center[0], center[1]] : null;
  } catch {
    return null;
  }
}

function createMarkerElement(type: ObjectType, isSelected: boolean) {
  const config = OBJECT_TYPE_CONFIG[type] || OBJECT_TYPE_CONFIG.misc;
  const el = document.createElement('div');
  el.style.cssText = `
    width: 28px; height: 28px; border-radius: 50%;
    background: ${config.color}; border: 2px solid white;
    display: flex; align-items: center; justify-content: center;
    color: white; font-family: sans-serif; font-size: 12px; font-weight: 700;
    box-shadow: 0 2px 6px rgba(0,0,0,0.35);
    cursor: pointer;
    ${isSelected ? 'outline: 3px solid #ff5c39; outline-offset: 2px;' : ''}
  `;
  el.textContent = config.label[0];
  return el;
}

// ── Properties panel ──────────────────────────────────────────────────────

function ObjectPropertiesPanel({
  object, trails, onUpdate, onDelete, onClose,
}: {
  object: SiteAssessmentObject;
  trails: { id: string; name: string }[];
  onUpdate: (data: Partial<SiteAssessmentObject>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(object.name);
  const [subtype, setSubtype] = useState(object.object_subtype || '');
  const [notes, setNotes] = useState(object.notes || '');

  useEffect(() => { setName(object.name); setSubtype(object.object_subtype || ''); setNotes(object.notes || ''); }, [object.id]);

  const debouncedUpdate = useDebouncedCallback((data: Partial<SiteAssessmentObject>) => onUpdate(data), 500);

  const config = OBJECT_TYPE_CONFIG[object.object_type as ObjectType] || OBJECT_TYPE_CONFIG.misc;

  return (
    <div className="absolute top-4 right-4 bottom-20 w-72 bg-white rounded-[12px] shadow-lg z-10 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,0,0,0.08)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: config.color }} />
          <span className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif]">{config.label}</span>
        </div>
        <button onClick={onClose} className="p-1 active:opacity-60"><X size={16} className="text-[#6a7282]" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Name</label>
          <input
            type="text" value={name}
            onChange={e => { setName(e.target.value); debouncedUpdate({ name: e.target.value }); }}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-2.5 py-2 text-[#0a0a0a] text-[13px] outline-none"
          />
        </div>

        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Subtype (optional)</label>
          <input
            type="text" value={subtype} placeholder="e.g. Switch, Rack Server, Panel…"
            onChange={e => { setSubtype(e.target.value); debouncedUpdate({ object_subtype: e.target.value }); }}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-2.5 py-2 text-[#0a0a0a] text-[13px] outline-none"
          />
        </div>

        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Status</label>
          <select
            value={object.status || ''}
            onChange={e => onUpdate({ status: e.target.value || null } as any)}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-2.5 py-2 text-[#0a0a0a] text-[13px] outline-none"
          >
            <option value="">—</option>
            <option value="Existing">Existing</option>
            <option value="Proposed">Proposed</option>
          </select>
        </div>

        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Verification</label>
          <select
            value={object.verification_status}
            onChange={e => onUpdate({ verification_status: e.target.value })}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-2.5 py-2 text-[#0a0a0a] text-[13px] outline-none"
          >
            {VERIFICATION_STATUSES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {trails.length > 0 && (
          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Trail (optional)</label>
            <select
              value={object.trail_id || ''}
              onChange={e => onUpdate({ trail_id: e.target.value || null } as any)}
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

        <div className="flex gap-2">
          <button
            onClick={() => onUpdate({ is_hidden: !object.is_hidden } as any)}
            className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-['Inter:Medium',sans-serif] bg-[#f3f3f5] text-[#6a7282] py-2 rounded-[8px] active:opacity-70"
          >
            {object.is_hidden ? <Eye size={13} /> : <EyeOff size={13} />} {object.is_hidden ? 'Show' : 'Hide'}
          </button>
          <button
            onClick={() => onUpdate({ is_locked: !object.is_locked } as any)}
            className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-['Inter:Medium',sans-serif] bg-[#f3f3f5] text-[#6a7282] py-2 rounded-[8px] active:opacity-70"
          >
            {object.is_locked ? <Unlock size={13} /> : <Lock size={13} />} {object.is_locked ? 'Unlock' : 'Lock'}
          </button>
        </div>
      </div>

      <div className="p-3 border-t border-[rgba(0,0,0,0.08)] shrink-0">
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-1.5 text-[12px] font-['Inter:Medium',sans-serif] text-[#ef4444] bg-[#fef2f2] py-2 rounded-[8px] active:opacity-70"
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </div>
  );
}

export function SiteAssessmentWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getMountainById, getProjectById, updateMountain, getTrailsByMountainId } = useData();

  const [siteAssessment, setSiteAssessment] = useState<SiteAssessment | null>(null);
  const [objects, setObjects] = useState<SiteAssessmentObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [needsManualLocate, setNeedsManualLocate] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const [activeTool, setActiveTool] = useState<'select' | ObjectType>('select');
  const [addAnother, setAddAnother] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const resortCenterRef = useRef<[number, number]>(DEFAULT_CENTER);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  useEffect(() => {
    if (!id) return;
    getSiteAssessment(id)
      .then(res => { setSiteAssessment(res.siteAssessment); setObjects(res.objects || []); })
      .catch(err => setLoadError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  const mountain = siteAssessment ? getMountainById(siteAssessment.mountain_id) : undefined;
  const project = siteAssessment?.project_id ? getProjectById(siteAssessment.project_id) : undefined;
  const trails = mountain ? getTrailsByMountainId(mountain.id).map(t => ({ id: t.id, name: t.name })) : [];
  const selectedObject = objects.find(o => o.id === selectedObjectId) || null;

  // Debounced-by-nature: moveend only fires once movement has settled, so no
  // separate debounce timer is needed for this particular save.
  const saveViewport = useCallback((map: mapboxgl.Map) => {
    if (!id) return;
    const center = map.getCenter();
    updateSiteAssessment(id, {
      map_center_lat: center.lat,
      map_center_lng: center.lng,
      map_zoom: map.getZoom(),
      map_bearing: map.getBearing(),
      map_pitch: map.getPitch(),
    } as Partial<SiteAssessment>).catch(() => {});
  }, [id]);

  const resetToResort = useCallback(() => {
    mapRef.current?.flyTo({ center: resortCenterRef.current, zoom: 15, bearing: 0, pitch: 0 });
  }, []);

  // Resolve where to center the map: saved viewport > cached Mountain
  // coordinates > fresh Mapbox geocode > manual-locate fallback.
  useEffect(() => {
    if (!siteAssessment || !mapDivRef.current || mapRef.current) return;

    let cancelled = false;

    (async () => {
      let center: [number, number] | null = null;
      let zoom = 15;
      let bearing = 0;
      let pitch = 0;

      const hasSavedViewport = siteAssessment.map_center_lat != null && siteAssessment.map_center_lng != null;
      if (hasSavedViewport) {
        center = [siteAssessment.map_center_lng!, siteAssessment.map_center_lat!];
        zoom = siteAssessment.map_zoom ?? 15;
        bearing = siteAssessment.map_bearing ?? 0;
        pitch = siteAssessment.map_pitch ?? 0;
      }

      let resortCenter: [number, number] | null = null;
      if (mountain?.coordinates) {
        resortCenter = [mountain.coordinates.longitude, mountain.coordinates.latitude];
      } else if (mountain?.address) {
        setLocating(true);
        resortCenter = await geocodeWithMapbox(mountain.address);
        setLocating(false);
        if (resortCenter && mountain) {
          updateMountain(mountain.id, { coordinates: { latitude: resortCenter[1], longitude: resortCenter[0] } });
        }
      }

      if (cancelled) return;

      if (!resortCenter) {
        toast.error(mountain
          ? `Couldn't locate ${mountain.name} from its address — search or move the map manually, then use "Set as Resort Location".`
          : 'Mountain not found for this assessment.');
        setNeedsManualLocate(true);
      }
      resortCenterRef.current = resortCenter || DEFAULT_CENTER;
      if (!center) {
        center = resortCenter || DEFAULT_CENTER;
        if (!resortCenter) zoom = 4;
      }

      const map = new mapboxgl.Map({
        container: mapDivRef.current!,
        style: siteAssessment.map_style === 'streets' ? 'mapbox://styles/mapbox/streets-v12' : SATELLITE_STYLE,
        center: center!,
        zoom,
        bearing,
        pitch,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
      map.on('moveend', () => saveViewport(map));
      mapRef.current = map;
      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteAssessment, mountain?.id]);

  async function setCurrentViewAsResortLocation() {
    const map = mapRef.current;
    if (!map || !mountain) return;
    const center = map.getCenter();
    resortCenterRef.current = [center.lng, center.lat];
    await updateMountain(mountain.id, { coordinates: { latitude: center.lat, longitude: center.lng } });
    setNeedsManualLocate(false);
    toast.success(`Saved as ${mountain.name}'s resort location`);
  }

  async function handleUpdateObject(objectId: string, data: Partial<SiteAssessmentObject> & { latitude?: number; longitude?: number }) {
    if (!id) return;
    try {
      const updated = await updateObject(id, objectId, data);
      setObjects(prev => prev.map(o => o.id === objectId ? updated : o));
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  }

  async function handleDeleteObject(objectId: string) {
    if (!id) return;
    try {
      await deleteObject(id, objectId);
      setObjects(prev => prev.filter(o => o.id !== objectId));
      setSelectedObjectId(null);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  }

  async function placeObject(type: ObjectType, lat: number, lng: number) {
    if (!id) return;
    const countOfType = objects.filter(o => o.object_type === type).length;
    const name = `${OBJECT_TYPE_CONFIG[type].label} ${countOfType + 1}`;
    try {
      const created = await createObject(id, { object_type: type, name, latitude: lat, longitude: lng });
      setObjects(prev => [...prev, created]);
      setSelectedObjectId(created.id);
      if (!addAnother) setActiveTool('select');
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  }

  // Escape exits placement mode.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveTool('select'); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Click-to-place, only while a placement tool is active.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const handler = (e: mapboxgl.MapMouseEvent) => {
      if (activeTool === 'select') return;
      placeObject(activeTool, e.lngLat.lat, e.lngLat.lng);
    };
    map.on('click', handler);
    return () => { map.off('click', handler); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, activeTool, objects, addAnother]);

  // Marker sync — recreated whenever objects/selection/tool changes (fine at
  // the object counts this workspace deals with).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current.clear();

    objects.forEach(obj => {
      if (obj.is_hidden || obj.latitude == null || obj.longitude == null) return;
      const el = createMarkerElement(obj.object_type as ObjectType, obj.id === selectedObjectId);
      el.addEventListener('click', (e) => { e.stopPropagation(); setSelectedObjectId(obj.id); });
      const marker = new mapboxgl.Marker({ element: el, draggable: activeTool === 'select' && !obj.is_locked })
        .setLngLat([obj.longitude, obj.latitude])
        .addTo(map);
      marker.on('dragend', () => {
        const ll = marker.getLngLat();
        handleUpdateObject(obj.id, { latitude: ll.lat, longitude: ll.lng });
      });
      markersRef.current.set(obj.id, marker);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, selectedObjectId, activeTool, mapReady]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <Loader2 size={24} className="text-[#6a7282] animate-spin" />
      </div>
    );
  }

  if (loadError || !siteAssessment) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex flex-col items-center justify-center gap-3">
        <p className="text-[#ef4444] font-['Inter:Regular',sans-serif]">{loadError || 'Site Assessment not found'}</p>
        <button onClick={() => navigate('/site-assessments')} className="text-[#307fe2] font-['Inter:Medium',sans-serif] text-[14px]">
          Back to Site Assessments
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] flex flex-col">
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/site-assessments')} className="p-1 active:opacity-60">
          <ArrowLeft size={24} className="text-[#0a0a0a]" />
        </button>
        <div>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">{siteAssessment.name}</h1>
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
            {mountain?.name || 'Unknown mountain'}{project && ` · ${(project as any).name}`} · {siteAssessment.status}
          </p>
        </div>
      </div>

      <div className="flex-1 relative">
        <div ref={mapDivRef} className="absolute inset-0" />

        {/* Left toolbar */}
        <div className="absolute top-4 left-4 z-10 bg-white rounded-[12px] shadow-lg p-1.5 flex flex-col gap-1">
          <button
            onClick={() => setActiveTool('select')}
            title="Select"
            className={`w-11 h-11 rounded-[8px] flex items-center justify-center ${activeTool === 'select' ? 'bg-[#1D2930] text-white' : 'text-[#0a0a0a] hover:bg-[#f3f3f5]'}`}
          >
            <MousePointer2 size={18} />
          </button>
          {TOOLS.map(type => {
            const { Icon, label } = OBJECT_TYPE_CONFIG[type];
            return (
              <button
                key={type}
                onClick={() => setActiveTool(activeTool === type ? 'select' : type)}
                title={`Add ${label}`}
                className={`w-11 h-11 rounded-[8px] flex items-center justify-center ${activeTool === type ? 'bg-[#ff5c39] text-white' : 'text-[#0a0a0a] hover:bg-[#f3f3f5]'}`}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </div>

        {activeTool !== 'select' && (
          <div className="absolute top-4 left-20 z-10 bg-white rounded-full shadow-lg pl-3 pr-2 py-2 flex items-center gap-3">
            <span className="text-[12px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
              Click map to place {OBJECT_TYPE_CONFIG[activeTool].label}
            </span>
            <label className="flex items-center gap-1.5 text-[11px] text-[#6a7282] font-['Inter:Regular',sans-serif]">
              <input type="checkbox" checked={addAnother} onChange={e => setAddAnother(e.target.checked)} />
              Add another
            </label>
          </div>
        )}

        {locating && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 rounded-full px-4 py-2 flex items-center gap-2 shadow z-10">
            <Search size={14} className="text-[#6a7282] animate-pulse" />
            <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">Locating resort…</span>
          </div>
        )}

        {needsManualLocate && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white rounded-[10px] px-4 py-3 shadow-lg z-10 max-w-sm text-center">
            <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[13px] mb-2">
              Couldn't locate this resort automatically. Pan/zoom the map to the right spot, then confirm.
            </p>
            <button
              onClick={setCurrentViewAsResortLocation}
              className="bg-[#ff5c39] text-white px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif]"
            >
              Set as Resort Location
            </button>
          </div>
        )}

        <button
          onClick={resetToResort}
          className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-white px-3 py-2 rounded-full shadow-lg text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] active:opacity-70"
          style={{ marginRight: selectedObject ? 296 : 0 }}
        >
          <LocateFixed size={14} /> Reset to Resort
        </button>

        {selectedObject && (
          <ObjectPropertiesPanel
            object={selectedObject}
            trails={trails}
            onUpdate={(data) => handleUpdateObject(selectedObject.id, data)}
            onDelete={() => handleDeleteObject(selectedObject.id)}
            onClose={() => setSelectedObjectId(null)}
          />
        )}

        {/* Object list (bottom drawer) */}
        <div
          className={`absolute bottom-0 left-0 right-0 z-10 bg-white rounded-t-[16px] shadow-[0_-4px_24px_rgba(0,0,0,0.15)] transition-transform duration-200 ${
            listOpen ? 'translate-y-0' : 'translate-y-[calc(100%-44px)]'
          }`}
        >
          <button onClick={() => setListOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5">
            <span className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
              Objects ({objects.filter(o => !o.is_hidden).length})
            </span>
            {listOpen ? <ChevronDown size={16} className="text-[#6a7282]" /> : <ChevronUp size={16} className="text-[#6a7282]" />}
          </button>
          {listOpen && (
            <div className="max-h-52 overflow-y-auto px-2 pb-2">
              {objects.length === 0 ? (
                <p className="text-center py-4 text-[#8992a0] font-['Inter:Regular',sans-serif] text-[13px]">No objects placed yet.</p>
              ) : objects.map(o => {
                const config = OBJECT_TYPE_CONFIG[o.object_type as ObjectType] || OBJECT_TYPE_CONFIG.misc;
                return (
                  <button
                    key={o.id}
                    onClick={() => {
                      setSelectedObjectId(o.id);
                      if (o.longitude != null && o.latitude != null) {
                        mapRef.current?.flyTo({ center: [o.longitude, o.latitude] });
                      }
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-[8px] text-left ${selectedObjectId === o.id ? 'bg-[#fff5f3]' : 'hover:bg-[#f9fafb]'}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: config.color }} />
                    <span className="flex-1 text-[13px] text-[#0a0a0a] font-['Inter:Regular',sans-serif] truncate">{o.name}</span>
                    {o.is_hidden && <EyeOff size={12} className="text-[#8992a0]" />}
                    <span className="text-[11px] text-[#8992a0]">{o.status || '—'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
