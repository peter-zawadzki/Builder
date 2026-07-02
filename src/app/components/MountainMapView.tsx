import * as locMediaDB from '../utils/locationMediaDB';
import * as cloudLocSync from '../utils/cloudLocationSync';
import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { X, MapPin, ChevronUp, ChevronDown, ClipboardList, Navigation, Edit3, Check, Layers } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import type { Location } from '../context/DataContext';
import { toast } from 'sonner';

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
  number,
  onCloseMapView,
}: {
  location: Location;
  mountainId: string;
  assetCount: number;
  inspCount: number;
  isActive: boolean;
  onSelect: () => void;
  hasGps: boolean;
  number: number;
  onCloseMapView: () => void;
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
        <div className={`absolute top-1.5 left-1.5 w-7 h-7 rounded-full border-2 border-white shadow-md flex items-center justify-center ${
          isActive ? 'bg-[#ff5c39]' : 'bg-[#0a0a0a]'
        }`}>
          <span className="text-white text-[12px] font-['Inter:Bold',sans-serif] font-bold">{number}</span>
        </div>
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
        <div className="flex flex-wrap gap-1.5 mt-2 min-h-[24px]">
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
            console.log('[LocationCard] View Details clicked, closing map and navigating to:', `/mountains/${mountainId}/locations/${location.id}`);
            onCloseMapView(); // Close the map modal first
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
  initialFocusLocationId?: string;
}

