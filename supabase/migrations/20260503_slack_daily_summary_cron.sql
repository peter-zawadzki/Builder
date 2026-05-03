-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily Slack summary at 8pm (20:00) in the database timezone
-- Adjust the timezone in the cron expression or use pg_cron's timezone support as needed
SELECT cron.schedule(
  'slack-daily-summary',           -- job name
  '0 20 * * *',                    -- 8pm daily (cron expression)
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/slack-daily-summary/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To verify the job was created:
-- SELECT * FROM cron.job WHERE jobname = 'slack-daily-summary';

-- To manually trigger for testing:
-- SELECT net.http_post(
--   url := 'YOUR_SUPABASE_URL/functions/v1/slack-daily-summary/run',
--   headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
--   body := '{}'::jsonb
-- );

-- To delete the job:
-- SELECT cron.unschedule('slack-daily-summary');
