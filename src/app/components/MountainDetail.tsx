import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useData, MOUNTAIN_PIPELINE_STAGES, getYullrMembers, buildActivitySummaries, getMountainLastActionAt, daysSince } from '../context/DataContext';
import type { Asset, Contact, ContactNote, CRMContact, MountainPipelineStage } from '../context/DataContext';
import { useMyContact } from '../hooks/useMyContact';
import { ContactDetail, ContactForm, ContactAssociationPills, STAGE_COLORS } from './crm/CRM';
import { ProjectsPane } from './projects/ProjectsPane';
import { ProposalsPane } from './projects/ProposalsPane';
import { AssignInventoryModal } from './CheckInOutModal';
import {
  ArrowLeft, Plus, Info, MapPin, Building2, ClipboardList, Map,
  Download, FileText, Camera, Wifi, Box, Server, Package,
  ChevronRight, GitMerge, X, DollarSign, Tag, Hash, Globe,
  Calendar, Truck, Barcode, Cpu, Users, Phone, Mail, Maximize2, Pencil, Check, Rocket,
} from 'lucide-react';

type ContactSlot =
  | { type: 'admin' }
  | { type: 'technical' }
  | { type: 'additional'; index: number };
import { MountainNotes } from './MountainNotes';
import { MountainActivityRollup } from './MountainActivityRollup';
import { MountainDocuments } from './MountainDocuments';
import { MountainMapView } from './MountainMapView';
import { ExportModal } from './ExportModal';
import { TrailDetailModal } from './TrailDetailModal';
import { toast } from 'sonner';

const ASSET_TYPE_COLORS: Record<string, string> = {
  Camera: 'bg-[#fff3f0] text-[#ff5c39]',
  'Network Gear': 'bg-[#eff6ff] text-[#3b82f6]',
  Server: 'bg-[#f0fdf4] text-[#22c55e]',
  Miscellaneous: 'bg-[#f5f5f5] text-[#6a7282]',
};
const ASSET_ICONS = { Camera, 'Network Gear': Wifi, Miscellaneous: Box, Server };

// A pane that shows a capped preview and opens the full content in a modal on
// click, so the mountain view doesn't grow endlessly.
function ExpandablePane({
  title, icon, headerRight, children,
}: {
  title: string;
  icon: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 flex flex-col h-full">
        <div className="flex items-center justify-between mb-3 min-h-[28px]">
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 active:opacity-70">
            <Maximize2 size={15} className="text-[#6a7282]" />
            <h2 className="text-[15px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a]">{title}</h2>
          </button>
          <div className="flex items-center gap-2">
            {headerRight}
          </div>
        </div>
        <div className="h-[360px] overflow-hidden relative">
          <div className="pb-8">{children}</div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)] sticky top-0 bg-white">
              <div className="flex items-center gap-2">{icon}<h2 className="text-[18px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a]">{title}</h2></div>
              <button onClick={() => setOpen(false)} className="p-1 active:opacity-60"><X size={20} className="text-[#6a7282]" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}

// Wraps a pane that already has its own header (Trails, Notes, Inventory,
// Documents). Caps the inline card height and reveals the full content in a
// modal. Children is a render function so the wrapped content can put the
// expand trigger to the left of its own title, consistent with ExpandablePane.
function ExpandableSection({ children }: { children: (openModal: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openModal = () => setOpen(true);
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-[360px] overflow-hidden relative rounded-[12px]">
        <div className="h-full pb-10">{children(openModal)}</div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto p-4 sm:p-6" onClick={() => setOpen(false)}>
          <div className="w-full max-w-3xl mx-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setOpen(false)}
              className="mb-2 ml-auto flex items-center gap-1 text-[13px] text-white active:opacity-70"
            >
              <X size={18} /> Close
            </button>
            {children(openModal)}
          </div>
        </div>
      )}
    </div>
  );
}

