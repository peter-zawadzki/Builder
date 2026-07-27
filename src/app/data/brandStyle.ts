// Brand colors/fonts for the Resource Center's Brand Assets tab. Provided
// directly (not derived from an uploaded asset file) — update by hand if
// the palette or typeface changes.
export interface BrandColor {
  name: string;
  hex: string;
  rgb: string;
  cmyk: string;
  pantone: string;
  role: string;
}

export const BRAND_COLORS: BrandColor[] = [
  {
    name: 'YULLR Orange',
    hex: '#FF5C39',
    rgb: '255, 92, 57',
    cmyk: 'C:0 M:64 Y:78 K:0',
    pantone: '171 C',
    role: 'Primary brand color, calls to action, key highlights, buttons.',
  },
  {
    name: 'Mountain Blue',
    hex: '#307FE2',
    rgb: '48, 127, 226',
    cmyk: 'C:79 M:44 Y:0 K:11',
    pantone: '2727 C',
    role: 'Secondary brand color, technology, trust, links, charts, and supporting graphics.',
  },
  {
    name: 'Dark Text',
    hex: '#1D252D',
    rgb: '29, 37, 45',
    cmyk: 'C:36 M:18 Y:0 K:82',
    pantone: '433 C',
    role: 'Primary text, headlines, icons, and dark UI elements.',
  },
  {
    name: 'Grey 900',
    hex: '#343B42',
    rgb: '52, 59, 66',
    cmyk: 'C:21 M:11 Y:0 K:74',
    pantone: 'Cool Gray 11 C',
    role: 'Secondary headings, navigation, dividers, dark backgrounds.',
  },
  {
    name: 'Grey 800',
    hex: '#4A5157',
    rgb: '74, 81, 87',
    cmyk: 'C:15 M:7 Y:0 K:66',
    pantone: 'Cool Gray 10 C',
    role: 'Body copy, secondary text, captions, borders, and UI components.',
  },
];

// The typeface used in the logo wordmark itself (Alex, by Keith Bates /
// K-Type) — distinct from BRAND_FONT below, which is the display font used
// elsewhere in brand materials (headings, demo decks, etc.).
export const LOGO_FONT = {
  family: 'Alex',
  // Not on Google Fonts — self-hosted from the file itself, no CDN link.
  downloadUrl: '/resource-assets/fonts/Alex.ttf',
};

export const BRAND_FONT = {
  family: 'League Gothic',
  // Google Fonts hosts League Gothic — loaded on demand (only while this
  // tab is open) rather than globally, since nothing else in the app uses it.
  googleFontsUrl: 'https://fonts.googleapis.com/css2?family=League+Gothic&display=swap',
  // Variable-width TTF, for anyone who needs the actual font file (e.g. for
  // slide decks or design tools that can't pull from Google Fonts).
  downloadUrl: '/resource-assets/fonts/LeagueGothic-Regular-VariableFont_wdth.ttf',
};
