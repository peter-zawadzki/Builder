import mapboxgl from 'mapbox-gl';

// Shared by every Mapbox-based map in the app (SiteAssessmentWorkspace,
// MountainMapView) — only used when the mountain has no cached
// Mountain.coordinates yet. Public token is fine for this; there's no
// secret-scope operation involved in forward geocoding.
export async function geocodeWithMapbox(address: string): Promise<[number, number] | null> {
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
