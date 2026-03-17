-- Season + Training Plan integration
-- end_goal_race_id: the peak race (e.g. Stockholm Marathon) the season builds toward
-- training_plan_id: the plan generated for this season
-- season_id on training_plan: reverse link for context

ALTER TABLE public.competition_season
  ADD COLUMN IF NOT EXISTS end_goal_race_id uuid REFERENCES public.season_race(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS training_plan_id uuid REFERENCES public.training_plan(id) ON DELETE SET NULL;

ALTER TABLE public.training_plan
  ADD COLUMN IF NOT EXISTS season_id uuid REFERENCES public.competition_season(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_competition_season_end_goal ON public.competition_season(end_goal_race_id);
CREATE INDEX IF NOT EXISTS idx_competition_season_training_plan ON public.competition_season(training_plan_id);
CREATE INDEX IF NOT EXISTS idx_training_plan_season ON public.training_plan(season_id);
