import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  // Only start fetching/rendering once the card is actually scrolled into
  // view — a grid of a few dozen PDFs spinning up that many pdf.js workers
  // and full-file downloads at once is what made this look "stuck": every
  // request competed for the same handful of browser connections/workers.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setStatus('loading');
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
        if (!cancelled) setStatus('ready');
      } catch (err) {
        console.error('PDF thumbnail render failed:', err);
        if (!cancelled) setStatus('failed');
      }
    })();
    return () => { cancelled = true; };
  }, [url, visible]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
      {status === 'failed' ? (
        <FileText size={28} className="text-[#307fe2]" />
      ) : (
        <>
          <canvas
            ref={canvasRef}
            aria-label={alt}
            className={`max-h-full max-w-full object-contain shadow-sm ${status === 'ready' ? '' : 'hidden'}`}
          />
          {status === 'loading' && <Loader2 size={20} className="animate-spin text-[#8992a0]" />}
        </>
      )}
    </div>
  );
}
