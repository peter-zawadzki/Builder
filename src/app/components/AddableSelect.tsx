import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useData } from '../context/DataContext';

interface AddableSelectProps {
  /** KV options key, e.g. "camera:manufacturers" */
  optionKey: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Built-in options always shown (merged & deduped with server-stored ones) */
  defaultOptions?: string[];
}

/**
 * A <select> that includes an inline "+ Add New…" option.
 * New values are persisted to the global options store (server + localStorage).
 */
export function AddableSelect({
  optionKey,
  value,
  onChange,
  placeholder = 'Select option',
  disabled = false,
  className,
  defaultOptions = [],
}: AddableSelectProps) {
  const { getOptions, addOption } = useData();
  const [showAdd, setShowAdd] = useState(false);
  const [newValue, setNewValue] = useState('');

  const storedOptions = getOptions(optionKey);
  // Merge defaults with stored options, deduped and sorted
  const options = [...new Set([...defaultOptions, ...storedOptions])].sort((a, b) =>
    a.localeCompare(b)
  );

  const baseClass =
    className ??
    "w-full bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px] disabled:opacity-50";

  const handleConfirm = () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    addOption(optionKey, trimmed);
    onChange(trimmed);
    setNewValue('');
    setShowAdd(false);
  };

  const handleCancel = () => {
    setNewValue('');
    setShowAdd(false);
  };

  if (showAdd) {
    return (
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
            if (e.key === 'Escape') handleCancel();
          }}
          autoFocus
          placeholder="Type name, press Enter"
          className="flex-1 bg-[#f3f3f5] rounded-[8px] px-4 py-4 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]"
        />
        <button
          type="button"
          onClick={handleConfirm}
          className="w-14 h-[54px] bg-[#307FE2] text-white rounded-[8px] flex items-center justify-center active:opacity-70 shrink-0"
        >
          <Check size={20} />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="w-14 h-[54px] bg-[#f3f3f5] text-[#6a7282] rounded-[8px] flex items-center justify-center active:opacity-70 shrink-0"
        >
          <X size={20} />
        </button>
      </div>
    );
  }

  return (
    <select
      value={value || ''}
      onChange={e => {
        if (e.target.value === '__add_new__') {
          setShowAdd(true);
        } else {
          onChange(e.target.value);
        }
      }}
      disabled={disabled}
      className={baseClass}
    >
      <option value="">{placeholder}</option>
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
      <option value="__add_new__">＋ Add New…</option>
    </select>
  );
}