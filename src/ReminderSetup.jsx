import { useEffect, useState } from 'react';
import {
  pushSupported, needsInstall, isIos, permission,
  enableReminders, showTestNotification, subscriptionState, ensureServiceWorker,
  flushPendingSubscription,
} from './lib/push.js';

const DISMISS_KEY = 'nla_reminders_dismissed_v1';

/**
 * The one place that asks a participant to turn on training reminders.
 *
 * Mounted once in App.jsx rather than inside either experiment version, for two
 * reasons: neither 1000-line file grows a third copy of the same UI, and mount
 * time is the only moment when no trial can possibly be in progress — a sheet
 * that appeared mid-trial would corrupt a reaction time.
 *
 * On iPhone the sheet's whole job is the install step: a web push is delivered
 * only to a home-screen app, so until the participant installs, there is nothing
 * to ask permission for.
 *
 * Add ?reminders=1 to the URL to force it open again after dismissing.
 */
export default function ReminderSetup() {
  const forced = new URLSearchParams(window.location.search).get('reminders') === '1';
  // ?reminders=1 opens it on the first render rather than through an effect, so
  // there is no cascading setState on mount.
  const [open, setOpen] = useState(() => forced && pushSupported());
  const [perm, setPerm] = useState(permission());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [sub, setSub] = useState(subscriptionState());

  // Register the worker on every load (it is also what a push needs to exist at
  // all) and retry any subscription that could not reach the server earlier.
  useEffect(() => {
    if (!pushSupported()) return;
    ensureServiceWorker().then(() => flushPendingSubscription());
  }, []);

  useEffect(() => {
    if (forced || !pushSupported()) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    if (permission() === 'granted' && subscriptionState().subscribed) return;
    // A beat after load, so it does not fight the first paint.
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [forced]);

  if (!open) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
    setOpen(false);
  };

  const onEnable = async () => {
    setBusy(true);
    setNote(null);
    const res = await enableReminders();
    setPerm(permission());
    setSub(subscriptionState());
    setBusy(false);
    if (res.ok && res.reason === 'no-vapid-key') {
      setNote('Permission granted. Scheduled reminders start once the server key is deployed.');
    } else if (res.ok && res.reason === 'subscribed-not-synced') {
      setNote('Permission granted. Saved on this device — it will register with the server when it is reachable.');
    } else if (res.ok) {
      setNote('Reminders are on.');
    } else if (res.reason === 'denied') {
      setNote('Notifications are blocked for this app. Settings › Notifications › NLA to allow them.');
    } else if (res.reason === 'needs-install') {
      setNote('Add the app to your home screen first, then open it from there.');
    } else {
      setNote(`Could not turn reminders on (${res.reason}).`);
    }
  };

  const install = needsInstall();
  const granted = perm === 'granted';

  return (
    <div style={S.scrim} onClick={dismiss}>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={S.grabber} />
        <h3 style={S.title}>{granted ? 'Reminders are on' : 'Get reminded to train'}</h3>

        {install ? (
          <>
            <p style={S.body}>
              On iPhone, reminders only work from the home-screen app. It takes two taps:
            </p>
            <ol style={S.steps}>
              <li>Tap the <strong>Share</strong> button at the bottom of Safari.</li>
              <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
              <li>Open <strong>NLA</strong> from your home screen and turn reminders on there.</li>
            </ol>
            <p style={{ ...S.body, color: '#888', fontSize: 13 }}>
              The app works in Safari too — you just will not get reminders.
            </p>
          </>
        ) : granted ? (
          <>
            <p style={S.body}>
              {sub.subscribed
                ? 'This device is registered for training reminders.'
                : 'Notifications are allowed on this device.'}
              {sub.subscribed && !sub.synced && ' It has not reached the server yet — it will retry automatically.'}
            </p>
            <button
              style={S.secondary}
              onClick={async () => { setNote((await showTestNotification()) ? 'Test reminder sent.' : 'Could not send a test reminder.'); }}
            >
              Send a test reminder
            </button>
          </>
        ) : (
          <>
            <p style={S.body}>
              You will train a few times a day. Turn on reminders and a tap on the
              notification opens the app right where you left off — no signing in.
            </p>
            <button style={S.primary} disabled={busy} onClick={onEnable}>
              {busy ? 'Just a moment…' : 'Turn on reminders'}
            </button>
          </>
        )}

        {note && <p style={S.note}>{note}</p>}

        <button style={S.ghost} onClick={dismiss}>
          {install || granted ? 'Done' : 'Not now'}
        </button>

        {!isIos() && !install && (
          <p style={{ ...S.body, color: '#aaa', fontSize: 12, marginTop: 4 }}>
            Installing this app to your home screen makes reminders more reliable.
          </p>
        )}
      </div>
    </div>
  );
}

const S = {
  scrim: {
    position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    fontFamily: '"DM Sans", -apple-system, sans-serif',
  },
  sheet: {
    background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 500,
    padding: '20px 24px calc(env(safe-area-inset-bottom, 0px) + 24px)',
    maxHeight: '86dvh', overflowY: 'auto',
  },
  grabber: { width: 40, height: 4, borderRadius: 2, background: '#ddd', margin: '0 auto 16px' },
  title: { fontSize: 19, fontWeight: 600, marginBottom: 10, color: '#1a1a2e' },
  body: { fontSize: 15, lineHeight: 1.6, color: '#444', marginBottom: 14 },
  steps: { fontSize: 15, lineHeight: 1.9, color: '#444', margin: '0 0 14px 20px' },
  primary: {
    width: '100%', padding: 16, background: '#E67E22', color: 'white', border: 'none',
    borderRadius: 10, fontSize: 16, fontWeight: 500, cursor: 'pointer',
  },
  secondary: {
    width: '100%', padding: 14, background: 'white', color: '#1a1a2e',
    border: '1px solid #ddd', borderRadius: 10, fontSize: 15, cursor: 'pointer',
  },
  ghost: {
    width: '100%', padding: 13, background: 'transparent', color: '#888',
    border: 'none', borderRadius: 10, fontSize: 15, cursor: 'pointer', marginTop: 10,
  },
  note: {
    fontSize: 13, lineHeight: 1.5, color: '#2e7d32', background: '#f1f8f2',
    border: '1px solid #cfe6d3', borderRadius: 8, padding: '10px 12px', marginTop: 12,
  },
};
