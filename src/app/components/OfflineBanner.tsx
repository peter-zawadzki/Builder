import { useState, useEffect, useCallback } from 'react';
import { WifiOff, CloudOff, CheckCircle } from 'lucide-react';
import { count as queueCount } from '../utils/offlineQueue';

/**
 * Sticky banner shown at the top of every screen.
 *  • Offline:          dark blue  — "Offline – changes will sync when you reconnect."
 *  • Online + pending: amber      — "N changes waiting to sync…"
 *  • Just synced:      green      — brief "All changes synced" confirmation (auto-hides)
 *
 * The component polls queue size every 2 s so it updates as DataContext drains the queue.
 * DataContext broadcasts a custom 'queueflushed' event so the banner can react immediately.
 */
export function OfflineBanner() {
  const [isOnline,    setIsOnline]    = useState(navigator.onLine);
  const [pending,     setPending]     = useState(0);
  const [justSynced,  setJustSynced]  = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      setPending(await queueCount());
    } catch {
      setPending(0);
    }
  }, []);

  useEffect(() => {
    // Initial count
    refreshCount();

    const handleOnline  = () => { setIsOnline(true);  refreshCount(); };
    const handleOffline = () => { setIsOnline(false); refreshCount(); };

    // DataContext fires this when queue drains successfully
    const handleFlushed = (e: Event) => {
      const detail = (e as CustomEvent<{ count: number }>).detail;
      if (detail?.count > 0) {
        setPending(0);
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 4000);
      }
    };

    window.addEventListener('online',        handleOnline);
    window.addEventListener('offline',       handleOffline);
    window.addEventListener('queueflushed',  handleFlushed);

    // Poll every 2 s so the pending count stays fresh as the queue drains
    const interval = setInterval(refreshCount, 2000);

    return () => {
      window.removeEventListener('online',       handleOnline);
      window.removeEventListener('offline',      handleOffline);
      window.removeEventListener('queueflushed', handleFlushed);
      clearInterval(interval);
    };
  }, [refreshCount]);

  // ── Nothing to show ─────────────────────────────────────────────────────────
  if (isOnline && pending === 0 && !justSynced) return null;

  // ── Just synced ─────────────────────────────────────────────────────────────
  if (isOnline && pending === 0 && justSynced) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 px-4 py-2.5 bg-[#22c55e] text-white text-[13px] font-['Inter:Medium',sans-serif] animate-fade-in"
      >
        <CheckCircle size={14} className="shrink-0" />
        <span>All changes synced to cloud.</span>
      </div>
    );
  }

  // ── Offline ──────────────────────────────────────────────────────────────────
  if (!isOnline) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white text-[13px] font-['Inter:Regular',sans-serif]"
      >
        <WifiOff size={14} className="shrink-0" />
        <span className="flex-1">Offline — changes will sync when you reconnect.</span>
        {pending > 0 && (
          <span className="shrink-0 bg-white/20 rounded-full px-2 py-0.5 text-[11px] font-['Inter:Medium',sans-serif]">
            {pending} pending
          </span>
        )}
      </div>
    );
  }

  // ── Online but still draining the queue ─────────────────────────────────────
  return (
    <div
      role="status"
      className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-[13px] font-['Inter:Regular',sans-serif]"
    >
      <CloudOff size={14} className="shrink-0 animate-pulse" />
      <span className="flex-1">
        Syncing {pending} offline change{pending !== 1 ? 's' : ''}…
      </span>
    </div>
  );
}
