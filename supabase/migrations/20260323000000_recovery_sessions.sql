create table if not exists recovery_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  program_id text not null,
  program_title text not null,
  completed_at timestamptz default now(),
  duration_minutes int,
  exercises_completed int
);

alter table recovery_sessions enable row level security;

create policy "Users can manage own recovery sessions"
  on recovery_sessions for all using (auth.uid() = user_id);
