import { useState } from 'react';
import { useUser, useOrganization } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { Plus, X, AlertTriangle, ChevronRight, UserCircle2, Repeat2 } from 'lucide-react';
import { useData, PROJECT_REQUIRES_PROPOSAL } from '../../context/DataContext';
import type { Project, ProjectType, ProjectWorkStatus, PipelineStage, StallReason } from '../../context/DataContext';

// Install runs the full sales stage list (Churned is handled via stall/cancel,
// so it's not part of the forward progress bar).
export const INSTALL_STAGES: PipelineStage[] = [
  'Prospect', 'Contacted', 'Demo Scheduled', 'Positive',
  'Verbal Yes', 'Contract Sent', 'Signed', 'Installing', 'Live',
];
// An Install can't advance to these stages without a proposal on the project.
const PROPOSAL_GATED_FROM = 'Contract Sent';
const WORK_STATUSES: ProjectWorkStatus[] = ['Open', 'In Progress', 'Done'];
const STALL_REASONS: StallReason[] = ['No response', 'Waiting on legal', 'Budget hold', 'Timing — offseason', 'Other'];
const TYPE_BADGE: Record<ProjectType, string> = {
  Install: 'bg-[#eef3fb] text-[#307fe2]',
  Repair: 'bg-[#fef3f0] text-[#F95C39]',
  Upgrade: 'bg-[#f3edfb] text-[#7c3aed]',
};

function useAuthor() {
  const { user } = useUser();
  return {
    userId: user?.id || '',
    name: user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You',
  };
}

// ─── Pane ────────────────────────────────────────────────────────────────────

export function ProjectsPane({ mountainId }: { mountainId: string }) {
  const { getProjectsByMountainId } = useData();
  const projects = getProjectsByMountainId(mountainId);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const active = projects.filter(p => p.stage !== 'Churned' && p.status !== 'Done');
  const closed = projects.filter(p => p.stage === 'Churned' || p.status === 'Done');

  return (
    <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
          Projects
          {projects.length > 0 && <span className="ml-2 text-[#6a7282] text-[13px] font-normal">({projects.length})</span>}
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-[#ff5c39] text-white rounded-[8px] px-2.5 py-1.5 flex items-center gap-1 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80"
        >
          <Plus size={14} /> New
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-[13px] text-[#6a7282]">
          No projects yet.{' '}
          <button onClick={() => setShowForm(true)} className="text-[#307fe2]">Create one</button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {[...active, ...closed].map(p => (
            <ProjectCard key={p.id} project={p} onOpen={() => setEditId(p.id)} />
          ))}
        </div>
      )}

      {showForm && <ProjectForm mountainId={mountainId} onClose={() => setShowForm(false)} />}
      {editId && <ProjectDetailModal projectId={editId} onClose={() => setEditId(null)} />}
    </div>
  );
}

