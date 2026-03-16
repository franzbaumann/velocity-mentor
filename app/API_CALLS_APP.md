# API-anrop i appen (`app/`)

Alla ställen där externa API:er eller Supabase (Edge + DB) anropas.

---

## 1. Edge Functions (Supabase)

### `callEdgeFunctionWithRetry` (supabase.functions.invoke med retry)

| Fil | Rad | Function | Action/syfte |
|-----|-----|----------|--------------|
| **useIntervalsSync.ts** | 93–95 | intervals-proxy | quick_sync (polling) |
| **useIntervalsSync.ts** | 211–213 | intervals-proxy | full_sync |
| **useIntervalsAutoSync.ts** | 38–40 | intervals-proxy | quick_sync (24h) |
| **useActivityStreamsSync.ts** | 66–68 | intervals-proxy | streams |
| **useActivityDetailMobile.ts** | 156–158 | intervals-proxy | gpx |
| **useActivityDetailMobile.ts** | 164–166 | intervals-proxy | activity_coach_note |
| **ActivityDetailScreen.tsx** | 255–257 | intervals-proxy | gpx |
| **ActivityDetailScreen.tsx** | 1299–1301 | intervals-proxy | activity_coach_note |
| **SettingsScreen.tsx** | 331–333 | intervals-proxy | (Intervals-sync, t.ex. full_sync) |
| **SettingsScreen.tsx** | 380–382 | intervals-proxy | (Intervals) |
| **SettingsScreen.tsx** | 414–416 | intervals-proxy | (Intervals) |
| **SessionDetailModal.tsx** | 397–399 | intervals-proxy | workout_coach_note |
| **CoachScreen.tsx** | 311–313 | coach-chat | extract_memories |
| **CoachScreen.tsx** | 515–517 | coach-opening | öppningsmeddelande |

### Direkt `fetch` mot Edge-URL

| Fil | Rad | URL | Syfte |
|-----|-----|-----|--------|
| **CoachScreen.tsx** | 218 | `CHAT_URL` = `${SUPABASE_URL}/functions/v1/coach-chat` | Chat (streaming) |
| **CoachScreen.tsx** | 650 | `GENERATE_PLAN_URL` = `${SUPABASE_URL}/functions/v1/coach-generate-plan` | Generera plan |
| **SettingsScreen.tsx** | 460 | `${SUPABASE_URL}/functions/v1/lab-extract` | Lab-extract |
| **PlanOnboardingScreen.tsx** | 480 | `PACEIQ_PHILOSOPHY_URL` | Filosofi-lista |
| **PlanOnboardingScreen.tsx** | 571 | `PACEIQ_GENERATE_PLAN_URL` | Generera plan (onboarding) |
| **useTrainingPlan.ts** | 33 | `COACH_CHAT_URL` | Chat för plan (t.ex. “justera plan”) |

---

## 2. Supabase DB (supabase.from)

| Fil | Tabell | Operation |
|-----|--------|-----------|
| **useDashboardData.ts** | (via useActivitiesList + useAthleteProfile) | select activities, athlete_profile, daily_readiness |
| **useDashboardData.ts** | – | select readiness-interval, athlete_profile |
| **useActivities.ts** | activity | select |
| **useAthleteProfile.ts** | athlete_profile | select, upsert |
| **useActivityDetailMobile.ts** | activity_streams, activity, … | select, upsert |
| **useActivityStreamsSync.ts** | activity_streams | select activity_id, upsert |
| **useTrainingPlan.ts** | training_plan, training_session, training_plan_workout, coach_message | select, update, insert |
| **useIntervalsIntegration.ts** | integration | select, upsert, delete |
| **SettingsScreen.tsx** | athlete_profile, training_plan, activity, daily_readiness, coaching_memory | select, update, insert, upsert, delete |
| **PlanOnboardingScreen.tsx** | athlete_profile, training_plan | upsert, update |
| **CoachScreen.tsx** | activity, daily_readiness, coach_message | select (kontext till coach) |
| **ActivityDetailScreen.tsx** | personal_records, activity | select, update |
| **lib/kipcoachee/plan.ts** | training_plan, training_plan_workout, training_session, activity | update, insert, delete, select |

---

## 3. Supabase Auth

| Fil | Anrop |
|-----|--------|
| **SupabaseProvider.tsx** | setSession, getSession, onAuthStateChange, signInWithOtp, signInWithPassword, signUp, signOut |
| **useDashboardData.ts** | getUser |
| **useIntervalsSync.ts** | getSession |
| **useIntervalsAutoSync.ts** | getSession |
| **useActivityDetailMobile.ts** | getUser, getSession |
| **useActivityStreamsSync.ts** | getUser, getSession |
| **useTrainingPlan.ts** | getSession, getUser |
| **useIntervalsIntegration.ts** | getUser |
| **useAthleteProfile.ts** | getUser |
| **useActivities.ts** | getUser |
| **CoachScreen.tsx** | getSession, getUser, refreshSession |
| **SettingsScreen.tsx** | getUser, getSession |
| **PlanOnboardingScreen.tsx** | getUser |
| **ActivityDetailScreen.tsx** | getUser, getSession |
| **lib/kipcoachee/plan.ts** | getUser |

---

## 4. Övriga anrop

| Fil | Rad | Vad | Kommentar |
|-----|-----|-----|-----------|
| **ActivitiesScreen.tsx** | 72, 139, 329, 466 | `fetch("http://127.0.0.1:7366/ingest/...")` | Debug/agent-logging till lokal ingest; bör vara borttagen eller bakom __DEV__ i produktion. |

---

## Sammanfattning

- **Edge:** 6 olika funktioner – intervals-proxy, coach-chat, coach-opening, coach-generate-plan (fetch), paceiq-philosophy, paceiq-generate-plan, lab-extract. De flesta via `callEdgeFunctionWithRetry`; Coach chat/plan och onboarding/lab-extract via `fetch`.
- **DB:** Alla anrop går via `supabase.from(...)` i hooks och skärmar (activity, daily_readiness, athlete_profile, training_plan, training_session, training_plan_workout, coach_message, coaching_memory, activity_streams, integration, personal_records).
- **Auth:** Session och användare hämtas via `supabase.auth` i SupabaseProvider och i de hooks/skärmar som behöver user/session.
- **Förbättring:** Ersätt `fetch(SUPABASE_URL/functions/v1/...)` med `callEdgeFunctionWithRetry` för coach-generate-plan, lab-extract och paceiq-* om du vill ha enhetlig retry/timeout och felhantering.
