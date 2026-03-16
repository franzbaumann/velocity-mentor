-- Allow users to delete workout invites they sent or received
DROP POLICY IF EXISTS "Users delete own invites" ON public.workout_invite;
CREATE POLICY "Users delete own invites" ON public.workout_invite
  FOR DELETE USING (auth.uid() IN (from_user, to_user));
