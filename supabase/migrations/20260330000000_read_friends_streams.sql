-- Allow users to read activity_streams rows of users they are friends with (for friend activity detail charts/data).
-- Does not remove the existing "Users manage own streams" policy.
-- Apply with: npx supabase db push (or run this migration in Supabase Dashboard SQL).

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
