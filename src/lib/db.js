/**
 * Data access layer.
 *
 * Every write goes to the on-device store in localStore.js, and additionally to
 * Supabase when it is configured. Supabase stays the source of truth for IDs when
 * it is available; otherwise a local ID is generated so the
 * participant → session → block → trial chain still links up and a session run
 * without credentials is fully recoverable afterwards.
 *
 * All functions are async, never throw, and log errors to the console, so the
 * experiment flow is never blocked by network issues.
 */
import supabase from './supabase.js';
import * as local from './localStore.js';

// ─── participants ─────────────────────────────────────────

/**
 * Insert a new participant or return the existing one (by participant_code).
 * @param {string} participantCode
 * @param {{ deviceOs?: string, deviceModel?: string, timezone?: string }} deviceInfo
 * @returns {Promise<{ id: string, participant_code: string } | null>}
 */
export async function upsertParticipant(participantCode, deviceInfo = {}) {
  let remote = null;

  if (supabase) {
    const { data: existing, error: selectErr } = await supabase
      .from('participants')
      .select('id, participant_code')
      .eq('participant_code', participantCode)
      .maybeSingle();

    if (selectErr) console.error('[db.upsertParticipant] SELECT failed:', selectErr);

    if (existing) {
      remote = existing;
    } else {
      const { data, error } = await supabase
        .from('participants')
        .insert({
          participant_code: participantCode,
          device_os: deviceInfo.deviceOs ?? null,
          device_model: deviceInfo.deviceModel ?? null,
          timezone: deviceInfo.timezone ?? null,
          study_start_date: new Date().toISOString().slice(0, 10),
        })
        .select('id, participant_code')
        .single();

      if (data) {
        remote = data;
      } else if (error?.code === '23505') {
        // SELECT-then-INSERT is not atomic: a concurrent call (React StrictMode
        // double-runs mount effects in dev) can insert the row between our two
        // statements. The row exists — fetch it instead of falling back to a
        // local ID, which would poison every downstream foreign key.
        const { data: raced } = await supabase
          .from('participants')
          .select('id, participant_code')
          .eq('participant_code', participantCode)
          .maybeSingle();
        if (raced) remote = raced;
        else console.error('[db.upsertParticipant] duplicate-key retry SELECT found nothing');
      } else {
        console.error('[db.upsertParticipant] INSERT failed:', error);
      }
    }
  }

  const row = local.recordParticipant({
    id: remote?.id,
    participantCode,
    deviceOs: deviceInfo.deviceOs,
    deviceModel: deviceInfo.deviceModel,
    timezone: deviceInfo.timezone,
  });

  return remote ?? row;
}

// ─── sessions ─────────────────────────────────────────────

/**
 * Create a new session row.
 * @param {{ participantId: string, version: 'ego'|'allo', sessionType: 'training'|'testing' }} params
 * @returns {Promise<{ id: string } | null>}
 */
export async function createSession({ participantId, version, sessionType }) {
  let remote = null;

  if (supabase) {
    const { data, error } = await supabase
      .from('sessions')
      .insert({ participant_id: participantId, version, session_type: sessionType })
      .select('id')
      .single();

    if (error) console.error('[db.createSession] INSERT failed:', error);
    else remote = data;
  }

  const row = local.recordSession({ id: remote?.id, participantId, version, sessionType });
  return remote ?? row;
}

/**
 * Mark a session as complete with summary stats.
 * @param {string} sessionId
 * @param {{ totalCorrect: number, totalTrials: number, avgReactionTimeMs: number }} summary
 */
export async function completeSession(sessionId, { totalCorrect, totalTrials, avgReactionTimeMs }) {
  let remote = null;

  if (supabase) {
    const { data, error } = await supabase
      .from('sessions')
      .update({
        timestamp_end: new Date().toISOString(),
        total_correct: totalCorrect,
        total_trials: totalTrials,
        avg_reaction_time_ms: avgReactionTimeMs,
      })
      .eq('id', sessionId)
      .select('id')
      .single();

    if (error) console.error('[db.completeSession] Failed to complete session:', sessionId, error);
    else remote = data;
  }

  const row = local.recordSessionComplete(sessionId, { totalCorrect, totalTrials, avgReactionTimeMs });
  return remote ?? row;
}

// ─── orientation blocks ───────────────────────────────────

/**
 * Create an orientation block row (called when a new facing direction starts).
 * @param {{ sessionId: string, blockOrder: number, targetDirection: number }} params
 * @returns {Promise<{ id: string } | null>}
 */
export async function createOrientationBlock({ sessionId, blockOrder, targetDirection }) {
  let remote = null;

  if (supabase) {
    const { data, error } = await supabase
      .from('orientation_blocks')
      .insert({
        session_id: sessionId,
        block_order: blockOrder,
        target_allocentric_direction: targetDirection,
      })
      .select('id')
      .single();

    if (error) console.error('[db.createOrientationBlock]', error);
    else remote = data;
  }

  const row = local.recordBlock({ id: remote?.id, sessionId, blockOrder, targetDirection });
  return remote ?? row;
}

