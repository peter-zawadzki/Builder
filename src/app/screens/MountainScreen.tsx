import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Pencil, Trash2, Loader2, Plus, ChevronRight, Mountain as MountainIcon, MapPin, Camera } from "lucide-react";
import { toast } from "sonner";
import { useApi, type Mountain, type Trail, type Location } from "../api/client";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";

function Field({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif]">{label}</span>
      <span className="text-[14px] text-[#0a0a0a]">{String(value)}</span>
    </div>
  );
}

function SectionHeader({ title, count, onAdd }: { title: string; count: number; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">
        {title} <span className="text-[#6a7282] font-normal">({count})</span>
      </h2>
      <button onClick={onAdd} className="p-1.5 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title={`Add ${title.slice(0, -1)}`}>
        <Plus size={16} className="text-[#6a7282]" />
      </button>
    </div>
  );
}

export function MountainScreen() {
  const api = useApi();
  const navigate = useNavigate();
  const { mountainId } = useParams();

  const [mountain, setMountain] = useState<Mountain | null>(null);
  const [project, setProject] = useState<any>(null);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!mountainId) return;
    let alive = true;
    Promise.all([api.getMountain(mountainId), api.listTrails(mountainId), api.listLocations({ mountainId })])
      .then(([m, t, l]) => {
        if (!alive) return;
        setMountain(m.mountain); setProject(m.project);
        setTrails(t.trails); setLocations(l.locations);
      })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [api, mountainId]);

  async function doDelete() {
    if (!mountainId) return;
    setDeleting(true);
    try {
      await api.deleteMountain(mountainId);
      toast.success("Mountain deleted");
      navigate("/");
    } catch (e: any) { toast.error(e.message); setDeleting(false); }
  }

  if (error) return <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center text-[#b23b3b]">{error}</div>;
  if (!mountain) return <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center"><Loader2 className="animate-spin text-[#6a7282]" size={24} /></div>;

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]">
          <ArrowLeft size={20} className="text-[#6a7282]" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px] truncate">{mountain.name}</h1>
          {project?.stage && <p className="text-[#6a7282] text-[13px]">{project.stage}</p>}
        </div>
        <button onClick={() => navigate(`/mountains/${mountainId}/edit`)} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title="Edit"><Pencil size={18} className="text-[#6a7282]" /></button>
        <button onClick={() => setConfirmDelete(true)} className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title="Delete"><Trash2 size={18} className="text-[#6a7282]" /></button>
      </div>

      <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        {/* Info */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-5 grid grid-cols-2 gap-4">
          <Field label="Status" value={mountain.status} />
          <Field label="Region" value={mountain.region} />
          <Field label="Address" value={mountain.address} />
          <Field label="Phone" value={mountain.phone} />
          <Field label="Email" value={mountain.email} />
          <Field label="Website" value={mountain.website} />
          <Field label="Timing systems" value={mountain.timing_systems?.join(", ")} />
        </div>

        {/* Trails */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-5">
          <SectionHeader title="Trails" count={trails.length} onAdd={() => navigate(`/mountains/${mountainId}/trails/new`)} />
          <div className="flex flex-col divide-y divide-[rgba(0,0,0,0.06)]">
            {trails.map((t) => (
              <Link key={t.id} to={`/mountains/${mountainId}/trails/${t.id}`} className="flex items-center gap-2 py-2.5 active:bg-[#f9fafb]">
                <MountainIcon size={15} className="text-[#6a7282]" />
                <span className="flex-1 text-[14px] text-[#0a0a0a]">{t.name}</span>
                {t.is_nastar && <span className="text-[10px] bg-[#eef3fb] text-[#307fe2] px-1.5 py-0.5 rounded">NASTAR</span>}
                <span className="text-[12px] text-[#6a7282]">{t.location_count ?? 0} loc</span>
                <ChevronRight size={15} className="text-[#c0c6cf]" />
              </Link>
            ))}
            {trails.length === 0 && <div className="py-3 text-[13px] text-[#6a7282]">No trails yet.</div>}
          </div>
        </div>

        {/* Locations */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-5">
          <SectionHeader title="Locations" count={locations.length} onAdd={() => navigate(`/mountains/${mountainId}/locations/new`)} />
          <div className="flex flex-col divide-y divide-[rgba(0,0,0,0.06)]">
            {locations.map((l) => (
              <Link key={l.id} to={`/mountains/${mountainId}/locations/${l.id}`} className="flex items-center gap-2 py-2.5 active:bg-[#f9fafb]">
                <MapPin size={15} className="text-[#6a7282]" />
                <span className="flex-1 min-w-0">
                  <span className="text-[14px] text-[#0a0a0a] block truncate">{l.name}</span>
                  {l.trail_name && <span className="text-[12px] text-[#6a7282]">{l.trail_name}</span>}
                </span>
                {(l.asset_count ?? 0) > 0 && <span className="text-[12px] text-[#6a7282] inline-flex items-center gap-1"><Camera size={12} />{l.asset_count}</span>}
                <ChevronRight size={15} className="text-[#c0c6cf]" />
              </Link>
            ))}
            {locations.length === 0 && <div className="py-3 text-[13px] text-[#6a7282]">No locations yet.</div>}
          </div>
        </div>

        {mountain.notes && (
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-5">
            <div className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif] mb-1">Notes</div>
            <div className="text-[14px] text-[#0a0a0a] whitespace-pre-wrap">{mountain.notes}</div>
          </div>
        )}
        <div className="text-[12px] text-[#8992a0] px-1">Inventory, CRM, sales and documents move onto this screen as each domain is migrated.</div>
      </div>

      {confirmDelete && (
        <DeleteConfirmModal
          title={`Delete ${mountain.name}?`}
          description="This permanently deletes the mountain and all its trails, locations, assets, notes, and project data."
          isDeleting={deleting}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
