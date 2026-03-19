-- Full session display + link completed activities to planned workouts

ALTER TABLE public.training_plan_workout
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS session_structure JSONB,
  ADD COLUMN IF NOT EXISTS control_tool TEXT;

COMMENT ON COLUMN public.training_plan_workout.session_id IS 'Session library id (alias of session_library_id when set from selector)';
COMMENT ON COLUMN public.training_plan_workout.session_structure IS 'UI-facing warmup/main/cooldown/purpose for SessionCard';
COMMENT ON COLUMN public.training_plan_workout.control_tool IS 'pace | heart_rate | rpe — mirrors primary metric for display';

ALTER TABLE public.activity
  ADD COLUMN IF NOT EXISTS planned_workout_id UUID REFERENCES public.training_plan_workout(id) ON DELETE SET NULL;

ALTER TABLE public.activity
  ADD COLUMN IF NOT EXISTS planned_session_label TEXT;

CREATE INDEX IF NOT EXISTS idx_activity_planned_workout ON public.activity(planned_workout_id);
CREATE INDEX IF NOT EXISTS idx_activity_user_planned ON public.activity(user_id, planned_workout_id);
