import { useEffect, useState } from 'react';
import { C, T } from './ui/theme.js';
import { Sheet, Button, Hint, Glyph } from './ui/kit.jsx';
import {
  pushSupported, needsInstall, isIos, permission,
  enableReminders, showTestNotification, subscriptionState, ensureServiceWorker,
  flushPendingSubscription,
} from './lib/push.js';

const DISMISS_KEY = 'nla_reminders_dismissed_v1';

/**
 * The one place that asks a participant to turn on training reminders.
 *
 * Mounted once in App.jsx rather than inside either experiment version: neither
 * version file grows a copy, and this component never has to know which screen is
 * showing. It opens on an event instead of a timer, so it can never appear over a
 * screen the participant is in the middle of — the home screen offers it once per
 * launch, and the Reminders row in Profile opens it on demand.
 *
 * On iPhone the sheet's whole job is the install step: a web push reaches a
 * home-screen app and never a Safari tab, so until they install there is nothing
 * to ask permission for.
 */
export default function ReminderSetup() {
  const forced = new URLSearchParams(window.location.search).get('reminders') === '1';
  const [open, setOpen] = useState(() => forced && pushSupported());
  const [perm, setPerm] = useState(permission());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [sub, setSub] = useState(subscriptionState());

  // Register the worker on every load — a push needs it to exist — and retry any
  // subscription that could not reach the server earlier.
  useEffect(() => {
    if (!pushSupported()) return;
    ensureServiceWorker().then(() => flushPendingSubscription());
  }, []);

  useEffect(() => {
    if (!pushSupported()) return undefined;
    const offer = () => {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
      if (permission() === 'granted' && subscriptionState().subscribed) return;
      setOpen(true);
    };
    const openNow = () => { setPerm(permission()); setSub(subscriptionState()); setOpen(true); };
    window.addEventListener('nla:offer-reminders', offer);
    window.addEventListener('nla:open-reminders', openNow);
    return () => {
      window.removeEventListener('nla:offer-reminders', offer);
      window.removeEventListener('nla:open-reminders', openNow);
    };
  }, []);

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
    if (res.ok && res.reason === 'no-vapid-key') setNote('Allowed. Scheduled reminders begin once the server is set up.');
    else if (res.ok && res.reason === 'subscribed-not-synced') setNote('Allowed, and saved on this device. It will register with the server automatically.');
    else if (res.ok) setNote('Reminders are on.');
    else if (res.reason === 'denied') setNote('Notifications are off for this app. Settings › Notifications › NLA to allow them.');
    else if (res.reason === 'needs-install') setNote('Add the app to your home screen first, then open it from there.');
    else setNote(`Could not turn reminders on (${res.reason}).`);
  };

  const install = needsInstall();
  const granted = perm === 'granted';

  return (
    <Sheet onClose={dismiss}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ color: C.accent }}><Glyph name="bell" size={28} /></div>

        <div>
          <h3 style={{ ...T.title3, margin: 0 }}>
            {granted ? 'Reminders are on' : install ? 'Add NLA to your home screen' : 'Training reminders'}
          </h3>
          <p style={{ ...T.subhead, color: C.secondary, margin: '4px 0 0' }}>
            {granted
              ? 'A reminder each morning for training, and one on Saturday for the weekly test.'
              : install
                ? 'On iPhone, reminders only work from the home-screen app. Two taps:'
                : 'One each morning for training, one on Saturday for the weekly test. Tapping it opens the app already signed in.'}
          </p>
        </div>

        {install && (
          <ol style={{ ...T.subhead, color: C.label, margin: 0, paddingLeft: 22, lineHeight: 1.9 }}>
            <li>Tap <strong>Share</strong> at the bottom of Safari.</li>
            <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
            <li>Open <strong>NLA</strong> from your home screen.</li>
          </ol>
        )}

        {note && <Hint tint={/could not|off for this app|first/i.test(note) ? C.red : C.green}>{note}</Hint>}

        {!install && !granted && (
          <Button onClick={onEnable} disabled={busy}>
            {busy ? 'One moment…' : 'Turn on reminders'}
          </Button>
        )}

        {granted && (
          <Button
            variant="tinted"
            onClick={async () => setNote((await showTestNotification())
              ? 'Sent. Leave the app to see it appear.'
              : 'Could not send a test reminder.')}
          >
            Send a test reminder
          </Button>
        )}

        <Button variant="plain" onClick={dismiss}>{install || granted ? 'Done' : 'Not now'}</Button>

        {install && (
          <Hint>The trials work in Safari too — you just will not get reminders.</Hint>
        )}
        {!install && !isIos() && (
          <Hint>{sub.subscribed && !sub.synced ? 'Saved on this device; it will register with the server automatically.' : 'Installing the app to your home screen makes reminders more reliable.'}</Hint>
        )}
      </div>
    </Sheet>
  );
}
