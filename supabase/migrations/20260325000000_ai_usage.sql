-- ai_usage: daily message count per user for beta limits
create table if not exists ai_usage (
  user_id uuid references auth.users not null,
  date date not null default current_date,
  messages_used integer not null default 0,
  primary key (user_id, date)
);

-- Index for fast daily lookups
create index if not exists ai_usage_user_date
  on ai_usage (user_id, date);

-- RLS: users can read their own usage only
alter table ai_usage enable row level security;

create policy "Users can read own ai_usage"
  on ai_usage for select
  using (auth.uid() = user_id);

-- Atomic increment to avoid race conditions
create or replace function increment_ai_usage(p_user_id uuid, p_date date)
returns void as $$
begin
  insert into ai_usage (user_id, date, messages_used)
  values (p_user_id, p_date, 1)
  on conflict (user_id, date)
  do update set messages_used = ai_usage.messages_used + 1;
end;
$$ language plpgsql security definer;
