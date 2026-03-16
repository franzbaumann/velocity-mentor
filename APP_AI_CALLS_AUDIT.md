# App-Only AI/LLM API Call Audit (Read-Only)

**Scope:** Every file in `app/` (screens, components, hooks, lib, services, shared). No code changed.

---

## PER-CALL DETAILS

---

### 1. CoachScreen — coach-chat (streaming)

| Field | Value |
|-------|--------|
| **FUNCTION** | CoachScreen (streamChatNative) |
| **FILE** | `app/screens/CoachScreen.tsx` (221) |
| **CALLS EDGE FUNCTION** | coach-chat (via `fetch(CHAT_URL)`) |
| **OR CALLS AI DIRECTLY** | No — edge only |
| **TRIGGERED BY** | User sends a message (tap Send) |
| **FREQUENCY** | ~5–30 per user per day (depends on chat usage) |
| **PARAMS SENT** | `{ messages, intakeAnswers, intervalsContext }` |
| **RESPONSE USED FOR** | Streamed chunks appended to assistant message in UI; message also stored via coach_message (server-side in edge). |
| **CACHING** | No. Each message is a new request. |
| **COST IMPACT** | High |

---

### 2. CoachScreen — coach-chat (extract_memories)

| Field | Value |
|-------|--------|
| **FUNCTION** | CoachScreen (extractMemories) |
| **FILE** | `app/screens/CoachScreen.tsx` (314–319) |
| **CALLS EDGE FUNCTION** | coach-chat with `action: "extract_memories"` |
| **OR CALLS AI DIRECTLY** | No |
| **TRIGGERED BY** | (1) Unmount cleanup: `useEffect(() => { return () => extractMemories(messagesRef.current); }, []);` (2) User taps "Start fresh" (handleStartFresh). |
| **FREQUENCY** | ~0.5–2 per user per day (when leaving Coach after ≥3 user messages, or starting fresh). |
| **PARAMS SENT** | `{ action: "extract_memories", messages: msgs }` |
| **RESPONSE USED FOR** | Server persists memories to coaching_memory; app does not use response. |
| **CACHING** | No. |
| **COST IMPACT** | Medium |

---

### 3. CoachScreen — coach-opening

| Field | Value |
|-------|--------|
| **FUNCTION** | CoachScreen (loadOpening in useEffect) |
| **FILE** | `app/screens/CoachScreen.tsx` (483–490) |
| **CALLS EDGE FUNCTION** | coach-opening |
| **OR CALLS AI DIRECTLY** | No |
| **TRIGGERED BY** | Screen load / navigate to Coach when `messages.length === 0`. Effect deps: `[messages.length, intervalsContext]`. |
| **FREQUENCY** | ~2–10 per user per day (client cache 30 min in AsyncStorage; cache key `kipcoachee_opening`). |
| **PARAMS SENT** | `{ intervalsContext }` |
| **RESPONSE USED FOR** | Opening message text shown at top of chat; cached in AsyncStorage. |
| **CACHING** | Partial. AsyncStorage key `kipcoachee_opening`, TTL 30 min. |
| **COST IMPACT** | Medium |

---

### 4. CoachScreen — coach-generate-plan

| Field | Value |
|-------|--------|
| **FUNCTION** | CoachScreen (handleGeneratePlan) |
| **FILE** | `app/screens/CoachScreen.tsx` (619–629) |
| **CALLS EDGE FUNCTION** | coach-generate-plan (via `fetch(GENERATE_PLAN_URL)`) |
| **OR CALLS AI DIRECTLY** | No |
| **TRIGGERED BY** | User tap "Generate plan" (when showGeneratePlan is true). |
| **FREQUENCY** | ~0.01–0.1 per user per day (rare). |
| **PARAMS SENT** | `{ intakeAnswers, conversationContext: messages.slice(-10) }` |
| **RESPONSE USED FOR** | On success: alert + navigate to Plan tab. |
| **CACHING** | No. |
| **COST IMPACT** | Low |

---

### 5. PlanOnboardingScreen — paceiq-philosophy

