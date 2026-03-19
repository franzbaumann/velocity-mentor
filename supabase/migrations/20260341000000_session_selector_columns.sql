-- Session Selector: columns for selected session structure and guidance

ALTER TABLE public.training_plan_workout
  ADD COLUMN IF NOT EXISTS structure_json jsonb,
  ADD COLUMN IF NOT EXISTS pace_guidance_json jsonb,
  ADD COLUMN IF NOT EXISTS why_this_session text,
  ADD COLUMN IF NOT EXISTS primary_metric text;
