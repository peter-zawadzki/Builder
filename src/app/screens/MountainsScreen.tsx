import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { UserButton } from "@clerk/clerk-react";
import { Plus, Users, UserPlus, Database, Search, MapPin, Mountain as MountainIcon, Camera, StickyNote, Loader2, AlertTriangle } from "lucide-react";
import imgImageYullrLogo from "figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png";
import { useApi, type MountainSummary } from "../api/client";
import { useIsSuperAdmin } from "../hooks/useRole";

const STAGE_COLORS: Record<string, string> = {
  "Intro / Lead": "#6a7282",
  Demo: "#307fe2",
  "Site Assessment": "#307fe2",
  Proposal: "#c97a3d",
  Invoice: "#c97a3d",
  Install: "#3f7a5c",
  Commissioning: "#3f7a5c",
  Training: "#3f7a5c",
};

function StageBadge({ stage, stalled }: { stage: string | null; stalled?: boolean | null }) {
  const color = stage ? STAGE_COLORS[stage] ?? "#6a7282" : "#6a7282";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-['Inter:Medium',sans-serif]"
      style={{ backgroundColor: `${color}1a`, color }}>
      {stalled && <AlertTriangle size={11} />}
      {stage ?? "No stage"}
    </span>
  );
}

function Count({ icon, n }: { icon: React.ReactNode; n: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-[#6a7282]">
      {icon} {n}
    </span>
  );
}

export function MountainsScreen() {
  const api = useApi();
  const navigate = useNavigate();
  const isSuperAdmin = useIsSuperAdmin();

  const [mountains, setMountains] = useState<MountainSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    api.listMountains()
      .then((r) => alive && setMountains(r.mountains))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [api]);

  const filtered = useMemo(() => {
    if (!mountains) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return mountains;
    return mountains.filter(
      (m) => m.name.toLowerCase().includes(needle) || (m.address ?? "").toLowerCase().includes(needle)
    );
  }, [mountains, q]);

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4">
        <div className="flex flex-col items-center justify-center relative">
          <img src={imgImageYullrLogo} alt="Yullr" className="h-16 mb-3" />
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[24px]">
            Mountain Builder
          </h1>
          <div className="absolute left-0 top-0 flex items-center h-9">
            <UserButton appearance={{ elements: { avatarBox: { width: 34, height: 34 } } }} />
          </div>
          <div className="absolute right-0 top-0 flex items-center gap-2">
            <Link to="/mountains/new">
              <button className="p-2 bg-[#ff5c39] rounded-[8px] active:opacity-80" title="Add New Mountain">
                <Plus size={20} className="text-white" />
              </button>
            </Link>
            <Link to="/crm">
              <button className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title="CRM">
                <Users size={20} className="text-[#6a7282]" />
              </button>
            </Link>
            {isSuperAdmin && (
              <Link to="/team">
                <button className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title="Team & invites">
                  <UserPlus size={20} className="text-[#6a7282]" />
                </button>
              </Link>
            )}
            {isSuperAdmin && (
              <Link to="/system-check">
                <button className="p-2 bg-[#f3f3f5] rounded-[8px] active:bg-[#e8e8ea]" title="Local DB check">
                  <Database size={20} className="text-[#6a7282]" />
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 flex flex-col gap-4">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search mountains…"
            className="w-full bg-white border border-[rgba(0,0,0,0.1)] rounded-[10px] pl-9 pr-3 py-2.5 text-[15px] outline-none focus:border-[#1D2930]"
          />
        </div>

        {error && (
          <div className="bg-[#fbeceb] text-[#b23b3b] rounded-[10px] p-3 text-[14px]">{error}</div>
        )}

        {!mountains && !error && (
          <div className="flex items-center justify-center py-16 text-[#6a7282]">
            <Loader2 className="animate-spin" size={24} />
          </div>
        )}

        {mountains && (
          <div className="flex flex-col gap-2">
            <div className="text-[13px] text-[#6a7282] px-1">{filtered.length} mountains</div>
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(`/mountains/${m.id}`)}
                className="text-left bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4 active:bg-[#f3f3f5] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px] truncate">
                      {m.name}
                    </div>
                    {m.address && (
                      <div className="text-[#6a7282] text-[13px] flex items-center gap-1 mt-0.5">
                        <MapPin size={12} /> <span className="truncate">{m.address}</span>
                      </div>
                    )}
                  </div>
                  <StageBadge stage={m.project_stage} stalled={m.is_stalled} />
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <Count icon={<MountainIcon size={13} />} n={m.trail_count} />
                  <Count icon={<MapPin size={13} />} n={m.location_count} />
                  <Count icon={<Camera size={13} />} n={m.asset_count} />
                  <Count icon={<StickyNote size={13} />} n={m.note_count} />
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-[#6a7282] text-[14px]">No mountains match.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
