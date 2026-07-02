import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { RotateCcw } from 'lucide-react';

export interface SignaturePadHandle {
  /** Returns a base64 PNG data URL, or null if the canvas is blank */
  getDataURL: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

interface Props {
  /** Called whenever the user starts or finishes a stroke */
  onChange?: (isEmpty: boolean) => void;
  height?: number;
  penColor?: string;
  penWidth?: number;
}

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { onChange, height = 150, penColor = '#1a1a1a', penWidth = 2.5 },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Set up canvas size on mount and on resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      // Preserve existing drawing
      const existing = canvas.toDataURL();
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penWidth;
      // Restore
      if (existing && existing !== 'data:,') {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = existing;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [penColor, penWidth]);

  const getPos = (e: MouseEvent | Touch, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left),
      y: (e.clientY - rect.top),
    };
  };

  const startDraw = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    drawing.current = true;
    lastPos.current = { x, y };
    ctx.beginPath();
    ctx.arc(x, y, penWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = penColor;
    ctx.fill();
  }, [penColor, penWidth]);

  const draw = useCallback((x: number, y: number) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastPos.current = { x, y };
    if (empty) {
      setEmpty(false);
      onChange?.(false);
    }
  }, [penColor, penWidth, empty, onChange]);

  const stopDraw = useCallback(() => {
    drawing.current = false;
    lastPos.current = null;
  }, []);

  // Mouse events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onDown = (e: MouseEvent) => { e.preventDefault(); const p = getPos(e, canvas); startDraw(p.x, p.y); };
    const onMove = (e: MouseEvent) => { e.preventDefault(); const p = getPos(e, canvas); draw(p.x, p.y); };
    const onUp = () => stopDraw();
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [startDraw, draw, stopDraw]);

  // Touch events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      const p = getPos(t, canvas);
      startDraw(p.x, p.y);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      const p = getPos(t, canvas);
      draw(p.x, p.y);
    };
    const onTouchEnd = () => stopDraw();
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [startDraw, draw, stopDraw]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange?.(true);
  }, [onChange]);

  const getDataURL = useCallback((): string | null => {
    if (empty) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  }, [empty]);

  const isEmptyFn = useCallback(() => empty, [empty]);

  useImperativeHandle(ref, () => ({ getDataURL, clear, isEmpty: isEmptyFn }), [getDataURL, clear, isEmptyFn]);

  return (
    <div style={{ position: 'relative', fontFamily: 'Inter, sans-serif' }}>
      <div
        style={{
          border: `1.5px solid ${empty ? 'rgba(0,0,0,0.14)' : '#FF5C39'}`,
          borderRadius: 8,
          overflow: 'hidden',
          background: '#fafafa',
          cursor: 'crosshair',
          position: 'relative',
          transition: 'border-color 0.15s',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: height, touchAction: 'none' }}
        />
        {empty && (
          <div
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: 13, color: '#bbb', userSelect: 'none' }}>
              Sign here with your mouse or finger
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 11.5, color: '#aaa' }}>
          {empty ? 'Canvas is blank' : '✓ Signature captured'}
        </span>
        {!empty && (
          <button
            type="button"
            onClick={clear}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#FF5C39', fontWeight: 600, padding: '2px 0' }}
          >
            <RotateCcw size={13} /> Clear &amp; Redo
          </button>
        )}
      </div>
    </div>
  );
});
