/**
 * The participant's own name and avatar colour.
 *
 * This is personalisation, not research data: it stays on the device rather than
 * in the participants table, so nothing here can affect an analysis, and the
 * participant code — which IS the research identity — is never replaced by it,
 * only displayed alongside.
 *
 * (If it should follow a participant across devices, `participants` needs a
 * display_name and avatar column plus an UPDATE policy for anon; the table has
 * INSERT and SELECT only today.)
 */

const KEY = 'nla_profile_v1';

export const AVATAR_COLORS = {
  water: ['#8BDCFF', '#1E8FE0'],
  teal: ['#84E3D8', '#0FA595'],
  green: ['#A8E886', '#2FA84F'],
  sun: ['#FFD68A', '#E6892A'],
  blossom: ['#FFB6D2', '#E0508F'],
  violet: ['#CDBBFF', '#7A4BE0'],
  coral: ['#FFB4A6', '#E0432C'],
  slate: ['#CBD4DC', '#556571'],
};

export const DEFAULT_AVATAR = 'water';

const listeners = new Set();

export function readProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : null;
    return {
      displayName: typeof p?.displayName === 'string' ? p.displayName : '',
      avatar: p?.avatar in AVATAR_COLORS ? p.avatar : DEFAULT_AVATAR,
    };
  } catch {
    return { displayName: '', avatar: DEFAULT_AVATAR };
  }
}

export function writeProfile(next) {
  const merged = { ...readProfile(), ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn('[profile] could not save:', err);
  }
  for (const fn of listeners) fn(merged);
  return merged;
}

export function subscribeProfile(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
