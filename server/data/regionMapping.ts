// Derives one of the app's 8 fixed Region dropdown values (see
// CreateMountain.tsx / EditMountain.tsx) from a Places API formatted
// address. Deliberately returns null rather than guessing when the state
// isn't in the table or the address doesn't look like a match — the FAQ
// agent is instructed to ask the user rather than assign a wrong region.
export type Region =
  | "Rocky Mountains"
  | "Sierra Nevada"
  | "Pacific Northwest"
  | "Northeast"
  | "Mid-Atlantic"
  | "Midwest"
  | "Europe"
  | "Canada";

export const REGIONS: Region[] = [
  "Rocky Mountains",
  "Sierra Nevada",
  "Pacific Northwest",
  "Northeast",
  "Mid-Atlantic",
  "Midwest",
  "Europe",
  "Canada",
];

// Sierra Nevada is a mountain range, not a state — CA is intentionally
// omitted here since most of California isn't Sierra Nevada ski country;
// left null for CA so the agent asks rather than assuming.
const STATE_TO_REGION: Record<string, Region> = {
  ME: "Northeast", NH: "Northeast", VT: "Northeast", MA: "Northeast", CT: "Northeast", RI: "Northeast", NY: "Northeast",
  PA: "Mid-Atlantic", NJ: "Mid-Atlantic", MD: "Mid-Atlantic", DE: "Mid-Atlantic", VA: "Mid-Atlantic", WV: "Mid-Atlantic", DC: "Mid-Atlantic",
  CO: "Rocky Mountains", UT: "Rocky Mountains", WY: "Rocky Mountains", MT: "Rocky Mountains", ID: "Rocky Mountains",
  WA: "Pacific Northwest", OR: "Pacific Northwest",
  MI: "Midwest", WI: "Midwest", MN: "Midwest", IL: "Midwest", IN: "Midwest", OH: "Midwest",
};

export function regionFromAddress(formattedAddress: string | null | undefined): Region | null {
  if (!formattedAddress) return null;
  if (/\bcanada\b/i.test(formattedAddress)) return "Canada";

  // US addresses from Places API end "..., City, ST 12345, USA" — pull the
  // two-letter state code right before the ZIP.
  const match = formattedAddress.match(/,\s*([A-Z]{2})\s+\d{5}/);
  if (match) return STATE_TO_REGION[match[1]] ?? null;

  // Anything else (unmatched US state, or outside US/Canada entirely —
  // could be Europe, could be Japan/Australia/Chile/etc.) — don't guess.
  return null;
}
