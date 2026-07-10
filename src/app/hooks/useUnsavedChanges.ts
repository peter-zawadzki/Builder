import { useEffect, useRef, useState, useCallback } from 'react';
import { useBlocker } from 'react-router';

interface UseUnsavedChangesOptions {
  when: boolean; // Block navigation when true (i.e., when there are unsaved changes)
  message?: string;
  onSave?: () => void | Promise<void>;
}

/**
 * Hook to prevent navigation when there are unsaved changes.
 * Shows a confirmation dialog with options to save, discard, or cancel.
 */
export function useUnsavedChanges({ when, message, onSave }: UseUnsavedChangesOptions) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

  // Latches true once a save completes, so the resulting `navigate()` is never
  // blocked — without this, a direct Save-button click that does
  // `setHasUnsavedChanges(false)` immediately followed by `navigate()` (or
  // even after an `await`) can still get blocked: React batches the state
  // update, so the blocker (registered on the last completed render) still
  // sees the old `when`. A ref sidesteps that entirely since `.current` is
  // read fresh at call time regardless of which render's closure holds it.
  // Deliberately NOT re-synced from `when` on every render — once a save
  // pushes it true, only the next mount (a fresh instance) resets it.
  const savedRef = useRef(false);

  // Block React Router navigation
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !savedRef.current && when && currentLocation.pathname !== nextLocation.pathname
  );

  // Call as soon as a save starts (or right before navigating, for a
  // synchronous save) so nothing in between can trip the blocker.
  const markSaved = useCallback(() => {
    savedRef.current = true;
  }, []);

  // Block browser navigation (refresh, close tab, etc.)
  useEffect(() => {
    if (!when) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message || 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [when, message]);

  // Show prompt when navigation is blocked
  useEffect(() => {
    if (blocker.state === 'blocked') {
      setShowPrompt(true);
      setPendingNavigation(() => blocker.proceed);
    }
  }, [blocker]);

  // Reset blocker on unmount so the next route can register its own
  useEffect(() => {
    return () => {
      if (blocker.state === 'blocked') {
        blocker.reset?.();
      }
    };
  }, [blocker]);

  const handleSave = useCallback(async () => {
    if (onSave) {
      await onSave();
    }
    setShowPrompt(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  }, [onSave, pendingNavigation]);

  const handleDiscard = useCallback(() => {
    setShowPrompt(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  }, [pendingNavigation]);

  const handleCancel = useCallback(() => {
    setShowPrompt(false);
    setPendingNavigation(null);
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  }, [blocker]);

  return {
    showPrompt,
    handleSave,
    handleDiscard,
    handleCancel,
    markSaved,
  };
}
