import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteConfirmModalProps {
  title: string;
  description: React.ReactNode;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  title,
  description,
  isDeleting = false,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  const [typed, setTyped] = useState('');
  const confirmed = typed === 'DELETE';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="bg-white w-full max-w-lg rounded-t-[20px] p-6 space-y-5">
        {/* Icon + headline */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-[#fff0ee] flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={28} className="text-[#ff5c39]" />
          </div>
          <div>
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">
              {title}
            </h2>
            <div className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px] mt-1 leading-relaxed">
              {description}
            </div>
          </div>
        </div>

        {/* Type-to-confirm input */}
        <div>
          <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-2 text-center">
            Type <span className="font-['Inter:Medium',sans-serif] text-[#0a0a0a]">DELETE</span> to confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="DELETE"
            className={`w-full rounded-[8px] px-4 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px] outline-none border-2 text-center transition-colors ${
              typed.length === 0
                ? 'bg-[#f3f3f5] border-transparent'
                : confirmed
                ? 'bg-[#f0faf4] border-[#22c55e]'
                : 'bg-[#fff0ee] border-[#ff5c39]/40'
            }`}
          />
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={onConfirm}
            disabled={!confirmed || isDeleting}
            className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-3.5 font-['Inter:Medium',sans-serif] font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-40 active:opacity-80"
          >
            {isDeleting && <Loader2 size={18} className="animate-spin" />}
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="w-full bg-[#f3f3f5] text-[#0a0a0a] rounded-[8px] px-4 py-3.5 font-['Inter:Medium',sans-serif] font-medium active:bg-[#e8e8ea] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
