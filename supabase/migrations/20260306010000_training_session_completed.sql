-- Add completed_at to training_session for marking sessions as done
ALTER TABLE public.training_session
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
