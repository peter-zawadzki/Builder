import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Loader2, Lock, CheckCircle2, ExternalLink } from 'lucide-react';
import { useApi } from '../api/client';
import type { FeedbackSubmissionSummary, FeedbackType, FeedbackPlatform } from '../api/client';
import { useIsAdminOrAbove } from '../hooks/useRole';

const STATUS_LABEL: Record<string, string> = {
  in_review: 'In review',
  approved: 'Approved',
  submitted: 'Submitted',
  resolved: 'Completed',
};

const PLATFORMS: (FeedbackPlatform | 'All')[] = ['All', 'Builder', 'YULLR.com', 'Portal'];
const TYPES: (FeedbackType | 'All')[] = ['All', 'bug', 'feature', 'general'];

// Every bug/feature/general submission, across all three platforms, in one
// admin view — the per-submission detail (fix, mockup, dev brief, approve
// controls) still lives at FeedbackReviewPage; this is the tracker that lets
// an admin see everything outstanding and close items out once shipped.
export function FeedbackDashboardPage() {
  const navigate = useNavigate();
  const isAdmin = useIsAdminOrAbove();
  const api = useApi();

  const [submissions, setSubmissions] = useState<FeedbackSubmissionSummary[] | null>(null);
  const [platform, setPlatform] = useState<FeedbackPlatform | 'All'>('All');
  const [type, setType] = useState<FeedbackType | 'All'>('All');
  const [hideCompleted, setHideCompleted] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const r = await api.listFeedbackSubmissions();
    setSubmissions(r.submissions);
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    return (submissions ?? [])
      .filter(s => platform === 'All' || s.platform === platform)
      .filter(s => type === 'All' || s.type === type)
      .filter(s => !hideCompleted || s.status !== 'resolved');
  }, [submissions, platform, type, hideCompleted]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-[#f3f3f5] flex items-center justify-center">
          <Lock size={24} className="text-[#6a7282]" />
        </div>
        <div>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Not available</h1>
          <p className="text-[#6a7282] text-[14px] mt-1">Feedback requests are restricted to admins.</p>
        </div>
        <button onClick={() => navigate('/')} className="bg-[#1D2930] text-white rounded-[8px] px-5 py-2.5 font-['Inter:Medium',sans-serif] font-medium text-[14px]">Back to app</button>
      </div>
    );
  }

  async function markCompleted(id: string) {
    setBusyId(id);
    try {
      await api.completeFeedback(id);
      setSubmissions(s => s?.map(x => x.id === id ? { ...x, status: 'resolved', completedAt: new Date().toISOString() } : x) ?? null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[13px] text-[#6a7282] mb-4">
        <ArrowLeft size={15} /> Back
      </button>
      <h1 className="text-[18px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] mb-1">Feedback requests</h1>
      <p className="text-[#6a7282] text-[13px] mb-4">Every bug report, feature request, and piece of feedback across Builder, YULLR.com, and Portal.</p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {PLATFORMS.map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${platform === p ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
          >
            {p}
          </button>
        ))}
        <span className="w-px h-4 bg-[rgba(0,0,0,0.1)] mx-1" />
        {TYPES.map(t => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] capitalize ${type === t ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
          >
            {t}
          </button>
        ))}
        <span className="w-px h-4 bg-[rgba(0,0,0,0.1)] mx-1" />
        <label className="flex items-center gap-1.5 text-[12px] text-[#6a7282] cursor-pointer">
          <input type="checkbox" checked={hideCompleted} onChange={e => setHideCompleted(e.target.checked)} />
          Hide completed
        </label>
      </div>

      {submissions === null ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-[#6a7282]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 px-4">
          <p className="text-[#6a7282] text-[13px]">Nothing matches these filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <div key={s.id} className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f3f3f5] text-[#0a0a0a] font-['Inter:Medium',sans-serif] uppercase">{s.type}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f3f3f5] text-[#0a0a0a]">{s.platform}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-['Inter:Medium',sans-serif] ${s.status === 'resolved' ? 'bg-[#eafaf1] text-[#16a34a]' : 'bg-[#eef3fb] text-[#307fe2]'}`}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                    {s.hasFix && <span className="text-[11px] text-[#8992a0]">has suggested fix</span>}
                    {s.hasBrief && <span className="text-[11px] text-[#8992a0]">has dev brief</span>}
                    {s.hasMockup && <span className="text-[11px] text-[#8992a0]">has mockup</span>}
                  </div>
                  <p className="text-[14px] text-[#0a0a0a] font-['Inter:Medium',sans-serif]">{s.summary}</p>
                  <p className="text-[12px] text-[#6a7282] mt-0.5">
                    {s.submitterName ?? 'Unknown'} · {new Date(s.createdAt).toLocaleDateString()}
                    {s.completedAt ? ` · completed ${new Date(s.completedAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/feedback/${s.id}`)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-[6px] bg-[#f3f3f5] text-[#0a0a0a] text-[12px] font-['Inter:Medium',sans-serif]"
                  >
                    <ExternalLink size={12} /> View
                  </button>
                  {s.status !== 'resolved' && (
                    <button
                      disabled={busyId === s.id}
                      onClick={() => markCompleted(s.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-[6px] bg-[#1D2930] text-white text-[12px] font-['Inter:Medium',sans-serif] disabled:opacity-50"
                    >
                      <CheckCircle2 size={12} /> Mark completed
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