| Field | Value |
|-------|--------|
| **FUNCTION** | PlanOnboardingScreen (useEffect step 8) |
| **FILE** | `app/screens/PlanOnboardingScreen.tsx` (519–525) |
| **CALLS EDGE FUNCTION** | paceiq-philosophy (URL: `…/functions/v1/paceiq-philosophy`) |
| **OR CALLS AI DIRECTLY** | No (edge may not exist in repo — 404 possible). |
| **TRIGGERED BY** | Auto when user reaches step 8 and `!state.recommendedPhilosophy`. |
| **FREQUENCY** | ~0.05 per user per day (once per onboarding flow). |
| **PARAMS SENT** | `{ answers: state.answers }` |
| **RESPONSE USED FOR** | Sets `state.recommendedPhilosophy` (primary + alternatives). |
| **CACHING** | No. If user goes back to step 8, could re-call unless recommendedPhilosophy kept. |
| **COST IMPACT** | Low (and may 404). |

---

### 6. PlanOnboardingScreen — coach-generate-plan

| Field | Value |
|-------|--------|
| **FUNCTION** | PlanOnboardingScreen (useEffect step 9) |
| **FILE** | `app/screens/PlanOnboardingScreen.tsx` (612–620) |
| **CALLS EDGE FUNCTION** | coach-generate-plan |
| **OR CALLS AI DIRECTLY** | No |
| **TRIGGERED BY** | Auto when step 9 and `state.selectedPhilosophy` and `!state.generatedPlan`. Effect deps: `[state.currentStep, state.selectedPhilosophy, state.answers, state.generatedPlan]`. |
| **FREQUENCY** | ~0.05 per user per day (once per onboarding). |
| **PARAMS SENT** | `{ intakeAnswers: mapAnswersToIntake(state.answers), conversationContext: [] }` |
| **RESPONSE USED FOR** | Sets `state.generatedPlan` (plan_id, etc.); on failure falls back to client-side buildPlanFromIntake. |
| **CACHING** | No. Guarded by `state.generatedPlan` so effectively once per flow. |
| **COST IMPACT** | Low |

---

### 7. useTrainingPlan — coach-chat (nutrition)

| Field | Value |
|-------|--------|
| **FUNCTION** | useTrainingPlan (triggerNutritionMessage) |
| **FILE** | `app/hooks/useTrainingPlan.ts` (33–43) |
| **CALLS EDGE FUNCTION** | coach-chat (via `fetch(COACH_CHAT_URL)`) |
| **OR CALLS AI DIRECTLY** | No |
| **TRIGGERED BY** | After user marks a training session complete (markDone mutation success → `triggerNutritionMessage(sessionId).catch(() => {})`). |
| **FREQUENCY** | ~0.1–0.5 per user per day. |
| **PARAMS SENT** | `{ messages: [{ role: "user", content: nutritionPrompt }], trigger: "nutrition" }` (prompt includes workout summary). |
| **RESPONSE USED FOR** | Stream read to string; inserted into coach_message as assistant message with message_type "nutrition". |
| **CACHING** | No. |
| **COST IMPACT** | Low |

---

### 8. ActivityDetailScreen — intervals-proxy (activity_coach_note)

| Field | Value |
|-------|--------|
| **FUNCTION** | ActivityDetailScreen (generateCoachNote) |
| **FILE** | `app/screens/ActivityDetailScreen.tsx` (255–266) |
| **CALLS EDGE FUNCTION** | intervals-proxy with `action: "activity_coach_note"` |
| **OR CALLS AI DIRECTLY** | No (edge uses Groq/Gemini/Claude). |
| **TRIGGERED BY** | (1) Auto: useEffect when `activity` and `!coachNote && !coachLoading` (2) User tap to regenerate. |
| **FREQUENCY** | ~1–5 per user per day (per activity detail view without existing note). |
| **PARAMS SENT** | `{ action: "activity_coach_note", activityId: activityIdForApi, regenerate: forceRegenerate }` |
| **RESPONSE USED FOR** | Sets coach note in UI; invalidates `["activity-detail-mobile", id]`. |
| **CACHING** | No. Note is in state/query; re-opening same activity can re-fetch if query invalidated or no note. |
| **COST IMPACT** | Medium |

---

### 9. SessionDetailModal — intervals-proxy (workout_coach_note)

| Field | Value |
|-------|--------|
| **FUNCTION** | SessionDetailModal (fetchCoachNote) |
| **FILE** | `app/components/plan/SessionDetailModal.tsx` (397–403) |
| **CALLS EDGE FUNCTION** | intervals-proxy with `action: "workout_coach_note"` |
| **OR CALLS AI DIRECTLY** | No |
| **TRIGGERED BY** | Modal open: useEffect when `session?.id` and `session.supportsCoachNote !== false` and `!session.coach_note`. |
| **FREQUENCY** | ~0.5–2 per user per day (each plan session opened without note). |
| **PARAMS SENT** | `{ action: "workout_coach_note", workoutId: session.id, regenerate }` |
| **RESPONSE USED FOR** | Sets coach note in modal; invalidates `["training-plan"]`. |
| **CACHING** | No. Note stored in state; same session re-open doesn’t re-call if note already in session object. |
| **COST IMPACT** | Low |

