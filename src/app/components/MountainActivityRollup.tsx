import { Check, Circle, Lock } from 'lucide-react';
import { useData, getMountainRollupActivities, canCompleteActivity } from '../context/DataContext';
import type { ContactActivity, MountainActivityEntry } from '../context/DataContext';
import { useMyContact } from '../hooks/useMyContact';

const ORIGIN_LABEL: Record<MountainActivityEntry['origin'], string> = {
  general: 'General',
  person: 'Person',
  team: 'Team',
  project: 'Project',
  inspection: 'Inspection',
};
const ORIGIN_COLOR: Record<MountainActivityEntry['origin'], string> = {
  general: 'bg-[#f3f3f5] text-[#6a7282]',
  person: 'bg-[#eef3fb] text-[#307fe2]',
  team: 'bg-[#f3edfb] text-[#7c3aed]',
  project: 'bg-[#fff3e0] text-[#bf360c]',
  inspection: 'bg-[#eaf5ef] text-[#3f7a5c]',
};

// Read-only rollup of every note/action item relevant to a mountain — created
// directly on it, on an associated contact/team/project/inspection, or
// assigned to a person/team associated with it. Items are only ever created
// at their source; this view exists to see and (for actions) complete them.
export function MountainActivityRollup({ mountainId, type }: { mountainId: string; type: 'note' | 'action' }) {
  const { mountains, contacts, teams, projects, locations, updateMountain, updateContact, updateTeam, updateProject, updateLocation } = useData();
  const me = useMyContact();

  const items = getMountainRollupActivities(mountainId, { mountains, contacts, teams, projects, locations }).filter(a => a.type === type);

  const applyUpdate = (entry: MountainActivityEntry, updates: Partial<ContactActivity>) => {
    const apply = (list: ContactActivity[]) => list.map(a => a.id === entry.id ? { ...a, ...updates } : a);
    switch (entry.origin) {
      case 'general': {
        const m = mountains.find(mm => mm.id === mountainId);
        if (m) updateMountain(mountainId, { activities: apply(m.activities || []) });
        break;
      }
      case 'person': {
        const c = contacts.find(cc => cc.id === entry.originId);
        if (c) updateContact(c.id, { activities: apply(c.activities || []) });
        break;
      }
      case 'team': {
        const t = teams.find(tt => tt.id === entry.originId);
        if (t) updateTeam(t.id, { activities: apply(t.activities || []) });
        break;
      }
      case 'project': {
        const p = projects.find(pp => pp.id === entry.originId);
        if (p) updateProject(p.id, { activities: apply(p.activities || []) });
        break;
      }
      case 'inspection': {
        const loc = locations.find(l => (l.inspections || []).some(i => i.id === entry.originId));
        if (loc) {
          const inspections = (loc.inspections || []).map(i => i.id === entry.originId ? { ...i, activities: apply(i.activities || []) } : i);
          const inspection = loc.inspection?.id === entry.originId ? { ...loc.inspection, activities: apply(loc.inspection.activities || []) } : loc.inspection;
          updateLocation(loc.id, { inspections, inspection });
        }
        break;
      }
    }
  };

  const toggle = (entry: MountainActivityEntry) => {
    const now = new Date().toISOString();
    applyUpdate(entry, { completed: !entry.completed, completedAt: !entry.completed ? now : undefined });
  };

  if (type === 'action') {
    const open = items.filter(a => !a.completed);
    const done = items.filter(a => a.completed);
    return (
      <div className="space-y-2">
        {open.length === 0 ? (
          <div className="text-[12px] text-[#8992a0]">No open actions.</div>
        ) : (
          open.map(a => <ActionRow key={a.id} entry={a} me={me} onToggle={() => toggle(a)} />)
        )}
        {done.length > 0 && (
          <details className="mt-1">
            <summary className="text-[11px] text-[#8992a0] cursor-pointer select-none">Completed ({done.length})</summary>
            <div className="space-y-2 mt-1.5">
              {done.map(a => <ActionRow key={a.id} entry={a} me={me} onToggle={() => toggle(a)} />)}
            </div>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <div className="text-[12px] text-[#8992a0]">No notes yet.</div>
      ) : (
        items.map(n => <NoteRow key={n.id} entry={n} />)
      )}
    </div>
  );
}

function MetaLine({ entry }: { entry: MountainActivityEntry }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1">
      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${ORIGIN_COLOR[entry.origin]}`}>
        {ORIGIN_LABEL[entry.origin]}{entry.originLabel ? `: ${entry.originLabel}` : ''}
      </span>
      <span className="text-[11px] text-[#8992a0]">
        {entry.authorName ? `${entry.authorName} · ` : ''}{new Date(entry.createdAt).toLocaleDateString()}
      </span>
      {entry.assigneeName && (
        <span className="text-[11px] text-[#8992a0]">→ {entry.assigneeName}</span>
      )}
    </div>
  );
}

function ActionRow({ entry, me, onToggle }: { entry: MountainActivityEntry; me: ReturnType<typeof useMyContact>; onToggle: () => void }) {
  const canComplete = canCompleteActivity(entry, me);
  return (
    <div className="flex items-start gap-2">
      <button
        onClick={() => canComplete && onToggle()}
        disabled={!canComplete}
        title={canComplete ? (entry.completed ? 'Reopen' : 'Mark complete') : 'Only the creator or assignee can complete this'}
        className="mt-0.5 shrink-0 active:opacity-60 disabled:cursor-not-allowed"
      >
        {entry.completed
          ? <div className="w-[15px] h-[15px] rounded-full bg-[#22c55e] flex items-center justify-center"><Check size={10} className="text-white" /></div>
          : canComplete ? <Circle size={15} className="text-[#d1d5db]" /> : <Lock size={13} className="text-[#c0c4cc]" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] ${entry.completed ? 'text-[#8992a0] line-through' : 'text-[#0a0a0a]'}`}>{entry.text}</div>
        <MetaLine entry={entry} />
      </div>
    </div>
  );
}

function NoteRow({ entry }: { entry: MountainActivityEntry }) {
  return (
    <div className="bg-[#f9fafb] rounded-[8px] px-3 py-2">
      <div className="text-[13px] text-[#0a0a0a]">{entry.text}</div>
      <MetaLine entry={entry} />
    </div>
  );
}
