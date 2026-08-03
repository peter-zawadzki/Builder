import { X } from 'lucide-react';
import type { SiteAssessment } from '../utils/siteAssessmentsApi';

export function ChooseSiteAssessmentModal({
  assessments, onChoose, onClose,
}: { assessments: SiteAssessment[]; onChoose: (id: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-[20px] sm:rounded-[20px] p-6 space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Add to which Site Assessment?</h2>
          <button type="button" onClick={onClose} className="p-1 active:opacity-60"><X size={20} className="text-[#6a7282]" /></button>
        </div>
        <div className="space-y-2">
          {assessments.map(a => (
            <button
              key={a.id}
              onClick={() => onChoose(a.id)}
              className="w-full bg-[#f3f3f5] rounded-[10px] px-4 py-3 text-left active:bg-[#e8e8ea]"
            >
              <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[14px]">{a.name}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
