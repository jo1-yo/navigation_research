/**
 * Data access layer for Supabase.
 *
 * All functions are async, return the inserted/updated row on success
 * or null on failure. Errors are logged to console, never thrown,
 * so the experiment flow is never blocked by network issues.
 */
import supabase from './supabase.js';

// ─── helpers ──────────────────────────────────────────────

function noop(label) {
  console.warn(`[db.${label}] Supabase not configured — skipping.`);
  return null;
}

// ─── participants ─────────────────────────────────────────

/**
 * Insert a new participant or return the existing one (by participant_code).
 * @param {string} participantCode
 * @param {{ deviceOs?: string, deviceModel?: string, timezone?: string }} deviceInfo
 * @returns {Promise<{ id: string, participant_code: string } | null>}
 */
export async function upsertParticipant(participantCode, deviceInfo = {}) {
  if (!supabase) return noop('upsertParticipant');
  console.log('[db.upsertParticipant] Looking up:', participantCode);

  const { data: existing, error: selectErr } = await supabase
    .from('participants')
    .select('id, participant_code')
    .eq('participant_code', participantCode)
    .maybeSingle();

  if (selectErr) { console.error('[db.upsertParticipant] SELECT failed:', selectErr); }
  if (existing) { console.log('[db.upsertParticipant] Found existing:', existing.id); return existing; }

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

  if (error) { console.error('[db.upsertParticipant] INSERT failed:', error); return null; }
  console.log('[db.upsertParticipant] Created new:', data.id);
  return data;
}

// ─── sessions ─────────────────────────────────────────────

/**
 * Create a new session row.
 * @param {{ participantId: string, version: 'ego'|'allo', sessionType: 'training'|'testing' }} params
 * @returns {Promise<{ id: string } | null>}
 */
export async function createSession({ participantId, version, sessionType }) {
  if (!supabase) return noop('createSession');
  console.log('[db.createSession] Creating:', { participantId, version, sessionType });

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      participant_id: participantId,
      version,
      session_type: sessionType,
    })
    .select('id')
    .single();

  if (error) { console.error('[db.createSession] INSERT failed:', error); return null; }
  console.log('[db.createSession] Created:', data.id);
  return data;
}

/**
 * Mark a session as complete with summary stats.
 * @param {string} sessionId
 * @param {{ totalCorrect: number, totalTrials: number, avgReactionTimeMs: number }} summary
 */
export async function completeSession(sessionId, { totalCorrect, totalTrials, avgReactionTimeMs }) {
  if (!supabase) return noop('completeSession');

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

  if (error) { console.error('[db.completeSession] Failed to complete session:', sessionId, error); return null; }
  console.log('[db.completeSession] Session completed:', sessionId, { totalCorrect, totalTrials, avgReactionTimeMs });
  return data;
}

// ─── orientation blocks ───────────────────────────────────

/**
 * Create an orientation block row (called when a new facing direction starts).
 * @param {{ sessionId: string, blockOrder: number, targetDirection: number }} params
 * @returns {Promise<{ id: string } | null>}
 */
export async function createOrientationBlock({ sessionId, blockOrder, targetDirection }) {
  if (!supabase) return noop('createOrientationBlock');

  const { data, error } = await supabase
    .from('orientation_blocks')
    .insert({
      session_id: sessionId,
      block_order: blockOrder,
      target_allocentric_direction: targetDirection,
    })
    .select('id')
    .single();

  if (error) { console.error('[db.createOrientationBlock]', error); return null; }
  return data;
}

/**
 * Update an orientation block after calibration completes.
 * @param {string} blockId
 * @param {{ finalFacingDirection?: number, orientationErrorDeg?: number, orientationLatencyMs?: number }} fields
 */
export async function updateOrientationBlock(blockId, { finalFacingDirection, orientationErrorDeg, orientationLatencyMs }) {
  if (!supabase) return noop('updateOrientationBlock');

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

  if (error) { console.error('[db.updateOrientationBlock]', error); return null; }
  return data;
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
  if (!supabase) return noop('createTrial');

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

  if (error) { console.error('[db.createTrial] Failed to insert trial:', { blockId, trialIndex, correctAnswer }, error); return null; }
  return data;
}