export function MountainMapView({ mountainId, onClose, initialFocusLocationId }: Props) {
  const { getMountainById, getLocationsByMountainId, getAssetsByLocationId, updateLocation } = useData();
  const mountain = getMountainById(mountainId);
  const locations = getLocationsByMountainId(mountainId);

  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const cardScrollRef = useRef<HTMLDivElement>(null);
  const streetLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteLayerRef = useRef<L.TileLayer | null>(null);

  const [activeLocationId, setActiveLocationId] = useState<string | null>(initialFocusLocationId || null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [mapLayer, setMapLayer] = useState<'street' | 'satellite'>('street');

  // Filter to only valid GPS coordinates
  const isValidCoordinate = (lat: number, lng: number) => {
    return (
      typeof lat === 'number' && typeof lng === 'number' &&
      !isNaN(lat) && !isNaN(lng) &&
      isFinite(lat) && isFinite(lng) &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180
    );
  };

  const locationsWithCoords = locations.filter(l => l.coordinates);
  const gpsLocations = locationsWithCoords.filter(l => {
    const isValid = isValidCoordinate(l.coordinates!.latitude, l.coordinates!.longitude);
    if (!isValid) {
      console.warn(`[MountainMapView] Invalid coordinates for location "${l.name}":`, l.coordinates);
    }
    return isValid;
  });

  console.log('[MountainMapView] Total locations:', locations.length);
  console.log('[MountainMapView] Locations with coords:', locationsWithCoords.length);
  console.log('[MountainMapView] Valid GPS locations:', gpsLocations.length);

  // Debug: log each location's coordinate status
  if (locations.length > 0) {
    console.log('[MountainMapView] Location coordinate status:');
    locations.forEach((loc, i) => {
      if (!loc.coordinates) {
        console.log(`  ${i + 1}. "${loc.name}": NO COORDINATES`);
      } else {
        const isValid = isValidCoordinate(loc.coordinates.latitude, loc.coordinates.longitude);
        console.log(`  ${i + 1}. "${loc.name}": ${isValid ? 'VALID' : 'INVALID'} (${loc.coordinates.latitude}, ${loc.coordinates.longitude})`);
      }
    });
  }

  // Warn if some coordinates are invalid
  const invalidCoordinateCount = locationsWithCoords.length - gpsLocations.length;
  useEffect(() => {
    if (locations.length === 0) {
      console.warn('[MountainMapView] No locations found for this mountain');
    } else if (locationsWithCoords.length === 0) {
      console.warn('[MountainMapView] No locations have coordinates set');
      toast.error('No locations have GPS coordinates. Add coordinates in Location Details to see pins on the map.');
    } else if (invalidCoordinateCount > 0) {
      console.error(`[MountainMapView] ${invalidCoordinateCount} location(s) have invalid coordinates`);
      toast.error(`${invalidCoordinateCount} location${invalidCoordinateCount !== 1 ? 's have' : ' has'} invalid GPS coordinates`);
    }
  }, [locations.length, locationsWithCoords.length, invalidCoordinateCount]);

  // Build a custom teardrop div icon
  const createMarkerIcon = useCallback((label: number, isActive: boolean) => {
    const bg = isActive ? '#ff5c39' : '#0a0a0a';
    const html = `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:${bg};border:2px solid white;display:flex;align-items:center;justify-content:center;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.35);"><span style="transform:rotate(45deg);color:white;font-size:11px;font-weight:700;font-family:sans-serif;line-height:1;">${label}</span></div>`;
    return L.divIcon({ html, className: '', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34] });
  }, []);

  // Geocode the mountain address via Nominatim (OSM, no API key needed)
  const geocodeMountainAddress = useCallback(async (map: L.Map) => {
    const address = mountain?.address;
    if (!address) {
      map.setView([39.5501, -105.7821], 10);
      return;
    }
    setGeocoding(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await resp.json() as any[];
      if (data.length > 0) {
        map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 14);
      } else {
        map.setView([39.5501, -105.7821], 10);
      }
    } catch {
      map.setView([39.5501, -105.7821], 10);
    } finally {
      setGeocoding(false);
    }
  }, [mountain?.address]);

  // Initialise Leaflet map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    console.log('[MountainMapView] Initializing map...');
    const map = L.map(mapDivRef.current, { zoomControl: false, attributionControl: true });

    // Set initial view immediately (will be updated by geocoding or bounds fitting)
    map.setView([39.5501, -105.7821], 10);

    // Create street layer
    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Create satellite layer (Esri World Imagery)
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri',
      maxZoom: 19,
    });

    streetLayerRef.current = streetLayer;
    satelliteLayerRef.current = satelliteLayer;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;
    console.log('[MountainMapView] Map initialized successfully');

    // Always start centered on the mountain address, then optionally fit GPS bounds
    geocodeMountainAddress(map).then(() => {
      console.log('[MountainMapView] Geocoding complete, checking GPS locations...');
      // Once centered on the mountain, fit to GPS location markers if any exist
      if (gpsLocations.length > 0) {
        console.log(`[MountainMapView] Fitting bounds to ${gpsLocations.length} GPS locations`);
        try {
          const bounds = L.latLngBounds(
            gpsLocations.map(l => [l.coordinates!.latitude, l.coordinates!.longitude] as [number, number])
          );
          // Validate bounds before fitting
          if (bounds.isValid()) {
            console.log('[MountainMapView] Bounds are valid, fitting map');
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
          } else {
            console.warn('[MountainMapView] Bounds are invalid');
          }
        } catch (err) {
          console.error('[MountainMapView] Error fitting map bounds:', err);
          // Fallback to default view if bounds are invalid
          map.setView([39.5501, -105.7821], 10);
        }
      } else {
        console.log('[MountainMapView] No GPS locations to fit');
      }
    });

    return () => {
      // Clean up all markers before removing map
      markersRef.current.forEach((marker) => {
        try {
          if (marker && typeof marker.remove === 'function') {
            marker.remove();
          }
        } catch (err) {
          console.warn('Error removing marker during cleanup:', err);
        }
      });
      markersRef.current.clear();

      // Remove map
      try {
        map.remove();
      } catch (err) {
        console.warn('Error removing map:', err);
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch between map layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !streetLayerRef.current || !satelliteLayerRef.current) return;

    try {
      if (mapLayer === 'satellite') {
        if (map.hasLayer(streetLayerRef.current)) {
          map.removeLayer(streetLayerRef.current);
        }
        if (!map.hasLayer(satelliteLayerRef.current)) {
          map.addLayer(satelliteLayerRef.current);
        }
      } else {
        if (map.hasLayer(satelliteLayerRef.current)) {
          map.removeLayer(satelliteLayerRef.current);
        }
        if (!map.hasLayer(streetLayerRef.current)) {
          map.addLayer(streetLayerRef.current);
        }
      }
    } catch (err) {
      console.error('Error switching map layers:', err);
    }
  }, [mapLayer]);

  // Sync markers whenever locations / active state / edit mode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      console.warn('[MountainMapView] Map not ready yet');
      return;
    }

    console.log('[MountainMapView] Syncing markers for', gpsLocations.length, 'GPS locations');

    // Clean up markers for locations that no longer exist
    markersRef.current.forEach((marker, id) => {
      if (!gpsLocations.find(l => l.id === id)) {
        try {
          // Check if marker is still valid before removing
          if (marker && typeof marker.remove === 'function') {
            marker.remove();
          }
        } catch (err) {
          console.warn(`Error removing marker for location ${id}:`, err);
        }
        markersRef.current.delete(id);
      }
    });

    gpsLocations.forEach((loc) => {
      const isActive = loc.id === activeLocationId;
      const locationIndex = locations.findIndex(l => l.id === loc.id);
      const icon = createMarkerIcon(locationIndex + 1, isActive);

      const markerExists = markersRef.current.has(loc.id);
      console.log(`[MountainMapView] Processing location "${loc.name}": marker exists = ${markerExists}`);

      if (markerExists) {
        const marker = markersRef.current.get(loc.id);
        if (marker) {
          try {
            console.log(`[MountainMapView] Updating existing marker for "${loc.name}"`);
            marker.setIcon(icon);
            // Update draggable state
            if (editMode) {
              marker.dragging?.enable();
            } else {
              marker.dragging?.disable();
            }
          } catch (err) {
            console.warn(`Error updating marker for location ${loc.name}:`, err);
            // Remove invalid marker and create a new one
            markersRef.current.delete(loc.id);
          }
        }
      }

      // Create new marker if it doesn't exist or was just removed
      if (!markersRef.current.has(loc.id)) {
        // Double-check coordinates are valid before creating marker
        const lat = loc.coordinates!.latitude;
        const lng = loc.coordinates!.longitude;
        if (!isValidCoordinate(lat, lng)) {
          console.warn(`[MountainMapView] Skipping marker for location "${loc.name}": invalid coordinates`, { lat, lng });
          return;
        }

        try {
          console.log(`[MountainMapView] Creating marker for location "${loc.name}" at`, { lat, lng });
          const marker = L.marker(
            [lat, lng],
            { icon, draggable: editMode, zIndexOffset: 1000 }
          ).addTo(map);

          console.log(`[MountainMapView] Marker added to map, checking if visible...`, marker.getLatLng());

          marker.on('click', () => { setActiveLocationId(loc.id); setDrawerOpen(true); });

          marker.on('dragend', () => {
            const newLatLng = marker.getLatLng();
            const location = locations.find(l => l.id === loc.id);

            if (location) {
              // Preserve original coordinates if this is the first edit
              const updates: Partial<Location> = {
                coordinates: {
                  latitude: newLatLng.lat,
                  longitude: newLatLng.lng,
                },
              };

              // Only set originalCoordinates if it doesn't already exist
              if (!location.originalCoordinates && location.coordinates) {
                updates.originalCoordinates = {
                  latitude: location.coordinates.latitude,
                  longitude: location.coordinates.longitude,
                  recordedAt: new Date().toISOString(),
                };
              }

              updateLocation(loc.id, updates);
              toast.success('Location updated');
            }
          });

          markersRef.current.set(loc.id, marker);
          console.log(`[MountainMapView] Successfully created marker for location "${loc.name}"`);
        } catch (err) {
          console.error(`[MountainMapView] Error creating marker for location "${loc.name}":`, err);
        }
      }
    });

    console.log('[MountainMapView] Marker sync complete. Total markers:', markersRef.current.size);

    // Debug: Check if markers are actually on the map (only if map has been initialized with center/zoom)
    if (markersRef.current.size > 0) {
      try {
        const firstMarker = Array.from(markersRef.current.values())[0];
        const isOnMap = map.hasLayer(firstMarker);
        console.log('[MountainMapView] DEBUG: First marker is on map?', isOnMap);
        if (isOnMap) {
          // Only check map state if it's been initialized
          try {
            console.log('[MountainMapView] DEBUG: Markers ARE on map - map state:', {
              center: map.getCenter(),
              zoom: map.getZoom(),
              size: map.getSize()
            });
          } catch {
            console.log('[MountainMapView] DEBUG: Map not fully initialized yet');
          }
        } else {
          console.error('[MountainMapView] ERROR: Markers NOT on map! This should not happen.');
        }
      } catch (err) {
        console.warn('[MountainMapView] Debug check failed:', err);
      }
    }
  }, [gpsLocations, activeLocationId, createMarkerIcon, editMode, locations, updateLocation]);

  // Pan map + scroll card into view when active location changes
  useEffect(() => {
    if (!activeLocationId || !mapRef.current) return;
    const loc = locations.find(l => l.id === activeLocationId);
    if (loc?.coordinates) {
      const { latitude, longitude } = loc.coordinates;
      // Only pan if coordinates are valid
      if (isValidCoordinate(latitude, longitude)) {
        try {
          mapRef.current.panTo([latitude, longitude], { animate: true });
        } catch (err) {
          console.warn('Error panning to location:', err);
        }
      }
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

      {/* Top right controls */}
      <div className="absolute top-4 right-4 z-[1001] flex items-center gap-2">
        {/* Map layer toggle */}
        <button
          onClick={() => {
            const newLayer = mapLayer === 'street' ? 'satellite' : 'street';
            setMapLayer(newLayer);
            toast.info(newLayer === 'satellite' ? 'Satellite view' : 'Street view');
          }}
          className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center active:opacity-80"
        >
          <Layers size={18} className="text-[#0a0a0a]" />
        </button>

        {/* Edit mode toggle */}
        <button
          onClick={() => {
            setEditMode(v => !v);
            toast.info(editMode ? 'Edit mode disabled' : 'Drag pins to update coordinates');
          }}
          className={`h-10 px-4 rounded-full shadow-lg flex items-center gap-2 active:opacity-80 transition-colors ${
            editMode ? 'bg-[#ff5c39] text-white' : 'bg-white text-[#0a0a0a]'
          }`}
        >
          {editMode ? (
            <>
              <Check size={18} />
              <span className="font-['Inter:Medium',sans-serif] font-medium text-[14px]">Done</span>
            </>
          ) : (
            <>
              <Edit3 size={18} />
              <span className="font-['Inter:Medium',sans-serif] font-medium text-[14px]">Edit</span>
            </>
          )}
        </button>
      </div>

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
              locations.map((loc, idx) => {
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
                      number={idx + 1}
                      onCloseMapView={onClose}
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