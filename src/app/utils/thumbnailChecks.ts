// Shared by PdfThumbnail.tsx and HtmlThumbnail.tsx.
// Samples pixels across a rendered canvas and flags it as "suspiciously
// uniform" — e.g. a full-bleed photo/logo silently failed to decode/render
// and all that painted was a solid background fill. A real document page
// always has far more pixel variation than this threshold across a few
// hundred sample points.
export function looksLikeUniformFill(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  const totalPixels = width * height;
  const sampleStep = Math.max(1, Math.floor(totalPixels / 400)) * 4;
  let first: [number, number, number] | null = null;
  let samples = 0;
  let differing = 0;
  for (let i = 0; i < data.length; i += sampleStep) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!first) {
      first = [r, g, b];
    } else if (Math.abs(r - first[0]) + Math.abs(g - first[1]) + Math.abs(b - first[2]) > 24) {
      differing++;
    }
    samples++;
  }
  return samples > 20 && differing / samples < 0.03;
}
