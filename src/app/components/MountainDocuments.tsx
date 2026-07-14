import { useState, useEffect, useRef } from 'react';
import { Upload, File, FileText, Image, Video, Download, Trash2, X, Grid, List, Edit3, Maximize2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import * as locMediaDB from '../utils/locationMediaDB';
import * as mountainDocsDB from '../utils/mountainDocumentsDB';
import * as imageAnnotationsDB from '../utils/imageAnnotationsDB';
import * as cloudLocSync from '../utils/cloudLocationSync';
import { ImageAnnotator } from './ImageAnnotator';
import type { Annotation } from '../context/DataContext';

interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: string;
  thumbnail?: string;
  source?: 'upload' | 'inspection';
  locationName?: string;
  dataUrl?: string; // Store original base64 for persistence
}

interface MountainDocumentsProps {
  mountainId: string;
  onExpandClick?: () => void;
}

export function MountainDocuments({ mountainId, onExpandClick }: MountainDocumentsProps) {
  const { getLocationsByMountainId, getAssetsByMountainId, getInspectionsByLocationId } = useData();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showAnnotator, setShowAnnotator] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAnnotations, setHasAnnotations] = useState<Record<string, boolean>>({});

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewImageRef = useRef<HTMLImageElement>(null);

  // Load uploaded documents and inspection images
  useEffect(() => {
    const loadDocuments = async () => {
      const locations = getLocationsByMountainId(mountainId);
      const assets = getAssetsByMountainId(mountainId);
      const mediaDocs: Document[] = [];

      console.log('[MountainDocuments] Loading media for', locations.length, 'locations and', assets.length, 'assets');

      // Fetch cloud URLs if needed
      let cloudUrls: Record<string, any> = {};
      try {
        const locationIds = locations.map(l => l.id);
        if (locationIds.length > 0) {
          cloudUrls = await cloudLocSync.fetchLocationMediaUrls(locationIds);
          console.log('[MountainDocuments] Cloud URLs fetched for', Object.keys(cloudUrls).length, 'locations');
        }
      } catch (e) {
        console.error('[MountainDocuments] Cloud fetch error:', e);
      }

      // Load all media from all locations
      for (const loc of locations) {
        // Load location-level media from IndexedDB
        const locMedia = await locMediaDB.getLocationMedia(loc.id);
        const inspMedia = await locMediaDB.getInspectionMedia(loc.id);

        // Use cloud URLs as fallback
        const cloud = cloudUrls[loc.id];
        const finalLocMedia = (locMedia.photos.length === 0 && locMedia.videos.length === 0 && cloud?.loc)
          ? { photos: cloud.loc.photos || [], videos: cloud.loc.videos || [] }
          : locMedia;
        const finalInspMedia = (inspMedia.photos.length === 0 && inspMedia.videos.length === 0 && cloud?.insp)
          ? { photos: cloud.insp.photos || [], videos: cloud.insp.videos || [] }
          : inspMedia;

        console.log(`[MountainDocuments] Location "${loc.name}": ${finalLocMedia.photos.length} photos, ${finalLocMedia.videos.length} videos (loc), ${finalInspMedia.photos.length} photos, ${finalInspMedia.videos.length} videos (insp)`);

        // Add location photos
        finalLocMedia.photos.forEach((photoUrl, idx) => {
          mediaDocs.push({
            id: `loc-${loc.id}-photo-${idx}`,
            name: `${loc.name} - Photo ${idx + 1}`,
            type: 'image/jpeg',
            size: 0,
            url: photoUrl,
            uploadedAt: new Date().toISOString(),
            thumbnail: photoUrl,
            source: 'inspection',
            locationName: loc.name,
          });
        });

        // Add location videos
        finalLocMedia.videos.forEach((videoUrl, idx) => {
          mediaDocs.push({
            id: `loc-${loc.id}-video-${idx}`,
            name: `${loc.name} - Video ${idx + 1}`,
            type: 'video/mp4',
            size: 0,
            url: videoUrl,
            uploadedAt: new Date().toISOString(),
            source: 'inspection',
            locationName: loc.name,
          });
        });

        // Add inspection photos
        const inspectionDate = getInspectionsByLocationId(loc.id)[0]?.createdAt || new Date().toISOString();
        finalInspMedia.photos.forEach((photoUrl, idx) => {
          mediaDocs.push({
            id: `insp-${loc.id}-photo-${idx}`,
            name: `${loc.name} - Inspection Photo ${idx + 1}`,
            type: 'image/jpeg',
            size: 0,
            url: photoUrl,
            uploadedAt: inspectionDate,
            thumbnail: photoUrl,
            source: 'inspection',
            locationName: loc.name,
          });
        });

        // Add inspection videos
        finalInspMedia.videos.forEach((videoUrl, idx) => {
          mediaDocs.push({
            id: `insp-${loc.id}-video-${idx}`,
            name: `${loc.name} - Inspection Video ${idx + 1}`,
            type: 'video/mp4',
            size: 0,
            url: videoUrl,
            uploadedAt: inspectionDate,
            source: 'inspection',
            locationName: loc.name,
          });
        });
      }

      // Load asset photos
      assets.forEach(asset => {
        const assetName = asset.type === 'Camera'
          ? `${asset.manufacturer || ''} ${asset.model || ''}`.trim() || 'Camera'
          : asset.type === 'Server'
          ? 'Server'
          : asset.type === 'Network Gear'
          ? `${asset.networkCategory || 'Network Gear'}`
          : asset.type;

        // Serial photo
        if (asset.serialPhoto) {
          mediaDocs.push({
            id: `asset-${asset.id}-serial`,
            name: `${assetName} - Serial Photo`,
            type: 'image/jpeg',
            size: 0,
            url: asset.serialPhoto,
            uploadedAt: new Date().toISOString(), // Assets don't track upload date currently
            thumbnail: asset.serialPhoto,
            source: 'inspection',
            locationName: assetName,
          });
        }

        // Install photo
        if (asset.installPhoto) {
          mediaDocs.push({
            id: `asset-${asset.id}-install`,
            name: `${assetName} - Install Photo`,
            type: 'image/jpeg',
            size: 0,
            url: asset.installPhoto,
            uploadedAt: new Date().toISOString(),
            thumbnail: asset.installPhoto,
            source: 'inspection',
            locationName: assetName,
          });
        }

        // Internal photo (servers)
        if (asset.internalPhoto) {
          mediaDocs.push({
            id: `asset-${asset.id}-internal`,
            name: `${assetName} - Internal Photo`,
            type: 'image/jpeg',
            size: 0,
            url: asset.internalPhoto,
            uploadedAt: new Date().toISOString(),
            thumbnail: asset.internalPhoto,
            source: 'inspection',
            locationName: assetName,
          });
        }

        // External photo (servers)
        if (asset.externalPhoto) {
          mediaDocs.push({
            id: `asset-${asset.id}-external`,
            name: `${assetName} - External Photo`,
            type: 'image/jpeg',
            size: 0,
            url: asset.externalPhoto,
            uploadedAt: new Date().toISOString(),
            thumbnail: asset.externalPhoto,
            source: 'inspection',
            locationName: assetName,
          });
        }

        // Misc photos
        if (asset.miscPhotos && asset.miscPhotos.length > 0) {
          asset.miscPhotos.forEach((photoUrl, idx) => {
            mediaDocs.push({
              id: `asset-${asset.id}-misc-${idx}`,
              name: `${assetName} - Photo ${idx + 1}`,
              type: 'image/jpeg',
              size: 0,
              url: photoUrl,
              uploadedAt: new Date().toISOString(),
              thumbnail: photoUrl,
              source: 'inspection',
              locationName: assetName,
            });
          });
        }
      });

      // Load uploaded documents from IndexedDB
      const savedDocs = await mountainDocsDB.getDocuments(mountainId);
      const uploadedDocs: Document[] = savedDocs.map(doc => {
        // Convert base64 to blob URL for display (more efficient than base64)
        const blob = dataURLtoBlob(doc.data);
        const url = URL.createObjectURL(blob);

        let thumbnail: string | undefined;
        if (doc.type.startsWith('image/')) {
          thumbnail = url;
        }

        return {
          id: doc.id,
          name: doc.name,
          type: doc.type,
          size: doc.size,
          url,
          uploadedAt: doc.uploadedAt,
          thumbnail,
          source: 'upload' as const,
          dataUrl: doc.data, // Keep original base64 for persistence
        };
      });

      setDocuments([...mediaDocs, ...uploadedDocs]);
      console.log('[MountainDocuments] Total documents loaded:', mediaDocs.length + uploadedDocs.length);
      setLoading(false);

      // Check which images have annotations
      const allDocs = [...mediaDocs, ...uploadedDocs];
      const imageDocs = allDocs.filter(doc => doc.type.startsWith('image/'));
      const hasAnns: Record<string, boolean> = {};

      await Promise.all(
        imageDocs.map(async (doc) => {
          const savedAnnotations = await imageAnnotationsDB.getAnnotations(doc.id);
          if (savedAnnotations.length > 0) {
            hasAnns[doc.id] = true;
          }
        })
      );

      setHasAnnotations(hasAnns);
    };

    loadDocuments();

    // Cleanup blob URLs on unmount
    return () => {
      setDocuments(prev => {
        prev.forEach(doc => {
          if (doc.source === 'upload' && doc.url.startsWith('blob:')) {
            URL.revokeObjectURL(doc.url);
          }
          if (doc.thumbnail && doc.thumbnail.startsWith('blob:')) {
            URL.revokeObjectURL(doc.thumbnail);
          }
        });
        return [];
      });
    };
  }, [mountainId, getLocationsByMountainId, getAssetsByMountainId]);

  // Helper to convert data URL to Blob
  const dataURLtoBlob = (dataURL: string): Blob => {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || '';
    const binary = atob(parts[1]);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newDocs: Document[] = [];
      const docsToSave: mountainDocsDB.MountainDocument[] = [];

      for (const file of Array.from(files)) {
        // Convert to base64 for storage
        const dataUrl = await mountainDocsDB.fileToBase64(file);

        // Create blob URL for display
        const url = URL.createObjectURL(file);
        let thumbnail: string | undefined;

        if (file.type.startsWith('image/')) {
          thumbnail = url;
        }

        const id = crypto.randomUUID();
        const uploadedAt = new Date().toISOString();

        const doc: Document = {
          id,
          name: file.name,
          type: file.type,
          size: file.size,
          url,
          uploadedAt,
          thumbnail,
          source: 'upload',
          dataUrl,
        };

        newDocs.push(doc);

        // Prepare for IndexedDB storage
        docsToSave.push({
          id,
          name: file.name,
          type: file.type,
          size: file.size,
          data: dataUrl,
          uploadedAt,
        });
      }

      // Save to IndexedDB
      const currentDocs = await mountainDocsDB.getDocuments(mountainId);
      await mountainDocsDB.saveDocuments(mountainId, [...currentDocs, ...docsToSave]);

      setDocuments(prev => {
        // Keep inspection docs, add new uploads
        const inspection = prev.filter(d => d.source === 'inspection');
        const uploaded = prev.filter(d => d.source !== 'inspection');
        return [...inspection, ...uploaded, ...newDocs];
      });
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    const doc = documents.find(d => d.id === id);
    if (!doc || doc.source === 'inspection') {
      // Don't delete inspection images
      return;
    }

    // Revoke blob URLs
    if (doc.url.startsWith('blob:')) {
      URL.revokeObjectURL(doc.url);
    }
    if (doc.thumbnail && doc.thumbnail.startsWith('blob:')) {
      URL.revokeObjectURL(doc.thumbnail);
    }

    // Remove from IndexedDB
    const currentDocs = await mountainDocsDB.getDocuments(mountainId);
    const updatedDocs = currentDocs.filter(d => d.id !== id);
    await mountainDocsDB.saveDocuments(mountainId, updatedDocs);

    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return Image;
    if (type.startsWith('video/')) return Video;
    if (type.includes('pdf')) return FileText;
    return File;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Load annotations when opening image preview
  const handleOpenPreview = async (doc: Document) => {
    setPreviewDoc(doc);
    if (doc.type.startsWith('image/')) {
      const savedAnnotations = await imageAnnotationsDB.getAnnotations(doc.id);
      setAnnotations(savedAnnotations);
    }
  };

  // Draw annotations on preview canvas
  useEffect(() => {
    if (!previewDoc || !previewDoc.type.startsWith('image/') || annotations.length === 0) {
      return;
    }

    const canvas = previewCanvasRef.current;
    const img = previewImageRef.current;

    if (!canvas || !img || !img.complete) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match image
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw the image
    ctx.drawImage(img, 0, 0);

    // Draw all annotations
    annotations.forEach((ann) => {
      const lineWidth = 3;
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

        ctx.save();
        ctx.translate(p.x, p.y);

        ctx.beginPath();
        ctx.arc(0, -pinSize * 0.6, pinSize * 0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-pinSize * 0.35, -pinSize * 0.6);
        ctx.quadraticCurveTo(-pinSize * 0.35, -pinSize * 0.2, 0, 0);
        ctx.quadraticCurveTo(pinSize * 0.35, -pinSize * 0.2, pinSize * 0.35, -pinSize * 0.6);
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(0, -pinSize * 0.6, pinSize * 0.15, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      } else if (ann.type === 'text' && ann.points.length === 1 && ann.label) {
        const p = ann.points[0];
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.fillStyle = ann.color;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 5;
        ctx.strokeText(ann.label, p.x, p.y);
        ctx.fillText(ann.label, p.x, p.y);
      }

      // Draw label for non-text annotations
      if (ann.type !== 'text' && ann.label) {
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
    });
  }, [previewDoc, annotations]);

  // Save annotations
  const handleSaveAnnotations = async (newAnnotations: Annotation[]) => {
    if (!previewDoc) return;
    await imageAnnotationsDB.saveAnnotations(previewDoc.id, newAnnotations);
    setAnnotations(newAnnotations);

    // Update has annotations tracking
    setHasAnnotations(prev => {
      if (newAnnotations.length > 0) {
        return { ...prev, [previewDoc.id]: true };
      } else {
        const { [previewDoc.id]: _, ...rest } = prev;
        return rest;
      }
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        {onExpandClick ? (
          <button onClick={onExpandClick} className="flex items-center gap-2 active:opacity-70">
            <Maximize2 size={15} className="text-[#6a7282]" />
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
              Documents
              {!loading && (
                <span className="ml-2 text-[#6a7282] text-[13px] font-normal">({documents.length})</span>
              )}
            </h2>
          </button>
        ) : (
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
            Documents
            {!loading && (
              <span className="ml-2 text-[#6a7282] text-[13px] font-normal">({documents.length})</span>
            )}
          </h2>
        )}
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-[#f3f3f5] rounded-[6px] p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-[4px] transition-colors ${
                viewMode === 'grid' ? 'bg-white text-[#307FE2]' : 'text-[#6a7282]'
              }`}
              title="Grid view"
            >
              <Grid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-[4px] transition-colors ${
                viewMode === 'list' ? 'bg-white text-[#307FE2]' : 'text-[#6a7282]'
              }`}
              title="List view"
            >
              <List size={14} />
            </button>
          </div>
          <label className="bg-[#307FE2] text-white rounded-[8px] px-2.5 py-1.5 flex items-center gap-1 font-['Inter:Medium',sans-serif] font-medium text-[13px] cursor-pointer active:opacity-80">
            <Upload size={14} />
            Upload
            <input
              type="file"
              multiple
              accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {uploading && (
        <div className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[8px] p-3 mb-3">
          <p className="text-[#307FE2] font-['Inter:Regular',sans-serif] text-[13px]">Uploading...</p>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[#307FE2] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
              Loading media...
            </p>
          </div>
        </div>
      ) : documents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="text-center">
            <Upload className="mx-auto mb-3 text-[#6a7282]" size={32} />
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
              No documents yet
            </p>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[600px] overflow-y-auto">
          {documents.map(doc => {
            const Icon = getFileIcon(doc.type);

            return (
              <div
                key={doc.id}
                className="bg-[#f9fafb] rounded-[8px] border border-[rgba(0,0,0,0.08)] p-2 group relative"
              >
                {/* Thumbnail or icon */}
                <div
                  className="w-full aspect-square bg-white rounded-[6px] flex items-center justify-center mb-1.5 overflow-hidden cursor-pointer relative"
                  onClick={() => handleOpenPreview(doc)}
                >
                  {doc.thumbnail ? (
                    <img
                      src={doc.thumbnail}
                      alt={doc.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Icon size={24} className="text-[#6a7282]" />
                  )}

                  {/* Annotation badge */}
                  {doc.type.startsWith('image/') && hasAnnotations[doc.id] && (
                    <div className="absolute top-1 left-1 bg-[#ff5c39] text-white px-1.5 py-0.5 rounded-full">
                      <Edit3 size={10} />
                    </div>
                  )}
                </div>

                {/* File info */}
                <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[10px] truncate mb-0.5">
                  {doc.name}
                </p>
                <div className="flex items-center gap-1">
                  {doc.source === 'inspection' && (
                    <span className="text-[8px] bg-[#EBF3FF] text-[#307FE2] px-1 py-0.5 rounded-full font-['Inter:Medium',sans-serif]">
                      Insp
                    </span>
                  )}
                  <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[9px] truncate">
                    {doc.size > 0 ? formatFileSize(doc.size) : formatDate(doc.uploadedAt)}
                  </p>
                </div>

                {/* Actions */}
                <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={doc.url}
                    download={doc.name}
                    className="bg-white/90 backdrop-blur-sm rounded-[4px] p-1 active:bg-white/100"
                    onClick={e => e.stopPropagation()}
                  >
                    <Download size={11} className="text-[#307FE2]" />
                  </a>
                  {doc.source === 'upload' && (
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="bg-white/90 backdrop-blur-sm rounded-[4px] p-1 active:bg-white/100"
                    >
                      <Trash2 size={11} className="text-[#ff5c39]" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1 max-h-[600px] overflow-y-auto">
          {documents.map(doc => {
            const Icon = getFileIcon(doc.type);

            return (
              <div
                key={doc.id}
                className="bg-[#f9fafb] rounded-[8px] border border-[rgba(0,0,0,0.08)] p-2 group relative flex items-center gap-2.5"
              >
                {/* Thumbnail or icon */}
                <div
                  className="w-10 h-10 bg-white rounded-[6px] flex items-center justify-center overflow-hidden cursor-pointer flex-shrink-0 relative"
                  onClick={() => handleOpenPreview(doc)}
                >
                  {doc.thumbnail ? (
                    <img
                      src={doc.thumbnail}
                      alt={doc.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Icon size={20} className="text-[#6a7282]" />
                  )}

                  {/* Annotation badge */}
                  {doc.type.startsWith('image/') && hasAnnotations[doc.id] && (
                    <div className="absolute top-0.5 left-0.5 bg-[#ff5c39] text-white p-0.5 rounded-full">
                      <Edit3 size={8} />
                    </div>
                  )}
                </div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[12px] truncate mb-0.5">
                    {doc.name}
                  </p>
                  <div className="flex items-center gap-2">
                    {doc.source === 'inspection' && (
                      <span className="text-[9px] bg-[#EBF3FF] text-[#307FE2] px-1.5 py-0.5 rounded-full font-['Inter:Medium',sans-serif]">
                        Inspection
                      </span>
                    )}
                    <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[10px]">
                      {doc.size > 0 ? `${formatFileSize(doc.size)} • ` : ''}{formatDate(doc.uploadedAt)}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <a
                    href={doc.url}
                    download={doc.name}
                    className="bg-white rounded-[6px] p-1.5 active:bg-[#f3f3f5] border border-[rgba(0,0,0,0.08)]"
                    onClick={e => e.stopPropagation()}
                  >
                    <Download size={13} className="text-[#307FE2]" />
                  </a>
                  {doc.source === 'upload' && (
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="bg-white rounded-[6px] p-1.5 active:bg-[#f3f3f5] border border-[rgba(0,0,0,0.08)]"
                    >
                      <Trash2 size={13} className="text-[#ff5c39]" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex flex-col"
          onClick={() => setPreviewDoc(null)}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <p className="text-white font-['Inter:Medium',sans-serif] text-[14px] truncate flex-1 mr-3">
              {previewDoc.name}
            </p>
            <div className="flex items-center gap-2">
              {previewDoc.type.startsWith('image/') && (
                <button
                  onClick={() => setShowAnnotator(true)}
                  className="flex items-center gap-1.5 bg-white/20 text-white text-[13px] font-['Inter:Medium',sans-serif] px-3 py-1.5 rounded-[8px] active:bg-white/30"
                >
                  <Edit3 size={13} />
                  {annotations.length > 0 ? 'Edit' : 'Annotate'}
                </button>
              )}
              <a
                href={previewDoc.url}
                download={previewDoc.name}
                className="flex items-center gap-1.5 bg-white/20 text-white text-[13px] font-['Inter:Medium',sans-serif] px-3 py-1.5 rounded-[8px] active:bg-white/30"
              >
                <Download size={13} />
                Download
              </a>
              <button
                onClick={() => setPreviewDoc(null)}
                className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center active:bg-white/30"
              >
                <X size={18} className="text-white" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto" onClick={e => e.stopPropagation()}>
            {previewDoc.type.startsWith('image/') ? (
              <div className="relative">
                {annotations.length > 0 ? (
                  <>
                    {/* Hidden image to load and provide dimensions */}
                    <img
                      ref={previewImageRef}
                      src={previewDoc.url}
                      alt={previewDoc.name}
                      className="hidden"
                      onLoad={() => {
                        // Trigger canvas redraw
                        if (previewImageRef.current && previewCanvasRef.current) {
                          const img = previewImageRef.current;
                          const canvas = previewCanvasRef.current;
                          canvas.width = img.naturalWidth;
                          canvas.height = img.naturalHeight;
                          // Force re-render
                          setAnnotations(prev => [...prev]);
                        }
                      }}
                    />
                    {/* Canvas with annotations */}
                    <canvas
                      ref={previewCanvasRef}
                      className="max-w-full max-h-full object-contain rounded-[4px]"
                      style={{ maxHeight: 'calc(100vh - 150px)' }}
                    />
                  </>
                ) : (
                  <img
                    src={previewDoc.url}
                    alt={previewDoc.name}
                    className="max-w-full max-h-full object-contain rounded-[4px]"
                  />
                )}
              </div>
            ) : previewDoc.type.startsWith('video/') ? (
              <video
                src={previewDoc.url}
                controls
                className="max-w-full max-h-full rounded-[4px]"
              />
            ) : previewDoc.type.includes('pdf') ? (
              <div className="bg-white rounded-[16px] p-8 text-center max-w-xs w-full">
                <div className="w-16 h-16 bg-[#fff3f0] rounded-[12px] flex items-center justify-center mx-auto mb-4">
                  <FileText size={32} className="text-[#ff5c39]" />
                </div>
                <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[15px] mb-2">PDF Document</p>
                <p className="text-[#6a7282] text-[13px] mb-5">Download to view this PDF</p>
                <a
                  href={previewDoc.url}
                  download={previewDoc.name}
                  className="inline-flex items-center gap-2 bg-[#307FE2] text-white font-['Inter:Medium',sans-serif] font-medium text-[14px] px-5 py-3 rounded-[10px] active:opacity-80"
                >
                  <Download size={15} />
                  Download PDF
                </a>
              </div>
            ) : (
              <div className="bg-white rounded-[16px] p-8 text-center max-w-xs w-full">
                <div className="w-16 h-16 bg-[#f3f3f5] rounded-[12px] flex items-center justify-center mx-auto mb-4">
                  <File size={32} className="text-[#6a7282]" />
                </div>
                <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[15px] mb-2">{previewDoc.name}</p>
                <p className="text-[#6a7282] text-[13px] mb-5">Download to view this file</p>
                <a
                  href={previewDoc.url}
                  download={previewDoc.name}
                  className="inline-flex items-center gap-2 bg-[#307FE2] text-white font-['Inter:Medium',sans-serif] font-medium text-[14px] px-5 py-3 rounded-[10px] active:opacity-80"
                >
                  <Download size={15} />
                  Download
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image Annotator */}
      {showAnnotator && previewDoc && previewDoc.type.startsWith('image/') && (
        <ImageAnnotator
          imageId={previewDoc.id}
          imageUrl={previewDoc.url}
          initialAnnotations={annotations}
          onSave={(newAnnotations) => {
            handleSaveAnnotations(newAnnotations);
            setShowAnnotator(false);
          }}
          onClose={() => setShowAnnotator(false)}
        />
      )}
    </div>
  );
}
