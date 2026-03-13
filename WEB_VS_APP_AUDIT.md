# Deep Audit: Web (src/ + supabase/) vs Mobile App (app/)

**Scope:** Every file in `src/components/`, `src/pages/`, `src/hooks/`, `src/lib/`, `supabase/functions/`, `supabase/migrations/` compared to app equivalents. No code changes—audit only.

---

## 🆕 COMPLETELY MISSING FEATURES

| # | Feature/change name | Web file | App file | Type | What's different |
|---|---------------------|----------|----------|------|------------------|
| 1 | **Garmin import (ZIP/folder)** | `src/components/GarminImportBlock.tsx`, `src/lib/garmin-import.ts` | MISSING | MISSING | Web: drag‑and‑drop Garmin export ZIP or folder, client-side parse + `garmin-parse-activities` / `garmin-import-zip` edge functions. App has no Garmin import; only Intervals + Strava in Settings. |
| 2 | **Garmin import status / last import** | `src/hooks/useGarminImportStatus.ts` | MISSING | MISSING | Web: `useGarminImportStatus()`, `useGarminLastImportTs()`, `useGarminLastImportResult()`, `setGarminLastImport()`, `clearGarminLastImport()`, `formatLastImport()` (localStorage + custom event). App has no equivalent (would need AsyncStorage + app-specific API). |
| 3 | **Strava connection (OAuth + personal token)** | `src/pages/SettingsPage.tsx` (Strava block), `src/hooks/use-strava-connection.ts`, `syncStravaActivities`, `strava-save-personal-token` | `app/screens/SettingsScreen.tsx` (Strava row only) | MISSING | Web: Connect via OAuth, or paste personal token (strava-save-personal-token), sync button. App: "Connect Strava" row with no `onPress` / no OAuth or token flow. |
| 4 | **Activity streams background sync** | `src/hooks/useActivityStreamsSync.ts` | MISSING | MISSING | Web: `useActivityStreamsSync(activities, isConnected)` syncs missing streams to DB via intervals-proxy (streams action). App never triggers this; relies on web or on-demand in detail. |
| 5 | **Intervals auto quick-sync on load** | `src/components/IntervalsAutoSync.tsx` | MISSING | MISSING | Web: On app load, if intervals connected, runs quick_sync once per 24h (localStorage). App has no equivalent. |
| 6 | **useAthleteProfile hook** | `src/hooks/useAthleteProfile.ts` | MISSING (app uses inline query in useDashboardData) | PARTIAL | Web: Dedicated hook with `profile`, `update`, `completeOnboarding(answers)`, onboarding_answers. App: athlete_profile fetched inside useDashboardData only; no update/completeOnboarding API. |
| 7 | **Dedicated useReadiness hook** | `src/hooks/useReadiness.ts` | MISSING (app uses readiness inside useDashboardData) | PARTIAL | Web: Standalone `useReadiness(days)` with full ReadinessRow (id, readiness, vo2max, stress_score, mood, energy, muscle_soreness, etc.). App: Readiness fetched only in useDashboardData; no standalone hook. |
| 8 | **Race prediction modal (all distances)** | `src/pages/Index.tsx` (RacePredictionCard + Dialog) | `app/screens/HomeScreen.tsx` | PARTIAL | Web: Expandable RacePredictionCard with dialog showing 5K, 10K, Half, Marathon predictions. App uses race-prediction lib but may not have same modal/dialog UX. |
| 9 | **Database types (typed Supabase client)** | `src/integrations/supabase/types.ts` (Database) | MISSING | MISSING | Web: createClient<Database>(...) with full generated types. App: createClient() untyped; no app-side Database types. |

---

## 🔄 OUTDATED / PARTIALLY SYNCED

