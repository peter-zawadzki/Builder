
import { useAppMode } from '../../lib/app-mode-context';

// Styled to match the Admin/User toggle in AppHeader.tsx (same pill shape,
// same bg-[#f3f3f5]/bg-[#1D2930] active-state colors).
export function ModeToggle() {
  const { mode, setMode } = useAppMode();
  const isLive = mode === 'live';

  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-gray-200)' }}>
      <div role="radiogroup" aria-label="App mode" className="flex items-center bg-[#f3f3f5] rounded-full p-1 gap-0.5">
        <button
          type="button"
          role="radio"
          aria-checked={isLive}
          onClick={() => setMode('live')}
          className={`flex-1 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] font-medium transition-colors ${
            isLive ? 'bg-[#1D2930] text-white' : 'text-[#6a7282]'
          }`}
        >
          Live
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!isLive}
          onClick={() => setMode('model')}
          className={`flex-1 px-3 py-1.5 rounded-full text-[12px] font-['Inter:Medium',sans-serif] font-medium transition-colors ${
            !isLive ? 'bg-[#1D2930] text-white' : 'text-[#6a7282]'
          }`}
        >
          Model
        </button>
      </div>
    </div>
  );
}
