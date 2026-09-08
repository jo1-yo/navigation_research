-- Schedule the reminder sender. Run once in the SQL editor, AFTER deploying the
-- send-reminders function and confirming a hand-triggered call works.
--
-- The function itself decides who is due, in each participant's own timezone, so
-- the schedule here is deliberately dumb: tick every 30 minutes.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace <PROJECT-REF> and set the anon/service key in Vault first:
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');

select cron.unschedule('nla-send-reminders') where exists (
  select 1 from cron.job where jobname = 'nla-send-reminders'
);

select cron.schedule(
  'nla-send-reminders',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
