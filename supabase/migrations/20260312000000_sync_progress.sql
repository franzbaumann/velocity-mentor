-- Sync progress table for intervals.icu full sync with polling
CREATE TABLE IF NOT EXISTS public.sync_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'idle',
  detail text,
  done boolean NOT NULL DEFAULT false,
  error text,
  years_completed jsonb,
  activities_total integer,
  activities_upserted integer,
  streams_done integer,
  streams_total integer,
  intervals_count integer,
  wellness_days integer,
  pbs_count integer,
  ctl float,
  atl float,
  tsb float,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sync_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sync progress" ON public.sync_progress
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sync progress" ON public.sync_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sync progress" ON public.sync_progress
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
