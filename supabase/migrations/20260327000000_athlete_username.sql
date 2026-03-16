-- Username for Community: unique, case-insensitive, used only for finding friends

ALTER TABLE public.athlete_profile
  ADD COLUMN IF NOT EXISTS username TEXT NULL;

ALTER TABLE public.athlete_profile
  DROP CONSTRAINT IF EXISTS athlete_profile_username_format;

ALTER TABLE public.athlete_profile
  ADD CONSTRAINT athlete_profile_username_format
  CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9_]{3,30}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_athlete_profile_username_lower
  ON public.athlete_profile (LOWER(username))
  WHERE username IS NOT NULL;

-- Update trigger so new signups get username from metadata (only if valid format)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_username TEXT := NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '');
  valid_username TEXT := NULL;
BEGIN
  IF raw_username IS NOT NULL AND raw_username ~ '^[a-zA-Z0-9_]{3,30}$' THEN
    valid_username := LOWER(raw_username);
  END IF;
  INSERT INTO public.athlete_profile (user_id, name, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, ''),
    valid_username
  );
  RETURN NEW;
END;
$$;