| # | Feature/change name | Web file | App file | Type | What's different |
|---|---------------------|----------|----------|------|------------------|
| 10 | **Onboarding answers: preferredDays** | `src/components/onboarding-v2/types.ts` (no preferredDays) | `app/screens/PlanOnboardingScreen.tsx` (has preferredDays) | PARTIAL | Web types don’t export preferredDays; web Step5 may still use it. App has preferredDays in state. Logic should be aligned. |
| 11 | **Activity detail: streams shape** | `src/hooks/useActivityDetail.ts` | `app/hooks/useActivityDetailMobile.ts` | OUTDATED | Web: ActivityStreams has velocity_smooth, watts, distance_km, temperature, respiration_rate; fetches activity_streams latlng, temperature, respiration_rate. App: ActivityStreams only time/heartrate/cadence/altitude/pace; doesn’t select or use latlng, temperature, respiration_rate from DB. |
| 12 | **Activity detail: persist streams** | `src/hooks/useActivityDetail.ts` | `app/hooks/useActivityDetailMobile.ts` | OUTDATED | Web upserts temperature, respiration_rate, latlng when persisting streams from proxy. App upsert omits latlng, temperature, respiration_rate. |
| 13 | **Activity list select columns** | `src/hooks/useActivities.ts` | `app/hooks/useActivities.ts` (useActivitiesList) | OUTDATED | Web: selects max_hr, splits, hr_zones, hr_zone_times, external_id, icu_training_load, trimp. App: selects id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, source, external_id — missing max_hr, splits, hr_zones, hr_zone_times, icu_training_load, trimp. |
| 14 | **ReadinessRow type and resolveCtlAtlTsb** | `src/hooks/useReadiness.ts` (ReadinessRow + resolveCtlAtlTsb) | `app/hooks/useDashboardData.ts` (ReadinessRow), `app/lib/chatStatDetection.ts` | OUTDATED | Web ReadinessRow: id, readiness, vo2max, stress_score, mood, energy, muscle_soreness, icu_ramp_rate. App ReadinessRow type: no id, no readiness, no stress/mood/energy/muscle_soreness. App chatStatDetection buildFitnessData uses r.ctl/r.atl/r.tsb directly, not resolveCtlAtlTsb — so icu_ctl/icu_atl/icu_tsb fallbacks not used. buildSleepData uses r.score, not sleep_score. |
| 15 | **Stat detection / chat chart data** | `src/lib/stat-detection.ts` | `app/lib/chatStatDetection.ts` | OUTDATED | Web: resolveCtlAtlTsb in deduplicateByDate and buildFitnessData; buildSleepData uses sleep_score; buildVO2maxData; dedupe uses icu_* and sleep_score. App: no resolveCtlAtlTsb in buildFitnessData/buildSleepData; dedupe doesn’t consider icu_*; buildSleepData uses score not sleep_score. |
| 16 | **Training plan load: columns** | `src/hooks/use-training-plan.ts` (select "*") | `app/hooks/useTrainingPlan.ts` (explicit select) | PARTIAL | Web loads full plan row (includes is_active, start_date, end_date, goal_race if present). App selects id, plan_name, philosophy, race_type, goal_date, race_date, goal_time, target_time — missing is_active, start_date, end_date, goal_race. |
| 17 | **Training session columns** | `src/hooks/use-training-plan.ts` | `app/hooks/useTrainingPlan.ts` | PARTIAL | Web session has target_hr_zone, completed_at, tss_estimate from training_session / workout. App selects target_hr_zone, completed_at but not tss_estimate for session from training_session (has it for workout). completed_activity_id not selected/used on either. |
| 18 | **Athlete profile select** | `src/hooks/useAthleteProfile.ts` (select "*") | `app/hooks/useDashboardData.ts` (athlete_profile select) | OUTDATED | Web gets all columns (incl. lt1_hr, lt1_pace, zone_source, lab_test_date, lab_name from schema_additions). App selects name, goal_race, max_hr, resting_hr, vo2max, lactate_threshold_hr, lactate_threshold_pace, vlamax, max_hr_measured — missing lt1_hr, lt1_pace, zone_source, lab_test_date, lab_name. |
| 19 | **format.ts helpers** | `src/lib/format.ts` | `app/lib/format.ts` | PARTIAL | Web: formatCadence, formatElevation, formatHr, formatNumber. App: missing these. |
| 20 | **use-training-plan toast vs Alert** | `src/hooks/use-training-plan.ts` | `app/hooks/useTrainingPlan.ts` | UI | Web: toast on reschedule/markDone success. App: Alert.alert on error only; no success toast. |
| 21 | **OnboardingV2 step order / getStepOrder** | `src/components/onboarding-v2/types.ts` | `app/screens/PlanOnboardingScreen.tsx` | SYNCED | Logic matches (GOALS_NEED_RACE, STEP_ORDER_WITH_RACE / WITHOUT_RACE). |

---

## 🗄️ SUPABASE CHANGES (new functions, tables, columns)

