// Client for the Site Assessment backend — a dedicated, real-Postgres-table
// API (server/routes/siteAssessments.ts), NOT the generic /api/legacy
// JSONB-blob collection pattern the rest of this app's data mostly uses.
// mountain_id/project_id are soft references (see migration
// 0012_site_assessments.sql) into the legacy_records mountains/projects the
// app already has loaded via DataContext — this module doesn't resolve
// those names itself, callers do via getMountainById/getProjectById.
import { getAuthToken } from '../context/DataContext';

const BASE = '/api/site-assessments';

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const response = await fetch(`${BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token ?? ''}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      errorMsg = body.error || body.message || errorMsg;
    } catch {
      try {
        const text = await response.text();
        if (text) errorMsg = text.slice(0, 200);
      } catch { /* ignore */ }
    }
    throw new Error(errorMsg);
  }
  return response.json();
}

export interface SiteAssessment {
  id: string;
  mountain_id: string;
  project_id: string | null;
  name: string;
  status: string;
  inspection_type: string | null;
  description: string | null;
  general_notes: string | null;
  inspection_date: string | null;
  resort_representative_name: string | null;
  resort_representative_title: string | null;
  resort_representative_email: string | null;
  map_center_lat: number | null;
  map_center_lng: number | null;
  map_zoom: number | null;
  map_bearing: number | null;
  map_pitch: number | null;
  map_style: string;
  created_by: string | null;
  updated_by: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  object_count: number;
  open_action_item_count: number;
}

export async function listSiteAssessments(): Promise<SiteAssessment[]> {
  const res = await apiCall('/');
  return res.siteAssessments;
}

export async function getSiteAssessment(id: string) {
  return apiCall(`/${id}`);
}

export async function createSiteAssessment(data: {
  name: string;
  mountain_id: string;
  project_id?: string;
  inspection_type?: string;
  inspection_date?: string;
  description?: string;
  resort_representative_name?: string;
  resort_representative_title?: string;
  resort_representative_email?: string;
  general_notes?: string;
}): Promise<SiteAssessment> {
  const res = await apiCall('/', { method: 'POST', body: JSON.stringify(data) });
  return res.siteAssessment;
}

export async function updateSiteAssessment(id: string, data: Partial<SiteAssessment>): Promise<SiteAssessment> {
  const res = await apiCall(`/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  return res.siteAssessment;
}

export async function archiveSiteAssessment(id: string): Promise<void> {
  await apiCall(`/${id}`, { method: 'DELETE' });
}

// ── Map objects (Phase 3+) ────────────────────────────────────────────────

export type ObjectType = 'camera' | 'server' | 'network' | 'power' | 'building' | 'misc';

// Camera-specific fields, stored in SiteAssessmentObject.properties_json —
// not real columns, since only cameras need them (spec's "object-specific
// configuration should be stored separately from common object properties").
export interface CameraProperties {
  heading: number;        // compass bearing, 0-359 (0 = North)
  horizontalFov: number;  // degrees
  verticalFov?: number;   // degrees
  rangeMeters: number;    // estimated coverage distance
  mountingHeightFt?: number;
  tilt?: number;          // degrees
  model?: string;
  lens?: string;
  resolution?: string;
  mountingType?: string;
  powerSource?: string;
  networkConnection?: string;
}

export interface SiteAssessmentObject {
  id: string;
  site_assessment_id: string;
  trail_id: string | null;
  object_type: ObjectType | string;
  object_subtype: string | null;
  name: string;
  description: string | null;
  geometry_json: { type: 'Point'; coordinates: [number, number] };
  latitude: number | null;
  longitude: number | null;
  elevation: number | null;
  status: string | null;
  verification_status: string;
  properties_json: Record<string, unknown>;
  notes: string | null;
  is_hidden: boolean;
  is_locked: boolean;
  display_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export async function createObject(
  assessmentId: string,
  data: {
    object_type: ObjectType;
    object_subtype?: string;
    name: string;
    latitude: number;
    longitude: number;
    trail_id?: string;
    properties_json?: Record<string, unknown>;
  }
): Promise<SiteAssessmentObject> {
  const res = await apiCall(`/${assessmentId}/objects`, {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      geometry_json: { type: 'Point', coordinates: [data.longitude, data.latitude] },
    }),
  });
  return res.object;
}

export async function updateObject(
  assessmentId: string,
  objectId: string,
  data: Partial<SiteAssessmentObject> & { latitude?: number; longitude?: number }
): Promise<SiteAssessmentObject> {
  const body: any = { ...data };
  if (data.latitude != null && data.longitude != null) {
    body.geometry_json = { type: 'Point', coordinates: [data.longitude, data.latitude] };
  }
  const res = await apiCall(`/${assessmentId}/objects/${objectId}`, { method: 'PUT', body: JSON.stringify(body) });
  return res.object;
}

export async function deleteObject(assessmentId: string, objectId: string): Promise<void> {
  await apiCall(`/${assessmentId}/objects/${objectId}`, { method: 'DELETE' });
}
