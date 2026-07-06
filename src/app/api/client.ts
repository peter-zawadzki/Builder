import { useAuth } from "@clerk/clerk-react";
import { useMemo } from "react";

// Authenticated client for the local API. Attaches the Clerk session token as a
// Bearer header; requests go to /api (proxied to the Hono server in dev, same
// origin in prod). This is the foundation the app's data layer will move onto,
// replacing the direct Supabase KV calls.
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
      listMountains: () => request("/mountains"),
      createMountain: (data: { name: string; address?: string; region?: string }) =>
        request("/mountains", { method: "POST", body: JSON.stringify(data) }),
    };
  }, [getToken]);
}
