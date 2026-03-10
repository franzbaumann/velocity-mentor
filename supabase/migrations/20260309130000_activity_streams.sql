-- activity_streams: store time-series data from intervals.icu for runs
CREATE TABLE IF NOT EXISTS public.activity_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  activity_id TEXT NOT NULL,
  heartrate integer[],
  cadence integer[],
  altitude float[],
  pace float[],
  time integer[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, activity_id)
);
ALTER TABLE public.activity_streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own streams" ON public.activity_streams
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_activity_streams_user_activity ON public.activity_streams(user_id, activity_id);
