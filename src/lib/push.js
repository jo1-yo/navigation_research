/**
 * Reminder notifications.
 *
 * The point of these is compliance: participants train several times a day, and a
 * tap on a reminder should drop them straight into a session already signed in
 * (their participant code lives in localStorage, so it does).
 *
 * Two platform facts shape everything here:
 *
 *   1. On iOS, a web push is delivered ONLY to a site the participant has added to
 *      their home screen. Safari in an ordinary tab never receives one, and
 *      Notification.requestPermission() there is either unavailable or useless. So
 *      the flow has to detect "installed" (standalone display mode) and, when it is
 *      not, teach the participant to install first.
 *   2. The web cannot schedule a notification on the device — there is no shipped
 *      Notification Triggers API. Every reminder therefore has to be pushed from the
 *      server at the scheduled moment (see supabase/functions/send-reminders), which
 *      is why we capture a push subscription and store it.
 *
 * Until the server side is deployed, `showTestNotification` proves the whole
 * client chain works on a real phone without any backend at all.
 */
import supabase from './supabase.js';

const SUB_KEY = 'nla_push_subscription_v1';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// ─── capability detection ─────────────────────────────────

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Running as an installed app rather than inside a browser tab. */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  // navigator.standalone is the iOS-only signal; display-mode covers everyone else.
  return window.navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  // iPadOS reports as Macintosh, so touch points are what separate it from a Mac.
  return /iphone|ipod|ipad/i.test(navigator.userAgent) ||
    (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/** True when this browser can never deliver a push in its current mode. */
export function needsInstall() {
  return isIos() && !isStandalone();
}

export function permission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// ─── service worker ───────────────────────────────────────

let registrationPromise = null;

/**
 * Register the push-only service worker. Scoped to BASE_URL so it works both on
 * the dev server and under the /navigation_research/ base on GitHub Pages.
 */
export function ensureServiceWorker() {
  if (!pushSupported()) return Promise.resolve(null);
  if (!registrationPromise) {
    const base = import.meta.env.BASE_URL || '/';
    registrationPromise = navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch((err) => {
        console.warn('[push] Service worker registration failed:', err);
        registrationPromise = null;
        return null;
      });
  }
  return registrationPromise;
}

// ─── subscription ─────────────────────────────────────────

function urlBase64ToUint8Array(base64) {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function b64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(SUB_KEY) || 'null');
  } catch {
    return null;
  }
}

function store(row) {
  try {
    localStorage.setItem(SUB_KEY, JSON.stringify(row));
  } catch (err) {
    console.warn('[push] Could not persist the subscription locally:', err);
  }
}

/**
 * Send the subscription to the server. It is kept locally either way, with a
 * `synced` flag, so a subscription captured while the backend is down is not lost
 * — flushPendingSubscription() retries it on the next load.
 */
async function upload(row) {
  if (!supabase) return false;
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      participant_code: row.participant_code,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      timezone: row.timezone,
      user_agent: row.user_agent,
      revoked: false,
    },
    { onConflict: 'endpoint' },
  );
  if (error) {
    console.warn('[push] Could not store the subscription on the server:', error.message);
    return false;
  }
  return true;
}

/** Retry an upload that failed while the backend was unreachable. */
export async function flushPendingSubscription() {
  const row = readStored();
  if (!row || row.synced) return;
  if (await upload(row)) store({ ...row, synced: true });
}

function participantCode() {
  for (const key of ['nla_participant_ego', 'nla_participant_allo']) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const code = JSON.parse(raw)?.participantCode;
        if (code) return code;
      }
    } catch { /* corrupt entry — try the other key */ }
  }
  return null;
}

/**
 * Ask for permission and subscribe. MUST be called from a user gesture — iOS
 * rejects a permission prompt that is not tied to a tap.
 *
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function enableReminders() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (needsInstall()) return { ok: false, reason: 'needs-install' };

  const result = await Notification.requestPermission();
  if (result !== 'granted') return { ok: false, reason: result };

  const registration = await ensureServiceWorker();
  if (!registration) return { ok: false, reason: 'no-service-worker' };

  if (!VAPID_PUBLIC_KEY) {
    // Permission is granted and local notifications work, but without a server
    // key there is nothing to subscribe to. Say so rather than failing silently.
    return { ok: true, reason: 'no-vapid-key' };
  }

  let subscription;
  try {
    subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
  } catch (err) {
    console.warn('[push] subscribe() failed:', err);
    return { ok: false, reason: 'subscribe-failed' };
  }

  const row = {
    participant_code: participantCode(),
    endpoint: subscription.endpoint,
    p256dh: b64(subscription.getKey('p256dh')),
    auth: b64(subscription.getKey('auth')),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    user_agent: navigator.userAgent,
    synced: false,
  };
  const synced = await upload(row);
  store({ ...row, synced });

  return { ok: true, reason: synced ? 'subscribed' : 'subscribed-not-synced' };
}

/**
 * Fire a notification from the device itself — no server involved. This is how we
 * verify on a real iPhone that install + permission + service worker all work
 * before any of the server side exists.
 */
export async function showTestNotification() {
  const registration = await ensureServiceWorker();
  if (!registration) return false;
  await registration.showNotification('Test reminder', {
    body: 'If you can see this, reminders will work on this phone.',
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    tag: 'nla-test',
    data: { url: import.meta.env.BASE_URL },
  });
  return true;
}

export function subscriptionState() {
  const row = readStored();
  return {
    subscribed: !!row,
    synced: !!row?.synced,
    hasServerKey: !!VAPID_PUBLIC_KEY,
  };
}
