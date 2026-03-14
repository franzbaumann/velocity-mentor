-- Add session library support to training_plan_workout
alter table training_plan_workout
  add column if not exists session_library_id text,
  add column if not exists target_pace_per_km text,
  add column if not exists structure_detail text,
  add column if not exists is_double_run boolean default false;

-- Add session library support to training_session (used by coach-generate-plan)
alter table training_session
  add column if not exists session_library_id text,
  add column if not exists structure_detail text,
  add column if not exists is_double_run boolean default false;

-- Add phase to training_week
alter table training_week
  add column if not exists phase text;

-- Add double-run preferences to athlete_profile
alter table athlete_profile
  add column if not exists double_runs_enabled boolean default false,
  add column if not exists double_run_days text[],
  add column if not exists double_run_duration integer;
