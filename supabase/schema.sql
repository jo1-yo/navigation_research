-- ============================================================
-- Navigation Learning App — Supabase Schema
-- Hierarchy: participants → sessions → orientation_blocks → trials
--                                    → testing_trials
-- ============================================================

-- 1. PARTICIPANTS
-- One row per unique participant code. Upserted on first login.
CREATE TABLE participants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_code    text UNIQUE NOT NULL,
  condition_language  text,
  condition_haptic    text,
  device_os           text,
  device_model        text,
  timezone            text,
  study_start_date    date,
  institution_name    text,
  consent_version     text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 2. SESSIONS
-- One row per training or testing run (12 trials each).
CREATE TABLE sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id        uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  version               text NOT NULL CHECK (version IN ('ego', 'allo')),
  session_type          text NOT NULL CHECK (session_type IN ('training', 'testing')),
  timestamp_start       timestamptz NOT NULL DEFAULT now(),
  timestamp_end         timestamptz,
  day_index             int,
  session_index_today   int,
  geolocation_lat       double precision,
  geolocation_lon       double precision,
  environment_type      text,
  total_correct         int,
  total_trials          int,
  avg_reaction_time_ms  int,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 3. ORIENTATION BLOCKS
-- 6 per session. Each block = one facing direction + 2 trials.
CREATE TABLE orientation_blocks (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  block_order                   int NOT NULL,
  target_allocentric_direction  int NOT NULL,
  final_facing_direction        int,
  orientation_error_deg         double precision,
  orientation_latency_ms        int,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

-- 4. TRIALS
-- 2 per orientation block, 12 per session.
CREATE TABLE trials (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id              uuid NOT NULL REFERENCES orientation_blocks(id) ON DELETE CASCADE,
  trial_index           int NOT NULL,
  layout                text NOT NULL,
  square_first          boolean NOT NULL,
  correct_answer        text NOT NULL,
  participant_response  text,
  accuracy              boolean NOT NULL,
  reaction_time_ms      int NOT NULL,
  timeout               boolean NOT NULL DEFAULT false,
  options_shown         text[],
  timestamp             timestamptz NOT NULL DEFAULT now(),
  app_version           text
);

-- 5. TESTING TRIALS
-- Reserved for future dead-reckoning test paradigm.
-- All measurement fields nullable since this is not yet implemented.
CREATE TABLE testing_trials (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  target_name             text,
  true_bearing_deg        double precision,
  drawn_vector_deg        double precision,
  angular_error_deg       double precision,
  within_20deg_accuracy   boolean,
  reaction_time_ms        int,
  timestamp               timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Permissive policies for research use (anon key can insert/select).
-- Tighten later if needed.
-- ============================================================

ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_anon_insert" ON participants FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_anon_select" ON participants FOR SELECT USING (true);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_anon_insert" ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_anon_select" ON sessions FOR SELECT USING (true);
CREATE POLICY "allow_anon_update" ON sessions FOR UPDATE USING (true) WITH CHECK (true);

ALTER TABLE orientation_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_anon_insert" ON orientation_blocks FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_anon_select" ON orientation_blocks FOR SELECT USING (true);
CREATE POLICY "allow_anon_update" ON orientation_blocks FOR UPDATE USING (true) WITH CHECK (true);

ALTER TABLE trials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_anon_insert" ON trials FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_anon_select" ON trials FOR SELECT USING (true);

ALTER TABLE testing_trials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_anon_insert" ON testing_trials FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_anon_select" ON testing_trials FOR SELECT USING (true);
