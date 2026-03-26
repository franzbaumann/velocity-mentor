-- Add photos JSONB column for activity social feed (array of {url, fileName} entries)
-- Used by app community feature (useCommunity.ts, ActivityPostScreen.tsx, EditActivityModal.tsx)
-- Note: photo_url TEXT (added in 20260321) remains for single-URL backward compat
ALTER TABLE public.activity
  ADD COLUMN IF NOT EXISTS photos jsonb;
