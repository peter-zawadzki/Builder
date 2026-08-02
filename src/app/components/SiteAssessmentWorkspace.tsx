import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import mapboxgl from 'mapbox-gl';
import { ArrowLeft, Loader2, LocateFixed, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../context/DataContext';
import { getSiteAssessment, updateSiteAssessment, type SiteAssessment } from '../utils/siteAssessmentsApi';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string;

const DEFAULT_CENTER: [number, number] = [-98.35, 39.5]; // continental US, same fallback as Map View
const SATELLITE_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

// Mapbox Geocoding — only used when the mountain has neither a cached
// Mountain.coordinates (from the existing Nominatim-based Map View feature,
// reused here as the first-choice cache per the plan) nor one already
// resolved for this specific assessment. Public token is fine for this;
// there's no secret-scope operation involved in forward geocoding.
async function geocodeWithMapbox(address: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxgl.accessToken}&limit=1`
    );
    const data = await res.json();
    const center = data?.features?.[0]?.center;
    return Array.isArray(center) && center.length === 2 ? [center[0], center[1]] : null;
  } catch {
    return null;
  }
}

export function SiteAssessmentWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getMountainById, getProjectById, updateMountain } = useData();

  const [siteAssessment, setSiteAssessment] = useState<SiteAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [needsManualLocate, setNeedsManualLocate] = useState(false);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const resortCenterRef = useRef<[number, number]>(DEFAULT_CENTER);

  useEffect(() => {
    if (!id) return;
    getSiteAssessment(id)
      .then(res => setSiteAssessment(res.siteAssessment))
      .catch(err => setLoadError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  const mountain = siteAssessment ? getMountainById(siteAssessment.mountain_id) : undefined;
  const project = siteAssessment?.project_id ? getProjectById(siteAssessment.project_id) : undefined;

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
    } as Partial<SiteAssessment>).catch(() => {
      // Non-blocking — viewport save failing shouldn't interrupt the call.
    });
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

      // Resolve the resort's own center regardless (used for "Reset to Resort"
      // even when the current viewport is a saved, possibly-panned-away view).
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
        style: siteAssessment.map_style === 'streets' ? 'mapbox://styles/mapbox/streets-v12' : SATELLITE_STYLE,
        center: center!,
        zoom,
        bearing,
        pitch,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
      map.on('moveend', () => saveViewport(map));
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteAssessment, mountain?.id]);

  async function setCurrentViewAsResortLocation() {
    const map = mapRef.current;
    if (!map || !mountain) return;
    const center = map.getCenter();
    resortCenterRef.current = [center.lng, center.lat];
    await updateMountain(mountain.id, { coordinates: { latitude: center.lat, longitude: center.lng } });
    setNeedsManualLocate(false);
    toast.success(`Saved as ${mountain.name}'s resort location`);
  }

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
        <button onClick={() => navigate('/site-assessments')} className="text-[#307fe2] font-['Inter:Medium',sans-serif] text-[14px]">
          Back to Site Assessments
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] flex flex-col">
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/site-assessments')} className="p-1 active:opacity-60">
          <ArrowLeft size={24} className="text-[#0a0a0a]" />
        </button>
        <div>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">{siteAssessment.name}</h1>
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
            {mountain?.name || 'Unknown mountain'}{project && ` · ${(project as any).name}`} · {siteAssessment.status}
          </p>
        </div>
      </div>

      <div className="flex-1 relative">
        <div ref={mapDivRef} className="absolute inset-0" />

        {locating && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 rounded-full px-4 py-2 flex items-center gap-2 shadow z-10">
            <Search size={14} className="text-[#6a7282] animate-pulse" />
            <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px]">Locating resort…</span>
          </div>
        )}

        {needsManualLocate && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white rounded-[10px] px-4 py-3 shadow-lg z-10 max-w-sm text-center">
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

        <button
          onClick={resetToResort}
          className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-white px-3 py-2 rounded-full shadow-lg text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] active:opacity-70"
        >
          <LocateFixed size={14} /> Reset to Resort
        </button>
      </div>
    </div>
  );
}
