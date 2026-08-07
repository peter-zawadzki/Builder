import { useEffect, useState } from 'react';
import { useApi } from '../api/client';
import type { OdinNotification } from '../api/client';

// Polls for "your video is ready/failed" system events — a separate, small
// feed from the app's existing assignee-task Notifications bell
// (getMyNotifications in DataContext.tsx), which is structurally about
// entity assignment and has no room for a system event like this. Rendered
// as an additive second section in the same Notifications modal
// (AppHeader.tsx) rather than a new UI surface.
const POLL_INTERVAL_MS = 15_000;

export function useOdinVideoNotifications(): {
  notifications: OdinNotification[];
  markRead: (id: string) => void;
} {
  const api = useApi();
  const [notifications, setNotifications] = useState<OdinNotification[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const result = await api.listOdinNotifications();
        if (!cancelled) setNotifications(result.notifications);
      } catch {
        // Transient network hiccup — next poll retries; nothing to show the user for this.
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
    api.markOdinNotificationRead(id).catch(() => {});
  }

  return { notifications, markRead };
}
