import { useEffect, useRef } from 'react';

// No generic debounce utility exists elsewhere in this codebase (the one
// other manual debounce, in AddressAutocomplete.tsx, is a one-off inline
// setTimeout) — this is for frequent updates (typing in a properties panel)
// where saving on every keystroke would be wasteful; discrete actions
// (object placement/deletion, toggles, drag-end) should keep saving
// immediately via the existing API-call-per-action pattern instead.
export function useDebouncedCallback<A extends unknown[]>(callback: (...args: A) => void, delayMs: number) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return (...args: A) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => callbackRef.current(...args), delayMs);
  };
}
