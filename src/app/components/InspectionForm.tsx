import { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { X, Check, Plus, Minus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useData, isProjectCompleted, MULTI_COUNT_ITEMS, SUB_TOGGLE_OPTIONS } from '../context/DataContext';
import type { Location, Inspection, SiteInspectionItem, SiteInspectionItemType } from '../context/DataContext';
import { useMyContact } from '../hooks/useMyContact';

const INSPECTION_ITEM_TYPES: SiteInspectionItemType[] = [
  'Camera', 'POE Switch', 'POE Extender',
  'Wireless', 'Existing Power',
  'Transformer Required', 'Data Drop', 'Existing Fiber Drop',
  'Passive POE Adapter', 'Ethernet Cable 50Ft', 'Antenna Mount',
];

// Add-or-edit inspection modal — shared by LocationDetail (both the routed
// page and the embedded view inside TrailDetailModal). Editing an existing
// inspection is just this same form pre-filled, keyed by whether
// `inspection` is passed.
export function InspectionForm({
  mountainId, location, inspection, onClose,
}: {
  mountainId: string;
  location: Location;
  inspection: Inspection | null;
  onClose: () => void;
}) {
  const { addInspection, updateInspection, getProjectsByMountainId } = useData();
  const { user } = useUser();
  const me = useMyContact();
  const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';

  const activeProjects = getProjectsByMountainId(mountainId).filter(p => !isProjectCompleted(p));
  const [items, setItems] = useState<SiteInspectionItem[]>(inspection?.items || []);
  const [notes, setNotes] = useState(inspection?.notes || '');
  const [difficulty, setDifficulty] = useState<number>(inspection?.difficulty || 0);
  const [projectId, setProjectId] = useState(inspection?.projectId || (activeProjects.length === 1 ? activeProjects[0].id : ''));
  const [saving, setSaving] = useState(false);

  const toggleItem = (type: SiteInspectionItemType) => {
    setItems(prev => {
      const existing = prev.find(i => i.type === type);
      if (existing) {
        if (MULTI_COUNT_ITEMS.includes(type)) {
          if (existing.count > 1) return prev.map(i => i.type === type ? { ...i, count: i.count - 1 } : i);
          return prev.filter(i => i.type !== type);
        }
        return prev.filter(i => i.type !== type);
      }
      const subOptions = SUB_TOGGLE_OPTIONS[type];
      return [...prev, { type, count: 1, ...(subOptions ? { subValue: subOptions[0] } : {}) }];
    });
  };

  const incrementItem = (type: SiteInspectionItemType) => {
    setItems(prev => {
      const existing = prev.find(i => i.type === type);
      if (existing) return prev.map(i => i.type === type ? { ...i, count: i.count + 1 } : i);
      return [...prev, { type, count: 1 }];
    });
  };

  const setSubValue = (type: SiteInspectionItemType, subValue: string) => {
    setItems(prev => prev.map(i => i.type === type ? { ...i, subValue } : i));
  };

  const getItemCount = (type: SiteInspectionItemType): number => items.find(i => i.type === type)?.count || 0;
  const getItemSubValue = (type: SiteInspectionItemType): string | undefined => items.find(i => i.type === type)?.subValue;

  const handleSave = async () => {
    if (!notes.trim() && items.length === 0) {
      toast.error('Please add inspection items or notes');
      return;
    }
    setSaving(true);
    try {
      const patch = { items, notes: notes.trim(), projectId: projectId || undefined, difficulty: (difficulty || undefined) as (1 | 2 | 3 | 4 | 5 | undefined) };
      if (inspection) {
        updateInspection(inspection.id, patch);
      } else {
        addInspection({
          locationId: location.id,
          mountainId: location.mountainId,
          createdAt: new Date().toISOString(),
          createdBy,
          createdByContactId: me?.id,
          ...patch,
        });
      }
      toast.success(inspection ? 'Inspection updated' : 'Inspection added');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-[16px] sm:rounded-[16px] w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.08)]">
          <h2 className="text-[17px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{inspection ? 'Edit Inspection' : 'Add Inspection'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {activeProjects.length > 0 && (
            <div>
              <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Project</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none appearance-none">
                <option value="">Select a project…</option>
                {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Install Difficulty</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" onClick={() => setDifficulty(difficulty === n ? 0 : n)}
                  className={`flex-1 py-2 rounded-[8px] text-[14px] font-['Inter:Medium',sans-serif] ${difficulty === n ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#8992a0] mt-1.5">1 = easy · 5 = hard</p>
          </div>

          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Inspection Items</label>
            <div className="grid grid-cols-2 gap-2">
              {INSPECTION_ITEM_TYPES.map(type => {
                const count = getItemCount(type);
                const isMultiCount = MULTI_COUNT_ITEMS.includes(type);
                const isSelected = count > 0;
                const subOptions = SUB_TOGGLE_OPTIONS[type];
                const subValue = getItemSubValue(type);
                return (
                  <div key={type} className={`rounded-[8px] border-2 transition-all ${isSelected ? 'bg-[#f0fdf4] border-[#22c55e]' : 'bg-[#f9fafb] border-[rgba(0,0,0,0.08)]'}`}>
                    <button type="button" onClick={() => toggleItem(type)} className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 active:opacity-70">
                      <span className={`font-['Inter:Medium',sans-serif] text-[13px] flex-1 flex items-center gap-1 ${isSelected ? 'text-[#0a0a0a]' : 'text-[#6a7282]'}`}>
                        {type}
                        {type === 'Camera' && <Plus size={12} className={isSelected ? 'text-[#22c55e]' : 'text-[#6a7282]'} />}
                      </span>
                      {isSelected && (
                        <div className={`flex items-center gap-1 ${isMultiCount ? 'bg-[#22c55e] text-white rounded-full px-2 py-0.5' : ''}`}>
                          {isMultiCount ? <span className="text-[11px] font-['Inter:SemiBold',sans-serif] font-semibold">{count}</span> : <Check size={14} className="text-[#22c55e]" />}
                        </div>
                      )}
                    </button>
                    {isMultiCount && isSelected && (
                      <div className="border-t border-[#22c55e]/20 px-3 py-2 flex items-center gap-2">
                        <button type="button" onClick={() => toggleItem(type)} className="flex-1 bg-[#fee2e2] text-[#dc2626] rounded-[6px] py-1.5 flex items-center justify-center gap-1 font-['Inter:Medium',sans-serif] text-[12px] active:opacity-70">
                          <Minus size={12} /> Remove
                        </button>
                        <button type="button" onClick={() => incrementItem(type)} className="flex-1 bg-[#22c55e] text-white rounded-[6px] py-1.5 flex items-center justify-center gap-1 font-['Inter:Medium',sans-serif] text-[12px] active:opacity-80">
                          <Plus size={12} /> Add
                        </button>
                      </div>
                    )}
                    {subOptions && isSelected && (
                      <div className="border-t border-[#22c55e]/20 px-3 py-2 flex items-center gap-2">
                        {subOptions.map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setSubValue(type, opt)}
                            className={`flex-1 py-1.5 rounded-[6px] text-[12px] font-['Inter:Medium',sans-serif] ${subValue === opt ? 'bg-[#1D2930] text-white' : 'bg-white text-[#6a7282] border border-[rgba(0,0,0,0.1)]'}`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {items.length > 0 && (
              <p className="text-[#307FE2] font-['Inter:Medium',sans-serif] text-[12px] mt-3">
                {items.length} item type{items.length !== 1 ? 's' : ''} marked ({items.reduce((sum, i) => sum + i.count, 0)} total)
              </p>
            )}
          </div>

          <div>
            <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Site conditions, accessibility, power availability…"
              rows={4}
              className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2.5 text-[#0a0a0a] text-[14px] outline-none resize-none"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex gap-3">
          <button onClick={onClose} className="flex-1 bg-[#f3f3f5] text-[#6a7282] rounded-[10px] py-3 font-['Inter:Medium',sans-serif] font-medium text-[15px]">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#ff5c39] text-white rounded-[10px] py-3 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[15px] disabled:opacity-50">
            {saving && <Loader2 size={16} className="animate-spin" />}
            {inspection ? 'Save Changes' : 'Save Inspection'}
          </button>
        </div>
      </div>
    </div>
  );
}
