import { Hono } from "hono";
import type { HonoEnv } from "../auth";

// Replaces the legacy Supabase Edge Function's Google Places proxy — keeps
// GOOGLE_PLACES_API_KEY server-side instead of shipping it to the client.
export const places = new Hono<HonoEnv>();

// Places API (New) — the classic Autocomplete/Details endpoints below are
// deprecated in newer Google Cloud projects ("legacy API...not enabled").

places.get("/autocomplete", async (c) => {
  const input = c.req.query("input");
  if (!input || input.length < 2) return c.json({ suggestions: [] });
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return c.json({ error: "GOOGLE_PLACES_API_KEY not configured" }, 500);
  try {
    const resp = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
      body: JSON.stringify({ input }),
    });
    const data: any = await resp.json();
    if (!resp.ok) {
      console.error("Places autocomplete API error:", resp.status, data.error?.message);
      return c.json({ error: `Places API: ${data.error?.message ?? resp.status}` }, 500);
    }
    const suggestions = (data.suggestions ?? [])
      .map((s: any) => s.placePrediction)
      .filter(Boolean)
      .map((p: any) => ({ placeId: p.placeId, description: p.text?.text ?? "" }));
    return c.json({ suggestions });
  } catch (err) {
    console.error("Error fetching place autocomplete:", err);
    return c.json({ error: `Failed to fetch autocomplete: ${err}` }, 500);
  }
});

places.get("/details", async (c) => {
  const placeId = c.req.query("place_id");
  if (!placeId) return c.json({ error: "place_id required" }, 400);
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return c.json({ error: "GOOGLE_PLACES_API_KEY not configured" }, 500);
  try {
    const resp = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "displayName,formattedAddress,location",
      },
    });
    const data: any = await resp.json();
    if (!resp.ok) {
      console.error("Places details API error:", resp.status, data.error?.message);
      return c.json({ error: `Places API: ${data.error?.message ?? resp.status}` }, 500);
    }
    const location = data.location ? { lat: data.location.latitude, lng: data.location.longitude } : null;
    return c.json({ name: data.displayName?.text ?? null, address: data.formattedAddress ?? null, location });
  } catch (err) {
    console.error("Error fetching place details:", err);
    return c.json({ error: `Failed to fetch place details: ${err}` }, 500);
  }
});

// No client currently calls this (mountain geocoding uses free Nominatim,
// location geocoding uses Mapbox — see useMountainGeocoding.ts / mapboxGeocode.ts).
// Ported straight across in case something starts relying on it. The classic
// Geocoding API isn't part of the legacy-vs-new Places split above, but still
// needs to be separately enabled on the GOOGLE_PLACES_API_KEY's GCP project.
places.get("/geocode", async (c) => {
  const address = c.req.query("address");
  if (!address) return c.json({ location: null });
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return c.json({ location: null });
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const resp = await fetch(url);
    const data: any = await resp.json();
    if (data.status !== "OK" || !data.results?.length) return c.json({ location: null });
    return c.json({ location: data.results[0]?.geometry?.location ?? null });
  } catch (err) {
    console.error("Error geocoding address:", err);
    return c.json({ location: null });
  }
});
