import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import {
  ArrowLeft, Plus, MapPin, Camera, Wifi, Box, Server,
  Pencil, Trash2, ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../context/DataContext';
import { DeleteConfirmModal } from './DeleteConfirmModal';

const assetIcons = { Camera, 'Network Gear': Wifi, Miscellaneous: Box, Server };

export function TrailDetail() {
  const { mountainId, trailId } = useParams();
  const navigate = useNavigate();
  const {
    trails, locations, assets,
    getMountainById, updateTrail, deleteTrail,
    getAssetsByLocationId,
    getInspectionsByLocationId,
  } = useData();

  const mountain = getMountainById(mountainId!);
  const trail = trails.find(t => t.id === trailId);
  // Include locations linked by trailId OR by matching trailName (legacy)
  const trailLocations = locations.filter(
    l => l.mountainId === mountainId &&
      (l.trailId === trailId || (!l.trailId && l.trailName === trail?.name))
  );

  const [showDelete, setShowDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(trail?.name || '');
  const [editNotes, setEditNotes] = useState(trail?.notes || '');

  if (!mountain || !trail) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">Trail not found</p>
          <button onClick={() => navigate(`/mountains/${mountainId}`)} className="mt-4 text-[#307fe2] font-['Inter:Medium',sans-serif]">
            Back to mountain
          </button>
        </div>
      </div>
    );
  }

  const handleSaveEdit = () => {
    if (!editName.trim()) { toast.error('Trail name is required'); return; }
    updateTrail(trailId!, { name: editName.trim(), notes: editNotes.trim() || undefined, isNastar: trail?.isNastar });
    setEditing(false);
    toast.success('Trail updated');
  };

  const handleDelete = async () => {
    await deleteTrail(trailId!);
    toast.success('Trail deleted');
    navigate(`/mountains/${mountainId}`);
  };

  const inp = "w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none";

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/mountains/${mountainId}`)} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px] truncate">{trail.name}</h1>
              {trail.isNastar && (
                <span className="bg-[#ff5c39] text-white text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                  NASTAR
                </span>
              )}
            </div>
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] truncate">{mountain.name}</p>
          </div>
          <button onClick={() => { setEditing(true); setEditName(trail.name); setEditNotes(trail.notes || ''); }}
            className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" aria-label="Edit trail">
            <Pencil size={18} className="text-[#0a0a0a]" />
          </button>
          <button onClick={() => setShowDelete(true)}
            className="p-2 bg-[#fff0ee] rounded-[8px] active:bg-[#ffe0da]" aria-label="Delete trail">
            <Trash2 size={18} className="text-[#ff5c39]" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5">

        {/* Edit form inline */}
        {editing && (
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-3">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Edit Trail</h2>
            <div>
              <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Trail Name</label>
              <input className={inp} value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Notes</label>
              <textarea className={`${inp} resize-none`} rows={3} value={editNotes} onChange={e => setEditNotes(e.target.value)} />
            </div>
            <button
              type="button"
              onClick={() => updateTrail(trailId!, { isNastar: !trail.isNastar })}
              className="flex items-center gap-3 w-full active:opacity-70"
            >
              <div className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center flex-shrink-0 transition-colors ${trail.isNastar ? 'bg-[#ff5c39] border-[#ff5c39]' : 'bg-white border-[#d1d5db]'}`}>
                {trail.isNastar && (
                  <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]">NASTAR trail</span>
            </button>
            <div className="flex gap-2">
              <button onClick={handleSaveEdit}
                className="flex-1 bg-[#ff5c39] text-white rounded-[8px] py-2.5 font-['Inter:Medium',sans-serif] font-medium active:opacity-80">
                Save
              </button>
              <button onClick={() => setEditing(false)}
                className="flex-1 bg-[#f3f3f5] text-[#0a0a0a] rounded-[8px] py-2.5 font-['Inter:Medium',sans-serif] font-medium active:opacity-70">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Trail notes */}
        {!editing && trail.notes && (
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px] leading-relaxed">{trail.notes}</p>
          </div>
        )}

        {/* Locations */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">
              Locations <span className="text-[#6a7282] text-[14px] font-normal">({trailLocations.length})</span>
            </h2>
          </div>

          <button
            onClick={() => navigate(`/mountains/${mountainId}/trails/${trailId}/locations/new`)}
            className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-3 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium mb-3 active:opacity-80"
          >
            <Plus size={20} />
            Add Location
          </button>

          {trailLocations.length === 0 ? (
            <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-8 text-center">
              <MapPin className="mx-auto mb-3 text-[#6a7282]" size={40} />
              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px]">
                No locations yet. Add your first installation point.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {trailLocations.map(location => {
                const locAssets = getAssetsByLocationId(location.id).filter(a => a.type !== 'Miscellaneous');
                const inspCount = getInspectionsByLocationId(location.id)[0]?.items.reduce((s, i) => s + i.count, 0) || 0;
                return (
                  <Link key={location.id} to={`/mountains/${mountainId}/locations/${location.id}`}>
                    <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 active:bg-[#f3f3f5] transition-colors">
                      <div className="flex items-start gap-3">
                        <MapPin size={20} className="text-[#ff5c39] flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">{location.name}</h3>
                          {location.notes && (
                            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mt-0.5 truncate">{location.notes}</p>
                          )}
                          {(location.difficulty || locAssets.length > 0 || inspCount > 0) && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {location.difficulty && (
                                <span className="bg-[#fff5f3] text-[#ff5c39] text-[12px] font-['Inter:Medium',sans-serif] font-medium px-2.5 py-1 rounded-full">
                                  Difficulty {location.difficulty}
                                </span>
                              )}
                              {locAssets.length > 0 && (
                                <span className="bg-[#FFe0D9] text-[#ff5c39] text-[12px] font-['Inter:Medium',sans-serif] font-medium px-2.5 py-1 rounded-full">
                                  {locAssets.length} Asset{locAssets.length !== 1 ? 's' : ''}
                                </span>
                              )}
                              {inspCount > 0 && (
                                <span className="bg-[#f3f3f5] text-[#0a0a0a] text-[12px] font-['Inter:Medium',sans-serif] font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                                  <ClipboardList size={11} />
                                  {inspCount} Inspection
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showDelete && (
        <DeleteConfirmModal
          title="Delete Trail"
          description={`This will remove the trail "${trail.name}" and unlink all its locations. Location data will not be deleted.`}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}