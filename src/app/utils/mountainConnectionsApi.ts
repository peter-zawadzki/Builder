// Client for the mountain-connections backend — a dedicated, real-Postgres-table
// API (server/routes/mountainConnections.ts), NOT the generic /api/legacy
// JSONB-blob pattern DataContext's Location/Trail/etc. calls use (verified:
// DataContext's addLocation -> syncOrQueue('/locations',...) -> apiCall()
// actually hits /api/legacy/locations, not server/routes/locations.ts).
// Mirrors siteAssessmentsApi.ts's shape exactly. mountain_id/trail_id are
// soft references into the legacy_records mountains/trails DataContext
// already has loaded — callers resolve names themselves via
// getMountainById/getTrailById, this module doesn't.
import { getAuthToken } from '../context/DataContext';

const BASE = '/api/mountain-connections';

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

export type ConnectionType = 'wireless' | 'poe' | '120v';

export interface MountainConnection {
  id: string;
  mountain_id: string;
  trail_id: string | null;
  name: string;
  connection_type: ConnectionType;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number;
  end_longitude: number;
  difficulty: number | null;
  is_locked: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export async function listConnections(mountainId: string): Promise<MountainConnection[]> {
  const res = await apiCall(`?mountainId=${encodeURIComponent(mountainId)}`);
  return res.connections;
}

export async function createConnection(data: {
  mountain_id: string;
  trail_id?: string;
  name: string;
  connection_type: ConnectionType;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number;
  end_longitude: number;
  difficulty?: number;
}): Promise<MountainConnection> {
  const res = await apiCall('', { method: 'POST', body: JSON.stringify(data) });
  return res.connection;
}

export async function updateConnection(id: string, data: Partial<MountainConnection>): Promise<MountainConnection> {
  const res = await apiCall(`/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  return res.connection;
}

export async function deleteConnection(id: string): Promise<void> {
  await apiCall(`/${id}`, { method: 'DELETE' });
}
