/**
 * Scheduled reminder sender.
 *
 * The web cannot schedule a notification on the device — there is no shipped
 * Notification Triggers API — so every reminder has to leave from here at the
 * right moment. pg_cron calls this function every 30 minutes (see cron.sql); the
 * function works out which participants are inside a reminder slot in THEIR OWN
 * timezone — one training reminder each morning, one test reminder each week —
 * and pushes only to those.
 *
 * Deploy:
 *   supabase secrets set VAPID_KEYS_JSON="$(cat vapid.json)" VAPID_SUBJECT=mailto:you@example.edu
 *   supabase functions deploy send-reminders
 *
 * NOTE: this has not been run against a live project yet — the study's Supabase
 * project was unreachable when it was written. Deploy it with `--no-verify-jwt`
 * off and hit it once by hand before wiring up the cron.
 */
import * as webpush from 'jsr:@negrel/webpush@^0.3';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// One reminder a day for training, one a week for the test — in each
// participant's own local time, which is why the schedule is evaluated per
// subscription rather than by the cron expression.
const TRAINING = { time: '09:00' };
// The weekly test reminder deliberately sits in the evening, far from the 09:00
// training one: a subscription carries a single last_sent_at, so two reminders a
// few hours apart would have the second suppressed by the gap rule below.
// weekday: 6 = Saturday, when the weekly test is due.
const TEST = { weekday: 6, time: '09:00' };

// How close to a slot the cron tick has to land. The cron runs every 30 minutes,
// so a 30-minute window means each slot fires exactly once.
const WINDOW_MINUTES = 30;

// Never push twice to the same device inside this many hours, whatever the cron
// does — a retried or double-scheduled tick must not spam a participant.
const MIN_GAP_HOURS = 6;

// A training reminder is pointless once the participant has trained today; a test
// reminder is pointless if they took the test within the last week.
const TEST_EVERY_DAYS = 7;

const MESSAGES = {
  training: [
    { title: 'Time for today\'s training', body: 'Twelve trials, about five minutes.' },
    { title: 'Training reminder', body: 'Stand somewhere you can turn around freely, then tap to start.' },
  ],
  test: [
    { title: 'Weekly test is ready', body: 'Same format as training, without feedback. About five minutes.' },
  ],
};

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** The participant's own wall clock, from the timezone captured at subscribe time. */
function localParts(timezone: string, now: Date) {
  const tz = timezone || 'UTC';
  let time: string, date: string;
  try {
    time = now.toLocaleTimeString('en-GB', { timeZone: tz, hour12: false });
    date = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  } catch {
    time = now.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false });
    date = now.toLocaleDateString('en-CA', { timeZone: 'UTC' });
  }
  const [h, m] = time.split(':').map(Number);
  // Weekday in the participant's zone, not the server's.
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { minutes: h * 60 + m, date, weekday };
}

function atSlot(minutes: number, time: string): boolean {
  const delta = minutes - minutesOfDay(time);
  return delta >= 0 && delta < WINDOW_MINUTES;
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    // Service role: this function must read endpoints, which RLS hides from anon.
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const dryRun = new URL(req.url).searchParams.get('dry') === '1';
  const now = new Date();

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, participant_code, endpoint, p256dh, auth, timezone, last_sent_at')
    .eq('revoked', false);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Who has already done enough today? One query, then matched per participant in
  // their own local day rather than UTC.
  const { data: participants } = await supabase.from('participants').select('id, participant_code');
  const idByCode = new Map((participants ?? []).map((p) => [p.participant_code, p.id]));
  const { data: sessions } = await supabase
    .from('sessions')
    .select('participant_id, session_type, timestamp_start, timestamp_end')
    .not('timestamp_end', 'is', null)
    // Far enough back to answer both "trained today?" and "tested this week?".
    .gte('timestamp_start', new Date(now.getTime() - (TEST_EVERY_DAYS + 1) * 86400_000).toISOString());

  const appServer = await webpush.ApplicationServer.new({
    contactInformation: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.edu',
    vapidKeys: await webpush.importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS_JSON')!)),
  });

  const sent: { id: string; kind: string }[] = [];
  const skipped: Record<string, number> = {};
  const bump = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };

  for (const sub of subs ?? []) {
    const { minutes, date, weekday } = localParts(sub.timezone, now);

    // Which reminder, if any, is due right now for this participant?
    let kind: 'training' | 'test' | null = null;
    if (weekday === TEST.weekday && atSlot(minutes, TEST.time)) kind = 'test';
    else if (atSlot(minutes, TRAINING.time)) kind = 'training';
    if (!kind) { bump('outside-slot'); continue; }

    if (sub.last_sent_at &&
        now.getTime() - new Date(sub.last_sent_at).getTime() < MIN_GAP_HOURS * 3600 * 1000) {
      bump('too-soon'); continue;
    }

    const pid = sub.participant_code ? idByCode.get(sub.participant_code) : null;
    if (pid) {
      const mine = (sessions ?? []).filter((s) => s.participant_id === pid);
      if (kind === 'training') {
        // Already trained today, in their own calendar day.
        const today = mine.some((s) =>
          s.session_type === 'training' &&
          localParts(sub.timezone, new Date(s.timestamp_start)).date === date);
        if (today) { bump('trained-today'); continue; }
      } else {
        const cutoff = now.getTime() - TEST_EVERY_DAYS * 86400_000;
        const recent = mine.some((s) =>
          s.session_type === 'testing' && new Date(s.timestamp_start).getTime() >= cutoff);
        if (recent) { bump('tested-this-week'); continue; }
      }
    }

    if (dryRun) { sent.push({ id: sub.id, kind }); continue; }

    const pool = MESSAGES[kind];
    const message = pool[Math.floor(Math.random() * pool.length)];
    try {
      const subscriber = appServer.subscribe({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      });
      await subscriber.pushTextMessage(
        JSON.stringify({ ...message, tag: `nla-${kind}`, url: './' }),
        {},
      );
      sent.push({ id: sub.id, kind });
      await supabase
        .from('push_subscriptions')
        .update({ last_sent_at: now.toISOString(), updated_at: now.toISOString() })
        .eq('id', sub.id);
    } catch (err) {
      // 404/410 mean the participant deleted the app or the subscription expired.
      // Mark it rather than deleting, so the drop-out is visible in the data.
      const status = (err as { status?: number })?.status;
      if (status === 404 || status === 410) {
        bump('revoked');
        await supabase
          .from('push_subscriptions')
          .update({ revoked: true, updated_at: now.toISOString() })
          .eq('id', sub.id);
      } else {
        bump('send-failed');
        console.error('[send-reminders] push failed', sub.id, err);
      }
    }
  }

  return Response.json({
    now: now.toISOString(),
    dryRun,
    sent: sent.length,
    training: sent.filter((s) => s.kind === 'training').length,
    test: sent.filter((s) => s.kind === 'test').length,
    skipped,
  });
});
