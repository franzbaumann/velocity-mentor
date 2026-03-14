-- Competition Season tables

create table if not exists competition_season (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  season_type text not null,
  start_date date not null,
  end_date date not null,
  primary_distance text,
  status text default 'active',
  notes text,
  created_at timestamptz default now()
);

create table if not exists season_race (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references competition_season on delete cascade not null,
  user_id uuid references auth.users not null,
  name text not null,
  date date not null,
  distance text not null,
  venue text,
  surface text,
  priority text not null,
  goal_time text,
  actual_time text,
  actual_place integer,
  notes text,
  status text default 'upcoming',
  activity_id text,
  created_at timestamptz default now()
);

create table if not exists season_performance (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references competition_season on delete cascade not null,
  user_id uuid references auth.users not null,
  date date not null,
  ctl_at_date numeric,
  atl_at_date numeric,
  tsb_at_date numeric,
  hrv_at_date numeric,
  note text,
  created_at timestamptz default now()
);

-- RLS
alter table competition_season enable row level security;
alter table season_race enable row level security;
alter table season_performance enable row level security;

create policy "Users manage own seasons" on competition_season
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own races" on season_race
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own performance" on season_performance
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Indexes for common queries
create index if not exists idx_competition_season_user on competition_season(user_id);
create index if not exists idx_season_race_season on season_race(season_id);
create index if not exists idx_season_race_user on season_race(user_id);
create index if not exists idx_season_performance_season on season_performance(season_id);
