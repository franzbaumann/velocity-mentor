-- Training plan tables for coach-generated plans that sync to Training Plan page

CREATE TABLE IF NOT EXISTS public.training_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  race_date DATE,
  race_type TEXT,
  target_time TEXT,
  weeks_total INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.training_week (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.training_plan(id) ON DELETE CASCADE NOT NULL,
  week_number INT NOT NULL,
  start_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.training_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID REFERENCES public.training_week(id) ON DELETE CASCADE NOT NULL,
  day_of_week INT NOT NULL,
  scheduled_date DATE,
  session_type TEXT NOT NULL,
  description TEXT NOT NULL,
  distance_km FLOAT,
  duration_min INT,
  pace_target TEXT,
  notes TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.training_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_week ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_session ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own plans" ON public.training_plan FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users manage own plan weeks" ON public.training_week FOR ALL
    USING (EXISTS (SELECT 1 FROM public.training_plan p WHERE p.id = plan_id AND p.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.training_plan p WHERE p.id = plan_id AND p.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users manage own plan sessions" ON public.training_session FOR ALL
    USING (EXISTS (SELECT 1 FROM public.training_week w JOIN public.training_plan p ON p.id = w.plan_id WHERE w.id = week_id AND p.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.training_week w JOIN public.training_plan p ON p.id = w.plan_id WHERE w.id = week_id AND p.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS update_training_plan_updated_at ON public.training_plan;
CREATE TRIGGER update_training_plan_updated_at
  BEFORE UPDATE ON public.training_plan FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_training_session_updated_at ON public.training_session;
CREATE TRIGGER update_training_session_updated_at
  BEFORE UPDATE ON public.training_session FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
