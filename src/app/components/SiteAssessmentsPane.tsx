import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, ChevronRight, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../context/DataContext';
import {
  listSiteAssessments, createSiteAssessment, type SiteAssessment,
} from '../utils/siteAssessmentsApi';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function CreateAssessmentModal({
  mountainId, onClose, onCreated,
}: { mountainId: string; onClose: () => void; onCreated: (a: SiteAssessment) => void }) {
  const { projects } = useData() as any;
  const mountainProjects = (projects as any[]).filter(p => p.mountainId === mountainId);

  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setBusy(true);
    setError(null);
    try {
      const created = await createSiteAssessment({
        name: name.trim(),
        mountain_id: mountainId,
        project_id: projectId || undefined,
        description: description || undefined,
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

        {mountainProjects.length > 0 && (
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

        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Description (optional)</label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none resize-none"
          />
        </div>

        {error && <p className="text-[#ef4444] font-['Inter:Regular',sans-serif] text-[13px]">{error}</p>}

        <button
          type="submit" disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-[#ff5c39] text-white rounded-[8px] py-3 text-[13px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80 disabled:opacity-60"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? 'Creating…' : 'Create & Open'}
        </button>
      </form>
    </div>
  );
}

// Embedded, mountain-scoped pane — mirrors ProjectsPane/ProposalsPane's
// pattern (a full-width self-contained section on MountainDetail that
// fetches its own data). Site Assessments intentionally have no standalone
// top-level nav/list — they only exist in the context of a mountain, same
// as Projects.
export function SiteAssessmentsPane({ mountainId }: { mountainId: string }) {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<SiteAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    listSiteAssessments()
      .then(all => setAssessments(all.filter(a => a.mountain_id === mountainId && !a.archived_at)))
      .catch(err => toast.error(`Error loading Site Assessments: ${err.message}`))
      .finally(() => setLoading(false));
  }, [mountainId]);

  return (
    <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
          Site Assessments
          {assessments.length > 0 && <span className="ml-2 text-[#6a7282] text-[13px] font-normal">({assessments.length})</span>}
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-[#ff5c39] text-white rounded-[8px] px-2.5 py-1.5 flex items-center gap-1 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80"
        >
          <Plus size={14} /> New
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={18} className="text-[#6a7282] animate-spin" /></div>
      ) : assessments.length === 0 ? (
        <div className="text-[13px] text-[#6a7282]">No Site Assessments yet.</div>
      ) : (
        <div className="space-y-2.5">
          {assessments.map(a => (
            <button
              key={a.id}
              onClick={() => navigate(`/mountains/${mountainId}/site-assessments/${a.id}`)}
              className="w-full bg-white rounded-[10px] border border-[rgba(0,0,0,0.06)] p-2.5 text-left active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.12)] transition-colors flex items-center gap-2.5"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px] truncate">{a.name}</p>
                <p className="text-[#8992a0] font-['Inter:Regular',sans-serif] text-[11px]">
                  {a.created_by_name ? `Created by ${a.created_by_name} · ` : ''}{formatDate(a.created_at)}
                  {a.updated_at !== a.created_at && ` · Updated ${formatDate(a.updated_at)}`}
                </p>
              </div>
              <ChevronRight size={16} className="text-[#d1d5db] flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateAssessmentModal
          mountainId={mountainId}
          onClose={() => setShowCreateModal(false)}
          onCreated={(created) => {
            setShowCreateModal(false);
            navigate(`/mountains/${mountainId}/site-assessments/${created.id}`);
          }}
        />
      )}
    </div>
  );
}