| # | Feature/change name | Web file | App file | Type | What's different |
|---|---------------------|----------|----------|------|------------------|
| 22 | **activity table (migrations)** | Migrations: schema_additions, intervals_full_metrics | App selects | OUTDATED | New/added columns: external_id, lap_splits, icu_training_load, trimp, hr_zone_times, pace_zone_times, perceived_exertion, icu_vo2max_estimate, icu_lactate_threshold_hr, icu_lactate_threshold_pace, tss, intensity_factor. App activity list doesn’t select all; detail does for ICU. |
| 23 | **activity_streams (migrations)** | 20260309130000, 20260309140000 (distance) | App useActivityDetailMobile | OUTDATED | Streams table has time, heartrate, cadence, altitude, pace, distance, latlng (if added elsewhere). App doesn’t request latlng, temperature, respiration_rate in stream select or upsert. |
| 24 | **daily_readiness (migrations)** | intervals_full_metrics: stress_score, mood, energy, muscle_soreness; 20260317000000: vo2max | App useDashboardData | PARTIAL | App select includes stress_score, mood, energy, muscle_soreness, vo2max. Types in app don’t declare all. |
| 25 | **athlete_profile (migrations)** | intervals_full_metrics: lt1_hr, lt1_pace, zone_source; schema_additions: vo2max, lactate_threshold_*, vlamax, max_hr_measured, lab_test_date, lab_name | App useDashboardData | OUTDATED | App doesn’t select lt1_hr, lt1_pace, zone_source, lab_test_date, lab_name. |
| 26 | **training_plan (migrations)** | schema_additions: plan_name, philosophy, goal_race, goal_date, goal_time, is_active, start_date, end_date | App useTrainingPlan | PARTIAL | App selects plan_name, philosophy, goal_date, race_date, goal_time, target_time but not is_active, start_date, end_date, goal_race. |
| 27 | **training_session (migrations)** | schema_additions: target_hr_zone, tss_estimate, completed_activity_id, workout_type; 20260306010000: completed_at | App useTrainingPlan | PARTIAL | App uses target_hr_zone, completed_at; tss_estimate and completed_activity_id not used in session mapping. |
| 28 | **race_predictions table** | supabase/migrations/20260309140000_schema_additions.sql | Not used in app | MISSING | Table exists; web types reference it. Neither web nor app code found writing/reading it; could be future use. |
| 29 | **coaching_memory table** | Migrations + SettingsPage + Coach | App SettingsScreen | SYNCED | Both load/delete coaching_memory. |
| 30 | **coach_message.message_type, activity_id** | Migrations + Coach.tsx / CoachScreen | App CoachScreen | SYNCED | Both select message_type, activity_id and filter post_workout_analysis. |
| 31 | **Edge: garmin-import-zip, garmin-parse-activities** | src/lib/garmin-import.ts | Not used in app | MISSING | App has no Garmin import flow. |
| 32 | **Edge: strava-save-personal-token** | src/pages/SettingsPage.tsx | Not used in app | MISSING | App has no personal-token Strava flow. |
| 33 | **Edge: lab-extract** | src/pages/SettingsPage.tsx | app/screens/SettingsScreen.tsx (fetch to URL) | SYNCED | Both call lab-extract (web invoke, app fetch). |
| 34 | **Edge: coach-chat, coach-opening, coach-generate-plan** | src/pages/Coach.tsx, use-training-plan | app/screens/CoachScreen.tsx, app/hooks/useTrainingPlan.ts | SYNCED | Both use coach-chat, coach-opening, coach-generate-plan. |
| 35 | **Edge: intervals-proxy** | Multiple (web + app) | App | SYNCED | Both use intervals-proxy (activity, streams, quick_sync, etc.). |
| 36 | **Edge: strava-oauth** | src/pages/StravaCallback.tsx | app/screens/StravaCallbackScreen.tsx (assumed) | PARTIAL | Web handles OAuth callback. App has StravaCallbackScreen; Settings "Connect Strava" not wired. |
| 37 | **Storage: garmin-imports bucket** | supabase/migrations/20260306020000_garmin_imports_bucket.sql | Not used in app | MISSING | Used by web Garmin ZIP upload; app has no Garmin import. |

---

## 🎨 UI CHANGES (web UI updated but app not)

| # | Feature/change name | Web file | App file | Type | What's different |
|---|---------------------|----------|----------|------|------------------|
| 38 | **Garmin import banner / last import** | GarminImportBlock + useGarminImportStatus | N/A | MISSING | Web shows “Garmin data is X days old” and last import result; app has no Garmin UI. |
| 39 | **Settings: Strava block** | SettingsPage (connect, token paste, sync) | SettingsScreen (row, no onPress) | MISSING | App Strava row is non-functional. |
| 40 | **Index RacePredictionCard dialog** | Index.tsx (Dialog with all distances) | HomeScreen | PARTIAL | Confirm app has equivalent modal for all race predictions. |
| 41 | **Training plan toast on success** | use-training-plan (toast) | useTrainingPlan (no success feedback) | UI | App only shows Alert on error. |

