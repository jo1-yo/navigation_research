-- ============================================================
-- Web push reminders. Run this in the project's SQL editor once,
-- alongside schema.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Not a foreign key on purpose: a participant may subscribe from the installed
  -- app before their first session row exists, and a reminder is still worth
  -- sending to a device whose participant row was later deleted for a re-run.
  participant_code  text,
  endpoint          text UNIQUE NOT NULL,
  p256dh            text NOT NULL,
  auth              text NOT NULL,
  timezone          text,
  user_agent        text,
  -- Set when the push service reports the subscription is gone (404/410), so a
  -- dead device stops being retried without losing the record of it.
  revoked           boolean NOT NULL DEFAULT false,
  last_sent_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_active_idx
  ON push_subscriptions (revoked, last_sent_at);

-- The client upserts on endpoint, so it needs INSERT and UPDATE. It deliberately
-- gets NO SELECT: endpoints are per-device secrets, and anyone who can read them
-- can push to that device. supabase-js only returns rows when .select() is
-- chained, which the client never does.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_anon_insert" ON push_subscriptions;
CREATE POLICY "allow_anon_insert" ON push_subscriptions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "allow_anon_update" ON push_subscriptions;
CREATE POLICY "allow_anon_update" ON push_subscriptions FOR UPDATE USING (true) WITH CHECK (true);
