-- Fix social RLS: likes and comments should be visible when the viewer owns the activity or is friends with the owner.
-- Uses a SECURITY DEFINER function to bypass activity table RLS for the ownership/friendship check.

CREATE OR REPLACE FUNCTION public.can_view_activity(act_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.activity a
    WHERE a.id = act_id
      AND (
        a.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.friendship f
          WHERE f.user_a = LEAST(auth.uid(), a.user_id)
            AND f.user_b = GREATEST(auth.uid(), a.user_id)
        )
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Re-create like SELECT policy using the SECURITY DEFINER function
DROP POLICY IF EXISTS "Users see likes on own or friend activities" ON public.activity_like;
CREATE POLICY "Users see likes on own or friend activities" ON public.activity_like
  FOR SELECT USING (public.can_view_activity(activity_id));

-- Re-create comment SELECT policy using the SECURITY DEFINER function
DROP POLICY IF EXISTS "Users see comments on own or friend activities" ON public.activity_comment;
CREATE POLICY "Users see comments on own or friend activities" ON public.activity_comment
  FOR SELECT USING (public.can_view_activity(activity_id));

-- Also ensure the activity friend-read policy exists (idempotent)
DROP POLICY IF EXISTS "Users can read friends' activities" ON public.activity;
CREATE POLICY "Users can read friends' activities" ON public.activity
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.friendship f
      WHERE (f.user_a = auth.uid() AND f.user_b = activity.user_id)
         OR (f.user_b = auth.uid() AND f.user_a = activity.user_id)
    )
  );

-- Also ensure the streams friend-read policy exists (idempotent)
DROP POLICY IF EXISTS "Users can read friends' streams" ON public.activity_streams;
CREATE POLICY "Users can read friends' streams" ON public.activity_streams
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.friendship f
      WHERE (f.user_a = auth.uid() AND f.user_b = activity_streams.user_id)
         OR (f.user_b = auth.uid() AND f.user_a = activity_streams.user_id)
    )
  );
