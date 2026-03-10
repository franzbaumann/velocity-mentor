-- Replace partial unique indexes with full UNIQUE constraints so PostgREST
-- upsert (ON CONFLICT) works. Partial indexes cause 400 Bad Request because
-- Postgres requires the index predicate for ON CONFLICT; PostgREST can't send it.
-- Full UNIQUE allows multiple rows with NULL in the second column (SQL semantics).

DROP INDEX IF EXISTS public.idx_activity_strava;
DROP INDEX IF EXISTS public.idx_activity_garmin;

DO $$ BEGIN
  ALTER TABLE public.activity ADD CONSTRAINT activity_user_strava_unique UNIQUE (user_id, strava_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.activity ADD CONSTRAINT activity_user_garmin_unique UNIQUE (user_id, garmin_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
