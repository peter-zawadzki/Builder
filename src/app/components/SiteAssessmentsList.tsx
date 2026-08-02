import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Search, Camera, X, Archive as ArchiveIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../context/DataContext';
import {
  listSiteAssessments, createSiteAssessment, archiveSiteAssessment,
  type SiteAssessment,
} from '../utils/siteAssessmentsApi';

// The record's own workflow-stage field — separate from "archived", which is
// tracked via archived_at (matching this app's existing convention, e.g.
// Proposal.archived) rather than being one of these status values.
const STATUS_OPTIONS = [
  'Draft', 'In progress', 'Awaiting resort information', 'Ready for internal review',
  'Internally reviewed', 'Approved for project planning', 'Completed',
];

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function CreateAssessmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (a: SiteAssessment) => void }) {
  const { mountains, projects } = useData() as any;
  const [name, setName] = useState('');
  const [mountainId, setMountainId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [inspectionType, setInspectionType] = useState('');
  const [inspectionDate, setInspectionDate] = useState('');
  const [description, setDescription] = useState('');
  const [repName, setRepName] = useState('');
  const [repTitle, setRepTitle] = useState('');
  const [repEmail, setRepEmail] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountainProjects = mountainId
    ? (projects as any[]).filter(p => p.mountainId === mountainId)
    : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    if (!mountainId) { setError('Mountain is required'); return; }
    setBusy(true);
    setError(null);
    try {
      const created = await createSiteAssessment({
        name: name.trim(),
        mountain_id: mountainId,
        project_id: projectId || undefined,
        inspection_type: inspectionType || undefined,
        inspection_date: inspectionDate || undefined,
        description: description || undefined,
        resort_representative_name: repName || undefined,
        resort_representative_title: repTitle || undefined,
        resort_representative_email: repEmail || undefined,
        general_notes: generalNotes || undefined,
      });
      onCreated(created);
    } catch (err: any) {
      setError(err.message || 'Failed to create Site Assessment');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full max-w-lg rounded-t-[20px] sm:rounded-[20px] p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">New Site Assessment</h2>
          <button type="button" onClick={onClose} className="p-1 active:opacity-60">
            <X size={20} className="text-[#6a7282]" />
          </button>
        </div>

        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">
            Name <span className="text-[#ff5c39]">*</span>
          </label>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Initial Virtual Inspection"
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
          />
        </div>

        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">
            Mountain <span className="text-[#ff5c39]">*</span>
          </label>
          <select
            value={mountainId}
            onChange={e => { setMountainId(e.target.value); setProjectId(''); }}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
          >
            <option value="">Select a mountain…</option>
            {(mountains as any[]).filter(m => !m.archived).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {mountainId && mountainProjects.length > 0 && (
          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Project (optional)</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
            >
              <option value="">No project association</option>
              {mountainProjects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Type (optional)</label>
            <input
              type="text" value={inspectionType} onChange={e => setInspectionType(e.target.value)}
              placeholder="e.g. Race Trail Inspection"
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
            />
          </div>
          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Date (optional)</label>
            <input
              type="date" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Description (optional)</label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Resort rep name</label>
            <input
              type="text" value={repName} onChange={e => setRepName(e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
            />
          </div>
          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Rep title</label>
            <input
              type="text" value={repTitle} onChange={e => setRepTitle(e.target.value)}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Rep email</label>
          <input
            type="email" value={repEmail} onChange={e => setRepEmail(e.target.value)}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
          />
        </div>

        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">General notes (optional)</label>
          <textarea
            value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} rows={2}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none resize-none"
          />
        </div>

        {error && <p className="text-[#ef4444] font-['Inter:Regular',sans-serif] text-[13px]">{error}</p>}

        <button
          type="submit" disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-[#ff5c39] text-white rounded-[8px] py-3 text-[13px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80 disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {busy ? 'Creating…' : 'Create & Open'}
        </button>
      </form>
    </div>
  );
}

export function SiteAssessmentsList() {
  const navigate = useNavigate();
  const { getMountainById, getProjectById } = useData();
  const [assessments, setAssessments] = useState<SiteAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  useEffect(() => {
    listSiteAssessments()
      .then(setAssessments)
      .catch(err => setLoadError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assessments.filter(a => {
      if (!showArchived && a.archived_at) return false;
      if (showArchived && !a.archived_at) return false;
      if (statusFilter !== 'All' && a.status !== statusFilter) return false;
      if (!q) return true;
      const mountain = getMountainById(a.mountain_id);
      const project = a.project_id ? getProjectById(a.project_id) : undefined;
      const haystack = [
        a.name, mountain?.name, (project as any)?.name, a.status, a.created_by_name,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [assessments, search, statusFilter, showArchived, getMountainById, getProjectById]);

  async function handleArchive(a: SiteAssessment) {
    setArchivingId(a.id);
    try {
      await archiveSiteAssessment(a.id);
      setAssessments(prev => prev.map(x => x.id === a.id ? { ...x, archived_at: new Date().toISOString() } : x));
      toast.success('Site Assessment archived');
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] flex flex-col">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Camera size={20} className="text-[#ff5c39]" />
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px]">Site Assessments</h1>
        </div>

        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-3 mb-3 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, mountain, project, status, or creator…"
                className="w-full bg-[#f3f3f5] rounded-[6px] pl-9 pr-3 py-2 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px] border-none outline-none"
              />
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="shrink-0 flex items-center gap-1.5 bg-[#1D2930] text-white px-3 py-2.5 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] active:opacity-80"
            >
              <Plus size={14} /> Create
            </button>
            <button
              onClick={() => setShowArchived(v => !v)}
              className={`shrink-0 px-3 py-2.5 rounded-[8px] text-[13px] font-['Inter:Medium',sans-serif] ${showArchived ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
            >
              Archived
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setStatusFilter('All')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${statusFilter === 'All' ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
            >
              All
            </button>
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${statusFilter === s ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-8 text-center">
            <Loader2 size={24} className="mx-auto mb-3 text-[#6a7282] animate-spin" />
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">Loading…</p>
          </div>
        ) : loadError ? (
          <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-8 text-center">
            <p className="text-[#ef4444] font-['Inter:Regular',sans-serif]">{loadError}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-8 text-center">
            <Camera className="mx-auto mb-4 text-[#6a7282]" size={48} />
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">
              {search ? `No Site Assessments found for "${search}".` : showArchived ? 'No archived Site Assessments.' : 'No Site Assessments yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(a => {
              const mountain = getMountainById(a.mountain_id);
              const project = a.project_id ? getProjectById(a.project_id) : undefined;
              return (
                <div
                  key={a.id}
                  onClick={() => navigate(`/site-assessments/${a.id}`)}
                  className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-4 active:bg-[#f3f3f5] transition-colors cursor-pointer flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] line-clamp-2">{a.name}</h3>
                    <span className="shrink-0 text-[10px] bg-[#f3f3f5] text-[#6a7282] px-2 py-0.5 rounded-full">{a.status}</span>
                  </div>
                  <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px]">
                    {mountain?.name || 'Unknown mountain'}
                    {project && ` · ${(project as any).name || (project as any).type}`}
                  </p>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-[#8992a0]">
                    <span>{formatDate(a.inspection_date)}</span>
                    <span>·</span>
                    <span>{a.object_count} object{a.object_count !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>{a.open_action_item_count} open action item{a.open_action_item_count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-[#8992a0]">
                      {a.created_by_name ? `Created by ${a.created_by_name}` : 'Created'} · updated {formatDate(a.updated_at)}
                    </p>
                    {!a.archived_at && (
                      <button
                        onClick={e => { e.stopPropagation(); handleArchive(a); }}
                        disabled={archivingId === a.id}
                        className="flex items-center gap-1 text-[11px] font-['Inter:Medium',sans-serif] text-[#6a7282] bg-[#f3f3f5] px-2 py-1 rounded-full active:opacity-70 disabled:opacity-50"
                      >
                        <ArchiveIcon size={10} /> Archive
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateAssessmentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(created) => {
            setShowCreateModal(false);
            navigate(`/site-assessments/${created.id}`);
          }}
        />
      )}
    </div>
  );
}
