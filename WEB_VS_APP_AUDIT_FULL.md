# Complete Web vs App Audit (Read-Only)

**Scope:** `src/components/`, `src/pages/`, `src/hooks/`, `src/lib/`, `src/types/`, `supabase/functions/`, `supabase/migrations/` vs `app/`. No code changed.

---

## 🆕 NEW FEATURES (exist on web, completely missing in app)

- **Garmin import (ZIP/folder drag-drop)**
  - Web file: `src/components/GarminImportBlock.tsx`, `src/lib/garmin-import.ts`
  - App file: MISSING
  - Description: Drag-drop Garmin export ZIP or folder; client parse + `garmin-parse-activities` / `garmin-import-zip` edge functions. App has no Garmin import UI; only Intervals + Strava in Settings.

- **Garmin import status (last import banner, result)**
  - Web file: `src/hooks/useGarminImportStatus.ts`
  - App file: MISSING
  - Description: `useGarminImportStatus()`, `useGarminLastImportTs()`, `useGarminLastImportResult()`, `setGarminLastImport()`, `clearGarminLastImport()`, `formatLastImport()` (localStorage + custom event). App has no equivalent (would need AsyncStorage).

- **Strava connection (OAuth + personal token + sync)**
  - Web file: `src/pages/SettingsPage.tsx` (Strava block), `src/hooks/use-strava-connection.ts`, `strava-save-personal-token` invoke
  - App file: `app/screens/SettingsScreen.tsx` (Strava row only, no onPress / no OAuth or token flow)
  - Description: Web: Connect via OAuth, or paste personal token (strava-save-personal-token), sync button. App: "Connect Strava" row is non-functional (no handler).

- **Dedicated useReadiness hook**
  - Web file: `src/hooks/useReadiness.ts`
  - App file: MISSING (app uses readiness inside useDashboardData only)
  - Description: Standalone `useReadiness(days)` with full ReadinessRow (id, readiness, vo2max, stress_score, mood, energy, muscle_soreness, resolveCtlAtlTsb). App has no standalone hook.

- **Dedicated useAthleteProfile hook**
  - Web file: `src/hooks/useAthleteProfile.ts`
  - App file: MISSING (app uses inline query in useDashboardData)
  - Description: Web: dedicated hook with `profile`, `update`, `completeOnboarding(answers)`, onboarding_answers. App: athlete_profile only inside useDashboardData; no update/completeOnboarding API.

- **Client-side generate-plan (buildPlanFromIntake)**
  - Web file: `src/lib/generate-plan.ts`
  - App file: MISSING (app uses coach-generate-plan edge only)
  - Description: Web has client-side `buildPlanFromIntake(intake)` for plan structure; app relies entirely on edge for plan generation.

- **IntervalsAutoSync component (web-only pattern)**
  - Web file: `src/components/IntervalsAutoSync.tsx`
  - App file: N/A (app has `useIntervalsAutoSync` hook used in HomeScreen — equivalent behavior)
  - Description: Web uses a component that runs quick_sync once per 24h on load; app uses hook in HomeScreen. Functionally equivalent; only pattern differs (component vs hook).

- **Typed Supabase client (Database types)**
  - Web file: `src/integrations/supabase/types.ts` (or generated)
  - App file: `app/lib/supabase-types.ts` (has tables but app may use untyped createClient)
  - Description: Web uses createClient<Database>(...) with full generated types. App has supabase-types; ensure client is typed if needed.

- **useIntervalsId hook**
  - Web file: `src/hooks/useIntervalsId.ts`
  - App file: MISSING (app stores athlete ID in useIntervalsIntegration / form state)
  - Description: Web: localStorage-backed athlete ID state. App uses integration form state; no standalone hook (low impact).

---

## 🔄 UPDATED FEATURES (exist in both but web is ahead)

- **Activity detail: streams shape and persist**
  - Web file: `src/hooks/useActivityDetail.ts`
  - App file: `app/hooks/useActivityDetailMobile.ts`
  - Description: Web ActivityStreams has velocity_smooth, watts, distance_km, temperature, respiration_rate; fetches and upserts activity_streams with latlng, temperature, respiration_rate. App: ActivityStreams has pace, temperature, respiration_rate, latlng but upsert/select may omit some; align with web and DB columns.

