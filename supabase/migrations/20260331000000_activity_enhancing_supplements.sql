-- Enhancing supplements on activities (Beetroot, BiCarb, Caffeine, Carbs) for notes/coach context
-- JSONB shape: { beetroot?: { value: number, unit: "ml"|"mg" }, bicarb?: { value: number, unit: "g" }, caffeine?: { value: number, unit: "mg" }, carbs?: { value: number, unit: "g" } }
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS enhancing_supplements JSONB DEFAULT '{}';
