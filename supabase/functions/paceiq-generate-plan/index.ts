import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AI_LIMITS } from "../_shared/ai-models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Parse "5:30" or "5:30/km" to min per km. Returns null if invalid or outside 2–25 min/km. */
function parsePaceToMinPerKm(pace: string | null | undefined): number | null {
  if (!pace || typeof pace !== "string") return null;
  const m = pace.match(/(\d+):(\d+)/);
  if (!m) return null;
  const min = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
  if (min < 2 || min > 25) return null;
  return min;
}

/** Civil date helpers (YYYY-MM-DD) — avoids server TZ shifting week boundaries. */
function utcNoonMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

function utcYmdFromMs(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function addDaysYmd(ymd: string, days: number): string {
  return utcYmdFromMs(utcNoonMs(ymd) + days * 86400000);
}

function ymdCmp(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Monday (ISO) of the week containing ymd. day_of_week in plan: 1=Mon..7=Sun */
function mondayOfWeekContaining(ymd: string): string {
  const ms = utcNoonMs(ymd);
  const dow = new Date(ms).getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDaysYmd(ymd, delta);
}

/** Next Monday strictly after today's UTC calendar date (aligned with legacy getNextMonday behaviour). */
function getNextMondayYmd(): string {
  const now = new Date();
  const ymd = utcYmdFromMs(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const ms = utcNoonMs(ymd);
  const dow = new Date(ms).getUTCDay();
  const diff = dow === 0 ? 1 : 8 - dow;
  return addDaysYmd(ymd, diff);
}

function dayNameToDow(name: string): number | null {
  const id = name.trim().toLowerCase();
  const map: Record<string, number> = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
  };
  const v = map[id];
  return v ?? null;
}

const PLAN_PROMPT = `You are Coach Cade — an elite AI running coach built into Cade — building a training plan.
Return ONLY valid JSON, no markdown, no explanation:
{
  "plan_name": string,
  "philosophy": string,
  "total_weeks": number,
  "peak_weekly_km": number,
  "weeks": [{
    "week_number": number,
    "phase": "base|build|peak|taper",
    "focus": string,
    "total_km": number,
    "workouts": [{
      "day_of_week": number,
      "type": "easy|tempo|interval|long|rest|strides",
      "session_library_id": string_or_null,
      "name": string,
      "description": string,
      "key_focus": string,
      "distance_km": number,
      "duration_minutes": number,
      "target_pace": string,
      "target_hr_zone": number,
      "tss_estimate": number,
      "structure_detail": string_or_null,
      "is_double_run": boolean
    }]
  }]
}

SESSION LIBRARY IDs — you MUST choose from these when possible:
Easy/Recovery: e-01 Recovery Run, e-02 Easy Run with Strides, e-03 Double Easy (CTL>65 only)
Aerobic: a-01 Zone 2 Builder, a-02 Aerobic Long Run, a-03 High Aerobic Run
Threshold: t-01 Cruise Intervals, t-02 Continuous Tempo, t-03 Threshold Singles, t-04 Double Threshold AM/PM (CTL>55), t-05 Broken Tempo
VO2max: v-01 Classic Intervals, v-02 Billat 30-30, v-03 Pyramid Session, v-04 Hill Repeats, v-05 Long Intervals
Marathon: m-01 to m-16 (Easy Run, Recovery, Z2 Builder, Tempo, Cruise Intervals, Progressive Long, MP Run Short, MP Run Long, Fueling Long Run, Dress Rehearsal, Aerobic Long Run, Hill Repeats, Strides, Broken Tempo, Taper Run, Easy Double)
Long Runs: l-01 Classic Long Run, l-02 Progressive Long Run, l-03 Hanson Long Run, l-04 Back-to-Back Day 1, l-05 Back-to-Back Day 2, l-06 Kipchoge Long Run (elite only)
Race-Specific: r-01 Race Pace Rehearsal, r-02 Pre-Race Tune-Up, r-03 Sharpening Session

PLAN GENERATION RULES:
1. ALWAYS reference sessions by their library ID in session_library_id field.
2. Calculate ALL paces from athlete's VDOT or race times. Never use generic percentages.
3. Apply philosophy rules strictly (80/20: no Z3; Norwegian: threshold doubles; Lydiard: no intensity until Build week 3+; Hansons: no run > 26km; Pfitzinger: MLR every week; Daniels: exact VDOT paces).
4. Apply distance rules: Ultra = no VO2max intervals; Marathon = VO2max max 1x/2 weeks peak only; 5K/10K = VO2max freely in Build/Peak.
5. Volume starting point from CTL: <30 → 50%; 30-50 → 65%; 50-70 → 75%; 70+ → 85%.
6. Double runs (is_double_run=true): only if athlete enabled AND CTL > 65. Second run is always easy. Max 3/week.
7. Recovery weeks: every 3rd week reduce volume 25%. Max 7% weekly volume increase.
8. day_of_week: 1=Mon, 2=Tue, ..., 7=Sun
9. Match athlete's days_per_week and session_length from intake.
10. Use metric (km, /km pace). Include rest days. Progress: base → build → peak → taper.

CRITICAL — QUALITY SESSIONS (NEVER ALL EASY):
- NEVER generate a plan where weeks are only easy runs. Every week (except taper) MUST include at least 1–2 quality sessions: tempo, intervals, or long run.
- Marathon plans: Each base/build/peak week needs tempo OR MP run, plus a long run. Use t-02, t-01, m-07, m-08, l-03, l-01.
- Hansons specifically: Tuesday = tempo/SOS (t-02 or m-04), Thursday = speed or MP (t-01, m-07), Sunday = long run (l-03 max 26km). Easy runs fill other days.
- 80/20: 80% easy, 20% hard — include tempo or intervals weekly.`;

function buildPlanUserPrompt(
  answers: Record<string, unknown>,
  philosophy: string,
  raceDate: string | null,
  requiredWeeks: number | null,
  retryReason?: string
): string {
  let prompt = `Athlete onboarding: ${JSON.stringify(answers)}.\n\n`;
  prompt += `CRITICAL: The athlete chose philosophy "${philosophy}". Build the plan STRICTLY using this philosophy — every workout type, volume, and progression must align with it.\n\n`;
  if (retryReason) {
    prompt += `RETRY: ${retryReason}\n\n`;
  }

  const firstSched = typeof answers.firstSchedulableDate === "string" ? answers.firstSchedulableDate.trim() : "";
  if (firstSched) {
    prompt +=
      `FIRST SCHEDULABLE DATE (inclusive): ${firstSched}. Do not assign any workout to a calendar date before this day. ` +
      `Week 1 still uses day_of_week 1–7 relative to the plan week's Monday, but omit or reschedule sessions that would fall before ${firstSched}. ` +
      `If a quality or long run would land before ${firstSched}, move it to the first allowed day on or after ${firstSched}.\n\n`;
  }

  const lr = typeof answers.preferredLongRunDay === "string" ? answers.preferredLongRunDay.trim().toLowerCase() : "";
  const qd = typeof answers.preferredQualityDay === "string" ? answers.preferredQualityDay.trim().toLowerCase() : "";
  const lrD = lr ? dayNameToDow(lr) : null;
  const qD = qd ? dayNameToDow(qd) : null;
  if (lrD != null && qD != null) {
    prompt +=
      `SCHEDULING (mandatory): Place the weekly LONG RUN on ${lr} (day_of_week=${lrD}). ` +
      `Place the primary QUALITY session (tempo, threshold, intervals — not an easy run) on ${qd} (day_of_week=${qD}). ` +
      `If philosophy-specific templates conflict, still honour these days whenever physiologically reasonable.\n\n`;
  }

  if (raceDate && requiredWeeks != null && requiredWeeks > 0) {
    prompt += `RACE DATE: ${raceDate}. You MUST generate exactly ${requiredWeeks} weeks of training — output a "weeks" array with ${requiredWeeks} week objects. The last week must be taper ending on race day. Do NOT truncate. Do NOT return fewer weeks. The plan must cover every single week from start to race day.`;
  } else {
    prompt += `Use philosophy: ${philosophy}.`;
  }
  return prompt;
}

const anthropicKeys = () =>
  [Deno.env.get("ANTHROPIC_API_KEY"), Deno.env.get("ANTHROPIC_API_KEY_2"), Deno.env.get("ANTHROPIC_API_KEY_3")].filter(
    (k): k is string => !!k
  );
const groqKeys = () =>
  [Deno.env.get("GROQ_API_KEY"), Deno.env.get("GROQ_API_KEY_2"), Deno.env.get("GROQ_API_KEY_3")].filter(
    (k): k is string => !!k
  );
const geminiKeys = () =>
  [Deno.env.get("GEMINI_API_KEY"), Deno.env.get("GEMINI_API_KEY_2"), Deno.env.get("GEMINI_API_KEY_3")].filter(
    (k): k is string => !!k
  );

async function fetchWith429Retry(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  let res = await fetch(url, init);
  for (let r = 0; r < maxRetries && res.status === 429; r++) {
    await new Promise((x) => setTimeout(x, (5 + r * 5) * 1000));
    res = await fetch(url, init);
  }
  return res;
}

async function callClaude(
  answers: Record<string, unknown>,
  philosophy: string,
  raceDate: string | null,
  requiredWeeks: number | null,
  retryReason?: string
): Promise<unknown> {
  const userContent = buildPlanUserPrompt(answers, philosophy, raceDate, requiredWeeks, retryReason);
  const prompt = `${PLAN_PROMPT}\n\n${userContent}`;
  for (const key of anthropicKeys()) {
    const url = "https://api.anthropic.com/v1/messages";
    const init: RequestInit = {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_LIMITS.planGeneration.model,
        max_tokens: AI_LIMITS.planGeneration.max_tokens,
        system: PLAN_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    };
    const res = await fetchWith429Retry(url, init);
    if (res.status === 429) continue;
    if (!res.ok) {
      console.error("Claude error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const block = (json.content ?? []).find((b: { type: string }) => b.type === "text");
    const content = block?.text ?? "";
    const parsed = parsePlanJson(content);
    if (parsed) return parsed;
  }
  return null;
}

async function callGroq(
  answers: Record<string, unknown>,
  philosophy: string,
  raceDate: string | null,
  requiredWeeks: number | null,
  retryReason?: string
): Promise<unknown> {
  const userContent = buildPlanUserPrompt(answers, philosophy, raceDate, requiredWeeks, retryReason);
  for (const key of groqKeys()) {
    console.log("paceiq-generate-plan: trying Groq...");
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const init: RequestInit = {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: PLAN_PROMPT }, { role: "user", content: userContent }],
        temperature: 0.4,
        max_tokens: AI_LIMITS.planGeneration.max_tokens,
        response_format: { type: "json_object" },
      }),
    };
    const res = await fetchWith429Retry(url, init);
    if (res.status === 429) continue;
    if (!res.ok) {
      console.error("Groq error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = parsePlanJson(content);
    if (parsed) return parsed;
  }
  return null;
}

async function callGemini(
  answers: Record<string, unknown>,
  philosophy: string,
  raceDate: string | null,
  requiredWeeks: number | null,
  retryReason?: string
): Promise<unknown> {
  const userContent = buildPlanUserPrompt(answers, philosophy, raceDate, requiredWeeks, retryReason);
  const prompt = `${PLAN_PROMPT}\n\n${userContent}`;
  for (const key of geminiKeys()) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`;
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: AI_LIMITS.planGeneration.max_tokens },
      }),
    };
    const res = await fetchWith429Retry(url, init);
    if (res.status === 429) continue;
    if (!res.ok) {
      console.error("Gemini error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = parsePlanJson(content);
    if (parsed) return parsed;
  }
  return null;
}

function parsePlanJson(content: string): Record<string, unknown> | null {
  const cleaned = content.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let str = cleaned.slice(start, end + 1);
  str = str.replace(/,(\s*[}\]])/g, "$1"); // trailing commas
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const answers = body?.answers ?? body?.onboardingAnswers ?? {};
    const philosophy = body?.philosophy ?? "80_20_polarized";

    const rawRaceDate = (answers as { raceDate?: string }).raceDate;
    const raceDate = (typeof rawRaceDate === "string" && rawRaceDate.trim()) ? rawRaceDate.trim() : null;
    const planStartWhen = body?.planStartWhen ?? (answers as { planStartWhen?: string }).planStartWhen ?? "next_week";
    const firstSchedulableDate =
      typeof body?.firstSchedulableDate === "string" && body.firstSchedulableDate.trim()
        ? body.firstSchedulableDate.trim()
        : null;

    const nowYmd = utcYmdFromMs(Date.now());
    const anchorForThisWeek = firstSchedulableDate ?? nowYmd;
    const planWeekStartYmd = planStartWhen === "this_week"
      ? mondayOfWeekContaining(anchorForThisWeek)
      : getNextMondayYmd();

    const mergedAnswers: Record<string, unknown> = {
      ...(answers as Record<string, unknown>),
      ...(firstSchedulableDate ? { firstSchedulableDate } : {}),
    };

    const requiredWeeks = raceDate
      ? Math.max(
        8,
        Math.ceil((utcNoonMs(raceDate) - utcNoonMs(planWeekStartYmd)) / (7 * 86400000)),
      )
      : null;

    // Priority: Claude (primary) → Groq → Gemini. Retry once if plan too short.
    const tryGenerate = async (retryReason?: string) =>
      (await callClaude(mergedAnswers, philosophy, raceDate, requiredWeeks, retryReason)) ??
      (await callGroq(mergedAnswers, philosophy, raceDate, requiredWeeks, retryReason)) ??
      (await callGemini(mergedAnswers, philosophy, raceDate, requiredWeeks, retryReason));

    let planRaw = await tryGenerate();
    if (planRaw && requiredWeeks != null && requiredWeeks > 0) {
      const weeks = (planRaw as { weeks?: unknown[] }).weeks ?? [];
      if (weeks.length < requiredWeeks) {
        console.log(`paceiq-generate-plan: got ${weeks.length} weeks, need ${requiredWeeks}, retrying...`);
        planRaw = await tryGenerate(
          `You returned only ${weeks.length} weeks but the plan MUST have exactly ${requiredWeeks} weeks (race ${raceDate}). Generate the COMPLETE plan with all ${requiredWeeks} weeks.`
        );
      }
    }
    if (!planRaw || typeof planRaw !== "object") {
      console.error("paceiq-generate-plan: all AI providers failed");
      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const plan = planRaw as {
      plan_name?: string;
      philosophy?: string;
      total_weeks?: number;
      peak_weekly_km?: number;
      weeks?: Array<{
        week_number?: number;
        phase?: string;
        focus?: string;
        total_km?: number;
        workouts?: Array<{
          day_of_week?: number;
          type?: string;
          name?: string;
          description?: string;
          key_focus?: string;
          distance_km?: number;
          duration_minutes?: number;
          target_pace?: string;
          target_hr_zone?: number;
          tss_estimate?: number;
        }>;
      }>;
    };

    const weeks = plan.weeks ?? [];
    if (weeks.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid plan: no weeks" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const goalTime = (answers as { goalTime?: string }).goalTime ?? null;
    const goalDistance =
      (answers as { raceDistance?: string }).raceDistance ??
      (answers as { goalDistance?: string }).goalDistance ??
      null;
    const totalWeeks = requiredWeeks ?? plan.total_weeks ?? weeks.length;
    const endDateYmd = addDaysYmd(planWeekStartYmd, totalWeeks * 7 - 1);

    const { data: planRow, error: planErr } = await supabase
      .from("training_plan")
      .insert({
        user_id: user.id,
        plan_name: plan.plan_name ?? "Training Plan",
        philosophy: plan.philosophy ?? philosophy,
        start_date: planWeekStartYmd,
        end_date: endDateYmd,
        goal_race: goalDistance,
        goal_date: raceDate || null,
        goal_time: goalTime,
        total_weeks: totalWeeks,
        peak_weekly_km: plan.peak_weekly_km ?? null,
        is_active: true,
      })
      .select("id")
      .single();

    if (planErr || !planRow) {
      console.error("Insert plan error:", planErr);
      return new Response(JSON.stringify({ error: "Failed to save plan" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let firstWorkoutOut: { name: string; date: string } | null = null;

    for (const wk of weeks) {
      const wn = wk.week_number ?? 1;
      const weekOffset = (wn - 1) * 7;
      const workouts = wk.workouts ?? [];
      for (const w of workouts) {
        const dow = w.day_of_week ?? 1;
        const workoutYmd = addDaysYmd(planWeekStartYmd, weekOffset + (dow - 1));
        if (firstSchedulableDate && ymdCmp(workoutYmd, firstSchedulableDate) < 0) {
          continue;
        }
        if (!firstWorkoutOut) {
          firstWorkoutOut = { name: (w.name ?? w.description ?? "Workout") as string, date: workoutYmd };
        }
        let durationMinutes = w.duration_minutes ?? null;
        if (w.distance_km != null && w.distance_km > 0 && w.target_pace) {
          const minPerKm = parsePaceToMinPerKm(w.target_pace);
          if (minPerKm != null) durationMinutes = Math.round(w.distance_km * minPerKm);
        }
        await supabase.from("training_plan_workout").insert({
          user_id: user.id,
          plan_id: planRow.id,
          date: workoutYmd,
          week_number: wk.week_number ?? 1,
          phase: wk.phase ?? "base",
          day_of_week: dow,
          type: w.type ?? "easy",
          name: w.name ?? w.description ?? "",
          description: w.description ?? "",
          key_focus: w.key_focus ?? null,
          distance_km: w.distance_km ?? null,
          duration_minutes: durationMinutes,
          target_pace: w.target_pace ?? null,
          target_hr_zone: w.target_hr_zone ?? null,
          tss_estimate: w.tss_estimate ?? null,
          session_library_id: w.session_library_id ?? null,
          structure_detail: w.structure_detail ?? null,
          is_double_run: w.is_double_run ?? false,
          completed: false,
        });
      }
    }

    // Sync coaching memory: canonical plan goal replaces all goal + race chat rows
    await supabase.from("coaching_memory").delete().eq("user_id", user.id).in("category", ["goal", "race"]);
    const raceLabel = (goalDistance ?? "marathon").replace(/\b\w/g, (c) => c.toUpperCase());
    const goalContent = goalTime
      ? `Targeting a ${raceLabel.toLowerCase()} finish time of ${goalTime}`
      : raceDate
        ? `Aims to run the ${raceLabel} in ${totalWeeks} weeks`
        : `Aims to run the ${raceLabel} in ${totalWeeks} weeks`;
    await supabase.from("coaching_memory").insert({
      user_id: user.id,
      category: "goal",
      content: goalContent,
      importance: 8,
      source: "plan",
    });

    return new Response(
      JSON.stringify({
        plan_id: planRow.id,
        plan_name: plan.plan_name ?? "Training Plan",
        philosophy: plan.philosophy ?? philosophy,
        total_weeks: totalWeeks,
        peak_weekly_km: plan.peak_weekly_km ?? null,
        start_date: planWeekStartYmd,
        first_workout: firstWorkoutOut,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("paceiq-generate-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