- **Activity list select columns**
  - Web file: `src/hooks/useActivities.ts`
  - App file: `app/hooks/useActivities.ts` (useActivitiesList)
  - Description: Both now select max_hr, splits, hr_zones, hr_zone_times, external_id, icu_training_load, trimp. App useActivitiesList is in sync; verify activity table newer columns (lap_splits, pace_zone_times, perceived_exertion, tss, intensity_factor, icu_vo2max_estimate, etc.) if list or detail need them.

- **ReadinessRow type and resolveCtlAtlTsb in stat/chart builders**
  - Web file: `src/hooks/useReadiness.ts`, `src/lib/stat-detection.ts`
  - App file: `app/hooks/useDashboardData.ts` (ReadinessRow), `app/lib/chatStatDetection.ts`
  - Description: Web ReadinessRow has id, readiness, vo2max, stress_score, mood, energy, muscle_soreness, icu_ramp_rate; stat-detection uses resolveCtlAtlTsb in dedupe and buildFitnessData; buildSleepData uses sleep_score. App ReadinessRow in useDashboardData has stress/mood/energy/muscle_soreness/vo2max; chatStatDetection has local resolveCtlAtlTsb in useStatsData but buildFitnessData/buildSleepData in chatStatDetection use resolveCtlAtlTsb — verify dedupe and buildSleepData use sleep_score and icu_* fallbacks consistently.

- **Stat detection / chat chart data (dedupe and sleep_score)**
  - Web file: `src/lib/stat-detection.ts`
  - App file: `app/lib/chatStatDetection.ts`
  - Description: Web deduplicateByDate uses icu_* and sleep_score in countNonNull; buildSleepData uses sleep_score ?? sleep_hours. App deduplicateByDate uses resolveCtlAtlTsb and score/sleep_score; buildSleepData uses sleep_score ?? score ?? sleep_hours. Minor alignment: ensure buildSleepData and buildVO2maxData match web when readiness has icu_* or sleep_score.

- **Training plan load: columns**
  - Web file: `src/hooks/use-training-plan.ts` (select "*")
  - App file: `app/hooks/useTrainingPlan.ts`
  - Description: Web gets full plan (is_active, start_date, end_date, goal_race, etc.). App selects plan_name, philosophy, goal_date, race_date, goal_time, target_time but may omit is_active, start_date, end_date, goal_race. Add missing columns if UI or logic need them.

- **Training session columns**
  - Web file: `src/hooks/use-training-plan.ts`
  - App file: `app/hooks/useTrainingPlan.ts`
  - Description: Web session has target_hr_zone, tss_estimate, completed_activity_id, workout_type. App uses target_hr_zone, completed_at; ensure tss_estimate and completed_activity_id are selected/used where relevant.

- **Athlete profile select**
  - Web file: `src/hooks/useAthleteProfile.ts` (select "*")
  - App file: `app/hooks/useDashboardData.ts`, SettingsScreen (athlete_profile select)
  - Description: Web gets all columns (lt1_hr, lt1_pace, zone_source, lab_test_date, lab_name). App selects max_hr, resting_hr, vo2max, lactate_threshold_hr, lactate_threshold_pace, vlamax, max_hr_measured, lab_test_date, lab_name — may omit lt1_hr, lt1_pace, zone_source. Add if zones or display need them.

- **Race prediction: persistence**
  - Web file: `src/pages/Index.tsx` (RacePredictionCard — inline computation, no persistence)
  - App file: `app/screens/HomeScreen.tsx`, `app/hooks/useRacePredictions.ts`
  - Description: Web shows RacePredictionCard with dialog for all distances but does not persist to race_predictions table. App uses useRacePredictions and persists to race_predictions. App is ahead on persistence; ensure web can optionally persist if desired.

- **Onboarding: preferredDays and step order**
  - Web file: `src/components/onboarding-v2/types.ts`, steps (Step5Availability etc.)
  - App file: `app/screens/PlanOnboardingScreen.tsx`
  - Description: App has preferredDays in state; web types may not export it. Align step order and preferredDays handling between web and app.

- **Training plan success feedback**
  - Web file: `src/hooks/use-training-plan.ts` (toast on reschedule/markDone)
  - App file: `app/hooks/useTrainingPlan.ts`
  - Description: Web uses toast on success. App uses Alert on error only; no success toast. Add success feedback on app for consistency.

---

## 🗄️ NEW SUPABASE CHANGES

### New tables
- **race_predictions** — `20260309140000_schema_additions.sql`. Used by app (useRacePredictions); web Index does not persist (inline only).
- **coaching_memory** — `20260318000000_coaching_memory_and_message_activity.sql`. Both web and app load/delete in Settings; coach-chat and coach-opening use it.

