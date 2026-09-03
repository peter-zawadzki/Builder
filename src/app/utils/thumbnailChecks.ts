// Shared by PdfThumbnail.tsx and HtmlThumbnail.tsx.
// Samples pixels across a rendered canvas and flags it as "suspiciously
// uniform" — e.g. a full-bleed photo/logo silently failed to decode/render
// and all that painted was a solid background fill. A real document page
// always has far more pixel variation than this threshold across a real
// spread of sample points.
//
// Samples a genuine 2D grid (varying both x and y) rather than a single
// linear stride through the flat pixel buffer — a linear stride's byte
// step can coincidentally equal exactly one pixel row's width for certain
// canvas dimensions (it did: a 1024x1280 source scaled to a 320px-wide
// thumbnail lands on exactly this), which means every "sample" silently
// reads the same single leftmost column over and over. A plain white
// margin down that one column then reads as "the whole image is blank"
// even when the actual page is full of content.
export function looksLikeUniformFill(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  const gridSize = 20;
  let first: [number, number, number] | null = null;
  let samples = 0;
  let differing = 0;
  for (let gy = 0; gy < gridSize; gy++) {
    const y = Math.min(height - 1, Math.floor(((gy + 0.5) * height) / gridSize));
    for (let gx = 0; gx < gridSize; gx++) {
      const x = Math.min(width - 1, Math.floor(((gx + 0.5) * width) / gridSize));
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (!first) {
        first = [r, g, b];
      } else if (Math.abs(r - first[0]) + Math.abs(g - first[1]) + Math.abs(b - first[2]) > 24) {
        differing++;
      }
      samples++;
    }
  }
  return samples > 20 && differing / samples < 0.03;
}
