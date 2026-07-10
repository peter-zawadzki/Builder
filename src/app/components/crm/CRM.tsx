import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useUser } from '@clerk/clerk-react';
import {
  ArrowLeft, Users, Users2, Building2, Activity, Bell, LayoutDashboard, Mountain,
  Plus, Search, X, ChevronRight, Pencil, Trash2, AlertTriangle,
  CheckCircle, Clock, TrendingUp, Phone, Mail, Star, Calendar,
  ExternalLink, Check, MessageSquare, ListTodo, ChevronLeft, Archive,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import type {
  CRMContact, CRMOrganization, CRMTeam, ContactType, ContactTag, ContactActivity,
  OrgType, MountainPipelineStage, StallReason, MountainNote,
} from '../../context/DataContext';
import { MOUNTAIN_PIPELINE_STAGES } from '../../context/DataContext';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '../DeleteConfirmModal';
import { useMyContact } from '../../hooks/useMyContact';
import { ActivitySection } from '../ActivitySection';
import { ProjectsPane } from '../projects/ProjectsPane';
import { LogoUploader } from '../LogoUploader';

// ─── Constants ───────────────────────────────────────────────────────────────

const PIPELINE_STAGES: MountainPipelineStage[] = MOUNTAIN_PIPELINE_STAGES;

const STAGE_COLORS: Record<MountainPipelineStage, string> = {
  'Prospect':         'bg-[#f3f3f5] text-[#6a7282]',
  'Demo Scheduled':   'bg-[#e3f2fd] text-[#1565c0]',
  'Demo Completed':   'bg-[#e8f5e9] text-[#2e7d32]',
  'Verbal Yes':       'bg-[#fff3e0] text-[#e65100]',
  'Signed Agreement': 'bg-[#fce4ec] text-[#880e4f]',
  'Onboarding':       'bg-[#f3e5f5] text-[#4a148c]',
  'Active':           'bg-[#e8f5e9] text-[#1b5e20]',
  'Declined':         'bg-[#fff4f1] text-[#F95C39]',
  'Dead':             'bg-[#f5f5f5] text-[#9e9e9e]',
};

const CONTACT_TYPES: ContactType[] = ['Staff', 'Partner', 'Vendor', 'Investor', 'Advisor', 'Coach', 'Team', 'Ambassador', 'General'];
const CONTACT_TAGS: ContactTag[] = ['Decision Maker', 'Technical', 'Champion', 'Billing', 'Legal'];
const ORG_TYPES: OrgType[] = ['Mountain Group', 'Partner', 'Vendor', 'Investor Group', 'Advisory', 'Corporate Group'];
const STALL_REASONS: StallReason[] = ['No response', 'Waiting on legal', 'Budget hold', 'Timing — offseason', 'Other'];

type CRMTab = 'dashboard' | 'pipeline' | 'contacts' | 'organizations' | 'teams' | 'activity' | 'followups' | 'mountains';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function isOverdue(dateStr?: string) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function StageBadge({ stage }: { stage?: MountainPipelineStage }) {
  if (!stage) return <span className="text-[11px] bg-[#f3f3f5] text-[#6a7282] px-2 py-0.5 rounded-full">No stage</span>;
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-['Inter:Medium',sans-serif] ${STAGE_COLORS[stage]}`}>{stage}</span>;
}

// A count pill for an association (Teams/Mountains). Clicking opens the single
// associated record directly, or a small picker menu if there's more than one.
function AssocPill({
  icon, label, items, onOpenOne, colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  items: { id: string; name: string }[];
  onOpenOne: (id: string) => void;
  colorClass: string;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="relative">
      <button
        onClick={e => {
          e.stopPropagation();
          if (items.length === 1) onOpenOne(items[0].id);
          else setOpen(v => !v);
        }}
        className={`text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 hover:opacity-80 active:opacity-70 ${colorClass}`}
      >
        {icon} {label} ({items.length})
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] shadow-lg py-1 min-w-[160px]" onClick={e => e.stopPropagation()}>
          {items.map(it => (
            <button key={it.id} onClick={() => { setOpen(false); onOpenOne(it.id); }} className="w-full text-left px-3 py-1.5 text-[13px] text-[#0a0a0a] hover:bg-[#f3f3f5]">{it.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// A count pill that just navigates to a filtered list (no picker needed).
function LinkPill({
  icon, label, count, onClick, colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
  colorClass: string;
}) {
  if (count === 0) return null;
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }} className={`text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 hover:opacity-80 active:opacity-70 ${colorClass}`}>
      {icon} {label} ({count})
    </button>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ setTab }: { setTab: (t: CRMTab) => void }) {
  const { mountains, notes, contacts } = useData();
  const navigate = useNavigate();

  const byStage = useMemo(() => {
    const map: Record<string, number> = {};
    PIPELINE_STAGES.forEach(s => { map[s] = 0; });
    mountains.forEach(m => { if (m.pipelineStage) map[m.pipelineStage] = (map[m.pipelineStage] || 0) + 1; });
    return map;
  }, [mountains]);

  const stalled = mountains.filter(m => m.isStalled);
  const liveCount = mountains.filter(m => m.pipelineStage === 'Active').length;
  const pipelineCount = mountains.filter(m => m.pipelineStage && !['Active', 'Declined', 'Dead'].includes(m.pipelineStage)).length;
  const overdueFollowUps = notes.filter(n => n.followUpDate && isOverdue(n.followUpDate));
  const recentActivity = [...notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 10);

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total Mountains', value: mountains.length, color: 'text-[#1D2930]' },
          { label: 'Active', value: liveCount, color: 'text-[#2e7d32]' },
          { label: 'In Pipeline', value: pipelineCount, color: 'text-[#e65100]' },
          { label: 'Contacts', value: contacts.length, color: 'text-[#1565c0]' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] px-4 py-3">
            <p className={`text-[24px] font-['Inter:Medium',sans-serif] ${s.color}`}>{s.value}</p>
            <p className="text-[12px] text-[#6a7282]">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide">Pipeline</h3>
          <button onClick={() => setTab('pipeline')} className="text-[12px] text-[#F95C39]">View all</button>
        </div>
        <div className="space-y-2">
          {PIPELINE_STAGES.filter(s => byStage[s] > 0).map(s => (
            <div key={s} className="flex items-center gap-3">
              <StageBadge stage={s} />
              <div className="flex-1 bg-[#f3f3f5] rounded-full h-1.5 overflow-hidden">
                <div className="bg-[#1D2930] h-full rounded-full" style={{ width: `${Math.min(100, byStage[s] * 15)}%` }} />
              </div>
              <span className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] w-4 text-right">{byStage[s]}</span>
            </div>
          ))}
        </div>
      </div>

      {stalled.length > 0 && (
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-[#F95C39]" /> Stalled ({stalled.length})
            </h3>
            <button onClick={() => setTab('pipeline')} className="text-[12px] text-[#F95C39]">View all</button>
          </div>
          <div className="space-y-2">
            {stalled.slice(0, 3).map(m => (
              <button key={m.id} onClick={() => navigate(`/mountains/${m.id}`)} className="w-full flex items-center justify-between text-left active:opacity-70">
                <div>
                  <p className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{m.name}</p>
                  <p className="text-[11px] text-[#6a7282]">{m.stallReason}{m.stalledAt ? ` · ${daysAgo(m.stalledAt)}d` : ''}</p>
                </div>
                <ChevronRight size={14} className="text-[#d1d5db]" />
              </button>
            ))}
          </div>
        </div>
      )}

      {overdueFollowUps.length > 0 && (
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide flex items-center gap-1.5">
              <Clock size={13} className="text-[#F95C39]" /> Overdue Follow-ups ({overdueFollowUps.length})
            </h3>
            <button onClick={() => setTab('followups')} className="text-[12px] text-[#F95C39]">View all</button>
          </div>
          <div className="space-y-2">
            {overdueFollowUps.slice(0, 3).map(n => {
              const m = mountains.find(mt => mt.id === n.mountainId);
              return (
                <button key={n.id} onClick={() => navigate(`/mountains/${n.mountainId}`)} className="w-full flex items-center justify-between text-left active:opacity-70">
                  <div>
                    <p className="text-[13px] text-[#0a0a0a]">{n.text.slice(0, 50)}{n.text.length > 50 ? '…' : ''}</p>
                    <p className="text-[11px] text-[#6a7282]">{m?.name} · Due {n.followUpDate}</p>
                  </div>
                  <ChevronRight size={14} className="text-[#d1d5db]" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide">Recent Activity</h3>
          <button onClick={() => setTab('activity')} className="text-[12px] text-[#F95C39]">View all</button>
        </div>
        <div className="space-y-3">
          {recentActivity.map(n => {
            const m = mountains.find(mt => mt.id === n.mountainId);
            return (
              <button key={n.id} onClick={() => navigate(`/mountains/${n.mountainId}`)} className="w-full flex items-start gap-3 text-left active:opacity-70">
                <div className="w-7 h-7 rounded-full bg-[#f3f3f5] flex items-center justify-center shrink-0 mt-0.5">
                  <Activity size={12} className="text-[#6a7282]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[#0a0a0a] truncate">{n.text.slice(0, 60)}{n.text.length > 60 ? '…' : ''}</p>
                  <p className="text-[11px] text-[#6a7282]">{m?.name} · {n.topic} · {daysAgo(n.updatedAt)}d ago</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export function Pipeline() {
  const { mountains, updateMountain, logActivity } = useData();
  const navigate = useNavigate();
  const [filterStalled, setFilterStalled] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stallModal, setStallModal] = useState<string | null>(null);
  const [stallReason, setStallReason] = useState<StallReason>('No response');
  const [dealModal, setDealModal] = useState<string | null>(null);

  const filtered = useMemo(() => {
    // Pipeline is prospects only — mountains without a signed agreement.
    let list = mountains.filter(m => !m.proposalCreated);
    if (filterStalled) list = list.filter(m => m.isStalled);
    if (search) list = list.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [mountains, filterStalled, search]);

  const changeStage = (id: string, stage: MountainPipelineStage) => {
    const m = mountains.find(m => m.id === id)!;
    updateMountain(id, { pipelineStage: stage });
    logActivity(id, 'stage_changed', `Pipeline stage: ${m.pipelineStage || 'None'} → ${stage}`);
    setEditingId(null);
  };

  const markStalled = (id: string) => {
    updateMountain(id, { isStalled: true, stallReason, stalledAt: new Date().toISOString().slice(0, 10) });
    logActivity(id, 'stalled', `Marked as stalled: ${stallReason}`);
    setStallModal(null);
  };

  const clearStall = (id: string) => {
    updateMountain(id, { isStalled: false, stallReason: undefined, stalledAt: undefined });
    logActivity(id, 'stall_cleared', 'Stall cleared — conversation restarted');
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mountains…" className="w-full bg-[#f3f3f5] rounded-[8px] pl-9 pr-3 py-2.5 text-[#0a0a0a] text-[13px] outline-none" />
        </div>
        <button onClick={() => setFilterStalled(!filterStalled)} className={`px-3 py-2.5 rounded-[8px] text-[12px] font-['Inter:Medium',sans-serif] flex items-center gap-1.5 ${filterStalled ? 'bg-[#F95C39] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>
          <AlertTriangle size={13} /> Stalled
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[#6a7282] text-[14px]">No mountains found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => (
            <div key={m.id} className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] overflow-hidden">
              <div className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => navigate(`/mountains/${m.id}`)} className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] hover:text-[#F95C39]">{m.name}</button>
                      {m.isStalled && <span className="flex items-center gap-1 text-[10px] bg-[#fff4f1] text-[#F95C39] px-2 py-0.5 rounded-full font-['Inter:Medium',sans-serif]"><AlertTriangle size={9} /> Stalled</span>}
                    </div>
                    {m.isStalled && m.stallReason && <p className="text-[11px] text-[#6a7282] mt-0.5">{m.stallReason}{m.stalledAt ? ` · ${daysAgo(m.stalledAt)}d` : ''}</p>}
                  </div>
                </div>

                {editingId === m.id ? (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PIPELINE_STAGES.map(s => (
                      <button key={s} onClick={() => changeStage(m.id, s)} className={`text-[11px] px-2.5 py-1 rounded-full font-['Inter:Medium',sans-serif] border ${m.pipelineStage === s ? 'border-[#1D2930] bg-[#1D2930] text-white' : 'border-[rgba(0,0,0,0.1)] text-[#6a7282]'}`}>{s}</button>
                    ))}
                    <button onClick={() => setEditingId(null)} className="text-[11px] px-2.5 py-1 rounded-full text-[#6a7282] bg-[#f3f3f5]">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setEditingId(m.id)} className="mb-2"><StageBadge stage={m.pipelineStage} /></button>
                )}

                {m.nextAction && (
                  <p className={`text-[11px] flex items-center gap-1 ${m.nextActionDate && isOverdue(m.nextActionDate) ? 'text-[#F95C39]' : 'text-[#6a7282]'}`}>
                    <Clock size={10} /> {m.nextAction}{m.nextActionDate ? ` · ${m.nextActionDate}` : ''}
                  </p>
                )}
              </div>

              <div className="border-t border-[rgba(0,0,0,0.05)] px-4 py-2 flex items-center gap-3">
                <button onClick={() => setDealModal(m.id)} className="text-[11px] text-[#6a7282] flex items-center gap-1 active:opacity-70"><Pencil size={11} /> Next action</button>
                {m.isStalled ? (
                  <button onClick={() => clearStall(m.id)} className="text-[11px] text-[#2e7d32] flex items-center gap-1 active:opacity-70"><CheckCircle size={11} /> Clear stall</button>
                ) : (
                  <button onClick={() => { setStallModal(m.id); setStallReason('No response'); }} className="text-[11px] text-[#F95C39] flex items-center gap-1 active:opacity-70"><AlertTriangle size={11} /> Mark stalled</button>
                )}
                <button onClick={() => navigate(`/mountains/${m.id}`)} className="ml-auto text-[11px] text-[#6a7282] flex items-center gap-1 active:opacity-70"><ExternalLink size={11} /> Open</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {stallModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setStallModal(null); }}>
          <div className="bg-white rounded-[16px] w-full max-w-sm p-6 space-y-4">
            <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">Mark as Stalled</h2>
            <p className="text-[13px] text-[#6a7282]">Why is this deal not moving?</p>
            <div className="space-y-2">
              {STALL_REASONS.map(r => (
                <button key={r} onClick={() => setStallReason(r)} className={`w-full text-left px-3 py-2.5 rounded-[8px] text-[14px] border ${stallReason === r ? 'border-[#F95C39] bg-[#fff4f1] text-[#F95C39]' : 'border-[rgba(0,0,0,0.1)] text-[#0a0a0a]'}`}>{r}</button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStallModal(null)} className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[8px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Cancel</button>
              <button onClick={() => markStalled(stallModal)} className="flex-1 bg-[#F95C39] text-white rounded-[8px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Confirm</button>
            </div>
          </div>
        </div>
      )}
      {dealModal && <DealDetailsModal mountainId={dealModal} onClose={() => setDealModal(null)} />}
    </div>
  );
}

