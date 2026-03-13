create table if not exists beta_signups (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz default now(),
  source text default 'landing_page'
);

alter table beta_signups enable row level security;

create policy "Anyone can insert" on beta_signups
  for insert with check (true);