### New columns (existing tables)
- **activity:** external_id, lap_splits, icu_training_load, trimp, hr_zone_times, pace_zone_times, perceived_exertion (schema_additions); icu_vo2max_estimate, icu_lactate_threshold_hr, icu_lactate_threshold_pace, tss, intensity_factor (intervals_full_metrics). App activity list/detail should select what’s needed.
- **activity_streams:** distance (schema_additions). App streams select/upsert should include distance where used; also latlng, temperature, respiration_rate if added by migrations or proxy.
- **daily_readiness:** stress_score, mood, energy, muscle_soreness (intervals_full_metrics); vo2max (20260317000000_daily_readiness_vo2max). App useDashboardData / useStatsData and types include these; ensure selects and chart builders use them.
- **athlete_profile:** vo2max, lactate_threshold_hr, lactate_threshold_pace, vlamax, max_hr_measured, lab_test_date, lab_name (schema_additions); lt1_hr, lt1_pace, zone_source (intervals_full_metrics). App should select and use in zones/display.
- **training_plan:** plan_name, philosophy, goal_race, goal_date, goal_time, is_active, start_date, end_date (schema_additions). App should load is_active, start_date, end_date, goal_race if needed.
- **training_session:** target_hr_zone, tss_estimate, completed_activity_id, workout_type (schema_additions); completed_at (20260306010000). App uses target_hr_zone, completed_at; add tss_estimate, completed_activity_id where relevant.
- **coach_message:** message_type (schema_additions); activity_id (20260318000000). Both use message_type and activity_id.

### New edge functions (usage)
- **garmin-parse-activities, garmin-import-zip** — Web only (garmin-import.ts). App: not used.
- **strava-save-personal-token** — Web Settings only. App: not used (no personal token flow).
- **lab-extract** — Web (invoke) and app (fetch). Synced.
- **coach-chat, coach-opening, coach-generate-plan** — Both. Synced.
- **intervals-proxy** — Both (quick_sync, full_sync, streams, activity detail, etc.). Synced.
- **strava-oauth** — Web StravaCallback; app has StravaCallbackScreen but Settings “Connect Strava” not wired.

### Storage
- **garmin-imports bucket** — `20260306020000_garmin_imports_bucket.sql`. Web only (Garmin ZIP upload). App: N/A.

### Migrations (chronological)
- 20260220181416 — initial
- 20260221000000 — strava oauth view policy
- 20260305085256 — (check name)
- 20260306000000 — training_plan tables
- 20260306010000 — training_session completed
- 20260306020000 — garmin_imports_bucket
- 20260309120000 — activity upsert constraints
- 20260309130000 — activity_streams
- 20260309140000 — schema_additions (activity, streams distance, training_plan/session, race_predictions, athlete_profile lab, coach_message message_type)
- 20260316000000 — intervals_full_metrics (activity, daily_readiness, athlete_profile, personal_records)
- 20260317000000 — daily_readiness vo2max
- 20260318000000 — coaching_memory, coach_message activity_id

---

## 🎨 UI UPDATES (web UI changed but app not updated)

- **Garmin import block and banner**
  - Web: GarminImportBlock with drag-drop, progress, last import result, “Garmin data is X days old” banner.
  - App: No Garmin UI.

- **Settings: Strava block**
  - Web: Full block — connect OAuth, paste personal token, sync, disconnect.
  - App: “Connect Strava” row with no onPress / no flow.

- **Index/Dashboard: Race prediction card and dialog**
  - Web: RacePredictionCard with dialog showing all distances (5K, 10K, Half, Marathon); no persistence.
  - App: useRacePredictions + race modal on HomeScreen; persists to race_predictions. Confirm app modal shows same distances and similar UX.

- **Training plan: success toast**
  - Web: Toast on reschedule / mark done success.
  - App: No success feedback; only error Alert.

- **Onboarding V2 (web) vs PlanOnboarding (app)**
  - Both have multi-step flows. Web: OnboardingV2 with steps 1–9, ProgressBar, philosophy API, plan generation. App: PlanOnboardingScreen with similar steps and types. Align preferredDays, step order, and any new web-only steps or copy.

---

## 🔧 LOGIC/DATA UPDATES (new hooks, queries, calculations)

- **useMergedIntervalsData (useMergedActivities, useMergedReadiness)**
  - Web file: `src/hooks/useMergedIntervalsData.ts`
  - App file: MISSING (app uses useDashboardData / useActivitiesList and readiness inside useDashboardData)
  - Description: Web thin wrappers over useActivities/useReadiness. App uses different structure; add only if app needs same API.

