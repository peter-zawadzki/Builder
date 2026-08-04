import { useEffect } from 'react';

const DEFAULT_VIEWPORT = 'width=device-width, initial-scale=1.0';
const LOCKED_VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

/**
 * Disables page-level pinch-zoom while a full-screen map view is mounted.
 * iOS Safari has a long-standing bug where, if the page was ever pinch-
 * zoomed (even slightly, even by accident), rotating the device landscape
 * and back to portrait leaves the viewport's zoom/scroll-offset state out of
 * sync with its actual dimensions — the page renders zoomed in with no way
 * to pinch back out, and absolutely-positioned UI (like a corner button) ends
 * up off-screen. Locking zoom on map screens (Mapbox handles its own pinch-
 * to-zoom-the-map gesture internally regardless) avoids the browser-level
 * gesture entirely. Restores the page's normal zoomable viewport on unmount.
 */
export function useLockViewportZoom() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const previous = meta.getAttribute('content') ?? DEFAULT_VIEWPORT;
    meta.setAttribute('content', LOCKED_VIEWPORT);
    return () => meta.setAttribute('content', previous);
  }, []);
}
