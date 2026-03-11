-- Add coach_note to training_plan_workout for AI-generated "why this session" descriptions
ALTER TABLE public.training_plan_workout ADD COLUMN IF NOT EXISTS coach_note TEXT;
