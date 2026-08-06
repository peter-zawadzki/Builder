import { useState } from 'react';
import { X, HelpCircle, Sparkles } from 'lucide-react';
import { FaqAssistant, FAQSection } from './ResourceCenter';

type HelpTab = 'ask' | 'browse';

// Standalone Help entry point reachable from the app header — reuses the same
// FaqAssistant/FAQSection the full Resource Center page renders, so there's
// one FAQ experience, not a second copy of it.
export function HelpModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<HelpTab>('ask');

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <div>
            <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
              Welcome to <span className="font-bold text-[#ff5c39]">ODIN</span>
            </h2>
            <p className="text-[12px] text-[#6a7282] mt-0.5">Your all-knowing AI assistant that won't make you give up an eye!</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5] shrink-0"><X size={16} className="text-[#6a7282]" /></button>
        </div>

        <div className="flex gap-2 px-5 pt-3">
          <button
            onClick={() => setTab('ask')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${tab === 'ask' ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
          >
            <Sparkles size={13} /> Ask
          </button>
          <button
            onClick={() => setTab('browse')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] ${tab === 'browse' ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
          >
            <HelpCircle size={13} /> Browse FAQs
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {tab === 'ask' ? <FaqAssistant /> : <FAQSection />}
        </div>
      </div>
    </div>
  );
}
