import { useEffect, useState } from 'react';
import { useApi } from '../api/client';
import type { NoteNotification } from '../api/client';

// Polls for "someone replied to your note" events — same shape/pattern as
// useFeedbackNotifications.ts/useOdinVideoNotifications.ts, another
// additive section in the existing Notifications modal (AppHeader.tsx).
const POLL_INTERVAL_MS = 15_000;

export function useNoteNotifications(): {
  notifications: NoteNotification[];
  markRead: (id: string) => void;
} {
  const api = useApi();
  const [notifications, setNotifications] = useState<NoteNotification[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const result = await api.listNoteNotifications();
        if (!cancelled) setNotifications(result.notifications);
      } catch {
        // Transient network hiccup — next poll retries.
      }
    }
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [api]);

  function markRead(id: string) {
    setNotifications(ns => ns.filter(n => n.id !== id));
    api.markNoteNotificationRead(id).catch(() => {});
  }

  return { notifications, markRead };
}
