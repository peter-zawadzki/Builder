import * as locMediaDB from '../utils/locationMediaDB';
import * as cloudLocSync from '../utils/cloudLocationSync';
import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import {
  X, MapPin, ChevronUp, ChevronDown, ClipboardList, Mountain,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import type { Location } from '../context/DataContext';
import { toast } from 'sonner';
import { geocodeWithMapbox } from '../utils/mapboxGeocode';
import { buildCoverageCone } from '../utils/geo';
import {
  type DeviceType, type CameraProperties, DEVICE_TYPE_CONFIG, DEFAULT_CAMERA_PROPS, START_FINISH_COLORS,
  createDeviceMarkerElement, createCameraMarkerElement,
} from '../utils/deviceTypes';
import { LocationDetail } from './LocationDetail';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string;

const DEFAULT_CENTER: [number, number] = [-98.35, 39.5];
const COVERAGE_SOURCE_ID = 'mapview-camera-coverage';
const DEM_SOURCE_ID = 'mapbox-dem';
// Standard style family (v3) for Satellite/Streets — real-time lighting,
// atmosphere, shadowed 3D buildings/terrain, same as SiteAssessmentWorkspace.
// Outdoors has no Standard equivalent, stays classic.
const STYLE_OPTIONS: Record<'satellite' | 'streets' | 'outdoors', { label: string; url: string; standard?: boolean }> = {
  satellite: { label: 'Satellite', url: 'mapbox://styles/mapbox/standard-satellite', standard: true },
  streets: { label: 'Streets', url: 'mapbox://styles/mapbox/standard', standard: true },
  outdoors: { label: 'Outdoors', url: 'mapbox://styles/mapbox/outdoors-v12' },
};

// Classic (non-device) Locations render as numbered teardrop pins, same look
// as before the Mapbox migration.
function createPinElement(label: number, isActive: boolean) {
  const bg = isActive ? '#ff5c39' : '#0a0a0a';
  const el = document.createElement('div');
  el.style.cssText = `
    width: 32px; height: 32px; border-radius: 50% 50% 50% 0;
    background: ${bg}; border: 2px solid white; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transform: rotate(-45deg); box-shadow: 0 2px 6px rgba(0,0,0,0.35);
  `;
  const span = document.createElement('span');
  span.style.cssText = `transform: rotate(45deg); color: white; font-size: 11px; font-weight: 700; font-family: sans-serif; line-height: 1;`;
  span.textContent = String(label);
  el.appendChild(span);
  return el;
}

// ─── Location thumbnail card ──────────────────────────────────────────────────

function LocationCard({
  location,
  assetCount,
  inspCount,
  isActive,
  onSelect,
  hasGps,
  number,
  onViewDetails,
}: {
  location: Location;
  assetCount: number;
  inspCount: number;
  isActive: boolean;
  onSelect: () => void;
  hasGps: boolean;
  number: number;
  onViewDetails: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const deviceType = location.deviceType as DeviceType | undefined;
  const typeConfig = deviceType ? DEVICE_TYPE_CONFIG[deviceType] : null;

  useEffect(() => {
    locMediaDB.getLocationMedia(location.id).then(async m => {
      if (m.photos.length > 0) {
        setThumb(m.photos[0]);
      } else {
        try {
          const urlMap = await cloudLocSync.fetchLocationMediaUrls([location.id]);
          const photos = urlMap[location.id]?.loc?.photos;
          if (photos?.[0]) setThumb(photos[0]);
        } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, [location.id]);

  return (
    <div
      className={`flex-shrink-0 w-36 rounded-[10px] border-2 overflow-hidden transition-all cursor-pointer ${
        isActive ? 'border-[#ff5c39] shadow-lg' : 'border-[rgba(0,0,0,0.1)] bg-white'
      }`}
      onClick={onSelect}
    >
      <div className="relative h-14 bg-[#f3f3f5] overflow-hidden">
        {thumb ? (
          <img src={thumb} alt={location.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {typeConfig ? <typeConfig.Icon size={18} className={isActive ? 'text-[#ff5c39]' : 'text-[#9ca3af]'} /> : <MapPin size={18} className={isActive ? 'text-[#ff5c39]' : 'text-[#d1d5db]'} />}
          </div>
        )}
        <div className={`absolute top-1 left-1 w-5 h-5 rounded-full border border-white shadow-md flex items-center justify-center ${
          isActive ? 'bg-[#ff5c39]' : 'bg-[#0a0a0a]'
        }`}>
          <span className="text-white text-[10px] font-['Inter:Bold',sans-serif] font-bold">{number}</span>
        </div>
        {!hasGps && (
          <div className="absolute top-1 right-1 bg-black/60 rounded-full px-1.5 py-0.5">
            <span className="text-white text-[9px] font-['Inter:Medium',sans-serif]">No GPS</span>
          </div>
        )}
      </div>

      <div className={`p-2 ${isActive ? 'bg-[#fff5f3]' : 'bg-white'}`}>
        {/* What the item is — device type label, or the classic Location type. */}
        <p className="text-[#8992a0] font-['Inter:Medium',sans-serif] text-[10px] uppercase tracking-wide truncate">
          {typeConfig?.label || location.locationType || 'Location'}
        </p>
        <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[12px] truncate">
          {location.name}
        </p>

        {(assetCount > 0 || inspCount > 0) && (
          <div className="flex flex-wrap gap-1 mt-1">
            {assetCount > 0 && (
              <span className="bg-[#FFe0D9] text-[#ff5c39] text-[9px] font-['Inter:Medium',sans-serif] px-1.5 py-0.5 rounded-full">
                {assetCount} asset{assetCount !== 1 ? 's' : ''}
              </span>
            )}
            {inspCount > 0 && (
              <span className="bg-[#f3f3f5] text-[#0a0a0a] text-[9px] font-['Inter:Medium',sans-serif] px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <ClipboardList size={8} />
                {inspCount}
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onViewDetails(); }}
          className="mt-1.5 w-full text-center text-[#307fe2] font-['Inter:Medium',sans-serif] text-[11px] py-1 rounded-[6px] bg-[#eff6ff] active:bg-[#dbeafe]"
        >
          View Details
        </button>
      </div>
    </div>
  );
}

// ─── Main MapView component ───────────────────────────────────────────────────
// Read-only browsing/overview — pan, zoom, select, view details (photos,
// videos, notes, annotations — everything). Adding devices, editing fields,
// and dragging pins all happen in a Site Assessment instead, not here.

interface Props {
  mountainId: string;
  onClose: () => void;
  initialFocusLocationId?: string;
}

export function MountainMapView({ mountainId, onClose, initialFocusLocationId }: Props) {
  const { getMountainById, getLocationsByMountainId, getAssetsByLocationId, getInspectionsByLocationId, updateMountain, locations: allLocations } = useData();
  const mountain = getMountainById(mountainId);
  const locations = useMemo(
    () => getLocationsByMountainId(mountainId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allLocations, mountainId]
  );

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const cardScrollRef = useRef<HTMLDivElement>(null);

  const [activeLocationId, setActiveLocationId] = useState<string | null>(initialFocusLocationId || null);
  const [detailsLocationId, setDetailsLocationId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [mapStyle, setMapStyle] = useState<'satellite' | 'streets' | 'outdoors'>('satellite');
  const [mapReady, setMapReady] = useState(false);
  const [styleReady, setStyleReady] = useState(false);

  const isValidCoordinate = (lat: number, lng: number) =>
    typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng) &&
    isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

  const gpsLocations = useMemo(
    () => locations.filter(l => l.coordinates && isValidCoordinate(l.coordinates.latitude, l.coordinates.longitude)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locations]
  );

  useEffect(() => {
    if (locations.length > 0 && gpsLocations.length === 0) {
      toast.error('No locations have GPS coordinates. Add coordinates in Location Details to see pins on the map.');
    }
  }, [locations.length, gpsLocations.length]);

  // Init map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapDivRef.current,
      style: STYLE_OPTIONS.satellite.url,
      center: DEFAULT_CENTER,
      zoom: 10,
    });
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    const setupSources = () => {
      if (!map.getSource(DEM_SOURCE_ID)) {
        map.addSource(DEM_SOURCE_ID, { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
      }
      map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: 1 });
      if (!map.getSource(COVERAGE_SOURCE_ID)) {
        map.addSource(COVERAGE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'mapview-coverage-fill', type: 'fill', source: COVERAGE_SOURCE_ID, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 } });
        map.addLayer({ id: 'mapview-coverage-outline', type: 'line', source: COVERAGE_SOURCE_ID, paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.6 } });
      }
      setStyleReady(true);
    };
    map.on('load', setupSources);
    map.on('style.load', () => { if (map.isStyleLoaded()) setupSources(); else map.once('idle', setupSources); });

    mapRef.current = map;
    setMapReady(true);

    (async () => {
      let center: [number, number] | null = null;
      if (mountain?.coordinates) {
        center = [mountain.coordinates.longitude, mountain.coordinates.latitude];
      } else if (mountain?.address) {
        setGeocoding(true);
        center = await geocodeWithMapbox(mountain.address);
        setGeocoding(false);
        if (center) updateMountain(mountainId, { coordinates: { latitude: center[1], longitude: center[0] } });
      }
      map.setCenter(center || DEFAULT_CENTER);
      map.setZoom(center ? 14 : 10);

      if (gpsLocations.length > 0) {
        try {
          const bounds = new mapboxgl.LngLatBounds();
          gpsLocations.forEach(l => bounds.extend([l.coordinates!.longitude, l.coordinates!.latitude]));
          map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
        } catch { /* ignore */ }
      }
    })();

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
      setStyleReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Style switch
  function changeMapStyle(key: 'satellite' | 'streets' | 'outdoors') {
    const map = mapRef.current;
    if (!map || key === mapStyle) return;
    setStyleReady(false);
    map.setStyle(STYLE_OPTIONS[key].url);
    setMapStyle(key);
  }

  // Marker sync — view-only, never draggable.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current.clear();

    gpsLocations.forEach((loc) => {
      const isActive = loc.id === activeLocationId;
      const isCamera = loc.deviceType === 'camera';
      const isDevice = !!loc.deviceType;
      const locationIndex = locations.findIndex(l => l.id === loc.id);
      const el = isCamera
        ? createCameraMarkerElement(isActive, (loc.deviceProperties as any)?.color)
        : isDevice
        ? createDeviceMarkerElement(
            loc.deviceType as DeviceType, isActive,
            loc.deviceType === 'startfinish' ? START_FINISH_COLORS[loc.locationType === 'Finish' ? 'Finish' : 'Start'] : undefined
          )
        : createPinElement(locationIndex + 1, isActive);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setActiveLocationId(loc.id);
        setDrawerOpen(true);
      });

      const marker = new mapboxgl.Marker({
        element: el,
        rotationAlignment: isCamera ? 'map' : 'auto',
        pitchAlignment: isCamera ? 'map' : 'auto',
      })
        .setLngLat([loc.coordinates!.longitude, loc.coordinates!.latitude])
        .addTo(map);

      if (isCamera) {
        const heading = ((loc.deviceProperties as any)?.heading as number) ?? 0;
        marker.setRotation(heading);
      }

      markersRef.current.set(loc.id, marker);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsLocations, activeLocationId, mapReady]);

  // Camera coverage cones
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const source = map.getSource(COVERAGE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const cameras = locations.filter(l => l.deviceType === 'camera' && l.coordinates);
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
  }, [locations, styleReady]);

  // Pan map + scroll card into view when active location changes
  useEffect(() => {
    if (!activeLocationId || !mapRef.current) return;
    const loc = locations.find(l => l.id === activeLocationId);
    if (loc?.coordinates && isValidCoordinate(loc.coordinates.latitude, loc.coordinates.longitude)) {
      mapRef.current.panTo([loc.coordinates.longitude, loc.coordinates.latitude]);
    }
    document.getElementById(`map-card-${activeLocationId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeLocationId, locations]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div ref={mapDivRef} className="flex-1 relative" />

      {geocoding && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white/90 rounded-full px-4 py-2 flex items-center gap-2 shadow z-[1001]">
          <MapPin size={14} className="text-[#6a7282] animate-pulse" />
          <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">Finding resort…</span>
        </div>
      )}

      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-[1001] w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center active:opacity-80"
      >
        <X size={20} className="text-[#0a0a0a]" />
      </button>

      {/* Top right controls */}
      <div className="absolute top-4 right-4 z-[1001] flex items-center gap-2">
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
      </div>

      {/* View Details — centered modal reusing the real LocationDetail page
          (photos, videos, annotations, notes — everything), same embedded
          pattern TrailDetailModal already uses. */}
      {detailsLocationId && (
        <div
          className="fixed inset-0 bg-black/40 z-[1002] flex items-end sm:items-center justify-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDetailsLocationId(null); }}
        >
          <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-2xl h-[90vh] sm:h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="overflow-y-auto flex-1">
              <LocationDetail
                mountainIdProp={mountainId}
                locationIdProp={detailsLocationId}
                onBack={() => setDetailsLocationId(null)}
                embedded
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom drawer */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-[1000] bg-white rounded-t-[20px] shadow-[0_-4px_24px_rgba(0,0,0,0.18)] transition-transform duration-300 ${
          drawerOpen ? 'translate-y-0' : 'translate-y-[calc(100%-56px)]'
        }`}
      >
        <button
          className="relative w-full flex items-center justify-between px-5 py-4 active:bg-[#f9fafb]"
          onClick={() => setDrawerOpen(v => !v)}
        >
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-[rgba(0,0,0,0.15)] rounded-full" />
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">
              Locations
            </span>
            <span className="bg-[#f3f3f5] text-[#6a7282] font-['Inter:Medium',sans-serif] text-[12px] px-2 py-0.5 rounded-full">
              {locations.length}
            </span>
          </div>
          {drawerOpen ? <ChevronDown size={20} className="text-[#6a7282]" /> : <ChevronUp size={20} className="text-[#6a7282]" />}
        </button>

        {drawerOpen && (
          <div
            ref={cardScrollRef}
            className="flex gap-3 overflow-x-auto px-4 pb-6 pt-1 snap-x"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {locations.length === 0 ? (
              <p className="w-full text-center py-6 text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px]">
                No locations yet.
              </p>
            ) : (
              locations.map((loc, idx) => {
                const assets = getAssetsByLocationId(loc.id);
                const assetCount = assets.filter(a => a.type !== 'Miscellaneous').length;
                const inspCount = getInspectionsByLocationId(loc.id)[0]?.items.reduce((s, i) => s + i.count, 0) || 0;
                return (
                  <div id={`map-card-${loc.id}`} key={loc.id} className="snap-start">
                    <LocationCard
                      location={loc}
                      assetCount={assetCount}
                      inspCount={inspCount}
                      isActive={activeLocationId === loc.id}
                      onSelect={() => { setActiveLocationId(loc.id); setDrawerOpen(true); }}
                      hasGps={!!loc.coordinates}
                      number={idx + 1}
                      onViewDetails={() => setDetailsLocationId(loc.id)}
                    />
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
