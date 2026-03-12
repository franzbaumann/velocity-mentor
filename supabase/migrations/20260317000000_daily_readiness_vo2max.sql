-- daily_readiness: vo2max from intervals.icu wellness (ml/kg/min per day)
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS vo2max float;
