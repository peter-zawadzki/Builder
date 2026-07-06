import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Pencil, Trash2, Loader2, Plus, ChevronRight, MapPin, Camera } from "lucide-react";
import { toast } from "sonner";
import { useApi, type Trail, type Location } from "../api/client";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";

export function TrailScreen() {
  const api = useApi();
  const navigate = useNavigate();
  const { mountainId, trailId } = useParams();

  const [trail, setTrail] = useState<Trail | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!trailId) return;
    let alive = true;
    api.getTrail(trailId)
      .then((r) => { if (alive) { setTrail(r.trail); setLocations(r.locations); } })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [api, trailId]);

  async function doDelete() {
    if (!trailId) return;
    setDeleting(true);
    try {
      await api.deleteTrail(trailId);
      toast.success("Trail deleted");
      navigate(`/mountains/${mountainId}`);
    } catch (e: any) { toast.error(e.message); setDeleting(false); }
  }

  if (error) return <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center text-[#b23b3b]">{error}</div>;
  if (!trail) return <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center"><Loader2 className="animate-spin text-[#6a7282]" size={24} /></div>;

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate(`/mountains/${mountainId}`)} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"><ArrowLeft size={20} className="text-[#6a7282]" /></button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px] truncate">{trail.name}</h1>
          {trail.is_nastar && <span className="text-[10px] bg-[#eef3fb] text-[#307fe2] px-1.5 py-0.5 rounded">NASTAR</span>}
        </div>
        <button onClick={() => navigate(`/mountains/${mountainId}/trails/${trailId}/edit`)} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"><Pencil size={18} className="text-[#6a7282]" /></button>
        <button onClick={() => setConfirmDelete(true)} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"><Trash2 size={18} className="text-[#6a7282]" /></button>
      </div>

      <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        {trail.notes && (
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-5 text-[14px] text-[#0a0a0a] whitespace-pre-wrap">{trail.notes}</div>
        )}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Locations <span className="text-[#6a7282] font-normal">({locations.length})</span></h2>
            <button onClick={() => navigate(`/mountains/${mountainId}/trails/${trailId}/locations/new`)} className="p-1.5 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"><Plus size={16} className="text-[#6a7282]" /></button>
          </div>
          <div className="flex flex-col divide-y divide-[rgba(0,0,0,0.06)]">
            {locations.map((l) => (
              <Link key={l.id} to={`/mountains/${mountainId}/locations/${l.id}`} className="flex items-center gap-2 py-2.5 active:bg-[#f9fafb]">
                <MapPin size={15} className="text-[#6a7282]" />
                <span className="flex-1 text-[14px] text-[#0a0a0a] truncate">{l.name}</span>
                {(l.asset_count ?? 0) > 0 && <span className="text-[12px] text-[#6a7282] inline-flex items-center gap-1"><Camera size={12} />{l.asset_count}</span>}
                <ChevronRight size={15} className="text-[#c0c6cf]" />
              </Link>
            ))}
            {locations.length === 0 && <div className="py-3 text-[13px] text-[#6a7282]">No locations on this trail.</div>}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <DeleteConfirmModal
          title={`Delete ${trail.name}?`}
          description="Deletes the trail. Its locations are kept but unlinked from it."
          isDeleting={deleting}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
