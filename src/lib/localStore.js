/**
 * On-device mirror of everything the experiment records.
 *
 * db.js writes here on every call, whether or not Supabase is configured. Two
 * reasons:
 *
 *   1. Without it, running a participant with no .env silently discards the whole
 *      session — the old code just logged a warning and returned null. Losing a
 *      run you cannot repeat is much worse than a duplicated row.
 *   2. Even with Supabase up, a phone that drops off Wi-Fi mid-session would lose
 *      the trials it could not POST. The local copy survives that and can be
 *      exported afterwards.
 *
 * Rows deliberately use the same column names as the Supabase tables, so the
 * dashboard renders either source through the same code path.
 *
 * Storage is localStorage: a full session is ~12 trials, so size is not a concern,
 * and synchronous writes mean nothing is in flight when a tab closes.
 */

const KEY = 'nla_local_data_v1';
const EMPTY = { participants: [], sessions: [], blocks: [], trials: [] };

function newId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Read the whole store. Never throws — a corrupt entry reads as empty. */
export function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      participants: parsed.participants ?? [],
      sessions: parsed.sessions ?? [],
      blocks: parsed.blocks ?? [],
      trials: parsed.trials ?? [],
    };
  } catch (err) {
    console.warn('[localStore] Unreadable store, treating as empty:', err);
    return { ...EMPTY };
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    // Quota or private-mode failure. Log loudly: this is the last line of defence.
    console.error('[localStore] WRITE FAILED — this data is not saved locally:', err);
    return false;
  }
}

function mutate(fn) {
  const data = readAll();
  const result = fn(data);
  write(data);
  return result;
}

// ─── writers ──────────────────────────────────────────────

/** Insert a participant, or return the existing row with the same code. */
export function recordParticipant({ id, participantCode, deviceOs, deviceModel, timezone }) {
  return mutate((data) => {
    const existing = data.participants.find((p) => p.participant_code === participantCode);
    if (existing) return existing;
    const row = {
      id: id ?? newId(),
      participant_code: participantCode,
      device_os: deviceOs ?? null,
      device_model: deviceModel ?? null,
      timezone: timezone ?? null,
      study_start_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
    };
    data.participants.push(row);
    return row;
  });
}

export function recordSession({ id, participantId, version, sessionType }) {
  return mutate((data) => {
    const row = {
      id: id ?? newId(),
      participant_id: participantId,
      version,
      session_type: sessionType,
      timestamp_start: new Date().toISOString(),
      timestamp_end: null,
      total_correct: null,
      total_trials: null,
      avg_reaction_time_ms: null,
      day_index: null,
    };
    data.sessions.push(row);
    return row;
  });
}

export function recordSessionComplete(sessionId, { totalCorrect, totalTrials, avgReactionTimeMs }) {
  return mutate((data) => {
    const row = data.sessions.find((s) => s.id === sessionId);
    if (!row) return null;
    row.timestamp_end = new Date().toISOString();
    row.total_correct = totalCorrect;
    row.total_trials = totalTrials;
    row.avg_reaction_time_ms = avgReactionTimeMs;
    return row;
  });
}

export function recordBlock({ id, sessionId, blockOrder, targetDirection }) {
  return mutate((data) => {
    const row = {
      id: id ?? newId(),
      session_id: sessionId,
      block_order: blockOrder,
      target_allocentric_direction: targetDirection,
      final_facing_direction: null,
      orientation_error_deg: null,
      orientation_latency_ms: null,
    };
    data.blocks.push(row);
    return row;
  });
}

export function recordBlockUpdate(blockId, { finalFacingDirection, orientationErrorDeg, orientationLatencyMs }) {
  return mutate((data) => {
    const row = data.blocks.find((b) => b.id === blockId);
    if (!row) return null;
    row.final_facing_direction = finalFacingDirection ?? null;
    row.orientation_error_deg = orientationErrorDeg ?? null;
    row.orientation_latency_ms = orientationLatencyMs ?? null;
    return row;
  });
}

export function recordTrial({
  id, blockId, trialIndex, layout, squareFirst, correctAnswer,
  participantResponse, accuracy, reactionTimeMs, timeout, optionsShown, appVersion,
}) {
  return mutate((data) => {
    const row = {
      id: id ?? newId(),
      block_id: blockId,
      trial_index: trialIndex,
      layout,
      square_first: squareFirst,
      correct_answer: correctAnswer,
      participant_response: participantResponse,
      accuracy,
      reaction_time_ms: reactionTimeMs,
      timeout,
      options_shown: optionsShown,
      app_version: appVersion ?? null,
      timestamp: new Date().toISOString(),
    };
    data.trials.push(row);
    return row;
  });
}

// ─── maintenance ──────────────────────────────────────────

/** Row counts, for the dashboard's "what is stored on this device" summary. */
export function counts() {
  const d = readAll();
  return {
    participants: d.participants.length,
    sessions: d.sessions.length,
    blocks: d.blocks.length,
    trials: d.trials.length,
  };
}

export function clearAll() {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
