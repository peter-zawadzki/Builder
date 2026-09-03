import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { FileText, Loader2 } from 'lucide-react';
import { looksLikeUniformFill } from '../utils/thumbnailChecks';

const VIEWPORT_WIDTH = 1024;
const VIEWPORT_HEIGHT = 1280;

// Renders an HTML document's first screenful to a small PNG by loading it
// into an off-screen same-origin iframe (via srcdoc, so html2canvas can read
// its DOM without cross-origin restrictions) and rasterizing that. Shared by
// the upload-time generator and the on-demand fallback component below.
async function renderHtmlToThumbnail(htmlText: string, targetWidth: number): Promise<string | null> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-99999px';
  iframe.style.top = '0';
  iframe.style.width = `${VIEWPORT_WIDTH}px`;
  iframe.style.height = `${VIEWPORT_HEIGHT}px`;
  iframe.style.border = 'none';
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('HTML render timed out')), 10000);
      iframe.onload = () => { clearTimeout(timeout); resolve(); };
      iframe.srcdoc = htmlText;
    });
    // Give inline images/fonts/layout a moment to settle after load fires.
    await new Promise((r) => setTimeout(r, 400));
    const doc = iframe.contentDocument;
    if (!doc?.body) return null;
    const canvas = await html2canvas(doc.body, {
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      windowWidth: VIEWPORT_WIDTH,
      windowHeight: VIEWPORT_HEIGHT,
      scale: targetWidth / VIEWPORT_WIDTH,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 8000,
    });
    const ctx = canvas.getContext('2d');
    if (ctx && looksLikeUniformFill(ctx, canvas.width, canvas.height)) return null;
    return canvas.toDataURL('image/png');
  } finally {
    iframe.remove();
  }
}

// Used at upload time so the card grid can show a stored thumbnail
// instantly instead of re-rendering the HTML client-side on every page
// load. Returns null on any failure — thumbnail generation is a
// nice-to-have, never worth blocking an upload or storing a broken image.
export async function renderHtmlFirstViewThumbnail(file: File, targetWidth = 480): Promise<string | null> {
  try {
    const text = await file.text();
    return await renderHtmlToThumbnail(text, targetWidth);
  } catch (err) {
    console.error('HTML upload-time thumbnail generation failed:', err);
    return null;
  }
}

// On-demand fallback for HTML files uploaded before stored thumbnails
// existed (or where generation failed) — fetches the file and renders it
// the same way, lazily once the card scrolls into view.
export function HtmlThumbnail({ url, alt }: { url: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        const res = await fetch(url);
        const text = await res.text();
        const thumb = await renderHtmlToThumbnail(text, 320);
        if (cancelled) return;
        if (!thumb) throw new Error('Render looked blank');
        setDataUrl(thumb);
        setStatus('ready');
      } catch (err) {
        console.error('HTML thumbnail render failed:', err);
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setStatus('failed');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [url, visible]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
      {status === 'failed' ? (
        <div className="flex flex-col items-center gap-1 px-2 text-center" title={errorMessage ?? undefined}>
          <FileText size={28} className="text-[#307fe2]" />
          {errorMessage && <p className="text-[9px] text-[#8992a0] leading-tight line-clamp-2">{errorMessage}</p>}
        </div>
      ) : status === 'ready' && dataUrl ? (
        <img src={dataUrl} alt={alt} className="max-h-full max-w-full object-contain shadow-sm" />
      ) : (
        <Loader2 size={20} className="animate-spin text-[#8992a0]" />
      )}
    </div>
  );
}
