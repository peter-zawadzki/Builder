# Slack Daily Summary

Generates a daily digest of all Slack channel activity and posts it to a designated channel at 8pm.

## Features

- Summarizes all channels the bot is a member of
- Uses Claude AI to generate highlights, action items, and brief summaries
- Posts to #C0ASXAHQZ6C (configurable in code)

## Required Environment Variables

Set these in your Supabase project settings (Edge Functions > Secrets):

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Slack Bot User OAuth Token (starts with `xoxb-`) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |

## Slack Bot Permissions

Your Slack bot needs these OAuth scopes:
- `channels:history` - Read messages from public channels
- `channels:read` - List public channels
- `groups:history` - Read messages from private channels  
- `groups:read` - List private channels
- `users:read` - Get user names for messages
- `chat:write` - Post the summary message

## Endpoints

- `POST /slack-daily-summary/run` - Trigger the summary manually
- `GET /slack-daily-summary/health` - Health check

## Scheduling

The function is scheduled via pg_cron to run at 8pm daily.
See `supabase/migrations/20260503_slack_daily_summary_cron.sql`.

## Manual Testing

```bash
curl -X POST https://your-project.supabase.co/functions/v1/slack-daily-summary/run \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```
