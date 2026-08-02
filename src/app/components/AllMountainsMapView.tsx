import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import type { Mountain, MountainPipelineStage } from '../context/DataContext';

// Marker colors per the requested scheme — deliberately distinct from
// STAGE_COLORS (crm/CRM.tsx), which uses its own badge palette; the map's
// colors group Onboarding and Committed together as yellow.
const MARKER_COLORS: Record<MountainPipelineStage, string> = {
  Lead: '#6a7282',
  Prospect: '#f97316',
  Committed: '#eab308',
  Onboarding: '#eab308',
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

export function AllMountainsMapView({ mountains, onClose }: Props) {
  const { updateMountain } = useData();
  const navigate = useNavigate();

  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  const [geocodedCount, setGeocodedCount] = useState(0);
  const [resolvedCoords, setResolvedCoords] = useState<Record<string, { latitude: number; longitude: number }>>({});

  const totalToGeocode = mountains.filter(m => !m.coordinates && m.address).length;

  const createMarkerIcon = useCallback((color: string) => {
    const html = `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};border:2px solid white;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`;
    return L.divIcon({ html, className: '', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -30] });
  }, []);

  // Init Leaflet map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, { zoomControl: false }).setView([39.5501, -98.35], 4);
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

  // Geocode (via Nominatim, no API key) any mountain that doesn't already
  // have cached coordinates, one at a time with a ~1.1s gap to respect
  // Nominatim's usage policy (max ~1 req/sec) — persisting each result onto
  // the Mountain record as it resolves so future opens skip it entirely.
  useEffect(() => {
    let cancelled = false;
    const needsGeocode = mountains.filter(m => !m.coordinates && m.address);
    if (needsGeocode.length === 0) return;

    (async () => {
      for (const m of needsGeocode) {
        if (cancelled) return;
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(m.address)}&format=json&limit=1`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = (await resp.json()) as any[];
          if (data.length > 0 && !cancelled) {
            const latitude = parseFloat(data[0].lat);
            const longitude = parseFloat(data[0].lon);
            if (isValidCoordinate(latitude, longitude)) {
              setResolvedCoords(prev => ({ ...prev, [m.id]: { latitude, longitude } }));
              updateMountain(m.id, { coordinates: { latitude, longitude } });
            }
          }
        } catch {
          // Skip on failure — will just retry next time the map is opened.
        }
        if (!cancelled) setGeocodedCount(c => c + 1);
        await new Promise(r => setTimeout(r, 1100));
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      marker.bindTooltip(`${mountain.name} — ${mountain.pipelineStage || 'No stage'}`, { direction: 'top', offset: [0, -14] });
      marker.on('click', () => { onClose(); navigate(`/mountains/${mountain.id}`); });
      markersRef.current.set(mountain.id, marker);
    });

    if (mountainsWithCoords.length > 0) {
      try {
        const bounds = L.latLngBounds(mountainsWithCoords.map(({ coords }) => [coords.latitude, coords.longitude] as [number, number]));
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 10 });
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountainsWithCoords, createMarkerIcon]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div ref={mapDivRef} className="flex-1 relative" />

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