export function DealDetailsModal({ mountainId, onClose }: { mountainId: string; onClose: () => void }) {
  const { getMountainById, updateMountain, logActivity, contacts, organizations } = useData();
  const { user } = useUser();
  const authorName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';
  const m = getMountainById(mountainId)!;
  const [nextAction, setNextAction] = useState(m.nextAction || '');
  const [nextActionDate, setNextActionDate] = useState(m.nextActionDate || '');
  const [nextActionType, setNextActionType] = useState<'Email' | 'Call' | 'Visit' | 'Task'>(m.nextActionType || 'Task');
  const [assigneeId, setAssigneeId] = useState(m.nextActionAssigneeId || '');

  const yullrOrg = organizations.find(o => o.name.trim().toLowerCase() === 'yullr');
  const assignees = yullrOrg ? contacts.filter(c => c.organizationId === yullrOrg.id).sort((a, b) => a.name.localeCompare(b.name)) : [];
  // Email actions can target any contact linked to this mountain (contact picker).
  const emailTargets = contacts.filter(c => c.mountainId === mountainId);

  const save = () => {
    const action = nextAction.trim() || undefined;
    const changed = action !== m.nextAction || (nextActionDate || undefined) !== m.nextActionDate || assigneeId !== (m.nextActionAssigneeId || '');
    const assignee = assignees.find(c => c.id === assigneeId);
    updateMountain(mountainId, {
      nextAction: action,
      nextActionDate: nextActionDate || undefined,
      nextActionType: action ? nextActionType : undefined,
      nextActionBy: action ? authorName : undefined,
      nextActionAt: action && changed ? new Date().toISOString() : m.nextActionAt,
      nextActionAssigneeId: action ? (assigneeId || undefined) : undefined,
      nextActionAssignee: action ? (assignee?.name || undefined) : undefined,
    });
    if (action && changed) {
      logActivity(mountainId, 'next_action', `Next action (${nextActionType}): ${action}${nextActionDate ? ` due ${nextActionDate}` : ''}${assignee ? ` → ${assignee.name}` : ''}`);
    }
    onClose(); toast.success('Saved');
  };

  const inputCls = 'w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[16px] w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{m.name} — Next Action</h2>
        <div>
          <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Type</label>
          <div className="flex gap-2">
            {(['Email', 'Call', 'Visit', 'Task'] as const).map(t => (
              <button key={t} onClick={() => setNextActionType(t)} className={`flex-1 px-2 py-2 rounded-[8px] text-[12px] font-['Inter:Medium',sans-serif] ${nextActionType === t ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Next Action</label>
          <input type="text" value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="e.g. Send proposal" className={inputCls} />
          {nextActionType === 'Email' && emailTargets.length > 0 && (
            <select onChange={e => { const c = emailTargets.find(x => x.id === e.target.value); if (c) setNextAction(`Email ${c.name}${c.email ? ` (${c.email})` : ''}`); }} className={`${inputCls} mt-2`} defaultValue="">
              <option value="">Pick a contact to email…</option>
              {emailTargets.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Due Date</label>
          <input type="date" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Assign to</label>
          <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={inputCls}>
            <option value="">Unassigned</option>
            {assignees.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[8px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Cancel</button>
          <button onClick={save} className="flex-1 bg-[#1D2930] text-white rounded-[8px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Contact Detail ───────────────────────────────────────────────────────────

export function ContactDetail({ contact, onBack }: { contact: CRMContact; onBack: () => void }) {
  const { updateContact, deleteContact, getMountainById, organizations } = useData();
  const navigate = useNavigate();
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const mountain = contact.mountainId ? getMountainById(contact.mountainId) : undefined;
  const org = contact.organizationId ? organizations.find(o => o.id === contact.organizationId) : undefined;

  const addActivity = (entry: Omit<ContactActivity, 'id' | 'createdAt'>) => {
    const full: ContactActivity = { ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    updateContact(contact.id, { activities: [...(contact.activities || []), full] });
  };

  const toggleAction = (id: string) => {
    const updated = (contact.activities || []).map(a =>
      a.id === id ? { ...a, completed: !a.completed, completedAt: !a.completed ? new Date().toISOString() : undefined } : a,
    );
    updateContact(contact.id, { activities: updated });
  };

  const deleteActivity = (id: string) => {
    updateContact(contact.id, { activities: (contact.activities || []).filter(a => a.id !== id) });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="bg-[#f9fafb] border-b border-[rgba(0,0,0,0.08)] px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1 active:opacity-60"><ChevronLeft size={20} className="text-[#0a0a0a]" /></button>
        <div className="w-8 h-8 rounded-full bg-[#1D2930] flex items-center justify-center text-white text-[13px] font-['Inter:Medium',sans-serif] shrink-0">
          {contact.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{contact.name}</p>
          <p className="text-[11px] text-[#6a7282]">{contact.type}{contact.title ? ` · ${contact.title}` : ''}</p>
        </div>
        <button onClick={() => setShowEdit(true)} className="p-1.5 rounded-[8px] bg-[#eef3fb] active:bg-[#dce8f4]" title="Edit contact">
          <Pencil size={15} className="text-[#307fe2]" />
        </button>
        <button
          onClick={() => {
            updateContact(contact.id, { archived: !contact.archived });
            toast.success(contact.archived ? 'Restored' : 'Archived');
            if (!contact.archived) onBack();
          }}
          className="p-1.5 rounded-[8px] bg-[#f3f3f5] active:bg-[#e8e8ea]"
          title={contact.archived ? 'Restore' : 'Archive'}
        >
          <Archive size={15} className="text-[#6a7282]" />
        </button>
        <button onClick={() => setShowDelete(true)} className="p-1.5 rounded-[8px] bg-[#fff0ee] active:bg-[#ffe0da]" title="Delete contact">
          <Trash2 size={15} className="text-[#F95C39]" />
        </button>
      </div>
      {showEdit && <ContactForm contact={contact} onClose={() => setShowEdit(false)} />}
      {showDelete && (
        <DeleteConfirmModal
          title="Delete contact"
          description={`Remove ${contact.name} from the CRM?`}
          onConfirm={() => { deleteContact(contact.id); toast.success('Contact deleted'); onBack(); }}
          onCancel={() => setShowDelete(false)}
        />
      )}

      <div className="overflow-y-auto flex-1 p-4 space-y-4">
        {/* Contact info */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4 space-y-2">
          {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-[13px] text-[#1565c0]"><Mail size={14} />{contact.email}</a>}
          {(contact.emails || []).filter(Boolean).map((em, i) => (
            <a key={i} href={`mailto:${em}`} className="flex items-center gap-2 text-[13px] text-[#1565c0]"><Mail size={14} className="opacity-0" />{em}</a>
          ))}
          {(contact.phones && contact.phones.length
            ? contact.phones
            : [contact.phone && { number: contact.phone, label: '' }, contact.mobilePhone && { number: contact.mobilePhone, label: 'Mobile' }, contact.workPhone && { number: contact.workPhone, label: 'Work' }].filter(Boolean) as { number: string; label: string }[]
          ).map((p, i) => (
            <a key={i} href={`tel:${p.number}`} className="flex items-center gap-2 text-[13px] text-[#6a7282]"><Phone size={14} />{p.number}{p.label ? <span className="text-[11px] text-[#8992a0]">{p.label.toLowerCase()}</span> : null}</a>
          ))}
          {mountain && (
            <button onClick={() => navigate(`/mountains/${mountain.id}`)} className="flex items-center gap-2 text-[13px] text-[#6a7282] hover:text-[#307fe2] active:opacity-70">
              {mountain.mountainLogo ? <img src={mountain.mountainLogo} alt={mountain.name} className="h-5 object-contain" /> : <><ExternalLink size={14} />{mountain.name}</>} <StageBadge stage={mountain.pipelineStage} />
            </button>
          )}
          {org && (
            <button onClick={() => navigate(`/crm?tab=organizations&open=${org.id}`)} className="flex items-center gap-2 text-[13px] text-[#6a7282] hover:text-[#7c3aed] active:opacity-70">
              {org.logo ? <img src={org.logo} alt={org.name} className="h-5 object-contain" /> : <><Building2 size={14} />{org.name}</>}
            </button>
          )}
          {contact.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap pt-1">
              {contact.tags.map(t => <span key={t} className="text-[11px] bg-[#e3f2fd] text-[#1565c0] px-2 py-0.5 rounded-full">{t}</span>)}
            </div>
          )}
          {contact.notes && <p className="text-[13px] text-[#6a7282] pt-1">{contact.notes}</p>}
        </div>

        <ActivitySection
          activities={contact.activities || []}
          onAdd={addActivity}
          onToggle={toggleAction}
          onDelete={deleteActivity}
        />
      </div>
    </div>
  );
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

function Contacts({
  filterMountainId, filterOrgId, filterTeamId, onClearFilter,
}: {
  filterMountainId?: string;
  filterOrgId?: string;
  filterTeamId?: string;
  onClearFilter?: () => void;
} = {}) {
  const { contacts, organizations, mountains, teams, addContact, updateContact, deleteContact, importContactsFromMountains } = useData();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<ContactType | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<CRMContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CRMContact | null>(null);
  const [selectedContact, setSelectedContact] = useState<CRMContact | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('crm_imported') !== 'true') {
      importContactsFromMountains();
      localStorage.setItem('crm_imported', 'true');
    }
  }, []);

  const filterLabel = filterMountainId ? mountains.find(m => m.id === filterMountainId)?.name
    : filterOrgId ? organizations.find(o => o.id === filterOrgId)?.name
    : filterTeamId ? teams.find(t => t.id === filterTeamId)?.name
    : undefined;

  const filtered = useMemo(() => {
    let list = contacts.filter(c => showArchived ? c.archived : !c.archived);
    if (filterMountainId) list = list.filter(c => c.mountainId === filterMountainId);
    if (filterOrgId) list = list.filter(c => c.organizationId === filterOrgId);
    if (filterTeamId) list = list.filter(c => c.teamId === filterTeamId);
    if (filterType) list = list.filter(c => c.type === filterType);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.emails || []).some(e => e.toLowerCase().includes(q)) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q) ||
        (c.mountainId ? (mountains.find(m => m.id === c.mountainId)?.name || '').toLowerCase().includes(q) : false),
      );
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, search, filterType, filterMountainId, filterOrgId, filterTeamId, mountains, showArchived]);

  // Show detail view if contact selected
  if (selectedContact) {
    // Keep in sync with latest state
    const live = contacts.find(c => c.id === selectedContact.id) || selectedContact;
    return <ContactDetail contact={live} onBack={() => setSelectedContact(null)} />;
  }

  return (
    <div className="p-4 space-y-3">
      {filterLabel && (
        <div className="flex items-center gap-2 bg-[#eef3fb] text-[#307fe2] rounded-[8px] px-3 py-2 text-[13px]">
          <span className="flex-1">Showing contacts for <strong>{filterLabel}</strong></span>
          <button onClick={onClearFilter} className="p-0.5 active:opacity-70"><X size={14} /></button>
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…" className="w-full bg-[#f3f3f5] rounded-[8px] pl-9 pr-3 py-2.5 text-[#0a0a0a] text-[13px] outline-none" />
        </div>
        <button onClick={() => { setEditTarget(null); setShowForm(true); }} className="shrink-0 flex items-center gap-1.5 bg-[#1D2930] text-white px-3 py-2.5 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif]">
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setFilterType('')} className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${!filterType ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>All</button>
        {CONTACT_TYPES.map(t => (
          <button key={t} onClick={() => setFilterType(filterType === t ? '' : t)} className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${filterType === t ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>{t}</button>
        ))}
        <button onClick={() => setShowArchived(v => !v)} className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ml-auto ${showArchived ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>Archived</button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[#6a7282] text-[14px]">No contacts found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const linkedMountain = c.mountainId ? mountains.find(m => m.id === c.mountainId) : undefined;
            const org = organizations.find(o => o.id === c.organizationId);
            const openActions = (c.activities || []).filter(a => a.type === 'action' && !a.completed).length;
            return (
              <div key={c.id} className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] px-4 py-3 flex items-start gap-3">
                <button onClick={() => setSelectedContact(c)} className="w-9 h-9 rounded-full bg-[#1D2930] flex items-center justify-center shrink-0 text-white text-[14px] font-['Inter:Medium',sans-serif] active:opacity-70">
                  {c.name.charAt(0).toUpperCase()}
                </button>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedContact(c)}
                  onKeyDown={e => { if (e.key === 'Enter') setSelectedContact(c); }}
                  className="flex-1 min-w-0 text-left cursor-pointer active:opacity-70"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{c.name}</p>
                    {c.isPrimary && <Star size={12} className="text-[#e65100]" />}
                    <span className="text-[11px] bg-[#f3f3f5] text-[#6a7282] px-2 py-0.5 rounded-full">{c.type}</span>
                    {linkedMountain && (
                      <button onClick={e => { e.stopPropagation(); navigate(`/mountains/${linkedMountain.id}`); }} className="text-[11px] bg-[#e3f2fd] text-[#1565c0] px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-[#cfe6fb] active:opacity-70">
                        <Mountain size={10} /> {linkedMountain.name}
                      </button>
                    )}
                    {org && (
                      <button onClick={e => { e.stopPropagation(); navigate(`/crm?tab=organizations&open=${org.id}`); }} className="text-[11px] bg-[#f3edfb] text-[#7c3aed] px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-[#e6d9f7] active:opacity-70">
                        <Building2 size={10} /> {org.name}
                      </button>
                    )}
                    {openActions > 0 && <span className="text-[11px] bg-[#fff3e0] text-[#e65100] px-2 py-0.5 rounded-full">{openActions} action{openActions !== 1 ? 's' : ''}</span>}
                  </div>
                  {c.title && <p className="text-[12px] text-[#6a7282]">{c.title}</p>}
                  {c.email && <p className="text-[11px] text-[#6a7282] mt-0.5">{c.email}</p>}
                </div>
                {showArchived ? (
                  <button onClick={() => { updateContact(c.id, { archived: false }); toast.success('Restored'); }} className="shrink-0 self-center text-[12px] text-[#307fe2] font-['Inter:Medium',sans-serif] px-2 py-1 active:opacity-70">Restore</button>
                ) : (
                  <button onClick={() => setSelectedContact(c)} className="shrink-0 self-center p-1 active:opacity-70"><ChevronRight size={16} className="text-[#c0c4cc]" /></button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && <ContactForm contact={editTarget} onClose={() => { setShowForm(false); setEditTarget(null); }} />}
      {deleteTarget && (
        <DeleteConfirmModal
          title="Delete contact"
          description={`Remove ${deleteTarget.name} from the CRM?`}
          onConfirm={() => { deleteContact(deleteTarget.id); setDeleteTarget(null); toast.success('Contact deleted'); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// Fuzzy duplicate check for new contacts: exact match on any email/phone, or
// same first+last name token.
function nameTokens(n: string) {
  return n.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
}
function findDuplicateContacts(
  form: { name: string; email: string; emails: string[]; phones: { number: string }[] },
  contacts: CRMContact[],
): CRMContact[] {
  const emails = [form.email, ...form.emails].map(s => s.trim().toLowerCase()).filter(Boolean);
  const phones = form.phones.map(p => p.number.replace(/\D/g, '')).filter(p => p.length >= 7);
  const toks = nameTokens(form.name);
  const first = toks[0]; const last = toks[toks.length - 1];
  return contacts.filter(c => {
    const cEmails = [c.email, ...(c.emails || [])].map(s => (s || '').toLowerCase());
    if (emails.some(e => cEmails.includes(e))) return true;
    const cPhones = [c.phone, c.mobilePhone, c.workPhone, ...(c.phones || []).map(p => p.number)].map(s => (s || '').replace(/\D/g, '')).filter(Boolean);
    if (phones.some(p => cPhones.includes(p))) return true;
    const ct = nameTokens(c.name);
    if (ct.length && first && last && ct[0] === first && ct[ct.length - 1] === last) return true;
    return false;
  });
}

export function ContactForm({ contact, onClose, defaults }: { contact: CRMContact | null; onClose: () => void; defaults?: Partial<CRMContact> }) {
  const { addContact, updateContact, contacts, mountains, organizations, teams } = useData();
  const [dupCandidates, setDupCandidates] = useState<CRMContact[] | null>(null);
  type Phone = { number: string; label: 'Mobile' | 'Work' | 'Home' };
  const [form, setForm] = useState({
    name: contact?.name || '',
    email: contact?.email || '',
    emails: contact?.emails || [] as string[],
    phones: (contact?.phones && contact.phones.length ? contact.phones : [
      ...(contact?.phone ? [{ number: contact.phone, label: 'Mobile' }] : []),
      ...(contact?.mobilePhone ? [{ number: contact.mobilePhone, label: 'Mobile' }] : []),
      ...(contact?.workPhone ? [{ number: contact.workPhone, label: 'Work' }] : []),
    ]) as Phone[],
    type: contact?.type || 'General' as ContactType,
    title: contact?.title || '',
    organizationId: contact?.organizationId || defaults?.organizationId || '',
    teamId: contact?.teamId || defaults?.teamId || '',
    tags: contact?.tags || [] as ContactTag[],
    isPrimary: contact?.isPrimary || false,
    mountainId: contact?.mountainId || defaults?.mountainId || '',
    notes: contact?.notes || '',
  });

  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleTag = (t: ContactTag) => set('tags', form.tags.includes(t) ? form.tags.filter(x => x !== t) : [...form.tags, t]);

  const doSave = () => {
    const cleanPhones = form.phones.map(p => ({ number: p.number.trim(), label: p.label })).filter(p => p.number);
    const data = {
      ...form,
      mountainId: form.mountainId || undefined,
      organizationId: form.organizationId || undefined,
      teamId: form.teamId || undefined,
      phones: cleanPhones,
      phone: cleanPhones[0]?.number || '',
      emails: form.emails.map(s => s.trim()).filter(Boolean),
    };
    if (contact) updateContact(contact.id, data);
    else addContact({ ...data, activities: [] });
    toast.success(contact ? 'Contact updated' : 'Contact added');
    onClose();
  };

  const save = () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    // Only warn on new contacts.
    if (!contact) {
      const dups = findDuplicateContacts(form, contacts);
      if (dups.length > 0) { setDupCandidates(dups); return; }
    }
    doSave();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[16px] w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{contact ? 'Edit Contact' : 'New Contact'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Name *</label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
            </div>
            <div>
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
            </div>
            <div>
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] appearance-none">
                {CONTACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Title</label>
              <input type="text" value={form.title} onChange={e => set('title', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Phone numbers</label>
            <div className="space-y-2">
              {form.phones.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input type="tel" value={p.number} placeholder="(000) 000-0000"
                    onChange={e => setForm(prev => ({ ...prev, phones: prev.phones.map((x, j) => j === i ? { ...x, number: e.target.value } : x) }))}
                    className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
                  <select value={p.label}
                    onChange={e => setForm(prev => ({ ...prev, phones: prev.phones.map((x, j) => j === i ? { ...x, label: e.target.value as Phone['label'] } : x) }))}
                    className="w-24 bg-[#f3f3f5] rounded-[8px] px-2 py-2.5 text-[#0a0a0a] text-[13px] appearance-none">
                    <option value="Mobile">Mobile</option>
                    <option value="Work">Work</option>
                    <option value="Home">Home</option>
                  </select>
                  <button type="button" onClick={() => setForm(prev => ({ ...prev, phones: prev.phones.filter((_, j) => j !== i) }))} className="p-2 rounded-[8px] bg-[#fff0ee] active:bg-[#ffe0da]"><X size={14} className="text-[#F95C39]" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setForm(prev => ({ ...prev, phones: [...prev.phones, { number: '', label: 'Mobile' }] }))} className="text-[12px] text-[#307fe2] flex items-center gap-1 active:opacity-70"><Plus size={13} /> Add phone</button>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Additional emails</label>
            <div className="space-y-2">
              {form.emails.map((em, i) => (
                <div key={i} className="flex gap-2">
                  <input type="email" value={em} placeholder="name@company.com"
                    onChange={e => setForm(prev => ({ ...prev, emails: prev.emails.map((x, j) => j === i ? e.target.value : x) }))}
                    className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
                  <button type="button" onClick={() => setForm(prev => ({ ...prev, emails: prev.emails.filter((_, j) => j !== i) }))} className="p-2 rounded-[8px] bg-[#fff0ee] active:bg-[#ffe0da]"><X size={14} className="text-[#F95C39]" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setForm(prev => ({ ...prev, emails: [...prev.emails, ''] }))} className="text-[12px] text-[#307fe2] flex items-center gap-1 active:opacity-70"><Plus size={13} /> Add email</button>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Organization</label>
            <select value={form.organizationId} onChange={e => set('organizationId', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] appearance-none">
              <option value="">— None —</option>
              {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Team</label>
            <select value={form.teamId} onChange={e => set('teamId', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] appearance-none">
              <option value="">— None —</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Linked Mountain</label>
            <select value={form.mountainId} onChange={e => set('mountainId', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] appearance-none">
              <option value="">— None —</option>
              {mountains.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Tags</label>
            <div className="flex gap-2 flex-wrap">
              {CONTACT_TAGS.map(t => (
                <button key={t} type="button" onClick={() => toggleTag(t)} className={`px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] border ${form.tags.includes(t) ? 'bg-[#1D2930] text-white border-[#1D2930]' : 'border-[rgba(0,0,0,0.1)] text-[#6a7282]'}`}>{t}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="primary" checked={form.isPrimary} onChange={e => set('isPrimary', e.target.checked)} className="w-4 h-4" />
            <label htmlFor="primary" className="text-[14px] text-[#0a0a0a]">Mark as primary contact</label>
          </div>

          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none resize-none" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex gap-3">
          <button onClick={onClose} className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Cancel</button>
          <button onClick={save} className="flex-1 bg-[#1D2930] text-white rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Save</button>
        </div>
      </div>

      {dupCandidates && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setDupCandidates(null); }}>
          <div className="bg-white rounded-[16px] w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] mb-1">Possible duplicate</h3>
            <p className="text-[13px] text-[#6a7282] mb-3">This looks like an existing contact:</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto mb-4">
              {dupCandidates.map(c => (
                <div key={c.id} className="bg-[#f9fafb] rounded-[8px] px-3 py-2">
                  <div className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{c.name}</div>
                  <div className="text-[11px] text-[#6a7282]">{[c.email, c.title].filter(Boolean).join(' · ')}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDupCandidates(null)} className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[10px] py-2.5 text-[14px] font-['Inter:Medium',sans-serif]">Back to editing</button>
              <button onClick={() => { setDupCandidates(null); doSave(); }} className="flex-1 bg-[#1D2930] text-white rounded-[10px] py-2.5 text-[14px] font-['Inter:Medium',sans-serif]">Create anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Organizations ────────────────────────────────────────────────────────────

function Organizations({ openId }: { openId?: string } = {}) {
  const { organizations, mountains, contacts, teams, addOrganization, updateOrganization, deleteOrganization, updateMountain } = useData();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<OrgType | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<CRMOrganization | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CRMOrganization | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (!openId) return;
    const org = organizations.find(o => o.id === openId);
    if (org) { setEditTarget(org); setShowForm(true); }
  }, [openId, organizations]);

  const filtered = useMemo(() => {
    let list = organizations.filter(o => showArchived ? o.archived : !o.archived);
    if (filterType) list = list.filter(o => o.type === filterType);
    if (search) list = list.filter(o => o.name.toLowerCase().includes(search.toLowerCase()) || (o.notes || '').toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [organizations, search, filterType, showArchived]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search organizations…" className="w-full bg-[#f3f3f5] rounded-[8px] pl-9 pr-3 py-2.5 text-[#0a0a0a] text-[13px] outline-none" />
        </div>
        <button onClick={() => { setEditTarget(null); setShowForm(true); }} className="shrink-0 flex items-center gap-1.5 bg-[#1D2930] text-white px-3 py-2.5 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif]">
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setFilterType('')} className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${!filterType ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>All</button>
        {ORG_TYPES.map(t => (
          <button key={t} onClick={() => setFilterType(filterType === t ? '' : t)} className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${filterType === t ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>{t}</button>
        ))}
        <button onClick={() => setShowArchived(v => !v)} className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ml-auto ${showArchived ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>Archived</button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[#6a7282] text-[14px]">No organizations found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(org => {
            const linkedMountains = mountains.filter(m => org.mountainIds.includes(m.id));
            const linkedContacts = contacts.filter(c => org.contactIds.includes(c.id) || c.organizationId === org.id);
            const linkedTeams = teams.filter(t => linkedContacts.some(c => c.teamId === t.id));
            return (
              <div key={org.id} className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] px-4 py-3">
                <button onClick={() => { setEditTarget(org); setShowForm(true); }} className="w-full text-left active:opacity-70">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{org.name}</p>
                    <span className="text-[11px] bg-[#f3f3f5] text-[#6a7282] px-2 py-0.5 rounded-full">{org.type}</span>
                    {org.archived
                      ? <span onClick={e => { e.stopPropagation(); updateOrganization(org.id, { archived: false }); toast.success('Restored'); }} className="text-[12px] text-[#307fe2] font-['Inter:Medium',sans-serif] ml-auto shrink-0">Restore</span>
                      : <ChevronRight size={16} className="text-[#c0c4cc] ml-auto shrink-0" />}
                  </div>
                  {org.notes && <p className="text-[12px] text-[#6a7282] mt-1 line-clamp-2">{org.notes}</p>}
                </button>
                <div className="flex gap-1.5 flex-wrap mt-1.5">
                  <AssocPill
                    icon={<Users2 size={10} />} label="Teams" colorClass="bg-[#eef3fb] text-[#307fe2]"
                    items={linkedTeams.map(t => ({ id: t.id, name: t.name }))}
                    onOpenOne={id => navigate(`/crm?tab=teams&open=${id}`)}
                  />
                  <AssocPill
                    icon={<Mountain size={10} />} label="Mountains" colorClass="bg-[#e3f2fd] text-[#1565c0]"
                    items={linkedMountains.map(m => ({ id: m.id, name: m.name }))}
                    onOpenOne={id => navigate(`/mountains/${id}`)}
                  />
                  <LinkPill
                    icon={<Users size={10} />} label="Contacts" colorClass="bg-[#f3edfb] text-[#7c3aed]"
                    count={linkedContacts.length}
                    onClick={() => navigate(`/crm?tab=contacts&filterOrgId=${org.id}`)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <OrgForm org={editTarget} onClose={() => { setShowForm(false); setEditTarget(null); }} />}
      {deleteTarget && (
        <DeleteConfirmModal
          title="Delete organization"
          description={`Remove ${deleteTarget.name}?`}
          onConfirm={() => { deleteOrganization(deleteTarget.id); setDeleteTarget(null); toast.success('Deleted'); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function OrgForm({ org, onClose }: { org: CRMOrganization | null; onClose: () => void }) {
  const { addOrganization, updateOrganization, deleteOrganization, mountains, updateMountain } = useData();
  const [showDelete, setShowDelete] = useState(false);
  const [form, setForm] = useState({
    name: org?.name || '',
    type: org?.type || 'Partner' as OrgType,
    contactIds: org?.contactIds || [] as string[],
    mountainIds: org?.mountainIds || [] as string[],
    agreementDetails: org?.agreementDetails || '',
    keyDates: org?.keyDates || [] as { label: string; date: string }[],
    notes: org?.notes || '',
    logo: org?.logo || undefined as string | undefined,
  });

  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleMountain = (id: string) => set('mountainIds', form.mountainIds.includes(id) ? form.mountainIds.filter(x => x !== id) : [...form.mountainIds, id]);

  const save = () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (org) {
      updateOrganization(org.id, form);
      if (form.type === 'Corporate Group') form.mountainIds.forEach(id => updateMountain(id, { corporateGroup: form.name, organizationId: org.id }));
    } else {
      const newId = addOrganization(form);
      if (form.type === 'Corporate Group') form.mountainIds.forEach(id => updateMountain(id, { corporateGroup: form.name, organizationId: newId }));
    }
    toast.success(org ? 'Updated' : 'Created');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[16px] w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{org ? 'Edit Organization' : 'New Organization'}</h2>
          <div className="flex items-center gap-2 shrink-0">
            {org?.logo && <img src={org.logo} alt={`${org.name} logo`} className="h-9 object-contain" />}
            <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Name *</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none" />
          </div>
          <LogoUploader value={form.logo} onChange={v => set('logo', v)} />
          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] appearance-none">
              {ORG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Linked Mountains</label>
            <div className="border border-[rgba(0,0,0,0.08)] rounded-[8px] max-h-32 overflow-y-auto divide-y divide-[rgba(0,0,0,0.05)]">
              {mountains.map(m => (
                <button key={m.id} type="button" onClick={() => toggleMountain(m.id)} className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] ${form.mountainIds.includes(m.id) ? 'bg-[#f0fdf4] text-[#1b5e20]' : 'text-[#0a0a0a]'}`}>
                  {form.mountainIds.includes(m.id) && <Check size={12} className="text-[#2e7d32]" />}
                  {m.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Agreement Details</label>
            <textarea value={form.agreementDetails} onChange={e => set('agreementDetails', e.target.value)} rows={2} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none resize-none" />
          </div>
          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none resize-none" />
          </div>

          {org && (
            <div>
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Notes &amp; Action Items</label>
              <ActivitySection
                activities={org.activities || []}
                onAdd={(entry) => updateOrganization(org.id, { activities: [...(org.activities || []), { ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() }] })}
                onToggle={(id) => updateOrganization(org.id, { activities: (org.activities || []).map(a => a.id === id ? { ...a, completed: !a.completed, completedAt: !a.completed ? new Date().toISOString() : undefined } : a) })}
                onDelete={(id) => updateOrganization(org.id, { activities: (org.activities || []).filter(a => a.id !== id) })}
              />
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex gap-3 items-center">
          {org && (
            <button onClick={() => { updateOrganization(org.id, { archived: !org.archived }); toast.success(org.archived ? 'Restored' : 'Archived'); onClose(); }} className="p-3 rounded-[10px] bg-[#f3f3f5] active:bg-[#e8e8ea]" title={org.archived ? 'Restore' : 'Archive'}><Archive size={16} className="text-[#6a7282]" /></button>
          )}
          {org && (
            <button onClick={() => setShowDelete(true)} className="p-3 rounded-[10px] bg-[#fff0ee] active:bg-[#ffe0da]" title="Delete organization"><Trash2 size={16} className="text-[#F95C39]" /></button>
          )}
          <button onClick={onClose} className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Cancel</button>
          <button onClick={save} className="flex-1 bg-[#1D2930] text-white rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Save</button>
        </div>
      </div>
      {showDelete && org && (
        <DeleteConfirmModal
          title="Delete organization"
          description={`Remove ${org.name}?`}
          onConfirm={() => { deleteOrganization(org.id); toast.success('Deleted'); onClose(); }}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

// ─── Teams ───────────────────────────────────────────────────────────────────
// A Team behaves like an Organization (contacts, notes/action items,
// archive/delete in edit mode) but tracks its own projects instead of
// mountains.

function Teams({ openId }: { openId?: string } = {}) {
  const { teams, contacts, updateTeam } = useData();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<CRMTeam | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (!openId) return;
    const team = teams.find(t => t.id === openId);
    if (team) { setEditTarget(team); setShowForm(true); }
  }, [openId, teams]);

  const filtered = useMemo(() => {
    let list = teams.filter(t => showArchived ? t.archived : !t.archived);
    if (search) list = list.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || (t.notes || '').toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, search, showArchived]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams…" className="w-full bg-[#f3f3f5] rounded-[8px] pl-9 pr-3 py-2.5 text-[#0a0a0a] text-[13px] outline-none" />
        </div>
        <button onClick={() => { setEditTarget(null); setShowForm(true); }} className="shrink-0 flex items-center gap-1.5 bg-[#1D2930] text-white px-3 py-2.5 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif]">
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setShowArchived(v => !v)} className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ml-auto ${showArchived ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>Archived</button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[#6a7282] text-[14px]">No teams found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(team => {
            const linkedContacts = contacts.filter(c => c.teamId === team.id);
            return (
              <button key={team.id} onClick={() => { setEditTarget(team); setShowForm(true); }} className="w-full text-left bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] px-4 py-3 active:opacity-70">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{team.name}</p>
                  {team.archived
                    ? <span onClick={e => { e.stopPropagation(); updateTeam(team.id, { archived: false }); toast.success('Restored'); }} className="text-[12px] text-[#307fe2] font-['Inter:Medium',sans-serif] ml-auto shrink-0">Restore</span>
                    : <ChevronRight size={16} className="text-[#c0c4cc] ml-auto shrink-0" />}
                </div>
                {linkedContacts.length > 0 && <p className="text-[12px] text-[#6a7282]">{linkedContacts.length} contact{linkedContacts.length !== 1 ? 's' : ''}</p>}
                {team.notes && <p className="text-[12px] text-[#6a7282] mt-1 line-clamp-2">{team.notes}</p>}
              </button>
            );
          })}
        </div>
      )}

      {showForm && <TeamForm team={editTarget} onClose={() => { setShowForm(false); setEditTarget(null); }} />}
    </div>
  );
}

function TeamForm({ team, onClose }: { team: CRMTeam | null; onClose: () => void }) {
  const { mountains, contacts, addTeam, updateTeam, deleteTeam } = useData();
  const { user } = useUser();
  const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';
  const [isEditMode, setIsEditMode] = useState(!team);
  const [showDelete, setShowDelete] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [form, setForm] = useState({
    name: team?.name || '',
    mountainIds: team?.mountainIds || [] as string[],
    website: team?.website || '',
    address: team?.address || '',
    phone: team?.phone || '',
    email: team?.email || '',
    notes: team?.notes || '',
    logo: team?.logo || undefined as string | undefined,
  });

  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleMountain = (id: string) => set('mountainIds', form.mountainIds.includes(id) ? form.mountainIds.filter(x => x !== id) : [...form.mountainIds, id]);

  const linkedContacts = team ? contacts.filter(c => c.teamId === team.id) : [];
  const linkedMountains = mountains.filter(m => form.mountainIds.includes(m.id));

  const create = () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    addTeam({ ...form, createdBy });
    toast.success('Team created');
    onClose();
  };

  // Live field edits on an existing team — same "hit edit, then change things"
  // pattern used for Projects/Mountains, rather than a staged save.
  const editField = (updates: Partial<CRMTeam>) => {
    if (!team) return;
    updateTeam(team.id, updates);
  };

  const inputCls = 'w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[16px] w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <div className="min-w-0 pr-3 flex-1">
            {team && isEditMode ? (
              <input value={form.name} onChange={e => { set('name', e.target.value); editField({ name: e.target.value }); }} className="w-full text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] bg-[#f3f3f5] rounded-[8px] px-2.5 py-1.5 outline-none" />
            ) : team?.logo ? (
              <img src={team.logo} alt={team.name} className="h-9 object-contain" />
            ) : (
              <p className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{team ? team.name : 'New Team'}</p>
            )}
            {team?.createdBy && <p className="text-[11px] text-[#8992a0] mt-0.5">Created by {team.createdBy}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {team && (
              <button onClick={() => setIsEditMode(v => !v)} className={`p-1.5 rounded-full active:opacity-70 ${isEditMode ? 'bg-[#1D2930]' : 'bg-[#eef3fb]'}`} title={isEditMode ? 'Done editing' : 'Edit'}>
                <Pencil size={15} className={isEditMode ? 'text-white' : 'text-[#307fe2]'} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!team || isEditMode ? (
            <>
              {!team && (
                <div>
                  <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Name *</label>
                  <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
                </div>
              )}
              <LogoUploader value={form.logo} onChange={v => { set('logo', v); if (team) editField({ logo: v }); }} />
              <div>
                <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Associated Mountains</label>
                <div className="border border-[rgba(0,0,0,0.08)] rounded-[8px] max-h-32 overflow-y-auto divide-y divide-[rgba(0,0,0,0.05)]">
                  {mountains.map(m => (
                    <button key={m.id} type="button" onClick={() => { toggleMountain(m.id); if (team) editField({ mountainIds: form.mountainIds.includes(m.id) ? form.mountainIds.filter(x => x !== m.id) : [...form.mountainIds, m.id] }); }} className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] ${form.mountainIds.includes(m.id) ? 'bg-[#f0fdf4] text-[#1b5e20]' : 'text-[#0a0a0a]'}`}>
                      {form.mountainIds.includes(m.id) && <Check size={12} className="text-[#2e7d32]" />}
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Website</label>
                <input type="text" value={form.website} onChange={e => { set('website', e.target.value); editField({ website: e.target.value }); }} className={inputCls} placeholder="https://…" />
              </div>
              <div>
                <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Address</label>
                <input type="text" value={form.address} onChange={e => { set('address', e.target.value); editField({ address: e.target.value }); }} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Phone</label>
                  <input type="tel" value={form.phone} onChange={e => { set('phone', e.target.value); editField({ phone: e.target.value }); }} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Email</label>
                  <input type="email" value={form.email} onChange={e => { set('email', e.target.value); editField({ email: e.target.value }); }} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Notes</label>
                <textarea value={form.notes} onChange={e => { set('notes', e.target.value); editField({ notes: e.target.value }); }} rows={3} className={`${inputCls} resize-none`} />
              </div>
            </>
          ) : (
            <>
              {(team.website || team.address || team.phone || team.email) && (
                <div className="space-y-1.5">
                  {team.website && <div className="text-[13px] text-[#307fe2]">{team.website}</div>}
                  {team.address && <div className="text-[13px] text-[#0a0a0a]">{team.address}</div>}
                  {team.phone && <div className="text-[13px] text-[#0a0a0a] flex items-center gap-1.5"><Phone size={13} className="text-[#6a7282]" /> {team.phone}</div>}
                  {team.email && <div className="text-[13px] text-[#0a0a0a] flex items-center gap-1.5"><Mail size={13} className="text-[#6a7282]" /> {team.email}</div>}
                </div>
              )}
              {linkedMountains.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {linkedMountains.map(m => <span key={m.id} className="text-[11px] bg-[#e3f2fd] text-[#1565c0] px-2 py-0.5 rounded-full">{m.name}</span>)}
                </div>
              )}
              {team.notes && <p className="text-[13px] text-[#6a7282]">{team.notes}</p>}
            </>
          )}

          {team && (
            <div className="pt-3 border-t border-[rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide">Contacts</label>
                <button onClick={() => setShowAddContact(true)} className="text-[12px] text-[#307fe2] flex items-center gap-1 active:opacity-70"><Plus size={13} /> Add</button>
              </div>
              {linkedContacts.length === 0 ? (
                <p className="text-[13px] text-[#8992a0]">No contacts yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {linkedContacts.map(c => (
                    <div key={c.id} className="text-[13px] text-[#0a0a0a] flex items-center justify-between bg-[#f9fafb] rounded-[8px] px-3 py-2">
                      <span>{c.name}</span>
                      {c.title && <span className="text-[11px] text-[#6a7282]">{c.title}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {team && (
            <div className="pt-3 border-t border-[rgba(0,0,0,0.06)]">
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Notes &amp; Action Items</label>
              <ActivitySection
                activities={team.activities || []}
                onAdd={(entry) => updateTeam(team.id, { activities: [...(team.activities || []), { ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() }] })}
                onToggle={(id) => updateTeam(team.id, { activities: (team.activities || []).map(a => a.id === id ? { ...a, completed: !a.completed, completedAt: !a.completed ? new Date().toISOString() : undefined } : a) })}
                onDelete={(id) => updateTeam(team.id, { activities: (team.activities || []).filter(a => a.id !== id) })}
              />
            </div>
          )}

          {team && (
            <div className="pt-3 border-t border-[rgba(0,0,0,0.06)]">
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Projects</label>
              <ProjectsPane teamId={team.id} />
            </div>
          )}
        </div>

        {!team ? (
          <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex gap-3">
            <button onClick={onClose} className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Cancel</button>
            <button onClick={create} className="flex-1 bg-[#1D2930] text-white rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Create</button>
          </div>
        ) : isEditMode && (
          <div className="px-5 py-3 border-t border-[rgba(0,0,0,0.08)] flex gap-3 items-center">
            <button onClick={() => { updateTeam(team.id, { archived: !team.archived }); toast.success(team.archived ? 'Restored' : 'Archived'); if (!team.archived) onClose(); }} className="p-3 rounded-[10px] bg-[#f3f3f5] active:bg-[#e8e8ea]" title={team.archived ? 'Restore' : 'Archive'}><Archive size={16} className="text-[#6a7282]" /></button>
            <button onClick={() => setShowDelete(true)} className="p-3 rounded-[10px] bg-[#fff0ee] active:bg-[#ffe0da]" title="Delete team"><Trash2 size={16} className="text-[#F95C39]" /></button>
            <span className="flex-1 text-[12px] text-[#8992a0]">Editing — tap the pencil again when done.</span>
          </div>
        )}
      </div>
      {showAddContact && team && (
        <ContactForm contact={null} defaults={{ teamId: team.id }} onClose={() => setShowAddContact(false)} />
      )}
      {showDelete && team && (
        <DeleteConfirmModal
          title="Delete team"
          description={`Remove ${team.name}?`}
          onConfirm={() => { deleteTeam(team.id); toast.success('Deleted'); onClose(); }}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

export function ActivityFeed() {
  const { notes, mountains } = useData();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const topics = ['Demo', 'Site Visit', 'Proposal', 'Install', 'Training', 'Updates', 'Follow-up'];

  const filtered = useMemo(() => {
    let list = [...notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (filterTopic) list = list.filter(n => n.topic === filterTopic);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(n => n.text.toLowerCase().includes(q) || (mountains.find(m => m.id === n.mountainId)?.name || '').toLowerCase().includes(q));
    }
    return list;
  }, [notes, search, filterTopic, mountains]);

  return (
    <div className="p-4 space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search activity…" className="w-full bg-[#f3f3f5] rounded-[8px] pl-9 pr-3 py-2.5 text-[#0a0a0a] text-[13px] outline-none" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setFilterTopic('')} className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${!filterTopic ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>All</button>
        {topics.map(t => <button key={t} onClick={() => setFilterTopic(filterTopic === t ? '' : t)} className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${filterTopic === t ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>{t}</button>)}
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[#6a7282] text-[14px]">No activity found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const m = mountains.find(mt => mt.id === n.mountainId);
            return (
              <div key={n.id} className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[#0a0a0a]">{n.text}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {n.topic && <span className="text-[11px] bg-[#f3f3f5] text-[#6a7282] px-2 py-0.5 rounded-full">{n.topic}</span>}
                      {n.followUpDate && <span className={`text-[11px] flex items-center gap-1 px-2 py-0.5 rounded-full ${isOverdue(n.followUpDate) ? 'bg-[#fff4f1] text-[#F95C39]' : 'bg-[#f3f3f5] text-[#6a7282]'}`}><Calendar size={9} /> {n.followUpDate}</span>}
                    </div>
                    <p className="text-[11px] text-[#6a7282] mt-1">{m?.name} · {daysAgo(n.updatedAt) === 0 ? 'Today' : `${daysAgo(n.updatedAt)}d ago`}</p>
                  </div>
                  <button onClick={() => navigate(`/mountains/${n.mountainId}`)} className="p-1.5 rounded-[6px] bg-[#f3f3f5] shrink-0"><ExternalLink size={12} className="text-[#6a7282]" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Follow-ups ───────────────────────────────────────────────────────────────

type FollowItem = {
  key: string;
  kind: 'note' | 'action';
  refId: string;
  mountainId: string;
  date: string;
  text: string;
  author?: string;
  assigneeId?: string;
  assignee?: string;
};

export function FollowUps({ scope = 'all' }: { scope?: 'mine' | 'all' }) {
  const { notes, mountains, updateNote, updateMountain, logActivity } = useData();
  const navigate = useNavigate();
  const me = useMyContact();

  const allItems = useMemo<FollowItem[]>(() => {
    const noteItems: FollowItem[] = notes
      .filter(n => n.followUpDate)
      .map(n => ({ key: `note:${n.id}`, kind: 'note', refId: n.id, mountainId: n.mountainId, date: n.followUpDate!, text: n.text }));
    const actionItems: FollowItem[] = mountains
      .filter(m => m.nextActionDate && m.nextAction)
      .map(m => ({ key: `action:${m.id}`, kind: 'action', refId: m.id, mountainId: m.id, date: m.nextActionDate!, text: m.nextAction!, author: m.nextActionBy, assigneeId: m.nextActionAssigneeId, assignee: m.nextActionAssignee }));
    return [...noteItems, ...actionItems].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [notes, mountains]);

  const effective = me ? scope : 'all';
  const items = effective === 'mine' ? allItems.filter(i => i.assigneeId && me && i.assigneeId === me.id) : allItems;

  const overdue = items.filter(i => isOverdue(i.date));
  const upcoming = items.filter(i => !isOverdue(i.date));

  const complete = (i: FollowItem) => {
    if (i.kind === 'note') {
      updateNote(i.refId, { followUpDate: undefined });
    } else {
      updateMountain(i.refId, { nextAction: undefined, nextActionDate: undefined, nextActionBy: undefined, nextActionAt: undefined, nextActionType: undefined, nextActionAssigneeId: undefined, nextActionAssignee: undefined });
      logActivity(i.refId, 'next_action_done', `Completed next action: ${i.text}`);
    }
    toast.success('Marked complete');
  };

  const Card = ({ i }: { i: FollowItem }) => {
    const m = mountains.find(mt => mt.id === i.mountainId);
    const over = isOverdue(i.date);
    return (
      <div className={`bg-white rounded-[12px] border px-4 py-3 ${over ? 'border-[rgba(249,92,57,0.3)]' : 'border-[rgba(0,0,0,0.08)]'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {i.kind === 'action' && <span className="text-[10px] font-['Inter:Medium',sans-serif] bg-[#eef3fb] text-[#307fe2] px-1.5 py-0.5 rounded-full uppercase tracking-wide">Next action</span>}
              <p className="text-[13px] text-[#0a0a0a] truncate">{i.text.slice(0, 80)}{i.text.length > 80 ? '…' : ''}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className={`text-[11px] flex items-center gap-1 font-['Inter:Medium',sans-serif] ${over ? 'text-[#F95C39]' : 'text-[#6a7282]'}`}><Calendar size={10} /> {i.date}</span>
              {m && <span className="text-[11px] text-[#6a7282]">{m.name}</span>}
              {i.author && <span className="text-[11px] text-[#6a7282]">· by {i.author}</span>}
              {i.assignee && <span className="text-[11px] bg-[#eef3fb] text-[#307fe2] px-1.5 py-0.5 rounded-full">→ {i.assignee}</span>}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={() => navigate(`/mountains/${i.mountainId}`)} className="p-1.5 rounded-[6px] bg-[#f3f3f5]"><ExternalLink size={12} className="text-[#6a7282]" /></button>
            <button onClick={() => complete(i)} className="p-1.5 rounded-[6px] bg-[#e8f5e9]" title="Mark complete"><Check size={12} className="text-[#2e7d32]" /></button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4">
      {overdue.length > 0 && (
        <div>
          <h3 className="text-[12px] font-['Inter:Medium',sans-serif] text-[#F95C39] uppercase tracking-wide mb-2 flex items-center gap-1.5"><AlertTriangle size={12} /> Overdue ({overdue.length})</h3>
          <div className="space-y-2">{overdue.map(i => <Card key={i.key} i={i} />)}</div>
        </div>
      )}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-2">Upcoming ({upcoming.length})</h3>
          <div className="space-y-2">{upcoming.map(i => <Card key={i.key} i={i} />)}</div>
        </div>
      )}
      {items.length === 0 && <div className="text-center py-12 text-[#6a7282] text-[14px]">No follow-ups scheduled</div>}
    </div>
  );
}

// ─── CRM Shell ────────────────────────────────────────────────────────────────

export function CRMSection() {
  return <CRMContent />;
}

// Mountains tab — a simple roster with add; the operational mountains list
// lives under the Mountains icon (/mountains).
function MountainsTab() {
  const { mountains, organizations, teams, contacts } = useData();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    let list = [...mountains].sort((a, b) => a.name.localeCompare(b.name));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q) || (m.address || '').toLowerCase().includes(q));
    }
    return list;
  }, [mountains, search]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mountains…" className="w-full bg-[#f3f3f5] rounded-[8px] pl-9 pr-3 py-2.5 text-[#0a0a0a] text-[13px] outline-none" />
        </div>
        <button onClick={() => navigate('/mountains/new')} className="shrink-0 flex items-center gap-1.5 bg-[#1D2930] text-white px-3 py-2.5 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif]">
          <Plus size={14} /> Add
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[#6a7282] text-[14px]">No mountains found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => {
            const org = m.organizationId ? organizations.find(o => o.id === m.organizationId) : undefined;
            const linkedTeams = teams.filter(t => t.mountainIds.includes(m.id));
            const linkedContacts = contacts.filter(c => c.mountainId === m.id);
            return (
              <div key={m.id} className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] px-4 py-3">
                <button onClick={() => navigate(`/mountains/${m.id}`)} className="w-full flex items-center justify-between text-left active:opacity-70">
                  <span className="text-[14px] text-[#0a0a0a]">{m.name}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-['Inter:Medium',sans-serif] ${m.proposalCreated ? 'bg-[#eaf5ef] text-[#3f7a5c]' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>
                    {m.proposalCreated ? 'Customer' : 'Prospect'}
                  </span>
                </button>
                <div className="flex gap-1.5 flex-wrap mt-1.5">
                  {org && (
                    <button onClick={() => navigate(`/crm?tab=organizations&open=${org.id}`)} className="text-[11px] bg-[#f3edfb] text-[#7c3aed] px-2 py-0.5 rounded-full flex items-center gap-1 hover:opacity-80 active:opacity-70">
                      <Building2 size={10} /> {org.name}
                    </button>
                  )}
                  <AssocPill
                    icon={<Users2 size={10} />} label="Teams" colorClass="bg-[#eef3fb] text-[#307fe2]"
                    items={linkedTeams.map(t => ({ id: t.id, name: t.name }))}
                    onOpenOne={id => navigate(`/crm?tab=teams&open=${id}`)}
                  />
                  <LinkPill
                    icon={<Users size={10} />} label="Contacts" colorClass="bg-[#eaf5ef] text-[#3f7a5c]"
                    count={linkedContacts.length}
                    onClick={() => navigate(`/crm?tab=contacts&filterMountainId=${m.id}`)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Organizations/Teams don't have their own route (they open as a modal within
// a tab), so cross-record navigation (a pill on one record opening another)
// goes through URL query params: ?tab=, ?open= (auto-open a record's modal),
// and ?filterMountainId=/?filterOrgId=/?filterTeamId= (pre-filter Contacts).
function CRMContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as CRMTab) || 'contacts';

  const TABS: { id: CRMTab; icon: React.ReactNode; label: string }[] = [
    { id: 'contacts',      icon: <Users size={14} />,     label: 'Contacts' },
    { id: 'organizations', icon: <Building2 size={14} />, label: 'Organizations' },
    { id: 'teams',         icon: <Users2 size={14} />,    label: 'Teams' },
    { id: 'mountains',     icon: <Mountain size={14} />,  label: 'Mountains' },
  ];

  const setActiveTab = (t: CRMTab) => setSearchParams({ tab: t });

  return (
    <div className="min-h-screen bg-[#f9fafb] flex flex-col">
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-3">
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[12px] font-['Inter:Medium',sans-serif] transition-colors whitespace-nowrap ${activeTab === tab.id ? 'bg-[#1D2930] text-white' : 'text-[#6a7282] hover:bg-[#f3f3f5]'}`}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-8">
        {activeTab === 'contacts'      && (
          <Contacts
            filterMountainId={searchParams.get('filterMountainId') || undefined}
            filterOrgId={searchParams.get('filterOrgId') || undefined}
            filterTeamId={searchParams.get('filterTeamId') || undefined}
            onClearFilter={() => setSearchParams({ tab: 'contacts' })}
          />
        )}
        {activeTab === 'organizations' && <Organizations openId={searchParams.get('open') || undefined} />}
        {activeTab === 'teams'         && <Teams openId={searchParams.get('open') || undefined} />}
        {activeTab === 'mountains'     && <MountainsTab />}
      </div>
    </div>
  );
}
