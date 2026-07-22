import { useState, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, MapPin, Loader2, CheckCircle2, X, Image, Video, RefreshCw, Map, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../context/DataContext';
import * as locMediaDB from '../utils/locationMediaDB';
import * as cloudLocSync from '../utils/cloudLocationSync';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import L from 'leaflet';

// ─── Map Picker Modal ─────────────────────────────────────────────────────────

interface MapPickerProps {
  mountainAddress?: string;
  initialCoords?: { latitude: number; longitude: number } | null;
  onSelect: (coords: { latitude: number; longitude: number }) => void;
  onClose: () => void;
}

function MapPicker({ mountainAddress, initialCoords, onSelect, onClose }: MapPickerProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [selectedCoords, setSelectedCoords] = useState<{ latitude: number; longitude: number } | null>(
    initialCoords || null
  );
  const [geocoding, setGeocoding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  // Geocode the mountain address
  const geocodeMountainAddress = useCallback(async (map: L.Map) => {
    if (!mountainAddress) {
      map.setView([39.5501, -105.7821], 10);
      return;
    }
    setGeocoding(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(mountainAddress)}&format=json&limit=1`,
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
  }, [mountainAddress]);

  // Initialize map
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, { zoomControl: false, attributionControl: true });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;

    // Center on mountain or initial coords
    if (initialCoords) {
      map.setView([initialCoords.latitude, initialCoords.longitude], 16);
    } else {
      geocodeMountainAddress(map);
    }

    // Click to place/move pin
    map.on('click', (e: L.LeafletMouseEvent) => {
      const coords = { latitude: e.latlng.lat, longitude: e.latlng.lng };
      setSelectedCoords(coords);

      if (markerRef.current) {
        markerRef.current.setLatLng(e.latlng);
      } else {
        const marker = L.marker(e.latlng, {
          icon: L.divIcon({
            html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:#ff5c39;border:2px solid white;display:flex;align-items:center;justify-content:center;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
            className: '',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
          }),
        }).addTo(map);
        markerRef.current = marker;
      }
    });

    // Place initial marker if coords exist
    if (initialCoords) {
      const marker = L.marker([initialCoords.latitude, initialCoords.longitude], {
        icon: L.divIcon({
          html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:#ff5c39;border:2px solid white;display:flex;align-items:center;justify-content:center;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        }),
      }).addTo(map);
      markerRef.current = marker;
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = () => {
    if (selectedCoords) {
      onSelect(selectedCoords);
      onClose();
      toast.success('Location set');
    } else {
      toast.error('Click on the map to select a location');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !mapRef.current) return;

    setSearching(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await resp.json() as any[];
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        mapRef.current.setView([lat, lng], 16);
        toast.success('Location found');
      } else {
        toast.error('Location not found. Try a different search.');
      }
    } catch (err) {
      console.error('Search error:', err);
      toast.error('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div ref={mapDivRef} className="flex-1 relative" />

      {geocoding && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-white/90 rounded-full px-4 py-2 flex items-center gap-2 shadow z-[1001]">
          <Loader2 size={14} className="text-[#6a7282] animate-spin" />
          <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">Finding resort…</span>
        </div>
      )}

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1001] bg-white/95 backdrop-blur border-b border-[rgba(0,0,0,0.1)] px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
            Select Location on Map
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px] active:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedCoords}
              className="px-4 py-2 bg-[#ff5c39] text-white rounded-[8px] font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80 disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for an address or place..."
            className="flex-1 bg-white border border-[#d1d5db] rounded-[8px] px-3 py-2 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] outline-none focus:border-[#ff5c39]"
          />
          <button
            type="submit"
            disabled={searching || !searchQuery.trim()}
            className="px-4 py-2 bg-[#0a0a0a] text-white rounded-[8px] font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80 disabled:opacity-50"
          >
            {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
          </button>
        </form>

        <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
          {selectedCoords
            ? `${selectedCoords.latitude.toFixed(6)}, ${selectedCoords.longitude.toFixed(6)}`
            : 'Search for a location or click anywhere on the map to drop a pin'}
        </p>
      </div>
    </div>
  );
}

// ─── Main EditLocation Component ─────────────────────────────────────────────

export function EditLocation() {
  const { mountainId, locationId } = useParams();
  const navigate = useNavigate();
  const { getMountainById, getLocationById, updateLocation, deleteLocation, getMountainTrailNames } = useData();

  const mountain = getMountainById(mountainId!);
  const location = getLocationById(locationId!);

  // ─── Text fields ────────────────────────────────────────────────────────────
  const [nickname, setNickname] = useState(location?.name || '');
  const [trailName, setTrailName] = useState(location?.trailName || '');
  const [notes, setNotes] = useState(location?.notes || '');
  const [locationType, setLocationType] = useState<string>(location?.locationType || '');
  const [validationErrors, setValidationErrors] = useState<{ name?: string; locationType?: string }>({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── GPS ─────────────────────────────────────────────────────────────────────
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    location?.coordinates || null
  );
  const [gpsLoading, setGpsLoading] = useState(false);
  const [manualLat, setManualLat] = useState(location?.coordinates?.latitude.toString() || '');
  const [manualLng, setManualLng] = useState(location?.coordinates?.longitude.toString() || '');
  const [showManual, setShowManual] = useState(false);

  // ─── Media ───────────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false); // Immediate guard against double-submission
  const isNavigatingAfterSaveRef = useRef(false); // Track intentional navigation after save

  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Trail suggestions — mountain-wide
  const existingTrails = getMountainTrailNames(mountainId!);

  // Track changes
  useEffect(() => {
    if (!location) return;

    const hasChanges =
      nickname !== (location.name || '') ||
      trailName !== (location.trailName || '') ||
      notes !== (location.notes || '') ||
      locationType !== (location.locationType || '') ||
      JSON.stringify(coords) !== JSON.stringify(location.coordinates || null) ||
      photos.length !== 0 || // New photos added
      videos.length !== 0;   // New videos added

    setHasUnsavedChanges(hasChanges);
  }, [nickname, trailName, notes, locationType, coords, photos, videos, location]);

  // Load existing media from IndexedDB on mount; fall back to cloud if empty
  useEffect(() => {
    if (!locationId) return;
    locMediaDB.getLocationMedia(locationId).then(async media => {
      if (media.photos.length > 0 || media.videos.length > 0) {
        setPhotos(media.photos || []);
        setVideos(media.videos || []);
        setMediaLoaded(true);
      } else {
        // No local media — try fetching from cloud
        try {
          const urlMap = await cloudLocSync.fetchLocationMediaUrls([locationId]);
          const cloudMedia = urlMap[locationId]?.loc;
          setPhotos(cloudMedia?.photos || []);
          setVideos(cloudMedia?.videos || []);
        } catch (e) {
          console.error('[EditLocation] cloud media fetch error:', e);
        }
        setMediaLoaded(true);
      }
    }).catch(err => {
      console.error('Error loading location media:', err);
      setMediaLoaded(true);
    });
  }, [locationId]);

  // ─── GPS handlers ─────────────────────────────────────────────────────────

  const getGPS = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported on this device');
      setShowManual(true);
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setGpsLoading(false);
        toast.success('Location updated');
      },
      (err) => {
        console.error('GPS error:', err);
        toast.error('Could not get location. Enter coordinates manually.');
        setGpsLoading(false);
        setShowManual(true);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const applyManualCoords = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast.error('Enter valid latitude (−90 to 90) and longitude (−180 to 180)');
      return;
    }
    setCoords({ latitude: lat, longitude: lng });
    setShowManual(false);
    toast.success('Coordinates saved');
  };

  // ─── Media handlers ───────────────────────────────────────────────────────

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setMediaLoading(true);
    try {
      const b64s = await Promise.all(files.map(f => locMediaDB.fileToBase64(f)));
      setPhotos(prev => [...prev, ...b64s]);
    } catch (err) {
      console.error('Photo capture error:', err);
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
    } catch (err) {
      console.error('Video capture error:', err);
      toast.error('Failed to load video');
    } finally {
      setMediaLoading(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  // ─── Delete — only reachable from edit mode, not the location detail view ──

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteLocation(locationId!);
      toast.success(`"${location?.name}" deleted`);
      navigate(location?.trailId ? `/mountains/${mountainId}/trails/${location.trailId}` : `/mountains/${mountainId}`);
    } catch {
      toast.error('Failed to delete location. Please try again.');
      setIsDeleting(false);
    }
  };

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    // Prevent double-submission
    if (savingRef.current) {
      console.log('[EditLocation] Save already in progress, ignoring duplicate call');
      return;
    }

    // Validate required fields
    if (!nickname.trim()) {
      setValidationErrors({ name: 'Location name is required' });
      toast.error('Please fix the errors before saving');
      return;
    }
    if (!locationType) {
      setValidationErrors({ locationType: 'Please select a location type' });
      toast.error('Please select a location type');
      return;
    }

    // Disable the blocker immediately since we're intentionally saving and navigating
    isNavigatingAfterSaveRef.current = true;

    // Clear any previous validation errors
    setValidationErrors({});
    savingRef.current = true;
    setSaving(true);
    try {
      updateLocation(locationId!, {
        name: nickname.trim(),
        trailName: trailName.trim() || undefined,
        coordinates: coords || undefined,
        notes: notes.trim() || undefined,
        locationType: locationType as any,
      });

      // Only save local data: URLs to IndexedDB (not cloud signed URLs)
      const localPhotos = photos.filter(p => p.startsWith('data:'));
      const localVideos = videos.filter(v => v.startsWith('data:'));
      await locMediaDB.saveLocationMedia(locationId!, { photos: localPhotos, videos: localVideos });

      if (localPhotos.length > 0 || localVideos.length > 0) {
        if (!navigator.onLine) {
          // Offline: queue for upload on reconnect
          cloudLocSync.addPendingLocMedia(locationId!, 'loc');
          toast('📷 Photos saved locally — will sync when back online', { duration: 3000 });
        } else {
          cloudLocSync.uploadLocationMedia(locationId!, { photos: localPhotos, videos: localVideos }, 'loc')
            .then(ok => {
              if (ok) {
                toast.success('Media synced to cloud ☁️', { duration: 2500 });
              } else {
                cloudLocSync.addPendingLocMedia(locationId!, 'loc');
                toast.error('Media upload failed — will retry when reconnected', { duration: 4000 });
              }
            })
            .catch(e => {
              console.error('[EditLocation] cloud upload error:', e);
              cloudLocSync.addPendingLocMedia(locationId!, 'loc');
            });
        }
      }

      toast.success('Location updated');
      // Force synchronous state update before navigation to prevent blocker from triggering
      flushSync(() => {
        setHasUnsavedChanges(false);
      });
      navigate(`/mountains/${mountainId}/locations/${locationId}`);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save. Please try again.');
      isNavigatingAfterSaveRef.current = false; // Re-enable blocker if save failed
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  // Unsaved changes protection
  const { showPrompt, handleSave: handleSaveDialog, handleDiscard, handleCancel } = useUnsavedChanges({
    when: hasUnsavedChanges && !isNavigatingAfterSaveRef.current,
    message: 'You have unsaved changes. Do you want to save before leaving?',
    onSave: handleSave,
  });

  if (!location || !mountain) {
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
              Edit Location
            </h1>
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] truncate">
              {mountain.name}
            </p>
          </div>
          <button onClick={() => setShowDeleteModal(true)}
            className="p-2 bg-[#fff0ee] rounded-[8px] active:bg-[#ffe0da]"
            aria-label="Delete location">
            <Trash2 size={20} className="text-[#ff5c39]" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-5">

        {/* ── Location Details ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">
            Location Details
          </h2>

          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">
              Location Name <span className="text-[#ff5c39]">*</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={e => {
                setNickname(e.target.value);
                // Clear validation error when user starts typing
                if (validationErrors.name) {
                  setValidationErrors({});
                }
              }}
              placeholder="e.g. Top of Chairlift 3"
              className={`w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none ${
                validationErrors.name ? 'border-2 border-[#ff5c39] bg-[#fff5f3]' : ''
              }`}
            />
            {validationErrors.name && (
              <p className="text-[#ff5c39] font-['Inter:Regular',sans-serif] text-[12px] mt-1.5 flex items-center gap-1">
                <span className="inline-block w-1 h-1 rounded-full bg-[#ff5c39]"></span>
                {validationErrors.name}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">
              Trail Name
            </label>
            <input
              type="text"
              list="trail-suggestions-edit"
              value={trailName}
              onChange={e => setTrailName(e.target.value)}
              placeholder="e.g. Upper Meadow"
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none"
            />
            {existingTrails.length > 0 && (
              <datalist id="trail-suggestions-edit">
                {existingTrails.map(t => <option key={t} value={t} />)}
              </datalist>
            )}
          </div>

          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes about this location…"
              rows={3}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-2">
              Location Type <span className="text-[#ff5c39]">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['Install Site', 'Power', 'Start', 'Finish'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setLocationType(t); setValidationErrors(v => ({ ...v, locationType: undefined })); }}
                  className={`h-11 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] transition-colors ${
                    locationType === t ? 'bg-[#ff5c39] text-white' : 'bg-[#f3f3f5] text-[#6a7282] active:bg-[#e8e8ea]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {validationErrors.locationType && (
              <p className="text-[#ef4444] font-['Inter:Regular',sans-serif] text-[12px] mt-1">{validationErrors.locationType}</p>
            )}
          </div>
        </div>

        {/* ── GPS ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-3">
            GPS Coordinates
          </h2>

          {coords ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 bg-[#f0faf4] border border-[#22c55e]/30 rounded-[10px] px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 size={16} className="text-[#22c55e] flex-shrink-0" />
                    <span className="text-[#22c55e] font-['Inter:Medium',sans-serif] font-medium text-[13px]">
                      Location Captured
                    </span>
                  </div>
                  <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]">
                    {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setCoords(null); setShowManual(false); }}
                  className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea] flex-shrink-0"
                >
                  <X size={18} className="text-[#6a7282]" />
                </button>
              </div>
              {/* Update GPS buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={getGPS}
                  disabled={gpsLoading}
                  className="bg-[#f3f3f5] text-[#0a0a0a] rounded-[8px] px-4 py-3 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium active:bg-[#e8e8ea] disabled:opacity-50"
                >
                  {gpsLoading
                    ? <Loader2 size={18} className="animate-spin text-[#6a7282]" />
                    : <RefreshCw size={18} className="text-[#6a7282]" />
                  }
                  {gpsLoading ? 'Updating…' : 'Update GPS'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMapPicker(true)}
                  className="bg-white border border-[#d1d5db] text-[#0a0a0a] rounded-[8px] px-4 py-3 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium active:bg-[#f9fafb]"
                >
                  <Map size={18} className="text-[#6a7282]" />
                  Adjust on Map
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={getGPS}
                disabled={gpsLoading}
                className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-3.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium active:opacity-80 disabled:opacity-50"
              >
                {gpsLoading ? <Loader2 size={20} className="animate-spin" /> : <MapPin size={20} />}
                {gpsLoading ? 'Getting Location…' : 'Get Current Location'}
              </button>

              <button
                type="button"
                onClick={() => setShowMapPicker(true)}
                className="w-full bg-white border border-[#d1d5db] text-[#0a0a0a] rounded-[8px] px-4 py-3.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium active:bg-[#f9fafb]"
              >
                <Map size={20} className="text-[#6a7282]" />
                Select on Map
              </button>

              <button
                type="button"
                onClick={() => setShowManual(v => !v)}
                className="w-full text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] py-1 active:opacity-60"
              >
                {showManual ? 'Hide manual entry' : 'Or enter coordinates manually'}
              </button>

              {showManual && (
                <div className="space-y-2 pt-2">
                  <input type="number" step="any" value={manualLat}
                    onChange={e => setManualLat(e.target.value)}
                    placeholder="Latitude (e.g. 39.5501)"
                    className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none" />
                  <input type="number" step="any" value={manualLng}
                    onChange={e => setManualLng(e.target.value)}
                    placeholder="Longitude (e.g. -106.1914)"
                    className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none" />
                  <button type="button" onClick={applyManualCoords}
                    className="w-full bg-[#0a0a0a] text-white rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium active:opacity-80">
                    Save Coordinates
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Photos ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Photos</h2>
            {photos.length > 0 && (
              <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">{photos.length}</span>
            )}
          </div>

          {!mediaLoaded ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={24} className="animate-spin text-[#6a7282]" />
            </div>
          ) : (
            <>
              {photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                  {photos.map((src, i) => (
                    <div key={i} className="relative flex-shrink-0">
                      <img src={src} alt={`Photo ${i + 1}`} className="w-24 h-24 object-cover rounded-[8px]" />
                      <button
                        type="button"
                        onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-[#0a0a0a] rounded-full flex items-center justify-center active:opacity-60"
                      >
                        <X size={12} className="text-white" strokeWidth={3} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => photoInputRef.current?.click()} disabled={mediaLoading}
                className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-3.5 flex items-center justify-center gap-2 text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium active:bg-[#e8e8ea] disabled:opacity-50">
                {mediaLoading
                  ? <Loader2 size={20} className="animate-spin text-[#6a7282]" />
                  : <Image size={20} className="text-[#6a7282]" />
                }
                Add Photo
              </button>
            </>
          )}
        </div>

        {/* ── Videos ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Videos</h2>
            {videos.length > 0 && (
              <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">{videos.length}</span>
            )}
          </div>

          {!mediaLoaded ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={24} className="animate-spin text-[#6a7282]" />
            </div>
          ) : (
            <>
              {videos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                  {videos.map((src, i) => (
                    <div key={i} className="relative flex-shrink-0">
                      <video src={src} className="w-24 h-24 object-cover rounded-[8px] bg-black" muted playsInline />
                      <button
                        type="button"
                        onClick={() => setVideos(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-[#0a0a0a] rounded-full flex items-center justify-center active:opacity-60"
                      >
                        <X size={12} className="text-white" strokeWidth={3} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => videoInputRef.current?.click()} disabled={mediaLoading}
                className="w-full bg-[#f3f3f5] rounded-[8px] px-4 py-3.5 flex items-center justify-center gap-2 text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium active:bg-[#e8e8ea] disabled:opacity-50">
                {mediaLoading
                  ? <Loader2 size={20} className="animate-spin text-[#6a7282]" />
                  : <Video size={20} className="text-[#6a7282]" />
                }
                Add Video
              </button>
            </>
          )}
        </div>

        {/* ── Save ── */}
        <button type="button" onClick={handleSave} disabled={saving || !mediaLoaded}
          className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-4 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[16px] active:opacity-80 disabled:opacity-50">
          {saving && <Loader2 size={20} className="animate-spin" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>

      </div>

      {/* Unsaved changes dialog */}
      <UnsavedChangesDialog
        isOpen={showPrompt}
        onSave={handleSaveDialog}
        onDiscard={handleDiscard}
        onCancel={handleCancel}
        showSaveButton={!!nickname.trim()}
      />

      {/* Map picker modal */}
      {showMapPicker && (
        <MapPicker
          mountainAddress={mountain?.address}
          initialCoords={coords}
          onSelect={(coords) => {
            setCoords(coords);
            setShowManual(false);
          }}
          onClose={() => setShowMapPicker(false)}
        />
      )}

      {showDeleteModal && (
        <DeleteConfirmModal
          title="Delete Location"
          description={`This will permanently remove "${location?.name}" and its assets/inspections/media.`}
          isDeleting={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}