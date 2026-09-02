import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { X, MapPin } from 'lucide-react';
import { useData } from '../context/DataContext';
import { toast } from 'sonner';
import { geocodeWithMapbox } from '../utils/mapboxGeocode';
import { buildCoverageCone } from '../utils/geo';
import { useLockViewportZoom } from '../hooks/useLockViewportZoom';
import {
  type DeviceType, type CameraProperties, DEFAULT_CAMERA_PROPS, START_FINISH_COLORS,
  createDeviceMarkerElement, createCameraMarkerElement,
} from '../utils/deviceTypes';
import { listConnections, type MountainConnection, type ConnectionType } from '../utils/mountainConnectionsApi';
import { LocationDetail } from './LocationDetail';
import { LocationPropertiesPanel } from './LocationPropertiesPanel';
import { DeleteConfirmModal } from './DeleteConfirmModal';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string;

const DEFAULT_CENTER: [number, number] = [-98.35, 39.5];
const COVERAGE_SOURCE_ID = 'mapview-camera-coverage';
const CONNECTIONS_SOURCE_ID = 'mapview-connections';
const DEM_SOURCE_ID = 'mapbox-dem';
const CONNECTION_COLORS: Record<ConnectionType, string> = {
  wireless: '#0ea5e9', poe: '#22c55e', '120v': '#f59e0b',
};
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

// ─── Main MapView component ───────────────────────────────────────────────────
// Quick overview map — pan, zoom, select a device to view/edit its properties
// (same LocationPropertiesPanel as SiteAssessmentWorkspace, so a device
// behaves identically regardless of which map you're looking at it from) or
// open the full LocationDetail page for photos/videos/annotations. No
// add-device/connection tooling here — that stays exclusive to a Site
// Assessment; this view is for browsing and editing what's already there.
// and dragging pins all happen in a Site Assessment instead, not here.

interface Props {
  mountainId: string;
  onClose: () => void;
  initialFocusLocationId?: string;
}

