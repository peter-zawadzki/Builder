import * as locMediaDB from '../utils/locationMediaDB';
import * as cloudLocSync from '../utils/cloudLocationSync';
import * as imageAnnotationsDB from '../utils/imageAnnotationsDB';
import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import { useData, SiteInspectionItem, Annotation, ContactActivity } from '../context/DataContext';
import {
  ArrowLeft, Plus, MapPin, Trash2,
  ClipboardList, Pencil, Image as ImageIcon, Video as VideoIcon,
  ChevronLeft, ChevronRight, X, Edit3,
} from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ActivitySection } from './ActivitySection';
import { ImageAnnotator } from './ImageAnnotator';
import { MountainMapView } from './MountainMapView';

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function MediaLightbox({
  items, index, type, onClose, onPrev, onNext, imageId, annotationCount, onAnnotate,
}: {
  items: string[]; index: number; type: 'photo' | 'video';
  onClose: () => void; onPrev: () => void; onNext: () => void;
  imageId?: string; annotationCount?: number; onAnnotate?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={onClose}>
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {type === 'photo' && onAnnotate && (
          <button
            onClick={(e) => { e.stopPropagation(); onAnnotate(); }}
            className="flex items-center gap-1.5 bg-white/20 text-white text-[13px] font-['Inter:Medium',sans-serif] px-3 py-1.5 rounded-[8px] active:bg-white/30"
          >
            <Edit3 size={13} />
            Annotate
            {annotationCount !== undefined && annotationCount > 0 && (
              <span className="ml-1 bg-white/30 px-1.5 py-0.5 rounded-full text-[11px]">
                {annotationCount}
              </span>
            )}
          </button>
        )}
        <button onClick={onClose} className="p-2 text-white active:opacity-60">
          <X size={24} />
        </button>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onPrev(); }}
        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white active:opacity-60 disabled:opacity-30"
        disabled={index === 0}>
        <ChevronLeft size={32} />
      </button>
      <div className="w-full h-full flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
        {type === 'photo'
          ? <img src={items[index]} alt="" className="max-w-full max-h-full object-contain" />
          : <video src={items[index]} controls autoPlay playsInline className="max-w-full max-h-full" />
        }
      </div>
      <button onClick={(e) => { e.stopPropagation(); onNext(); }}
        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white active:opacity-60 disabled:opacity-30"
        disabled={index === items.length - 1}>
        <ChevronRight size={32} />
      </button>
      <div className="absolute bottom-6 left-0 right-0 text-center text-white text-[14px]">
        {index + 1} / {items.length}
      </div>
    </div>
  );
}

// ─── Inspection item chip ─────────────────────────────────────────────────────

