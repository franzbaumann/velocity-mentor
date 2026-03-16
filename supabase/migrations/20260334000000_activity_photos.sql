-- Activity photos: JSONB column + storage bucket for user-uploaded photos on completed activities

ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]';

-- Storage bucket for activity photos (public read so friends can view via activity data)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('activity-photos', 'activity-photos', true, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Path: {user_id}/{activity_id}/{timestamp}_{filename}
-- INSERT: authenticated users, only to path where first folder = auth.uid()
DO $$ BEGIN
  CREATE POLICY "Users upload own activity photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'activity-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SELECT: allow public read (required for public bucket to serve files)
DO $$ BEGIN
  CREATE POLICY "Public read activity photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'activity-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DELETE: owner only (path starts with user_id)
DO $$ BEGIN
  CREATE POLICY "Users delete own activity photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'activity-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
