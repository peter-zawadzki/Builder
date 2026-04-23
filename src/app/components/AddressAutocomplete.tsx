import { useState, useRef, useEffect } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const SERVER = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;

interface Suggestion {
  placeId: string;
  description: string;
}

interface Props {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
  className?: string;
}

export function AddressAutocomplete({ value, onChange, placeholder, className }: Props) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Track whether the current value came from a Places selection (skip re-fetch)
  const isSelectedRef = useRef(false);

  // Sync incoming value changes (e.g. reset)
  useEffect(() => {
    if (!isSelectedRef.current) setInputValue(value);
    isSelectedRef.current = false;
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = async (input: string) => {
    if (input.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(
        `${SERVER}/places/autocomplete?input=${encodeURIComponent(input)}`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } }
      );
      const data = await resp.json();
      const list: Suggestion[] = data.suggestions || [];
      setSuggestions(list);
      setOpen(list.length > 0);
    } catch (err) {
      console.error('Address autocomplete error:', err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 350);
  };

  const handleSelect = async (suggestion: Suggestion) => {
    setOpen(false);
    setSuggestions([]);
    setLoading(true);
    try {
      const resp = await fetch(
        `${SERVER}/places/details?place_id=${encodeURIComponent(suggestion.placeId)}`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } }
      );
      const data = await resp.json();
      const address = data.address || suggestion.description;
      isSelectedRef.current = true;
      setInputValue(address);
      onChange(address);
    } catch {
      isSelectedRef.current = true;
      setInputValue(suggestion.description);
      onChange(suggestion.description);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setInputValue('');
    onChange('');
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder || 'Search resort name or enter address'}
          className={
            className ||
            "w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none pr-10"
          }
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <Loader2 size={15} className="animate-spin text-[#6a7282]" />}
          {!loading && inputValue && (
            <button type="button" onMouseDown={handleClear} className="p-0.5 active:opacity-60">
              <X size={15} className="text-[#6a7282]" />
            </button>
          )}
        </div>
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-[10px] border border-[rgba(0,0,0,0.12)] shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.placeId}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left active:bg-[#f3f3f5] transition-colors ${
                i < suggestions.length - 1 ? 'border-b border-[rgba(0,0,0,0.06)]' : ''
              }`}
            >
              <MapPin size={15} className="text-[#ff5c39] flex-shrink-0 mt-0.5" />
              <span className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] leading-snug">
                {s.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
