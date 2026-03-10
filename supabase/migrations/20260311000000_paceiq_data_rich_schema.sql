-- PaceIQ data-rich schema: streams, intervals, PBs, wellness, activity metrics
-- Run after existing migrations

-- 1. Activity streams: add all stream types + computed zones
ALTER TABLE public.activity_streams ADD COLUMN IF NOT EXISTS latlng float[][];
ALTER TABLE public.activity_streams ADD COLUMN IF NOT EXISTS fixed_heartrate integer[];
ALTER TABLE public.activity_streams ADD COLUMN IF NOT EXISTS temperature float[];
ALTER TABLE public.activity_streams ADD COLUMN IF NOT EXISTS respiration_rate float[];
ALTER TABLE public.activity_streams ADD COLUMN IF NOT EXISTS smo2 float[];
ALTER TABLE public.activity_streams ADD COLUMN IF NOT EXISTS thb float[];
ALTER TABLE public.activity_streams ADD COLUMN IF NOT EXISTS hr_zones integer[];
ALTER TABLE public.activity_streams ADD COLUMN IF NOT EXISTS pace_zones integer[];

-- 2. Activity: add intervals.icu metrics
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS icu_hrss float;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS icu_trimp float;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS icu_efficiency_factor float;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS icu_aerobic_decoupling float;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS icu_power_hr float;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS icu_avg_hr_reserve float;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS gap float;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS workout_type text;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS cardiac_drift float;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS pace_efficiency float;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS cadence_consistency float;

-- 3. activity_intervals: detected intervals per activity
CREATE TABLE IF NOT EXISTS public.activity_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  activity_id text NOT NULL,
  interval_number integer NOT NULL,
  start_index integer,
  end_index integer,
  start_time_offset integer,
  elapsed_time integer,
  distance_km float,
  avg_pace float,
  avg_hr integer,
  max_hr integer,
  avg_cadence integer,
  tss float,
  intensity_factor float,
  avg_power float,
  type text,
  label text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.activity_intervals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own intervals" ON public.activity_intervals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_activity_intervals_user_activity ON public.activity_intervals(user_id, activity_id);

-- 4. personal_records
CREATE TABLE IF NOT EXISTS public.personal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  distance text NOT NULL,
  best_time_seconds integer,
  best_pace text,
  date_achieved date,
  activity_id text,
  source text DEFAULT 'intervals',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own PBs" ON public.personal_records
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_personal_records_user ON public.personal_records(user_id);

-- 5. daily_readiness: wellness fields from intervals.icu
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS icu_ctl float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS icu_atl float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS icu_tsb float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS icu_ramp_rate float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS icu_long_term_power float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS hrv_rmssd float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS hrv_sdnn float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS sleep_secs integer;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS sleep_score integer;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS weight float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS kcal integer;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS steps integer;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS stress_hrv float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS readiness integer;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS spo2 float;
ALTER TABLE public.daily_readiness ADD COLUMN IF NOT EXISTS respiration_rate float;