// ─── Card (progress bar) ───────────────────────────────────────────────────

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const isInstall = project.type === 'Install';
  const stageIndex = isInstall ? Math.max(0, INSTALL_STAGES.indexOf(project.stage || 'Prospect')) : 0;
  const pct = isInstall
    ? Math.round(((stageIndex + 1) / INSTALL_STAGES.length) * 100)
    : project.status === 'Done' ? 100 : project.status === 'In Progress' ? 50 : 10;
  const churned = project.stage === 'Churned';

  return (
    <button onClick={onOpen} className="w-full text-left border border-[rgba(0,0,0,0.08)] rounded-[10px] p-3 active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.14)]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a] truncate">{project.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-['Inter:Medium',sans-serif] uppercase tracking-wide shrink-0 ${TYPE_BADGE[project.type]}`}>{project.type}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {project.isStalled && <span className="text-[10px] bg-[#fff4f1] text-[#F95C39] px-1.5 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle size={9} /> Stalled</span>}
          <ChevronRight size={14} className="text-[#c0c4cc]" />
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-[#f0f1f3] overflow-hidden">
        <div className={`h-full rounded-full ${churned ? 'bg-[#c0c4cc]' : 'bg-[#307fe2]'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[11px] text-[#6a7282]">
          {churned ? 'Churned' : isInstall ? project.stage || 'Prospect' : project.status || 'Open'}
        </span>
        {project.ownerName && <span className="text-[11px] text-[#8992a0] flex items-center gap-1"><UserCircle2 size={11} /> {project.ownerName}</span>}
      </div>
    </button>
  );
}

// ─── Create form ─────────────────────────────────────────────────────────────

function ProjectForm({ mountainId, onClose }: { mountainId: string; onClose: () => void }) {
  const { addProject } = useData();
  const author = useAuthor();
  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>('Install');
  const [proposalRef, setProposalRef] = useState('');
  const [zeroDollar, setZeroDollar] = useState(false);

  const showProposal = type === 'Install' || type === 'Upgrade';

  const save = () => {
    if (!name.trim()) { toast.error('Project name is required'); return; }
    const proposalId = zeroDollar ? '$0' : (proposalRef.trim() || undefined);
    addProject({
      mountainId,
      name: name.trim(),
      type,
      stage: type === 'Install' ? 'Prospect' : undefined,
      status: type === 'Install' ? undefined : 'Open',
      proposalId,
      ownerUserId: author.userId,
      ownerName: author.name,
      createdBy: author.name,
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
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Type</label>
            <div className="flex gap-2">
              {(['Install', 'Repair', 'Upgrade'] as ProjectType[]).map(t => (
                <button key={t} onClick={() => setType(t)} className={`flex-1 px-3 py-2 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] ${type === t ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>{t}</button>
              ))}
            </div>
            <p className="text-[11px] text-[#8992a0] mt-1.5">
              {type === 'Install' ? 'Runs the full stage pipeline; a proposal is required to advance ($0 allowed).'
                : type === 'Repair' ? 'Simple status: Open → In Progress → Done. No proposal needed.'
                : 'Simple status: Open → In Progress → Done. Proposal optional.'}
            </p>
          </div>

          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Name *</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Eggbeater + Links" />
          </div>

          {showProposal && (
            <div>
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">
                Proposal {type === 'Install' ? '(required to advance)' : '(optional)'}
              </label>
              <input className={inputCls} value={proposalRef} onChange={e => setProposalRef(e.target.value)} placeholder="Proposal # / reference" disabled={zeroDollar} />
              <label className="flex items-center gap-2 mt-2 text-[13px] text-[#0a0a0a]">
                <input type="checkbox" checked={zeroDollar} onChange={e => setZeroDollar(e.target.checked)} className="w-4 h-4" />
                $0 proposal (no charge — e.g. demo/airbag)
              </label>
            </div>
          )}

          <div className="text-[12px] text-[#6a7282] flex items-center gap-1.5">
            <UserCircle2 size={13} /> Owner: <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif]">{author.name}</span>
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
  const { getProjectById, updateProject, deleteProject, transferProjectOwner } = useData();
  const author = useAuthor();
  const { memberships } = useOrganization({ memberships: true });
  const project = getProjectById(projectId);
  const [stallOpen, setStallOpen] = useState(false);
  const [stallReason, setStallReason] = useState<StallReason>('No response');
  const [stallNote, setStallNote] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);

  if (!project) { onClose(); return null; }
  const isInstall = project.type === 'Install';
  const hasProposal = !!project.proposalId;

  const setStage = (stage: PipelineStage) => {
    // Proposal gate: Install can't reach Contract Sent+ without a proposal.
    const gatedIdx = INSTALL_STAGES.indexOf(PROPOSAL_GATED_FROM);
    if (isInstall && INSTALL_STAGES.indexOf(stage) >= gatedIdx && !hasProposal) {
      toast.error('Add a proposal before advancing to Contract Sent ($0 allowed).');
      return;
    }
    updateProject(project.id, { stage });
  };

  const applyStall = () => {
    if (stallReason === 'Other' && !stallNote.trim()) { toast.error('A note is required for "Other".'); return; }
    updateProject(project.id, { isStalled: true, stallReason, stallNote: stallNote.trim() || undefined });
    setStallOpen(false);
    toast.success('Marked stalled');
  };

  const members = (memberships?.data ?? []).map((m: any) => ({
    userId: m.publicUserData?.userId as string,
    name: [m.publicUserData?.firstName, m.publicUserData?.lastName].filter(Boolean).join(' ') || m.publicUserData?.identifier || 'Member',
  })).filter((m: any) => m.userId);

  const inputCls = 'w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[16px] w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <div className="min-w-0 pr-3">
            <p className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{project.name}</p>
            <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide ${TYPE_BADGE[project.type]}`}>{project.type}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5] shrink-0"><X size={16} className="text-[#6a7282]" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Stage / status */}
          {isInstall ? (
            <div>
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Stage</label>
              <select className={inputCls} value={project.stage || 'Prospect'} onChange={e => setStage(e.target.value as PipelineStage)}>
                {INSTALL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="Churned">Churned</option>
              </select>
              {!hasProposal && <p className="text-[11px] text-[#F95C39] mt-1.5">No proposal linked — required to advance to Contract Sent.</p>}
            </div>
          ) : (
            <div>
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Status</label>
              <div className="flex gap-2">
                {WORK_STATUSES.map(s => (
                  <button key={s} onClick={() => updateProject(project.id, { status: s })} className={`flex-1 px-3 py-2 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] ${project.status === s ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* Proposal */}
          {(isInstall || project.type === 'Upgrade') && (
            <div>
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Proposal</label>
              <input className={inputCls} value={project.proposalId || ''} onChange={e => updateProject(project.id, { proposalId: e.target.value || undefined })} placeholder="Proposal # / reference — enter $0 for no-charge" />
            </div>
          )}

          {/* Owner */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#6a7282] flex items-center gap-1.5"><UserCircle2 size={14} /> Owner: <span className="text-[#0a0a0a] font-['Inter:Medium',sans-serif]">{project.ownerName || '—'}</span></span>
            <button onClick={() => setTransferOpen(v => !v)} className="text-[12px] text-[#307fe2] flex items-center gap-1 active:opacity-70"><Repeat2 size={12} /> Transfer</button>
          </div>
          {transferOpen && (
            <div className="border border-[rgba(0,0,0,0.08)] rounded-[10px] p-3 space-y-1.5">
              <p className="text-[11px] text-[#6a7282] uppercase tracking-wide">Transfer ownership to</p>
              {members.length === 0 && <p className="text-[12px] text-[#8992a0]">No other team members found.</p>}
              {members.map((m: any) => (
                <button key={m.userId} onClick={() => { transferProjectOwner(project.id, m.userId, m.name); setTransferOpen(false); toast.success(`Owner → ${m.name}`); }}
                  className="w-full text-left text-[13px] text-[#0a0a0a] px-2 py-1.5 rounded-[8px] hover:bg-[#f3f3f5] active:bg-[#eef0f2]">
                  {m.name}{m.userId === project.ownerUserId ? ' (current)' : ''}
                </button>
              ))}
            </div>
          )}

          {/* Stall */}
          <div className="pt-3 border-t border-[rgba(0,0,0,0.06)]">
            {project.isStalled ? (
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[#F95C39] flex items-center gap-1.5"><AlertTriangle size={13} /> Stalled — {project.stallReason}{project.stallNote ? `: ${project.stallNote}` : ''}</span>
                <button onClick={() => updateProject(project.id, { isStalled: false, stallReason: undefined, stallNote: undefined })} className="text-[12px] text-[#307fe2]">Clear</button>
              </div>
            ) : !stallOpen ? (
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
        </div>

        <div className="px-5 py-3 border-t border-[rgba(0,0,0,0.08)]">
          <button onClick={() => { if (confirm('Delete this project? Linked items are unlinked, not deleted.')) { deleteProject(project.id); onClose(); } }}
            className="text-[12px] text-[#6a7282] active:opacity-70">Delete project</button>
        </div>
      </div>
    </div>
  );
}
