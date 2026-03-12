-- intervals.icu full metrics: add missing activity, daily_readiness, athlete_profile columns
-- and unique constraints for upsert support.
-- Idempotent: add column if not exists.

-- Activity: unique on (user_id, external_id) for intervals.icu upsert
DO $$ BEGIN
  ALTER TABLE public.activity ADD CONSTRAINT activity_user_external_id_unique UNIQUE (user_id, external_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Activity: physiological + TSS fields from intervals.icu
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS icu_vo2max_estimate float;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS icu_lactate_threshold_hr integer;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS icu_lactate_threshold_pace text;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS tss float;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS intensity_factor float;

-- daily_readiness: wellness fields (mood, energy, muscle_soreness, stress_score)
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS stress_score float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS mood integer;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS energy integer;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS muscle_soreness integer;

-- athlete_profile: zone source + LT1
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS lt1_hr integer;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS lt1_pace text;
ALTER TABLE public.athlete_profile ADD COLUMN IF NOT EXISTS zone_source text DEFAULT 'hr_formula';

-- personal_records: unique constraint for upsert (onConflict: user_id, distance)
DO $$ BEGIN
  ALTER TABLE public.personal_records ADD CONSTRAINT personal_records_user_distance_unique UNIQUE (user_id, distance);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
