// Incremental fetch of new message ids via Gmail's History API. A mailbox
// with no stored cursor is deliberately NOT backfilled — it just baselines
// to the mailbox's current historyId with zero messages processed, so the
// first-ever sync for a new employee doesn't ingest years of old mail.
import type { gmail_v1 } from "googleapis";

export interface HistoryFetchResult {
  messageIds: string[];
  newHistoryId: string;
}

async function baseline(gmail: gmail_v1.Gmail): Promise<HistoryFetchResult> {
  const profile = await gmail.users.getProfile({ userId: "me" });
  return { messageIds: [], newHistoryId: String(profile.data.historyId) };
}

export async function fetchNewMessageIds(gmail: gmail_v1.Gmail, lastHistoryId: string | null): Promise<HistoryFetchResult> {
  if (!lastHistoryId) return baseline(gmail);

  const messageIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = lastHistoryId;

  try {
    do {
      const res = await gmail.users.history.list({
        userId: "me",
        startHistoryId: lastHistoryId,
        historyTypes: ["messageAdded"],
        pageToken,
      });
      for (const record of res.data.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          if (added.message?.id) messageIds.add(added.message.id);
        }
      }
      if (res.data.historyId) latestHistoryId = res.data.historyId;
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (e: any) {
    // Gmail's history retention is roughly a week; an expired startHistoryId
    // 404s. We don't backfill, so just re-baseline and note the gap.
    if (e?.code === 404 || e?.response?.status === 404) {
      console.warn("[gmail-sync] historyId too old, re-baselining (gap in coverage, not backfilled)");
      return baseline(gmail);
    }
    throw e;
  }

  return { messageIds: [...messageIds], newHistoryId: latestHistoryId };
}
