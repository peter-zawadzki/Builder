import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, Send, CheckCircle2, Sparkles } from 'lucide-react';
import { useApi } from '../api/client';
import type { CollectedSummary, FaqHistoryTurn } from '../api/client';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  quickReplies?: string[];
}

type Phase = 'chatting' | 'submitting' | 'duplicate-warning' | 'mockup-review' | 'done' | 'error';

// The guided intake flow for the FEEDBACK section — same shell pattern as
// FaqAssistant (message list, scroll-to-bottom, input+send), but assistant
// turns can offer quick-reply buttons instead of always expecting free text,
// and finishing the conversation moves into a finalize/mockup-review phase
// rather than just showing another answer.
export function FeedbackAssistant() {
  const api = useApi();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [collectedSummary, setCollectedSummary] = useState<CollectedSummary | undefined>();
  const [readyToFinalize, setReadyToFinalize] = useState(false);
  const [phase, setPhase] = useState<Phase>('chatting');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [mockupHtml, setMockupHtml] = useState<string | null>(null);
  const [mockupRevisionCount, setMockupRevisionCount] = useState(0);
  const [duplicateWarning, setDuplicateWarning] = useState<{ id: string; summary: string; createdAt: string } | null>(null);
  const [errorText, setErrorText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, phase]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    sendTurn('');
  }, []);

  function historyOf(msgs: ChatMessage[]): FaqHistoryTurn[] {
    return msgs.map(m => ({ role: m.role, text: m.text }));
  }

  async function sendTurn(question: string) {
    setLoading(true);
    try {
      const history = historyOf(messages);
      if (question.trim()) setMessages(m => [...m, { role: 'user', text: question }]);
      const result = await api.feedbackTurn(question, history);
      setMessages(m => [...m, { role: 'assistant', text: result.message, quickReplies: result.quickReplies }]);
      setCollectedSummary(result.collectedSummary);
      setReadyToFinalize(result.readyToFinalize);
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: "Sorry, I couldn't reach ODIN just now. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    sendTurn(text);
  }

  async function handleFinalize(force = false) {
    if (!collectedSummary) return;
    setPhase('submitting');
    try {
      const result = await api.finalizeFeedback(collectedSummary, historyOf(messages), force);
      if (result.duplicateWarning) {
        setDuplicateWarning(result.duplicateWarning);
        setPhase('duplicate-warning');
        return;
      }
      if (result.mockupHtml && result.id) {
        setSubmissionId(result.id);
        setMockupHtml(result.mockupHtml);
        setPhase('mockup-review');
        return;
      }
      setSubmissionId(result.id ?? null);
      setPhase('done');
    } catch (err) {
      // Surface the server's actual reason (e.g. a specific missing field)
      // instead of a generic message — that detail is what makes the error
      // actionable instead of a dead end requiring a support ticket.
      setErrorText(err instanceof Error && err.message ? err.message : "Something went wrong submitting this — please try again.");
      setPhase('error');
    }
  }

  async function handleReviseMockup(feedbackText: string) {
    if (!submissionId) return;
    setLoading(true);
    try {
      const result = await api.reviseMockup(submissionId, feedbackText);
      setMockupHtml(result.mockupHtml);
      setMockupRevisionCount(result.revisionCount);
    } finally {
      setLoading(false);
    }
  }

  async function handleApproveMockup() {
    if (!submissionId) return;
    setLoading(true);
    try {
      await api.approveMockup(submissionId);
      setPhase('done');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(0,0,0,0.06)]">
        <Sparkles size={15} className="text-[#307fe2]" />
        <span className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
          Feedback with <span className="font-bold text-[#ff5c39]">ODIN</span>
        </span>
      </div>

      <div ref={scrollRef} className="max-h-96 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] rounded-[10px] px-3 py-2 text-[13px] leading-relaxed ${
                m.role === 'user' ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#0a0a0a]'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.role === 'assistant' && i === messages.length - 1 && phase === 'chatting' && m.quickReplies && m.quickReplies.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.quickReplies.map(qr => (
                    <button
                      key={qr}
                      onClick={() => sendTurn(qr)}
                      disabled={loading}
                      className="px-2.5 py-1 rounded-full bg-white border border-[rgba(0,0,0,0.1)] text-[12px] text-[#0a0a0a] hover:border-[#307fe2] disabled:opacity-40"
                    >
                      {qr}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#f3f3f5] rounded-[10px] px-3 py-2 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-[#6a7282]" />
              <span className="text-[13px] text-[#6a7282]">Thinking…</span>
            </div>
          </div>
        )}

        {phase === 'chatting' && readyToFinalize && !loading && (
          <div className="flex justify-start">
            <button
              onClick={() => handleFinalize(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#307fe2] text-white text-[12px] font-['Inter:Medium',sans-serif]"
            >
              <CheckCircle2 size={13} /> Submit
            </button>
          </div>
        )}

        {phase === 'submitting' && (
          <div className="flex items-center gap-2 text-[13px] text-[#6a7282] py-2">
            <Loader2 size={14} className="animate-spin" /> Processing your submission…
          </div>
        )}

        {phase === 'duplicate-warning' && duplicateWarning && (
          <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-[10px] p-3 space-y-2">
            <p className="text-[13px] text-[#0a0a0a]">
              This looks similar to an existing report: <strong>{duplicateWarning.summary}</strong> (submitted {new Date(duplicateWarning.createdAt).toLocaleDateString()}).
            </p>
            <div className="flex gap-2">
              <button onClick={() => navigate(`/feedback/${duplicateWarning.id}`)} className="text-[12px] text-[#307fe2] font-['Inter:Medium',sans-serif]">
                View that report
              </button>
              <button onClick={() => handleFinalize(true)} className="text-[12px] text-[#6a7282] font-['Inter:Medium',sans-serif]">
                Submit anyway
              </button>
            </div>
          </div>
        )}

        {phase === 'mockup-review' && mockupHtml && (
          <MockupReview
            html={mockupHtml}
            revisionCount={mockupRevisionCount}
            loading={loading}
            onRevise={handleReviseMockup}
            onApprove={handleApproveMockup}
          />
        )}

        {phase === 'done' && (
          <div className="flex items-center gap-2 text-[13px] text-[#0a0a0a] bg-[#f0fdf4] border border-[#bbf7d0] rounded-[10px] p-3">
            <CheckCircle2 size={16} className="text-[#16a34a] shrink-0" />
            <span>
              Thanks — this has been submitted.
              {submissionId && (
                <>
                  {' '}
                  <button onClick={() => navigate(`/feedback/${submissionId}`)} className="text-[#307fe2] underline">
                    View it here.
                  </button>
                </>
              )}
            </span>
          </div>
        )}

        {phase === 'error' && <p className="text-[13px] text-[#b45309]">{errorText}</p>}
      </div>

      {(phase === 'chatting' || phase === 'error') && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-[rgba(0,0,0,0.06)]">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type your answer…"
            className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[#0a0a0a] text-[13px] outline-none"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="shrink-0 w-8 h-8 rounded-[8px] bg-[#1D2930] text-white flex items-center justify-center disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function MockupReview({
  html,
  revisionCount,
  loading,
  onRevise,
  onApprove,
}: {
  html: string;
  revisionCount: number;
  loading: boolean;
  onRevise: (feedback: string) => void;
  onApprove: () => void;
}) {
  const [feedback, setFeedback] = useState('');
  const capped = revisionCount >= 5;

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-[#6a7282]">Here's a mockup of what this could look like:</p>
      <iframe srcDoc={html} className="w-full h-64 rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-white" sandbox="" />
      {capped && <p className="text-[11px] text-[#b45309]">Reached the revision limit — approve this version to send it, or start a new request for further changes.</p>}
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#307fe2] text-white text-[12px] font-['Inter:Medium',sans-serif] disabled:opacity-40"
        >
          <CheckCircle2 size={13} /> Approve &amp; send
        </button>
      </div>
      {!capped && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Request a change…"
            className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[#0a0a0a] text-[12px] outline-none"
          />
          <button
            onClick={() => { if (feedback.trim()) { onRevise(feedback.trim()); setFeedback(''); } }}
            disabled={loading || !feedback.trim()}
            className="shrink-0 px-3 py-2 rounded-[8px] bg-[#f3f3f5] text-[#0a0a0a] text-[12px] disabled:opacity-40"
          >
            Revise
          </button>
        </div>
      )}
    </div>
  );
}
