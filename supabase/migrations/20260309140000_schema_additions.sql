-- PaceIQ schema additions: activity columns, streams distance, training plan enhancements,
-- race predictions, athlete profile lab fields, coach message types

-- 1. Activity table: add new columns for richer intervals.icu data + Garmin laps
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS lap_splits JSONB;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS icu_training_load FLOAT;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS trimp FLOAT;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS hr_zone_times JSONB;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS pace_zone_times JSONB;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS perceived_exertion INTEGER;

DO $$ BEGIN
  ALTER TYPE public.activity_source ADD VALUE IF NOT EXISTS 'intervals_icu';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Activity streams: add distance array
ALTER TABLE public.activity_streams ADD COLUMN IF NOT EXISTS distance float[];

-- 3. Training plan: add plan metadata columns
ALTER TABLE public.training_plan ADD COLUMN IF NOT EXISTS plan_name TEXT;
ALTER TABLE public.training_plan ADD COLUMN IF NOT EXISTS philosophy TEXT;
ALTER TABLE public.training_plan ADD COLUMN IF NOT EXISTS goal_race TEXT;
ALTER TABLE public.training_plan ADD COLUMN IF NOT EXISTS goal_date DATE;
ALTER TABLE public.training_plan ADD COLUMN IF NOT EXISTS goal_time TEXT;
ALTER TABLE public.training_plan ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.training_plan ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.training_plan ADD COLUMN IF NOT EXISTS end_date DATE;

-- 4. Training session: add target and completion fields
ALTER TABLE public.training_session ADD COLUMN IF NOT EXISTS target_hr_zone INTEGER;
ALTER TABLE public.training_session ADD COLUMN IF NOT EXISTS tss_estimate FLOAT;
ALTER TABLE public.training_session ADD COLUMN IF NOT EXISTS completed_activity_id TEXT;
ALTER TABLE public.training_session ADD COLUMN IF NOT EXISTS workout_type TEXT;

-- 5. Race predictions table
CREATE TABLE IF NOT EXISTS public.race_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  predicted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  goal_distance TEXT,
  predicted_time_seconds INTEGER,
  predicted_pace TEXT,
  ctl_at_prediction FLOAT,
  zone2_pace TEXT,
  threshold_pace TEXT,
  vo2max_pace TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.race_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own predictions" ON public.race_predictions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_race_predictions_user ON public.race_predictions(user_id, predicted_at);

-- 6. Athlete profile: lab test fields
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS vo2max FLOAT;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS lactate_threshold_hr INTEGER;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS lactate_threshold_pace TEXT;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS vlamax FLOAT;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS max_hr_measured INTEGER;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS lab_test_date DATE;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS lab_name TEXT;

-- 7. Coach message: add message type
ALTER TABLE public.coach_message ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'chat';