---

### 10. SettingsScreen — lab-extract

| Field | Value |
|-------|--------|
| **FUNCTION** | SettingsScreen (lab PDF analyze handler) |
| **FILE** | `app/screens/SettingsScreen.tsx` (462–469) |
| **CALLS EDGE FUNCTION** | lab-extract (via `fetch(…/lab-extract)`) |
| **OR CALLS AI DIRECTLY** | No (Gemini in edge). |
| **TRIGGERED BY** | User tap to analyze uploaded lab PDF. |
| **FREQUENCY** | ~0–0.01 per user per day. |
| **PARAMS SENT** | `{ pdf: base64 }` |
| **RESPONSE USED FOR** | Fills lab form fields (vo2max, ltHr, ltPace, vlamax, etc.); alert "Done". |
| **CACHING** | No. |
| **COST IMPACT** | Low |

---

## DUPLICATE CALLS

- **coach-opening:** Effect deps include `intervalsContext`. That object is recreated from `activities` and `readinessRows` (useDashboardData). If dashboard refetches and returns new array refs, the effect re-runs. Opening is still protected by 30 min AsyncStorage cache, so the **network** call may not duplicate; but the effect can run multiple times (e.g. after 30 min or on tab focus refetch), so **potential** for duplicate calls if user stays on Coach and context keeps changing past cache TTL.
- **activity_coach_note:** Only one call per activity detail load when note is missing; regenerate is explicit. No duplicate for same activity unless note is cleared or query invalidated.
- **workout_coach_note:** Only when session has no coach_note; once note is set, re-opening same session uses existing data. No duplicate.
- **extract_memories:** Runs on unmount (once per Coach visit) and on "Start fresh". Not duplicated for same conversation.

---

## MISSING CACHES

- **coach-opening:** Cached 30 min in AsyncStorage. Could extend to 12–24h to reduce calls.
- **activity_coach_note:** No cache. Same activity could be opened multiple times (e.g. from list, then back, then again); each time note is loaded from DB by useActivityDetailMobile. If the detail query already returns coach_note from DB, the useEffect only calls generateCoachNote when `!coachNote` — so if DB has the note we don’t call. So "cache" is effectively DB once written. For activities that don’t have a note yet, every open triggers a call — could cache by activity id in AsyncStorage with long TTL to avoid re-calling for same activity.
- **workout_coach_note:** Same idea — no app-level cache; note comes from plan/session data. First open without note triggers call; could cache by workoutId.
- **paceiq-philosophy:** No cache. If user goes back to step 8, could re-call; could cache by answers hash.
- **lab-extract:** No cache; one-off per PDF. Acceptable.

---

## ACCIDENTAL TRIGGERS

- **coach-opening:** `useEffect(..., [messages.length, intervalsContext])`. `intervalsContext` is a new object when `activities` or `readinessRows` change (e.g. refetch on focus). So every time dashboard data refreshes while on Coach with 0 messages, the effect runs. With 30 min cache we often skip the API call, but if the user stays on Coach and data refetches after 30 min, we call again. **Recommendation:** depend only on `messages.length` or a stable "opening requested" flag, or compare cache timestamp inside the effect instead of relying on deps.
- **PlanOnboardingScreen step 8 / step 9:** Effects have proper guards (step, recommendedPhilosophy, generatedPlan). No evidence of accidental double call.
- No AI call inside FlatList renderItem or scroll handler.

---

## CALLS WITHOUT LOADING STATES

- **useTrainingPlan triggerNutritionMessage:** Called after "mark session complete" with `.catch(() => {})`. No loading indicator for the nutrition AI call; user only sees session-complete success. If they tap "mark complete" again quickly, a second nutrition call could fire (mutation may be disabled after success, but the fire-and-forget nature means no loading state). **Recommendation:** Either show a subtle "Generating recovery tips…" or ensure mutation disables button until done and nutrition runs once per session.

---

## FINAL TABLE (sorted by frequency — most called first)

