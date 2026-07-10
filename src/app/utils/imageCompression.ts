// Downscales/recompresses an image data URL client-side before it's stored,
// so uploads don't bloat localStorage/sync payloads.
export async function compressImage(dataUrl: string, maxDimension = 2400, quality = 0.85): Promise<string> {
  return new Promise(resolve => {
    try {
      const img = new Image();
      img.onload = () => {
        let { naturalWidth: w, naturalHeight: h } = img;
        if (w > maxDimension || h > maxDimension) {
          const r = Math.min(maxDimension / w, maxDimension / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch { resolve(dataUrl); }
  });
}
