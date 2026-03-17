-- Webhook: when a workout_invite is inserted, call on-invite-created to generate combined_workout
-- Uses pg_net for async HTTP POST (does not block the insert)

create extension if not exists pg_net;

create or replace function public.on_workout_invite_created()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://nhxwjaqhlbkdnageyavu.supabase.co/functions/v1/on-invite-created',
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'workout_invite',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', null
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 30000
  );
  return new;
end;
$$;

create trigger on_workout_invite_created
  after insert on public.workout_invite
  for each row
  execute function public.on_workout_invite_created();
