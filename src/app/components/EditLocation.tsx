import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, MapPin, Loader2, CheckCircle2, X, Image, Video, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../context/DataContext';
import * as locMediaDB from '../utils/locationMediaDB';
import * as cloudLocSync from '../utils/cloudLocationSync';

export function EditLocation() {
  const { mountainId, locationId } = useParams();
  const navigate = useNavigate();
  const { getMountainById, getLocationById, updateLocation, getMountainTrailNames } = useData();

  const mountain = getMountainById(mountainId!);
  const location = getLocationById(locationId!);

  // ─── Text fields ────────────────────────────────────────────────────────────
  const [nickname, setNickname] = useState(location?.name || '');
  const [trailName, setTrailName] = useState(location?.trailName || '');
  const [notes, setNotes] = useState(location?.notes || '');

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

  const [saving, setSaving] = useState(false);

  // Trail suggestions — mountain-wide
  const existingTrails = getMountainTrailNames(mountainId!);

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

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!nickname.trim()) {
      toast.error('Location name is required');
      return;
    }
    setSaving(true);
    try {
      updateLocation(locationId!, {
        name: nickname.trim(),
        trailName: trailName.trim() || undefined,
        coordinates: coords || undefined,
        notes: notes.trim() || undefined,
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
      navigate(`/mountains/${mountainId}/locations/${locationId}`);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

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
              onChange={e => setNickname(e.target.value)}
              placeholder="e.g. Top of Chairlift 3"
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none"
            />
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
              {/* Update GPS button */}
              <button
                type="button"
                onClick={getGPS}
                disabled={gpsLoading}
                className="w-full bg-[#f3f3f5] text-[#0a0a0a] rounded-[8px] px-4 py-3 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium active:bg-[#e8e8ea] disabled:opacity-50"
              >
                {gpsLoading
                  ? <Loader2 size={18} className="animate-spin text-[#6a7282]" />
                  : <RefreshCw size={18} className="text-[#6a7282]" />
                }
                {gpsLoading ? 'Updating…' : 'Update GPS'}
              </button>
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
                onClick={() => setShowManual(v => !v)}
                className="w-full text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px] py-1 active:opacity-60"
              >
                Enter coordinates manually
              </button>

              {showManual && (
                <div className="space-y-2">
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
    </div>
  );
}