/**
 * Update an orientation block after calibration completes.
 * @param {string} blockId
 * @param {{ finalFacingDirection?: number, orientationErrorDeg?: number, orientationLatencyMs?: number }} fields
 */
export async function updateOrientationBlock(blockId, { finalFacingDirection, orientationErrorDeg, orientationLatencyMs }) {
  let remote = null;

  if (supabase) {
    const { data, error } = await supabase
      .from('orientation_blocks')
      .update({
        final_facing_direction: finalFacingDirection ?? null,
        orientation_error_deg: orientationErrorDeg ?? null,
        orientation_latency_ms: orientationLatencyMs ?? null,
      })
      .eq('id', blockId)
      .select('id')
      .single();

    if (error) console.error('[db.updateOrientationBlock]', error);
    else remote = data;
  }

  const row = local.recordBlockUpdate(blockId, {
    finalFacingDirection, orientationErrorDeg, orientationLatencyMs,
  });
  return remote ?? row;
}

// ─── participant stats ────────────────────────────────────

// Local calendar day of a timestamp — day boundaries follow the participant's
// clock, not UTC, so a session at 11pm counts toward the right day.
function localDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Usage stats for one participant, computed from their actual session rows —
 * this is what the home/profile screens show, so nothing here is ever mocked.
 * Reads Supabase when configured (cross-device truth), otherwise the on-device
 * mirror. Only sessions that ran to completion count.
 *
 * @param {string} participantId
 * @returns {Promise<{
 *   sessionsToday: number, streak: number, totalSessions: number,
 *   totalCorrect: number, totalPoints: number,
 *   trainingHistory: { date: string, correct: number, avgTime: number }[]
 * } | null>}
 */
export async function getParticipantStats(participantId) {
  let rows = null;

  if (supabase) {
    const { data, error } = await supabase
      .from('sessions')
      .select('session_type, timestamp_start, timestamp_end, total_correct, avg_reaction_time_ms')
      .eq('participant_id', participantId)
      .order('timestamp_start', { ascending: false });
    if (error) console.error('[db.getParticipantStats]', error);
    else rows = data;
  }

  if (!rows) {
    rows = local.readAll().sessions
      .filter((s) => s.participant_id === participantId)
      .sort((a, b) => (b.timestamp_start ?? '').localeCompare(a.timestamp_start ?? ''));
  }

  const completed = rows.filter((s) => s.timestamp_end != null && s.total_correct != null);

  // Consecutive-day streak: walk back from today (or yesterday, so the streak
  // isn't broken just because today's session hasn't happened yet).
  const days = new Set(completed.map((s) => localDay(s.timestamp_start)));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(localDay(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const today = localDay(Date.now());
  return {
    sessionsToday: completed.filter((s) => localDay(s.timestamp_start) === today).length,
    streak,
    totalSessions: completed.length,
    totalCorrect: completed.reduce((a, s) => a + (s.total_correct ?? 0), 0),
    // Same formula the results screen shows: 10 points per correct + 50 per session.
    totalPoints: completed.reduce((a, s) => a + (s.total_correct ?? 0) * 10 + 50, 0),
    trainingHistory: completed
      .filter((s) => s.session_type === 'training')
      .map((s) => ({
        date: new Date(s.timestamp_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        correct: s.total_correct ?? 0,
        avgTime: s.avg_reaction_time_ms ?? 0,
      })),
  };
}

// ─── trials ───────────────────────────────────────────────

/**
 * Insert a single trial result.
 * @param {{
 *   blockId: string,
 *   trialIndex: number,
 *   layout: string,
 *   squareFirst: boolean,
 *   correctAnswer: string,
 *   participantResponse: string | null,
 *   accuracy: boolean,
 *   reactionTimeMs: number,
 *   timeout: boolean,
 *   optionsShown: string[],
 *   appVersion?: string
 * }} params
 * @returns {Promise<{ id: string } | null>}
 */
export async function createTrial({
  blockId, trialIndex, layout, squareFirst, correctAnswer,
  participantResponse, accuracy, reactionTimeMs, timeout,
  optionsShown, appVersion,
}) {
  let remote = null;

  if (supabase) {
    const { data, error } = await supabase
      .from('trials')
      .insert({
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
      })
      .select('id')
      .single();

    if (error) {
      console.error('[db.createTrial] Failed to insert trial:', { blockId, trialIndex, correctAnswer }, error);
    } else {
      remote = data;
    }
  }

  const row = local.recordTrial({
    id: remote?.id, blockId, trialIndex, layout, squareFirst, correctAnswer,
    participantResponse, accuracy, reactionTimeMs, timeout, optionsShown, appVersion,
  });
  return remote ?? row;
}
