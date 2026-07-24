// The Geolocation API is restricted to secure contexts (HTTPS, or localhost)
// on mobile browsers — over plain HTTP (e.g. a bare IP), it either doesn't
// prompt at all or fails immediately, which previously surfaced as a vague
// "could not get location" error indistinguishable from an actual GPS/signal
// problem. Checking this upfront lets callers show an accurate message
// instead. Resolved once the app is served over HTTPS.
export function isGeolocationBlockedByInsecureContext(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.geolocation && !window.isSecureContext;
}

export const INSECURE_CONTEXT_LOCATION_MESSAGE =
  'Location access needs a secure (https) connection, which this site doesn\'t have yet — enter coordinates manually for now.';