export function MountainMapView({ mountainId, onClose, initialFocusLocationId }: Props) {
  useLockViewportZoom();
  const {
    getMountainById, getLocationsByMountainId, getTrailsByMountainId,
    updateMountain, updateLocation, deleteLocation, locations: allLocations,
  } = useData();
  const mountain = getMountainById(mountainId);
  const locations = useMemo(
    () => getLocationsByMountainId(mountainId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allLocations, mountainId]
  );
  const trails = useMemo(
    () => getTrailsByMountainId(mountainId).map(t => ({ id: t.id, name: t.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mountainId]
  );

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  const [activeLocationId, setActiveLocationId] = useState<string | null>(initialFocusLocationId || null);
  // Locked-by-default, same as SiteAssessmentWorkspace — only the item whose
  // panel is actively in edit mode can be dragged, so browsing the map can't
  // accidentally nudge a pin.
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [detailsLocationId, setDetailsLocationId] = useState<string | null>(null);
  const [locationPendingDelete, setLocationPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [mapStyle, setMapStyle] = useState<'satellite' | 'streets' | 'outdoors'>('satellite');
  const [mapReady, setMapReady] = useState(false);
  const [styleReady, setStyleReady] = useState(false);
  // Connections (Wireless/PoE/120V links) — a dedicated table, not a
  // Location, loaded independently (see mountainConnectionsApi.ts).
  const [connections, setConnections] = useState<MountainConnection[]>([]);

  useEffect(() => {
    listConnections(mountainId).then(setConnections).catch(err => {
      console.error('[MountainMapView] failed to load connections:', err);
    });
  }, [mountainId]);

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
      // Connections — read-only rendering (no drag handles; this view
      // never edits anything). Same 4-layer setup as
      // SiteAssessmentWorkspace.tsx's editable version.
      if (!map.getSource(CONNECTIONS_SOURCE_ID)) {
        map.addSource(CONNECTIONS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'mapview-connections-line', type: 'line', source: CONNECTIONS_SOURCE_ID,
          filter: ['!=', ['get', 'connectionType'], '120v'],
          paint: {
            'line-color': ['get', 'color'], 'line-width': 3,
            'line-dasharray': ['match', ['get', 'connectionType'], 'wireless', ['literal', [2, 1.5]], ['literal', [1, 0]]],
          },
        });
        map.addLayer({
          id: 'mapview-connections-120v-a', type: 'line', source: CONNECTIONS_SOURCE_ID,
          filter: ['==', ['get', 'connectionType'], '120v'],
          paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-offset': 2 },
        });
        map.addLayer({
          id: 'mapview-connections-120v-b', type: 'line', source: CONNECTIONS_SOURCE_ID,
          filter: ['==', ['get', 'connectionType'], '120v'],
          paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-offset': -2 },
        });
        map.addLayer({
          id: 'mapview-connections-label', type: 'symbol', source: CONNECTIONS_SOURCE_ID,
          layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 'name'], 'text-size': 12, 'text-offset': [0, 1.2] },
          paint: { 'text-color': '#ffffff', 'text-halo-color': ['get', 'color'], 'text-halo-width': 1.5 },
        });
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

  // Marker sync — draggable only for the one item currently being edited
  // (its panel is open in edit mode), same as SiteAssessmentWorkspace.
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
      });

      const marker = new mapboxgl.Marker({
        element: el,
        draggable: loc.id === editingLocationId && !loc.isLocked,
        rotationAlignment: isCamera ? 'map' : 'auto',
        pitchAlignment: isCamera ? 'map' : 'auto',
      })
        .setLngLat([loc.coordinates!.longitude, loc.coordinates!.latitude])
        .addTo(map);

      if (isCamera) {
        const heading = ((loc.deviceProperties as any)?.heading as number) ?? 0;
        marker.setRotation(heading);
      }

      marker.on('dragend', () => {
        const ll = marker.getLngLat();
        const updates: Partial<typeof loc> = { coordinates: { latitude: ll.lat, longitude: ll.lng } };
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
  }, [gpsLocations, activeLocationId, editingLocationId, mapReady]);

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

  // Connections — read-only rendering, rebuilt whenever the connection set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const source = map.getSource(CONNECTIONS_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const features = connections.map(cx => ({
      type: 'Feature' as const,
      properties: { id: cx.id, name: cx.name, connectionType: cx.connection_type, color: CONNECTION_COLORS[cx.connection_type] },
      geometry: {
        type: 'LineString' as const,
        coordinates: [[cx.start_longitude, cx.start_latitude], [cx.end_longitude, cx.end_latitude]],
      },
    }));
    source.setData({ type: 'FeatureCollection', features });
  }, [connections, styleReady]);

  // Pan map to the selected location
  useEffect(() => {
    if (!activeLocationId || !mapRef.current) return;
    const loc = locations.find(l => l.id === activeLocationId);
    if (loc?.coordinates && isValidCoordinate(loc.coordinates.latitude, loc.coordinates.longitude)) {
      mapRef.current.panTo([loc.coordinates.longitude, loc.coordinates.latitude]);
    }
  }, [activeLocationId, locations]);

  const selectedLocation = activeLocationId ? locations.find(l => l.id === activeLocationId) || null : null;

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

      {/* Top right controls — shifted left of the properties panel (same
          treatment as SiteAssessmentWorkspace) so they don't overlap it. */}
      <div className={`absolute top-4 right-4 z-[1001] flex items-center gap-2 ${selectedLocation ? 'sm:mr-[296px]' : ''}`}>
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

      {/* Selected device — same properties panel as SiteAssessmentWorkspace,
          so it looks/behaves identically. "View full details" opens the
          LocationDetail modal above; there's no add-device tooling here. */}
      {selectedLocation && (
        <LocationPropertiesPanel
          key={selectedLocation.id}
          location={selectedLocation}
          trails={trails}
          onUpdate={(data) => updateLocation(selectedLocation.id, data)}
          onDelete={() => setLocationPendingDelete({ id: selectedLocation.id, name: selectedLocation.name })}
          onClose={() => { setActiveLocationId(null); setEditingLocationId(null); }}
          onViewFullDetails={() => setDetailsLocationId(selectedLocation.id)}
          onEditingChange={(editing) => setEditingLocationId(editing ? selectedLocation.id : null)}
        />
      )}

      {locationPendingDelete && (
        <DeleteConfirmModal
          title={`Delete "${locationPendingDelete.name}"?`}
          description="This removes it from the map and from the mountain's Locations. This can't be undone."
          onCancel={() => setLocationPendingDelete(null)}
          onConfirm={async () => {
            try {
              await deleteLocation(locationPendingDelete.id);
              setActiveLocationId(null);
              setLocationPendingDelete(null);
            } catch (err: any) {
              toast.error(`Error: ${err.message}`);
            }
          }}
        />
      )}
    </div>
  );
}
