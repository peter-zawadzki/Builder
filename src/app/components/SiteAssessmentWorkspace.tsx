import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import mapboxgl from 'mapbox-gl';
import {
  ArrowLeft, Loader2, LocateFixed, Search, MousePointer2,
  ChevronDown, ChevronUp, Trash2, X,
  Mountain, Ruler, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData, type Location } from '../context/DataContext';
import { getSiteAssessment, updateSiteAssessment, archiveSiteAssessment, type SiteAssessment } from '../utils/siteAssessmentsApi';
import { createMeasurement, deleteMeasurement, type SiteAssessmentMeasurement } from '../utils/siteAssessmentsApi';
import {
  type DeviceType, type CameraProperties, DEVICE_TYPE_CONFIG, DEVICE_TYPES, DEFAULT_CAMERA_PROPS, START_FINISH_COLORS,
  createDeviceMarkerElement, createCameraMarkerElement,
} from '../utils/deviceTypes';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { LocationPropertiesPanel } from './LocationPropertiesPanel';
import { LocationDetail } from './LocationDetail';
import { geocodeWithMapbox } from '../utils/mapboxGeocode';
import { bearingBetween, distanceBetween, destinationPoint, buildCoverageCone, compassLabel, METERS_PER_FOOT } from '../utils/geo';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string;

const DEFAULT_CENTER: [number, number] = [-98.35, 39.5]; // continental US, same fallback as Map View
const COVERAGE_SOURCE_ID = 'camera-coverage';
const MEASUREMENTS_SOURCE_ID = 'sa-measurements';
const MEASURE_DRAFT_SOURCE_ID = 'sa-measure-draft';
const DEM_SOURCE_ID = 'mapbox-dem';

// Base map styles — Satellite/Streets use Mapbox's v3 "Standard" style
// family (real-time lighting, atmosphere, shadowed 3D buildings/terrain)
// instead of the older "classic" styles, since that's what actually makes
// tilted/3D view look good; classic styles are just a flat image/vector
// drape with no lighting model. Outdoors has no Standard equivalent
// (topographic contour styles are classic-only), so it stays classic.
const STYLE_OPTIONS: Record<'satellite' | 'streets' | 'outdoors', { label: string; url: string; standard?: boolean }> = {
  satellite: { label: 'Satellite', url: 'mapbox://styles/mapbox/standard-satellite', standard: true },
  streets: { label: 'Streets', url: 'mapbox://styles/mapbox/standard', standard: true },
  outdoors: { label: 'Outdoors', url: 'mapbox://styles/mapbox/outdoors-v12' },
};
// Standard-only: real-time-of-day lighting/shadows, set via setConfigProperty.
const MEASUREMENT_LINE_COLOR = '#a855f7';

// Always feet — never auto-switches to miles, per explicit request (the
// measurement tool is used for on-the-ground distances like cable runs and
// camera coverage, where miles is never the useful unit).
function formatFeet(meters: number): string {
  return `${Math.round(meters / METERS_PER_FOOT).toLocaleString()} ft`;
}

// Classic Locations (no deviceType — added via the plain CreateLocation.tsx
// flow) render as squares with a letter so they stay visually distinct from
// device markers (circles/icons) on the same map.
const LOCATION_TYPE_CONFIG: Record<string, { color: string; letter: string }> = {
  'Install Site': { color: '#0d9488', letter: 'I' },
  'Power': { color: '#f59e0b', letter: 'P' },
  'Start': { color: '#22c55e', letter: 'S' },
  'Finish': { color: '#ef4444', letter: 'F' },
};

function createLocationMarkerElement(locationType: string | undefined) {
  const config = LOCATION_TYPE_CONFIG[locationType || ''] || { color: '#9ca3af', letter: 'L' };
  const el = document.createElement('div');
  el.style.cssText = `
    width: 24px; height: 24px; border-radius: 6px;
    background: ${config.color}; border: 2px solid white;
    display: flex; align-items: center; justify-content: center;
    color: white; font-family: sans-serif; font-size: 11px; font-weight: 700;
    box-shadow: 0 2px 6px rgba(0,0,0,0.35);
    cursor: pointer;
  `;
  el.textContent = config.letter;
  return el;
}


