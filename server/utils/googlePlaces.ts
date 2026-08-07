// Shared Places API (New) helpers for the ODIN create_mountain flow —
// separate from server/routes/places.ts (which backs the AddressAutocomplete
// component and stays untouched) so extending the field mask here can't
// regress that existing, unrelated UI path.
export interface PlaceCandidate {
  placeId: string;
  description: string;
}

export interface PlaceDetails {
  name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
}

export async function searchPlaces(query: string): Promise<PlaceCandidate[] | { error: string }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { error: "GOOGLE_PLACES_API_KEY not configured" };
  const resp = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({ input: query }),
  });
  const data: any = await resp.json();
  if (!resp.ok) return { error: `Places API: ${data.error?.message ?? resp.status}` };
  return (data.suggestions ?? [])
    .map((s: any) => s.placePrediction)
    .filter(Boolean)
    .map((p: any) => ({ placeId: p.placeId, description: p.text?.text ?? "" }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | { error: string }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { error: "GOOGLE_PLACES_API_KEY not configured" };
  const resp = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "displayName,formattedAddress,location,nationalPhoneNumber,websiteUri",
    },
  });
  const data: any = await resp.json();
  if (!resp.ok) return { error: `Places API: ${data.error?.message ?? resp.status}` };
  return {
    name: data.displayName?.text ?? null,
    address: data.formattedAddress ?? null,
    phone: data.nationalPhoneNumber ?? null,
    website: data.websiteUri ?? null,
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
  };
}
