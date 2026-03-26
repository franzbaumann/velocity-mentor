-- Add missing columns to daily_readiness that are referenced in the app queries
-- and add apple_health to activity_source enum

-- daily_readiness: intervals.icu CTL/ATL/TSB (separate from raw ctl/atl/tsb)
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS icu_ctl float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS icu_atl float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS icu_tsb float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS icu_ramp_rate float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS ramp_rate float;

-- daily_readiness: wellness fields from Apple Health and wearables
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS steps integer;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS weight float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS sleep_score float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS readiness float;

-- activity_source: add apple_health value
ALTER TYPE public.activity_source ADD VALUE IF NOT EXISTS 'apple_health';
