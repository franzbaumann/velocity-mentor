-- Add optional photo URL column for activities (used by mobile/web feed)
alter table public.activity
  add column if not exists photo_url text;

-- Create storage bucket for activity photos if it doesn't exist
insert into storage.buckets (id, name, public)
values ('activity-photos', 'activity-photos', true)
on conflict (id) do nothing;

-- Allow public read access to activity photos
create policy if not exists "Public read activity photos"
on storage.objects
for select
using (bucket_id = 'activity-photos');

-- Allow authenticated users to manage their own activity photos
create policy if not exists "Users manage own activity photos"
on storage.objects
for all
using (bucket_id = 'activity-photos' and auth.uid() = owner)
with check (bucket_id = 'activity-photos' and auth.uid() = owner);

