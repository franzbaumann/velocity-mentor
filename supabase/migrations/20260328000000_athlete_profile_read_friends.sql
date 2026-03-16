-- Allow users to read athlete_profile rows of users they are friends with (for Friends list and discovery).
-- Does not remove the existing "Users manage own profile" policy.

CREATE POLICY "Users can read friends' profiles" ON public.athlete_profile
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.friendship f
      WHERE (f.user_a = auth.uid() AND f.user_b = user_id)
         OR (f.user_b = auth.uid() AND f.user_a = user_id)
    )
  );
