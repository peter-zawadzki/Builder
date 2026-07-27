import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Search, ChevronDown, HelpCircle, GraduationCap,
  Briefcase, Image as ImageIcon, Palette, FolderOpen, Download, Copy, Check,
  PlayCircle, ExternalLink, ChevronLeft, ChevronRight, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { FAQ_ENTRIES, type FAQCategory } from '../data/faqData';
import { LOGO_GROUPS } from '../data/logoAssets';
import { BRAND_COLORS, LOGO_FONT, BRAND_FONT } from '../data/brandStyle';
import { DEMO_LINKS, PIPELINE_STEPS, DEMO_SLIDES } from '../data/demoHubData';
import { SALES_TOOLS } from '../data/salesToolsData';

type ResourceTab = 'faq' | 'training' | 'sales' | 'marketing' | 'logos' | 'demo';

const TABS: { id: ResourceTab; label: string; icon: React.ReactNode }[] = [
  { id: 'faq',       label: 'FAQ',               icon: <HelpCircle size={14} /> },
  { id: 'training',  label: 'Training Documents', icon: <GraduationCap size={14} /> },
  { id: 'sales',     label: 'Sales Tools',        icon: <Briefcase size={14} /> },
  { id: 'marketing', label: 'Marketing Assets',   icon: <ImageIcon size={14} /> },
  { id: 'logos',     label: 'Brand Assets',       icon: <Palette size={14} /> },
  { id: 'demo',      label: 'Demo Hub',           icon: <PlayCircle size={14} /> },
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

function FAQSection() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FAQCategory | 'All'>('All');
  const [openId, setOpenId] = useState<string | null>(null);

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
    const scored = FAQ_ENTRIES
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
  }, [query, category]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Ask a question or search FAQs…"
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
        {results.length === 0 ? (
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

function SalesToolsSection() {
  return (
    <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] divide-y divide-[rgba(0,0,0,0.06)]">
      {SALES_TOOLS.map(f => (
        <a
          key={f.url}
          href={f.url}
          download
          className="flex items-center gap-3 px-4 py-3 hover:bg-[#f9fafb] active:opacity-70"
        >
          <div className="w-9 h-9 rounded-[8px] bg-[#f3f3f5] flex items-center justify-center shrink-0">
            {f.type === 'PDF' ? <FileText size={16} className="text-[#e11d48]" /> : <ImageIcon size={16} className="text-[#307fe2]" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{f.label}</p>
            <p className="text-[11px] text-[#8992a0]">{f.type} · {formatFileSize(f.sizeKB)}</p>
          </div>
          <Download size={14} className="text-[#307fe2] shrink-0" />
        </a>
      ))}
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
          <img src={activeSlide.file} alt={activeSlide.label} className="w-full h-full object-contain bg-[#1D252D]" />
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
              className="aspect-square overflow-hidden border-2 p-0 cursor-pointer"
              style={{ borderColor: i === slideIndex ? '#FF5C39' : '#1D252D' }}
            >
              <img src={s.file} alt={s.label} className="w-full h-full object-cover block" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResourceCenterPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ResourceTab>('faq');

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
        {tab === 'training' && <EmptyPlaceholder label="Training documents" />}
        {tab === 'sales' && <SalesToolsSection />}
        {tab === 'marketing' && <EmptyPlaceholder label="Marketing assets" />}
        {tab === 'logos' && <LogoFilesSection />}
        {tab === 'demo' && <DemoHubSection />}
      </div>
    </div>
  );
}
