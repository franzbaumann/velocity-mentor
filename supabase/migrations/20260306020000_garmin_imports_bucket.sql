-- Storage bucket for Garmin ZIP uploads (server-side import flow)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('garmin-imports', 'garmin-imports', false, 524288000)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder: {user_id}/filename.zip
DO $$ BEGIN
  CREATE POLICY "Users upload own Garmin ZIP"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'garmin-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow users to read their own uploads (needed for Edge Function to verify before processing)
DO $$ BEGIN
  CREATE POLICY "Users read own Garmin uploads"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'garmin-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
