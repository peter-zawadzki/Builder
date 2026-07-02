import { AlertTriangle } from 'lucide-react';

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onSave?: () => void | Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
  message?: string;
  showSaveButton?: boolean;
}

export function UnsavedChangesDialog({
  isOpen,
  onSave,
  onDiscard,
  onCancel,
  message = 'You have unsaved changes.',
  showSaveButton = true,
}: UnsavedChangesDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="bg-white rounded-[16px] p-6 max-w-sm w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 bg-[#fff3f0] rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={24} className="text-[#ff5c39]" />
          </div>
          <div className="flex-1">
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px] mb-1">
              Unsaved Changes
            </h2>
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[14px]">
              {message}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {showSaveButton && onSave && (
            <button
              onClick={onSave}
              className="w-full bg-[#307FE2] text-white rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] active:opacity-80"
            >
              Save Changes
            </button>
          )}
          <button
            onClick={onDiscard}
            className="w-full bg-[#fff3f0] text-[#ff5c39] rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] active:bg-[#ffe0d9]"
          >
            Discard Changes
          </button>
          <button
            onClick={onCancel}
            className="w-full bg-white border border-[rgba(0,0,0,0.12)] text-[#0a0a0a] rounded-[8px] px-4 py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px] active:bg-[#f3f3f5]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
