import * as locMediaDB from '../utils/locationMediaDB';
import * as cloudLocSync from '../utils/cloudLocationSync';
import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import { useData, SiteInspectionItem } from '../context/DataContext';
import {
  ArrowLeft, Plus, Camera, Wifi, Box, Server, MapPin, Trash2,
  ClipboardList, Pencil, Image as ImageIcon, Video as VideoIcon,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from './DeleteConfirmModal';

const assetIcons = {
  'Camera': Camera,
  'Network Gear': Wifi,
  'Miscellaneous': Box,
  'Server': Server,
};

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function MediaLightbox({
  items, index, type, onClose, onPrev, onNext,
}: {
  items: string[]; index: number; type: 'photo' | 'video';
  onClose: () => void; onPrev: () => void; onNext: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white active:opacity-60">
        <X size={24} />
      </button>
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
        <span className="bg-[#1D2930] text-white text-[11px] font-['Inter:Medium',sans-serif] font-medium px-1.5 py-0.5 rounded-full leading-none">
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
    getLocationById, getMountainById, getAssetsByLocationId, deleteLocation,
  } = useData();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Location-level media
  const [locMedia, setLocMedia] = useState<{ photos: string[]; videos: string[] }>({ photos: [], videos: [] });
  // Inspection media
  const [inspMedia, setInspMedia] = useState<{ photos: string[]; videos: string[] }>({ photos: [], videos: [] });
  const [mediaLoaded, setMediaLoaded] = useState(false);

  const [lightbox, setLightbox] = useState<{ items: string[]; index: number; type: 'photo' | 'video' } | null>(null);

  const location = getLocationById(locationId!);
  const mountain = getMountainById(mountainId!);
  const assets = getAssetsByLocationId(locationId!);
  const nonMiscAssets = assets.filter(a => a.type !== 'Miscellaneous');

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

      setLocMedia(finalLocMedia);
      setInspMedia(finalInspMedia);
      setMediaLoaded(true);
    });
  }, [locationId]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteLocation(locationId!);
      toast.success(`"${location?.name}" deleted`);
      navigate(`/mountains/${mountainId}`);
    } catch {
      toast.error('Failed to delete. Please try again.');
      setIsDeleting(false);
    }
  };

  if (!location || !mountain) {
    return (
      <div className="min-h-screen bg-[#F2F3F5] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif]">Location not found</p>
          <button onClick={() => navigate(`/mountains/${mountainId}`)}
            className="mt-4 text-[#307FE2] font-['Inter:Medium',sans-serif]">
            Go back
          </button>
        </div>
      </div>
    );
  }

  const inspection = location.inspection;
  const totalInspItems = inspection?.items.reduce((s, i) => s + i.count, 0) || 0;
  const inspDate = inspection?.createdAt
    ? new Date(inspection.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-[#F2F3F5] pb-20">
      {/* Lightbox */}
      {lightbox && (
        <MediaLightbox
          {...lightbox}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox(prev => prev ? { ...prev, index: Math.max(0, prev.index - 1) } : null)}
          onNext={() => setLightbox(prev => prev ? { ...prev, index: Math.min(prev.items.length - 1, prev.index + 1) } : null)}
        />
      )}

      {/* Delete modal */}
      {showDeleteModal && (
        <DeleteConfirmModal
          title={`Delete "${location.name}"?`}
          description={
            <>
              This will permanently delete this location
              {nonMiscAssets.length > 0 && (
                <>, its{' '}
                  <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
                    {nonMiscAssets.length} asset{nonMiscAssets.length !== 1 ? 's' : ''}
                  </span>
                </>
              )}
              {inspection && (
                <>, the inspection with{' '}
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

      {/* Header */}
      <div className="bg-white border-b border-[rgba(29,41,48,0.08)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate(`/mountains/${mountainId}`)} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#1D2930]" />
          </button>
          <div className="flex-1">
            <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[12px]">{mountain.name}</p>
            <h1 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[20px] flex items-center gap-2">
              <MapPin size={20} className="text-[#F95C39]" />
              {location.name}
            </h1>
          </div>
          <button onClick={() => setShowDeleteModal(true)}
            className="p-2 bg-[#FFEDE9] rounded-[8px] active:bg-[#FFCFC9]"
            aria-label="Delete location">
            <Trash2 size={20} className="text-[#F95C39]" />
          </button>
          <Link to={`/mountains/${mountainId}/locations/${locationId}/edit`}>
            <button
              className="p-2 bg-[#F2F3F5] rounded-[8px] active:bg-[#E8E9EA]"
              aria-label="Edit location">
              <Pencil size={20} className="text-[#1D2930]" />
            </button>
          </Link>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Location meta ── */}
        {(location.trailName || location.coordinates || location.notes) && (
          <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-4 space-y-3">
            {location.trailName && (
              <div className="flex items-center gap-2">
                <span className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px]">Trail:</span>
                <span className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[14px]">
                  {location.trailName}
                </span>
              </div>
            )}
            {location.coordinates && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-[8px] bg-[#f0faf4] flex items-center justify-center flex-shrink-0">
                  <MapPin size={16} className="text-[#22c55e]" />
                </div>
                <div>
                  <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[12px]">GPS Coordinates</p>
                  <p className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[13px] mt-0.5">
                    {location.coordinates.latitude.toFixed(6)}, {location.coordinates.longitude.toFixed(6)}
                  </p>
                </div>
              </div>
            )}
            {location.notes && (
              <div>
                <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Notes</p>
                <p className="text-[#1D2930] font-['Inter:Regular',sans-serif] text-[14px] leading-relaxed whitespace-pre-wrap">
                  {location.notes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Location photos ── */}
        {mediaLoaded && locMedia.photos.length > 0 && (
          <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <ImageIcon size={16} className="text-[#6D7B83]" />
              <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Location Photos</h2>
              <span className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px]">{locMedia.photos.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {locMedia.photos.map((src, i) => (
                <button key={i} type="button"
                  onClick={() => setLightbox({ items: locMedia.photos, index: i, type: 'photo' })}
                  className="aspect-square overflow-hidden rounded-[8px] active:opacity-80">
                  <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Location videos ── */}
        {mediaLoaded && locMedia.videos.length > 0 && (
          <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <VideoIcon size={16} className="text-[#6D7B83]" />
              <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Location Videos</h2>
              <span className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px]">{locMedia.videos.length}</span>
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

        {/* ── Assets section ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Assets</h2>
          </div>

          <Link to={`/mountains/${mountainId}/locations/${locationId}/assets/new`}>
            <button className="w-full bg-[#F95C39] text-white rounded-[10px] px-4 py-3.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium mb-3 active:opacity-80">
              <Plus size={20} />
              Add Asset
            </button>
          </Link>

          {assets.length === 0 ? (
            <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-6 text-center">
              <Camera className="mx-auto mb-3 text-[#6D7B83]" size={36} />
              <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[14px]">
                No assets yet. Add cameras, network gear, or servers.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {assets.map((asset) => {
                const Icon = assetIcons[asset.type];
                return (
                  <Link key={asset.id} to={`/mountains/${mountainId}/locations/${locationId}/assets/${asset.id}`}>
                    <div className="flex items-start gap-3 p-4 bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] active:bg-[#F2F3F5] transition-colors">
                      <Icon size={22} className="text-[#6D7B83] mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
                            {asset.type}
                          </span>
                          {asset.isDraft && (
                            <span className="bg-red-600 text-white text-[11px] px-2 py-0.5 rounded-[4px] font-['Inter:Medium',sans-serif]">
                              DRAFT
                            </span>
                          )}
                        </div>
                        {asset.networkCategory && (
                          <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px]">Category: {asset.networkCategory}</p>
                        )}
                        {(asset.manufacturer || asset.customManufacturer) && (
                          <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px]">
                            {asset.customManufacturer || asset.manufacturer} {asset.customModel || asset.model}
                          </p>
                        )}
                        {asset.serialNumber && (
                          <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px]">S/N: {asset.serialNumber}</p>
                        )}
                        {asset.ipAddress && (
                          <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px]">IP: {asset.ipAddress}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Inspection section ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Inspection</h2>
          </div>

          {!inspection ? (
            <>
              <Link to={`/mountains/${mountainId}/locations/${locationId}/inspection`}>
                <button className="w-full bg-[#1D2930] text-white rounded-[10px] px-4 py-3.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium active:opacity-80">
                  <Plus size={20} />
                  Add Inspection
                </button>
              </Link>
              <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-6 text-center mt-3">
                <ClipboardList className="mx-auto mb-3 text-[#6D7B83]" size={36} />
                <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[14px]">
                  No inspection yet. Document what equipment is at this site.
                </p>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-[12px] border border-[rgba(29,41,48,0.08)] p-4 space-y-4">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList size={18} className="text-[#1D2930]" />
                  <span className="text-[#1D2930] font-['Inter:Medium',sans-serif] font-medium text-[15px]">
                    Inspection
                  </span>
                  <span className="bg-[#F2F3F5] text-[#1D2930] text-[12px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                    {totalInspItems} item{totalInspItems !== 1 ? 's' : ''}
                  </span>
                </div>
                <Link to={`/mountains/${mountainId}/locations/${locationId}/inspection`}>
                  <button className="p-2 bg-[#F2F3F5] rounded-[8px] active:bg-[#E8E9EA]"
                    aria-label="Edit inspection">
                    <Pencil size={16} className="text-[#1D2930]" />
                  </button>
                </Link>
              </div>

              {/* Date */}
              {inspDate && (
                <p className="text-[#6D7B83] font-['Inter:Regular',sans-serif] text-[13px]">
                  Inspected {inspDate}
                </p>
              )}

              {/* Equipment chips */}
              <div className="flex flex-wrap gap-2">
                {inspection.items.map((item, i) => (
                  <ItemChip key={i} item={item} />
                ))}
              </div>

              {/* Notes */}
              {inspection.notes && (
                <div className="border-t border-[rgba(0,0,0,0.06)] pt-3">
                  <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-1">Notes</p>
                  <p className="text-[#3d3d3d] font-['Inter:Regular',sans-serif] text-[14px] leading-relaxed whitespace-pre-wrap">
                    {inspection.notes}
                  </p>
                </div>
              )}

              {/* Inspection photos */}
              {mediaLoaded && inspMedia.photos.length > 0 && (
                <div className="border-t border-[rgba(0,0,0,0.06)] pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon size={15} className="text-[#6a7282]" />
                    <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px]">Photos</span>
                    <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">{inspMedia.photos.length}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {inspMedia.photos.map((src, i) => (
                      <button key={i} type="button"
                        onClick={() => setLightbox({ items: inspMedia.photos, index: i, type: 'photo' })}
                        className="aspect-square overflow-hidden rounded-[8px] active:opacity-80">
                        <img src={src} alt={`Inspection photo ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Inspection videos */}
              {mediaLoaded && inspMedia.videos.length > 0 && (
                <div className="border-t border-[rgba(0,0,0,0.06)] pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <VideoIcon size={15} className="text-[#6a7282]" />
                    <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px]">Videos</span>
                    <span className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">{inspMedia.videos.length}</span>
                  </div>
                  <div className="space-y-2">
                    {inspMedia.videos.map((src, i) => (
                      <button key={i} type="button"
                        onClick={() => setLightbox({ items: inspMedia.videos, index: i, type: 'video' })}
                        className="w-full relative rounded-[8px] overflow-hidden bg-black active:opacity-80">
                        <video src={src} className="w-full max-h-36 object-contain" muted playsInline />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                            <div className="w-0 h-0 border-t-[7px] border-b-[7px] border-l-[12px] border-transparent border-l-white ml-1" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}