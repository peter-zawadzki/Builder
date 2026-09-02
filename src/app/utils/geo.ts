// Small self-contained spherical-earth geo helpers — just enough for camera
// heading/coverage-cone math. Deliberately not pulling in @turf/turf for
// this alone; that's added in a later phase for annotations/measurements,
// where its fuller feature set actually earns its weight.
const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function destinationPoint(lat: number, lng: number, bearingDeg: number, distanceMeters: number): [number, number] {
  const δ = distanceMeters / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [((toDeg(λ2) + 540) % 360) - 180, toDeg(φ2)]; // [lng, lat]
}

export function bearingBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function distanceBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compassLabel(headingDeg: number): string {
  return COMPASS_POINTS[Math.round(headingDeg / 22.5) % 16];
}

// Builds a 2D coverage-cone polygon (camera point + an arc from
// heading-hFov/2 to heading+hFov/2 at `rangeMeters`), in [lng, lat] pairs
// suitable for a GeoJSON Polygon. Purely geometric — no terrain/obstruction
// awareness (explicitly deferred, per spec, to a future phase).
export function buildCoverageCone(lat: number, lng: number, headingDeg: number, hFovDeg: number, rangeMeters: number, steps = 24): [number, number][] {
  const half = hFovDeg / 2;
  const points: [number, number][] = [[lng, lat]];
  for (let i = 0; i <= steps; i++) {
    const bearing = headingDeg - half + (hFovDeg * i) / steps;
    points.push(destinationPoint(lat, lng, bearing, rangeMeters));
  }
  points.push([lng, lat]);
  return points;
}

export const METERS_PER_FOOT = 0.3048;

// Camera coverage fill only shades the outer band of the cone (the last
// 600ft of range) rather than the whole wedge — a longer range means better
// detection at distance, not necessarily useful detail near the lens, so
// shading only the far band communicates that at a glance. The cone's full
// pie-wedge outline (buildCoverageCone) is still drawn at full range so the
// heading/FOV shape stays visible regardless of fill depth.
export const CAMERA_COVERAGE_FILL_DEPTH_FT = 600;

// Annular-sector (ring-wedge) polygon: the same pie wedge as
// buildCoverageCone, but with the portion closer than innerRangeMeters cut
// out. When innerRangeMeters <= 0 (range at or under the fill depth) this
// degenerates to the identical full pie wedge buildCoverageCone returns.
export function buildCoverageAnnulus(
  lat: number, lng: number, headingDeg: number, hFovDeg: number,
  outerRangeMeters: number, innerRangeMeters: number, steps = 24
): [number, number][] {
  const half = hFovDeg / 2;
  const outer: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = headingDeg - half + (hFovDeg * i) / steps;
    outer.push(destinationPoint(lat, lng, bearing, outerRangeMeters));
  }
  if (innerRangeMeters <= 0) {
    return [[lng, lat], ...outer, [lng, lat]];
  }
  const inner: [number, number][] = [];
  for (let i = steps; i >= 0; i--) {
    const bearing = headingDeg - half + (hFovDeg * i) / steps;
    inner.push(destinationPoint(lat, lng, bearing, innerRangeMeters));
  }
  return [...outer, ...inner, outer[0]];
}

// Google/Mapbox encoded-polyline algorithm (precision 5) — encodes [lng, lat]
// pairs into the compact string Mapbox Static Images API `path` overlays
// expect. Used instead of a raw GeoJSON overlay so a trail with several
// camera coverage cones stays well under the Static Images API's URL length
// limit (a GeoJSON overlay runs ~5x longer for the same geometry).
export function encodePolyline(points: [number, number][], precision = 5): string {
  const factor = 10 ** precision;
  let output = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const [lng, lat] of points) {
    const lat5 = Math.round(lat * factor);
    const lng5 = Math.round(lng * factor);
    output += encodeSignedNumber(lat5 - prevLat) + encodeSignedNumber(lng5 - prevLng);
    prevLat = lat5;
    prevLng = lng5;
  }
  return output;
}

function encodeSignedNumber(num: number): string {
  let sgnNum = num << 1;
  if (num < 0) sgnNum = ~sgnNum;
  let out = '';
  while (sgnNum >= 0x20) {
    out += String.fromCharCode((0x20 | (sgnNum & 0x1f)) + 63);
    sgnNum >>= 5;
  }
  out += String.fromCharCode(sgnNum + 63);
  return out;
}

// The Static Images API (used for the proposal/order map addendum) has no
// click-to-separate or zoom-based clustering like the live Mapbox GL map, so
// multiple devices sharing (or nearly sharing) one spot — several items
// mounted on the same pole/building, or a camera's own 480V warning pin,
// which sits at the camera's exact coordinate — simply render on top of
// each other with no way to tell them apart. Groups pins within a few
// meters of each other and nudges each into a small ring around their
// shared center so every one stays visible and distinguishable.
export function spreadOverlappingPins<T extends { lat: number; lng: number }>(items: T[]): T[] {
  const METERS_PER_DEG_LAT = 111320;
  const PROXIMITY_METERS = 5;
  const SPREAD_RADIUS_METERS = 6;

  const groups: T[][] = [];
  const used = new Set<number>();
  items.forEach((item, i) => {
    if (used.has(i)) return;
    const group = [item];
    used.add(i);
    const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((item.lat * Math.PI) / 180);
    items.forEach((other, j) => {
      if (used.has(j) || i === j) return;
      const dLat = (other.lat - item.lat) * METERS_PER_DEG_LAT;
      const dLng = (other.lng - item.lng) * metersPerDegLng;
      if (Math.sqrt(dLat * dLat + dLng * dLng) < PROXIMITY_METERS) {
        group.push(other);
        used.add(j);
      }
    });
    groups.push(group);
  });

  const result: T[] = [];
  groups.forEach(group => {
    if (group.length === 1) { result.push(group[0]); return; }
    const centerLat = group.reduce((s, g) => s + g.lat, 0) / group.length;
    const centerLng = group.reduce((s, g) => s + g.lng, 0) / group.length;
    const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180);
    group.forEach((g, idx) => {
      const angle = (2 * Math.PI * idx) / group.length;
      const dLat = (SPREAD_RADIUS_METERS * Math.sin(angle)) / METERS_PER_DEG_LAT;
      const dLng = (SPREAD_RADIUS_METERS * Math.cos(angle)) / metersPerDegLng;
      result.push({ ...g, lat: centerLat + dLat, lng: centerLng + dLng });
    });
  });
  return result;
}
