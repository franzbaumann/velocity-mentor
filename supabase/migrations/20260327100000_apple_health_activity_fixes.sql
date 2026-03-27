-- Fix Apple Health sync:
-- 1. Add 'apple_health' to activity_source enum (must use DO block, can't run in transaction)
-- 2. Add unique constraint on (user_id, external_id) for Apple Health upsert

DO $$ BEGIN
  ALTER TYPE public.activity_source ADD VALUE IF NOT EXISTS 'apple_health';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.activity ADD CONSTRAINT activity_user_external_unique UNIQUE (user_id, external_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
