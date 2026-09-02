import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ArrowLeft, Search, ChevronDown, HelpCircle, GraduationCap,
  Briefcase, Image as ImageIcon, Palette, FolderOpen, Download, Copy, Check,
  PlayCircle, ExternalLink, ChevronLeft, ChevronRight, Trash2, Upload, FileText,
  Sparkles, Send, ThumbsUp, ThumbsDown, Loader2, X, QrCode, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { useApi, type FaqSource, type FaqVisual, type FaqVisualHighlight, type OdinVideoListItem, type FaqEntry } from '../api/client';
import { OdinVideoOffer } from './OdinVideoOffer';
import { DocumentUploadForm } from './DocumentUploadForm';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { PdfThumbnail, renderPdfFirstPageThumbnail } from './PdfThumbnail';
import { useIsSuperAdmin, useIsAdminOrAbove } from '../hooks/useRole';
import { fileToBase64 } from '../utils/mountainDocumentsDB';
import {
  listResourceFiles, uploadResourceFile, renameResourceFile, deleteResourceFile,
  type ResourceFile, type ResourceFileCategory,
} from '../utils/resourceFilesApi';
import { type FAQCategory } from '../data/faqData';
import { LOGO_GROUPS } from '../data/logoAssets';
import { BRAND_COLORS, LOGO_FONT, BRAND_FONT } from '../data/brandStyle';
import { DEMO_LINKS, PIPELINE_STEPS, DEMO_SLIDES, type DemoSlide } from '../data/demoHubData';
import { QrStudioSection } from './QrStudio';

type ResourceTab = 'faq' | 'training' | 'sales' | 'marketing' | 'logos' | 'demo' | 'qr' | 'upload';

const TABS: { id: ResourceTab; label: string; icon: React.ReactNode }[] = [
  { id: 'faq',       label: 'FAQ',               icon: <HelpCircle size={14} /> },
  { id: 'training',  label: 'Training Materials', icon: <GraduationCap size={14} /> },
  { id: 'sales',     label: 'Sales Tools',        icon: <Briefcase size={14} /> },
  { id: 'marketing', label: 'Marketing Assets',   icon: <ImageIcon size={14} /> },
  { id: 'logos',     label: 'Brand Assets',       icon: <Palette size={14} /> },
  { id: 'demo',      label: 'Demo Hub',           icon: <PlayCircle size={14} /> },
  { id: 'qr',        label: 'QR Studio',          icon: <QrCode size={14} /> },
  { id: 'upload',    label: 'Upload',             icon: <Upload size={14} /> },
];

const FAQ_CATEGORIES: FAQCategory[] = ['General', 'Product & Features', 'Technical & Installation', 'Financial & Pricing'];

