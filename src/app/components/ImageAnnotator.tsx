import { useState, useRef, useEffect } from 'react';
import { X, Pen, MapPin, Edit2, Trash2, Check, Undo, Type } from 'lucide-react';
import { toast } from 'sonner';
import type { Annotation, AnnotationType } from '../context/DataContext';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import * as cloudAnnotationSync from '../utils/cloudAnnotationSync';

interface ImageAnnotatorProps {
  imageId: string;
  imageUrl: string;
  initialAnnotations?: Annotation[];
  onSave: (annotations: Annotation[]) => void;
  onClose: () => void;
  title?: string;
}

export function ImageAnnotator({
  imageId,
  imageUrl,
  initialAnnotations = [],
  onSave,
  onClose,
  title = 'Annotate Image',
}: ImageAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [selectedTool, setSelectedTool] = useState<AnnotationType | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeDrawingId, setActiveDrawingId] = useState<string | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelText, setLabelText] = useState('');
  const [notesText, setNotesText] = useState('');
  const [pendingAnnotationId, setPendingAnnotationId] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [deleteAnnotationId, setDeleteAnnotationId] = useState<string | null>(null);
  const [textInputPosition, setTextInputPosition] = useState<{ x: number; y: number } | null>(null);
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);
  const [scale, setScale] = useState(1); // Canvas display scale (for fitting to screen)

  const colors = ['#ff5c39', '#307fe2', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];
  const [selectedColor, setSelectedColor] = useState(colors[0]);

  // Load image and calculate scale to fit screen
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;

      // Calculate scale to fit image within viewport
      const container = containerRef.current;
      if (container) {
        const containerWidth = container.clientWidth - 32; // Account for padding
        const containerHeight = container.clientHeight - 32;
        const scaleX = containerWidth / img.width;
        const scaleY = containerHeight / img.height;
        const fitScale = Math.min(scaleX, scaleY, 1); // Never scale up, only down
        setScale(fitScale);
      }

      setImageLoaded(true);
      redrawCanvas();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Redraw canvas whenever annotations or selection changes
  useEffect(() => {
    if (imageLoaded) {
      redrawCanvas();
    }
  }, [annotations, selectedAnnotation, imageLoaded]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and draw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw all saved annotations
    annotations.forEach((ann) => {
      drawAnnotation(ctx, ann, ann.id === selectedAnnotation);
    });
  };

  const drawAnnotation = (
    ctx: CanvasRenderingContext2D,
    ann: Annotation,
    isSelected: boolean
  ) => {
    const lineWidth = isSelected ? 4 : 3;
    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (ann.type === 'line' && ann.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) {
        ctx.lineTo(ann.points[i].x, ann.points[i].y);
      }
      ctx.stroke();
    } else if (ann.type === 'area' && ann.points.length > 2) {
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) {
        ctx.lineTo(ann.points[i].x, ann.points[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    } else if (ann.type === 'pin' && ann.points.length === 1) {
      const p = ann.points[0];
      const pinSize = 24;

      // Draw pin icon (teardrop shape)
      ctx.save();
      ctx.translate(p.x, p.y);

      ctx.beginPath();
      // Circle top
      ctx.arc(0, -pinSize * 0.6, pinSize * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Teardrop bottom
      ctx.beginPath();
      ctx.moveTo(-pinSize * 0.35, -pinSize * 0.6);
      ctx.quadraticCurveTo(-pinSize * 0.35, -pinSize * 0.2, 0, 0);
      ctx.quadraticCurveTo(pinSize * 0.35, -pinSize * 0.2, pinSize * 0.35, -pinSize * 0.6);
      ctx.fill();

      // White center dot
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(0, -pinSize * 0.6, pinSize * 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Draw text annotation
    if (ann.type === 'text' && ann.points.length === 1 && ann.label) {
      const p = ann.points[0];
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.fillStyle = ann.color;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 5;
      ctx.strokeText(ann.label, p.x, p.y);
      ctx.fillText(ann.label, p.x, p.y);
    }
    // Draw label for non-text annotations if exists
    else if (ann.label) {
      const labelPos = ann.type === 'pin'
        ? { x: ann.points[0].x + 16, y: ann.points[0].y - 20 }
        : { x: ann.points[0].x, y: ann.points[0].y - 8 };

      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.fillStyle = '#0a0a0a';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 4;
      ctx.strokeText(ann.label, labelPos.x, labelPos.y);
      ctx.fillText(ann.label, labelPos.x, labelPos.y);
    }
  };

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();

    let clientX: number, clientY: number;
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Convert from display coordinates to canvas coordinates
    // The canvas is displayed scaled but internally uses full resolution
    const displayX = clientX - rect.left;
    const displayY = clientY - rect.top;

    return {
      x: displayX / scale,
      y: displayY / scale,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedTool) return;
    const point = getCanvasPoint(e);
    if (!point) return;

    if (selectedTool === 'pin') {
      // Single click for pin
      const newAnn: Annotation = {
        id: crypto.randomUUID(),
        type: 'pin',
        points: [point],
        color: selectedColor,
        createdAt: new Date().toISOString(),
      };
      setAnnotations((prev) => [...prev, newAnn]);
      setPendingAnnotationId(newAnn.id);
      setShowLabelDialog(true);
      setSelectedTool(null);
    } else if (selectedTool === 'text') {
      // Show text input directly on canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const newId = crypto.randomUUID();

      // Text input position is in display coordinates (already scaled)
      setTextInputPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setTextInputValue('');
      setPendingAnnotationId(newId);

      // Store the canvas point for the annotation (in canvas coordinates)
      const newAnn: Annotation = {
        id: newId,
        type: 'text',
        points: [point],
        color: selectedColor,
        createdAt: new Date().toISOString(),
      };
      setAnnotations((prev) => [...prev, newAnn]);

      // Focus input after render
      setTimeout(() => textInputRef.current?.focus(), 10);
    } else if (selectedTool === 'line') {
      // Start new stroke
      setIsDrawing(true);
      const newId = crypto.randomUUID();
      const newAnn: Annotation = {
        id: newId,
        type: 'line',
        points: [point],
        color: selectedColor,
        createdAt: new Date().toISOString(),
      };
      setAnnotations((prev) => [...prev, newAnn]);
      setActiveDrawingId(newId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || selectedTool !== 'line') return;
    const point = getCanvasPoint(e);
    if (!point) return;

    // Add point to active drawing annotation
    if (activeDrawingId) {
      setAnnotations((prev) =>
        prev.map((ann) =>
          ann.id === activeDrawingId
            ? { ...ann, points: [...ann.points, point] }
            : ann
        )
      );
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || selectedTool !== 'line') return;
    setIsDrawing(false);
    setActiveDrawingId(null); // Clear so next stroke creates new annotation
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!selectedTool) return;
    const point = getCanvasPoint(e);
    if (!point) return;

    if (selectedTool === 'pin') {
      const newAnn: Annotation = {
        id: crypto.randomUUID(),
        type: 'pin',
        points: [point],
        color: selectedColor,
        createdAt: new Date().toISOString(),
      };
      setAnnotations((prev) => [...prev, newAnn]);
      setPendingAnnotationId(newAnn.id);
      setShowLabelDialog(true);
      setSelectedTool(null);
    } else if (selectedTool === 'text') {
      // Show text input directly on canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      // Text input position is in display coordinates (already scaled)
      setTextInputPosition({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
      setTextInputValue('');
      const newId = crypto.randomUUID();
      setPendingAnnotationId(newId);

      // Store the canvas point for the annotation (in canvas coordinates)
      const newAnn: Annotation = {
        id: newId,
        type: 'text',
        points: [point],
        color: selectedColor,
        createdAt: new Date().toISOString(),
      };
      setAnnotations((prev) => [...prev, newAnn]);

      setTimeout(() => textInputRef.current?.focus(), 10);
    } else if (selectedTool === 'line') {
      setIsDrawing(true);
      const newId = crypto.randomUUID();
      const newAnn: Annotation = {
        id: newId,
        type: 'line',
        points: [point],
        color: selectedColor,
        createdAt: new Date().toISOString(),
      };
      setAnnotations((prev) => [...prev, newAnn]);
      setActiveDrawingId(newId);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || selectedTool !== 'line') return;
    const point = getCanvasPoint(e);
    if (!point) return;

    if (activeDrawingId) {
      setAnnotations((prev) =>
        prev.map((ann) =>
          ann.id === activeDrawingId
            ? { ...ann, points: [...ann.points, point] }
            : ann
        )
      );
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || selectedTool !== 'line') return;
    setIsDrawing(false);
    setActiveDrawingId(null); // Clear so next stroke creates new annotation
  };

  const handleSaveLabel = () => {
    if (!pendingAnnotationId) return;

    setAnnotations((prev) =>
      prev.map((ann) =>
        ann.id === pendingAnnotationId
          ? { ...ann, label: labelText.trim() || undefined, notes: notesText.trim() || undefined }
          : ann
      )
    );

    setShowLabelDialog(false);
    setLabelText('');
    setNotesText('');
    setPendingAnnotationId(null);
  };

  const handleSaveTextInput = () => {
    if (!pendingAnnotationId || !textInputValue.trim()) {
      // Cancel if no text entered
      setAnnotations((prev) => prev.filter(a => a.id !== pendingAnnotationId));
      setTextInputPosition(null);
      setTextInputValue('');
      setPendingAnnotationId(null);
      setSelectedTool(null);
      return;
    }

    setAnnotations((prev) =>
      prev.map((ann) =>
        ann.id === pendingAnnotationId
          ? { ...ann, label: textInputValue.trim() }
          : ann
      )
    );

    setTextInputPosition(null);
    setTextInputValue('');
    setPendingAnnotationId(null);
    setSelectedTool(null);
  };

  const handleCancelTextInput = () => {
    setAnnotations((prev) => prev.filter(a => a.id !== pendingAnnotationId));
    setTextInputPosition(null);
    setTextInputValue('');
    setPendingAnnotationId(null);
    setSelectedTool(null);
  };

  const handleDeleteAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((ann) => ann.id !== id));
    setSelectedAnnotation(null);
    setDeleteAnnotationId(null);
    toast.success('Annotation deleted');
  };

  const handleUndo = () => {
    if (annotations.length === 0) return;
    const removed = annotations[annotations.length - 1];
    setAnnotations((prev) => prev.slice(0, -1));

    // If we're undoing the active drawing, clear it
    if (removed.id === activeDrawingId) {
      setActiveDrawingId(null);
    }

    toast.success('Undone');
  };

  const handleSave = async () => {
    setActiveDrawingId(null);
    onSave(annotations); // Save to IndexedDB

    // Upload to cloud
    if (!navigator.onLine) {
      // Offline: queue for upload on reconnect
      cloudAnnotationSync.addPendingAnnotation(imageId);
      toast.success('Annotations saved locally — will sync when online');
    } else {
      const success = await cloudAnnotationSync.uploadAnnotations(imageId, annotations);
      if (success) {
        toast.success('Annotations saved and synced ☁️');
      } else {
        // Upload failed — queue for retry on next reconnect
        cloudAnnotationSync.addPendingAnnotation(imageId);
        toast.success('Annotations saved locally — will retry sync');
      }
    }

    onClose();
  };

  const handleToolChange = (tool: AnnotationType) => {
    // Finalize current drawing when switching tools
    if (selectedTool === 'line' && activeDrawingId) {
      setActiveDrawingId(null);
    }
    setSelectedTool(tool);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 flex items-center justify-between">
        <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">
          {title}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px] active:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-[#ff5c39] text-white rounded-[8px] font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80"
          >
            Save
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-3 flex items-center gap-3 overflow-x-auto">
        <button
          onClick={() => handleToolChange('line')}
          className={`flex items-center gap-2 px-3 py-2 rounded-[8px] font-['Inter:Medium',sans-serif] font-medium text-[14px] ${
            selectedTool === 'line'
              ? 'bg-[#ff5c39] text-white'
              : 'bg-[#f3f3f5] text-[#0a0a0a] active:bg-[#e8e8ea]'
          }`}
        >
          <Pen size={18} />
          Draw
        </button>
        <button
          onClick={() => handleToolChange('pin')}
          className={`flex items-center gap-2 px-3 py-2 rounded-[8px] font-['Inter:Medium',sans-serif] font-medium text-[14px] ${
            selectedTool === 'pin'
              ? 'bg-[#ff5c39] text-white'
              : 'bg-[#f3f3f5] text-[#0a0a0a] active:bg-[#e8e8ea]'
          }`}
        >
          <MapPin size={18} />
          Pin
        </button>
        <button
          onClick={() => handleToolChange('text')}
          className={`flex items-center gap-2 px-3 py-2 rounded-[8px] font-['Inter:Medium',sans-serif] font-medium text-[14px] ${
            selectedTool === 'text'
              ? 'bg-[#ff5c39] text-white'
              : 'bg-[#f3f3f5] text-[#0a0a0a] active:bg-[#e8e8ea]'
          }`}
        >
          <Type size={18} />
          Text
        </button>

        <div className="h-6 w-px bg-[rgba(0,0,0,0.1)]" />

        <button
          onClick={handleUndo}
          disabled={annotations.length === 0}
          className={`flex items-center gap-2 px-3 py-2 rounded-[8px] font-['Inter:Medium',sans-serif] font-medium text-[14px] ${
            annotations.length === 0
              ? 'bg-[#f3f3f5] text-[#d1d5db] cursor-not-allowed'
              : 'bg-[#f3f3f5] text-[#0a0a0a] active:bg-[#e8e8ea]'
          }`}
        >
          <Undo size={18} />
          Undo
        </button>

        <div className="h-6 w-px bg-[rgba(0,0,0,0.1)]" />

        {/* Color picker */}
        <div className="flex items-center gap-2">
          {colors.map((color) => (
            <button
              key={color}
              onClick={() => setSelectedColor(color)}
              className={`w-8 h-8 rounded-full border-2 ${
                selectedColor === color ? 'border-[#0a0a0a]' : 'border-white'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center bg-[#1a1a1a] p-4"
        style={{
          touchAction: selectedTool ? 'none' : 'auto', // Prevent scroll when tool selected
          overflow: selectedTool ? 'hidden' : 'auto'
        }}
      >
        {imageLoaded ? (
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={imageRef.current?.width || 800}
              height={imageRef.current?.height || 600}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="cursor-crosshair bg-white"
              style={{
                width: `${(imageRef.current?.width || 800) * scale}px`,
                height: `${(imageRef.current?.height || 600) * scale}px`,
                touchAction: 'none' // Always prevent touch scrolling on canvas
              }}
            />
            {selectedTool && !isDrawing && !textInputPosition && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 rounded-full px-4 py-2 shadow">
                <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[13px]">
                  {selectedTool === 'line' ? 'Click and drag to draw' : selectedTool === 'text' ? 'Click to add text' : 'Click to drop a pin'}
                </p>
              </div>
            )}
            {textInputPosition && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 rounded-full px-4 py-2 shadow">
                <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[13px]">
                  Press Enter to save, Esc to cancel
                </p>
              </div>
            )}
            {isDrawing && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/95 rounded-full px-4 py-2 shadow">
                <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[13px]">
                  Drawing... Release to finish stroke.
                </p>
              </div>
            )}
            {/* Text input overlay */}
            {textInputPosition && (
              <div
                className="absolute"
                style={{
                  left: `${textInputPosition.x}px`,
                  top: `${textInputPosition.y}px`,
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <input
                  ref={textInputRef}
                  type="text"
                  value={textInputValue}
                  onChange={(e) => setTextInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveTextInput();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      handleCancelTextInput();
                    }
                  }}
                  onBlur={handleSaveTextInput}
                  placeholder="Type text..."
                  className="bg-white border-2 border-[#ff5c39] rounded-[8px] px-3 py-2 text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px] outline-none shadow-lg min-w-[200px]"
                  style={{ color: selectedColor }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-white font-['Inter:Regular',sans-serif]">Loading image...</p>
          </div>
        )}
      </div>

      {/* Label dialog (only for pins now) */}
      {showLabelDialog && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-md p-6">
            <h3 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px] mb-4">
              Add Label & Notes
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={labelText}
                  onChange={(e) => setLabelText(e.target.value)}
                  placeholder="e.g., Camera 1, 150ft"
                  autoFocus
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none"
                />
              </div>
              <div>
                <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder="Add any additional notes..."
                  rows={3}
                  className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => {
                  setShowLabelDialog(false);
                  setLabelText('');
                  setNotesText('');
                  setPendingAnnotationId(null);
                }}
                className="flex-1 px-4 py-3 bg-[#f3f3f5] text-[#0a0a0a] rounded-[8px] font-['Inter:Medium',sans-serif] font-medium active:bg-[#e8e8ea]"
              >
                Skip
              </button>
              <button
                onClick={handleSaveLabel}
                className="flex-1 px-4 py-3 bg-[#ff5c39] text-white rounded-[8px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete annotation confirmation */}
      {deleteAnnotationId && (() => {
        const ann = annotations.find(a => a.id === deleteAnnotationId);
        if (!ann) return null;
        return (
          <DeleteConfirmModal
            title="Delete annotation?"
            description={
              <>
                This will permanently delete the{' '}
                <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                  {ann.label || `${ann.type} annotation`}
                </span>
                {ann.notes && (
                  <>
                    {' '}with notes: "{ann.notes.substring(0, 50)}{ann.notes.length > 50 ? '...' : ''}"
                  </>
                )}
                . This cannot be undone.
              </>
            }
            onConfirm={() => handleDeleteAnnotation(deleteAnnotationId)}
            onCancel={() => setDeleteAnnotationId(null)}
          />
        );
      })()}
    </div>
  );
}
