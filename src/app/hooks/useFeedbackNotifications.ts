import { useEffect, useState } from 'react';
import { useApi } from '../api/client';
import type { FeedbackNotification } from '../api/client';

// Polls for FEEDBACK-section review events (a Builder bug ready for Peter's
// review, or revised after a change request) — same shape/pattern as
// useOdinVideoNotifications.ts, a separate small feed rendered as another
// additive section in the existing Notifications modal (AppHeader.tsx).
const POLL_INTERVAL_MS = 15_000;

export function useFeedbackNotifications(): {
  notifications: FeedbackNotification[];
  markRead: (id: string) => void;
} {
  const api = useApi();
  const [notifications, setNotifications] = useState<FeedbackNotification[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const result = await api.listFeedbackNotifications();
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
    api.markFeedbackNotificationRead(id).catch(() => {});
  }

  return { notifications, markRead };
}
