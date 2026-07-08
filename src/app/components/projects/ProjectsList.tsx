import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, AlertTriangle, UserCircle2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import type { Project } from '../../context/DataContext';
import { INSTALL_STAGES } from './ProjectsPane';

function daysAgo(iso?: string) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? '1d ago' : `${d}d ago`;
}

const TYPE_BADGE: Record<string, string> = {
  Install: 'bg-[#eef3fb] text-[#307fe2]',
  Repair: 'bg-[#fef3f0] text-[#F95C39]',
  Upgrade: 'bg-[#f3edfb] text-[#7c3aed]',
};

// Company-wide project list — "your pipeline is actually your projects."
export function ProjectsList() {
  const { projects, mountains } = useData();
  const navigate = useNavigate();
  const [owner, setOwner] = useState('');
  const [region, setRegion] = useState('');
  const [search, setSearch] = useState('');

  const byId = useMemo(() => Object.fromEntries(mountains.map(m => [m.id, m])), [mountains]);

  const owners = useMemo(
    () => Array.from(new Set(projects.map(p => p.ownerName).filter(Boolean))).sort() as string[],
    [projects],
  );
  const regions = useMemo(
    () => Array.from(new Set(projects.map(p => byId[p.mountainId]?.region).filter(Boolean))).sort() as string[],
    [projects, byId],
  );

  const rows = useMemo(() => {
    let list = projects.map(p => ({ p, m: byId[p.mountainId] }));
    if (owner) list = list.filter(({ p }) => p.ownerName === owner);
    if (region) list = list.filter(({ m }) => m?.region === region);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(({ p, m }) =>
        p.name.toLowerCase().includes(q) ||
        (m?.name || '').toLowerCase().includes(q) ||
        (m?.address || '').toLowerCase().includes(q),
      );
    }
    // Active first, then by most-recently-updated.
    return list.sort((a, b) => {
      const aClosed = a.p.stage === 'Churned' || a.p.status === 'Done';
      const bClosed = b.p.stage === 'Churned' || b.p.status === 'Done';
      if (aClosed !== bClosed) return aClosed ? 1 : -1;
      return new Date(b.p.updatedAt).getTime() - new Date(a.p.updatedAt).getTime();
    });
  }, [projects, byId, owner, region, search]);

  const selectCls = 'bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[13px] text-[#0a0a0a] outline-none';

  const stageLabel = (p: Project) =>
    p.stage === 'Churned' ? 'Churned' : p.type === 'Install' ? (p.stage || 'Prospect') : (p.status || 'Open');

  return (
    <div className="min-h-screen bg-[#f9fafb]">

      <div className="p-4 space-y-3">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2 bg-[#f3f3f5] rounded-[8px] px-3 py-2 flex-1 min-w-[180px]">
            <Search size={15} className="text-[#6a7282]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search project, mountain, state…" className="bg-transparent outline-none text-[13px] text-[#0a0a0a] w-full" />
          </div>
          <select className={selectCls} value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">All owners</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select className={selectCls} value={region} onChange={e => setRegion(e.target.value)}>
            <option value="">All regions</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <p className="text-[12px] text-[#6a7282]">{rows.length} project{rows.length === 1 ? '' : 's'}</p>

        {/* Rows */}
        <div className="space-y-2">
          {rows.map(({ p, m }) => {
            const isInstall = p.type === 'Install';
            const idx = isInstall ? Math.max(0, INSTALL_STAGES.indexOf(p.stage || 'Prospect')) : 0;
            const pct = p.stage === 'Churned' ? 100 : isInstall
              ? Math.round(((idx + 1) / INSTALL_STAGES.length) * 100)
              : p.status === 'Done' ? 100 : p.status === 'In Progress' ? 50 : 10;
            const churned = p.stage === 'Churned';
            return (
              <button key={p.id} onClick={() => navigate(`/mountains/${p.mountainId}`)}
                className="w-full text-left bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-3 active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.14)]">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a] truncate">{p.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${TYPE_BADGE[p.type]}`}>{p.type}</span>
                    {p.isStalled && <span className="text-[10px] bg-[#fff4f1] text-[#F95C39] px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0"><AlertTriangle size={9} /> Stalled</span>}
                  </div>
                  <span className="text-[11px] text-[#8992a0] shrink-0">{daysAgo(p.updatedAt)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#f0f1f3] overflow-hidden mb-1.5">
                  <div className={`h-full rounded-full ${churned ? 'bg-[#c0c4cc]' : 'bg-[#307fe2]'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#6a7282]">
                  <span>{m?.name || 'Unknown mountain'}{m?.region ? ` · ${m.region}` : ''} · {stageLabel(p)}</span>
                  {p.ownerName && <span className="flex items-center gap-1 text-[#8992a0]"><UserCircle2 size={11} /> {p.ownerName}</span>}
                </div>
              </button>
            );
          })}
          {rows.length === 0 && <div className="text-center py-12 text-[#6a7282] text-[14px]">No projects match.</div>}
        </div>
      </div>
    </div>
  );
}
