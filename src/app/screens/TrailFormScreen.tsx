import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "../api/client";

export function TrailFormScreen() {
  const api = useApi();
  const navigate = useNavigate();
  const { mountainId, trailId } = useParams();
  const editing = Boolean(trailId);

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [isNastar, setIsNastar] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!trailId) return;
    api.getTrail(trailId)
      .then((r) => { setName(r.trail.name); setNotes(r.trail.notes ?? ""); setIsNastar(r.trail.is_nastar); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [api, trailId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing && trailId) {
        await api.updateTrail(trailId, { name: name.trim(), notes, is_nastar: isNastar });
        navigate(`/mountains/${mountainId}/trails/${trailId}`);
      } else {
        const r = await api.createTrail({ mountain_id: mountainId!, name: name.trim(), notes, is_nastar: isNastar });
        navigate(`/mountains/${mountainId}/trails/${r.trail.id}`);
      }
      toast.success("Saved");
    } catch (e: any) { toast.error(e.message); setSaving(false); }
  }

  if (loading) return <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center"><Loader2 className="animate-spin text-[#6a7282]" size={24} /></div>;

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"><ArrowLeft size={20} className="text-[#6a7282]" /></button>
        <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px]">{editing ? "Edit trail" : "New trail"}</h1>
      </div>
      <form onSubmit={save} className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282]">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282]">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930] resize-y" />
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isNastar} onChange={(e) => setIsNastar(e.target.checked)} />
            <span className="text-[14px] text-[#0a0a0a]">NASTAR trail</span>
          </label>
        </div>
        <button type="submit" disabled={saving || !name.trim()} className="self-start bg-[#ff5c39] text-white rounded-[8px] px-5 py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] disabled:opacity-50 flex items-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}{editing ? "Save changes" : "Create trail"}
        </button>
      </form>
    </div>
  );
}
