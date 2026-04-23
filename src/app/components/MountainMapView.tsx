import * as locMediaDB from '../utils/locationMediaDB';
import * as cloudLocSync from '../utils/cloudLocationSync';
import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { X, MapPin, ChevronUp, ChevronDown, ClipboardList, Navigation } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import type { Location } from '../context/DataContext';

const SERVER = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;

// ─── Location thumbnail card ──────────────────────────────────────────────────

function LocationCard({
  location,
  mountainId,
  assetCount,
  inspCount,
  isActive,
  onSelect,
  hasGps,
}: {
  location: Location;
  mountainId: string;
  assetCount: number;
  inspCount: number;
  isActive: boolean;
  onSelect: () => void;
  hasGps: boolean;
}) {
  const navigate = useNavigate();
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    locMediaDB.getLocationMedia(location.id).then(async m => {
      if (m.photos.length > 0) {
        setThumb(m.photos[0]);
      } else {
        // Try cloud fallback
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
      className={`flex-shrink-0 w-64 rounded-[12px] border-2 overflow-hidden transition-all cursor-pointer ${
        isActive
          ? 'border-[#ff5c39] shadow-lg'
          : 'border-[rgba(0,0,0,0.1)] bg-white'
      }`}
      onClick={onSelect}
    >
      {/* Thumbnail */}
      <div className="relative h-28 bg-[#f3f3f5] overflow-hidden">
        {thumb ? (
          <img src={thumb} alt={location.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MapPin size={28} className={isActive ? 'text-[#ff5c39]' : 'text-[#d1d5db]'} />
          </div>
        )}
        {!hasGps && (
          <div className="absolute top-1.5 right-1.5 bg-black/60 rounded-full px-2 py-0.5">
            <span className="text-white text-[10px] font-['Inter:Medium',sans-serif]">No GPS</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className={`p-3 ${isActive ? 'bg-[#fff5f3]' : 'bg-white'}`}>
        <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] truncate">
          {location.name}
        </p>
        {location.trailName && (
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] truncate mt-0.5">
            {location.trailName}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {assetCount > 0 && (
            <span className="bg-[#FFe0D9] text-[#ff5c39] text-[11px] font-['Inter:Medium',sans-serif] px-2 py-0.5 rounded-full">
              {assetCount} asset{assetCount !== 1 ? 's' : ''}
            </span>
          )}
          {inspCount > 0 && (
            <span className="bg-[#f3f3f5] text-[#0a0a0a] text-[11px] font-['Inter:Medium',sans-serif] px-2 py-0.5 rounded-full flex items-center gap-1">
              <ClipboardList size={9} />
              {inspCount}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/mountains/${mountainId}/locations/${location.id}`);
          }}
          className="mt-2 w-full text-center text-[#307fe2] font-['Inter:Medium',sans-serif] text-[12px] py-1.5 rounded-[6px] bg-[#eff6ff] active:bg-[#dbeafe]"
        >
          View Details
        </button>
      </div>
    </div>
  );
}

// ─── Main MapView component ───────────────────────────────────────────────────

interface Props {
  mountainId: string;
  onClose: () => void;
}

export function MountainMapView({ mountainId, onClose }: Props) {
  const { getMountainById, getLocationsByMountainId, getAssetsByLocationId } = useData();
  const mountain = getMountainById(mountainId);
  const locations = getLocationsByMountainId(mountainId);

  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const cardScrollRef = useRef<HTMLDivElement>(null);

  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [geocoding, setGeocoding] = useState(false);

  const gpsLocations = locations.filter(l => l.coordinates);

  // Build a custom teardrop div icon
  const createMarkerIcon = useCallback((label: number, isActive: boolean) => {
    const bg = isActive ? '#ff5c39' : '#0a0a0a';
    const html = `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:${bg};border:2px solid white;display:flex;align-items:center;justify-content:center;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.35);"><span style="transform:rotate(45deg);color:white;font-size:11px;font-weight:700;font-family:sans-serif;line-height:1;">${label}</span></div>`;
    return L.divIcon({ html, className: '', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34] });
  }, []);

  // Initialise Leaflet map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, { zoomControl: false, attributionControl: true });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;

    if (gpsLocations.length > 0) {
      const bounds = L.latLngBounds(
        gpsLocations.map(l => [l.coordinates!.latitude, l.coordinates!.longitude] as [number, number])
      );
      map.fitBounds(bounds, { padding: [60, 60] });
    } else if (mountain?.address) {
      setGeocoding(true);
      fetch(`${SERVER}/places/geocode?address=${encodeURIComponent(mountain.address)}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      })
        .then(r => r.json())
        .then(d => {
          map.setView(d.location ? [d.location.lat, d.location.lng] : [39.5501, -105.7821], 14);
        })
        .catch(() => map.setView([39.5501, -105.7821], 10))
        .finally(() => setGeocoding(false));
    } else {
      map.setView([39.5501, -105.7821], 10);
    }

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers whenever locations / active state changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker, id) => {
      if (!gpsLocations.find(l => l.id === id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    gpsLocations.forEach((loc, idx) => {
      const isActive = loc.id === activeLocationId;
      const icon = createMarkerIcon(idx + 1, isActive);

      if (markersRef.current.has(loc.id)) {
        markersRef.current.get(loc.id)!.setIcon(icon);
      } else {
        const marker = L.marker(
          [loc.coordinates!.latitude, loc.coordinates!.longitude],
          { icon }
        ).addTo(map);
        marker.on('click', () => { setActiveLocationId(loc.id); setDrawerOpen(true); });
        markersRef.current.set(loc.id, marker);
      }
    });
  }, [gpsLocations, activeLocationId, createMarkerIcon]);

  // Pan map + scroll card into view when active location changes
  useEffect(() => {
    if (!activeLocationId || !mapRef.current) return;
    const loc = locations.find(l => l.id === activeLocationId);
    if (loc?.coordinates) {
      mapRef.current.panTo([loc.coordinates.latitude, loc.coordinates.longitude], { animate: true });
    }
    document.getElementById(`map-card-${activeLocationId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeLocationId, locations]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div ref={mapDivRef} className="flex-1 relative" />

      {geocoding && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white/90 rounded-full px-4 py-2 flex items-center gap-2 shadow z-[1001]">
          <Navigation size={14} className="text-[#6a7282] animate-pulse" />
          <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">Finding resort…</span>
        </div>
      )}

      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-[1001] w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center active:opacity-80"
      >
        <X size={20} className="text-[#0a0a0a]" />
      </button>

      {/* Mountain label pill */}
      <div className="absolute top-4 left-16 right-4 z-[1001] pointer-events-none">
        <div className="inline-flex items-center gap-2 bg-white/95 rounded-full px-3 py-2 shadow">
          <MapPin size={14} className="text-[#ff5c39]" />
          <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[13px]">
            {mountain?.name}
          </span>
          <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px]">
            {gpsLocations.length}/{locations.length} GPS
          </span>
        </div>
      </div>

      {/* Bottom drawer */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-[1000] bg-white rounded-t-[20px] shadow-[0_-4px_24px_rgba(0,0,0,0.18)] transition-transform duration-300 ${
          drawerOpen ? 'translate-y-0' : 'translate-y-[calc(100%-56px)]'
        }`}
      >
        {/* Handle / header row */}
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
          {drawerOpen
            ? <ChevronDown size={20} className="text-[#6a7282]" />
            : <ChevronUp size={20} className="text-[#6a7282]" />
          }
        </button>

        {/* Scrollable cards */}
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
              locations.map(loc => {
                const assets = getAssetsByLocationId(loc.id);
                const assetCount = assets.filter(a => a.type !== 'Miscellaneous').length;
                const inspCount = loc.inspection?.items.reduce((s, i) => s + i.count, 0) || 0;
                return (
                  <div id={`map-card-${loc.id}`} key={loc.id} className="snap-start">
                    <LocationCard
                      location={loc}
                      mountainId={mountainId}
                      assetCount={assetCount}
                      inspCount={inspCount}
                      isActive={activeLocationId === loc.id}
                      onSelect={() => { setActiveLocationId(loc.id); setDrawerOpen(true); }}
                      hasGps={!!loc.coordinates}
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