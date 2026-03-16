-- Community / Social tables for Cade

-- 1. friendship (symmetric pair, one row per pair with user_a < user_b)
CREATE TABLE IF NOT EXISTS public.friendship (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendship_ordered CHECK (user_a < user_b),
  CONSTRAINT friendship_unique UNIQUE (user_a, user_b)
);

ALTER TABLE public.friendship ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own friendships" ON public.friendship;
CREATE POLICY "Users see own friendships" ON public.friendship
  FOR SELECT USING (auth.uid() IN (user_a, user_b));

DROP POLICY IF EXISTS "Users delete own friendships" ON public.friendship;
CREATE POLICY "Users delete own friendships" ON public.friendship
  FOR DELETE USING (auth.uid() IN (user_a, user_b));

DROP POLICY IF EXISTS "Service role inserts friendships" ON public.friendship;
CREATE POLICY "Service role inserts friendships" ON public.friendship
  FOR INSERT WITH CHECK (auth.uid() IN (user_a, user_b));

-- Helper: check if two users are friends (after friendship table exists)
CREATE OR REPLACE FUNCTION public.is_friend(uid1 uuid, uid2 uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendship
    WHERE user_a = LEAST(uid1, uid2) AND user_b = GREATEST(uid1, uid2)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. friend_request
CREATE TABLE IF NOT EXISTS public.friend_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT no_self_request CHECK (from_user <> to_user)
);

CREATE UNIQUE INDEX friend_request_pending_unique
  ON public.friend_request (LEAST(from_user, to_user), GREATEST(from_user, to_user))
  WHERE status = 'pending';

ALTER TABLE public.friend_request ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own requests" ON public.friend_request;
CREATE POLICY "Users see own requests" ON public.friend_request
  FOR SELECT USING (auth.uid() IN (from_user, to_user));

DROP POLICY IF EXISTS "Users send requests" ON public.friend_request;
CREATE POLICY "Users send requests" ON public.friend_request
  FOR INSERT WITH CHECK (auth.uid() = from_user);

DROP POLICY IF EXISTS "Recipients respond to requests" ON public.friend_request;
CREATE POLICY "Recipients respond to requests" ON public.friend_request
  FOR UPDATE USING (auth.uid() = to_user);

-- 3. activity_like
CREATE TABLE IF NOT EXISTS public.activity_like (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activity(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_like_unique UNIQUE (activity_id, user_id)
);

ALTER TABLE public.activity_like ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own likes" ON public.activity_like;
CREATE POLICY "Users insert own likes" ON public.activity_like
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own likes" ON public.activity_like;
CREATE POLICY "Users delete own likes" ON public.activity_like
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see likes on own or friend activities" ON public.activity_like;
CREATE POLICY "Users see likes on own or friend activities" ON public.activity_like
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.activity a
      WHERE a.id = activity_id
        AND (a.user_id = auth.uid() OR public.is_friend(auth.uid(), a.user_id))
    )
  );

-- 4. activity_comment
CREATE TABLE IF NOT EXISTS public.activity_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activity(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(content) > 0 AND length(content) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_comment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own comments" ON public.activity_comment
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own comments" ON public.activity_comment
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users see comments on own or friend activities" ON public.activity_comment
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.activity a
      WHERE a.id = activity_id
        AND (a.user_id = auth.uid() OR public.is_friend(auth.uid(), a.user_id))
    )
  );

-- 5. workout_invite
CREATE TABLE IF NOT EXISTS public.workout_invite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposed_date date NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  from_workout_id uuid REFERENCES public.training_plan_workout(id) ON DELETE SET NULL,
  to_workout_id uuid REFERENCES public.training_plan_workout(id) ON DELETE SET NULL,
  combined_workout jsonb,
  invite_type text NOT NULL DEFAULT 'combined' CHECK (invite_type IN ('combined', 'parallel')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT no_self_invite CHECK (from_user <> to_user)
);

ALTER TABLE public.workout_invite ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own invites" ON public.workout_invite;
CREATE POLICY "Users see own invites" ON public.workout_invite
  FOR SELECT USING (auth.uid() IN (from_user, to_user));

DROP POLICY IF EXISTS "Users send invites" ON public.workout_invite;
CREATE POLICY "Users send invites" ON public.workout_invite
  FOR INSERT WITH CHECK (auth.uid() = from_user);

DROP POLICY IF EXISTS "Users update own invites" ON public.workout_invite;
CREATE POLICY "Users update own invites" ON public.workout_invite
  FOR UPDATE USING (auth.uid() IN (from_user, to_user));

-- Indexes for performance
CREATE INDEX idx_friendship_user_a ON public.friendship (user_a);
CREATE INDEX idx_friendship_user_b ON public.friendship (user_b);
CREATE INDEX idx_friend_request_to ON public.friend_request (to_user) WHERE status = 'pending';
CREATE INDEX idx_activity_like_activity ON public.activity_like (activity_id);
CREATE INDEX idx_activity_comment_activity ON public.activity_comment (activity_id);
CREATE INDEX idx_workout_invite_to ON public.workout_invite (to_user) WHERE status = 'pending';