// Domain jargon/abbreviations used inconsistently across the FAQ answers
// (some spell it out, some don't) — expanding each query token against its
// synonyms means searching "power over ethernet" finds the PoE entries and
// vice versa, without every answer needing to repeat both forms.
const SYNONYMS: Record<string, string[]> = {
  poe: ['power over ethernet'],
  'power over ethernet': ['poe'],
  nfc: ['near field communication'],
  'near field communication': ['nfc'],
  gs: ['giant slalom'],
  'giant slalom': ['gs'],
  gps: ['global positioning system'],
  'global positioning system': ['gps'],
  fis: ['international ski federation', 'fédération internationale de ski'],
  price: ['cost', 'pricing', 'fee', 'subscription'],
  pricing: ['cost', 'price', 'fee'],
  cost: ['price', 'pricing', 'fee'],
  install: ['installation', 'setup'],
  installation: ['install', 'setup'],
  wifi: ['wireless'],
  cold: ['temperature', 'winter', 'weather'],
  night: ['dark', 'lighting'],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenMatches(token: string, haystack: string): boolean {
  // Loose substring match for the raw query term — deliberately permissive,
  // so e.g. "camera" still finds "cameras" (simple plural stemming).
  if (haystack.includes(token)) return true;
  // Synonym expansions are checked at word boundaries instead: a loose
  // .includes() here let short synonyms like "fee" match *inside* unrelated
  // words (e.g. "cost" → "fee" was matching "500 feet of vertical").
  return (SYNONYMS[token] || []).some(syn => new RegExp(`\\b${escapeRegExp(syn)}\\b`, 'i').test(haystack));
}

interface FaqChatMessage {
  role: 'user' | 'assistant';
  text: string;
  sources?: FaqSource[];
  visuals?: FaqVisual[];
  confident?: boolean;
  needsUserInput?: boolean;
  lowConfidenceNote?: string;
  videoOffer?: { flowKey: string; label: string } | null;
  feedback?: 'up' | 'down';
}

// Rotated (one picked per message, not re-randomized on re-render) instead of
// always showing the identical line for a genuine "don't know" answer.
const LOW_CONFIDENCE_VARIANTS = [
  "Skied a bit off-piste on this one — might be worth flagging down patrol for backup.",
  "Hit some low visibility on this run — worth double-checking with a human.",
  "This one might be above my pay grade on the lift — flag it for a second look.",
  "Caught an edge on this answer — might want ski patrol to check the trail map.",
  "Not fully groomed terrain here — worth confirming with someone on the mountain.",
  "This run's got a few moguls I couldn't clear — a human might smooth it out.",
];

// Percentage-based (not pixel) so the same highlight data lines up whether
// the image is rendered at chat-bubble width or full-screen in the lightbox.
function HighlightOverlay({ highlights }: { highlights?: FaqVisualHighlight[] }) {
  if (!highlights || highlights.length === 0) return null;
  return (
    <>
      {highlights.map((h, i) => (
        <div
          key={i}
          className="absolute border-2 border-[#ff5c39] rounded-[4px] pointer-events-none"
          style={{ left: `${h.xPct}%`, top: `${h.yPct}%`, width: `${h.wPct}%`, height: `${h.hPct}%` }}
        >
          {h.label && (
            <span className="absolute -top-6 left-0 bg-[#ff5c39] text-white text-[10px] px-1.5 py-0.5 rounded-[4px] whitespace-nowrap">
              {h.label}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

function HelpVisualLightbox({ visual, initialStep, onClose }: { visual: FaqVisual; initialStep: number; onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(initialStep);
  const step = visual.steps[stepIndex];
  const multi = visual.steps.length > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setStepIndex(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setStepIndex(i => Math.min(visual.steps.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visual.steps.length, onClose]);

  return (
    <div className="fixed inset-0 bg-black/90 z-[70] flex flex-col items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 active:bg-white/20" aria-label="Close">
        <X size={20} className="text-white" />
      </button>
      <div className="relative max-w-5xl max-h-[75vh] w-full" onClick={e => e.stopPropagation()}>
        <img src={step.imageUrl} alt={visual.label} className="w-full h-auto max-h-[75vh] object-contain rounded-[8px]" />
        <HighlightOverlay highlights={step.highlights} />
      </div>
      <p className="text-white text-[13px] mt-3 max-w-2xl text-center">{step.caption}</p>
      {multi && (
        <div className="flex items-center gap-4 mt-3">
          <button
            onClick={() => setStepIndex(i => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className="p-2 rounded-full bg-white/10 disabled:opacity-30 active:bg-white/20"
            aria-label="Previous step"
          >
            <ChevronLeft size={18} className="text-white" />
          </button>
          <span className="text-white text-[12px]">Step {stepIndex + 1} of {visual.steps.length}</span>
          <button
            onClick={() => setStepIndex(i => Math.min(visual.steps.length - 1, i + 1))}
            disabled={stepIndex === visual.steps.length - 1}
            className="p-2 rounded-full bg-white/10 disabled:opacity-30 active:bg-white/20"
            aria-label="Next step"
          >
            <ChevronRight size={18} className="text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

function HelpVisualCard({ visual }: { visual: FaqVisual }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const step = visual.steps[stepIndex];
  const multi = visual.steps.length > 1;

  return (
    <div className="rounded-[8px] overflow-hidden border border-[rgba(0,0,0,0.08)]">
      <button type="button" onClick={() => setLightboxOpen(true)} className="relative w-full block" aria-label={`View ${visual.label} full screen`}>
        <img src={step.imageUrl} alt={visual.label} className="w-full block" loading="lazy" />
        <HighlightOverlay highlights={step.highlights} />
      </button>
      <div className="px-2 py-1.5 bg-white space-y-1">
        <p className="text-[11px] text-[#6a7282]">{step.caption}</p>
        {multi && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStepIndex(i => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
              className="p-1 rounded disabled:opacity-30 text-[#6a7282]"
              aria-label="Previous step"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[10px] text-[#8992a0]">Step {stepIndex + 1} of {visual.steps.length}</span>
            <button
              type="button"
              onClick={() => setStepIndex(i => Math.min(visual.steps.length - 1, i + 1))}
              disabled={stepIndex === visual.steps.length - 1}
              className="p-1 rounded disabled:opacity-30 text-[#6a7282]"
              aria-label="Next step"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>
      {lightboxOpen && <HelpVisualLightbox visual={visual} initialStep={stepIndex} onClose={() => setLightboxOpen(false)} />}
    </div>
  );
}

// Answers can take a few seconds (cold questions run a real Claude + code
// search loop) — a static spinner reads as stuck, so this cycles through
// on-brand ski chatter instead. Purely cosmetic, no bearing on actual state.
const LOADING_MESSAGES = [
  'Setting up the course…',
  'Riding the lift…',
  'Waxing the skis…',
  'Scouting the trail map…',
  'Checking the snow report…',
  'Tuning the bindings…',
  'Carving through the code…',
  'Warming up at the lodge…',
  'Dialing in the edge angle…',
  'Sending it…',
];

// Renders the assistant's markdown (see faqAgent.ts system prompt — it's
// asked to answer in clean, minimal markdown) using the app's own type scale
// and colors rather than react-markdown's defaults, so it reads like part of
// the product instead of a generic chat widget. #307fe2 is Mountain Blue
// (brandStyle.ts) — the same accent already used for the FAQ list's category
// labels, reused here for links.
function AssistantMarkdown({ text }: { text: string }) {
  const navigate = useNavigate();
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="text-[13px] leading-relaxed text-[#0a0a0a] mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a]">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc pl-4 my-1.5 space-y-1 marker:text-[#ff5c39]">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 my-1.5 space-y-1 marker:text-[#ff5c39] marker:font-medium">{children}</ol>,
        li: ({ children }) => <li className="text-[13px] leading-relaxed text-[#0a0a0a]">{children}</li>,
        a: ({ href, children }) => {
          const linkCls = "text-[#307fe2] underline decoration-[#307fe2]/40 hover:opacity-80";
          // Internal routes (e.g. /resources?tab=logos) navigate within the
          // app instead of popping a whole new browser tab — only links
          // leaving the app get target="_blank".
          if (href && href.startsWith('/')) {
            return (
              <a href={href} className={linkCls} onClick={e => { e.preventDefault(); navigate(href); }}>
                {children}
              </a>
            );
          }
          return (
            <a href={href} target="_blank" rel="noreferrer" className={linkCls}>
              {children}
            </a>
          );
        },
        code: ({ children }) => (
          <code className="bg-white/70 text-[#0a0a0a] px-1 py-0.5 rounded-[4px] text-[12px] font-mono">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="bg-white/70 rounded-[8px] p-2 my-1.5 text-[12px] font-mono overflow-x-auto">{children}</pre>
        ),
        h1: ({ children }) => <p className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a] mt-2 mb-1">{children}</p>,
        h2: ({ children }) => <p className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a] mt-2 mb-1">{children}</p>,
        h3: ({ children }) => <p className="text-[13px] font-['Inter:Medium',sans-serif] font-medium text-[#0a0a0a] mt-2 mb-1">{children}</p>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// Picks a random message, different from whichever one is currently showing,
// so back-to-back questions don't always open on "Setting up the course…"
// and repeats within one loading spinner don't happen either.
function randomMessageIndex(excluding: number): number {
  if (LOADING_MESSAGES.length <= 1) return 0;
  let next = Math.floor(Math.random() * LOADING_MESSAGES.length);
  while (next === excluding) next = Math.floor(Math.random() * LOADING_MESSAGES.length);
  return next;
}

function useLoadingMessage(active: boolean): string {
  const [index, setIndex] = useState(() => randomMessageIndex(-1));
  useEffect(() => {
    if (!active) return;
    setIndex(i => randomMessageIndex(i));
    const id = setInterval(() => setIndex(i => randomMessageIndex(i)), 3400);
    return () => clearInterval(id);
  }, [active]);
  return LOADING_MESSAGES[index];
}

// Ad-hoc chat for questions that don't map cleanly onto a single curated FAQ
// row (paraphrased, multi-part, or "how does this app feature work") — the
// curated list below stays the fast path for canonical questions, this is the
// fallback for everything else. One assistant, two knowledge sources.
export function FaqAssistant() {
  const api = useApi();
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const [messages, setMessages] = useState<FaqChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const loadingMessage = useLoadingMessage(loading);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function handleAsk() {
    const question = input.trim();
    if (!question || loading) return;
    // Prior turns only — the model resolves follow-ups ("what about...")
    // against this, and it's why a repeat of the exact same first question
    // still gets a fresh (uncached) answer once a conversation is underway.
    const history = messages.map(m => ({ role: m.role, text: m.text }));
    setInput('');
    setMessages(m => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const result = await api.askFaq(question, sessionId, history);
      const lowConfidenceNote = (!result.confident && !result.needsUserInput)
        ? LOW_CONFIDENCE_VARIANTS[Math.floor(Math.random() * LOW_CONFIDENCE_VARIANTS.length)]
        : undefined;
      setMessages(m => [...m, {
        role: 'assistant',
        text: result.answer,
        sources: result.sources,
        visuals: result.visuals,
        confident: result.confident,
        needsUserInput: result.needsUserInput,
        lowConfidenceNote,
        videoOffer: result.videoOffer,
      }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', text: "Sorry, I couldn't reach the assistant just now. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleFeedback(index: number, rating: 'up' | 'down') {
    const msg = messages[index];
    const question = messages[index - 1]?.text ?? '';
    setMessages(m => m.map((mm, i) => (i === index ? { ...mm, feedback: rating } : mm)));
    try {
      await api.sendFaqFeedback({ question, answer: msg.text, rating, sources: msg.sources ?? [], sessionId });
    } catch {
      // Best-effort — feedback isn't critical to the chat working.
    }
  }

  return (
    <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(0,0,0,0.06)]">
        <Sparkles size={15} className="text-[#307fe2]" />
        <span className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
          Ask <span className="font-bold text-[#ff5c39]">ODIN</span>
        </span>
        <span className="text-[11px] text-[#6a7282]">how things work or what you need</span>
      </div>

      {messages.length > 0 && (
        <div ref={scrollRef} className="max-h-80 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[85%] rounded-[10px] px-3 py-2 text-[13px] leading-relaxed ${
                  m.role === 'user' ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#0a0a0a]'
                }`}
              >
                {m.role === 'assistant' ? <AssistantMarkdown text={m.text} /> : <p className="whitespace-pre-wrap">{m.text}</p>}
                {/* Sources aren't shown in the chat itself — still captured in
                    m.sources and sent along with feedback for the review loop. */}
                {m.role === 'assistant' && m.visuals && m.visuals.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {m.visuals.map(v => <HelpVisualCard key={v.key} visual={v} />)}
                  </div>
                )}
                {m.role === 'assistant' && m.lowConfidenceNote && (
                  <p className="mt-1.5 text-[11px] text-[#b45309]">{m.lowConfidenceNote}</p>
                )}
                {m.role === 'assistant' && m.videoOffer && (
                  <OdinVideoOffer flowKey={m.videoOffer.flowKey} label={m.videoOffer.label} />
                )}
                {m.role === 'assistant' && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => handleFeedback(i, 'up')}
                      className={`p-1 rounded ${m.feedback === 'up' ? 'text-[#307fe2]' : 'text-[#6a7282] hover:text-[#0a0a0a]'}`}
                      aria-label="Helpful"
                    >
                      <ThumbsUp size={13} />
                    </button>
                    <button
                      onClick={() => handleFeedback(i, 'down')}
                      className={`p-1 rounded ${m.feedback === 'down' ? 'text-[#307fe2]' : 'text-[#6a7282] hover:text-[#0a0a0a]'}`}
                      aria-label="Not helpful"
                    >
                      <ThumbsDown size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#f3f3f5] rounded-[10px] px-3 py-2 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-[#6a7282] shrink-0" />
                <span className="text-[13px] text-[#6a7282]">{loadingMessage}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-3 border-t border-[rgba(0,0,0,0.06)]">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAsk()}
          placeholder="e.g. how much for a 120-person team including cameras?"
          className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[#0a0a0a] text-[13px] outline-none"
        />
        <button
          onClick={handleAsk}
          disabled={loading || !input.trim()}
          className="shrink-0 w-8 h-8 rounded-[8px] bg-[#1D2930] text-white flex items-center justify-center disabled:opacity-40"
          aria-label="Ask"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

export function FAQSection({ showAssistant = true }: { showAssistant?: boolean } = {}) {
  const api = useApi();
  const [entries, setEntries] = useState<FaqEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FAQCategory | 'All'>('All');
  const [openId, setOpenId] = useState<string | null>(null);

  // faq_entries (DB) is ODIN's own grounding source and, since the
  // knowledge-base promote workflow, the only place new FAQ content is
  // added — fetching it live here means a promoted question shows up in
  // this tab immediately, with no redeploy.
  useEffect(() => {
    api.listFaqEntries().then(r => setEntries(r.entries)).catch(() => setEntries([]));
  }, [api]);

  // "Deep search" — matches against both the question AND the answer body,
  // not just the question title, so e.g. searching "PoE" or "NVIDIA" finds
  // entries where that term only appears in the answer. Smarter than a
  // single raw substring match in two ways:
  //  1. Tokenized AND matching — "camera cost" finds entries containing both
  //     words anywhere (question or answer), in any order, rather than only
  //     entries containing that exact three-word phrase.
  //  2. Synonym expansion (SYNONYMS above) — jargon/abbreviations resolve to
  //     their expansions and back, so "power over ethernet" surfaces the PoE
  //     entries even though most answers just say "PoE".
  // Results are ranked: question-text matches outrank answer-only matches,
  // and entries matching more of the query's tokens rank above ones matching
  // fewer, so the best-fitting FAQ shows up first instead of in doc order.
  const results = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const scored = (entries ?? [])
      .filter(f => category === 'All' || f.category === category)
      .map(f => {
        if (tokens.length === 0) return { entry: f, score: 0 };
        const q = f.question.toLowerCase();
        const a = f.answer.toLowerCase();
        let score = 0;
        for (const token of tokens) {
          const inQuestion = tokenMatches(token, q);
          const inAnswer = tokenMatches(token, a);
          if (!inQuestion && !inAnswer) return { entry: f, score: -1 }; // missing token — excluded below
          score += inQuestion ? 2 : 1;
        }
        return { entry: f, score };
      })
      .filter(r => r.score >= 0)
      .sort((a, b) => b.score - a.score);
    return scored.map(r => r.entry);
  }, [query, category, entries]);

  return (
    <div className="space-y-3">
      {showAssistant && <FaqAssistant />}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search FAQs..."
          className="w-full bg-[#f3f3f5] rounded-[8px] pl-9 pr-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setCategory('All')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${category === 'All' ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
        >
          All
        </button>
        {FAQ_CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${category === c ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {entries === null ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin text-[#6a7282]" />
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[14px] mb-1">No matching FAQ</p>
            <p className="text-[#6a7282] text-[13px]">
              {query.trim() ? `Nothing found for "${query.trim()}". Try different words, or clear the search to browse everything.` : 'No FAQs in this category yet.'}
            </p>
          </div>
        ) : (
          results.map(f => {
            const open = openId === f.id;
            return (
              <div key={f.id} className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] overflow-hidden">
                <button
                  onClick={() => setOpenId(open ? null : f.id)}
                  className="w-full flex items-start justify-between gap-3 text-left px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] text-[#307fe2] font-['Inter:Medium',sans-serif] uppercase tracking-wide">{f.category}</span>
                    <p className="text-[14px] text-[#0a0a0a] font-['Inter:Medium',sans-serif] mt-0.5">{f.question}</p>
                  </div>
                  <ChevronDown size={16} className={`text-[#6a7282] shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <div className="px-4 pb-3 text-[13px] text-[#374151] leading-relaxed">{f.answer}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function EmptyPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-[#f3f3f5] flex items-center justify-center mb-3">
        <FolderOpen size={24} className="text-[#6a7282]" />
      </div>
      <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[14px] mb-1">Nothing here yet</p>
      <p className="text-[#6a7282] text-[13px] max-w-xs">{label} will show up here once they're added.</p>
    </div>
  );
}

function formatFileSize(sizeKB: number): string {
  return sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
}

// Small YouTube-style preview: a real muted <video> seeked a few seconds in
// (rather than a static play-icon tile) so the grid shows an actual frame
// from each clip. Landing on frame 0 would show the same title-card/black
// frame for nearly every video — 6s in is far more likely to be distinct,
// representative footage; for anything shorter than that, halfway in.
const PREVIEW_SEEK_SECONDS = 6;

function VideoPreviewThumb({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      preload="metadata"
      onLoadedMetadata={() => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = v.duration && v.duration < PREVIEW_SEEK_SECONDS ? v.duration / 2 : PREVIEW_SEEK_SECONDS;
      }}
      className="w-full h-full object-cover pointer-events-none"
    />
  );
}

// Every video ODIN has generated (server/odin/video/pipeline.ts), browsable
// in one place instead of only being reachable via a chat offer or a
// notification click. Cache-hit videos regenerate rarely, so this list is
// short and stable — a plain fetch-on-mount is enough, no polling.
function TrainingMaterialsSection() {
  const api = useApi();
  const navigate = useNavigate();
  const isSuperAdmin = useIsSuperAdmin();
  const [videos, setVideos] = useState<OdinVideoListItem[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OdinVideoListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.listOdinVideos().then(r => setVideos(r.videos)).catch(() => setVideos([]));
  }, [api]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteOdinVideo(deleteTarget.id);
      setVideos(vs => (vs ?? []).filter(v => v.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(`Deleted "${deleteTarget.label}"`);
    } catch {
      toast.error("Couldn't delete this video — please try again.");
    } finally {
      setDeleting(false);
    }
  }

  if (videos === null) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-[#6a7282] py-10 justify-center">
        <Loader2 size={14} className="animate-spin" /> Loading…
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <>
        <EmptyPlaceholder label="Training videos" />
        <div className="mt-4">
          <ResourceFileManager category="training" emptyLabel="Training materials" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {videos.map(v => (
          <div
            key={v.id}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/odin-videos/${v.id}`)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(`/odin-videos/${v.id}`); }}
            className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] overflow-hidden flex flex-col text-left cursor-pointer active:opacity-80"
          >
            <div className="h-28 bg-[#f9fafb] relative overflow-hidden">
              {v.videoUrl ? (
                <>
                  <VideoPreviewThumb src={v.videoUrl} />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                    <PlayCircle size={30} className="text-white drop-shadow" fill="rgba(0,0,0,0.35)" />
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <PlayCircle size={32} className="text-[#307fe2]" />
                </div>
              )}
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setDeleteTarget(v); }}
                  className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 active:opacity-70"
                  aria-label={`Delete ${v.label}`}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <div className="p-3">
              <p className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{v.label}</p>
              <p className="text-[11px] text-[#8992a0]">
                Level {v.detailLevel}{v.durationMs ? ` · ${Math.round(v.durationMs / 1000)}s` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
      {deleteTarget && (
        <DeleteConfirmModal
          title={`Delete "${deleteTarget.label}"?`}
          description="This permanently removes the video file and its listing here. Staff can ask ODIN to regenerate it later if needed."
          isDeleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <div className="mt-4">
        <ResourceFileManager category="training" emptyLabel="Training materials" />
      </div>
    </>
  );
}

// Admin-uploaded files for Training Materials / Sales Tools / Marketing
// Assets (server/routes/resourceFiles.ts) — any user can preview/download,
// only admin/super_admin see the upload form and delete button. Shared
// across all three tabs, parametrized by category.
// Strips the extension and swaps separators for spaces so a dropped file
// like "coaches_one-pager.pdf" pre-fills a readable default name instead of
// making the admin retype what's already in the filename.
function defaultNameFromFilename(fileName: string): string {
  return fileName.replace(/\.[^./]+$/, '').replace(/[_-]+/g, ' ').trim();
}

function ResourceFileManager({ category, emptyLabel }: { category: ResourceFileCategory; emptyLabel: string }) {
  const isAdmin = useIsAdminOrAbove();
  const [files, setFiles] = useState<ResourceFile[] | null>(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ResourceFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => listResourceFiles(category).then(setFiles).catch(() => setFiles([]));
  useEffect(() => { load(); }, [category]);

  function selectFile(f: File) {
    setFile(f);
    setName(prev => prev.trim() ? prev : defaultNameFromFilename(f.name));
  }

  async function handleUpload() {
    if (!file || !name.trim() || uploading) return;
    setUploading(true);
    try {
      const dataUrl = await fileToBase64(file);
      const thumbnailDataUrl = file.type === 'application/pdf'
        ? await renderPdfFirstPageThumbnail(file) ?? undefined
        : undefined;
      await uploadResourceFile({ category, name: name.trim(), dataUrl, fileName: file.name, mimeType: file.type, thumbnailDataUrl });
      setName('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed — please try again.');
    } finally {
      setUploading(false);
    }
  }

  function startRename(f: ResourceFile) {
    setRenamingId(f.id);
    setRenameValue(f.name);
  }

  async function commitRename() {
    const id = renamingId;
    if (!id) return;
    const trimmed = renameValue.trim();
    const current = (files ?? []).find(f => f.id === id);
    if (!trimmed || trimmed === current?.name) {
      setRenamingId(null);
      return;
    }
    setIsRenaming(true);
    try {
      await renameResourceFile(id, trimmed);
      setFiles(prev => (prev ?? []).map(f => (f.id === id ? { ...f, name: trimmed } : f)));
      setRenamingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rename failed — please try again.');
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteResourceFile(deleteTarget.id);
      setFiles(prev => (prev ?? []).filter(f => f.id !== deleteTarget.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed — please try again.');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-3">
      {files === null ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-[#6a7282]" /></div>
      ) : files.length === 0 ? (
        <EmptyPlaceholder label={emptyLabel} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {files.map(f => (
            <div key={f.id} className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] overflow-hidden flex flex-col">
              <div className="aspect-[3/4] bg-[#f3f4f6] flex items-center justify-center overflow-hidden relative">
                {f.mimeType.startsWith('image/') ? (
                  <img src={f.url} alt={f.name} className="max-h-full max-w-full object-contain" />
                ) : f.thumbnailUrl ? (
                  <img src={f.thumbnailUrl} alt={f.name} className="max-h-full max-w-full object-contain shadow-sm" />
                ) : f.mimeType === 'application/pdf' ? (
                  <PdfThumbnail url={f.url} alt={f.name} />
                ) : (
                  <FileText size={28} className="text-[#307fe2]" />
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(f)}
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 active:opacity-70"
                    aria-label={`Delete ${f.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                <div className="min-w-0">
                  {renamingId === f.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      disabled={isRenaming}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                        if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); }
                      }}
                      className="w-full bg-[#f3f3f5] rounded-[6px] px-1.5 py-1 text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] outline-none"
                    />
                  ) : (
                    <div className="flex items-center gap-1 group">
                      <p className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{f.name}</p>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => startRename(f)}
                          className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 active:opacity-60"
                          aria-label={`Rename ${f.name}`}
                        >
                          <Pencil size={11} className="text-[#8992a0]" />
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-[11px] text-[#8992a0]">{f.fileSize ? formatFileSize(Math.round(f.fileSize / 1024)) : '—'}</p>
                </div>
                <div className="flex gap-1.5 mt-auto">
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] font-['Inter:Medium',sans-serif] bg-[#f3f3f5] text-[#0a0a0a] px-2 py-1.5 rounded-full hover:bg-[#eaeaec] active:opacity-70"
                  >
                    <ExternalLink size={10} /> Preview
                  </a>
                  <a
                    href={f.url}
                    download={f.originalFilename}
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] font-['Inter:Medium',sans-serif] bg-[#f3f3f5] text-[#307fe2] px-2 py-1.5 rounded-full hover:bg-[#eef3fb] active:opacity-70"
                  >
                    <Download size={10} /> Download
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] p-4 space-y-3">
          <p className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">Upload a file</p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name, e.g. 'Coaches One Pager'"
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[13px] outline-none"
          />
          <input
            ref={fileInputRef}
            type="file"
            onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f); }}
            className="hidden"
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={e => {
              e.preventDefault();
              setDragActive(false);
              const f = e.dataTransfer.files?.[0];
              if (f) selectFile(f);
            }}
            className={`flex flex-col items-center justify-center gap-1.5 text-center rounded-[8px] border-2 border-dashed px-4 py-6 cursor-pointer transition-colors ${
              dragActive ? 'border-[#307fe2] bg-[#eef3fb]' : 'border-[rgba(0,0,0,0.15)] bg-[#f9fafb] hover:bg-[#f3f3f5]'
            }`}
          >
            <Upload size={18} className="text-[#6a7282]" />
            {file ? (
              <p className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{file.name}</p>
            ) : (
              <>
                <p className="text-[13px] text-[#0a0a0a]">
                  <span className="font-['Inter:Medium',sans-serif] text-[#307fe2]">Browse</span> or drag a file here
                </p>
                <p className="text-[11px] text-[#8992a0]">PDF, Word, PowerPoint, images, and more</p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || !name.trim() || uploading}
            className="flex items-center gap-1.5 bg-[#1D2930] text-white rounded-[8px] px-3 py-2 text-[12px] font-['Inter:Medium',sans-serif] disabled:opacity-40"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Upload
          </button>
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          title={`Delete "${deleteTarget.name}"?`}
          description="This can't be undone."
          isDeleting={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function BrandSection() {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  // Loaded on demand rather than globally — nothing else in the app uses
  // League Gothic, so no reason to pay for it on every page.
  useEffect(() => {
    const existing = document.getElementById('brand-font-link');
    if (existing) return;
    const link = document.createElement('link');
    link.id = 'brand-font-link';
    link.rel = 'stylesheet';
    link.href = BRAND_FONT.googleFontsUrl;
    document.head.appendChild(link);
  }, []);

  // Alex (the logo wordmark font) isn't on Google Fonts — self-hosted
  // @font-face from the file itself, same on-demand-load treatment.
  useEffect(() => {
    if (document.getElementById('logo-font-face')) return;
    const style = document.createElement('style');
    style.id = 'logo-font-face';
    style.textContent = `
      @font-face {
        font-family: "${LOGO_FONT.family}";
        src: url("${LOGO_FONT.downloadUrl}") format("truetype");
        font-display: swap;
      }
    `;
    document.head.appendChild(style);
  }, []);

  const copyHex = (hex: string) => {
    navigator.clipboard?.writeText(hex).then(() => {
      setCopiedHex(hex);
      toast.success(`Copied ${hex}`);
      setTimeout(() => setCopiedHex(prev => (prev === hex ? null : prev)), 1500);
    }).catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[13px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-3">Brand Voice &amp; Tone</h2>
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4 space-y-3">
          <p className="text-[13px] text-[#0a0a0a] leading-relaxed">
            A guide for every YULLR employee, how we sound in training videos, product copy, support and everywhere else we speak as YULLR.
          </p>
          <a
            href="/resource-assets/brand/YULLR_Brand_Tone.pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-['Inter:Medium',sans-serif] text-[#307fe2] hover:underline"
          >
            <FileText size={13} /> View the full Brand Voice &amp; Tone guide
          </a>
        </div>
      </div>
      <div>
        <h2 className="text-[13px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-3">Brand Colors</h2>
        <div className="space-y-3">
          {BRAND_COLORS.map(c => (
            <div key={c.hex} className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-3 flex gap-3">
              <div className="w-16 h-16 rounded-[8px] shrink-0" style={{ background: c.hex }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{c.name}</p>
                  <button
                    onClick={() => copyHex(c.hex)}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-mono text-[#307fe2] active:opacity-70"
                  >
                    {c.hex}
                    {copiedHex === c.hex ? <Check size={12} className="text-[#22c55e]" /> : <Copy size={11} className="text-[#8992a0]" />}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-[11px] text-[#6a7282] font-mono">
                  <span>RGB {c.rgb}</span>
                  <span>{c.cmyk}</span>
                  <span className="col-span-2">Pantone {c.pantone}</span>
                </div>
                <p className="text-[11px] text-[#8992a0] mt-1.5 leading-snug">{c.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-[13px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-3">Logo Font</h2>
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4">
          <p className="text-[36px] text-[#0a0a0a] leading-tight" style={{ fontFamily: `'${LOGO_FONT.family}', sans-serif` }}>
            {LOGO_FONT.family}
          </p>
          <p className="text-[12px] text-[#6a7282] mt-1">ABCDEFGHIJKLMNOPQRSTUVWXYZ · abcdefghijklmnopqrstuvwxyz · 0123456789</p>
          <a
            href={LOGO_FONT.downloadUrl}
            download
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-['Inter:Medium',sans-serif] bg-[#f3f3f5] text-[#307fe2] px-2 py-1 rounded-full hover:bg-[#eef3fb] active:opacity-70"
          >
            <Download size={10} /> Download Font (TTF)
          </a>
        </div>
      </div>

      <div>
        <h2 className="text-[13px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-3">Brand Font</h2>
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4">
          <p className="text-[36px] text-[#0a0a0a] leading-tight" style={{ fontFamily: `'${BRAND_FONT.family}', sans-serif` }}>
            {BRAND_FONT.family}
          </p>
          <p className="text-[12px] text-[#6a7282] mt-1">ABCDEFGHIJKLMNOPQRSTUVWXYZ · abcdefghijklmnopqrstuvwxyz · 0123456789</p>
          <a
            href={BRAND_FONT.downloadUrl}
            download
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-['Inter:Medium',sans-serif] bg-[#f3f3f5] text-[#307fe2] px-2 py-1 rounded-full hover:bg-[#eef3fb] active:opacity-70"
          >
            <Download size={10} /> Download Font (TTF)
          </a>
        </div>
      </div>
    </div>
  );
}

function LogoFilesSection() {
  return (
    <div className="space-y-6">
      <BrandSection />

      <div>
        <h2 className="text-[13px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-3">Logo Variants</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {LOGO_GROUPS.map(g => (
            <div key={g.id} className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] overflow-hidden">
              <div
                className="h-28 flex items-center justify-center p-3"
                style={{ background: g.label.includes('White') ? '#1D2930' : '#f9fafb' }}
              >
                {g.previewUrl ? (
                  <img src={g.previewUrl} alt={g.label} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[11px] text-[#6a7282]">Coming soon</span>
                )}
              </div>
              <div className="p-3">
                <p className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] mb-2">{g.label}</p>
                {g.formats.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {g.formats.map(f => (
                      <a
                        key={f.label}
                        href={f.url}
                        download
                        className="flex items-center gap-1 text-[11px] font-['Inter:Medium',sans-serif] bg-[#f3f3f5] text-[#307fe2] px-2 py-1 rounded-full hover:bg-[#eef3fb] active:opacity-70"
                      >
                        <Download size={10} /> {f.label}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-[#8992a0]">Not uploaded yet</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// One video frame at an assumed 30fps — the source clips don't expose their
// real frame rate to the browser, and 30fps is the standard assumption for
// this kind of footage; close enough for scrubbing by eye.
const FRAME_SECONDS = 1 / 30;

// Matches the brand fonts from the original demo build: League Gothic for
// display headings (self-hosted, same file offered as a download in the
// Logo Files tab) and Open Sans / IBM Plex Mono for body/mono text. Loaded
// on demand (only while Demo Hub is open), like BrandSection does for its
// own League Gothic usage.
function useDemoHubFonts() {
  useEffect(() => {
    if (!document.getElementById('demo-hub-fonts')) {
      const link = document.createElement('link');
      link.id = 'demo-hub-fonts';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
      document.head.appendChild(link);
    }
    if (!document.getElementById('demo-hub-league-gothic')) {
      const style = document.createElement('style');
      style.id = 'demo-hub-league-gothic';
      style.textContent = `
        @font-face {
          font-family: "League Gothic";
          src: url("${BRAND_FONT.downloadUrl}") format("truetype-variations");
          font-weight: 400 700;
          font-style: normal;
          font-display: swap;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);
}

function DemoHubSection() {
  const [pipelineIndex, setPipelineIndex] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [videoModalSlide, setVideoModalSlide] = useState<DemoSlide | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useDemoHubFonts();

  const activeStep = PIPELINE_STEPS[pipelineIndex];
  const activeSlide = DEMO_SLIDES[slideIndex];

  const prevSlide = () => setSlideIndex(i => (i - 1 + DEMO_SLIDES.length) % DEMO_SLIDES.length);
  const nextSlide = () => setSlideIndex(i => (i + 1) % DEMO_SLIDES.length);

  // Space plays/pauses; Left/Right steps one frame at a time (pausing first
  // so the step is precise) — handy for stepping through the detection demo
  // frame-by-frame during a live walkthrough.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const v = videoRef.current;
      if (!v) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (v.paused) v.play(); else v.pause();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        v.pause();
        v.currentTime = Math.min(v.duration || Infinity, v.currentTime + FRAME_SECONDS);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        v.pause();
        v.currentTime = Math.max(0, v.currentTime - FRAME_SECONDS);
      }
    };
    // Capture phase: the video has native `controls`, so if it (or its
    // shadow-DOM control bar) has focus, Chromium applies its own built-in
    // seek/play-pause shortcut in addition to ours unless we intercept
    // before the event reaches it.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const leagueGothic = { fontFamily: "'League Gothic', sans-serif" };
  const openSans = { fontFamily: "'Open Sans', sans-serif" };
  const mono = { fontFamily: "'IBM Plex Mono', monospace" };

  return (
    <div className="space-y-10" style={openSans}>
      <div>
        <h2 style={leagueGothic} className="font-normal text-[32px] leading-none uppercase text-[#1D252D] mb-1">Quick Links</h2>
        <p className="text-[13px] text-[#61666C] mb-3">Everything you need for a live demo, in one place.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {DEMO_LINKS.map(link => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col gap-2.5 bg-white border-2 border-[#1D252D] p-3 no-underline transition-transform hover:-translate-y-0.5 hover:-translate-x-0.5"
              style={{ boxShadow: '4px 4px 0 #1D252D' }}
            >
              <div className="flex items-center justify-between">
                <span style={mono} className="text-[10px] tracking-wide uppercase text-[#8E9296] bg-[#F8F9FA] border border-[#E8E9EA] px-2 py-0.5">{link.tag}</span>
                <ExternalLink size={13} className="text-[#8E9296]" />
              </div>
              <div style={leagueGothic} className="font-normal text-[20px] leading-tight uppercase text-[#1D252D]">{link.label}</div>
              <div className="text-[13px] font-bold text-[#FF5C39] flex items-center gap-1">Open →</div>
            </a>
          ))}
        </div>
      </div>

      <div>
        <h2 style={leagueGothic} className="font-normal text-[32px] leading-none uppercase text-[#1D252D] mb-1">Pipeline Demo</h2>
        <p className="text-[13px] text-[#61666C] mb-3">
          Tap through the YULLR video pipeline: capture, detect, process, deliver.
          <span className="block text-[11px] text-[#8E9296] mt-0.5">Space to play/pause · ←/→ to step one frame</span>
        </p>
        <div className="rounded-[36px] p-[22px] flex justify-center" style={{ background: '#0B0E11', boxShadow: '0 20px 60px rgba(29,37,45,0.35)' }}>
          <div className="w-full bg-white rounded-[18px] p-3.5 flex flex-col gap-3.5">
            <div className="bg-black rounded-[6px] overflow-hidden aspect-video flex">
              <video
                key={activeStep.file}
                ref={videoRef}
                src={activeStep.file}
                controls
                autoPlay
                muted
                playsInline
                preload="auto"
                onLoadedMetadata={e => {
                  if (activeStep.startTime) e.currentTarget.currentTime = activeStep.startTime;
                }}
                className="w-full h-full object-contain bg-black"
              />
            </div>
            <div className="grid grid-cols-4 gap-3.5">
              {PIPELINE_STEPS.map((step, i) => (
                <button
                  key={step.label}
                  onClick={() => setPipelineIndex(i)}
                  style={{ ...leagueGothic, background: i === pipelineIndex ? '#FF5C39' : '#1D252D' }}
                  className="font-normal text-[18px] tracking-wide uppercase text-white py-3 px-2 border-none cursor-pointer transition-colors"
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 style={leagueGothic} className="font-normal text-[32px] leading-none uppercase text-[#1D252D] mb-1">YULLR Slideshow</h2>
        <p className="text-[13px] text-[#61666C] mb-3">Browse sample stills from the mountain.</p>
        <div className="relative bg-[#1D252D] border-2 border-[#1D252D] aspect-video overflow-hidden" style={{ boxShadow: '4px 4px 0 #1D252D' }}>
          {activeSlide.type === 'video' ? (
            <button
              onClick={() => setVideoModalSlide(activeSlide)}
              aria-label={`Play ${activeSlide.label}`}
              className="w-full h-full p-0 border-none cursor-pointer relative group"
            >
              <img src={activeSlide.poster} alt={activeSlide.label} className="w-full h-full object-contain bg-[#1D252D]" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                <PlayCircle size={64} className="text-white drop-shadow-lg" />
              </div>
            </button>
          ) : (
            <img src={activeSlide.file} alt={activeSlide.label} className="w-full h-full object-contain bg-[#1D252D]" />
          )}
          <button
            onClick={prevSlide}
            aria-label="Previous"
            style={{ ...leagueGothic, background: '#FF5C39' }}
            className="absolute top-1/2 left-4 -translate-y-1/2 w-11 h-11 text-[24px] text-white border-none cursor-pointer flex items-center justify-center p-0"
          >
            ‹
          </button>
          <button
            onClick={nextSlide}
            aria-label="Next"
            style={{ ...leagueGothic, background: '#FF5C39' }}
            className="absolute top-1/2 right-4 -translate-y-1/2 w-11 h-11 text-[24px] text-white border-none cursor-pointer flex items-center justify-center p-0"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-5 gap-2 mt-3">
          {DEMO_SLIDES.map((s, i) => (
            <button
              key={i}
              onClick={() => setSlideIndex(i)}
              className="relative aspect-square overflow-hidden border-2 p-0 cursor-pointer"
              style={{ borderColor: i === slideIndex ? '#FF5C39' : '#1D252D' }}
            >
              <img src={s.type === 'video' ? s.poster : s.file} alt={s.label} className="w-full h-full object-cover block" />
              {s.type === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <PlayCircle size={20} className="text-white drop-shadow" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {videoModalSlide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setVideoModalSlide(null)}
        >
          <div className="relative w-full max-w-4xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setVideoModalSlide(null)}
              aria-label="Close"
              className="absolute -top-10 right-0 text-white border-none bg-transparent cursor-pointer p-1"
            >
              <X size={28} />
            </button>
            <video
              src={videoModalSlide.file}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[80vh] bg-black rounded-[6px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Uploading a reference document for ODIN's knowledge base — split out of
// the FAQ tab into its own pill so it's not buried under the chat/search UI.
function UploadSection() {
  return (
    <div className="space-y-3">
      <DocumentUploadForm isAdmin={false} />
    </div>
  );
}

export function ResourceCenterPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as ResourceTab) || 'faq';
  const setTab = (t: ResourceTab) => setSearchParams({ tab: t });

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/')} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px]">Resource Center</h1>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${tab === t.id ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 pb-16">
        {tab === 'faq' && <FAQSection />}
        {tab === 'training' && <TrainingMaterialsSection />}
        {tab === 'sales' && <ResourceFileManager category="sales" emptyLabel="Sales tools" />}
        {tab === 'marketing' && <ResourceFileManager category="marketing" emptyLabel="Marketing assets" />}
        {tab === 'logos' && <LogoFilesSection />}
        {tab === 'demo' && <DemoHubSection />}
        {tab === 'qr' && <QrStudioSection />}
        {tab === 'upload' && <UploadSection />}
      </div>
    </div>
  );
}
