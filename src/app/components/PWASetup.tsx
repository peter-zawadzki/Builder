import { useEffect } from 'react';
import logoSrc from 'figma:asset/eeb3af24169072d584eb7e95581775ba2f850339.png';

/**
 * Draws the Yullr logo (white) onto a blue rounded-rect canvas.
 * Returns a PNG data URL.
 */
function drawIcon(size: number, logo: string): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(''); return; }

    // ── Blue rounded-rect background ───────────────────────────────────────
    const r = Math.round(size * 0.175);
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fillStyle = '#307FE2';
    ctx.fill();

    // ── Subtle inner highlight ─────────────────────────────────────────────
    const grad = ctx.createRadialGradient(
      size * 0.35, size * 0.28, 0,
      size * 0.5,  size * 0.5,  size * 0.7,
    );
    grad.addColorStop(0, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    // ── Draw Yullr logo in white ───────────────────────────────────────────
    const img = new Image();

    img.onload = () => {
      // Logo is already white — draw it directly, no filter needed
      const padding = size * 0.18;
      ctx.drawImage(img, padding, padding, size - padding * 2, size - padding * 2);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      // Fallback: render text wordmark if the image fails
      const fontSize = Math.round(size * 0.255);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`;
      ctx.fillText('YULLR', size / 2, size / 2);
      resolve(canvas.toDataURL('image/png'));
    };

    img.src = logo;
  });
}

/** Injects or updates a <link> tag in <head>. */
function injectLink(rel: string, attrs: Record<string, string>) {
  const existing = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const el = existing ?? document.createElement('link');
  el.rel = rel;
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (!existing) document.head.appendChild(el);
}

/** Injects or updates a <meta> tag in <head>. */
function injectMeta(name: string, content: string, useProperty = false) {
  const attr = useProperty ? 'property' : 'name';
  const existing = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  const el = existing ?? document.createElement('meta');
  el.setAttribute(attr, name);
  el.content = content;
  if (!existing) document.head.appendChild(el);
}

export function PWASetup() {
  useEffect(() => {
    document.title = 'BUILDER';

    // ── Register Service Worker ─────────────────────────────────────────────
    if ('serviceWorker' in navigator) {
      // Skip SW registration in Figma preview iframes and other sandboxed
      // environments where the origin doesn't match the SW scope.
      // SW will register normally when the app is installed / opened directly.
      const isSafeOrigin =
        window.location.protocol === 'https:' &&
        !window.location.hostname.endsWith('.figma.site') &&
        !window.location.hostname.endsWith('.figmausercontent.com') &&
        window.self === window.top; // not inside an iframe

      if (isSafeOrigin) {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then(reg => {
            console.log('[SW] Registered, scope:', reg.scope);
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                  }
                });
              }
            });
          })
          .catch(err => console.warn('[SW] Registration failed:', err));
      } else {
        console.info('[SW] Skipped — preview/sandboxed environment detected.');
      }
    }

    (async () => {
      const [icon512, icon192, icon180] = await Promise.all([
        drawIcon(512, logoSrc),
        drawIcon(192, logoSrc),
        drawIcon(180, logoSrc),
      ]);

      // Favicon
      injectLink('icon', { type: 'image/png', href: icon192 });

      // Apple / iOS
      injectLink('apple-touch-icon', { href: icon180 });
      injectMeta('apple-mobile-web-app-capable', 'yes');
      injectMeta('apple-mobile-web-app-status-bar-style', 'default');
      injectMeta('apple-mobile-web-app-title', 'BUILDER');

      // Android / Chrome
      injectLink('manifest', { href: '/manifest.json' });
      injectMeta('theme-color', '#307FE2');
      injectMeta('mobile-web-app-capable', 'yes');
      injectMeta('application-name', 'BUILDER');

      // Cache for service worker / manifest use
      (window as any).__pwaIcon512 = icon512;
      (window as any).__pwaIcon192 = icon192;
    })();
  }, []);

  return null;
}