import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Loader2, Lock, X, Check } from 'lucide-react';
import { useApi } from '../api/client';
import type { KnowledgeGap, KnowledgeCandidate, KnowledgeBaseStats } from '../api/client';
import { useIsAdminOrAbove } from '../hooks/useRole';

type Tab = 'gaps' | 'candidates' | 'stats';

// The admin side of the ODIN knowledge-base growth loop: real gaps (things
// ODIN couldn't answer) and candidates (confident answers ODIN already gave
// but that aren't permanent knowledge yet) both promote into faq_entries via
// the same form, which both ODIN and the live FAQ tab immediately read from.
export function KnowledgeBasePage() {
  const navigate = useNavigate();
  const isAdmin = useIsAdminOrAbove();
  const api = useApi();

  const [tab, setTab] = useState<Tab>('gaps');
  const [gaps, setGaps] = useState<KnowledgeGap[] | null>(null);
  const [candidates, setCandidates] = useState<KnowledgeCandidate[] | null>(null);
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null);
  const [promoting, setPromoting] = useState<{ question: string; category: string; answer: string; gapIds?: number[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadGaps() {
    const r = await api.listKnowledgeGaps();
    setGaps(r.gaps);
  }
  async function loadCandidates() {
    const r = await api.listKnowledgeCandidates();
    setCandidates(r.candidates);
  }
  async function loadStats() {
    setStats(await api.getKnowledgeBaseStats());
  }

  useEffect(() => {
    if (!isAdmin) return;
    if (tab === 'gaps' && gaps === null) loadGaps();
    if (tab === 'candidates' && candidates === null) loadCandidates();
    if (tab === 'stats' && stats === null) loadStats();
  }, [isAdmin, tab]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-[#f3f3f5] flex items-center justify-center">
          <Lock size={24} className="text-[#6a7282]" />
        </div>
        <div>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Not available</h1>
          <p className="text-[#6a7282] text-[14px] mt-1">The knowledge base is restricted to admins.</p>
        </div>
        <button onClick={() => navigate('/')} className="bg-[#1D2930] text-white rounded-[8px] px-5 py-2.5 font-['Inter:Medium',sans-serif] font-medium text-[14px]">Back to app</button>
      </div>
    );
  }

  async function dismissGap(ids: number[]) {
    setBusy(true);
    try {
      await api.dismissKnowledgeGap(ids);
      setGaps(g => g?.filter(x => x.ids !== ids) ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function promote() {
    if (!promoting) return;
    setBusy(true);
    try {
      await api.promoteToFaq(promoting);
      setPromoting(null);
      if (promoting.gapIds) setGaps(g => g?.filter(x => x.ids !== promoting.gapIds) ?? null);
      setCandidates(c => c?.filter(x => x.question !== promoting.question) ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[13px] text-[#6a7282] mb-4">
        <ArrowLeft size={15} /> Back
      </button>
      <h1 className="text-[18px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] mb-1">Knowledge base</h1>
      <p className="text-[#6a7282] text-[13px] mb-4">Turn real ODIN questions into curated FAQ entries — both ODIN and the FAQ tab read from the same list the moment you promote one.</p>

      <div className="flex gap-2 mb-4 border-b border-[rgba(0,0,0,0.08)]">
        {(['gaps', 'candidates', 'stats'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[13px] font-['Inter:Medium',sans-serif] border-b-2 -mb-px ${tab === t ? 'border-[#307fe2] text-[#0a0a0a]' : 'border-transparent text-[#6a7282]'}`}
          >
            {t === 'gaps' ? 'Gaps' : t === 'candidates' ? 'Candidates' : 'Stats'}
          </button>
        ))}
      </div>

      {tab === 'gaps' && (
        gaps === null ? <Spinner /> : gaps.length === 0 ? (
          <EmptyState label="No open gaps — ODIN hasn't hit a genuine unknown recently." />
        ) : (
          <div className="space-y-2">
            {gaps.map(g => (
              <div key={g.ids.join(',')} className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-[#0a0a0a] font-['Inter:Medium',sans-serif]">{g.question}</p>
                    <p className="text-[12px] text-[#6a7282] mt-0.5">Asked {g.count}x · path: {g.pathTried} · last {new Date(g.latestAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setPromoting({ question: g.question, category: 'General', answer: '', gapIds: g.ids })}
                      className="bg-[#1D2930] text-white rounded-[6px] px-3 py-1.5 text-[12px] font-['Inter:Medium',sans-serif]"
                    >
                      Promote
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => dismissGap(g.ids)}
                      className="bg-[#f3f3f5] text-[#6a7282] rounded-[6px] px-3 py-1.5 text-[12px] font-['Inter:Medium',sans-serif]"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'candidates' && (
        candidates === null ? <Spinner /> : candidates.length === 0 ? (
          <EmptyState label="No candidates yet — confident answers that used live code/data search will show up here." />
        ) : (
          <div className="space-y-2">
            {candidates.map(c => (
              <div key={c.id} className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] p-4">
                <p className="text-[14px] text-[#0a0a0a] font-['Inter:Medium',sans-serif]">{c.question}</p>
                <p className="text-[13px] text-[#374151] mt-1 line-clamp-3">{c.answer}</p>
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => setPromoting({ question: c.question, category: 'General', answer: c.answer })}
                    className="bg-[#1D2930] text-white rounded-[6px] px-3 py-1.5 text-[12px] font-['Inter:Medium',sans-serif]"
                  >
                    Promote
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'stats' && (
        stats === null ? <Spinner /> : (
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total interactions" value={stats.totalInteractions} />
            <StatCard label="Confident rate" value={`${stats.confidentRatePct}%`} />
            <StatCard label="Thumbs up" value={stats.feedback.up ?? 0} />
            <StatCard label="Thumbs down" value={stats.feedback.down ?? 0} />
            <div className="col-span-2 bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] p-4">
              <p className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] mb-2">Most recent open gaps</p>
              {stats.recentGaps.length === 0 ? (
                <p className="text-[13px] text-[#6a7282]">None right now.</p>
              ) : (
                <ul className="space-y-1">
                  {stats.recentGaps.map((g, i) => (
                    <li key={i} className="text-[13px] text-[#374151]">{g.question}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      )}

      {promoting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[12px] w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[15px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">Promote to FAQ</p>
              <button onClick={() => setPromoting(null)}><X size={16} className="text-[#6a7282]" /></button>
            </div>
            <label className="block text-[12px] text-[#6a7282] mb-1">Question</label>
            <input
              value={promoting.question}
              onChange={e => setPromoting({ ...promoting, question: e.target.value })}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[14px] mb-3 outline-none"
            />
            <label className="block text-[12px] text-[#6a7282] mb-1">Category</label>
            <select
              value={promoting.category}
              onChange={e => setPromoting({ ...promoting, category: e.target.value })}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[14px] mb-3 outline-none"
            >
              {['General', 'Product & Features', 'Technical & Installation', 'Financial & Pricing'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <label className="block text-[12px] text-[#6a7282] mb-1">Answer</label>
            <textarea
              value={promoting.answer}
              onChange={e => setPromoting({ ...promoting, answer: e.target.value })}
              rows={5}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[14px] mb-4 outline-none resize-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setPromoting(null)} className="px-3 py-2 text-[13px] text-[#6a7282] font-['Inter:Medium',sans-serif]">Cancel</button>
              <button
                disabled={busy || !promoting.question.trim() || !promoting.answer.trim()}
                onClick={promote}
                className="bg-[#1D2930] text-white rounded-[8px] px-4 py-2 text-[13px] font-['Inter:Medium',sans-serif] flex items-center gap-1.5 disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Add to FAQ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-[#6a7282]" /></div>;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-12 px-4">
      <p className="text-[#6a7282] text-[13px]">{label}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] p-4">
      <p className="text-[12px] text-[#6a7282]">{label}</p>
      <p className="text-[22px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] mt-1">{value}</p>
    </div>
  );
}