function ItemChip({ item }: { item: SiteInspectionItem }) {
  return (
    <div className="inline-flex items-center gap-1.5 bg-[#f3f3f5] border border-[rgba(0,0,0,0.1)] rounded-full px-3 py-1.5">
      <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[13px]">
        {item.type}
      </span>
      {item.count > 1 && (
        <span className="bg-[#0a0a0a] text-white text-[11px] font-['Inter:Medium',sans-serif] font-medium px-1.5 py-0.5 rounded-full leading-none">
          ×{item.count}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LocationDetail() {
  const { mountainId, locationId } = useParams();
  const navigate = useNavigate();
  const {
    getLocationById, getMountainById, getAssetsByLocationId, deleteLocation, getProjectById, updateLocation,
  } = useData();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // All media (consolidated location + inspection)
  const [locMedia, setLocMedia] = useState<{ photos: string[]; videos: string[] }>({ photos: [], videos: [] });
  const [mediaLoaded, setMediaLoaded] = useState(false);

  const [lightbox, setLightbox] = useState<{ items: string[]; index: number; type: 'photo' | 'video'; imageId?: string } | null>(null);
  const [showAnnotator, setShowAnnotator] = useState(false);
  const [currentAnnotations, setCurrentAnnotations] = useState<Annotation[]>([]);
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});

  const location = getLocationById(locationId!);
  const mountain = getMountainById(mountainId!);

  useEffect(() => {
    if (!locationId) return;
    Promise.all([
      locMediaDB.getLocationMedia(locationId),
      locMediaDB.getInspectionMedia(locationId),
    ]).then(async ([lm, im]) => {
      // Use local data if available; fall back to cloud signed URLs
      let finalLocMedia = lm;
      let finalInspMedia = im;

      const needsCloud = (lm.photos.length === 0 && lm.videos.length === 0) ||
                         (im.photos.length === 0 && im.videos.length === 0);

      if (needsCloud) {
        try {
          const urlMap = await cloudLocSync.fetchLocationMediaUrls([locationId]);
          const cloud = urlMap[locationId];
          if (cloud) {
            if (lm.photos.length === 0 && lm.videos.length === 0 && (cloud.loc?.photos?.length || cloud.loc?.videos?.length)) {
              finalLocMedia = { photos: cloud.loc?.photos ?? [], videos: cloud.loc?.videos ?? [] };
            }
            if (im.photos.length === 0 && im.videos.length === 0 && (cloud.insp?.photos?.length || cloud.insp?.videos?.length)) {
              finalInspMedia = { photos: cloud.insp?.photos ?? [], videos: cloud.insp?.videos ?? [] };
            }
          }
        } catch (e) {
          console.error('[LocationDetail] cloud media fetch error:', e);
        }
      }

      // Merge inspection media with location media
      const mergedPhotos = [...finalLocMedia.photos, ...finalInspMedia.photos];
      const mergedVideos = [...finalLocMedia.videos, ...finalInspMedia.videos];

      setLocMedia({
        photos: mergedPhotos,
        videos: mergedVideos,
      });

      // Load annotation counts for all photos
      const counts: Record<string, number> = {};
      for (let i = 0; i < mergedPhotos.length; i++) {
        const imageId = `loc-${locationId}-photo-${i}`;
        const annotations = await imageAnnotationsDB.getAnnotations(imageId);
        if (annotations.length > 0) {
          counts[imageId] = annotations.length;
        }
      }
      setAnnotationCounts(counts);

      setMediaLoaded(true);
    });
  }, [locationId]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteLocation(locationId!);
      toast.success(`"${location?.name}" deleted`);
      // Navigate back to trail if this location was on a trail, otherwise mountain
      if (location?.trailId) {
        navigate(`/mountains/${mountainId}/trails/${location.trailId}`);
      } else {
        navigate(`/mountains/${mountainId}`);
      }
    } catch {
      toast.error('Failed to delete. Please try again.');
      setIsDeleting(false);
    }
  };

  const handleOpenAnnotator = async () => {
    if (!lightbox || !lightbox.imageId) return;
    const annotations = await imageAnnotationsDB.getAnnotations(lightbox.imageId);
    setCurrentAnnotations(annotations);
    setShowAnnotator(true);
  };

  const handleSaveAnnotations = async (newAnnotations: Annotation[]) => {
    if (!lightbox || !lightbox.imageId) return;
    await imageAnnotationsDB.saveAnnotations(lightbox.imageId, newAnnotations);
    setCurrentAnnotations(newAnnotations);
    setAnnotationCounts(prev => ({
      ...prev,
      [lightbox.imageId!]: newAnnotations.length,
    }));
    setShowAnnotator(false);
  };

  if (!location || !mountain) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">Location not found</p>
          <button onClick={() => navigate(`/mountains/${mountainId}`)}
            className="mt-4 text-[#307fe2] font-['Inter:Medium',sans-serif]">
            Go back
          </button>
        </div>
      </div>
    );
  }

  // Update a single inspection's notes/action items (inspections live nested
  // inside the location, so this rewrites both the `inspections` array entry
  // and the `inspection` mirror if it points at the same one).
  const updateInspectionActivities = (inspId: string, activities: ContactActivity[]) => {
    const updatedInspections = (location.inspections || []).map(i => i.id === inspId ? { ...i, activities } : i);
    const updatedInspection = location.inspection?.id === inspId ? { ...location.inspection, activities } : location.inspection;
    updateLocation(location.id, { inspections: updatedInspections, inspection: updatedInspection });
  };

  const inspection = location.inspection;
  const totalInspItems = inspection?.items.reduce((s, i) => s + i.count, 0) || 0;
  const inspections = (location.inspections && location.inspections.length)
    ? [...location.inspections].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : (location.inspection ? [location.inspection] : []);
  const fmtInspDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  return (
    <div className="min-h-screen bg-[#f9fafb] pb-20">
      {/* Lightbox */}
      {lightbox && (
        <MediaLightbox
          {...lightbox}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox(prev => prev ? { ...prev, index: Math.max(0, prev.index - 1) } : null)}
          onNext={() => setLightbox(prev => prev ? { ...prev, index: Math.min(prev.items.length - 1, prev.index + 1) } : null)}
          annotationCount={lightbox.imageId ? annotationCounts[lightbox.imageId] : undefined}
          onAnnotate={lightbox.type === 'photo' ? handleOpenAnnotator : undefined}
        />
      )}

      {/* Image Annotator */}
      {showAnnotator && lightbox && lightbox.type === 'photo' && (
        <ImageAnnotator
          imageUrl={lightbox.items[lightbox.index]}
          initialAnnotations={currentAnnotations}
          onSave={handleSaveAnnotations}
          onClose={() => setShowAnnotator(false)}
        />
      )}

      {/* Delete modal */}
      {showDeleteModal && (
        <DeleteConfirmModal
          title={`Delete "${location.name}"?`}
          description={
            <>
              This will permanently delete this location
              {inspection && (
                <>
                  , the inspection with{' '}
                  <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                    {totalInspItems} item{totalInspItems !== 1 ? 's' : ''}
                  </span>
                </>
              )}
              , and all media. This cannot be undone.
            </>
          }
          isDeleting={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Map view */}
      {showMap && (
        <MountainMapView
          mountainId={mountainId!}
          onClose={() => setShowMap(false)}
          initialFocusLocationId={locationId}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => {
            if (location?.trailId) {
              navigate(`/mountains/${mountainId}/trails/${location.trailId}`);
            } else {
              navigate(`/mountains/${mountainId}`);
            }
          }} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>
          <div className="flex-1">
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px]">{mountain.name}</p>
            <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px] flex items-center gap-2">
              <MapPin size={20} className="text-[#ff5c39]" />
              {location.name}
            </h1>
          </div>
          <button onClick={() => setShowDeleteModal(true)}
            className="p-2 bg-[#fff0ee] rounded-[8px] active:bg-[#ffe0da]"
            aria-label="Delete location">
            <Trash2 size={20} className="text-[#ff5c39]" />
          </button>
          <Link to={`/mountains/${mountainId}/locations/${locationId}/edit`}>
            <button
              className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"
              aria-label="Edit location">
              <Pencil size={20} className="text-[#0a0a0a]" />
            </button>
          </Link>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Location meta ── */}
        {(location.trailName || location.coordinates || location.difficulty || location.notes) && (
          <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
            {location.trailName && (
              <div className="flex items-center gap-2">
                <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">Trail:</span>
                <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px]">
                  {location.trailName}
                </span>
              </div>
            )}
            {location.difficulty && (
              <div className="flex items-center gap-2">
                <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">Difficulty:</span>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div
                      key={i}
                      className={`w-6 h-6 rounded flex items-center justify-center text-[11px] font-['Inter:Medium',sans-serif] font-medium ${
                        i < location.difficulty!
                          ? 'bg-[#ff5c39] text-white'
                          : 'bg-[#f3f3f5] text-[#d1d5db]'
                      }`}
                    >
                      {i + 1}
                    </div>
                  ))}
                  <span className="ml-2 text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
                    ({location.difficulty === 1 ? 'Easy' : location.difficulty === 5 ? 'Hard' : `Level ${location.difficulty}`})
                  </span>
                </div>
              </div>
            )}
            {location.coordinates && (
              <button
                onClick={() => setShowMap(true)}
                className="flex items-start gap-3 w-full text-left active:bg-[#f9fafb] p-2 -m-2 rounded-[8px] transition-colors"
              >
                <div className="w-8 h-8 rounded-[8px] bg-[#f0faf4] flex items-center justify-center flex-shrink-0">
                  <MapPin size={16} className="text-[#22c55e]" />
                </div>
                <div className="flex-1">
                  <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px]">
                    GPS Coordinates{location.originalCoordinates && ' (Current)'}
                  </p>
                  <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[13px] mt-0.5">
                    {location.coordinates.latitude.toFixed(6)}, {location.coordinates.longitude.toFixed(6)}
                  </p>
                  <p className="text-[#307fe2] font-['Inter:Regular',sans-serif] text-[11px] mt-1">
                    Tap to view on map
                  </p>
                  {location.originalCoordinates && (
                    <div className="mt-2 pt-2 border-t border-[rgba(0,0,0,0.06)]">
                      <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px]">
                        Original GPS (Recorded {new Date(location.originalCoordinates.recordedAt).toLocaleDateString()})
                      </p>
                      <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mt-0.5">
                        {location.originalCoordinates.latitude.toFixed(6)}, {location.originalCoordinates.longitude.toFixed(6)}
                      </p>
                    </div>
                  )}
                </div>
              </button>
            )}
            {location.notes && (
              <div>
                <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Notes</p>
                <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] leading-relaxed whitespace-pre-wrap">
                  {location.notes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Photos ── */}
        {mediaLoaded && locMedia.photos.length > 0 && (
          <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <ImageIcon size={16} className="text-[#6a7282]" />
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Photos</h2>
              <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">{locMedia.photos.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {locMedia.photos.map((src, i) => {
                const imageId = `loc-${locationId}-photo-${i}`;
                return (
                  <button key={i} type="button"
                    onClick={() => setLightbox({ items: locMedia.photos, index: i, type: 'photo', imageId })}
                    className="aspect-square overflow-hidden rounded-[8px] active:opacity-80 relative">
                    <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    {annotationCounts[imageId] && (
                      <div className="absolute top-1 right-1 bg-[#307FE2] text-white text-[10px] font-['Inter:Medium',sans-serif] px-1.5 py-0.5 rounded-full">
                        {annotationCounts[imageId]}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Videos ── */}
        {mediaLoaded && locMedia.videos.length > 0 && (
          <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <VideoIcon size={16} className="text-[#6a7282]" />
              <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Videos</h2>
              <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">{locMedia.videos.length}</span>
            </div>
            <div className="space-y-2">
              {locMedia.videos.map((src, i) => (
                <button key={i} type="button"
                  onClick={() => setLightbox({ items: locMedia.videos, index: i, type: 'video' })}
                  className="w-full relative rounded-[8px] overflow-hidden bg-black active:opacity-80">
                  <video src={src} className="w-full max-h-48 object-contain" muted playsInline />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                      <div className="w-0 h-0 border-t-[8px] border-b-[8px] border-l-[14px] border-transparent border-l-white ml-1" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Inspections section ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">
              Inspections{inspections.length > 0 && <span className="ml-2 text-[#6a7282] text-[14px] font-normal">({inspections.length})</span>}
            </h2>
            <Link to={`/mountains/${mountainId}/locations/${locationId}/inspection`}>
              <button className="bg-[#0a0a0a] text-white rounded-[8px] px-3 py-2 flex items-center gap-1.5 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80">
                <Plus size={15} /> Add
              </button>
            </Link>
          </div>

          {inspections.length === 0 ? (
            <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-6 text-center">
              <ClipboardList className="mx-auto mb-3 text-[#6a7282]" size={36} />
              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px]">
                No inspections yet. Document what equipment is at this site.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {inspections.map((insp, idx) => {
                const count = insp.items.reduce((s, i) => s + i.count, 0);
                return (
                  <div key={insp.id || idx} className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ClipboardList size={16} className="text-[#0a0a0a]" />
                        <span className="bg-[#f3f3f5] text-[#0a0a0a] text-[12px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">{count} item{count !== 1 ? 's' : ''}</span>
                        {insp.difficulty && <span className="bg-[#fff3f0] text-[#ff5c39] text-[12px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">Difficulty {insp.difficulty}</span>}
                        {insp.projectId && (() => { const p = getProjectById(insp.projectId!); return p ? <span className="bg-[#eef3fb] text-[#307fe2] text-[12px] px-2 py-0.5 rounded-full">{p.name}</span> : null; })()}
                      </div>
                      <span className="text-[#6a7282] text-[12px]">
                        {insp.createdBy ? `${insp.createdBy} · ` : ''}{fmtInspDate(insp.createdAt)}
                      </span>
                    </div>
                    {insp.items.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {insp.items.map((item, i) => <ItemChip key={i} item={item} />)}
                      </div>
                    )}
                    {insp.notes && (
                      <div className="border-t border-[rgba(0,0,0,0.06)] pt-3">
                        <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Notes</p>
                        <p className="text-[#3d3d3d] font-['Inter:Regular',sans-serif] text-[14px] leading-relaxed whitespace-pre-wrap">{insp.notes}</p>
                      </div>
                    )}
                    <div className="border-t border-[rgba(0,0,0,0.06)] pt-3">
                      <ActivitySection
                        activities={insp.activities || []}
                        onAdd={(entry) => {
                          const full: ContactActivity = { ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
                          updateInspectionActivities(insp.id, [...(insp.activities || []), full]);
                        }}
                        onToggle={(id) => {
                          const updated = (insp.activities || []).map(a =>
                            a.id === id ? { ...a, completed: !a.completed, completedAt: !a.completed ? new Date().toISOString() : undefined } : a,
                          );
                          updateInspectionActivities(insp.id, updated);
                        }}
                        onDelete={(id) => updateInspectionActivities(insp.id, (insp.activities || []).filter(a => a.id !== id))}
                        onArchive={(id, archived) => updateInspectionActivities(insp.id, (insp.activities || []).map(a => a.id === id ? { ...a, archived } : a))}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}