---

## 🔧 LOGIC/DATA CHANGES (hooks, queries, calculations)

| # | Feature/change name | Web file | App file | Type | What's different |
|---|---------------------|----------|----------|------|------------------|
| 42 | **resolveCtlAtlTsb for readiness** | useReadiness + stat-detection | useStatsData has local resolveCtlAtlTsb; chatStatDetection doesn’t use it | OUTDATED | App chatStatDetection buildFitnessData/buildSleepData don’t use resolveCtlAtlTsb; CTL/ATL/TSB from icu_* won’t show. |
| 43 | **useMergedIntervalsData / useMergedActivities / useMergedReadiness** | src/hooks/useMergedIntervalsData.ts | MISSING | LOW | Thin wrappers over useActivities/useReadiness; app uses useDashboardData instead. |
| 44 | **generate-plan.ts (buildPlanFromIntake)** | src/lib/generate-plan.ts | N/A (app uses coach-generate-plan) | N/A | Web has client-side buildPlanFromIntake; plan generation on app goes through edge. |
| 45 | **kipcoachee (system-prompt, types, index)** | src/lib/kipcoachee/ | app/lib/kipcoachee/plan.ts | PARTIAL | Web has system-prompt, types, index; app has plan.ts (extractPlanJson / stripPlanJson). Shared coach-plan exists. Align kipcoachee surface if needed. |
| 46 | **analytics (StatsActivity, inferRunType, etc.)** | src/lib/analytics.ts | app/lib/analytics.ts | PARTIAL | App StatsActivity has icu_training_load, trimp; web uses ActivityRow & type. Both have computeFitnessCurves, parsePaceToMinPerKm, etc. Web has inferRunType, findBestForDistance, PR_DISTANCES — verify app has same exports. |
| 47 | **race-prediction** | shared/race-prediction.ts (via src/lib) | app/lib/race-prediction.ts (re-export shared) | SYNCED | Both use shared. |
| 48 | **Readiness id in row** | useReadiness returns id per row | useDashboardData ReadinessRow type has no id | PARTIAL | App type omits id; DB returns it. |

---

## Summary counts

- **MISSING (no app equivalent):** 9
- **OUTDATED / PARTIAL (app exists but behind):** 22
- **SUPABASE (migrations/functions):** 16 items (some synced, some missing/outdated)
- **UI / logic:** 6

---

## PRIORITY ORDER

### HIGH (breaks core functionality or major gap)

1. **Strava connection on app** — Connect Strava + optional personal token (Settings). Without this, app users can’t link Strava.
2. **Activity list columns (app)** — Add max_hr, splits, hr_zones, hr_zone_times, icu_training_load, trimp to useActivitiesList select so list and downstream (e.g. dashboard, stats) stay in sync with web.
3. **Readiness / CTL–ATL–TSB fallbacks** — Use resolveCtlAtlTsb in app chatStatDetection (and wherever readiness is used for fitness charts) so icu_ctl/icu_atl/icu_tsb and sleep_score are used when main columns are null.
4. **Activity detail streams** — App activity_streams select and upsert should include latlng, temperature, respiration_rate to match web and DB.

### MEDIUM (important feature gap)

5. **Garmin import on app** — Full feature (ZIP upload + edge functions + status) or at least document “use web for Garmin import.”
6. **Garmin import status hook (app)** — If Garmin import is added, implement AsyncStorage-based status + last-import API.
7. **useActivityStreamsSync (app)** — Trigger stream sync for intervals activities so new activities get streams without opening each detail.
8. **Athlete profile** — App to select and use lt1_hr, lt1_pace, zone_source, lab_test_date, lab_name; consider dedicated useAthleteProfile with update/completeOnboarding.
9. **Training plan columns** — App to load/use is_active, start_date, end_date, goal_race; session tss_estimate, completed_activity_id where relevant.
10. **Intervals auto quick-sync** — Optional: run quick_sync once per 24h on app open (with local storage/AsyncStorage).

### LOW (nice to have / cosmetic)

11. **Database types for app** — Generate or share Database type for app Supabase client.
12. **format.ts** — Add formatCadence, formatElevation, formatHr, formatNumber to app.
13. **Race prediction modal** — Ensure app has equivalent of web’s all-distances dialog.
14. **Training plan success feedback** — Toast or inline success after reschedule/mark done.
15. **useMergedIntervalsData** — Only if app needs same wrapper API as web.
16. **race_predictions table** — Use only if you add persistence for predictions.

---

*Audit completed; no code changes applied. Review and then decide what to sync.*
