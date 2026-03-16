create table if not exists onboarding_progress (
  user_id uuid primary key references auth.users,
  step_completed integer default 0,
  intervals_connected boolean default false,
  garmin_connected boolean default false,
  historical_data_requested boolean default false,
  api_key_saved boolean default false,
  first_sync_completed boolean default false,
  completed_at timestamptz
);

alter table onboarding_progress enable row level security;

drop policy if exists "Users manage own progress" on onboarding_progress;
create policy "Users manage own progress" on onboarding_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
