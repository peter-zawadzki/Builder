import { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { Plus, X, AlertTriangle, ChevronRight, UserCircle2, Repeat2, Pencil, Archive, Trash2, Check, Calendar as CalendarIcon } from 'lucide-react';
import { useData, PROJECT_STAGES_BY_TYPE, furthestCompletedStageIndex, isProjectCompleted, getMountainProjects, nextStageStatus } from '../../context/DataContext';
import type { Project, ProjectType, ProjectStage, StallReason, ContactActivity, StageStatus } from '../../context/DataContext';
import { ActivitySection } from '../ActivitySection';
import { DeleteConfirmModal } from '../DeleteConfirmModal';
import { DiscardChangesModal } from '../DiscardChangesModal';
import { useMyContact } from '../../hooks/useMyContact';

// Project types available when creating a project under a Mountain vs. a Team.
export const MOUNTAIN_PROJECT_TYPES: ProjectType[] = ['Install', 'Repair', 'Upgrade', 'Special Event'];
export const TEAM_PROJECT_TYPES: ProjectType[] = ['Initial Onboarding', 'Followup Training', 'Special Event'];

const STALL_REASONS: StallReason[] = ['No response', 'Waiting on legal', 'Budget hold', 'Timing — offseason', 'Other'];
const TYPE_BADGE: Record<ProjectType, string> = {
  Install: 'bg-[#eef3fb] text-[#307fe2]',
  Repair: 'bg-[#fef3f0] text-[#F95C39]',
  Upgrade: 'bg-[#f3edfb] text-[#7c3aed]',
  'Initial Onboarding': 'bg-[#e8f5e9] text-[#2e7d32]',
  'Followup Training': 'bg-[#fff3e0] text-[#bf360c]',
  'Special Event': 'bg-[#fce4ec] text-[#880e4f]',
};

// Interpolates red (just started) → green (completed) for the progress bar fill.
export function stageBarColor(pct: number): string {
  const from = { r: 239, g: 68, b: 68 };   // red-500
  const to = { r: 34, g: 197, b: 94 };     // green-500
  const t = Math.max(0, Math.min(1, pct / 100));
  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b = Math.round(from.b + (to.b - from.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function useAuthor() {
  const { user } = useUser();
  return user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';
}

const STAGE_STATUS_DOT: Record<StageStatus, string> = {
  not_started: 'bg-white border-[#d1d5db]',
  blocked: 'bg-[#f97316] border-[#f97316]',
  in_progress: 'bg-[#eab308] border-[#eab308]',
  done: 'bg-[#22c55e] border-[#22c55e]',
};
const STAGE_STATUS_LABEL_COLOR: Record<StageStatus, string> = {
  not_started: 'text-[#8992a0]',
  blocked: 'text-[#c2410c]',
  in_progress: 'text-[#a16207]',
  done: 'text-[#3f7a5c] font-medium',
};

function StageStatusDot({ status }: { status: StageStatus }) {
  return (
    <span className={`w-4 h-4 rounded-full flex items-center justify-center border shrink-0 ${STAGE_STATUS_DOT[status]}`}>
      {status === 'not_started' && <X size={9} className="text-[#c0c4cc]" />}
      {status === 'done' && <Check size={10} className="text-white" />}
    </span>
  );
}

// Each stage cycles independently through 4 states (not started/blocked/in
// progress/done) — a stage can be skipped without blocking later ones.
// Status can only be changed here when onToggle+dates editing are provided
// (i.e. inside the project detail modal); everywhere else this renders
// read-only, per the rule that status is only editable from the modal.
//
// Two visual modes:
// - Default (compact status-bar views like the project card / homepage
//   widget): a single row, dot + label only, no dates, never wraps.
// - `stacked` (the project detail modal only): wraps across two rows with
//   room for a calendar icon next to each label; tapping it opens a small
//   date picker to set/change/clear that stage's date.
export function StageChecklist({
  stages, stageStatus, stageDates, onToggle, onDateChange, readOnly, lockedTitle, stacked,
}: {
  stages: ProjectStage[];
  stageStatus: Partial<Record<ProjectStage, StageStatus>>;
  stageDates?: Partial<Record<ProjectStage, string>>;
  onToggle?: (stage: ProjectStage) => void;
  onDateChange?: (stage: ProjectStage, date: string) => void;
  readOnly?: boolean;
  lockedTitle?: string;
  stacked?: boolean;
}) {
  const [openDateStage, setOpenDateStage] = useState<ProjectStage | null>(null);

  if (!stacked) {
    return (
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map(s => {
          const status = stageStatus[s] || 'not_started';
          return (
            <div key={s} title={lockedTitle} className="flex flex-col items-center gap-1 py-1">
              <StageStatusDot status={status} />
              <span className={`text-[9px] text-center leading-tight ${STAGE_STATUS_LABEL_COLOR[status]}`}>{s}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const cols = Math.max(1, Math.ceil(stages.length / 2));
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };

  return (
    <div className="grid gap-x-2 gap-y-3" style={gridStyle}>
      {stages.map(s => {
        const status = stageStatus[s] || 'not_started';
        const date = stageDates?.[s];
        const dot = <StageStatusDot status={status} />;
        const isOpen = openDateStage === s;

        return (
          <div key={s} className="relative flex flex-col items-center gap-1 py-1">
            {onToggle ? (
              <button type="button" onClick={e => { e.stopPropagation(); onToggle(s); }} className="active:opacity-70" title={lockedTitle}>{dot}</button>
            ) : (
              <div title={lockedTitle}>{dot}</div>
            )}
            <div className="flex items-center gap-1">
              <span className={`text-[9px] text-center leading-tight ${STAGE_STATUS_LABEL_COLOR[status]}`}>{s}</span>
              {onDateChange && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setOpenDateStage(isOpen ? null : s); }}
                  className="shrink-0 active:opacity-70"
                  title={date ? 'Change or clear date' : 'Add a date'}
                >
                  <CalendarIcon size={10} className={date ? 'text-[#307fe2]' : 'text-[#c0c4cc]'} />
                </button>
              )}
            </div>
            {date && (
              <span className="text-[8px] text-[#8992a0] text-center leading-tight">
                {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
            {isOpen && onDateChange && (
              <div
                className="absolute z-10 top-full mt-1 bg-white rounded-[8px] border border-[rgba(0,0,0,0.1)] shadow-lg p-2 flex flex-col gap-1.5 whitespace-nowrap"
                onClick={e => e.stopPropagation()}
              >
                <input
                  type="date"
                  value={date || ''}
                  onChange={e => { onDateChange(s, e.target.value); setOpenDateStage(null); }}
                  autoFocus
                  className="text-[11px] outline-none"
                />
                {date && (
                  <button type="button" onClick={() => { onDateChange(s, ''); setOpenDateStage(null); }} className="text-[10px] text-[#F95C39] text-left">
                    Clear date
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Pane ────────────────────────────────────────────────────────────────────

export function ProjectsPane({ mountainId, teamId }: { mountainId?: string; teamId?: string }) {
  const { getProjectsByTeamId, projects: allProjectsData, teams } = useData();
  // A mountain's Projects list includes its own directly-owned projects plus
  // any project created under a Team that's linked to this mountain.
  const allProjects = mountainId ? getMountainProjects(mountainId, { projects: allProjectsData, teams }) : getProjectsByTeamId(teamId!);
  const availableTypes = mountainId ? MOUNTAIN_PROJECT_TYPES : TEAM_PROJECT_TYPES;
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const projects = allProjects.filter(p => showArchived ? p.archived : !p.archived);
  const active = projects.filter(p => !isProjectCompleted(p));
  const closed = projects.filter(p => isProjectCompleted(p));
  const archivedCount = allProjects.filter(p => p.archived).length;

  return (
    <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
          Projects
          {projects.length > 0 && <span className="ml-2 text-[#6a7282] text-[13px] font-normal">({projects.length})</span>}
        </h2>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <button onClick={() => setShowArchived(v => !v)} className={`px-2.5 py-1.5 rounded-[8px] text-[12px] font-['Inter:Medium',sans-serif] ${showArchived ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>Archived</button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="bg-[#ff5c39] text-white rounded-[8px] px-2.5 py-1.5 flex items-center gap-1 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80"
          >
            <Plus size={14} /> New
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-[13px] text-[#6a7282]">
          {showArchived ? 'No archived projects.' : 'No projects yet.'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {[...active, ...closed].map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={() => setEditId(p.id)}
              viaTeamName={mountainId && p.mountainId !== mountainId ? teams.find(t => t.id === p.teamId)?.name : undefined}
            />
          ))}
        </div>
      )}

      {showForm && <ProjectForm mountainId={mountainId} teamId={teamId} availableTypes={availableTypes} onClose={() => setShowForm(false)} />}
      {editId && <ProjectDetailModal projectId={editId} onClose={() => setEditId(null)} />}
    </div>
  );
}

// ─── Card (progress bar) ───────────────────────────────────────────────────

function ProjectCard({ project, onOpen, viaTeamName }: { project: Project; onOpen: () => void; viaTeamName?: string }) {
  const stages = PROJECT_STAGES_BY_TYPE[project.type];
  const furthestIndex = furthestCompletedStageIndex(project);
  const pct = furthestIndex >= 0 ? Math.round(((furthestIndex + 1) / stages.length) * 100) : 0;
  const currentLabel = furthestIndex >= 0 ? stages[furthestIndex] : 'Not started';
  const stageStatus = project.stageStatus || {};

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}
      className="w-full text-left border border-[rgba(0,0,0,0.08)] rounded-[10px] p-3 cursor-pointer active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.14)]"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a] truncate">{project.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-['Inter:Medium',sans-serif] uppercase tracking-wide shrink-0 ${TYPE_BADGE[project.type]}`}>{project.type}</span>
          {project.isStalled && <span className="text-[10px] bg-[#fff4f1] text-[#F95C39] px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0"><AlertTriangle size={9} /> Stalled{project.stallReason ? `-${project.stallReason}` : ''}</span>}
        </div>
        <ChevronRight size={14} className="text-[#c0c4cc] shrink-0" />
      </div>
      <div className="h-1.5 rounded-full bg-[#f0f1f3] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: stageBarColor(pct) }} />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[11px] text-[#6a7282]">{currentLabel}{viaTeamName ? ` · via ${viaTeamName}` : ''}</span>
        {project.ownerName && <span className="text-[11px] text-[#8992a0] flex items-center gap-1"><UserCircle2 size={11} /> {project.ownerName}</span>}
      </div>
      <div className="mt-1.5">
        <StageChecklist
          stages={stages}
          stageStatus={stageStatus}
          stageDates={project.stageDates}
          readOnly
          lockedTitle="Status can only be updated by opening the project"
        />
      </div>
    </div>
  );
}

// Compact, read-only progress bar for a single project — used on the mountains
// list so each mountain card can show a bar per project.
export function ProjectMiniBar({ project }: { project: Project }) {
  const stages = PROJECT_STAGES_BY_TYPE[project.type];
  const furthestIndex = furthestCompletedStageIndex(project);
  const pct = furthestIndex >= 0 ? Math.round(((furthestIndex + 1) / stages.length) * 100) : 0;
  const label = furthestIndex >= 0 ? stages[furthestIndex] : 'Not started';
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a] truncate">{project.name}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-['Inter:Medium',sans-serif] uppercase tracking-wide shrink-0 ${TYPE_BADGE[project.type]}`}>{project.type}</span>
          {project.isStalled && <span className="text-[9px] bg-[#fff4f1] text-[#F95C39] px-1.5 py-0.5 rounded-full shrink-0">Stalled{project.stallReason ? `-${project.stallReason}` : ''}</span>}
        </div>
        {project.ownerName && <span className="text-[10px] text-[#8992a0] shrink-0 truncate max-w-[40%]">{project.ownerName}</span>}
      </div>
      <div className="h-1.5 rounded-full bg-[#f0f1f3] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: stageBarColor(pct) }} />
      </div>
      <div className="text-[10px] text-[#6a7282] mt-0.5">{label}</div>
    </div>
  );
}

// ─── YULLR contact owner picker ──────────────────────────────────────────────

// Owner is a member of the YULLR organization (our employees).
function OwnerSelect({ value, onChange, className }: { value: string; onChange: (id: string) => void; className: string }) {
  const { contacts, organizations } = useData();
  const yullrOrg = organizations.find(o => o.name.trim().toLowerCase() === 'yullr');
  const members = yullrOrg
    ? contacts.filter(c => c.organizationId === yullrOrg.id).sort((a, b) => a.name.localeCompare(b.name))
    : [];
  return (
    <>
      <select className={className} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— Unassigned —</option>
        {members.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {!yullrOrg && (
        <p className="text-[11px] text-[#8992a0] mt-1.5">No “YULLR” organization found — create it in the CRM and add your team as contacts under it.</p>
      )}
      {yullrOrg && members.length === 0 && (
        <p className="text-[11px] text-[#8992a0] mt-1.5">No contacts under the YULLR organization yet — add your team in the CRM.</p>
      )}
    </>
  );
}

// ─── Create form ─────────────────────────────────────────────────────────────

function ProjectForm({ mountainId, teamId, availableTypes, onClose }: { mountainId?: string; teamId?: string; availableTypes: ProjectType[]; onClose: () => void }) {
  const { addProject, contacts } = useData();
  const createdBy = useAuthor();
  const me = useMyContact();
  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>(availableTypes[0]);
  const [notes, setNotes] = useState('');
  const [ownerContactId, setOwnerContactId] = useState('');

  const save = () => {
    if (!name.trim()) { toast.error('Project name is required'); return; }
    const owner = contacts.find(c => c.id === ownerContactId);
    addProject({
      mountainId,
      teamId,
      name: name.trim(),
      notes: notes.trim() || undefined,
      type,
      stageStatus: {},
      ownerContactId: owner?.id,
      ownerName: owner?.name,
      createdBy,
      createdByContactId: me?.id,
    });
    toast.success('Project created');
    onClose();
  };

  const inputCls = 'w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[16px] w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">New Project</h2>
          <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Name *</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Eggbeater + Links" autoFocus />
          </div>
          {availableTypes.length > 1 && (
            <div>
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Type</label>
              <div className="flex flex-wrap gap-2">
                {availableTypes.map(t => (
                  <button key={t} type="button" onClick={() => setType(t)} className={`px-3 py-2 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] ${type === t ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>{t}</button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Notes</label>
            <textarea className={`${inputCls} resize-none`} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything worth capturing up front…" />
          </div>
          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Owner</label>
            <OwnerSelect value={ownerContactId} onChange={setOwnerContactId} className={inputCls} />
          </div>
          <div className="text-[12px] text-[#6a7282] flex items-center gap-1.5">
            <UserCircle2 size={13} /> Created by <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif]">{createdBy}</span>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex gap-3">
          <button onClick={onClose} className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Cancel</button>
          <button onClick={save} className="flex-1 bg-[#ff5c39] text-white rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Create</button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail / edit ─────────────────────────────────────────────────────────

function ProjectDetailModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { getProjectById, updateProject, deleteProject, transferProjectOwner, contacts, logActivity } = useData();
  const project = getProjectById(projectId);
  const me = useMyContact();
  const [isEditMode, setIsEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [stallOpen, setStallOpen] = useState(false);
  const [stallReason, setStallReason] = useState<StallReason>('No response');
  const [stallNote, setStallNote] = useState('');
  const buildForm = () => ({
    name: project?.name || '',
    type: project?.type,
    ownerContactId: project?.ownerContactId || '',
  });
  const [form, setForm] = useState(buildForm);

  if (!project) { onClose(); return null; }
  const isOwner = !!me && project.ownerContactId === me.id;
  // Stage status/date is the one thing both the owner AND the original
  // creator can manage — everything else stays owner-only.
  const canManageStage = !!me && (project.ownerContactId === me.id || project.createdByContactId === me.id);
  const availableTypes = project.teamId ? TEAM_PROJECT_TYPES : MOUNTAIN_PROJECT_TYPES;
  const stages = PROJECT_STAGES_BY_TYPE[project.type];
  const stageStatus = project.stageStatus || {};

  // Name/Type/Owner are staged — nothing writes until Apply.
  const set = (k: string, v: any) => { setForm(prev => ({ ...prev, [k]: v })); setDirty(true); };

  const enterEdit = () => { setForm(buildForm()); setDirty(false); setIsEditMode(true); };

  const applyChanges = () => {
    const updates: { name?: string; type?: ProjectType; stageStatus?: {}; stageDates?: {} } = {};
    if (form.name.trim() && form.name.trim() !== project.name) updates.name = form.name.trim();
    if (form.type && form.type !== project.type) {
      // Stage list is entirely different per type — start fresh rather than
      // carrying over statuses that don't correspond to the new sequence.
      updates.type = form.type;
      updates.stageStatus = {};
      updates.stageDates = {};
    }
    if (Object.keys(updates).length) updateProject(project.id, updates);
    if (form.ownerContactId !== (project.ownerContactId || '')) {
      const c = contacts.find(x => x.id === form.ownerContactId);
      transferProjectOwner(project.id, form.ownerContactId, c?.name || '');
    }
    setIsEditMode(false);
    setDirty(false);
    toast.success('Project updated');
  };

  const discardChanges = () => {
    setForm(buildForm());
    setDirty(false);
    setIsEditMode(false);
  };

  const handleClose = () => {
    if (isEditMode && dirty) { setShowDiscardConfirm(true); return; }
    onClose();
  };

  const cycleStage = (stage: ProjectStage) => {
    if (!canManageStage) return;
    const updated = { ...stageStatus, [stage]: nextStageStatus(stageStatus[stage]) };
    updateProject(project.id, { stageStatus: updated });
    logActivity(project.mountainId, 'stage_changed', `Project "${project.name}": ${stage} → ${updated[stage]}`);
  };

  const setStageDate = (stage: ProjectStage, date: string) => {
    if (!canManageStage) return;
    const updated = { ...(project.stageDates || {}), [stage]: date || undefined };
    updateProject(project.id, { stageDates: updated });
  };

  const applyStall = () => {
    if (!isOwner) return;
    if (stallReason === 'Other' && !stallNote.trim()) { toast.error('A note is required for "Other".'); return; }
    updateProject(project.id, { isStalled: true, stallReason, stallNote: stallNote.trim() || undefined });
    logActivity(project.mountainId, 'stalled', `Project "${project.name}" stalled: ${stallReason}${stallNote.trim() ? ` — ${stallNote.trim()}` : ''}`);
    setStallOpen(false);
    toast.success('Marked stalled');
  };

  const clearStall = () => {
    if (!isOwner) return;
    updateProject(project.id, { isStalled: false, stallReason: undefined, stallNote: undefined });
    logActivity(project.mountainId, 'stall_cleared', `Project "${project.name}" stall cleared`);
  };

  const addActivity = (entry: Omit<ContactActivity, 'id' | 'createdAt'>) => {
    const full: ContactActivity = { ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    updateProject(project.id, { activities: [...(project.activities || []), full] });
    logActivity(project.mountainId, entry.type === 'note' ? 'note_added' : 'action_added', `${entry.type === 'note' ? 'Note' : 'Action item'} added for project "${project.name}": ${entry.text}`, project.mountainId ? undefined : project.teamId ? `/crm?tab=teams&open=${project.teamId}` : undefined);
  };
  const toggleActivity = (id: string) => {
    const updated = (project.activities || []).map(a =>
      a.id === id ? { ...a, completed: !a.completed, completedAt: !a.completed ? new Date().toISOString() : undefined } : a,
    );
    updateProject(project.id, { activities: updated });
  };
  const deleteActivity = (id: string) => {
    updateProject(project.id, { activities: (project.activities || []).filter(a => a.id !== id) });
  };
  const archiveActivity = (id: string, archived: boolean) => {
    updateProject(project.id, { activities: (project.activities || []).map(a => a.id === id ? { ...a, archived } : a) });
  };

  const inputCls = 'w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[16px] w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <div className="min-w-0 pr-3 flex-1">
            {isEditMode ? (
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className="w-full text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] bg-[#f3f3f5] rounded-[8px] px-2.5 py-1.5 outline-none"
              />
            ) : (
              <p className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{project.name}</p>
            )}
            {project.createdBy && <p className="text-[11px] text-[#8992a0] mt-0.5">Created by {project.createdBy}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isEditMode ? (
              <button onClick={enterEdit} className="p-1.5 rounded-full bg-[#eef3fb] active:opacity-70" title="Edit">
                <Pencil size={15} className="text-[#307fe2]" />
              </button>
            ) : (
              <button onClick={applyChanges} className="px-3 py-1.5 rounded-full bg-[#1D2930] text-white text-[13px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80">
                Apply
              </button>
            )}
            <button onClick={handleClose} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {isEditMode ? (
            <>
              {/* Type — editable only in edit mode */}
              <div>
                <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Type</label>
                <div className="flex flex-wrap gap-2">
                  {availableTypes.map(t => (
                    <button key={t} onClick={() => set('type', t)} className={`px-3 py-2 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] ${form.type === t ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Owner — editable only in edit mode */}
              <div>
                <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide flex items-center gap-1.5"><UserCircle2 size={13} /> Owner</label>
                <OwnerSelect
                  value={form.ownerContactId}
                  onChange={(id) => set('ownerContactId', id)}
                  className={inputCls}
                />
              </div>
            </>
          ) : (
            <>
              {/* Type — read-only in view mode */}
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[#6a7282]">Type</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-['Inter:Medium',sans-serif] uppercase tracking-wide ${TYPE_BADGE[project.type]}`}>{project.type}</span>
              </div>

              {/* Stage status — quick update, stays in view mode. Each stage
                  cycles independently through grey/orange/yellow/green so
                  one can be skipped. Only the owner or the original creator
                  can change it — this is the only place status can change. */}
              <div>
                <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Stage{!canManageStage && ' (owner/creator only)'}</label>
                <StageChecklist
                  stages={stages}
                  stageStatus={stageStatus}
                  stageDates={project.stageDates}
                  onToggle={canManageStage ? cycleStage : undefined}
                  onDateChange={canManageStage ? setStageDate : undefined}
                  readOnly={!canManageStage}
                  lockedTitle="Only the project owner or creator can update status"
                  stacked
                />
              </div>

              {/* Owner — read-only in view mode */}
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[#6a7282] flex items-center gap-1.5"><UserCircle2 size={13} /> Owner</span>
                <span className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{project.ownerName || '—'}</span>
              </div>

              {/* Stall — a quick day-to-day action, stays in view mode. Only
                  the project owner can mark or clear a stall. */}
              <div className="pt-3 border-t border-[rgba(0,0,0,0.06)]">
                {project.isStalled ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-[#F95C39] flex items-center gap-1.5"><AlertTriangle size={13} /> Stalled — {project.stallReason}{project.stallNote ? `: ${project.stallNote}` : ''}</span>
                    {isOwner && <button onClick={clearStall} className="text-[12px] text-[#307fe2]">Clear</button>}
                  </div>
                ) : !isOwner ? null : !stallOpen ? (
                  <button onClick={() => setStallOpen(true)} className="text-[13px] text-[#F95C39] flex items-center gap-1.5 active:opacity-70"><AlertTriangle size={13} /> Mark stalled</button>
                ) : (
                  <div className="space-y-2">
                    <select className={inputCls} value={stallReason} onChange={e => setStallReason(e.target.value as StallReason)}>
                      {STALL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    {stallReason === 'Other' && (
                      <input className={inputCls} value={stallNote} onChange={e => setStallNote(e.target.value)} placeholder="Required note for “Other”" />
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => setStallOpen(false)} className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[8px] py-2 text-[13px] font-['Inter:Medium',sans-serif]">Cancel</button>
                      <button onClick={applyStall} className="flex-1 bg-[#F95C39] text-white rounded-[8px] py-2 text-[13px] font-['Inter:Medium',sans-serif]">Confirm</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes & Action Items — quick updates, stay in view mode */}
              <div className="pt-3 border-t border-[rgba(0,0,0,0.06)]">
                <ActivitySection
                  activities={project.activities || []}
                  onAdd={addActivity}
                  onToggle={toggleActivity}
                  onDelete={deleteActivity}
                  onArchive={archiveActivity}
                />
              </div>
            </>
          )}
        </div>

        {isEditMode && (
          <div className="px-5 py-3 border-t border-[rgba(0,0,0,0.08)] flex gap-3 items-center">
            <button
              onClick={() => { updateProject(project.id, { archived: !project.archived }); toast.success(project.archived ? 'Restored' : 'Archived'); if (!project.archived) onClose(); }}
              className="p-3 rounded-[10px] bg-[#f3f3f5] active:bg-[#e8e8ea]"
              title={project.archived ? 'Restore' : 'Archive'}
            >
              <Archive size={16} className="text-[#6a7282]" />
            </button>
            <button onClick={() => setShowDelete(true)} className="p-3 rounded-[10px] bg-[#fff0ee] active:bg-[#ffe0da]" title="Delete project">
              <Trash2 size={16} className="text-[#F95C39]" />
            </button>
            <span className="flex-1 text-[12px] text-[#8992a0]">Editing — tap Apply when done.</span>
          </div>
        )}
      </div>

      {showDelete && (
        <DeleteConfirmModal
          title="Delete project"
          description={<>Delete <strong>{project.name}</strong>? Linked items are unlinked, not deleted. This cannot be undone.</>}
          onConfirm={() => { deleteProject(project.id); toast.success('Project deleted'); onClose(); }}
          onCancel={() => setShowDelete(false)}
        />
      )}
      {showDiscardConfirm && (
        <DiscardChangesModal
          onDiscard={() => { discardChanges(); setShowDiscardConfirm(false); onClose(); }}
          onSave={() => { applyChanges(); setShowDiscardConfirm(false); onClose(); }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}
    </div>
  );
}
