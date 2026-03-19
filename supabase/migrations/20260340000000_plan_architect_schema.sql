-- Plan Architect schema: athlete_profile, training_plan, training_plan_workout

-- athlete_profile
ALTER TABLE public.athlete_profile
  ADD COLUMN IF NOT EXISTS goal_time_seconds integer,
  ADD COLUMN IF NOT EXISTS current_weekly_km numeric,
  ADD COLUMN IF NOT EXISTS training_days_per_week integer,
  ADD COLUMN IF NOT EXISTS longest_session_minutes integer,
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS injury_history text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pace_source text,
  ADD COLUMN IF NOT EXISTS lt2_pace numeric;

-- training_plan
ALTER TABLE public.training_plan
  ADD COLUMN IF NOT EXISTS phase_structure jsonb,
  ADD COLUMN IF NOT EXISTS start_weekly_km numeric,
  ADD COLUMN IF NOT EXISTS current_phase text,
  ADD COLUMN IF NOT EXISTS current_week integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_regenerated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pace_profile jsonb;

-- training_plan_workout
ALTER TABLE public.training_plan_workout
  ADD COLUMN IF NOT EXISTS session_category text,
  ADD COLUMN IF NOT EXISTS is_hard_day boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_distance_km numeric,
  ADD COLUMN IF NOT EXISTS target_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS target_pace_seconds_km integer,
  ADD COLUMN IF NOT EXISTS pace_type text,
  ADD COLUMN IF NOT EXISTS control_metric text,
  ADD COLUMN IF NOT EXISTS is_skeleton boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS skeleton_session_type text;
