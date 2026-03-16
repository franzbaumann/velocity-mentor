# AI/LLM API Call Audit (Read-Only)

**Scope:** Every AI/LLM call in `supabase/functions/`, `src/`, `app/`. No code changed.

---

## PER-CALL DETAILS

---

### 1. coach-chat (main chat — streaming or non-streaming)

| Field | Value |
|-------|--------|
| **FUNCTION** | coach-chat (main chat) |
| **FILE** | `supabase/functions/coach-chat/index.ts` (streaming ~854–1036; non-streaming ~758–851) |
| **PROVIDER** | Groq → Gemini → Anthropic (waterfall) |
| **MODEL** | Groq: `llama-3.3-70b-versatile`; Gemini: `gemini-2.0-flash-lite`; Claude: `claude-sonnet-4-5` |
| **MAX_TOKENS INPUT** | No explicit cap; system + messages sent as-is |
| **MAX_TOKENS OUTPUT** | 4096 (Groq/Claude); 4096 non-stream / 8192 stream (Gemini) |
| **TRIGGERED BY** | User sends a message in Coach (web or app) |
| **FREQUENCY** | ~5–30 per user per day (depends on usage) |
| **WATERFALL ORDER** | Groq → Gemini → Claude |
| **SYSTEM PROMPT SIZE** | ~2,800–3,500 tokens (buildKipcoacheeSystemPrompt: philosophy, athlete data, plan, readiness, memories) |
| **DYNAMIC CONTEXT SIZE** | Last 12 messages (truncated); full athlete context (profile, 14 activities, 7 readiness, plan, 15 memories, PRs) ~1,500–2,500 tokens |
| **TOTAL INPUT ESTIMATE** | ~4,500–6,500 tokens typical |
| **STREAMING** | Yes (default); optional non-stream via `stream: false` |
| **CACHING** | No |
| **CURRENT COST/CALL** | ~$0.003–0.015 (Groq win) to ~$0.04–0.08 (Claude fallback). Assumes Groq wins often. |
| **CURRENT COST/USER/MONTH** | ~$1.50–15 (50–200 msgs at mixed provider) |

---

### 2. coach-chat (extract_memories)

| Field | Value |
|-------|--------|
| **FUNCTION** | coach-chat (extract_memories) |
| **FILE** | `supabase/functions/coach-chat/index.ts` (511–623) |
| **PROVIDER** | Groq → Gemini (no Claude) |
| **MODEL** | Groq: `llama-3.3-70b-versatile`; Gemini: `gemini-2.0-flash-lite` |
| **MAX_TOKENS INPUT** | N/A |
| **MAX_TOKENS OUTPUT** | 400 |
| **TRIGGERED BY** | Coach unmount / “new conversation” (app: extractMemories on unmount; web similar) |
| **FREQUENCY** | ~0.5–2 per user per day (when leaving Coach after ≥3 user messages) |
| **WATERFALL ORDER** | Groq → Gemini |
| **SYSTEM PROMPT SIZE** | Inline extraction prompt ~400 tokens |
| **DYNAMIC CONTEXT SIZE** | Full conversation + existing memory contents ~500–2,000 tokens |
| **TOTAL INPUT ESTIMATE** | ~900–2,400 tokens |
| **STREAMING** | No |
| **CACHING** | No |
| **CURRENT COST/CALL** | ~$0.0005–0.002 (Groq) |
| **CURRENT COST/USER/MONTH** | ~$0.03–0.10 |

---

### 3. coach-opening

