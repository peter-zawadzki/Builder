// Brand colors/fonts for the Resource Center's Logo Files tab. Provided
// directly (not derived from an uploaded asset file) — update by hand if
// the palette or typeface changes.
export interface BrandColor {
  name: string;
  hex: string;
}

export const BRAND_COLORS: BrandColor[] = [
  { name: 'Primary Orange', hex: '#FF5C39' },
  { name: 'Regular Blue',   hex: '#307FE2' },
  { name: 'Dark Text',      hex: '#1D252D' },
  { name: 'Grey 900',       hex: '#343B42' },
  { name: 'Grey 800',       hex: '#4A5157' },
];

export const BRAND_FONT = {
  family: 'League Gothic',
  // Google Fonts hosts League Gothic — loaded on demand (only while this
  // tab is open) rather than globally, since nothing else in the app uses it.
  googleFontsUrl: 'https://fonts.googleapis.com/css2?family=League+Gothic&display=swap',
};
