import { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import { X, MapPin, Navigation, Camera, Users, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import type { Mountain, MountainPipelineStage } from '../context/DataContext';
import { useMountainGeocoding } from '../hooks/useMountainGeocoding';
import { StageBadge } from './crm/CRM';
import { ProjectMiniBar } from './projects/ProjectsPane';

// Marker colors per the requested scheme — deliberately distinct from
// STAGE_COLORS (crm/CRM.tsx), which uses its own badge palette.
const MARKER_COLORS: Record<MountainPipelineStage, string> = {
  Lead: '#6a7282',
  Prospect: '#307FE2',
  Committed: '#eab308',
  Onboarding: '#f97316',
  Active: '#22c55e',
  Paused: '#a855f7',
  Dead: '#ef4444',
};
const NO_STAGE_COLOR = '#9ca3af';

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

interface Props {
  mountains: Mountain[];
  onClose: () => void;
}

// Compact summary card shown on marker hover — the same at-a-glance info
// (stage, org, trail/location/camera/contact counts, address, project
// progress) as the mountain's card on the main list.
function MountainHoverCard({ mountain, x, y }: { mountain: Mountain; x: number; y: number }) {
  const { trails, assets, contacts, organizations, getLocationsByMountainId, getProjectsByMountainId } = useData();
  const trailCount = trails.filter(t => t.mountainId === mountain.id).length;
  const locationCount = getLocationsByMountainId(mountain.id).length;
  const cameraCount = assets.filter(a => a.mountainId === mountain.id && a.type === 'Camera').length;
  const contactCount = contacts.filter(c => c.mountainId === mountain.id).length;
  const org = mountain.organizationId ? organizations.find(o => o.id === mountain.organizationId) : undefined;
  const projects = getProjectsByMountainId(mountain.id);

  // Default placement is centered above the marker; if that would clip past
  // a viewport edge, nudge it back in (and flip below if there's no room
  // above) so it's never cut off.
  const cardRef = useRef<HTMLDivElement>(null);
  const [nudge, setNudge] = useState({ dx: 0, flipBelow: false });
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    let dx = 0;
    if (rect.left < margin) dx = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) dx = (window.innerWidth - margin) - rect.right;
    const flipBelow = rect.top < margin;
    setNudge(prev => (prev.dx === dx && prev.flipBelow === flipBelow ? prev : { dx, flipBelow }));
  }, [x, y]);

  const transform = nudge.flipBelow
    ? `translate(calc(-50% + ${nudge.dx}px), 16px)`
    : `translate(calc(-50% + ${nudge.dx}px), calc(-100% - 16px))`;

  return (
    <div
      ref={cardRef}
      className="absolute z-[1002] w-72 bg-white rounded-[10px] shadow-xl border border-[rgba(0,0,0,0.08)] p-3 pointer-events-none"
      style={{ left: x, top: y, transform }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] line-clamp-2">{mountain.name}</h4>
        <StageBadge stage={mountain.pipelineStage} />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {org && (
          <span className="flex items-center gap-1 bg-[#f3edfb] text-[#7c3aed] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
            <Building2 size={10} /> {org.name}
          </span>
        )}
        <span className="flex items-center gap-1 bg-[#f3f3f5] text-[#6a7282] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
          <MapPin size={10} /> {trailCount} trail{trailCount !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1 bg-[#f3f3f5] text-[#6a7282] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
          <Navigation size={10} /> {locationCount} location{locationCount !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1 bg-[#fff3f0] text-[#ff5c39] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
          <Camera size={10} /> {cameraCount} camera{cameraCount !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1 bg-[#eef3fb] text-[#307fe2] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
          <Users size={10} /> {contactCount} contact{contactCount !== 1 ? 's' : ''}
        </span>
      </div>
      <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] line-clamp-2 mb-2">{mountain.address}</p>
      {projects.length > 0 ? (
        <div className="space-y-2">
          {projects.map(p => <ProjectMiniBar key={p.id} project={p} />)}
        </div>
      ) : (
        <div className="text-[11px] text-[#8992a0]">No projects yet</div>
      )}
    </div>
  );
}

export function AllMountainsMapView({ mountains, onClose }: Props) {
  const navigate = useNavigate();

  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  const { resolvedCoords, geocodedCount, totalToGeocode } = useMountainGeocoding(mountains);
  const [hoverInfo, setHoverInfo] = useState<{ mountain: Mountain; x: number; y: number } | null>(null);

  const createMarkerIcon = useCallback((color: string) => {
    const html = `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};border:2px solid white;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`;
    return L.divIcon({ html, className: '', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -30] });
  }, []);

  // Init Leaflet map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    // Continental-US-wide starting view — deliberately not auto-fit to the
    // mountains' own bounds (that zoomed in tighter than intended whenever
    // mountains happened to cluster in one region), so this stays put as
    // the persistent default rather than being overridden once geocoding
    // resolves.
    const map = L.map(mapDivRef.current, { zoomControl: false }).setView([39.5, -98.35], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;

    return () => {
      markersRef.current.forEach(marker => { try { marker.remove(); } catch { /* ignore */ } });
      markersRef.current.clear();
      try { map.remove(); } catch { /* ignore */ }
      mapRef.current = null;
    };
  }, []);

  const mountainsWithCoords = mountains
    .map(m => ({ mountain: m, coords: m.coordinates || resolvedCoords[m.id] }))
    .filter((x): x is { mountain: Mountain; coords: { latitude: number; longitude: number } } =>
      !!x.coords && isValidCoordinate(x.coords.latitude, x.coords.longitude));

  // Sync markers whenever resolved mountains change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker, id) => {
      if (!mountainsWithCoords.find(({ mountain }) => mountain.id === id)) {
        try { marker.remove(); } catch { /* ignore */ }
        markersRef.current.delete(id);
      }
    });

    mountainsWithCoords.forEach(({ mountain, coords }) => {
      if (markersRef.current.has(mountain.id)) return;
      const color = mountain.pipelineStage ? MARKER_COLORS[mountain.pipelineStage] : NO_STAGE_COLOR;
      const marker = L.marker([coords.latitude, coords.longitude], { icon: createMarkerIcon(color) }).addTo(map);

      marker.on('mouseover', () => {
        const pt = map.latLngToContainerPoint(marker.getLatLng());
        setHoverInfo({ mountain, x: pt.x, y: pt.y });
      });
      marker.on('mouseout', () => setHoverInfo(prev => (prev?.mountain.id === mountain.id ? null : prev)));
      marker.on('click', () => { onClose(); navigate(`/mountains/${mountain.id}`); });

      markersRef.current.set(mountain.id, marker);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountainsWithCoords, createMarkerIcon]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div ref={mapDivRef} className="flex-1 relative" />

      {hoverInfo && <MountainHoverCard mountain={hoverInfo.mountain} x={hoverInfo.x} y={hoverInfo.y} />}

      {totalToGeocode > 0 && geocodedCount < totalToGeocode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white/90 rounded-full px-4 py-2 flex items-center gap-2 shadow z-[1001]">
          <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">
            Locating mountains… ({geocodedCount}/{totalToGeocode})
          </span>
        </div>
      )}

      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-[1001] w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center active:opacity-80"
      >
        <X size={20} className="text-[#0a0a0a]" />
      </button>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1001] bg-white/95 rounded-[10px] shadow-lg p-3 space-y-1.5">
        {(['Lead', 'Prospect', 'Committed', 'Onboarding', 'Active', 'Paused', 'Dead'] as MountainPipelineStage[]).map(stage => (
          <div key={stage} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: MARKER_COLORS[stage] }} />
            <span className="text-[11px] text-[#0a0a0a] font-['Inter:Regular',sans-serif]">{stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
