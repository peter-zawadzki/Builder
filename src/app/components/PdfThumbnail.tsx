import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';

// pdfjs-dist is only needed for the handful of PDF cards actually on screen,
// so it's loaded on first use rather than bundled into the main chunk —
// and only once per page load (module-level promise, not per-card).
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export function PdfThumbnail({ url, alt }: { url: string; alt: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const pdf = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        const unscaled = page.getViewport({ scale: 1 });
        // Render at a fixed target width so the canvas is crisp at the
        // card's display size regardless of the PDF's actual page size.
        const viewport = page.getViewport({ scale: 320 / unscaled.width });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        console.error('PDF thumbnail render failed:', err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (failed) return <FileText size={28} className="text-[#307fe2]" />;
  return <canvas ref={canvasRef} aria-label={alt} className="max-h-full max-w-full object-contain shadow-sm" />;
}