| # | File | Edge Function | Trigger | Freq/day | Cached | Priority |
|---|------|---------------|---------|----------|--------|----------|
| 1 | CoachScreen.tsx (221) | coach-chat | User send message | 5–30 | No | High |
| 2 | CoachScreen.tsx (483) | coach-opening | Screen load (0 msgs) | 2–10 | Yes (30 min) | Medium |
| 3 | ActivityDetailScreen.tsx (255) | intervals-proxy (activity_coach_note) | Detail load / regenerate | 1–5 | No | Medium |
| 4 | CoachScreen.tsx (314) | coach-chat (extract_memories) | Unmount / Start fresh | 0.5–2 | No | Medium |
| 5 | SessionDetailModal.tsx (397) | intervals-proxy (workout_coach_note) | Modal open (no note) | 0.5–2 | No | Low |
| 6 | useTrainingPlan.ts (33) | coach-chat (nutrition) | Session marked complete | 0.1–0.5 | No | Low |
| 7 | PlanOnboardingScreen.tsx (519) | paceiq-philosophy | Step 8 auto | ~0.05 | No | Low |
| 8 | PlanOnboardingScreen.tsx (612) | coach-generate-plan | Step 9 auto | ~0.05 | No | Low |
| 9 | CoachScreen.tsx (619) | coach-generate-plan | User tap Generate plan | ~0.01 | No | Low |
| 10 | SettingsScreen.tsx (462) | lab-extract | User tap analyze PDF | ~0.01 | No | Low |

**TOTAL ESTIMATED AI CALLS/USER/DAY:** ~10–50 (dominated by coach-chat messages and coach-opening).  
**ESTIMATED MONTHLY COST FROM APP ONLY:** Not separable from web; same edge functions. App’s share of total cost is proportional to app-originated calls (~same order as web for Coach/plan; activity and session notes are app-heavy). Rough app-only: **~$1–8/user/month** if most traffic is app.

---

## PROBLEMS FOUND

1. **coach-opening effect depends on `intervalsContext`** — Effect re-runs when dashboard data refetches (e.g. tab focus). With 30 min cache this often doesn’t hit the API, but after cache expiry or unstable refs we can get duplicate opening calls.
2. **No cache for activity_coach_note** — Re-opening the same activity (e.g. back and forth) can re-request note if query doesn’t return it or is invalidated. Could cache by activity id in AsyncStorage to avoid repeat calls for same activity.
3. **No cache for workout_coach_note** — Same as above for plan sessions; could cache by workoutId.
4. **triggerNutritionMessage has no loading state** — User doesn’t see that an AI call is in progress; double-tap on "mark complete" could theoretically trigger twice (mutation state may prevent).
5. **paceiq-philosophy may 404** — Edge function not present in repo; app calls it on step 8. Either deploy the function or remove/replace the call.
6. **lab-extract and coach-generate-plan use raw fetch** — No retry/timeout like callEdgeFunctionWithRetry; failures can be less predictable.

---

## QUICK FIXES (under 30 min each)

1. **CoachScreen.tsx (459–511):** Remove `intervalsContext` from the coach-opening useEffect dependency array; pass it only inside the async function so the effect runs only when `messages.length` goes to 0 (e.g. after "Start fresh"). Optionally keep a ref for latest intervalsContext. This reduces re-runs when dashboard refetches.
2. **CoachScreen.tsx (464):** Increase `OPENING_COOLDOWN_MS` from 30 min to 12 or 24 hours to cut opening calls (e.g. `12 * 60 * 60 * 1000`).
3. **ActivityDetailScreen.tsx:** Before calling `generateCoachNote(false)`, check AsyncStorage for a key like `coach_note_${activityId}` with a long TTL (e.g. 24h); if present and not `regenerate`, use it and skip the edge call. Write to this cache when note is received.
4. **SessionDetailModal.tsx:** Same pattern: cache workout_coach_note by `workoutId` in AsyncStorage with TTL (e.g. 24h); skip fetch if cache hit unless regenerate.
5. **useTrainingPlan.ts (348):** After `triggerNutritionMessage(sessionId)`, consider disabling the "mark complete" button briefly or showing a short toast "Generating recovery tips…" so the user knows an AI call is in progress and is less likely to tap again.
6. **PlanOnboardingScreen step 8:** If paceiq-philosophy is not deployed, add a client-side fallback (e.g. recommend a default philosophy) and/or feature-flag the fetch so the app doesn’t 404 on step 8.
7. **SettingsScreen.tsx (462) and PlanOnboardingScreen/CoachScreen fetch URLs:** Optionally switch to `callEdgeFunctionWithRetry` for lab-extract and coach-generate-plan so timeout/retry behavior matches other edge calls (optional; slightly more than 30 min if wiring auth/body).

---

*Audit completed; no code changes applied.*
