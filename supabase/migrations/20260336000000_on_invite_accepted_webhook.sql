-- Webhook: when a workout_invite is updated to status='accepted' and combined_workout is null,
-- call generate-on-accept to generate combined_workout server-side (e.g. for old invites)

create or replace function public.on_workout_invite_accepted()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'accepted' and new.combined_workout is null then
    perform net.http_post(
      url := 'https://nhxwjaqhlbkdnageyavu.supabase.co/functions/v1/generate-on-accept',
      body := jsonb_build_object(
        'type', 'UPDATE',
        'table', 'workout_invite',
        'schema', 'public',
        'record', to_jsonb(new),
        'old_record', to_jsonb(old)
      ),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 30000
    );
  end if;
  return new;
end;
$$;

create trigger on_workout_invite_accepted
  after update on public.workout_invite
  for each row
  execute function public.on_workout_invite_accepted();
