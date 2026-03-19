-- Vital wearables integration: add vital as activity source and vital_id for deduplication

DO $$ BEGIN
  ALTER TYPE public.activity_source ADD VALUE IF NOT EXISTS 'vital';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS vital_id TEXT;

DO $$ BEGIN
  ALTER TABLE public.activity ADD CONSTRAINT activity_user_vital_unique UNIQUE (user_id, vital_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
