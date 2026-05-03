import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUMMARY_CHANNEL_ID = "C0ASXAHQZ6C";

interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
}

interface SlackMessage {
  user?: string;
  text: string;
  ts: string;
}

async function fetchSlackChannels(): Promise<SlackChannel[]> {
  const response = await fetch("https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100", {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
  return data.channels.filter((ch: SlackChannel) => ch.is_member);
}

async function fetchChannelMessages(channelId: string): Promise<SlackMessage[]> {
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
  const response = await fetch(
    `https://slack.com/api/conversations.history?channel=${channelId}&oldest=${oneDayAgo}&limit=100`,
    { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
  );
  const data = await response.json();
  if (!data.ok) {
    console.error(`Error fetching messages for ${channelId}: ${data.error}`);
    return [];
  }
  return data.messages || [];
}

async function generateSummary(channelData: Record<string, { name: string; messages: SlackMessage[] }>): Promise<string> {
  const channelSummaries = Object.entries(channelData)
    .filter(([_, data]) => data.messages.length > 0)
    .map(([_, data]) => `### #${data.name}\n${data.messages.map(m => m.text).join("\n")}`)
    .join("\n\n");

  if (!channelSummaries) {
    return "No significant activity across channels today.";
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are a helpful assistant that creates daily Slack digests. Analyze the following Slack channel messages from today and create a concise summary.

Format your response as:
## :sunrise: Daily Slack Summary - ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}

### :fire: Highlights
- [Key wins, announcements, or important updates - bullet points]

### :dart: Action Items
- [Tasks needing attention with @mentions if known]

### :speech_balloon: Channel Activity
[One line per active channel with the key topic/update]

---
Keep it concise and actionable. Focus on what matters.

CHANNEL MESSAGES:
${channelSummaries}`,
        },
      ],
    }),
  });

  const result = await response.json();
  if (result.error) throw new Error(`Anthropic API error: ${result.error.message}`);
  return result.content[0].text;
}

async function postToSlack(channelId: string, text: string): Promise<void> {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, text, mrkdwn: true }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`Failed to post message: ${data.error}`);
}

serve(async (req) => {
  try {
    if (!SLACK_BOT_TOKEN || !ANTHROPIC_API_KEY) {
      throw new Error("Missing required environment variables: SLACK_BOT_TOKEN or ANTHROPIC_API_KEY");
    }

    console.log("Starting daily Slack summary...");

    const channels = await fetchSlackChannels();
    console.log(`Found ${channels.length} channels to summarize`);

    const channelData: Record<string, { name: string; messages: SlackMessage[] }> = {};
    for (const channel of channels) {
      const messages = await fetchChannelMessages(channel.id);
      if (messages.length > 0) {
        channelData[channel.id] = { name: channel.name, messages };
      }
    }

    const activeChannels = Object.keys(channelData).length;
    console.log(`${activeChannels} channels had activity today`);

    const summary = await generateSummary(channelData);
    await postToSlack(SUMMARY_CHANNEL_ID, summary);

    console.log("Daily summary posted successfully!");

    return new Response(JSON.stringify({ success: true, channelsProcessed: channels.length, activeChannels }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating daily summary:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
