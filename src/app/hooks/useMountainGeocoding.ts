import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import type { Mountain } from '../context/DataContext';

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

// Module-level (not per-hook-instance) so the background pass kicked off
// from MountainsList and a concurrent pass from an open AllMountainsMapView
// never geocode the same mountain twice in parallel.
const inFlight = new Set<string>();

// Geocodes (via Nominatim, no API key) any mountain missing cached
// coordinates, one at a time with a ~1.1s gap to respect Nominatim's usage
// policy (max ~1 req/sec), persisting each result onto the Mountain record
// as it resolves so it's never re-geocoded again. Multiple components can
// use this hook concurrently (e.g. MountainsList runs it silently in the
// background as soon as the list loads, so by the time someone opens Map
// View most mountains are likely already resolved) without duplicating work.
export function useMountainGeocoding(mountains: Mountain[]) {
  const { updateMountain } = useData();
  const [resolvedCoords, setResolvedCoords] = useState<Record<string, { latitude: number; longitude: number }>>({});
  const [geocodedCount, setGeocodedCount] = useState(0);

  const totalToGeocode = mountains.filter(m => !m.coordinates && m.address && !inFlight.has(m.id)).length
    + mountains.filter(m => !m.coordinates && m.address && inFlight.has(m.id) && !resolvedCoords[m.id]).length;

  useEffect(() => {
    let cancelled = false;
    const needsGeocode = mountains.filter(m => !m.coordinates && m.address && !inFlight.has(m.id));
    if (needsGeocode.length === 0) return;
    needsGeocode.forEach(m => inFlight.add(m.id));

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
          // Skip on failure — will just retry next time this hook runs.
        } finally {
          inFlight.delete(m.id);
        }
        if (!cancelled) setGeocodedCount(c => c + 1);
        await new Promise(r => setTimeout(r, 1100));
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountains]);

  return { resolvedCoords, geocodedCount, totalToGeocode };
}
