# Alla ställen där API/cloud anropas

Översikt: var Supabase Edge Functions och externa API:er anropas (web `src/`, app `app/`, edge `supabase/functions/`).

---

## 1. Edge Functions som anropas från klient

### `intervals-proxy`
| Plats | Hur | Syfte |
|-------|-----|--------|
| **Web** | | |
| `src/hooks/useIntervalsIntegration.ts` | `supabase.functions.invoke("intervals-proxy")` | athlete, wellness |
| `src/hooks/useIntervalsSync.ts` | `supabase.functions.invoke("intervals-proxy")` | quick_sync, full_sync |
| `src/hooks/useActivityStreamsSync.ts` | `supabase.functions.invoke("intervals-proxy")` | streams |
| `src/hooks/useActivityDetail.ts` | `supabase.functions.invoke("intervals-proxy")` | gpx, activity_coach_note |
| `src/pages/ActivityDetail.tsx` | `supabase.functions.invoke("intervals-proxy")` | gpx, activity_coach_note |
| `src/pages/TrainingPlan.tsx` | `supabase.functions.invoke("intervals-proxy")` | activity_coach_note (session) |
| `src/pages/SettingsPage.tsx` | `supabase.functions.invoke("intervals-proxy")` | athlete, wellness, full_sync, quick_sync |
| `src/components/IntervalsAutoSync.tsx` | `.invoke("intervals-proxy")` | quick_sync (24h) |
| **App** | | |
| `app/hooks/useIntervalsSync.ts` | `callEdgeFunctionWithRetry({ functionName: "intervals-proxy" })` | quick_sync, full_sync |
| `app/hooks/useIntervalsAutoSync.ts` | `callEdgeFunctionWithRetry({ functionName: "intervals-proxy" })` | quick_sync |
| `app/hooks/useActivityStreamsSync.ts` | `callEdgeFunctionWithRetry({ functionName: "intervals-proxy" })` | streams |
| `app/hooks/useActivityDetailMobile.ts` | `callEdgeFunctionWithRetry({ functionName: "intervals-proxy" })` | gpx, activity_coach_note |
| `app/screens/ActivityDetailScreen.tsx` | `callEdgeFunctionWithRetry({ functionName: "intervals-proxy" })` | gpx, activity_coach_note |
| `app/screens/SettingsScreen.tsx` | `callEdgeFunctionWithRetry({ functionName: "intervals-proxy" })` | athlete, wellness, full_sync |
| `app/components/plan/SessionDetailModal.tsx` | `callEdgeFunctionWithRetry({ functionName: "intervals-proxy" })` | activity_coach_note |

### `coach-chat`
| Plats | Hur | Syfte |
|-------|-----|--------|
| **Web** | | |
| `src/pages/Coach.tsx` | `fetch(CHAT_URL)` i `streamChat()` | Chat (streaming) |
| `src/pages/Coach.tsx` | `supabase.functions.invoke("coach-chat")` | Alternativ invoke (icke-streaming?) |
| `src/hooks/use-training-plan.ts` | `fetch(CHAT_URL)` | Chat för planjustering |
| **App** | | |
| `app/screens/CoachScreen.tsx` | `fetch(CHAT_URL)` i `streamChatNative()` | Chat |
| `app/screens/CoachScreen.tsx` | `callEdgeFunctionWithRetry({ functionName: "coach-chat" })` | Chat (invoke med retry) |
| `app/hooks/useTrainingPlan.ts` | `COACH_CHAT_URL` (används vid plan-chat) | Samma base URL |

### `coach-opening`
| Plats | Hur |
|-------|-----|
| **Web** | `src/pages/Coach.tsx` → `supabase.functions.invoke("coach-opening")` |
| **App** | `app/screens/CoachScreen.tsx` → `callEdgeFunctionWithRetry({ functionName: "coach-opening" })` |

### `coach-generate-plan`
| Plats | Hur |
|-------|-----|
| **Web** | `src/pages/Coach.tsx` → `supabase.functions.invoke(GENERATE_PLAN_FN)` |
| **App** | `app/screens/CoachScreen.tsx` → `fetch(GENERATE_PLAN_URL, ...)` |

### `paceiq-philosophy` & `paceiq-generate-plan`
| Plats | Hur |
|-------|-----|
| **Web** | `src/components/OnboardingFlow.tsx` → `fetch(url)` (VITE_SUPABASE_URL + paceiq-philosophy / paceiq-generate-plan) |
| **Web** | `src/components/onboarding-v2/OnboardingV2.tsx` → samma `fetch(url)` |
| **App** | `app/screens/PlanOnboardingScreen.tsx` → `fetch(PACEIQ_PHILOSOPHY_URL)` och `fetch(PACEIQ_GENERATE_PLAN_URL)` |

