import { AlertTriangle } from 'lucide-react';

// Shown when closing an edit-mode modal (Contact/Organization/Team/Project)
// with unsaved staged changes — lets the user pick Discard or Save instead
// of silently losing or silently keeping the edit.
export function DiscardChangesModal({
  onDiscard, onSave, onCancel,
}: {
  onDiscard: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white w-full max-w-sm rounded-[16px] p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#fff3e0] flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-[#e65100]" />
          </div>
          <div>
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">Unsaved changes</h2>
            <p className="text-[#6a7282] text-[13px] mt-0.5">Discard your changes, or save them before closing?</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onDiscard} className="flex-1 bg-[#f3f3f5] text-[#F95C39] rounded-[10px] py-2.5 text-[14px] font-['Inter:Medium',sans-serif] font-medium active:bg-[#e8e8ea]">
            Discard
          </button>
          <button onClick={onSave} className="flex-1 bg-[#1D2930] text-white rounded-[10px] py-2.5 text-[14px] font-['Inter:Medium',sans-serif] font-medium active:opacity-80">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
