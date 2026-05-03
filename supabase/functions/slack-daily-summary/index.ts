import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import Anthropic from "npm:@anthropic-ai/sdk";

const app = new Hono();

app.use("/*", cors({ origin: "*" }));

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const TARGET_CHANNEL = "C0ASXAHQZ6C";

interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
  is_archived: boolean;
}

interface SlackMessage {
  type: string;
  user?: string;
  text: string;
  ts: string;
}

async function slackFetch(endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`https://slack.com/api/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  return resp.json();
}

async function postSlackMessage(channel: string, text: string, blocks?: unknown[]) {
  const resp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text, blocks }),
  });
  return resp.json();
}

async function getChannels(): Promise<SlackChannel[]> {
  const result = await slackFetch("conversations.list", {
    types: "public_channel,private_channel",
    exclude_archived: "true",
    limit: "200",
  });
  return result.channels || [];
}

async function getChannelMessages(channelId: string, oldest: string): Promise<SlackMessage[]> {
  try {
    const result = await slackFetch("conversations.history", {
      channel: channelId,
      oldest,
      limit: "100",
    });
    return result.messages || [];
  } catch {
    return [];
  }
}

async function getUserName(userId: string): Promise<string> {
  try {
    const result = await slackFetch("users.info", { user: userId });
    return result.user?.real_name || result.user?.name || userId;
  } catch {
    return userId;
  }
}

function getTodayStart(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  return (start.getTime() / 1000).toString();
}

async function generateSummary(channelData: { name: string; messages: string[] }[]): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const channelSummaries = channelData
    .filter(c => c.messages.length > 0)
    .map(c => `## #${c.name}\n${c.messages.join("\n")}`)
    .join("\n\n");

  if (!channelSummaries) {
    return "No significant activity across channels today.";
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are summarizing today's Slack activity for a team. Create a concise evening digest with:

1. **Highlights** - Key updates, wins, and important announcements (3-5 bullets)
2. **Action Items** - Tasks that need attention, pending decisions, or follow-ups (bulleted list with owner if mentioned)
3. **Brief Channel Summaries** - One line per active channel

Keep it scannable and actionable. Use Slack formatting (bold with *text*, bullets with •).

Here's today's channel activity:

${channelSummaries}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text || "Unable to generate summary.";
}

app.post("/slack-daily-summary/run", async (c) => {
  if (!SLACK_BOT_TOKEN) {
    return c.json({ error: "SLACK_BOT_TOKEN not configured" }, 500);
  }
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
  }

  try {
    const channels = await getChannels();
    const memberChannels = channels.filter((ch) => ch.is_member && !ch.is_archived);
    const todayStart = getTodayStart();

    const userCache: Record<string, string> = {};
    const channelData: { name: string; messages: string[] }[] = [];

    for (const channel of memberChannels) {
      const messages = await getChannelMessages(channel.id, todayStart);
      const formattedMessages: string[] = [];

      for (const msg of messages) {
        if (!msg.text || msg.type !== "message") continue;

        let userName = "Unknown";
        if (msg.user) {
          if (!userCache[msg.user]) {
            userCache[msg.user] = await getUserName(msg.user);
          }
          userName = userCache[msg.user];
        }

        formattedMessages.push(`- ${userName}: ${msg.text}`);
      }

      channelData.push({ name: channel.name, messages: formattedMessages });
    }

    const summary = await generateSummary(channelData);
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    const messageText = `*:newspaper: Daily Slack Digest - ${today}*\n\n${summary}`;

    const postResult = await postSlackMessage(TARGET_CHANNEL, messageText);

    if (!postResult.ok) {
      console.error("Failed to post message:", postResult.error);
      return c.json({ error: `Failed to post: ${postResult.error}` }, 500);
    }

    return c.json({
      success: true,
      channelsProcessed: memberChannels.length,
      postedTo: TARGET_CHANNEL,
    });
  } catch (error) {
    console.error("Error generating daily summary:", error);
    return c.json({ error: `Failed to generate summary: ${error}` }, 500);
  }
});

app.get("/slack-daily-summary/health", (c) => {
  return c.json({ status: "ok", targetChannel: TARGET_CHANNEL });
});

Deno.serve(app.fetch);
