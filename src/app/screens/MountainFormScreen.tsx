import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApi, type MountainInput } from "../api/client";

const FIELDS: { key: keyof MountainInput; label: string; type?: string }[] = [
  { key: "name", label: "Name" },
  { key: "address", label: "Address" },
  { key: "region", label: "Region" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "legal_entity", label: "Legal entity" },
  { key: "billing_address", label: "Billing address" },
];

export function MountainFormScreen() {
  const api = useApi();
  const navigate = useNavigate();
  const { mountainId } = useParams();
  const editing = Boolean(mountainId);

  const [form, setForm] = useState<MountainInput>({ name: "", status: "Prospect" });
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!mountainId) return;
    api.getMountain(mountainId)
      .then((r) => {
        const m = r.mountain;
        setForm({
          name: m.name, address: m.address, region: m.region, phone: m.phone,
          email: m.email, website: m.website, legal_entity: m.legal_entity,
          billing_address: m.billing_address, notes: m.notes, status: m.status,
        });
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [api, mountainId]);

  const set = (k: keyof MountainInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing && mountainId) {
        await api.updateMountain(mountainId, form);
        toast.success("Saved");
        navigate(`/mountains/${mountainId}`);
      } else {
        const r = await api.createMountain(form);
        toast.success("Mountain created");
        navigate(`/mountains/${r.mountain.id}`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#6a7282]" size={24} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]">
          <ArrowLeft size={20} className="text-[#6a7282]" />
        </button>
        <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px]">
          {editing ? "Edit mountain" : "New mountain"}
        </h1>
      </div>

      <form onSubmit={save} className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-5 flex flex-col gap-4">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282]">{f.label}</span>
              <input
                value={(form[f.key] as string) ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                className="bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930]"
              />
            </label>
          ))}
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282]">Status</span>
            <select
              value={form.status ?? "Prospect"}
              onChange={(e) => set("status", e.target.value)}
              className="bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930]"
            >
              <option>Prospect</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282]">Notes</span>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              className="bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[15px] outline-none border-2 border-transparent focus:border-[#1D2930] resize-y"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="self-start bg-[#ff5c39] text-white rounded-[8px] px-5 py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {editing ? "Save changes" : "Create mountain"}
        </button>
      </form>
    </div>
  );
}