export function MountainDetail() {
  const { mountainId } = useParams();
  const navigate = useNavigate();
  const {
    getMountainById,
    getTrailsByMountainId,
    getLocationsByMountainId,
    getAssetsByMountainId,
    getAssetsByLocationId,
    getInspectionsByLocationId,
    assets,
    contacts,
    organizations,
    teams,
    projects,
    locations,
    inspections,
    notes,
    updateLocation,
    updateMountain,
    updateContact,
    logActivity,
  } = useData();

  const mountain = getMountainById(mountainId!);
  const trails = getTrailsByMountainId(mountainId!);
  const allLocations = getLocationsByMountainId(mountainId!);
  const inventoryAssets = getAssetsByMountainId(mountainId!).filter(a => a.type !== 'Miscellaneous');
  const [showMap, setShowMap] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [assigningLocationId, setAssigningLocationId] = useState<string | null>(null);
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string | null>(null);
  const [contactSlot, setContactSlot] = useState<ContactSlot | null>(null);
  const [crmContact, setCrmContact] = useState<CRMContact | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddTrail, setShowAddTrail] = useState(false);
  const [showCheckInOut, setShowCheckInOut] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);
  const [openTrailId, setOpenTrailId] = useState<string | null>(null);
  const [newActionText, setNewActionText] = useState('');
  const [newActionAssigneeId, setNewActionAssigneeId] = useState('');

  // Updates feed for the Status pane.
  const { getToken } = useAuth();
  const { user } = useUser();
  const me = useMyContact();
  const yullrMembers = getYullrMembers(contacts, organizations);
  const authorName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';
  const [updates, setUpdates] = useState<Array<{ id: string; type: string; summary: string; actor: string; timestamp: string }>>([]);
  useEffect(() => {
    if (!mountainId) return;
    let alive = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`/api/legacy/activity?mountainId=${mountainId}`, {
          headers: { Authorization: `Bearer ${token ?? ''}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setUpdates(data.activity || []);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [mountainId, getToken, trails.length, allLocations.length]);

  if (!mountain) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">Mountain not found</p>
          <button onClick={() => navigate('/')} className="mt-4 text-[#307fe2] font-['Inter:Medium',sans-serif]">
            Go back
          </button>
        </div>
      </div>
    );
  }

  // Locations not linked to any trail by ID and with no matching trail by name
  const unlinkedLocations = allLocations.filter(
    l => !l.trailId && !trails.some(t => t.name === l.trailName)
  );

  // Inventory breakdown by type (for summary pills)
  const invByType = inventoryAssets.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  // At-a-glance summary for the Status pane.
  const linkedOrg = mountain.organizationId ? organizations.find(o => o.id === mountain.organizationId) : undefined;

  // Days since last action of any kind (notes/action items across the
  // mountain and everything rolled up to it — contacts, teams, orgs,
  // projects, inspections — plus the mountain's own notes). Falls back to
  // the mountain's creation date if nothing has happened yet.
  const lastActionAt = getMountainLastActionAt(mountainId!, { mountains: [mountain], contacts, teams, organizations, projects, locations, inspections, notes });
  const daysSinceLastAction = lastActionAt ? daysSince(lastActionAt) : undefined;

  // Teams pill — distinct team names among this mountain's own contacts.
  const teamNames = Array.from(new Set(
    [mountain.adminContact?.teamName, mountain.technicalContact?.teamName, ...(mountain.additionalContacts || []).map(c => c.teamName)]
      .filter((t): t is string => !!t && t.trim().length > 0)
  ));

  // Add a general action item directly on the mountain (rolls up as origin 'general').
  const addActionItem = (text: string, assigneeId?: string) => {
    const assignee = assigneeId ? yullrMembers.find(m => m.id === assigneeId) : undefined;
    const entry = {
      id: crypto.randomUUID(),
      text,
      type: 'action' as const,
      createdAt: new Date().toISOString(),
      authorContactId: me?.id,
      authorName,
      assigneeContactId: assignee?.id,
      assigneeName: assignee?.name,
    };
    updateMountain(mountainId!, { activities: [...(mountain.activities || []), entry] });
    const { summary, slackText } = buildActivitySummaries(entry, entry.authorName, contacts, [mountain.name]);
    logActivity(mountainId, 'action_added', summary, undefined, slackText, !!entry.assigneeContactId);
  };

  // Inventory class subtotals + inspection reconciliation.
  const mountainAssetsAll = getAssetsByMountainId(mountainId!);
  const trackedCount = mountainAssetsAll.filter(a => (a.assetClass || 'Asset') === 'Asset').length;
  const expensedCount = mountainAssetsAll.filter(a => a.assetClass === 'Expense').length;

  // Resolve / persist a single contact by its slot in the mountain record.
  const contactForSlot = (slot: ContactSlot): Contact | undefined =>
    slot.type === 'admin' ? mountain.adminContact
      : slot.type === 'technical' ? mountain.technicalContact
        : mountain.additionalContacts?.[slot.index];

  const persistContact = (slot: ContactSlot, updated: Contact) => {
    if (slot.type === 'admin') updateMountain(mountainId!, { adminContact: updated });
    else if (slot.type === 'technical') updateMountain(mountainId!, { technicalContact: updated });
    else {
      const arr = [...(mountain.additionalContacts || [])];
      arr[slot.index] = updated;
      updateMountain(mountainId!, { additionalContacts: arr });
    }
  };

  return (
    <div className="min-h-screen bg-[#f9fafb]">

      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-3 sticky top-0 z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => navigate('/mountains')} className="p-1.5 active:opacity-60 shrink-0">
                <ArrowLeft size={22} className="text-[#0a0a0a]" />
              </button>
              <h1 className="min-w-0 truncate text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">
                {mountain.mountainLogo ? (
                  <img src={mountain.mountainLogo} alt={mountain.name} className="h-8 object-contain" />
                ) : (
                  mountain.name
                )}
              </h1>
              <button
                onClick={() => navigate(`/mountains/${mountainId}/edit`)}
                className="p-1 active:opacity-60 shrink-0"
                aria-label="Edit mountain details"
                title="Edit mountain details"
              >
                <Pencil size={16} className="text-[#6a7282]" />
              </button>
            </div>
            <div className="pl-8 flex items-center gap-2 min-w-0">
              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] truncate min-w-0">
                {mountain.address}
              </p>
              {(linkedOrg?.name || mountain.parentOrganization) && (
                <span className="shrink-0 flex items-center gap-1 bg-[#f3edfb] text-[#7c3aed] text-[11px] font-['Inter:Medium',sans-serif] font-medium px-2.5 py-1 rounded-full">
                  <Building2 size={11} />
                  {linkedOrg?.name || mountain.parentOrganization}
                </span>
              )}
              {teamNames.length > 0 && (
                <span className="shrink-0 flex items-center gap-1 bg-[#eef3fb] text-[#307fe2] text-[11px] font-['Inter:Medium',sans-serif] font-medium px-2.5 py-1 rounded-full">
                  <Users size={11} />
                  {teamNames.join(', ')}
                </span>
              )}
            </div>
            {/* Secondary actions — deliberately distinct from the global nav icons above */}
            <div className="pl-8 mt-2 flex items-center gap-2">
              <button
                onClick={() => setShowExport(true)}
                className="flex items-center gap-1.5 border border-[rgba(0,0,0,0.12)] rounded-full px-3 py-1.5 text-[12px] font-['Inter:Medium',sans-serif] font-medium text-[#1e3a5f] active:bg-[#f3f3f5]"
              >
                <Download size={13} />
                Reports
              </button>
              <button
                onClick={() => setShowMap(true)}
                className="flex items-center gap-1.5 border border-[rgba(0,0,0,0.12)] rounded-full px-3 py-1.5 text-[12px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a] active:bg-[#f3f3f5]"
              >
                <Map size={13} />
                Map
              </button>
              <div className={`relative flex items-center gap-1.5 rounded-full pl-3 pr-2 py-1.5 text-[12px] font-['Inter:Medium',sans-serif] font-medium ${mountain.pipelineStage ? STAGE_COLORS[mountain.pipelineStage] : 'bg-[#f3f3f5] text-[#6a7282]'}`}>
                <span>{mountain.pipelineStage || 'Stage'}</span>
                <Pencil size={11} className="opacity-60" />
                <select
                  value={mountain.pipelineStage || ''}
                  onChange={e => updateMountain(mountainId!, { pipelineStage: (e.target.value || undefined) as MountainPipelineStage | undefined })}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  aria-label="Pipeline stage"
                >
                  <option value="">Select stage…</option>
                  {MOUNTAIN_PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
          {daysSinceLastAction !== undefined && (
            <div
              className="shrink-0 text-right text-[11px] text-[#6a7282] font-['Inter:Regular',sans-serif] pt-1"
              title={`Last action: ${new Date(lastActionAt!).toLocaleString()}`}
            >
              {daysSinceLastAction === 0 ? 'Active today' : `${daysSinceLastAction}d since last action`}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">

        {/* Portal notifications */}
        {mountain.proposedInstallDates && mountain.proposedInstallDates.length > 0 && !mountain.confirmedInstallDate && (
          <div className="bg-[#fff3e0] border border-[#fcd34d] rounded-[12px] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[14px] font-['Inter:Medium',sans-serif] text-[#92400e]">
                  📅 {mountain.proposedInstallDates.length} proposed install date{mountain.proposedInstallDates.length !== 1 ? 's' : ''} — confirm one
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {mountain.proposedInstallDates.map(d => (
                    <button
                      key={d}
                      onClick={() => {
                        updateMountain(mountainId!, { confirmedInstallDate: d, proposedInstallDates: [] });
                        toast.success('Install date confirmed');
                      }}
                      className="text-[12px] bg-white border border-[#fcd34d] text-[#92400e] px-3 py-1.5 rounded-full font-['Inter:Medium',sans-serif] active:bg-[#fef3c7]"
                    >
                      {new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} — Confirm
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {mountain.confirmedInstallDate && (
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[12px] px-4 py-3 flex items-center justify-between">
            <p className="text-[14px] font-['Inter:Medium',sans-serif] text-[#16a34a]">
              ✓ Install confirmed: {new Date(mountain.confirmedInstallDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <button onClick={() => updateMountain(mountainId!, { confirmedInstallDate: undefined })} className="text-[12px] text-[#6a7282]">Clear</button>
          </div>
        )}

        {/* Status + Contacts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── Status Pane ── */}
          <ExpandablePane
            title="Status"
            icon={<Info size={16} className="text-[#6a7282]" />}
          >
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[12px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282] uppercase tracking-wide">Next Actions</div>
                  <button
                    onClick={() => setShowAddAction(true)}
                    className="bg-[#ff5c39] text-white rounded-[8px] px-2.5 py-1.5 flex items-center gap-1 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80"
                  >
                    <Plus size={14} /> New
                  </button>
                </div>
                <MountainActivityRollup mountainId={mountainId!} />
              </div>
            </div>

            {/* Updates */}
            <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.06)]">
              <div className="text-[12px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282] uppercase tracking-wide mb-2">Updates</div>
              {updates.length === 0 ? (
                <div className="text-[12px] text-[#8992a0]">No activity yet.</div>
              ) : (
                <div className="space-y-2">
                  {updates.map((u) => (
                    <div key={u.id} className="text-[12px]">
                      <div className="text-[#0a0a0a]">{u.summary}</div>
                      <div className="text-[#8992a0]">{u.actor} · {new Date(u.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ExpandablePane>

          {/* ── Contacts Pane ── */}
          <ExpandablePane
            title="Contacts"
            icon={<Users size={16} className="text-[#6a7282]" />}
            headerRight={
              <button onClick={() => setShowAddContact(true)} className="bg-[#ff5c39] text-white rounded-[8px] px-2.5 py-1.5 flex items-center gap-1 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80"><Plus size={14} /> New</button>
            }
          >
            {(() => {
              const crmContacts = contacts.filter((c) => c.mountainId === mountainId);
              if (crmContacts.length === 0) {
                return (
                  <div className="text-[13px] text-[#6a7282]">No contacts yet.</div>
                );
              }
              return (
                <div className="space-y-2">
                  {crmContacts.map((c) => {
                    const noteCount = c.activities?.filter((a) => a.type === 'note' && !a.archived).length || 0;
                    const openActions = c.activities?.filter((a) => a.type === 'action' && !a.completed).length || 0;
                    return (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setCrmContact(c)}
                        onKeyDown={e => { if (e.key === 'Enter') setCrmContact(c); }}
                        className="w-full text-left border border-[rgba(0,0,0,0.06)] rounded-[10px] p-2.5 cursor-pointer active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.12)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[14px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a] truncate">{c.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {openActions > 0 && (
                              <span className="text-[11px] bg-[#fff4f1] text-[#F95C39] px-2 py-0.5 rounded-full">{openActions} open</span>
                            )}
                            {noteCount > 0 && (
                              <span className="text-[11px] bg-[#eff6ff] text-[#307fe2] px-2 py-0.5 rounded-full">{noteCount} note{noteCount === 1 ? '' : 's'}</span>
                            )}
                            {c.isPrimary && <span className="text-[11px] bg-[#eaf5ef] text-[#3f7a5c] px-2 py-0.5 rounded-full">Primary</span>}
                            <ChevronRight size={14} className="text-[#c0c4cc]" />
                          </div>
                        </div>
                        {c.title && <div className="text-[12px] text-[#6a7282]">{c.title}</div>}
                        {(c.organizationId || c.teamId) && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            <ContactAssociationPills
                              contact={c}
                              organizations={organizations}
                              teams={teams}
                              hideMountain
                              onOpenOrg={id => navigate(`/crm?tab=organizations&open=${id}`)}
                              onOpenTeam={id => navigate(`/crm?tab=teams&open=${id}`)}
                            />
                          </div>
                        )}
                        <div className="flex flex-col gap-0.5 mt-1">
                          {c.email && <span className="flex items-center gap-1.5 text-[12px] text-[#307fe2] truncate"><Mail size={12} className="shrink-0" /> {c.email}</span>}
                          {c.phone && <span className="flex items-center gap-1.5 text-[12px] text-[#6a7282]"><Phone size={12} className="shrink-0" /> {c.phone}</span>}
                        </div>
                        {c.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap mt-1">
                            {c.tags.map(t => <span key={t} className="text-[10px] bg-[#e3f2fd] text-[#1565c0] px-1.5 py-0.5 rounded-full">{t}</span>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </ExpandablePane>
        </div>

        {/* Projects — the unit of work; one progress bar per project */}
        <ProjectsPane mountainId={mountainId!} />

        {/* Proposals — one per project */}
        <ProposalsPane mountainId={mountainId!} />

        {/* Top Row: Trails + Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Trails Pane ── */}
          <ExpandableSection>
          {(openModal) => (
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <button onClick={openModal} className="flex items-center gap-2 active:opacity-70">
                <Maximize2 size={15} className="text-[#6a7282]" />
                <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
                  Trails
                  {trails.length > 0 && (
                    <span className="ml-2 text-[#6a7282] text-[13px] font-normal">({trails.length})</span>
                  )}
                </h2>
              </button>
              <button
                onClick={() => setShowAddTrail(true)}
                className="bg-[#ff5c39] text-white rounded-[8px] px-2.5 py-1.5 flex items-center gap-1 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80"
              >
                <Plus size={14} /> New
              </button>
            </div>

            <div className="space-y-2">
              {trails.length === 0 ? (
                <div className="py-8 text-center">
                  <MapPin className="mx-auto mb-3 text-[#6a7282]" size={32} />
                  <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
                    No trails yet — add one above or from Edit Mountain (pencil above).
                  </p>
                </div>
              ) : (
                <>
                  {trails.map(trail => {
                    const trailLocations = allLocations.filter(
                      l => l.trailId === trail.id || (!l.trailId && l.trailName === trail.name)
                    );
                    const assetCount = trailLocations.reduce((sum, loc) => {
                      return sum + getAssetsByLocationId(loc.id).filter(a => a.type !== 'Miscellaneous').length;
                    }, 0);
                    const inspCount = trailLocations.reduce((sum, loc) => {
                      return sum + (getInspectionsByLocationId(loc.id)[0]?.items.reduce((s, i) => s + i.count, 0) || 0);
                    }, 0);

                    return (
                      <button
                        key={trail.id}
                        onClick={() => setOpenTrailId(trail.id)}
                        className="w-full bg-white rounded-[10px] border border-[rgba(0,0,0,0.06)] p-2.5 text-left active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.12)] transition-colors"
                      >
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-8 h-8 bg-[#fff3f0] rounded-[6px] flex items-center justify-center flex-shrink-0">
                            <MapPin size={14} className="text-[#ff5c39]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px]">
                              {trail.name}
                            </p>
                            {trail.notes && (
                              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[11px] truncate mt-0.5">
                                {trail.notes}
                              </p>
                            )}
                          </div>
                          <ChevronRight size={16} className="text-[#d1d5db] flex-shrink-0" />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="bg-[#f3f3f5] text-[#6a7282] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                            {trailLocations.length} location{trailLocations.length !== 1 ? 's' : ''}
                          </span>
                          {assetCount > 0 && (
                            <span className="bg-[#FFe0D9] text-[#ff5c39] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                              {assetCount} asset{assetCount !== 1 ? 's' : ''}
                            </span>
                          )}
                          {inspCount > 0 && (
                            <span className="bg-[#f3f3f5] text-[#0a0a0a] text-[10px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                              <ClipboardList size={9} />
                              {inspCount} insp.
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {/* Unlinked locations */}
                  {unlinkedLocations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.06)]">
                      <p className="text-[#6a7282] font-['Inter:Medium',sans-serif] text-[11px] uppercase tracking-wide mb-2">
                        Standalone
                      </p>
                      <div className="space-y-1.5">
                        {unlinkedLocations.map(loc => {
                          const locAssets = getAssetsByLocationId(loc.id).filter(a => a.type !== 'Miscellaneous');
                          const isAssigning = assigningLocationId === loc.id;
                          return (
                            <div key={loc.id}>
                              <button
                                onClick={() => navigate(`/mountains/${mountainId}/locations/${loc.id}`)}
                                className="w-full bg-white rounded-[6px] border border-[rgba(0,0,0,0.08)] p-2 text-left active:bg-[#f9fafb]"
                              >
                                <div className="flex items-center gap-2">
                                  <MapPin size={13} className="text-[#6a7282] flex-shrink-0" />
                                  <span className="flex-1 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[12px] truncate">{loc.name}</span>
                                  {loc.difficulty && (
                                    <span className="bg-[#f3f3f5] text-[#0a0a0a] text-[10px] px-1.5 py-0.5 rounded-full font-['Inter:Medium',sans-serif]">
                                      D{loc.difficulty}
                                    </span>
                                  )}
                                  {locAssets.length > 0 && (
                                    <span className="bg-[#FFe0D9] text-[#ff5c39] text-[10px] px-1.5 py-0.5 rounded-full font-['Inter:Medium',sans-serif]">
                                      {locAssets.length}
                                    </span>
                                  )}
                                  <ChevronRight size={13} className="text-[#d1d5db] flex-shrink-0" />
                                </div>
                              </button>
                              {trails.length > 0 && (
                                <div className="ml-1 mt-0.5">
                                  {!isAssigning ? (
                                    <button
                                      onClick={() => setAssigningLocationId(loc.id)}
                                      className="flex items-center gap-1 text-[#307fe2] font-['Inter:Regular',sans-serif] text-[10px] py-0.5 active:opacity-60"
                                    >
                                      <GitMerge size={10} />
                                      Assign
                                    </button>
                                  ) : (
                                    <div className="bg-white rounded-[8px] border border-[#307fe2]/30 p-2 space-y-1.5 mt-1">
                                      <div className="flex items-center justify-between">
                                        <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[11px]">
                                          Assign to:
                                        </p>
                                        <button onClick={() => setAssigningLocationId(null)} className="p-0.5 active:opacity-60">
                                          <X size={12} className="text-[#6a7282]" />
                                        </button>
                                      </div>
                                      <div className="space-y-1">
                                        {trails.map(trail => (
                                          <button
                                            key={trail.id}
                                            onClick={() => {
                                              updateLocation(loc.id, { trailId: trail.id, trailName: trail.name });
                                              setAssigningLocationId(null);
                                              toast.success(`Assigned to ${trail.name}`);
                                            }}
                                            className="w-full flex items-center gap-1.5 bg-[#f9fafb] rounded-[6px] px-2 py-1.5 text-left active:bg-[#eee] transition-colors"
                                          >
                                            <MapPin size={11} className="text-[#ff5c39] flex-shrink-0" />
                                            <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[12px] flex-1 truncate">{trail.name}</span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          )}
          </ExpandableSection>

          {/* ── Notes Pane ── */}
          <ExpandableSection>
            {(openModal) => (
            <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 h-full flex flex-col">
              <MountainNotes mountainId={mountainId!} onExpandClick={openModal} />
            </div>
            )}
          </ExpandableSection>

        </div>

        {/* Bottom Row: Inventory (left) + Documents (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Inventory */}
          <ExpandableSection>
          {(openModal) => (
          <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 h-full flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <button onClick={openModal} className="flex items-start gap-2 active:opacity-70 text-left">
              <Maximize2 size={15} className="text-[#6a7282] mt-0.5 shrink-0" />
              <div>
                <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
                  Inventory
                  {inventoryAssets.length > 0 && (
                    <span className="ml-2 text-[#6a7282] text-[13px] font-normal">({inventoryAssets.length})</span>
                  )}
                </h2>
                {(trackedCount > 0 || expensedCount > 0) && (
                  <p className="text-[#8992a0] text-[11px] mt-0.5">{trackedCount} tracked · {expensedCount} expensed</p>
                )}
              </div>
            </button>
            <button
              onClick={() => setShowCheckInOut(true)}
              className="bg-[#ff5c39] text-white rounded-[8px] px-2.5 py-1.5 flex items-center gap-1 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80 shrink-0"
            >
              <Truck size={14} /> Assign
            </button>
          </div>


          {inventoryAssets.length === 0 ? (
            <div className="py-8 text-center">
              <Package className="mx-auto mb-3 text-[#6a7282]" size={32} />
              <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
                No inventory assigned. Add items via the Admin panel.
              </p>
            </div>
          ) : (
            <>
              {/* Summary pills */}
              {Object.keys(invByType).length > 0 && (
                <div className="flex gap-2 flex-wrap mb-3">
                  {Object.entries(invByType).map(([type, count]) => {
                    const Icon = ASSET_ICONS[type as keyof typeof ASSET_ICONS] || Box;
                    return (
                      <span
                        key={type}
                        className={`flex items-center gap-1.5 text-[11px] font-['Inter:Medium',sans-serif] font-medium px-2.5 py-1 rounded-full ${ASSET_TYPE_COLORS[type] || 'bg-[#f3f3f5] text-[#6a7282]'}`}
                      >
                        <Icon size={11} />
                        Quantity: {count}
                      </span>
                    );
                  })}
                </div>
              )}
              {/* Asset grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {inventoryAssets.map(asset => {
                  const Icon = ASSET_ICONS[asset.type as keyof typeof ASSET_ICONS] || Box;
                  const assignedLoc = asset.locationId
                    ? allLocations.find(l => l.id === asset.locationId)
                    : null;
                  const label = [asset.manufacturer || asset.customManufacturer, asset.model || asset.customModel].filter(Boolean).join(' ') || asset.type;
                  return (
                    <button
                      key={asset.id}
                      onClick={() => {
                        if (asset.inventoryCategory || asset.yullrInventoryNumber) {
                          setSelectedInventoryItemId(asset.id);
                        } else if (asset.locationId) {
                          navigate(`/mountains/${mountainId}/locations/${asset.locationId}/assets/${asset.id}`);
                        }
                      }}
                      className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.06)] p-2.5 text-left active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.12)] transition-colors"
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <div className={`w-7 h-7 rounded-[6px] flex items-center justify-center flex-shrink-0 ${ASSET_TYPE_COLORS[asset.type] || 'bg-[#f3f3f5] text-[#6a7282]'}`}>
                          <Icon size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[12px] line-clamp-2 mb-0.5">{label}</p>
                          {asset.serialNumber && (
                            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[10px] truncate">S/N: {asset.serialNumber}</p>
                          )}
                        </div>
                      </div>
                      {assignedLoc && (
                        <span className="text-[10px] bg-[#f3f3f5] text-[#ff5c39] px-2 py-0.5 rounded-full font-['Inter:Medium',sans-serif] inline-block">
                          {assignedLoc.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          </div>
          )}
          </ExpandableSection>

          {/* Documents */}
          <ExpandableSection>
            {(openModal) => (
            <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 h-full flex flex-col">
              <MountainDocuments mountainId={mountainId!} onExpandClick={openModal} />
            </div>
            )}
          </ExpandableSection>

        </div>

      </div>

      {showMap && <MountainMapView mountainId={mountainId!} onClose={() => setShowMap(false)} />}
      {showExport && <ExportModal mountainId={mountainId!} onClose={() => setShowExport(false)} />}
      {showAddTrail && <AddTrailModal mountainId={mountainId!} onClose={() => setShowAddTrail(false)} />}
      {selectedInventoryItemId && assets.find(a => a.id === selectedInventoryItemId) && (
        <InventoryItemDetailModal
          asset={assets.find(a => a.id === selectedInventoryItemId)!}
          allAssets={assets}
          onClose={() => setSelectedInventoryItemId(null)}
        />
      )}
      {showCheckInOut && <AssignInventoryModal mountainId={mountainId!} onClose={() => setShowCheckInOut(false)} />}
      {openTrailId && <TrailDetailModal mountainId={mountainId!} trailId={openTrailId} onClose={() => setOpenTrailId(null)} />}
      {showAddAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowAddAction(false); }}>
          <div className="bg-white rounded-[16px] w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">Add Action Item</h2>
              <button onClick={() => setShowAddAction(false)} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
            </div>
            <textarea
              autoFocus
              value={newActionText}
              onChange={e => setNewActionText(e.target.value)}
              placeholder="Add an action item…"
              rows={3}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[13px] text-[#0a0a0a] outline-none resize-none"
            />
            {yullrMembers.length > 0 && (
              <select
                value={newActionAssigneeId}
                onChange={e => setNewActionAssigneeId(e.target.value)}
                className="w-full mt-2 bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[13px] text-[#0a0a0a] outline-none"
              >
                <option value="">Assign to… (optional)</option>
                {yullrMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => { setShowAddAction(false); setNewActionText(''); setNewActionAssigneeId(''); }}
                className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[8px] py-2.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:bg-[#e8e8ea]"
              >
                <X size={16} />
                Cancel
              </button>
              <button
                onClick={() => { if (newActionText.trim()) { addActionItem(newActionText.trim(), newActionAssigneeId || undefined); setNewActionText(''); setNewActionAssigneeId(''); setShowAddAction(false); } }}
                disabled={!newActionText.trim()}
                className="flex-1 bg-[#1D2930] text-white rounded-[8px] py-2.5 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80 disabled:opacity-40"
              >
                <Check size={16} />
                Add
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddContact && (
        <ContactForm
          contact={null}
          defaults={{ mountainId: mountainId!, organizationId: mountain.organizationId }}
          onClose={() => setShowAddContact(false)}
        />
      )}
      {crmContact && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setCrmContact(null); }}
        >
          <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-lg h-[88vh] sm:h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <ContactDetail contact={contacts.find((c) => c.id === crmContact.id) || crmContact} onBack={() => setCrmContact(null)} />
          </div>
        </div>
      )}
      {contactSlot && contactForSlot(contactSlot) && (
        <ContactDetailModal
          contact={contactForSlot(contactSlot)!}
          roleLabel={
            contactSlot.type === 'admin' ? 'Admin'
              : contactSlot.type === 'technical' ? 'Technical'
                : (contactForSlot(contactSlot)!.role || 'Contact')
          }
          authorName={authorName}
          onSave={(updated) => persistContact(contactSlot, updated)}
          onClose={() => setContactSlot(null)}
        />
      )}

    </div>
  );
}

// ─── Add Trail Modal ──────────────────────────────────────────────────────────

function AddTrailModal({ mountainId, onClose }: { mountainId: string; onClose: () => void }) {
  const { addTrail } = useData();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [isNastar, setIsNastar] = useState(false);

  const handleSave = () => {
    if (!name.trim()) { toast.error('Trail name is required'); return; }
    addTrail({ mountainId, name: name.trim(), notes: notes.trim() || undefined, isNastar: isNastar || undefined });
    toast.success('Trail added');
    onClose();
  };

  const inp = "w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none";

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[17px]">Add Trail</p>
          <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5] active:bg-[#e5e7eb] shrink-0">
            <X size={16} className="text-[#6a7282]" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">
              Trail Name <span className="text-[#ff5c39]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Upper Meadow"
              autoFocus
              className={inp}
            />
          </div>

          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes about this trail…"
              rows={3}
              className={`${inp} resize-none`}
            />
          </div>

          <button
            type="button"
            onClick={() => setIsNastar(v => !v)}
            className="flex items-center gap-3 w-full active:opacity-70"
          >
            <div className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isNastar ? 'bg-[#ff5c39] border-[#ff5c39]' : 'bg-white border-[#d1d5db]'}`}>
              {isNastar && (
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                  <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px]">NASTAR trail</span>
            {isNastar && (
              <span className="ml-auto bg-[#ff5c39] text-white text-[11px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                NASTAR
              </span>
            )}
          </button>
        </div>

        <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)]">
          <button
            type="button"
            onClick={handleSave}
            className="w-full bg-[#ff5c39] text-white rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] active:opacity-80"
          >
            Save Trail
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inventory Item Detail Modal ─────────────────────────────────────────────

function InventoryItemDetailModal({
  asset,
  allAssets,
  onClose,
}: {
  asset: Asset;
  allAssets: Asset[];
  onClose: () => void;
}) {
  const { updateAsset } = useData();
  const [showDeployConfirm, setShowDeployConfirm] = useState(false);
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const isServer = asset.inventorySubcategory === 'Complete Server';
  const components = isServer
    ? (asset.serverComponentIds || []).map(id => allAssets.find(a => a.id === id)).filter(Boolean) as Asset[]
    : [];

  const displayName = [asset.customManufacturer || asset.manufacturer, asset.customModel || asset.model]
    .filter(Boolean).join(' ') || asset.inventorySubcategory || asset.inventoryCategory || asset.type;

  function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-[rgba(0,0,0,0.05)] last:border-0">
        <div className="w-7 shrink-0 text-[#6a7282] mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-[#6a7282] uppercase tracking-wide font-['Inter:Medium',sans-serif] mb-0.5">{label}</p>
          <p className="text-[14px] text-[#0a0a0a] font-['Inter:Regular',sans-serif] break-words">{value}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[17px] truncate">{displayName}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {asset.yullrInventoryNumber && (
                <span className="text-[11px] font-mono text-[#6a7282] bg-[#f3f3f5] px-2 py-0.5 rounded-full">{asset.yullrInventoryNumber}</span>
              )}
              {asset.inventoryCategory && (
                <span className="text-[11px] text-[#6a7282]">{asset.inventoryCategory}{asset.inventorySubcategory ? ` · ${asset.inventorySubcategory}` : ''}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5] active:bg-[#e5e7eb] shrink-0">
            <X size={16} className="text-[#6a7282]" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3">
          {/* Cost */}
          {asset.cost !== undefined && asset.cost > 0 && (
            <div className="bg-[#f9fafb] rounded-[10px] px-4 py-3 mb-4 flex items-center justify-between">
              <span className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif] uppercase tracking-wide">
                {isServer ? 'Build Cost' : 'Cost'}
              </span>
              <span className="text-[18px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{fmt(asset.cost)}</span>
            </div>
          )}

          <div>
            {asset.manufacturer || asset.customManufacturer ? (
              <Row icon={<Tag size={14} />} label="Manufacturer" value={asset.customManufacturer || asset.manufacturer} />
            ) : null}
            {asset.model || asset.customModel ? (
              <Row icon={<Tag size={14} />} label="Model" value={asset.customModel || asset.model} />
            ) : null}
            {asset.serialNumber && (
              <Row icon={<Hash size={14} />} label="Serial Number" value={<span className="font-mono">{asset.serialNumber}</span>} />
            )}
            {asset.ipAddress && (
              <Row icon={<Globe size={14} />} label="IP Address" value={<span className="font-mono">{asset.ipAddress}</span>} />
            )}
            {asset.upc && (
              <Row icon={<Barcode size={14} />} label="UPC" value={<span className="font-mono">{asset.upc}</span>} />
            )}
            {asset.vendor && (
              <Row icon={<Truck size={14} />} label="Vendor" value={asset.vendor} />
            )}
            {asset.dateOfPurchase && (
              <Row icon={<Calendar size={14} />} label="Date of Purchase" value={asset.dateOfPurchase} />
            )}
            {asset.dateAddedToInventory && (
              <Row icon={<Calendar size={14} />} label="Date Added to Inventory" value={asset.dateAddedToInventory} />
            )}
            {asset.mountainDeployment && (
              <Row icon={<Building2 size={14} />} label="Deployed At" value={asset.mountainDeployment} />
            )}
            {asset.deployedDate ? (
              <Row icon={<Rocket size={14} />} label="Deployed Date" value={asset.deployedDate} />
            ) : (
              <div className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-7 shrink-0 text-[#6a7282]"><Rocket size={14} /></div>
                  <p className="text-[11px] text-[#6a7282] uppercase tracking-wide font-['Inter:Medium',sans-serif]">Deployed Date</p>
                </div>
                <button
                  onClick={() => setShowDeployConfirm(true)}
                  className="bg-[#ff5c39] text-white rounded-[8px] px-2.5 py-1.5 flex items-center gap-1 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80"
                >
                  <Rocket size={14} /> Deploy
                </button>
              </div>
            )}
            {asset.notes && (
              <Row icon={<FileText size={14} />} label="Notes" value={asset.notes} />
            )}
          </div>

          {/* Server components */}
          {isServer && components.length > 0 && (
            <div className="mt-4">
              <p className="text-[12px] text-[#6a7282] uppercase tracking-wide font-['Inter:Medium',sans-serif] mb-2">
                Components ({components.length})
              </p>
              <div className="border border-[rgba(0,0,0,0.08)] rounded-[10px] divide-y divide-[rgba(0,0,0,0.05)] overflow-hidden">
                {components.map(comp => (
                  <div key={comp.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Cpu size={13} className="text-[#6a7282] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#0a0a0a] font-['Inter:Medium',sans-serif] truncate">
                        {[comp.customManufacturer || comp.manufacturer, comp.customModel || comp.model].filter(Boolean).join(' ') || comp.inventorySubcategory || 'Component'}
                      </p>
                      <p className="text-[11px] text-[#6a7282]">
                        {comp.inventorySubcategory}{comp.serialNumber ? ` · ${comp.serialNumber}` : ''}{comp.yullrInventoryNumber ? ` · ${comp.yullrInventoryNumber}` : ''}
                      </p>
                    </div>
                    {comp.cost !== undefined && (
                      <span className="text-[12px] text-[#6a7282] shrink-0">{fmt(comp.cost)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deployment history */}
          {(asset.deploymentLog?.length ?? 0) > 1 && (
            <div className="mt-4">
              <p className="text-[12px] text-[#6a7282] uppercase tracking-wide font-['Inter:Medium',sans-serif] mb-2">Deployment History</p>
              <div className="space-y-1">
                {[...asset.deploymentLog!].reverse().map((entry, i) => (
                  <div key={i} className="flex items-center justify-between text-[12px]">
                    <span className="text-[#0a0a0a]">{entry.mountainName}</span>
                    <span className="text-[#6a7282]">{new Date(entry.timestamp).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)]">
          <button
            onClick={onClose}
            className="w-full bg-[#f3f3f5] text-[#6a7282] rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] active:bg-[#e5e7eb]"
          >
            Close
          </button>
        </div>
      </div>

      {showDeployConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowDeployConfirm(false); }}
        >
          <div className="bg-white w-full max-w-lg rounded-t-[20px] sm:rounded-[20px] p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-[#fff0ee] flex items-center justify-center flex-shrink-0">
                <Rocket size={28} className="text-[#ff5c39]" />
              </div>
              <div>
                <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Deploy this item?</h2>
                <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px] mt-1 leading-relaxed">
                  This sets today's date ({new Date().toLocaleDateString()}) as the Deployed Date. It can only be changed
                  from the item's edit form in the main Inventory section.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeployConfirm(false)}
                className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] active:bg-[#e5e7eb]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateAsset(asset.id, { deployedDate: new Date().toISOString().slice(0, 10) });
                  setShowDeployConfirm(false);
                  toast.success('Marked as deployed');
                }}
                className="flex-1 bg-[#ff5c39] text-white rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] active:opacity-80"
              >
                Deploy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contact Detail Modal ────────────────────────────────────────────────────

function ContactDetailModal({
  contact,
  roleLabel,
  authorName,
  onSave,
  onClose,
}: {
  contact: Contact;
  roleLabel: string;
  authorName: string;
  onSave: (updated: Contact) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [form, setForm] = useState({
    name: contact.name || '',
    title: contact.title || '',
    email: contact.email || '',
    phone: contact.phone || '',
    phoneType: contact.phoneType || 'Office',
    role: contact.role || '',
  });

  const notes = [...(contact.contactNotes || [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const addNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    const note: ContactNote = {
      id: `n_${Date.now()}`,
      text,
      author: authorName,
      timestamp: new Date().toISOString(),
    };
    onSave({ ...contact, contactNotes: [...(contact.contactNotes || []), note] });
    setNoteDraft('');
  };

  const saveDetails = () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    onSave({
      ...contact,
      name: form.name.trim(),
      title: form.title.trim() || undefined,
      email: form.email.trim(),
      phone: form.phone.trim(),
      phoneType: form.phoneType as Contact['phoneType'],
      role: (form.role || undefined) as Contact['role'],
    });
    setEditing(false);
    toast.success('Contact updated');
  };

  const inputCls = 'w-full border border-[rgba(0,0,0,0.12)] rounded-[10px] px-3 py-2 text-[14px] text-[#0a0a0a] focus:outline-none focus:border-[#307fe2]';

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[17px] truncate">{contact.name || 'Contact'}</p>
            <span className="inline-block mt-1 text-[11px] bg-[#f3f3f5] text-[#6a7282] px-2 py-0.5 rounded-full">{roleLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!editing && (
              <button onClick={() => setEditing(true)} className="p-1.5 rounded-full bg-[#f3f3f5] active:bg-[#e5e7eb]" aria-label="Edit contact" title="Edit details">
                <Pencil size={15} className="text-[#6a7282]" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5] active:bg-[#e5e7eb]" aria-label="Close">
              <X size={16} className="text-[#6a7282]" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {editing ? (
            /* ── Edit core details ── */
            <div className="space-y-3">
              <div>
                <label className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif] mb-1 block">Name</label>
                <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif] mb-1 block">Title</label>
                <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif] mb-1 block">Email</label>
                <input className={inputCls} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif] mb-1 block">Phone</label>
                  <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="w-28">
                  <label className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif] mb-1 block">Type</label>
                  <select className={inputCls} value={form.phoneType} onChange={(e) => setForm({ ...form, phoneType: e.target.value as any })}>
                    <option value="Office">Office</option>
                    <option value="Cell">Cell</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif] mb-1 block">Role</label>
                <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })}>
                  <option value="">—</option>
                  <option value="Admin">Admin</option>
                  <option value="Technical">Technical</option>
                  <option value="Team">Team</option>
                  <option value="Operations">Operations</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setEditing(false); setForm({ name: contact.name || '', title: contact.title || '', email: contact.email || '', phone: contact.phone || '', phoneType: contact.phoneType || 'Office', role: contact.role || '' }); }} className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[10px] py-2.5 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:bg-[#e5e7eb]">Cancel</button>
                <button onClick={saveDetails} className="flex-1 bg-[#ff5c39] text-white rounded-[10px] py-2.5 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80">Save</button>
              </div>
            </div>
          ) : (
            /* ── Read-only details ── */
            <div className="space-y-2.5">
              {contact.title && (
                <div className="flex items-center gap-2 text-[14px] text-[#0a0a0a]"><Tag size={14} className="text-[#6a7282] shrink-0" /> {contact.title}</div>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-[14px] text-[#307fe2] break-all"><Mail size={14} className="shrink-0" /> {contact.email}</a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-[14px] text-[#0a0a0a]"><Phone size={14} className="text-[#6a7282] shrink-0" /> {contact.phone}{contact.phoneType ? ` · ${contact.phoneType}` : ''}</a>
              )}
              {!contact.title && !contact.email && !contact.phone && (
                <div className="text-[13px] text-[#8992a0]">No details yet — tap the pencil to add them.</div>
              )}
            </div>
          )}

          {/* ── Notes ── */}
          {!editing && (
            <div className="mt-5 pt-4 border-t border-[rgba(0,0,0,0.06)]">
              <div className="text-[12px] font-['Inter:Medium',sans-serif] font-medium text-[#6a7282] uppercase tracking-wide mb-2">Notes</div>
              <div className="flex gap-2 mb-3">
                <input
                  className={inputCls}
                  placeholder="Add a note…"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }}
                />
                <button onClick={addNote} disabled={!noteDraft.trim()} className="bg-[#ff5c39] text-white rounded-[10px] px-3.5 font-['Inter:Medium',sans-serif] font-medium text-[14px] active:opacity-80 disabled:opacity-40 shrink-0 flex items-center gap-1">
                  <Plus size={15} /> Add
                </button>
              </div>
              {notes.length === 0 ? (
                <div className="text-[13px] text-[#8992a0]">No notes yet.</div>
              ) : (
                <div className="space-y-2.5">
                  {notes.map((n) => (
                    <div key={n.id} className="bg-[#f9fafb] rounded-[10px] px-3 py-2.5">
                      <div className="text-[13px] text-[#0a0a0a] whitespace-pre-wrap">{n.text}</div>
                      <div className="text-[11px] text-[#8992a0] mt-1">{n.author} · {new Date(n.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}