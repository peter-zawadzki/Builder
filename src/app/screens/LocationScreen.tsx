import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Pencil, Trash2, Loader2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { useApi, type Location, type Inspection } from "../api/client";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";

export function LocationScreen() {
  const api = useApi();
  const navigate = useNavigate();
  const { mountainId, locationId } = useParams();

  const [location, setLocation] = useState<Location | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!locationId) return;
    let alive = true;
    api.getLocation(locationId)
      .then((r) => { if (alive) { setLocation(r.location); setInspections(r.inspections); } })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [api, locationId]);

  async function doDelete() {
    if (!locationId) return;
    setDeleting(true);
    try {
      await api.deleteLocation(locationId);
      toast.success("Location deleted");
      navigate(`/mountains/${mountainId}`);
    } catch (e: any) { toast.error(e.message); setDeleting(false); }
  }

  if (error) return <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center text-[#b23b3b]">{error}</div>;
  if (!location) return <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center"><Loader2 className="animate-spin text-[#6a7282]" size={24} /></div>;

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate(`/mountains/${mountainId}`)} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"><ArrowLeft size={20} className="text-[#6a7282]" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px] truncate">{location.name}</h1>
          {location.trail_name && <p className="text-[#6a7282] text-[13px]">{location.trail_name}</p>}
        </div>
        <button onClick={() => navigate(`/mountains/${mountainId}/locations/${locationId}/edit`)} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"><Pencil size={18} className="text-[#6a7282]" /></button>
        <button onClick={() => setConfirmDelete(true)} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"><Trash2 size={18} className="text-[#6a7282]" /></button>
      </div>

      <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-5 grid grid-cols-2 gap-4">
          {location.difficulty != null && <div><div className="text-[12px] text-[#6a7282]">Difficulty</div><div className="text-[14px] text-[#0a0a0a]">{location.difficulty} / 5</div></div>}
          {location.latitude != null && <div><div className="text-[12px] text-[#6a7282]">Coordinates</div><div className="text-[14px] text-[#0a0a0a]">{Number(location.latitude).toFixed(5)}, {Number(location.longitude).toFixed(5)}</div></div>}
          {location.notes && <div className="col-span-2"><div className="text-[12px] text-[#6a7282]">Notes</div><div className="text-[14px] text-[#0a0a0a] whitespace-pre-wrap">{location.notes}</div></div>}
        </div>

        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-5">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-3 flex items-center gap-2"><ClipboardCheck size={16} className="text-[#6a7282]" /> Inspections ({inspections.length})</h2>
          {inspections.length === 0 && <div className="text-[13px] text-[#6a7282]">No inspections logged.</div>}
          <div className="flex flex-col gap-3">
            {inspections.map((ins) => (
              <div key={ins.id} className="border border-[rgba(0,0,0,0.06)] rounded-[10px] p-3">
                <div className="text-[12px] text-[#6a7282] mb-1">{new Date(ins.created_at).toLocaleDateString()}</div>
                <div className="flex flex-wrap gap-1.5">
                  {(ins.items ?? []).map((it: any, i: number) => (
                    <span key={i} className="text-[12px] bg-[#f3f3f5] rounded px-2 py-0.5 text-[#0a0a0a]">{it.type}{it.count > 1 ? ` ×${it.count}` : ""}</span>
                  ))}
                </div>
                {ins.notes && <div className="text-[13px] text-[#0a0a0a] mt-2 whitespace-pre-wrap">{ins.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <DeleteConfirmModal
          title={`Delete "${location.name}"?`}
          description="Deletes this location, its inspections, and any assets placed here."
          isDeleting={deleting}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