| Field | Value |
|-------|--------|
| **FUNCTION** | coach-opening |
| **FILE** | `supabase/functions/coach-opening/index.ts` (47–343) |
| **PROVIDER** | Groq → Gemini → Anthropic |
| **MODEL** | Groq: `llama-3.3-70b-versatile`; Gemini: `gemini-2.0-flash-lite`; Claude: `claude-sonnet-4-5` |
| **MAX_TOKENS INPUT** | N/A |
| **MAX_TOKENS OUTPUT** | 256 |
| **TRIGGERED BY** | Open Coach tab when messages.length === 0 (web + app) |
| **FREQUENCY** | ~2–10 per user per day (client cache 30 min: web localStorage, app AsyncStorage) |
| **WATERFALL ORDER** | Groq → Gemini → Claude |
| **SYSTEM PROMPT SIZE** | OPENING_PROMPT or DASHBOARD_PROMPT ~350 tokens |
| **DYNAMIC CONTEXT SIZE** | buildContextSummary ~200–400 tokens |
| **TOTAL INPUT ESTIMATE** | ~550–750 tokens |
| **STREAMING** | No |
| **CACHING** | Partial: client-side 30 min (both web and app) |
| **CURRENT COST/CALL** | ~$0.0003–0.001 (Groq) to ~$0.01 (Claude) |
| **CURRENT COST/USER/MONTH** | ~$0.20–1.50 |

---

### 4. coach-generate-plan

| Field | Value |
|-------|--------|
| **FUNCTION** | coach-generate-plan |
| **FILE** | `supabase/functions/coach-generate-plan/index.ts` (93–240) |
| **PROVIDER** | Anthropic → Lovable (Gemini via gateway) |
| **MODEL** | Anthropic: `claude-3-5-sonnet-latest`; Lovable: `google/gemini-3-flash-preview` |
| **MAX_TOKENS INPUT** | N/A |
| **MAX_TOKENS OUTPUT** | 4096 |
| **TRIGGERED BY** | User clicks “Generate plan” (after intake/conversation) |
| **FREQUENCY** | ~0.05–0.3 per user per month |
| **WATERFALL ORDER** | Anthropic → Lovable |
| **SYSTEM PROMPT SIZE** | PLAN_PROMPT ~400 tokens |
| **DYNAMIC CONTEXT SIZE** | intakeAnswers + conversationContext ~300–1,500 tokens |
| **TOTAL INPUT ESTIMATE** | ~700–2,000 tokens |
| **STREAMING** | No |
| **CACHING** | No |
| **CURRENT COST/CALL** | ~$0.03–0.12 (Anthropic) or lower via Lovable |
| **CURRENT COST/USER/MONTH** | ~$0.01–0.05 |

---

### 5. lab-extract

| Field | Value |
|-------|--------|
| **FUNCTION** | lab-extract |
| **FILE** | `supabase/functions/lab-extract/index.ts` (51–84) |
| **PROVIDER** | Google Gemini only |
| **MODEL** | `gemini-2.0-flash` |
| **MAX_TOKENS INPUT** | N/A (PDF + short text prompt) |
| **MAX_TOKENS OUTPUT** | 1000 |
| **TRIGGERED BY** | User uploads lab PDF in Settings (web/app) |
| **FREQUENCY** | ~0–0.5 per user per month |
| **WATERFALL ORDER** | Gemini only |
| **SYSTEM PROMPT SIZE** | Inline extraction instruction ~80 tokens |
| **DYNAMIC CONTEXT SIZE** | PDF (variable) + prompt |
| **TOTAL INPUT ESTIMATE** | ~500–3,000 tokens (depends on PDF) |
| **STREAMING** | No |
| **CACHING** | No |
| **CURRENT COST/CALL** | ~$0.0005–0.003 |
| **CURRENT COST/USER/MONTH** | ~$0.00–0.01 |

---

### 6. intervals-proxy — activity_coach_note

