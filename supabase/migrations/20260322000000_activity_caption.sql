-- Add optional caption column for activity posts (social feed)
alter table public.activity
  add column if not exists caption text;
