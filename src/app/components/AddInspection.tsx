import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, Loader2, Check, Plus, Minus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../context/DataContext';
import type { SiteInspectionItem, SiteInspectionItemType } from '../context/DataContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

const INSPECTION_ITEM_TYPES: SiteInspectionItemType[] = [
  'Camera', 'Battery Box', 'POE Switch', 'POE Extender',
  'Wireless RX', 'Wireless TX', 'Existing 120V', 'Existing 480V',
  'Transformer Required', 'Existing Data Drop', 'Existing Fiber Drop',
  'Passive POE Adapter', 'Ethernet Cable 50Ft', 'Antenna Mount',
];

const MULTI_COUNT_ITEMS: SiteInspectionItemType[] = [
  'Camera', 'Passive POE Adapter', 'Ethernet Cable 50Ft', 'Antenna Mount',
];

// ─── Main component ───────────────────────────────────────────────────────────

export function AddInspection() {
  const { mountainId, locationId } = useParams();
  const navigate = useNavigate();
  const { getMountainById, getLocationById, updateLocation } = useData();

  const mountain = getMountainById(mountainId!);
  const location = getLocationById(locationId!);
  const isEditing = !!location?.inspection;

  const [items, setItems] = useState<SiteInspectionItem[]>(location?.inspection?.items || []);
  const [notes, setNotes] = useState(location?.inspection?.notes || '');
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Track changes
  useEffect(() => {
    const itemsChanged = JSON.stringify(items) !== JSON.stringify(location?.inspection?.items || []);
    const notesChanged = notes.trim() !== (location?.inspection?.notes || '');
    setHasUnsavedChanges(itemsChanged || notesChanged);
  }, [items, notes, location?.inspection?.items, location?.inspection?.notes]);

  const toggleItem = (type: SiteInspectionItemType) => {
    setItems(prev => {
      const existing = prev.find(i => i.type === type);
      if (existing) {
        // Remove if count is 1 and it's a single-count item, otherwise decrement
        if (MULTI_COUNT_ITEMS.includes(type)) {
          if (existing.count > 1) {
            return prev.map(i => i.type === type ? { ...i, count: i.count - 1 } : i);
          } else {
            return prev.filter(i => i.type !== type);
          }
        } else {
          return prev.filter(i => i.type !== type);
        }
      } else {
        // Add new item
        return [...prev, { type, count: 1 }];
      }
    });
  };

  const incrementItem = (type: SiteInspectionItemType) => {
    setItems(prev => {
      const existing = prev.find(i => i.type === type);
      if (existing) {
        return prev.map(i => i.type === type ? { ...i, count: i.count + 1 } : i);
      } else {
        return [...prev, { type, count: 1 }];
      }
    });
  };

  const getItemCount = (type: SiteInspectionItemType): number => {
    return items.find(i => i.type === type)?.count || 0;
  };

  const handleSave = async () => {
    if (!notes.trim() && items.length === 0) {
      toast.error('Please add inspection items or notes');
      return;
    }
    setSaving(true);
    try {
      updateLocation(locationId!, {
        inspection: {
          items: items,
          notes: notes.trim(),
          createdAt: location?.inspection?.createdAt || new Date().toISOString(),
        },
      });

      toast.success(isEditing ? 'Inspection updated' : 'Inspection added');
      setHasUnsavedChanges(false);
      navigate(`/mountains/${mountainId}/locations/${locationId}`);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save inspection. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Unsaved changes protection
  const { showPrompt, handleSave: handleSaveDialog, handleDiscard, handleCancel } = useUnsavedChanges({
    when: hasUnsavedChanges,
    message: 'You have unsaved changes. Do you want to save this inspection before leaving?',
    onSave: handleSave,
  });

  if (!mountain || !location) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">Location not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] pb-8">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">
              {isEditing ? 'Edit Inspection' : 'Add Inspection'}
            </h1>
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] truncate">
              {location.name}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-5">

        {/* Info banner */}
        <div className="bg-[#EBF3FF] border border-[#C5DEFF] rounded-[12px] p-4">
          <p className="text-[#307FE2] font-['Inter:Medium',sans-serif] font-medium text-[13px] mb-1">
            Quick Inspection Checklist
          </p>
          <p className="text-[#307FE2] font-['Inter:Regular',sans-serif] text-[12px] leading-relaxed">
            Mark items found onsite or needed for install. This is separate from physical asset inventory tracking.
          </p>
        </div>

        {/* ── Inspection Items ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-1">
            Inspection Items
          </h2>
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-3">
            Tap items to mark as present or needed. Some items support quantity counts.
          </p>

          <div className="grid grid-cols-2 gap-2">
            {INSPECTION_ITEM_TYPES.map(type => {
              const count = getItemCount(type);
              const isMultiCount = MULTI_COUNT_ITEMS.includes(type);
              const isSelected = count > 0;

              return (
                <div
                  key={type}
                  className={`rounded-[8px] border-2 transition-all ${
                    isSelected
                      ? 'bg-[#f0fdf4] border-[#22c55e]'
                      : 'bg-[#f9fafb] border-[rgba(0,0,0,0.08)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(type)}
                    className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 active:opacity-70"
                  >
                    <span className={`font-['Inter:Medium',sans-serif] text-[13px] flex-1 ${
                      isSelected ? 'text-[#0a0a0a]' : 'text-[#6a7282]'
                    }`}>
                      {type}
                    </span>
                    {isSelected && (
                      <div className={`flex items-center gap-1 ${
                        isMultiCount ? 'bg-[#22c55e] text-white rounded-full px-2 py-0.5' : ''
                      }`}>
                        {isMultiCount ? (
                          <span className="text-[11px] font-['Inter:SemiBold',sans-serif] font-semibold">
                            {count}
                          </span>
                        ) : (
                          <Check size={14} className="text-[#22c55e]" />
                        )}
                      </div>
                    )}
                  </button>

                  {isMultiCount && isSelected && (
                    <div className="border-t border-[#22c55e]/20 px-3 py-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleItem(type)}
                        className="flex-1 bg-[#fee2e2] text-[#dc2626] rounded-[6px] py-1.5 flex items-center justify-center gap-1 font-['Inter:Medium',sans-serif] text-[12px] active:opacity-70"
                      >
                        <Minus size={12} /> Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => incrementItem(type)}
                        className="flex-1 bg-[#22c55e] text-white rounded-[6px] py-1.5 flex items-center justify-center gap-1 font-['Inter:Medium',sans-serif] text-[12px] active:opacity-80"
                      >
                        <Plus size={12} /> Add
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {items.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.08)]">
              <p className="text-[#307FE2] font-['Inter:Medium',sans-serif] text-[12px]">
                {items.length} item type{items.length !== 1 ? 's' : ''} marked ({items.reduce((sum, i) => sum + i.count, 0)} total)
              </p>
            </div>
          )}
        </div>

        {/* ── Inspection Notes ── */}
        <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
          <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[15px] mb-1">
            Inspection Notes
          </h2>
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px] mb-3">
            Document site conditions, accessibility, power availability, or any observations (optional).
          </p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Example: Good visibility, existing 120V outlet available, pole requires 15ft ladder access..."
            rows={6}
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none resize-none"
            autoFocus
          />
        </div>

        {/* ── Save ── */}
        <button type="button" onClick={handleSave} disabled={saving}
          className="w-full bg-[#ff5c39] text-white rounded-[8px] px-4 py-4 flex items-center justify-center gap-2 font-['Inter:Medium',sans-serif] font-medium text-[16px] active:opacity-80 disabled:opacity-50">
          {saving ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
          {saving ? 'Saving…' : isEditing ? 'Update Inspection' : 'Save Inspection'}
        </button>

      </div>

      {/* Unsaved changes dialog */}
      <UnsavedChangesDialog
        isOpen={showPrompt}
        onSave={handleSaveDialog}
        onDiscard={handleDiscard}
        onCancel={handleCancel}
        showSaveButton={notes.trim().length > 0 || items.length > 0}
      />
    </div>
  );
}