| Field | Value |
|-------|--------|
| **FUNCTION** | intervals-proxy (action: activity_coach_note) |
| **FILE** | `supabase/functions/intervals-proxy/index.ts` (1517–1736) |
| **PROVIDER** | Groq → Gemini → Anthropic |
| **MODEL** | Groq: `llama-3.1-8b-instant`; Gemini: `gemini-2.0-flash-lite`; Claude: `claude-sonnet-4-5` |
| **MAX_TOKENS INPUT** | N/A |
| **MAX_TOKENS OUTPUT** | 300 |
| **TRIGGERED BY** | User opens activity detail and requests coach note (or auto when note missing) |
| **FREQUENCY** | ~1–5 per user per day |
| **WATERFALL ORDER** | Groq → Gemini → Claude |
| **SYSTEM PROMPT SIZE** | Inline prompt (activity + profile + history + fitness) ~600–1,200 tokens |
| **DYNAMIC CONTEXT SIZE** | Activity, 20 history lines, readiness, profile |
| **TOTAL INPUT ESTIMATE** | ~800–1,500 tokens |
| **STREAMING** | No |
| **CACHING** | No (returns `cached: false`; no cache implemented) |
| **CURRENT COST/CALL** | ~$0.0002–0.008 (Groq) to ~$0.01 (Claude) |
| **CURRENT COST/USER/MONTH** | ~$0.20–1.50 |

---

### 7. intervals-proxy — workout_coach_note (session note)

| Field | Value |
|-------|--------|
| **FUNCTION** | intervals-proxy (action: workout_coach_note) |
| **FILE** | `supabase/functions/intervals-proxy/index.ts` (1783–1953) |
| **PROVIDER** | Groq → Gemini → Anthropic |
| **MODEL** | Groq: `llama-3.1-8b-instant`; Gemini: `gemini-2.0-flash-lite`; Claude: `claude-sonnet-4-5` |
| **MAX_TOKENS INPUT** | N/A |
| **MAX_TOKENS OUTPUT** | 300 |
| **TRIGGERED BY** | User opens plan session (SessionDetailModal / plan session detail) |
| **FREQUENCY** | ~0.5–2 per user per day |
| **WATERFALL ORDER** | Groq → Gemini → Claude |
| **SYSTEM PROMPT SIZE** | Inline prompt (session + week + profile + readiness) ~500–900 tokens |
| **DYNAMIC CONTEXT SIZE** | Session, week summary, profile, readiness |
| **TOTAL INPUT ESTIMATE** | ~700–1,200 tokens |
| **STREAMING** | No |
| **CACHING** | No |
| **CURRENT COST/CALL** | ~$0.0002–0.008 (Groq) to ~$0.01 (Claude) |
| **CURRENT COST/USER/MONTH** | ~$0.05–0.50 |

---

### 8. intervals-proxy — post_workout_analysis

| Field | Value |
|-------|--------|
| **FUNCTION** | intervals-proxy (action: post_workout_analysis) |
| **FILE** | `supabase/functions/intervals-proxy/index.ts` (1955–2114) |
| **PROVIDER** | Groq → Gemini (no Claude) |
| **MODEL** | Groq: `llama-3.3-70b-versatile`; Gemini: `gemini-2.0-flash-lite` |
| **MAX_TOKENS INPUT** | N/A |
| **MAX_TOKENS OUTPUT** | 350 |
| **TRIGGERED BY** | Fire-and-forget after quick_sync when activitiesUpserted > 0 (self-invoke with service role; **no user JWT passed** — likely 401, so may never run) |
| **FREQUENCY** | Intended: after each quick_sync with new activities. Actual: likely 0 due to auth. |
| **WATERFALL ORDER** | Groq → Gemini |
| **SYSTEM PROMPT SIZE** | Inline analysis prompt ~200 tokens per run |
| **DYNAMIC CONTEXT SIZE** | One run’s data + CTL/TSB + memories; up to 3 runs per invocation |
| **TOTAL INPUT ESTIMATE** | ~250–400 tokens per run × up to 3 |
| **STREAMING** | No |
| **CACHING** | No |
| **CURRENT COST/CALL** | ~$0.0005–0.002 per run (Groq) |
| **CURRENT COST/USER/MONTH** | ~$0 (if broken) or ~$0.05–0.30 if fixed |

---

## NEW AI CALLS SINCE LAST AUDIT

