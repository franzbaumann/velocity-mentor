-- workout_session: groups multiple workout_invites into one combined session
CREATE TABLE IF NOT EXISTS public.workout_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposed_date date NOT NULL,
  message text,
  invite_type text NOT NULL DEFAULT 'combined' CHECK (invite_type IN ('combined', 'parallel')),
  combined_workout jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add session_id to workout_invite BEFORE policies that reference it (nullable for backward compatibility)
ALTER TABLE public.workout_invite
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.workout_session(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_workout_invite_session ON public.workout_invite (session_id) WHERE session_id IS NOT NULL;

ALTER TABLE public.workout_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own sessions" ON public.workout_session
  FOR SELECT USING (
    auth.uid() = from_user
    OR EXISTS (
      SELECT 1 FROM public.workout_invite wi
      WHERE wi.session_id = workout_session.id
        AND wi.to_user = auth.uid()
    )
  );

CREATE POLICY "Users create sessions" ON public.workout_session
  FOR INSERT WITH CHECK (auth.uid() = from_user);

CREATE POLICY "Users update own sessions" ON public.workout_session
  FOR UPDATE USING (auth.uid() = from_user);

CREATE POLICY "Users delete own sessions" ON public.workout_session
  FOR DELETE USING (auth.uid() = from_user);

CREATE INDEX idx_workout_session_from_user ON public.workout_session (from_user);
CREATE INDEX idx_workout_session_proposed_date ON public.workout_session (proposed_date);
