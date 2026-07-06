import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApi, type Trail } from "../api/client";

export function LocationFormScreen() {
  const api = useApi();
  const navigate = useNavigate();
  // trailId present when creating from a trail (pre-links); locationId when editing.
  const { mountainId, trailId, locationId } = useParams();
  const editing = Boolean(locationId);

  const [name, setName] = useState("");
  const [selectedTrail, setSelectedTrail] = useState<string>(trailId ?? "");
  const [difficulty, setDifficulty] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [trails, setTrails] = useState<Trail[]>([]);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mountainId) api.listTrails(mountainId).then((r) => setTrails(r.trails)).catch(() => {});
  }, [api, mountainId]);

  useEffect(() => {
    if (!locationId) return;
    api.getLocation(locationId)
      .then((r) => {
        const l = r.location;
        setName(l.name); setSelectedTrail(l.trail_id ?? ""); setDifficulty(l.difficulty != null ? String(l.difficulty) : "");
        setNotes(l.notes ?? ""); setLat(l.latitude != null ? String(l.latitude) : ""); setLng(l.longitude != null ? String(l.longitude) : "");
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [api, locationId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      trail_id: selectedTrail || null,
      difficulty: difficulty ? Number(difficulty) : null,
      notes,
      latitude: lat ? Number(lat) : null,
      longitude: lng ? Number(lng) : null,
    };
    try {
      if (editing && locationId) {
        await api.updateLocation(locationId, payload);
        navigate(`/mountains/${mountainId}/locations/${locationId}`);
      } else {
        const r = await api.createLocation({ mountain_id: mountainId!, ...payload } as any);
        navigate(`/mountains/${mountainId}/locations/${r.location.id}`);
      }
      toast.success("Saved");
    } catch (e: any) { toast.error(e.message); setSaving(false); }
  }

  if (loading) return <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center"><Loader2 className="animate-spin text-[#6a7282]" size={24} /></div>;

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]"><ArrowLeft size={20} className="text-[#6a7282]" /></button>
        <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px]">{editing ? "Edit location" : "New location"}</h1>
      </div>
      <form onSubmit={save} className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282]">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282]">Trail</span>
            <select value={selectedTrail} onChange={(e) => setSelectedTrail(e.target.value)} className="bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930]">
              <option value="">— none —</option>
              {trails.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282]">Difficulty (1–5)</span>
            <input type="number" min={1} max={5} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930]" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282]">Latitude</span>
              <input value={lat} onChange={(e) => setLat(e.target.value)} className="bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930]" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282]">Longitude</span>
              <input value={lng} onChange={(e) => setLng(e.target.value)} className="bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930]" />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282]">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930] resize-y" />
          </label>
        </div>
        <button type="submit" disabled={saving || !name.trim()} className="self-start bg-[#ff5c39] text-white rounded-[8px] px-5 py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] disabled:opacity-50 flex items-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />}{editing ? "Save changes" : "Create location"}
        </button>
      </form>
    </div>
  );
}
