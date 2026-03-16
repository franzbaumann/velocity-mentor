-- Allow users to read activity rows of users they are friends with (for Community Feed).
-- Does not remove the existing "Users manage own activities" policy.

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