// Opened via the pencil next to the assessment name — the only way to rename,
// change project association, edit notes, or delete the assessment. The
// trash icon deliberately doesn't live on the main map page (too easy to hit
// by accident); it only appears once you've explicitly opened this modal.
function EditAssessmentModal({
  siteAssessment, mountainId, onClose, onSave, onRequestDelete,
}: {
  siteAssessment: SiteAssessment;
  mountainId: string;
  onClose: () => void;
  onSave: (data: { name: string; project_id?: string; description?: string }) => Promise<void>;
  onRequestDelete: () => void;
}) {
  const { projects } = useData() as any;
  const mountainProjects = ((projects as any[]) || []).filter(p => p.mountainId === mountainId);

  const [name, setName] = useState(siteAssessment.name);
  const [projectId, setProjectId] = useState(siteAssessment.project_id || '');
  const [description, setDescription] = useState(siteAssessment.description || '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), project_id: projectId || undefined, description: description || undefined });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-sm rounded-t-[20px] sm:rounded-[20px] p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Edit Site Assessment</h2>
          <button type="button" onClick={onClose} className="p-1 active:opacity-60"><X size={20} className="text-[#6a7282]" /></button>
        </div>

        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Name</label>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
          />
        </div>

        {mountainProjects.length > 0 && (
          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Project (optional)</label>
            <select
              value={projectId} onChange={e => setProjectId(e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
            >
              <option value="">No project association</option>
              {mountainProjects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Notes (optional)</label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none resize-none"
          />
        </div>

        <button
          type="submit" disabled={saving || !name.trim()}
          className="w-full flex items-center justify-center gap-2 bg-[#ff5c39] text-white rounded-[8px] py-3 text-[13px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80 disabled:opacity-60"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? 'Saving…' : 'Save'}
        </button>

        <button
          type="button" onClick={onRequestDelete}
          className="w-full flex items-center justify-center gap-1.5 text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#ef4444] bg-[#fef2f2] py-3 rounded-[8px] active:opacity-70"
        >
          <Trash2 size={14} /> Delete Site Assessment
        </button>
      </form>
    </div>
  );
}

export function SiteAssessmentWorkspace() {
  const { mountainId: mountainIdParam, id } = useParams<{ mountainId: string; id: string }>();
  const navigate = useNavigate();
  // Arriving here from a Trail's "Add Location" button — pre-fills the
  // trail on whatever gets placed next instead of leaving it unset.
  const [searchParams] = useSearchParams();
  const initialTrailId = searchParams.get('trailId') || undefined;
  const {
    getMountainById, getProjectById, updateMountain, getTrailsByMountainId,
    getLocationsByMountainId, addLocation, updateLocation, deleteLocation, locations,
  } = useData();

  const [siteAssessment, setSiteAssessment] = useState<SiteAssessment | null>(null);
  const [measurements, setMeasurements] = useState<SiteAssessmentMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [needsManualLocate, setNeedsManualLocate] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [styleReady, setStyleReady] = useState(false);

  const [activeTool, setActiveTool] = useState<'select' | 'measure' | DeviceType>('select');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  // Only true right after placing/aiming a device — opens its panel straight
  // into edit mode so you can configure it immediately. Re-selecting an
  // existing device later opens the read-only summary instead.
  const [openInEditMode, setOpenInEditMode] = useState(false);
  const [detailsLocationId, setDetailsLocationId] = useState<string | null>(null);
  const [cameraAimingId, setCameraAimingId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [terrainOn, setTerrainOn] = useState(false);
  const [pitchVal, setPitchVal] = useState(0);
  const [bearingVal, setBearingVal] = useState(0);
  const [mapStyle, setMapStyle] = useState<'satellite' | 'streets' | 'outdoors'>('satellite');

  const [measureDraft, setMeasureDraft] = useState<[number, number][]>([]);
  const [measureHover, setMeasureHover] = useState<[number, number] | null>(null);
  const [measureSummary, setMeasureSummary] = useState<{ flat: number; terrain: number } | null>(null);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [locationPendingDelete, setLocationPendingDelete] = useState<Location | null>(null);
  const [measurementPendingDelete, setMeasurementPendingDelete] = useState<SiteAssessmentMeasurement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [assessmentPendingDelete, setAssessmentPendingDelete] = useState(false);
  const [deletingAssessment, setDeletingAssessment] = useState(false);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const resortCenterRef = useRef<[number, number]>(DEFAULT_CENTER);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const handleMarkerRef = useRef<mapboxgl.Marker | null>(null);
  // Read inside the long-lived 'style.load' listener below, which is
  // registered once at map creation — closing over `mapStyle` directly would
  // go stale after the style switcher updates state later.
  const mapStyleRef = useRef(mapStyle);
  mapStyleRef.current = mapStyle;

  useEffect(() => {
    if (!id) return;
    getSiteAssessment(id)
      .then(res => {
        setSiteAssessment(res.siteAssessment);
        setMeasurements(res.measurements || []);
        if (res.siteAssessment?.map_style && res.siteAssessment.map_style in STYLE_OPTIONS) {
          setMapStyle(res.siteAssessment.map_style);
        }
      })
      .catch(err => setLoadError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  const mountain = siteAssessment ? getMountainById(siteAssessment.mountain_id) : undefined;
  const project = siteAssessment?.project_id ? getProjectById(siteAssessment.project_id) : undefined;
  const trails = mountain ? getTrailsByMountainId(mountain.id).map(t => ({ id: t.id, name: t.name })) : [];
  // Every item dropped on the map — from this workspace or Map View, or the
  // classic CreateLocation.tsx flow — is a real, mountain-wide Location.
  // `devices` are the ones tagged with deviceType (placed via a toolbar);
  // the rest are classic Locations, rendered differently but on the same map.
  const mountainId = mountain?.id;
  const mountainLocations = useMemo(
    () => (mountainId ? getLocationsByMountainId(mountainId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locations, mountainId]
  );
  const devices = useMemo(() => mountainLocations.filter(l => l.deviceType), [mountainLocations]);
  const selectedLocation = mountainLocations.find(l => l.id === selectedLocationId) || null;

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
        style: STYLE_OPTIONS[mapStyle].url,
        center: center!,
        zoom,
        bearing,
        pitch,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
      map.on('moveend', () => saveViewport(map));

      // Re-run on every style load — both the initial one and any later
      // map.setStyle() from the style switcher, which wipes all custom
      // sources/layers and re-fires this same event.
      const setupSources = () => {
        // Elevation source/terrain is always active (even at pitch 0, where
        // it's visually invisible looking straight down) so that
        // queryTerrainElevation works for terrain-aware measurements
        // regardless of whether the user has tilted the camera.
        if (!map.getSource(DEM_SOURCE_ID)) {
          map.addSource(DEM_SOURCE_ID, {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });
        }
        map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: 1 });

        if (!map.getSource(COVERAGE_SOURCE_ID)) {
          map.addSource(COVERAGE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          // Data-driven color (per-feature `color` property) — cameras can
          // overlap, so each one can be given a distinct color to tell cones apart.
          map.addLayer({
            id: 'camera-coverage-fill', type: 'fill', source: COVERAGE_SOURCE_ID,
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 },
          });
          map.addLayer({
            id: 'camera-coverage-outline', type: 'line', source: COVERAGE_SOURCE_ID,
            paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.6 },
          });
        }

        if (!map.getSource(MEASUREMENTS_SOURCE_ID)) {
          map.addSource(MEASUREMENTS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({
            id: 'sa-measurements-line', type: 'line', source: MEASUREMENTS_SOURCE_ID,
            paint: { 'line-color': MEASUREMENT_LINE_COLOR, 'line-width': 3 },
          });
          map.addLayer({
            id: 'sa-measurements-label', type: 'symbol', source: MEASUREMENTS_SOURCE_ID,
            layout: {
              'symbol-placement': 'line-center', 'text-field': ['get', 'label'],
              'text-size': 12, 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            },
            paint: { 'text-color': '#ffffff', 'text-halo-color': MEASUREMENT_LINE_COLOR, 'text-halo-width': 1.5 },
          });
        }

        if (!map.getSource(MEASURE_DRAFT_SOURCE_ID)) {
          map.addSource(MEASURE_DRAFT_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({
            id: 'sa-measure-draft-line', type: 'line', source: MEASURE_DRAFT_SOURCE_ID,
            paint: { 'line-color': MEASUREMENT_LINE_COLOR, 'line-width': 2, 'line-dasharray': [2, 1.5] },
          });
          map.addLayer({
            id: 'sa-measure-draft-points', type: 'circle', source: MEASURE_DRAFT_SOURCE_ID,
            filter: ['==', ['geometry-type'], 'Point'],
            paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': MEASUREMENT_LINE_COLOR, 'circle-stroke-width': 2 },
          });
        }

        map.setFog({});
        // Standard-only real-time lighting/shadow preset, always 'day' —
        // classic styles (Outdoors) have no 'basemap' config scope, so this
        // would throw for them.
        if (STYLE_OPTIONS[mapStyleRef.current].standard) {
          try { map.setConfigProperty('basemap', 'lightPreset', 'day'); } catch { /* not a Standard style */ }
        }
        setStyleReady(true);
      };

      map.on('load', setupSources);
      map.on('style.load', () => { if (map.isStyleLoaded()) setupSources(); else map.once('idle', setupSources); });
      if (pitch > 0) setTerrainOn(true);
      mapRef.current = map;
      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
      setStyleReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteAssessment, mountain?.id]);

  // Keep the tilt/heading readout in sync whether the camera moves via the
  // sliders, the built-in compass control, or a direct drag/gesture on the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const sync = () => { setPitchVal(map.getPitch()); setBearingVal(((map.getBearing() % 360) + 360) % 360); };
    sync();
    map.on('pitch', sync);
    map.on('rotate', sync);
    return () => { map.off('pitch', sync); map.off('rotate', sync); };
  }, [mapReady]);

  const toggleTerrain = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (terrainOn) {
      map.easeTo({ pitch: 0, duration: 500 });
      setTerrainOn(false);
    } else {
      map.easeTo({ pitch: 60, duration: 500 });
      setTerrainOn(true);
    }
  }, [terrainOn]);

  function changeMapStyle(key: 'satellite' | 'streets' | 'outdoors') {
    const map = mapRef.current;
    if (!map || key === mapStyle) return;
    setStyleReady(false);
    map.setStyle(STYLE_OPTIONS[key].url);
    setMapStyle(key);
    if (id) updateSiteAssessment(id, { map_style: key } as Partial<SiteAssessment>).catch(() => {});
  }


  async function setCurrentViewAsResortLocation() {
    const map = mapRef.current;
    if (!map || !mountain) return;
    const center = map.getCenter();
    resortCenterRef.current = [center.lng, center.lat];
    await updateMountain(mountain.id, { coordinates: { latitude: center.lat, longitude: center.lng } });
    setNeedsManualLocate(false);
    toast.success(`Saved as ${mountain.name}'s resort location`);
  }

  function placeDevice(type: DeviceType, lat: number, lng: number) {
    if (!mountain) return;
    const countOfType = devices.filter(l => l.deviceType === type).length;
    const name = `${DEVICE_TYPE_CONFIG[type].label} ${countOfType + 1}`;
    const initialTrail = initialTrailId ? trails.find(t => t.id === initialTrailId) : undefined;
    const newId = addLocation({
      mountainId: mountain.id,
      name,
      locationType: type === 'power' ? 'Power' : type === 'startfinish' ? 'Start' : 'Install Site',
      deviceType: type,
      coordinates: { latitude: lat, longitude: lng },
      ...(initialTrail ? { trailId: initialTrail.id, trailName: initialTrail.name } : {}),
      ...(type === 'camera' ? { deviceProperties: DEFAULT_CAMERA_PROPS as unknown as Record<string, unknown> } : {}),
    });
    setSelectedLocationId(newId);
    setOpenInEditMode(true);
    // Back to the pointer immediately after placing — leaving the tool
    // active made it too easy to drop several items in a row by accident
    // while just trying to select the one just placed.
    if (type === 'camera') setCameraAimingId(newId);
    else setActiveTool('select');
  }

  // Camera placement is two clicks: the first drops the camera (default
  // heading/FOV/range), the second aims it — heading is computed from the
  // camera to wherever that second click lands.
  function aimCamera(cameraId: string, lat: number, lng: number) {
    const cam = mountainLocations.find(l => l.id === cameraId);
    setCameraAimingId(null);
    setActiveTool('select');
    if (!cam || !cam.coordinates) return;
    const heading = bearingBetween(cam.coordinates.latitude, cam.coordinates.longitude, lat, lng);
    updateLocation(cameraId, { deviceProperties: { ...(cam.deviceProperties || {}), heading } });
  }

  async function handleDeleteLocation(locationId: string) {
    try {
      await deleteLocation(locationId);
      setSelectedLocationId(null);
      setLocationPendingDelete(null);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  }

  // Terrain-aware distance: samples elevation every ~1/8th of each segment
  // via Mapbox's queryTerrainElevation (terrain is always loaded, see
  // setupSources above) and sums 3D (slope) distance instead of flat
  // great-circle distance — the same approach Caltopo uses for "terrain
  // distance" vs. straight-line distance.
  function elevationAt(map: mapboxgl.Map, lng: number, lat: number): number {
    return map.queryTerrainElevation([lng, lat] as unknown as mapboxgl.LngLatLike) ?? 0;
  }

  function computeMeasurement(map: mapboxgl.Map, points: [number, number][]) {
    const SUB = 8;
    let flat = 0;
    let terrain = 0;
    let gain = 0;
    let loss = 0;
    let prevElev = elevationAt(map, points[0][0], points[0][1]);
    const startElevation = prevElev;
    for (let i = 0; i < points.length - 1; i++) {
      const [lng1, lat1] = points[i];
      const [lng2, lat2] = points[i + 1];
      flat += distanceBetween(lat1, lng1, lat2, lng2);
      let prevLng = lng1, prevLat = lat1;
      for (let s = 1; s <= SUB; s++) {
        const t = s / SUB;
        const lng = lng1 + (lng2 - lng1) * t;
        const lat = lat1 + (lat2 - lat1) * t;
        const elev = elevationAt(map, lng, lat);
        const horiz = distanceBetween(prevLat, prevLng, lat, lng);
        const dElev = elev - prevElev;
        terrain += Math.sqrt(horiz * horiz + dElev * dElev);
        if (dElev > 0) gain += dElev; else loss += -dElev;
        prevElev = elev;
        prevLng = lng; prevLat = lat;
      }
    }
    return { flat, terrain, gain, loss, startElevation, endElevation: prevElev };
  }

  async function finishMeasurement(points: [number, number][]) {
    if (!id || points.length < 2) { setMeasureDraft([]); setMeasureSummary(null); return; }
    const map = mapRef.current;
    const { flat, terrain, gain, loss, startElevation, endElevation } = map
      ? computeMeasurement(map, points)
      : { flat: 0, terrain: 0, gain: 0, loss: 0, startElevation: 0, endElevation: 0 };
    try {
      const created = await createMeasurement(id, {
        measurement_type: 'distance',
        geometry_json: { type: 'LineString', coordinates: points },
        horizontal_distance: flat,
        terrain_distance: terrain,
        elevation_gain: gain,
        elevation_loss: loss,
        start_elevation: startElevation,
        end_elevation: endElevation,
        units: 'feet',
      });
      setMeasurements(prev => [...prev, created]);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
    setMeasureDraft([]);
    setMeasureHover(null);
    setMeasureSummary(null);
  }

  async function handleDeleteMeasurement(measurementId: string) {
    if (!id) return;
    try {
      await deleteMeasurement(id, measurementId);
      setMeasurements(prev => prev.filter(m => m.id !== measurementId));
      setSelectedMeasurementId(null);
      setMeasurementPendingDelete(null);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  }

  // Escape exits placement/aiming/measuring mode.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setActiveTool('select'); setCameraAimingId(null); setMeasureDraft([]); setMeasureHover(null); setMeasureSummary(null); }
      if (e.key === 'Enter' && activeTool === 'measure' && measureDraft.length >= 2) finishMeasurement(measureDraft);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, measureDraft]);

  // Click-to-place, only while a placement tool is active. Measure mode
  // accumulates vertices instead of finishing on a single click.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const handler = (e: mapboxgl.MapMouseEvent) => {
      if (activeTool === 'select') return;
      if (activeTool === 'measure') {
        setMeasureDraft(prev => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }
      if (activeTool === 'camera') {
        if (cameraAimingId) aimCamera(cameraAimingId, e.lngLat.lat, e.lngLat.lng);
        else placeDevice('camera', e.lngLat.lat, e.lngLat.lng);
        return;
      }
      placeDevice(activeTool, e.lngLat.lat, e.lngLat.lng);
    };
    const dblHandler = (e: mapboxgl.MapMouseEvent) => {
      if (activeTool !== 'measure') return;
      e.preventDefault();
      setMeasureDraft(prev => {
        const points = [...prev, [e.lngLat.lng, e.lngLat.lat]] as [number, number][];
        finishMeasurement(points);
        return prev;
      });
    };
    map.doubleClickZoom[activeTool === 'measure' ? 'disable' : 'enable']();
    map.on('click', handler);
    map.on('dblclick', dblHandler);
    return () => { map.off('click', handler); map.off('dblclick', dblHandler); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, activeTool, cameraAimingId, mountainLocations, mountain?.id]);

  // Live draft line/points while measuring, plus a rubber-band segment to
  // the current cursor position for a Caltopo-style "measure as you go" feel.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const source = map.getSource(MEASURE_DRAFT_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    if (measureDraft.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const linePoints = measureHover ? [...measureDraft, measureHover] : measureDraft;
    const features = [
      { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: linePoints } },
      ...measureDraft.map(p => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: p } })),
    ];
    source.setData({ type: 'FeatureCollection', features });
    if (linePoints.length >= 2) {
      const { flat, terrain } = computeMeasurement(map, linePoints);
      setMeasureSummary({ flat, terrain });
    } else {
      setMeasureSummary(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureDraft, measureHover, styleReady]);

  // Track cursor position while measuring, for the rubber-band preview.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || activeTool !== 'measure' || measureDraft.length === 0) { setMeasureHover(null); return; }
    const handler = (e: mapboxgl.MapMouseEvent) => setMeasureHover([e.lngLat.lng, e.lngLat.lat]);
    map.on('mousemove', handler);
    return () => { map.off('mousemove', handler); };
  }, [mapReady, activeTool, measureDraft.length]);

  // Saved measurements — rendered as permanent lines with a distance label.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const source = map.getSource(MEASUREMENTS_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const features = measurements.map(m => ({
      type: 'Feature' as const,
      properties: { id: m.id, label: formatFeet(m.terrain_distance ?? m.horizontal_distance ?? 0) },
      geometry: m.geometry_json,
    }));
    source.setData({ type: 'FeatureCollection', features });
  }, [measurements, styleReady]);

  // Clicking a saved measurement's line selects it (for delete).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const handler = (e: mapboxgl.MapLayerMouseEvent) => {
      const mid = e.features?.[0]?.properties?.id;
      if (mid) setSelectedMeasurementId(mid);
    };
    map.on('click', 'sa-measurements-line', handler);
    return () => { map.off('click', 'sa-measurements-line', handler); };
  }, [mapReady]);

  // Marker sync — one marker per mountain Location (device or classic),
  // recreated whenever the location set/selection/tool changes. Devices open
  // the in-workspace properties panel; classic Locations navigate to their
  // real LocationDetail page, same as before.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !mountain) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current.clear();

    mountainLocations.forEach(loc => {
      if (!loc.coordinates) return;
      const isCamera = loc.deviceType === 'camera';
      const isDevice = !!loc.deviceType;
      const el = isCamera
        ? createCameraMarkerElement(loc.id === selectedLocationId, (loc.deviceProperties as any)?.color)
        : isDevice
        ? createDeviceMarkerElement(
            loc.deviceType as DeviceType, loc.id === selectedLocationId,
            loc.deviceType === 'startfinish' ? START_FINISH_COLORS[loc.locationType === 'Finish' ? 'Finish' : 'Start'] : undefined
          )
        : createLocationMarkerElement(loc.locationType);

      if (isDevice) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (loc.id !== selectedLocationId) setOpenInEditMode(false);
          setSelectedLocationId(loc.id);
        });
      } else {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          navigate(`/mountains/${mountain.id}/locations/${loc.id}`);
        });
      }

      const marker = new mapboxgl.Marker({
        element: el,
        draggable: activeTool === 'select' && !loc.isLocked,
        rotationAlignment: isCamera ? 'map' : 'auto',
        pitchAlignment: isCamera ? 'map' : 'auto',
      })
        .setLngLat([loc.coordinates.longitude, loc.coordinates.latitude])
        .addTo(map);

      if (isCamera) {
        const heading = ((loc.deviceProperties as any)?.heading as number) ?? 0;
        marker.setRotation(heading);
      }

      marker.on('dragend', () => {
        const ll = marker.getLngLat();
        const updates: Partial<Location> = { coordinates: { latitude: ll.lat, longitude: ll.lng } };
        if (!loc.originalCoordinates && loc.coordinates) {
          updates.originalCoordinates = {
            latitude: loc.coordinates.latitude, longitude: loc.coordinates.longitude,
            recordedAt: new Date().toISOString(),
          };
        }
        updateLocation(loc.id, updates);
      });

      markersRef.current.set(loc.id, marker);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountainLocations, selectedLocationId, activeTool, mapReady, mountain?.id]);

  // Coverage-cone polygons — one per camera, rebuilt from heading/FOV/range
  // whenever any camera's deviceProperties or position change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const source = map.getSource(COVERAGE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const cameras = mountainLocations.filter(l => l.deviceType === 'camera' && l.coordinates);
    const features = cameras.map(cam => {
      const props = (cam.deviceProperties || {}) as Partial<CameraProperties>;
      const coords = buildCoverageCone(
        cam.coordinates!.latitude, cam.coordinates!.longitude,
        props.heading ?? 0, props.horizontalFov ?? DEFAULT_CAMERA_PROPS.horizontalFov, props.rangeMeters ?? DEFAULT_CAMERA_PROPS.rangeMeters
      );
      return {
        type: 'Feature' as const,
        properties: { id: cam.id, color: props.color ?? DEFAULT_CAMERA_PROPS.color },
        geometry: { type: 'Polygon' as const, coordinates: [coords] },
      };
    });
    source.setData({ type: 'FeatureCollection', features });
  }, [mountainLocations, styleReady]);

  // Draggable heading/range handle for the selected camera — sets both at
  // once (angle from camera = heading, distance from camera = range).
  useEffect(() => {
    const map = mapRef.current;
    handleMarkerRef.current?.remove();
    handleMarkerRef.current = null;
    if (!map || !mapReady) return;
    if (!selectedLocation || selectedLocation.deviceType !== 'camera' || !selectedLocation.coordinates) return;

    const camLat = selectedLocation.coordinates.latitude;
    const camLng = selectedLocation.coordinates.longitude;
    const props = (selectedLocation.deviceProperties || {}) as Partial<CameraProperties>;
    const heading = props.heading ?? 0;
    const hFov = props.horizontalFov ?? DEFAULT_CAMERA_PROPS.horizontalFov;
    const range = props.rangeMeters ?? DEFAULT_CAMERA_PROPS.rangeMeters;
    const [hLng, hLat] = destinationPoint(camLat, camLng, heading, range);

    const camColor = props.color ?? DEFAULT_CAMERA_PROPS.color;
    const el = document.createElement('div');
    el.style.cssText = `width:14px;height:14px;border-radius:50%;background:white;border:3px solid ${camColor};cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,0.4);`;
    const marker = new mapboxgl.Marker({ element: el, draggable: true }).setLngLat([hLng, hLat]).addTo(map);

    marker.on('drag', () => {
      const ll = marker.getLngLat();
      const liveHeading = bearingBetween(camLat, camLng, ll.lat, ll.lng);
      const liveRange = distanceBetween(camLat, camLng, ll.lat, ll.lng);
      markersRef.current.get(selectedLocation.id)?.setRotation(liveHeading);
      const source = map.getSource(COVERAGE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        const others = mountainLocations.filter(l => l.deviceType === 'camera' && l.id !== selectedLocation.id && l.coordinates);
        const otherFeatures = others.map(cam => {
          const p = (cam.deviceProperties || {}) as Partial<CameraProperties>;
          const coords = buildCoverageCone(cam.coordinates!.latitude, cam.coordinates!.longitude, p.heading ?? 0, p.horizontalFov ?? DEFAULT_CAMERA_PROPS.horizontalFov, p.rangeMeters ?? DEFAULT_CAMERA_PROPS.rangeMeters);
          return { type: 'Feature' as const, properties: { id: cam.id, color: p.color ?? DEFAULT_CAMERA_PROPS.color }, geometry: { type: 'Polygon' as const, coordinates: [coords] } };
        });
        const liveCoords = buildCoverageCone(camLat, camLng, liveHeading, hFov, liveRange);
        source.setData({
          type: 'FeatureCollection',
          features: [...otherFeatures, { type: 'Feature', properties: { id: selectedLocation.id, color: camColor }, geometry: { type: 'Polygon', coordinates: [liveCoords] } }],
        });
      }
    });

    marker.on('dragend', () => {
      const ll = marker.getLngLat();
      const newHeading = bearingBetween(camLat, camLng, ll.lat, ll.lng);
      const newRange = distanceBetween(camLat, camLng, ll.lat, ll.lng);
      updateLocation(selectedLocation.id, { deviceProperties: { ...props, heading: newHeading, rangeMeters: newRange } });
    });

    handleMarkerRef.current = marker;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation?.id, selectedLocation?.deviceProperties, mapReady]);

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
        <button onClick={() => navigate(mountainIdParam ? `/mountains/${mountainIdParam}` : '/mountains')} className="text-[#307fe2] font-['Inter:Medium',sans-serif] text-[14px]">
          Back to Mountain
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] flex flex-col">
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate(`/mountains/${siteAssessment.mountain_id}`)} className="p-1 active:opacity-60">
          <ArrowLeft size={24} className="text-[#0a0a0a]" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px] truncate">{siteAssessment.name}</h1>
            <button onClick={() => setRenaming(true)} className="p-1 active:opacity-60 shrink-0" title="Edit Site Assessment">
              <Pencil size={14} className="text-[#6a7282]" />
            </button>
          </div>
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
            {mountain?.name || 'Unknown mountain'}{project && ` · ${(project as any).name}`}
          </p>
        </div>
      </div>

      {renaming && (
        <EditAssessmentModal
          siteAssessment={siteAssessment}
          mountainId={siteAssessment.mountain_id}
          onClose={() => setRenaming(false)}
          onSave={async (data) => {
            const updated = await updateSiteAssessment(id!, data as Partial<SiteAssessment>);
            setSiteAssessment(updated);
            setRenaming(false);
          }}
          onRequestDelete={() => { setRenaming(false); setAssessmentPendingDelete(true); }}
        />
      )}

      {assessmentPendingDelete && (
        <DeleteConfirmModal
          title="Delete this Site Assessment?"
          description="This removes the assessment and its measurements. Devices and locations placed on the map stay on the mountain. This can't be undone."
          isDeleting={deletingAssessment}
          onCancel={() => setAssessmentPendingDelete(false)}
          onConfirm={async () => {
            setDeletingAssessment(true);
            try {
              await archiveSiteAssessment(id!);
              navigate(`/mountains/${siteAssessment.mountain_id}`);
            } catch (err: any) {
              toast.error(`Error: ${err.message}`);
              setDeletingAssessment(false);
            }
          }}
        />
      )}

      <div className="flex-1 relative">
        {/* Inline position/inset: mapbox-gl's own stylesheet ships a
            `.mapboxgl-map { position: relative }` rule at equal specificity
            to Tailwind's `absolute` class, and wins the cascade tie since it
            loads later — collapsing this container to 0 height. Inline
            styles always win regardless of stylesheet order. */}
        <div
          ref={mapDivRef}
          className="mapboxgl-map-container"
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />

        {/* Left toolbar */}
        <div className="absolute top-4 left-4 z-10 bg-white rounded-[12px] shadow-lg p-1.5 flex flex-col gap-1">
          <button
            onClick={() => setActiveTool('select')}
            title="Select"
            className={`w-11 h-11 rounded-[8px] flex items-center justify-center ${activeTool === 'select' ? 'bg-[#1D2930] text-white' : 'text-[#0a0a0a] hover:bg-[#f3f3f5]'}`}
          >
            <MousePointer2 size={18} />
          </button>
          {DEVICE_TYPES.map(type => {
            const { Icon, label } = DEVICE_TYPE_CONFIG[type];
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
          <div className="h-px bg-[rgba(0,0,0,0.08)] mx-1 my-0.5" />
          <button
            onClick={() => { setActiveTool(activeTool === 'measure' ? 'select' : 'measure'); setMeasureDraft([]); }}
            title="Measure distance (terrain-aware)"
            className={`w-11 h-11 rounded-[8px] flex items-center justify-center ${activeTool === 'measure' ? 'bg-[#a855f7] text-white' : 'text-[#0a0a0a] hover:bg-[#f3f3f5]'}`}
          >
            <Ruler size={18} />
          </button>
        </div>

        {activeTool !== 'select' && (
          <div className="absolute top-4 left-20 z-10 bg-white rounded-full shadow-lg pl-3 pr-2 py-2 flex items-center gap-3">
            <span className="text-[12px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
              {activeTool === 'camera' && cameraAimingId
                ? 'Click to aim the camera'
                : activeTool === 'measure'
                ? measureDraft.length === 0
                  ? 'Click to start measuring'
                  : 'Click to add points · double-click or Enter to finish'
                : `Click map to place ${DEVICE_TYPE_CONFIG[activeTool as DeviceType].label}`}
            </span>
            {activeTool === 'measure' && measureSummary && (
              <span className="text-[12px] font-['Inter:Medium',sans-serif] text-[#a855f7]">
                {formatFeet(measureSummary.terrain || measureSummary.flat)}
              </span>
            )}
          </div>
        )}

        {locating && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 rounded-full px-4 py-2 flex items-center gap-2 shadow z-10">
            <Search size={14} className="text-[#6a7282] animate-pulse" />
            <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">Locating resort…</span>
          </div>
        )}

        {initialTrailId && (() => {
          const t = trails.find(tr => tr.id === initialTrailId);
          return t ? (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1D2930] text-white rounded-full px-4 py-2 shadow z-10">
              <span className="font-['Inter:Medium',sans-serif] text-[13px]">Adding to trail: {t.name}</span>
            </div>
          ) : null;
        })()}

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

        <div
          className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2"
          style={{ marginRight: selectedLocation ? 296 : 0 }}
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white rounded-full shadow-lg p-1 gap-0.5">
              {(Object.keys(STYLE_OPTIONS) as Array<keyof typeof STYLE_OPTIONS>).map(key => (
                <button
                  key={key}
                  onClick={() => changeMapStyle(key)}
                  className={`px-2.5 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${
                    mapStyle === key ? 'bg-[#1D2930] text-white' : 'text-[#0a0a0a] hover:bg-[#f3f3f5]'
                  }`}
                >
                  {STYLE_OPTIONS[key].label}
                </button>
              ))}
            </div>
            <button
              onClick={toggleTerrain}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg text-[13px] font-['Inter:Medium',sans-serif] active:opacity-70 ${
                terrainOn ? 'bg-[#0a0a0a] text-white' : 'bg-white text-[#0a0a0a]'
              }`}
            >
              <Mountain size={14} /> 3D Terrain
            </button>
            <button
              onClick={resetToResort}
              className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-full shadow-lg text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] active:opacity-70"
            >
              <LocateFixed size={14} /> Reset to Resort
            </button>
          </div>

          {/* Tilt/heading — like Google Earth's camera controls. Only shown
              once you're actually in 3D (tilted); at pitch 0 there's nothing
              to tilt/rotate that isn't already covered by the compass
              control, so it'd just be visual noise. Dragging the built-in
              NavigationControl compass (bottom-right) or right-click
              dragging the map also work as alternatives. */}
          {terrainOn && (
            <div className="bg-white rounded-[12px] shadow-lg p-3 w-44 space-y-2">
              <div>
                <div className="flex justify-between text-[11px] text-[#6a7282] font-['Inter:Regular',sans-serif] mb-0.5">
                  <span>Tilt</span><span>{Math.round(pitchVal)}°</span>
                </div>
                <input
                  type="range" min={0} max={85} value={Math.round(pitchVal)}
                  onChange={e => { const v = Number(e.target.value); mapRef.current?.setPitch(v); setPitchVal(v); setTerrainOn(v > 0); }}
                  className="w-full"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-[#6a7282] font-['Inter:Regular',sans-serif] mb-0.5">
                  <span>Heading</span><span>{Math.round(bearingVal)}° {compassLabel(bearingVal)}</span>
                </div>
                <input
                  type="range" min={0} max={359} value={Math.round(bearingVal)}
                  onChange={e => { const v = Number(e.target.value); mapRef.current?.setBearing(v); setBearingVal(v); }}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>

        {selectedLocation && (
          <LocationPropertiesPanel
            key={selectedLocation.id}
            location={selectedLocation}
            trails={trails}
            defaultEditing={openInEditMode}
            onUpdate={(data) => updateLocation(selectedLocation.id, data)}
            onDelete={() => setLocationPendingDelete(selectedLocation)}
            onClose={() => setSelectedLocationId(null)}
            onViewFullDetails={() => setDetailsLocationId(selectedLocation.id)}
          />
        )}

        {/* Full LocationDetail (photos/videos/annotations) in a modal — this
            workspace's own panel only shows a quick technical summary. */}
        {detailsLocationId && (
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setDetailsLocationId(null); }}
          >
            <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-2xl h-[90vh] sm:h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="overflow-y-auto flex-1">
                <LocationDetail
                  mountainIdProp={siteAssessment.mountain_id}
                  locationIdProp={detailsLocationId}
                  onBack={() => setDetailsLocationId(null)}
                  embedded
                />
              </div>
            </div>
          </div>
        )}

        {locationPendingDelete && (
          <DeleteConfirmModal
            title={`Delete "${locationPendingDelete.name}"?`}
            description="This removes it from the map and from the mountain's Locations. This can't be undone."
            onCancel={() => setLocationPendingDelete(null)}
            onConfirm={() => handleDeleteLocation(locationPendingDelete.id)}
          />
        )}

        {selectedMeasurementId && (() => {
          const m = measurements.find(x => x.id === selectedMeasurementId);
          if (!m) return null;
          return (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 bg-white rounded-[12px] shadow-lg p-3 flex items-center gap-3">
              <div>
                <p className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                  {formatFeet(m.terrain_distance ?? m.horizontal_distance ?? 0)} (terrain)
                </p>
                <p className="text-[11px] text-[#8992a0] font-['Inter:Regular',sans-serif]">
                  {formatFeet(m.horizontal_distance ?? 0)} flat · +{Math.round((m.elevation_gain ?? 0) / METERS_PER_FOOT)}ft / -{Math.round((m.elevation_loss ?? 0) / METERS_PER_FOOT)}ft
                </p>
              </div>
              <button onClick={() => setMeasurementPendingDelete(m)} className="p-1.5 rounded-[8px] bg-[#fef2f2] active:opacity-70">
                <Trash2 size={14} className="text-[#ef4444]" />
              </button>
              <button onClick={() => setSelectedMeasurementId(null)} className="p-1.5 active:opacity-70">
                <X size={14} className="text-[#6a7282]" />
              </button>
            </div>
          );
        })()}

        {measurementPendingDelete && (
          <DeleteConfirmModal
            title="Delete this measurement?"
            description="This can't be undone."
            onCancel={() => setMeasurementPendingDelete(null)}
            onConfirm={() => handleDeleteMeasurement(measurementPendingDelete.id)}
          />
        )}

        {/* Device list (bottom drawer) */}
        <div
          className={`absolute bottom-0 left-0 right-0 z-10 bg-white rounded-t-[16px] shadow-[0_-4px_24px_rgba(0,0,0,0.15)] transition-transform duration-200 ${
            listOpen ? 'translate-y-0' : 'translate-y-[calc(100%-44px)]'
          }`}
        >
          <button onClick={() => setListOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5">
            <span className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
              Devices ({devices.length})
            </span>
            {listOpen ? <ChevronDown size={16} className="text-[#6a7282]" /> : <ChevronUp size={16} className="text-[#6a7282]" />}
          </button>
          {listOpen && (
            <div className="max-h-52 overflow-y-auto px-2 pb-2">
              {devices.length === 0 ? (
                <p className="text-center py-4 text-[#8992a0] font-['Inter:Regular',sans-serif] text-[13px]">No devices placed yet.</p>
              ) : devices.map(loc => {
                const config = DEVICE_TYPE_CONFIG[loc.deviceType as DeviceType] || DEVICE_TYPE_CONFIG.misc;
                return (
                  <button
                    key={loc.id}
                    onClick={() => {
                      setOpenInEditMode(false);
                      setSelectedLocationId(loc.id);
                      if (loc.coordinates) {
                        mapRef.current?.flyTo({ center: [loc.coordinates.longitude, loc.coordinates.latitude] });
                      }
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-[8px] text-left ${selectedLocationId === loc.id ? 'bg-[#fff5f3]' : 'hover:bg-[#f9fafb]'}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: config.color }} />
                    <span className="flex-1 text-[13px] text-[#0a0a0a] font-['Inter:Regular',sans-serif] truncate">{loc.name}</span>
                    <span className="text-[11px] text-[#8992a0]">{config.label}</span>
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