- **resolveCtlAtlTsb and readiness fallbacks**
  - Web: useReadiness + stat-detection use resolveCtlAtlTsb and icu_ctl/icu_atl/icu_tsb, sleep_score.
  - App: useStatsData has resolveCtlAtlTsb; chatStatDetection uses it. Ensure buildFitnessData, buildSleepData, buildVO2maxData and dedupe logic match web (icu_* and sleep_score) everywhere.

- **analytics (getRunTypeLabelForDisplay)**
  - Web file: `src/lib/analytics.ts`
  - App file: `app/lib/analytics.ts`
  - Description: App has getRunTypeLabelForDisplay; web may not. Both have computeFitnessCurves, parsePaceToMinPerKm, PR_DISTANCES, findBestForDistance, classifyRunByHr. Keep exports aligned for stats/pace progression.

- **format.ts**
  - Web file: `src/lib/format.ts`
  - App file: `app/lib/format.ts`
  - Description: App already has formatCadence, formatElevation, formatHr, formatNumber, formatSleepHours, formatDistance, formatDuration, formatPaceFromMinPerKm. Synced.

- **kipcoachee**
  - Web: `src/lib/kipcoachee/index.ts`, system-prompt, types.
  - App: `app/lib/kipcoachee/plan.ts` (extractPlanJson, stripPlanJson). Align if coach/plan surface changes.

- **useActivityStreamsSync**
  - Web file: `src/hooks/useActivityStreamsSync.ts`
  - App file: `app/hooks/useActivityStreamsSync.ts` — used in `app/screens/ActivitiesScreen.tsx`
  - Description: Both have hook and use it (web in layout/pages; app in ActivitiesScreen). Synced.

- **useIntervalsAutoSync**
  - Web: IntervalsAutoSync component (quick_sync once per 24h).
  - App: useIntervalsAutoSync hook in HomeScreen. Synced behavior.

---

## PRIORITIZED LIST

### HIGH (breaks core functionality or major feature gap)
1. **Strava connection on app** — Wire “Connect Strava” (OAuth or deep link) and optionally personal token (strava-save-personal-token) so app users can link Strava.
2. **Readiness / CTL–ATL–TSB fallbacks** — Ensure app chatStatDetection and any readiness chart code use resolveCtlAtlTsb and icu_ctl/icu_atl/icu_tsb, sleep_score consistently so fitness/sleep charts match web when DB has only icu_* or sleep_score.
3. **Activity detail streams** — Align app activity_streams select and upsert with web and DB (distance, latlng, temperature, respiration_rate where present).
4. **Athlete profile columns** — App to select and use lt1_hr, lt1_pace, zone_source, lab_test_date, lab_name where zones or display depend on them.

### MEDIUM (important but app still works without it)
5. **Garmin import on app** — Either add Garmin import (ZIP upload + edge functions + status) or document “use web for Garmin import.”
6. **Garmin import status (if Garmin added)** — useGarminImportStatus equivalent with AsyncStorage + last-import API.
7. **Training plan columns** — App to load/use is_active, start_date, end_date, goal_race; session tss_estimate, completed_activity_id where relevant.
8. **Dedicated useAthleteProfile / useReadiness (optional)** — If app needs same API as web for onboarding or standalone readiness, add hooks; otherwise current structure is acceptable.
9. **Activity table new columns** — Ensure activity list/detail select lap_splits, pace_zone_times, perceived_exertion, tss, intensity_factor, icu_* where used in UI or calculations.
10. **Race prediction on web** — Optionally persist web RacePredictionCard to race_predictions for parity with app.

### LOW (nice to have, cosmetic, minor)
11. **Database types for app** — Ensure Supabase client uses shared or generated Database type if strict typing is desired.
12. **Race prediction modal** — Confirm app HomeScreen modal matches web dialog (all distances, similar copy).
13. **Training plan success feedback** — Toast or inline success after reschedule/mark done on app.
14. **useIntervalsId** — Add only if app needs standalone localStorage/AsyncStorage athlete ID outside integration form.
15. **generate-plan.ts** — Add to app only if client-side plan building is needed; otherwise edge-only is fine.
16. **useMergedIntervalsData** — Add only if app needs same wrapper API as web.

---

*Audit complete. No code changes made. Use this list to create per-item implementation prompts.*
