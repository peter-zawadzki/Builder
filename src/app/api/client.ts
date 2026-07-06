import { useAuth } from "@clerk/clerk-react";
import { useMemo } from "react";

// Authenticated client for the local API. Attaches the Clerk session token as a
// Bearer header; requests go to /api (proxied to the Hono server in dev, same
// origin in prod). This is the data layer the new-model screens run on.

export interface MountainSummary {
  id: string;
  name: string;
  address: string | null;
  region: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: string;
  project_stage: string | null;
  is_stalled: boolean | null;
  trail_count: number;
  location_count: number;
  asset_count: number;
  note_count: number;
}

export interface Mountain {
  id: string;
  name: string;
  address: string | null;
  region: string | null;
  legal_entity: string | null;
  billing_address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  acreage: number | null;
  vertical_drop: number | null;
  trail_count_stated: number | null;
  ip_subnet: string | null;
  timing_systems: string[] | null;
  status: string;
  notes: string | null;
}

export interface MountainInput {
  name: string;
  address?: string | null;
  region?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  legal_entity?: string | null;
  billing_address?: string | null;
  notes?: string | null;
  status?: string;
}

export interface Trail {
  id: string;
  mountain_id: string;
  name: string;
  notes: string | null;
  is_nastar: boolean;
  location_count?: number;
}

export interface Location {
  id: string;
  mountain_id: string;
  trail_id: string | null;
  trail_name?: string | null;
  name: string;
  difficulty: number | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  asset_count?: number;
  inspection_count?: number;
}

export interface Inspection {
  id: string;
  location_id: string;
  items: any[];
  notes: string | null;
  created_at: string;
}

export function useApi() {
  const { getToken } = useAuth();

  return useMemo(() => {
    async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
      const token = await getToken();
      const res = await fetch(`/api${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
          ...(options.headers ?? {}),
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      return res.json();
    }

    return {
      me: () => request("/me"),
      listMountains: () => request<{ mountains: MountainSummary[] }>("/mountains"),
      getMountain: (id: string) =>
        request<{ mountain: Mountain; project: any }>(`/mountains/${id}`),
      createMountain: (data: MountainInput) =>
        request<{ mountain: Mountain }>("/mountains", { method: "POST", body: JSON.stringify(data) }),
      updateMountain: (id: string, data: Partial<MountainInput>) =>
        request<{ mountain: Mountain }>(`/mountains/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      deleteMountain: (id: string) =>
        request<{ ok: true }>(`/mountains/${id}`, { method: "DELETE" }),

      // Trails
      listTrails: (mountainId: string) =>
        request<{ trails: Trail[] }>(`/trails?mountainId=${mountainId}`),
      getTrail: (id: string) => request<{ trail: Trail; locations: Location[] }>(`/trails/${id}`),
      createTrail: (data: { mountain_id: string; name: string; notes?: string; is_nastar?: boolean }) =>
        request<{ trail: Trail }>("/trails", { method: "POST", body: JSON.stringify(data) }),
      updateTrail: (id: string, data: Partial<Trail>) =>
        request<{ trail: Trail }>(`/trails/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      deleteTrail: (id: string) => request<{ ok: true }>(`/trails/${id}`, { method: "DELETE" }),

      // Locations
      listLocations: (params: { mountainId?: string; trailId?: string }) => {
        const qs = params.trailId ? `trailId=${params.trailId}` : `mountainId=${params.mountainId}`;
        return request<{ locations: Location[] }>(`/locations?${qs}`);
      },
      getLocation: (id: string) =>
        request<{ location: Location; inspections: Inspection[] }>(`/locations/${id}`),
      createLocation: (data: Partial<Location> & { mountain_id: string; name: string }) =>
        request<{ location: Location }>("/locations", { method: "POST", body: JSON.stringify(data) }),
      updateLocation: (id: string, data: Partial<Location>) =>
        request<{ location: Location }>(`/locations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      deleteLocation: (id: string) => request<{ ok: true }>(`/locations/${id}`, { method: "DELETE" }),
      addInspection: (locationId: string, data: { items: any[]; notes?: string }) =>
        request<{ inspection: Inspection }>(`/locations/${locationId}/inspections`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
    };
  }, [getToken]);
}
