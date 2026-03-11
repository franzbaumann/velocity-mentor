-- Stripe subscription columns on athlete_profile
alter table athlete_profile add column if not exists stripe_customer_id text;
alter table athlete_profile add column if not exists subscription_status text default 'free';
alter table athlete_profile add column if not exists subscription_plan text;
alter table athlete_profile add column if not exists subscription_period_end timestamptz;
alter table athlete_profile add column if not exists trial_end timestamptz;

-- Subscription event log
create table if not exists subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  event_type text not null,
  stripe_event_id text unique,
  data jsonb,
  created_at timestamptz default now()
);

alter table subscription_events enable row level security;

create policy "Users can read own subscription events"
  on subscription_events for select
  using (auth.uid() = user_id);

create index if not exists idx_subscription_events_user_id on subscription_events(user_id);
create index if not exists idx_athlete_profile_stripe_customer on athlete_profile(stripe_customer_id);
