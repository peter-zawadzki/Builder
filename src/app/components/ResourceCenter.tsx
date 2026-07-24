import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Search, ChevronDown, HelpCircle, GraduationCap, DollarSign,
  Briefcase, Image as ImageIcon, Palette, FolderOpen, Download, Copy, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { FAQ_ENTRIES, type FAQCategory } from '../data/faqData';
import { LOGO_GROUPS, LOGO_SOURCE_FILES } from '../data/logoAssets';
import { BRAND_COLORS, BRAND_FONT } from '../data/brandStyle';

type ResourceTab = 'faq' | 'training' | 'pricing' | 'sales' | 'marketing' | 'logos';

const TABS: { id: ResourceTab; label: string; icon: React.ReactNode }[] = [
  { id: 'faq',       label: 'FAQ',               icon: <HelpCircle size={14} /> },
  { id: 'training',  label: 'Training Documents', icon: <GraduationCap size={14} /> },
  { id: 'pricing',   label: 'Pricing Samples',    icon: <DollarSign size={14} /> },
  { id: 'sales',     label: 'Sales Tools',        icon: <Briefcase size={14} /> },
  { id: 'marketing', label: 'Marketing Assets',   icon: <ImageIcon size={14} /> },
  { id: 'logos',     label: 'Logo Files',         icon: <Palette size={14} /> },
];

const FAQ_CATEGORIES: FAQCategory[] = ['General', 'Technical', 'Financial'];

function FAQSection() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FAQCategory | 'All'>('All');
  const [openId, setOpenId] = useState<string | null>(null);

  // "Deep search" — matches against both the question AND the answer body,
  // not just the question title, so e.g. searching "PoE" or "NVIDIA" finds
  // entries where that term only appears in the answer.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ_ENTRIES.filter(f => {
      if (category !== 'All' && f.category !== category) return false;
      if (!q) return true;
      return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q);
    });
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {BRAND_COLORS.map(c => (
            <button
              key={c.hex}
              onClick={() => copyHex(c.hex)}
              className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] overflow-hidden text-left active:opacity-80"
            >
              <div className="h-16" style={{ background: c.hex }} />
              <div className="p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{c.name}</p>
                  <p className="text-[11px] text-[#6a7282] font-mono">{c.hex}</p>
                </div>
                {copiedHex === c.hex ? <Check size={14} className="text-[#22c55e] shrink-0" /> : <Copy size={13} className="text-[#8992a0] shrink-0" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-[13px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-3">Brand Font</h2>
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4">
          <p className="text-[36px] text-[#0a0a0a] leading-tight" style={{ fontFamily: `'${BRAND_FONT.family}', sans-serif` }}>
            {BRAND_FONT.family}
          </p>
          <p className="text-[12px] text-[#6a7282] mt-1">ABCDEFGHIJKLMNOPQRSTUVWXYZ · abcdefghijklmnopqrstuvwxyz · 0123456789</p>
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

      <div>
        <h2 className="text-[13px] font-['Inter:Medium',sans-serif] text-[#6a7282] uppercase tracking-wide mb-3">Vector Source Files</h2>
        <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] divide-y divide-[rgba(0,0,0,0.06)]">
          {LOGO_SOURCE_FILES.map(f => (
            <a key={f.url} href={f.url} download className="flex items-center justify-between px-4 py-3 hover:bg-[#f9fafb] active:opacity-70">
              <span className="text-[13px] text-[#0a0a0a]">{f.label}</span>
              <Download size={14} className="text-[#307fe2]" />
            </a>
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
        {tab === 'pricing' && <EmptyPlaceholder label="Pricing samples" />}
        {tab === 'sales' && <EmptyPlaceholder label="Sales tools" />}
        {tab === 'marketing' && <EmptyPlaceholder label="Marketing assets" />}
        {tab === 'logos' && <LogoFilesSection />}
      </div>
    </div>
  );
}
