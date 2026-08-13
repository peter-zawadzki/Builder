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
