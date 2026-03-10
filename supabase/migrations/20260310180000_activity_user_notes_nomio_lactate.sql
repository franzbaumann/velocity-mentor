-- User notes, Nomio drink toggle, and lactate levels for activities (used by coach)
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS user_notes TEXT;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS nomio_drink BOOLEAN DEFAULT FALSE;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS lactate_levels TEXT;
