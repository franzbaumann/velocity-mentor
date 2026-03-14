-- Total Load Management (CNS System)

create table if not exists daily_load (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,

  -- Auto-populated from intervals.icu sync
  running_atl numeric,
  hrv_score numeric,
  sleep_hours numeric,
  sleep_score numeric,
  resting_hr numeric,

  -- User logged: other training
  other_training jsonb,
  -- format: [{ type: 'padel'|'gym'|'cycling'|'swimming'|'other',
  --            duration_min: 60,
  --            intensity: 'easy'|'moderate'|'hard',
  --            label: 'Padel with friends' }]

  -- User logged: life stress
  work_stress integer check (work_stress between 1 and 5),
  life_stress integer check (life_stress between 1 and 5),
  travel boolean default false,
  travel_note text,
  life_note text,

  -- User logged: subjective feel
  mood integer check (mood between 1 and 5),
  energy integer check (energy between 1 and 5),
  legs integer check (legs between 1 and 5),

  -- Calculated
  total_load_score numeric,
  recovery_score numeric,
  cns_status text check (cns_status in ('fresh','normal','loaded','overloaded','critical')),

  created_at timestamptz default now(),
  unique(user_id, date)
);

alter table daily_load enable row level security;

create policy "Users manage own daily load" on daily_load
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_daily_load_user_date on daily_load(user_id, date);

-- training_plan_workout: TLS adjustment tracking
alter table training_plan_workout
  add column if not exists tls_adjusted boolean default false,
  add column if not exists tls_adjustment_reason text,
  add column if not exists original_workout jsonb;
