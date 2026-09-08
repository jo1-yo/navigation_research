/**
 * Whether writes are actually reaching the hosted database.
 *
 * This exists because of a silent failure that cost a fortnight: the Supabase
 * project went away (free projects are paused after a week idle, and a paused
 * project's hostname stops resolving), every write fell back to the on-device
 * mirror, and nothing anywhere said so — not the participant's screen, not the
 * researcher's dashboard. Sessions kept "working".
 *
 * db.js reports the outcome of each remote call here; <RemoteStatus /> renders a
 * banner whenever the remote is not accepting writes, so a dead backend is
 * visible within one trial instead of at analysis time.
 */

const state = {
  // 'unknown'   — no remote call has completed yet
  // 'ok'        — the last remote write succeeded
  // 'failing'   — the last remote write failed (network, DNS, RLS, schema)
  // 'unconfigured' — no credentials were built in, so there is no remote at all
  mode: 'unknown',
  detail: null,
  failures: 0,
};

const listeners = new Set();

function emit() {
  for (const fn of listeners) fn({ ...state });
}

export function subscribe(fn) {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

export function getState() {
  return { ...state };
}

export function reportUnconfigured() {
  if (state.mode === 'unconfigured') return;
  state.mode = 'unconfigured';
  state.detail = 'No database credentials in this build';
  emit();
}

export function reportOk() {
  state.failures = 0;
  if (state.mode === 'ok') return;
  state.mode = 'ok';
  state.detail = null;
  emit();
}

/**
 * @param {string} op    the db.js function that failed
 * @param {unknown} err  the Supabase error or thrown value
 */
export function reportFailure(op, err) {
  state.failures += 1;
  const msg = err?.message || String(err ?? 'unknown error');
  // "Failed to fetch" is what a missing/unreachable host looks like from the
  // browser — by far the most likely cause is a paused or deleted project.
  const detail = /failed to fetch|networkerror|load failed/i.test(msg)
    ? 'Cannot reach the database (project paused, offline, or wrong URL)'
    : msg;
  if (state.mode === 'failing' && state.detail === detail) return;
  state.mode = 'failing';
  state.detail = detail;
  console.warn(`[dbHealth] remote write failing at ${op}: ${detail}`);
  emit();
}
