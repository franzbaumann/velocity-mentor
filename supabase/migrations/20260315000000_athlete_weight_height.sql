-- Add weight, height, and units to athlete_profile for manual entry when not synced from intervals.icu
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS weight_kg float;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS height_cm float;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS preferred_units text DEFAULT 'km';
