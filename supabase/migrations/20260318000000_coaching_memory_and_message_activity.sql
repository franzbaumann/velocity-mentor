-- coaching_memory: persistent AI memory extracted from conversations
CREATE TABLE IF NOT EXISTS public.coaching_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('preference', 'goal', 'injury', 'lifestyle', 'race', 'personality', 'other')),
  content text NOT NULL,
  importance integer NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  source text DEFAULT 'conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_coaching_memory_user_id ON public.coaching_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_coaching_memory_lookup ON public.coaching_memory(user_id, importance DESC, created_at DESC);

ALTER TABLE public.coaching_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own memories" ON public.coaching_memory
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- coach_message: add activity_id for post-workout analysis linkage
ALTER TABLE public.coach_message ADD COLUMN IF NOT EXISTS activity_id text;
CREATE INDEX IF NOT EXISTS idx_coach_message_activity ON public.coach_message(activity_id) WHERE activity_id IS NOT NULL;
