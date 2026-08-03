// Shared between SiteAssessmentWorkspace (the deep virtual-inspection
// workspace) and MountainMapView (the quick overview map) — both let you
// drop the same device types on a map, and both create real Location
// records (Location.deviceType/deviceProperties), not a separate schema.
import { renderToStaticMarkup } from 'react-dom/server';
import { Server, Wifi, Zap, Building2, MapPin, Camera as CameraIcon, Flag } from 'lucide-react';

export type DeviceType = 'camera' | 'server' | 'network' | 'power' | 'building' | 'misc' | 'startfinish';

export interface CameraProperties {
  heading: number;        // compass bearing, 0-359 (0 = North)
  horizontalFov: number;  // degrees
  rangeMeters: number;    // estimated coverage distance
  networkConnection?: 'Hard Wired' | 'VLAN Connection' | 'Wireless Link';
  // Per-camera color for the marker + coverage cone — cameras often overlap,
  // so a shared fixed color makes adjacent cones impossible to tell apart.
  color?: string;
  // Same Existing/Needed + voltage choice as a standalone Power Source —
  // a camera needs power too, and callers often want to note that inline
  // rather than placing a separate Power marker right next to it.
  powerStatus?: 'Existing' | 'Needed';
  powerVoltage?: '120V' | '480V';
}

export interface NetworkItem {
  subtype: string;
  status: 'Required' | 'Existing';
}

export interface NetworkProperties {
  items?: NetworkItem[];
  networkConnection?: 'Hard Wired' | 'VLAN Connection' | 'Wireless Link';
}

export const DEFAULT_CAMERA_PROPS: CameraProperties = { heading: 0, horizontalFov: 10, rangeMeters: 600 * 0.3048, color: '#f43f5e' };
export const NETWORK_CONNECTION_TYPES = ['Hard Wired', 'VLAN Connection', 'Wireless Link'];
// A single Network Device marker often represents a rack/cabinet with
// several distinct pieces of gear at once (e.g. a Switch that already exists
// plus Wireless still needed) — see NetworkItem above — rather than exactly
// one subtype.
export const NETWORK_SUBTYPES = ['Internet', 'Switch', 'Wireless', 'Gateway'];
export const CAMERA_COLOR_PRESETS = ['#f43f5e', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

export const DEVICE_TYPE_CONFIG: Record<DeviceType, { label: string; color: string; Icon: typeof Server }> = {
  camera: { label: 'Camera', color: '#f43f5e', Icon: CameraIcon },
  server: { label: 'Server', color: '#6366f1', Icon: Server },
  network: { label: 'Network Device', color: '#0ea5e9', Icon: Wifi },
  power: { label: 'Power Source', color: '#f59e0b', Icon: Zap },
  building: { label: 'Building', color: '#64748b', Icon: Building2 },
  misc: { label: 'Miscellaneous', color: '#94a3b8', Icon: MapPin },
  // Course marker — actual marker color follows Location.locationType
  // ('Start' green / 'Finish' red) rather than this fixed color, which is
  // only used for the toolbar button itself.
  startfinish: { label: 'Start/Finish', color: '#22c55e', Icon: Flag },
};
export const DEVICE_TYPES: DeviceType[] = ['camera', 'server', 'network', 'power', 'building', 'misc', 'startfinish'];
export const START_FINISH_COLORS: Record<'Start' | 'Finish', string> = { Start: '#22c55e', Finish: '#ef4444' };

export function createDeviceMarkerElement(type: DeviceType, isSelected: boolean, colorOverride?: string) {
  const config = DEVICE_TYPE_CONFIG[type] || DEVICE_TYPE_CONFIG.misc;
  const el = document.createElement('div');
  el.style.cssText = `
    width: 28px; height: 28px; border-radius: 50%;
    background: ${colorOverride ?? config.color}; border: 2px solid white;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.35);
    cursor: pointer;
    ${isSelected ? 'outline: 3px solid #ff5c39; outline-offset: 2px;' : ''}
  `;
  el.innerHTML = renderToStaticMarkup(<config.Icon size={16} color="white" strokeWidth={2.5} />);
  return el;
}

// Directional — a triangle pointing "up" so setRotation(heading) (with
// rotationAlignment: 'map') visually aims it, staying geographically
// accurate regardless of map bearing since Mapbox handles that rotation.
//
// The triangle itself is drawn via CSS borders with a 0x0 content box, which
// makes its actual clickable/draggable hit-box exactly the visual 26x26
// triangle — easy to miss by a few pixels, at which point the click falls
// through to the map canvas underneath and pans the map instead of dragging
// the marker. Wrapping it in a larger invisible hit-area (matching the other
// device markers' comfortable touch-target size) fixes that.
export function createCameraMarkerElement(isSelected: boolean, color: string = DEVICE_TYPE_CONFIG.camera.color) {
  const hit = document.createElement('div');
  hit.style.cssText = `
    width: 40px; height: 40px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  `;
  const triangle = document.createElement('div');
  triangle.style.cssText = `
    width: 0; height: 0;
    border-left: 13px solid transparent; border-right: 13px solid transparent;
    border-bottom: 26px solid ${color};
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4));
    ${isSelected ? 'outline: 2px dashed #ff5c39; outline-offset: 4px;' : ''}
  `;
  hit.appendChild(triangle);
  return hit;
}
