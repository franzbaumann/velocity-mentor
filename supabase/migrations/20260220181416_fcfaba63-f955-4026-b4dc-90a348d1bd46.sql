
-- Enums
CREATE TYPE public.training_philosophy AS ENUM ('jack_daniels', 'pfitzinger', 'hansons', 'ai');
CREATE TYPE public.activity_source AS ENUM ('garmin', 'strava', 'manual');
CREATE TYPE public.coach_role AS ENUM ('user', 'coach');
CREATE TYPE public.coach_trigger AS ENUM ('user', 'proactive', 'activity_sync', 'readiness');
CREATE TYPE public.oauth_provider AS ENUM ('garmin', 'strava');

-- athlete_profile
CREATE TABLE public.athlete_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  narrative TEXT DEFAULT '',
  vdot FLOAT,
  max_hr INT,
  resting_hr INT,
  preferred_longrun_day TEXT DEFAULT 'Saturday',
  training_philosophy public.training_philosophy DEFAULT 'jack_daniels',
  goal_race JSONB DEFAULT '{}',
  race_history JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.athlete_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.athlete_profile FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- activity
CREATE TABLE public.activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  garmin_id TEXT,
  strava_id TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT DEFAULT 'run',
  distance_km FLOAT,
  duration_seconds INT,
  avg_pace TEXT,
  avg_hr INT,
  max_hr INT,
  cadence INT,
  elevation_gain FLOAT,
  hr_zones JSONB DEFAULT '{}',
  splits JSONB DEFAULT '[]',
  polyline TEXT,
  ai_analysis TEXT,
  source public.activity_source DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own activities" ON public.activity FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_activity_strava ON public.activity(user_id, strava_id) WHERE strava_id IS NOT NULL;
CREATE UNIQUE INDEX idx_activity_garmin ON public.activity(user_id, garmin_id) WHERE garmin_id IS NOT NULL;

-- daily_readiness
CREATE TABLE public.daily_readiness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  score INT,
  hrv FLOAT,
  hrv_baseline FLOAT,
  sleep_hours FLOAT,
  sleep_quality INT,
  resting_hr INT,
  ctl FLOAT,
  atl FLOAT,
  tsb FLOAT,
  ai_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);
ALTER TABLE public.daily_readiness ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own readiness" ON public.daily_readiness FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- coach_message
CREATE TABLE public.coach_message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  role public.coach_role NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  triggered_by public.coach_trigger DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coach_message ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own messages" ON public.coach_message FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- oauth_tokens (sensitive - tokens only accessed via edge functions)
CREATE TABLE public.oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider public.oauth_provider NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_secret TEXT,
  expires_at TIMESTAMPTZ,
  athlete_name TEXT,
  athlete_id TEXT,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
-- Only edge functions (service role) should read tokens directly
-- Users can see connection status via a view
CREATE POLICY "Users can see own token metadata" ON public.oauth_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tokens" ON public.oauth_tokens FOR DELETE USING (auth.uid() = user_id);

-- View for safe token display (no access_token/refresh_token)
CREATE VIEW public.oauth_connections WITH (security_invoker = on) AS
  SELECT id, user_id, provider, athlete_name, athlete_id, last_sync_at, expires_at, created_at
  FROM public.oauth_tokens;

-- Auto-create athlete profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.athlete_profile (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_athlete_profile_updated_at BEFORE UPDATE ON public.athlete_profile FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_oauth_tokens_updated_at BEFORE UPDATE ON public.oauth_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
