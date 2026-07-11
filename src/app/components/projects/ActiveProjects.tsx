import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, AlertTriangle, ChevronRight, UserCircle2 } from 'lucide-react';
import { useData, PROJECT_STAGES_BY_TYPE, furthestCompletedStageIndex, isProjectCompleted } from '../../context/DataContext';
import { useMyContact, useCanSeeAll } from '../../hooks/useMyContact';
import { stageBarColor, StageChecklist } from './ProjectsPane';

const TYPE_BADGE: Record<string, string> = {
  Install: 'bg-[#eef3fb] text-[#307fe2]',
  Repair: 'bg-[#fef3f0] text-[#F95C39]',
  Upgrade: 'bg-[#f3edfb] text-[#7c3aed]',
  'Initial Onboarding': 'bg-[#e8f5e9] text-[#2e7d32]',
  'Followup Training': 'bg-[#fff3e0] text-[#bf360c]',
  'Special Event': 'bg-[#fce4ec] text-[#880e4f]',
};

// Dashboard widget — "your pipeline is your projects." Lists active projects
// across mountains, scoped to Mine (owner) or All (Employees only).
export function ActiveProjects({ scope = 'all' }: { scope?: 'mine' | 'all' }) {
  const { projects, mountains, teams } = useData();
  const navigate = useNavigate();
  const me = useMyContact();
  const [search, setSearch] = useState('');

  // Ambassadors are always locked to their own; no contact → can't compute mine.
  const canSeeAll = useCanSeeAll();
  const effective = !me ? 'all' : (scope === 'all' && canSeeAll) ? 'all' : 'mine';

  const rows = useMemo(() => {
    const byId = Object.fromEntries(mountains.map(m => [m.id, m]));
    const active = projects.filter(p => !isProjectCompleted(p));

    // Direct mountain projects, one row each.
    const directRows = active
      .filter(p => !!p.mountainId)
      .map(p => ({ p, m: byId[p.mountainId!] }));

    // Team projects roll up to every mountain their team is linked to — one
    // row per (project, mountain) pair, same as the mountain detail page.
    const teamRows = active
      .filter(p => !!p.teamId)
      .flatMap(p => {
        const team = teams.find(t => t.id === p.teamId);
        return (team?.mountainIds || []).map(mid => ({ p, m: byId[mid] })).filter(row => row.m);
      });

    let combined = [...directRows, ...teamRows];
    // "Mine" = projects I own OR projects on a mountain where I'm an affiliate.
    if (effective === 'mine') {
      combined = combined.filter(({ p, m }) =>
        me && (p.ownerContactId === me.id || (m as any)?.affiliateContactIds?.includes(me.id)),
      );
    }
    return combined.sort((a, b) => new Date(b.p.updatedAt).getTime() - new Date(a.p.updatedAt).getTime());
  }, [projects, mountains, teams, effective, me]);

  // Search across region, mountain name, and current status (stage label or
  // "stalled") — a single box covers all three since they're all just text.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ p, m }) => {
      const stages = PROJECT_STAGES_BY_TYPE[p.type];
      const furthestIndex = furthestCompletedStageIndex(p);
      const stageLabel = furthestIndex >= 0 ? stages[furthestIndex] : 'Not started';
      const haystack = [m?.name, m?.region, stageLabel, p.isStalled ? 'Stalled' : '', p.ownerName].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by region, status, mountain, or owner…"
          className="w-full bg-[#f3f3f5] rounded-[8px] pl-9 pr-3 py-2.5 text-[#0a0a0a] text-[13px] outline-none"
        />
      </div>
      {visibleRows.length === 0 ? (
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-6 text-center text-[13px] text-[#6a7282]">
          {search.trim() ? 'No projects match your search.' : effective === 'mine' ? 'No active projects owned by you.' : 'No active projects.'}
        </div>
      ) : (
        visibleRows.map(({ p, m }) => {
          const stages = PROJECT_STAGES_BY_TYPE[p.type];
          const furthestIndex = furthestCompletedStageIndex(p);
          const pct = furthestIndex >= 0 ? Math.round(((furthestIndex + 1) / stages.length) * 100) : 0;
          const label = furthestIndex >= 0 ? stages[furthestIndex] : 'Not started';
          const stageStatus = p.stageStatus || {};
          return (
            <div
              key={`${p.id}-${m?.id}`}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/mountains/${m?.id}`)}
              onKeyDown={e => { if (e.key === 'Enter') navigate(`/mountains/${m?.id}`); }}
              className="w-full text-left bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-3 cursor-pointer active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.14)]"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[14px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a] truncate">{p.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${TYPE_BADGE[p.type]}`}>{p.type}</span>
                  {p.isStalled && <span className="text-[10px] bg-[#fff4f1] text-[#F95C39] px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0"><AlertTriangle size={9} /> Stalled{p.stallReason ? `-${p.stallReason}` : ''}</span>}
                </div>
                <ChevronRight size={14} className="text-[#c0c4cc] shrink-0" />
              </div>
              <div className="h-1.5 rounded-full bg-[#f0f1f3] overflow-hidden mb-1.5">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: stageBarColor(pct) }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#6a7282] mb-1.5">
                <span className="truncate">
                  {m?.name || 'Unknown mountain'} · {label}
                  {p.teamId && (() => { const team = teams.find(t => t.id === p.teamId); return team ? ` · via ${team.name}` : ''; })()}
                </span>
                {p.ownerName && <span className="flex items-center gap-1 text-[#8992a0] shrink-0"><UserCircle2 size={11} /> {p.ownerName}</span>}
              </div>
              <StageChecklist stages={stages} stageStatus={stageStatus} stageDates={p.stageDates} readOnly lockedTitle="Status can only be updated by opening the project" />
            </div>
          );
        })
      )}
    </div>
  );
}
