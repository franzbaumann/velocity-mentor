-- Add breakdown jsonb to daily_load for coach context
alter table daily_load add column if not exists breakdown jsonb;
