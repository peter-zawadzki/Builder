import { useEffect, useState, useCallback } from 'react';
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

  // Block React Router navigation
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname
  );

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
  };
}
