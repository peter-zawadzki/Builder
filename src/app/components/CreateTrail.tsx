import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../context/DataContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

export function CreateTrail() {
  const { mountainId } = useParams();
  const navigate = useNavigate();
  const { getMountainById, addTrail } = useData();

  const mountain = getMountainById(mountainId!);

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [isNastar, setIsNastar] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    const hasData = name.trim() !== '' || notes.trim() !== '' || isNastar;
    setHasUnsavedChanges(hasData);
  }, [name, notes, isNastar]);

  const { showPrompt, handleSave: handleSaveAndProceed, handleDiscard, handleCancel, markSaved } = useUnsavedChanges({ when: hasUnsavedChanges });

  const handleSave = () => {
    if (!name.trim()) { toast.error('Trail name is required'); return; }
    addTrail({
      mountainId: mountainId!,
      name: name.trim(),
      notes: notes.trim() || undefined,
      isNastar: isNastar || undefined,
    });
    toast.success('Trail added');
    setHasUnsavedChanges(false);
    markSaved();
    navigate(`/mountains/${mountainId}`);
  };

  const inp = "w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none";

  if (!mountain) return null;

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <UnsavedChangesDialog
        show={showPrompt}
        onSave={() => {
          handleSave();
          handleSaveAndProceed();
        }}
        onDiscard={handleDiscard}
        onCancel={handleCancel}
        showSaveButton={name.trim() !== ''}
      />
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Add Trail</h1>
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] truncate">{mountain.name}</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-4 pb-8">
        {/* Trail Details */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4 space-y-4">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px]">Trail Details</h2>

          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">
              Trail Name <span className="text-[#ff5c39]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Upper Meadow"
              autoFocus
              className={inp}
            />
          </div>

          <div>
            <label className="block text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes about this trail…"
              rows={3}
              className={`${inp} resize-none`}
            />
          </div>

          {/* NASTAR toggle */}
          <button
            type="button"
            onClick={() => setIsNastar(v => !v)}
            className="flex items-center gap-3 w-full active:opacity-70"
          >
            <div className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isNastar ? 'bg-[#ff5c39] border-[#ff5c39]' : 'bg-white border-[#d1d5db]'}`}>
              {isNastar && (
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                  <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px]">NASTAR trail</span>
            {isNastar && (
              <span className="ml-auto bg-[#ff5c39] text-white text-[11px] font-['Inter:Medium',sans-serif] font-medium px-2 py-0.5 rounded-full">
                NASTAR
              </span>
            )}
          </button>
        </div>

        <button type="button" onClick={handleSave}
          className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-4 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[16px] active:opacity-80">
          Save Trail
        </button>
      </div>
    </div>
  );
}
