import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useUser } from '@clerk/clerk-react';
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { useApi } from '../api/client';
import type { FeedbackSubmission } from '../api/client';

const PETER_EMAIL = 'peter@yullr.com';

const STATUS_LABEL: Record<string, string> = {
  in_review: 'In review',
  approved: 'Approved',
  submitted: 'Submitted',
  resolved: 'Resolved',
};

// The backend routes (approve-bug/request-bug-changes) are the actual
// enforcement — this client-side email check only controls whether the
// review controls render at all, same pattern as auth.ts's own
// super-admin-by-email bootstrap.
export function FeedbackReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const api = useApi();
  const { user } = useUser();
  const isPeter = user?.primaryEmailAddress?.emailAddress?.toLowerCase() === PETER_EMAIL;

  const [submission, setSubmission] = useState<FeedbackSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changesText, setChangesText] = useState('');
  const [showChangesInput, setShowChangesInput] = useState(false);

  async function load() {
    if (!id) return;
    try {
      const result = await api.getFeedbackSubmission(id);
      setSubmission(result);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load this submission.');
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handleApprove() {
    if (!id) return;
    setBusy(true);
    try {
      await api.approveBug(id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestChanges() {
    if (!id || !changesText.trim()) return;
    setBusy(true);
    try {
      await api.requestBugChanges(id, changesText.trim());
      setChangesText('');
      setShowChangesInput(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[13px] text-[#6a7282] mb-4">
        <ArrowLeft size={15} /> Back
      </button>
      <h1 className="text-[18px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] mb-4">Feedback submission</h1>

      {error && (
        <div className="flex items-center gap-2 text-[13px] text-[#b45309]">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {!error && !submission && (
        <div className="flex items-center gap-2 text-[13px] text-[#6a7282]">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </div>
      )}

      {submission && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f3f3f5] text-[#0a0a0a] font-['Inter:Medium',sans-serif] uppercase">{submission.type}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f3f3f5] text-[#0a0a0a]">{submission.platform}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#eef3fb] text-[#307fe2] font-['Inter:Medium',sans-serif]">{STATUS_LABEL[submission.status] ?? submission.status}</span>
          </div>

          <div>
            <h2 className="text-[15px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{submission.summary}</h2>
            <p className="text-[12px] text-[#6a7282] mt-0.5">
              Submitted by {submission.submitterName ?? 'Unknown'} ({submission.submitterEmail ?? 'unknown'}) on {new Date(submission.createdAt).toLocaleString()}
            </p>
          </div>

          <div className="bg-[#f9fafb] rounded-[10px] border border-[rgba(0,0,0,0.06)] p-3">
            <div className="text-[11px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-2">Details</div>
            <dl className="space-y-1.5">
              {Object.entries(submission.details).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] text-[#8992a0]">{k}</dt>
                  <dd className="text-[13px] text-[#0a0a0a]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {submission.bugAnalysis && (
            <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] p-3 space-y-2">
              <div className="text-[11px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide">ODIN's analysis &amp; fix recommendation</div>
              {submission.staleness.some(s => s.stale) && (
                <div className="flex items-center gap-2 text-[12px] text-[#b45309] bg-[#fff7ed] border border-[#fed7aa] rounded-[8px] p-2">
                  <AlertTriangle size={13} className="shrink-0" /> Code has changed since this analysis was written — worth re-checking before approving.
                </div>
              )}
              <p className="text-[13px] text-[#0a0a0a] whitespace-pre-wrap">{submission.bugAnalysis}</p>
              {submission.affectedFiles && submission.affectedFiles.length > 0 && (
                <div className="text-[11px] text-[#6a7282]">
                  Files referenced: {submission.affectedFiles.map(f => f.path).join(', ')}
                </div>
              )}

              {isPeter && submission.status === 'in_review' && (
                <div className="flex flex-col gap-2 pt-2 border-t border-[rgba(0,0,0,0.06)]">
                  <div className="flex gap-2">
                    <button
                      onClick={handleApprove}
                      disabled={busy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#307fe2] text-white text-[12px] font-['Inter:Medium',sans-serif] disabled:opacity-40"
                    >
                      <CheckCircle2 size={13} /> Approve
                    </button>
                    <button
                      onClick={() => setShowChangesInput(s => !s)}
                      disabled={busy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f3f3f5] text-[#0a0a0a] text-[12px] font-['Inter:Medium',sans-serif] disabled:opacity-40"
                    >
                      <RotateCcw size={13} /> Request changes
                    </button>
                  </div>
                  {showChangesInput && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={changesText}
                        onChange={e => setChangesText(e.target.value)}
                        placeholder="What should ODIN look at again?"
                        className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[12px] outline-none"
                      />
                      <button
                        onClick={handleRequestChanges}
                        disabled={busy || !changesText.trim()}
                        className="shrink-0 px-3 py-2 rounded-[8px] bg-[#1D2930] text-white text-[12px] disabled:opacity-40"
                      >
                        Send
                      </button>
                    </div>
                  )}
                  {submission.bugRevisionCount > 0 && (
                    <p className="text-[11px] text-[#8992a0]">Revised {submission.bugRevisionCount} time{submission.bugRevisionCount === 1 ? '' : 's'}.</p>
                  )}
                </div>
              )}
              {submission.status === 'approved' && (
                <p className="text-[12px] text-[#16a34a] flex items-center gap-1.5"><CheckCircle2 size={13} /> Approved{submission.approvedAt ? ` on ${new Date(submission.approvedAt).toLocaleString()}` : ''}.</p>
              )}
            </div>
          )}

          {submission.mockupHtml && (
            <div className="space-y-2">
              <div className="text-[11px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide">Mockup</div>
              <iframe srcDoc={submission.mockupHtml} className="w-full h-64 rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-white" sandbox="" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
