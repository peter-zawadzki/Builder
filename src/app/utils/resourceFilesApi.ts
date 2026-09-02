// Client for the Resource Center's uploaded-files backend
// (server/routes/resourceFiles.ts) — Training Materials, Sales Tools, and
// Marketing Assets tabs. Mirrors mountainConnectionsApi.ts's shape: its own
// tiny apiCall, not DataContext's syncOrQueue/legacy-records pattern.
import { getAuthToken } from '../context/DataContext';

const BASE = '/api/resource-files';

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

export type ResourceFileCategory = 'training' | 'sales' | 'marketing';

export interface ResourceFile {
  id: string;
  name: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number | null;
  createdAt: string;
  url: string;
  thumbnailUrl: string | null;
}

export async function listResourceFiles(category: ResourceFileCategory): Promise<ResourceFile[]> {
  const res = await apiCall(`?category=${category}`);
  return res.files;
}

export async function uploadResourceFile(data: {
  category: ResourceFileCategory;
  name: string;
  dataUrl: string;
  fileName: string;
  mimeType: string;
  thumbnailDataUrl?: string;
}): Promise<{ id: string }> {
  const res = await apiCall('', { method: 'POST', body: JSON.stringify(data) });
  return res.file;
}

export async function renameResourceFile(id: string, name: string): Promise<void> {
  await apiCall(`/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

export async function deleteResourceFile(id: string): Promise<void> {
  await apiCall(`/${id}`, { method: 'DELETE' });
}
