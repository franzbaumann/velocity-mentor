-- sync_progress: used by intervals-proxy for start_sync / get_sync_progress polling
CREATE TABLE IF NOT EXISTS public.sync_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stage text,
  detail text,
  done boolean NOT NULL DEFAULT false,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  activities_total int,
  activities_upserted int,
  streams_done int,
  streams_total int,
  intervals_count int,
  wellness_days int,
  pbs_count int,
  years_completed jsonb,
  ctl numeric,
  atl numeric,
  tsb numeric
);

ALTER TABLE public.sync_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own sync_progress"
  ON public.sync_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role (edge function) needs write; anon/authenticated do not need to write (proxy uses service role)
CREATE POLICY "Service role can manage sync_progress"
  ON public.sync_progress FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.sync_progress IS 'Intervals.icu full-sync progress; written by intervals-proxy (service role), read by app for polling.';
