-- PaceIQ Onboarding + Training Plan Full Integration
-- Run after existing migrations. Adds athlete_profile onboarding fields,
-- training_plan_workout flat table, coach_message UI columns.

-- 1. athlete_profile: onboarding and goal fields
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS onboarding_answers JSONB;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS recommended_philosophy TEXT;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS goal_race_name TEXT;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS goal_race_date DATE;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS goal_time TEXT;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS goal_distance TEXT;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS days_per_week INTEGER;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS injury_history_text TEXT;

-- 2. training_plan: add peak_weekly_km and total_weeks if missing (some may exist)
ALTER TABLE public.training_plan ADD COLUMN IF NOT EXISTS peak_weekly_km FLOAT;
ALTER TABLE public.training_plan ADD COLUMN IF NOT EXISTS total_weeks INTEGER;

-- 3. training_plan_workout: flat table for PaceIQ plan format (plan_id → workouts)
CREATE TABLE IF NOT EXISTS public.training_plan_workout (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES public.training_plan(id) ON DELETE CASCADE NOT NULL,
  date DATE,
  week_number INTEGER,
  phase TEXT,
  day_of_week INTEGER,
  type TEXT,
  name TEXT,
  description TEXT,
  key_focus TEXT,
  distance_km FLOAT,
  duration_minutes INTEGER,
  target_pace TEXT,
  target_hr_zone INTEGER,
  tss_estimate FLOAT,
  completed BOOLEAN DEFAULT FALSE,
  completed_activity_id TEXT,
  actual_distance_km FLOAT,
  actual_avg_hr INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.training_plan_workout ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own plan workouts" ON public.training_plan_workout FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_training_plan_workout_plan_id ON public.training_plan_workout(plan_id);
CREATE INDEX IF NOT EXISTS idx_training_plan_workout_user_date ON public.training_plan_workout(user_id, date);

-- 4. coach_message: UI component columns for special cards
ALTER TABLE public.coach_message ADD COLUMN IF NOT EXISTS ui_component TEXT;
ALTER TABLE public.coach_message ADD COLUMN IF NOT EXISTS ui_data JSONB;