### `strava-oauth`
| Plats | Hur |
|-------|-----|
| **Web** | `src/pages/StravaCallback.tsx` → `supabase.functions.invoke("strava-oauth")` |

### `strava-sync`
| Plats | Hur |
|-------|-----|
| **Web** | `src/integrations/strava.ts` → `fetch(SUPABASE_URL/functions/v1/strava-sync)` |

### `strava-save-personal-token`
| Plats | Hur |
|-------|-----|
| **Web** | `src/pages/SettingsPage.tsx` → `supabase.functions.invoke("strava-save-personal-token")` |
| **App** | Saknas (Strava-block ej kopplat) |

### `lab-extract`
| Plats | Hur |
|-------|-----|
| **Web** | `src/pages/SettingsPage.tsx` → `supabase.functions.invoke("lab-extract")` |
| **App** | `app/screens/SettingsScreen.tsx` → `fetch(SUPABASE_URL/functions/v1/lab-extract)` |

### Garmin (endast web)
| Plats | Hur |
|-------|-----|
| **Web** | `src/lib/garmin-import.ts` → `supabase.functions.invoke("garmin-parse-activities")` och `supabase.functions.invoke("garmin-import-zip")` |

---

## 2. Supabase (auth + DB) – inte “edge API” men cloud

- **Auth:** `supabase.auth.getSession()`, `getUser()`, `refreshSession()`, `onAuthStateChange()` – överallt där session behövs (hooks, Coach, Onboarding, ActivityDetail, Settings, etc.).
- **DB:** `supabase.from(...).select/insert/upsert/update` – t.ex. `useDashboardData`, `useAthleteProfile`, `useReadiness`, `useActivities`, `useActivityDetail`, `garmin-import.ts`, `use-training-plan`, `useIntervalsIntegration`, Edge Functions som skriver till tabeller.

---

## 3. Edge Functions som anropar externa API:er

### I `supabase/functions/intervals-proxy/index.ts`
- **intervals.icu:** `fetch("https://intervals.icu/api/v1/...")` – activity, streams, athlete, wellness, pbs, activities, intervals.
- **Rekursivt:** `fetch(SUPABASE_URL/functions/v1/intervals-proxy)` (långa full_sync) och egen `fnUrl`-variant.

### I `supabase/functions/coach-chat/index.ts` / `coach-generate-plan/index.ts`
- **Anthropic:** `fetch("https://api.anthropic.com/v1/messages", ...)`.
- **Lovable:** `fetch(..., Authorization: Bearer LOVABLE_API_KEY)`.
- **Groq / Gemini:** anrop från intervals-proxy (AI-coach_note) och coach-chat/coach-generate-plan.

### I `supabase/functions/strava-oauth/index.ts`
- **Strava:** `fetch("https://www.strava.com/oauth/token", ...)`.

### I `supabase/functions/intervals-proxy/index.ts` (AI)
- **Anthropic / Gemini / Groq:** för `activity_coach_note` och relaterade actions.

---

## 4. Övriga externa anrop (klient)

- **Web** `src/pages/ActivityDetail.tsx`: Leaflet CDN (marker icons) – inte app-API.
- **Web** `src/integrations/strava.ts`: endast `strava-sync` (Supabase Edge).

---

## Sammanfattning

| Typ | Var |
|-----|-----|
| **Edge invoke (web)** | useIntervalsIntegration, useIntervalsSync, useActivityStreamsSync, useActivityDetail, ActivityDetail, TrainingPlan, SettingsPage, IntervalsAutoSync, Coach (coach-chat, coach-opening, coach-generate-plan), StravaCallback, garmin-import |
| **Edge invoke (app)** | useIntervalsSync, useIntervalsAutoSync, useActivityStreamsSync, useActivityDetailMobile, ActivityDetailScreen, SettingsScreen, SessionDetailModal, CoachScreen (coach-chat, coach-opening), fetch coach-generate-plan och lab-extract |
| **Direct fetch till Edge (web)** | OnboardingFlow, OnboardingV2 (paceiq-*), Coach (CHAT_URL), use-training-plan (CHAT_URL), strava.ts (strava-sync) |
| **Direct fetch till Edge (app)** | PlanOnboardingScreen (paceiq-*), CoachScreen (CHAT_URL, GENERATE_PLAN_URL), SettingsScreen (lab-extract) |
| **Helpers** | `app/shared/supabase.ts`: `callEdgeFunctionWithRetry()` – används av app för intervals-proxy, coach-chat, coach-opening, lab-extract (Settings använder fetch för lab-extract). |

För enhetlighet kan du ersätta alla `fetch(SUPABASE_URL/functions/v1/...)` med `callEdgeFunctionWithRetry` (app) respektive `supabase.functions.invoke` (web) där det passar, så att timeout/retry och felhantering är samma överallt.
