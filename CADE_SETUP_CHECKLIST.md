# Cade — End-of-Integration Checklist

Do these steps when you're ready to deploy/test the full Cade flow.

---

## 1. Run database migrations

Apply the migration in Supabase (local or remote):

**Option A — Supabase CLI (with Docker):**
```bash
supabase db reset
# or
supabase migration up
```

**Option B — Supabase Dashboard (remote):**
1. Open SQL Editor in your project
2. Run the contents of `supabase/migrations/20260313000000_paceiq_onboarding_training_plan.sql`

---

## 2. Supabase Auth URL Configuration (production signup)

For email confirmation links to work on production (not redirect to localhost):

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. **Authentication** → **URL Configuration**
3. **Site URL:** `https://caderunning.com` (or your production URL)
4. **Redirect URLs:** add `https://caderunning.com/auth` and `https://caderunning.com/**`
5. Keep `http://localhost:5173/auth` and `http://localhost:5173/**` for local dev

---

## 3. Set Supabase secrets (Edge Functions)

```bash
# Required: at least one of these
supabase secrets set GROQ_API_KEY=your_groq_key
supabase secrets set GEMINI_API_KEY=your_gemini_key
```

- **Groq:** https://console.groq.com (primary, faster)
- **Gemini:** https://aistudio.google.com (fallback)

---

## 3. Deploy Edge Functions

```bash
supabase functions deploy paceiq-philosophy
supabase functions deploy paceiq-generate-plan
```

---

## 4. Test full onboarding end-to-end

1. Sign in to the app
2. Go to `/coach` — you should see the onboarding flow (not chat)
3. Complete steps 1–9:
   - Step 1: Welcome → "Let's go"
   - Step 2: Select main goal
   - Step 3: Race date/time/distance (if goal is race-related)
   - Step 4: Fitness (slider or intervals.icu summary)
   - Step 5: Days per week + longest day
   - Step 6: Injuries (or "Nothing currently")
   - Step 7: Training history
   - Step 8: Philosophy recommendation → "Build my plan with this"
   - Step 9: Plan generation → success → "View my training plan"
4. Verify plan appears on `/plan`
5. Verify chat works after onboarding

---

## 5. Reset onboarding (for re-testing)

To re-run onboarding, reset in Supabase:

```sql
UPDATE athlete_profile
SET onboarding_complete = false, onboarding_answers = NULL
WHERE user_id = 'your-user-id';
```

---

## 6. Context-aware chat (post-onboarding)

When you open the Coach page after onboarding:
- **Workout context:** If you came from "Ask Coach Cade about this" on a workout, the input is pre-filled
- **Recent run:** "I see you ran Xkm today/yesterday. How did it feel?"
- **Upcoming workout:** "You've got [workout] tomorrow. Ready for it?"
- **Low HRV:** "Your HRV has been a bit low lately. How are you feeling?"
- **Default:** "Here's your week. What's on your mind?"

---

## 7. Files changed (reference)

- `supabase/migrations/20260313000000_paceiq_onboarding_training_plan.sql`
- `supabase/functions/paceiq-philosophy/index.ts`
- `supabase/functions/paceiq-generate-plan/index.ts`
- `supabase/config.toml`
- `src/components/OnboardingFlow.tsx`
- `src/pages/Coach.tsx`
- `src/pages/TrainingPlan.tsx`
- `src/hooks/useAthleteProfile.ts`
- `src/hooks/use-training-plan.ts`
- `src/integrations/supabase/types.ts`