- **No new edge functions** that call AI were found. All AI calls remain in: coach-chat, coach-opening, coach-generate-plan, lab-extract, intervals-proxy.
- **No client-side AI calls** in `src/` or `app/` — all go through edge functions.
- **paceiq-philosophy / paceiq-generate-plan:** Referenced in `src/components/OnboardingV2.tsx`, `OnboardingFlow.tsx`, `app/screens/PlanOnboardingScreen.tsx` (paceiq-philosophy URL). **No corresponding edge functions in this repo** (no `paceiq-philosophy` or `paceiq-generate-plan` under `supabase/functions/`). Either 404 in production or deployed elsewhere.
- **Model versions:** Same as before: `claude-sonnet-4-5`, `claude-3-5-sonnet-latest` (coach-generate-plan), `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `gemini-2.0-flash-lite`, `gemini-2.0-flash`, `google/gemini-3-flash-preview` (Lovable). No upgrades to newer Sonnet 4.6 or deprecated-model changes detected in code.

---

## WERE PREVIOUS OPTIMIZATIONS IMPLEMENTED?

| Check | Status | Notes |
|-------|--------|------|
| System prompt trimmed in coach-chat? | **PARTIAL** | Truncation to last 12 messages; system prompt itself is still large (~3k tokens). No dedicated “trimmed” system variant. |
| coach-opening cached for 12–24h? | **NOT YET** | Cached **30 min** on client (web + app). Recommendation was 12–24h. |
| Claude Sonnet → Haiku for fallbacks? | **NOT YET** | Fallbacks still use `claude-sonnet-4-5`. No Haiku. |
| Short-output functions skip Claude fallback? | **PARTIAL** | activity_coach_note / workout_coach_note use Groq → Gemini → Claude. extract_memories skips Claude (Groq → Gemini only). post_workout_analysis skips Claude. |
| Groq/Gemini added to coach-generate-plan? | **NOT YET** | coach-generate-plan still Anthropic → Lovable only; no Groq/Gemini. |
| Memory extraction threshold raised to 5 msgs? | **NOT YET** | Still **&lt; 3** user messages returns early (line 513). |
| Context build cached for 5 min? | **NOT YET** | buildAthleteContext in coach-chat runs on every request; no server-side cache. |

**Summary:** **1–2 of 7** fully or partly done (depending on how “short-output skip Claude” and “system prompt trimmed” are counted).

---

## MODEL VERSION CHANGES

- **claude-sonnet-4-5:** Still used (coach-chat, coach-opening, intervals-proxy activity/workout notes). Not updated to 4.6 in code.
- **claude-3-5-sonnet-latest:** Still used in coach-generate-plan only.
- **Groq:** `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` — no deprecated strings found; no version bump in repo.
- **Gemini:** `gemini-2.0-flash-lite`, `gemini-2.0-flash` — no deprecated strings found.
- **Lovable:** `google/gemini-3-flash-preview` — external gateway model.

---

## NEW WASTE PATTERNS

1. **post_workout_analysis auth:** Self-invoke from quick_sync uses `Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY` and does not pass the user’s JWT. Handler expects a user from auth → likely 401, so this path may never run (wasted logic, no cost).
2. **coach-opening:** Still called on every Coach open when cache is cold; cache is 30 min, so users who open Coach multiple times per hour can trigger multiple calls.
3. **activity_coach_note / workout_coach_note:** No caching; same activity/session can re-trigger AI when note already exists if UI doesn’t gate.
4. **paceiq-philosophy / paceiq-generate-plan:** Client calls these URLs but no edge functions in repo — either dead or deployed elsewhere; worth confirming.

---

## FINAL TABLE (sorted by cost/user/month, highest first)

| # | Function | Provider | Model | Cost/call | Calls/day | Cost/user/month |
|---|----------|----------|-------|-----------|-----------|-----------------|
| 1 | coach-chat (main) | Groq / Gemini / Claude | llama-3.3-70b / gemini-2.0-flash-lite / claude-sonnet-4-5 | ~$0.003–0.08 | 5–30 | ~$1.50–15 |
| 2 | coach-opening | Groq / Gemini / Claude | same | ~$0.0003–0.01 | 2–10 | ~$0.20–1.50 |
| 3 | intervals-proxy activity_coach_note | Groq / Gemini / Claude | llama-3.1-8b / gemini-2.0-flash-lite / claude-sonnet-4-5 | ~$0.0002–0.01 | 1–5 | ~$0.20–1.50 |
| 4 | coach-chat extract_memories | Groq / Gemini | llama-3.3-70b / gemini-2.0-flash-lite | ~$0.0005–0.002 | 0.5–2 | ~$0.03–0.10 |
| 5 | intervals-proxy workout_coach_note | Groq / Gemini / Claude | llama-3.1-8b / gemini-2.0-flash-lite / claude-sonnet-4-5 | ~$0.0002–0.01 | 0.5–2 | ~$0.05–0.50 |
| 6 | coach-generate-plan | Anthropic / Lovable | claude-3-5-sonnet-latest / gemini-3-flash-preview | ~$0.03–0.12 | ~0.01 | ~$0.01–0.05 |
| 7 | post_workout_analysis | Groq / Gemini | llama-3.3-70b / gemini-2.0-flash-lite | ~$0.0005–0.002 | 0 (broken) | ~$0 |
| 8 | lab-extract | Gemini | gemini-2.0-flash | ~$0.0005–0.003 | ~0.02 | ~$0.00–0.01 |

---

**TOTAL PER USER/MONTH:** ~**$2–19** (mid ~$5–8)  
**TOTAL AT 100 USERS:** ~$200–1,900  
**TOTAL AT 1000 USERS:** ~$2,000–19,000  
**TOTAL AT 10000 USERS:** ~$20,000–190,000  

**CHANGE VS LAST AUDIT:** N/A (no prior AI-only audit in repo; WEB_VS_APP_AUDIT is feature parity, not cost).  
**OPTIMIZATIONS IMPLEMENTED:** 1–2 of 7 (30 min opening cache; extract_memories/post_workout skip Claude).

---

## NEW ISSUES FOUND (not in previous audit)

- **post_workout_analysis** is triggered by quick_sync but the self-invoke does not send the user’s JWT, so the handler likely returns 401 and the feature never runs.
- **paceiq-philosophy** and **paceiq-generate-plan** are called from web and app onboarding but **no edge functions** with those names exist in the repo — confirm deployment/404.
- **coach-generate-plan** has no Groq/Gemini path; all cost is Anthropic or Lovable.
- **activity_coach_note** / **workout_coach_note** have no server- or client-side caching; repeated opens can re-call AI.

---

## STILL NOT FIXED FROM LAST AUDIT

- System prompt in coach-chat not trimmed (still ~3k tokens).
- coach-opening cache remains 30 min (recommendation was 12–24h).
- Claude fallbacks still use Sonnet, not Haiku.
- coach-generate-plan still no Groq/Gemini.
- Memory extraction threshold still 3 messages (recommendation was 5).
- No context-build cache (e.g. 5 min) for coach-chat.

---

## RECOMMENDED NEXT ACTIONS

1. **Fix post_workout_analysis:** Pass the user’s JWT (or `user_id` in body and resolve user server-side) when intervals-proxy triggers post_workout_analysis after quick_sync.
2. **Extend coach-opening cache** to 12–24h to cut opening cost.
3. **Add Groq/Gemini** to coach-generate-plan as first tier to reduce Anthropic cost.
4. **Raise memory extraction threshold** to 5 user messages to reduce low-value extract_memories calls.
5. **Cache activity_coach_note / workout_coach_note** by activity_id / workout id (e.g. 24h or indefinite until activity updated).
6. **Trim coach-chat system prompt** (e.g. shorter philosophy block, fewer activities/readiness lines) to lower input tokens.
7. **Consider Claude Haiku** for fallbacks in activity/workout notes and possibly coach-opening to reduce cost when Groq/Gemini fail.
8. **Confirm paceiq-philosophy / paceiq-generate-plan** — add functions or remove client calls.

---

*Audit completed; no code changes applied.*
