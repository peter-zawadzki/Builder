import * as cloudLocSync from '../utils/cloudLocationSync';
import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, MapPin, Loader2, CheckCircle2, X, Image, Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../context/DataContext';
import * as locMediaDB from '../utils/locationMediaDB';

export function CreateLocation() {
  const { mountainId } = useParams();
  const navigate = useNavigate();
  const { getMountainById, addLocation, getLocationsByMountainId, assets } = useData();

  const mountain = getMountainById(mountainId!);

  const [nickname, setNickname] = useState('');
  const [trailName, setTrailName] = useState('');
  const [notes, setNotes] = useState('');

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [showManual, setShowManual] = useState(false);

  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);

  // Trail name autocomplete from other locations + assets on this mountain
  const existingLocations = getLocationsByMountainId(mountainId!);
  const locationIds = new Set(existingLocations.map(l => l.id));
  const existingTrails = [...new Set([
    ...existingLocations.map(l => l.trailName).filter(Boolean) as string[],
    ...assets.filter(a => locationIds.has(a.locationId) && a.trail).map(a => a.trail as string),
  ])].sort();

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
        toast.success('Location captured');
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

  const handleSave = async () => {
    if (!nickname.trim()) {
      toast.error('Location name is required');
      return;
    }
    setSaving(true);
    try {
      const id = addLocation({
        mountainId: mountainId!,
        name: nickname.trim(),
        trailName: trailName.trim() || undefined,
        coordinates: coords || undefined,
        notes: notes.trim() || undefined,
      });

      if (photos.length > 0 || videos.length > 0) {
        // Always save to IndexedDB first — durable local copy
        await locMediaDB.saveLocationMedia(id, { photos, videos });

        if (!navigator.onLine) {
          // Offline: queue for upload on reconnect
          cloudLocSync.addPendingLocMedia(id, 'loc');
          toast('📷 Photos saved locally — will sync when back online', { duration: 3000 });
        } else {
          cloudLocSync.uploadLocationMedia(id, { photos, videos }, 'loc')
            .then(ok => {
              if (ok) {
                toast.success('Photos synced to cloud ☁️', { duration: 2500 });
              } else {
                // Upload failed — queue for retry on next reconnect
                cloudLocSync.addPendingLocMedia(id, 'loc');
                toast.error('Photo upload failed — will retry when reconnected', { duration: 4000 });
              }
            })
            .catch(e => {
              console.error('[CreateLocation] cloud upload error:', e);
              cloudLocSync.addPendingLocMedia(id, 'loc');
            });
        }
      }

      toast.success('Location added');
      navigate(`/mountains/${mountainId}/locations/${id}`);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save location. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!mountain) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">Mountain not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F3F5] pb-8">
      {/* Hidden file inputs */}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
        multiple className="hidden" onChange={handlePhotoCapture} />
      <input ref={videoInputRef} type="file" accept="video/*" capture="environment"
        className="hidden" onChange={handleVideoCapture} />

      {/* Header */}
      <div className="bg-white border-b border-[rgba(29,41,48,0.08)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#1D2930]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[18px]">
              Add Location
            </h1>
            <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px] truncate">
              {mountain.name}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-5">

        {/* ── Location Details ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-4 space-y-4">
          <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[15px]">
            Location Details
          </h2>

          <div>
            <label className="block text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px] mb-1">
              Location Name <span className="text-[#F95C39]">*</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="e.g. Top of Chairlift 3"
              autoFocus
              className="w-full bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#1D2930] font-['Inter:Regular',sans-serif] text-[15px] outline-none"
            />
          </div>

          <div>
            <label className="block text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px] mb-1">
              Trail Name
            </label>
            <input
              type="text"
              list="trail-suggestions"
              value={trailName}
              onChange={e => setTrailName(e.target.value)}
              placeholder="e.g. Upper Meadow"
              className="w-full bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#1D2930] font-['Inter:Regular',sans-serif] text-[15px] outline-none"
            />
            {existingTrails.length > 0 && (
              <datalist id="trail-suggestions">
                {existingTrails.map(t => <option key={t} value={t} />)}
              </datalist>
            )}
          </div>

          <div>
            <label className="block text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px] mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes about this location…"
              rows={3}
              className="w-full bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#1D2930] font-['Inter:Regular',sans-serif] text-[15px] outline-none resize-none"
            />
          </div>
        </div>

        {/* ── GPS ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-4">
          <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-3">
            GPS Coordinates
          </h2>

          {coords ? (
            <div className="flex items-start gap-3">
              <div className="flex-1 bg-[#f0faf4] border border-[#22c55e]/30 rounded-[10px] px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={16} className="text-[#22c55e] flex-shrink-0" />
                  <span className="text-[#22c55e] font-['Inter:Medium',sans-serif] font-medium text-[13px]">
                    Location Captured
                  </span>
                </div>
                <p className="text-[#1D2930] font-['Inter:Regular',sans-serif] text-[14px]">
                  {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setCoords(null); setShowManual(false); }}
                className="p-2 bg-[#F2F3F5] rounded-[8px] active:bg-[#E8E9EA] flex-shrink-0"
              >
                <X size={18} className="text-[#6D7B83]" />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={getGPS}
                disabled={gpsLoading}
                className="w-full bg-[#F95C39] text-white rounded-[10px] px-4 py-3.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium active:opacity-80 disabled:opacity-50"
              >
                {gpsLoading ? <Loader2 size={20} className="animate-spin" /> : <MapPin size={20} />}
                {gpsLoading ? 'Getting Location…' : 'Get Current Location'}
              </button>

              <button
                type="button"
                onClick={() => setShowManual(v => !v)}
                className="w-full text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[14px] py-1 active:opacity-60"
              >
                Enter coordinates manually
              </button>

              {showManual && (
                <div className="space-y-2">
                  <input type="number" step="any" value={manualLat}
                    onChange={e => setManualLat(e.target.value)}
                    placeholder="Latitude (e.g. 39.5501)"
                    className="w-full bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#1D2930] font-['Inter:Regular',sans-serif] text-[15px] outline-none" />
                  <input type="number" step="any" value={manualLng}
                    onChange={e => setManualLng(e.target.value)}
                    placeholder="Longitude (e.g. -106.1914)"
                    className="w-full bg-[#F2F3F5] rounded-[8px] px-3 py-3 text-[#1D2930] font-['Inter:Regular',sans-serif] text-[15px] outline-none" />
                  <button type="button" onClick={applyManualCoords}
                    className="w-full bg-[#1D2930] text-white rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium active:opacity-80">
                    Save Coordinates
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Photos ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Photos</h2>
            {photos.length > 0 && (
              <span className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px]">{photos.length}</span>
            )}
          </div>
          {photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
              {photos.map((src, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img src={src} alt={`Photo ${i + 1}`} className="w-20 h-20 object-cover rounded-[8px]" />
                  <button type="button" onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#1D2930] rounded-full flex items-center justify-center active:opacity-60">
                    <X size={10} className="text-white" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => photoInputRef.current?.click()} disabled={mediaLoading}
            className="w-full bg-[#F2F3F5] rounded-[8px] px-4 py-3.5 flex items-center justify-center gap-2 text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium active:bg-[#E8E9EA] disabled:opacity-50">
            {mediaLoading ? <Loader2 size={20} className="animate-spin text-[#6D7B83]" /> : <Image size={20} className="text-[#6D7B83]" />}
            Add Photo
          </button>
        </div>

        {/* ── Videos ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Videos</h2>
            {videos.length > 0 && (
              <span className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px]">{videos.length}</span>
            )}
          </div>
          {videos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
              {videos.map((src, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <video src={src} className="w-20 h-20 object-cover rounded-[8px] bg-black" muted playsInline />
                  <button type="button" onClick={() => setVideos(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#1D2930] rounded-full flex items-center justify-center active:opacity-60">
                    <X size={10} className="text-white" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => videoInputRef.current?.click()} disabled={mediaLoading}
            className="w-full bg-[#F2F3F5] rounded-[8px] px-4 py-3.5 flex items-center justify-center gap-2 text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium active:bg-[#E8E9EA] disabled:opacity-50">
            {mediaLoading ? <Loader2 size={20} className="animate-spin text-[#6D7B83]" /> : <Video size={20} className="text-[#6D7B83]" />}
            Add Video
          </button>
        </div>

        {/* ── Save ── */}
        <button type="button" onClick={handleSave} disabled={saving}
          className="w-full bg-[#F95C39] text-white rounded-[10px] px-4 py-4 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[16px] active:opacity-80 disabled:opacity-50">
          {saving && <Loader2 size={20} className="animate-spin" />}
          {saving ? 'Saving…' : 'Save Location'}
        </button>

      </div>
    </div>
  );
}