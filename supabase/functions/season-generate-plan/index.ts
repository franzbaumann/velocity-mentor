import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AI_LIMITS } from "../_shared/ai-models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parsePaceToMinPerKm(pace: string | null | undefined): number | null {
  if (!pace || typeof pace !== "string") return null;
  const m = pace.match(/(\d+):(\d+)/);
  if (!m) return null;
  const min = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
  if (min < 2 || min > 25) return null;
  return min;
}

const PLAN_PROMPT = `You are Coach Cade — an elite AI running coach built into Cade — building a SEASON training plan.
The plan builds toward an END GOAL race (peak race). Other races (B/C) are tune-ups or training races — place tapers and race days accordingly.
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
      "type": "easy|tempo|interval|long|rest|strides|race",
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
Easy/Recovery: e-01 Recovery Run, e-02 Easy Run with Strides, e-03 Double Easy (high volume or CTL>65)
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
6. Double runs (is_double_run=true): If athlete enabled AND (CTL >= 65 OR peak_weekly_km >= 120), use doubles to split mileage. Second run is always easy. For 180 km/week use 4-5 double days. Split long easy days (e.g. 14 km → 8 AM + 6 PM). Max 3/week for lower volume, up to 5/week for high volume.
7. Recovery weeks: every 3rd week reduce volume 25%. Max 7% weekly volume increase.
8. day_of_week: 1=Mon, 2=Tue, ..., 7=Sun
9. Match athlete's days_per_week and session_length from intake.
10. Use metric (km, /km pace). Include rest days. Progress: base → build → peak → taper.
11. RACE PLACEMENT: A races = full taper (3 weeks marathon, 2 weeks half, 1 week 5K/10K). B races = short taper (1 week). C races = race as workout, minimal taper. Place race day as a workout with type "race" or appropriate session.
12. Build phases between races: after a B/C race, 2-4 days recovery then resume build. After A race, full recovery phase.

CRITICAL — QUALITY SESSIONS (NEVER ALL EASY):
- NEVER generate a plan where weeks are only easy runs. Every week (except taper) MUST include at least 1-2 quality sessions.
- Marathon plans: Each base/build/peak week needs tempo OR MP run, plus a long run.
- Hansons: Tuesday = tempo/SOS, Thursday = speed or MP, Sunday = long run (l-03 max 26km).`;

function buildSeasonPlanUserPrompt(
  answers: Record<string, unknown>,
  philosophy: string,
  seasonStartDate: string,
  endGoalRace: { name: string; date: string; distance: string; goal_time: string | null; priority: string },
  allRaces: Array<{ name: string; date: string; distance: string; priority: string; goal_time: string | null }>,
  requiredWeeks: number,
  ctl: number | null,
  doubleRunsEnabled: boolean,
  peakWeeklyKm: number,
  retryReason?: string
): string {
  let prompt = `Athlete onboarding: ${JSON.stringify(answers)}.\n\n`;
  prompt += `CRITICAL: The athlete chose philosophy "${philosophy}". Build the plan STRICTLY using this philosophy.\n\n`;
  prompt += `SEASON CONTEXT:\n`;
  prompt += `- Plan start date: ${seasonStartDate} (first Monday on or after this date)\n`;
  prompt += `- END GOAL (peak race): ${endGoalRace.name} on ${endGoalRace.date}, ${endGoalRace.distance}${endGoalRace.goal_time ? `, goal ${endGoalRace.goal_time}` : ""} (priority ${endGoalRace.priority})\n`;
  prompt += `- All races in season: ${JSON.stringify(allRaces)}\n`;
  prompt += `- You MUST generate exactly ${requiredWeeks} weeks. The last week must be taper ending on ${endGoalRace.date}.\n`;
  prompt += `- CTL: ${ctl ?? "unknown"}. Double runs enabled: ${doubleRunsEnabled}. Peak weekly km: ${peakWeeklyKm}.\n`;
  if (retryReason) prompt += `\nRETRY: ${retryReason}\n`;
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

function getNextMondayFrom(dateStr: string): Date {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function parsePlanJson(content: string): Record<string, unknown> | null {
  const cleaned = content.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let str = cleaned.slice(start, end + 1);
  str = str.replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function callClaude(
  userContent: string,
  retryReason?: string
): Promise<Record<string, unknown> | null> {
  const content = retryReason ? userContent + `\n\nRETRY: ${retryReason}` : userContent;
  for (const key of anthropicKeys()) {
    const res = await fetchWith429Retry(
      "https://api.anthropic.com/v1/messages",
      {
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
          messages: [{ role: "user", content }],
        }),
      }
    );
    if (res.status === 429) continue;
    if (!res.ok) {
      console.error("Claude error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const block = (json.content ?? []).find((b: { type: string }) => b.type === "text");
    const text = block?.text ?? "";
    const parsed = parsePlanJson(text);
    if (parsed) return parsed;
  }
  return null;
}

async function callGroq(userContent: string, retryReason?: string): Promise<Record<string, unknown> | null> {
  const content = retryReason ? userContent + `\n\nRETRY: ${retryReason}` : userContent;
  for (const key of groqKeys()) {
    const res = await fetchWith429Retry(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "system", content: PLAN_PROMPT }, { role: "user", content }],
          temperature: 0.4,
          max_tokens: AI_LIMITS.planGeneration.max_tokens,
          response_format: { type: "json_object" },
        }),
      }
    );
    if (res.status === 429) continue;
    if (!res.ok) {
      console.error("Groq error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content ?? "";
    const parsed = parsePlanJson(text);
    if (parsed) return parsed;
  }
  return null;
}

async function callGemini(userContent: string, retryReason?: string): Promise<Record<string, unknown> | null> {
  const content = retryReason ? userContent + `\n\nRETRY: ${retryReason}` : userContent;
  for (const key of geminiKeys()) {
    const res = await fetchWith429Retry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PLAN_PROMPT + "\n\n" + content }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: AI_LIMITS.planGeneration.max_tokens },
        }),
      }
    );
    if (res.status === 429) continue;
    if (!res.ok) {
      console.error("Gemini error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = parsePlanJson(text);
    if (parsed) return parsed;
  }
  return null;
}

function fixSessionTypes(workouts: Array<{ session_library_id?: string | null; type: string; name?: string }>): void {
  const LIBRARY_TYPE_MAP: Record<string, string> = {
    "e-01": "easy", "e-02": "easy", "e-03": "easy",
    "a-01": "easy", "a-02": "long", "a-03": "easy",
    "t-01": "tempo", "t-02": "tempo", "t-03": "tempo", "t-04": "tempo", "t-05": "tempo",
    "v-01": "interval", "v-02": "interval", "v-03": "interval", "v-04": "interval", "v-05": "interval",
    "l-01": "long", "l-02": "long", "l-03": "long", "l-04": "long", "l-05": "long", "l-06": "long",
    "m-01": "easy", "m-02": "easy", "m-03": "easy", "m-04": "tempo", "m-05": "tempo",
    "m-06": "long", "m-07": "tempo", "m-08": "tempo", "m-09": "long", "m-10": "long",
    "m-11": "long", "m-12": "interval", "m-13": "easy", "m-14": "tempo", "m-15": "easy", "m-16": "easy",
    "r-01": "interval", "r-02": "easy", "r-03": "interval",
  };
  for (const w of workouts) {
    if (w.session_library_id && LIBRARY_TYPE_MAP[w.session_library_id]) {
      w.type = LIBRARY_TYPE_MAP[w.session_library_id];
    }
  }
}

function enforceVolumeProgression(weeks: Array<{ total_km: number; phase: string }>): void {
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1].total_km;
    const curr = weeks[i].total_km;
    const phase = weeks[i].phase;

    if (curr <= prev) continue;
    if (phase === "taper") continue;

    const maxAllowed = prev * 1.10;
    if (curr > maxAllowed) {
      weeks[i].total_km = Math.round(maxAllowed * 10) / 10;
    }
  }
}

function capLongRunProgression(
  weeks: Array<{ phase?: string; workouts?: Array<{ type?: string; distance_km?: number }> }>,
  philosophy: string
): void {
  const maxAbsolute = philosophy === "hansons" ? 26 : 35;
  let prevLongKm = 0;
  for (const week of weeks) {
    if (week.phase === "taper") continue;
    for (const w of week.workouts ?? []) {
      if (w.type === "long" && w.distance_km != null) {
        const cap = prevLongKm > 0 ? Math.min(maxAbsolute, prevLongKm * 1.15) : maxAbsolute;
        if (w.distance_km > cap) {
          w.distance_km = Math.round(cap * 10) / 10;
        }
        if (w.distance_km > prevLongKm) {
          prevLongKm = w.distance_km;
        }
      }
    }
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
    const seasonId = body?.season_id as string | undefined;
    const endGoalRaceId = body?.end_goal_race_id as string | undefined;

    if (!seasonId || !endGoalRaceId) {
      return new Response(
        JSON.stringify({ error: "season_id and end_goal_race_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: season, error: seasonErr } = await supabase
      .from("competition_season")
      .select("*")
      .eq("id", seasonId)
      .eq("user_id", user.id)
      .single();

    if (seasonErr || !season) {
      return new Response(JSON.stringify({ error: "Season not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: races = [] } = await supabase
      .from("season_race")
      .select("*")
      .eq("season_id", seasonId)
      .eq("user_id", user.id)
      .order("date", { ascending: true });

    const endGoalRace = races.find((r: { id: string }) => r.id === endGoalRaceId);
    if (!endGoalRace) {
      return new Response(JSON.stringify({ error: "End goal race not found in season" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("athlete_profile")
      .select("onboarding_answers, recommended_philosophy, double_runs_enabled, vdot, goal_distance, goal_time")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: readinessRows = [] } = await supabase
      .from("daily_readiness")
      .select("date, ctl, icu_ctl, atl, icu_atl, icu_tsb")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(7);

    const latestR = readinessRows[0] as Record<string, unknown> | undefined;
    const ctl = (latestR?.ctl ?? latestR?.icu_ctl ?? null) as number | null;

    const answers = (profile?.onboarding_answers as Record<string, unknown>) ?? {};
    const bodyPhilosophy = (body?.philosophy as string | undefined)?.trim() || null;
    const philosophy = bodyPhilosophy || (profile?.recommended_philosophy as string) || "80_20_polarized";
    const doubleRunsEnabled = !!profile?.double_runs_enabled;

    const startDate = getNextMondayFrom(season.start_date as string);
    const endGoalDate = new Date((endGoalRace.date as string) + "T12:00:00");
    const requiredWeeks = Math.max(
      8,
      Math.ceil((endGoalDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
    );

    const peakWeeklyKm = 120;

    const allRacesForPrompt = races.map((r: Record<string, unknown>) => ({
      name: r.name,
      date: r.date,
      distance: r.distance,
      priority: r.priority ?? "C",
      goal_time: r.goal_time ?? null,
    }));

    const userContent = buildSeasonPlanUserPrompt(
      answers,
      philosophy,
      startDate.toISOString().slice(0, 10),
      {
        name: endGoalRace.name as string,
        date: endGoalRace.date as string,
        distance: endGoalRace.distance as string,
        goal_time: (endGoalRace.goal_time as string) ?? null,
        priority: (endGoalRace.priority as string) ?? "A",
      },
      allRacesForPrompt,
      requiredWeeks,
      ctl,
      doubleRunsEnabled,
      peakWeeklyKm
    );

    const tryGenerate = async (retryReason?: string) =>
      (await callClaude(userContent, retryReason)) ??
      (await callGroq(userContent, retryReason)) ??
      (await callGemini(userContent, retryReason));

    let planRaw = await tryGenerate();
    if (planRaw && (planRaw.weeks as unknown[]).length < requiredWeeks) {
      planRaw = await tryGenerate(
        `You returned only ${(planRaw.weeks as unknown[]).length} weeks but the plan MUST have exactly ${requiredWeeks} weeks (end goal race ${endGoalRace.date}). Generate the COMPLETE plan.`
      );
    }

    if (!planRaw || typeof planRaw !== "object") {
      console.error("season-generate-plan: all AI providers failed");
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
          session_library_id?: string;
          name?: string;
          description?: string;
          key_focus?: string;
          distance_km?: number;
          duration_minutes?: number;
          target_pace?: string;
          target_hr_zone?: number;
          tss_estimate?: number;
          structure_detail?: string;
          is_double_run?: boolean;
        }>;
      }>;
    };

    const weeks = plan.weeks ?? [];

    if (weeks.length > 0) {
      // Fix session types based on library ID (deterministic, overrides AI errors)
      fixSessionTypes(weeks.flatMap((w) => w.workouts ?? []));

      // Enforce 7% weekly volume cap (with 10% buffer to avoid over-clamping)
      for (const w of weeks) {
        if (w.total_km == null) w.total_km = 0;
        if (w.phase == null) w.phase = "base";
      }
      enforceVolumeProgression(weeks as Array<{ total_km: number; phase: string }>);

      // Cap individual long run progression
      capLongRunProgression(weeks, philosophy);
    }

    if (weeks.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid plan: no weeks" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalWeeks = requiredWeeks ?? plan.total_weeks ?? weeks.length;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + totalWeeks * 7 - 1);

    await supabase.from("training_plan").update({ is_active: false }).eq("user_id", user.id);

    const { data: planRow, error: planErr } = await supabase
      .from("training_plan")
      .insert({
        user_id: user.id,
        plan_name: plan.plan_name ?? `${season.name} Plan`,
        philosophy: plan.philosophy ?? philosophy,
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
        goal_race: endGoalRace.distance as string,
        goal_date: endGoalRace.date as string,
        goal_time: (endGoalRace.goal_time as string) ?? null,
        total_weeks: totalWeeks,
        peak_weekly_km: plan.peak_weekly_km ?? null,
        is_active: true,
        season_id: seasonId,
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

    for (const wk of weeks) {
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + ((wk.week_number ?? 1) - 1) * 7);
      const workouts = wk.workouts ?? [];
      for (const w of workouts) {
        const dow = w.day_of_week ?? 1;
        const workoutDate = new Date(weekStart);
        workoutDate.setDate(workoutDate.getDate() + (dow - 1));
        let durationMinutes = w.duration_minutes ?? null;
        if (w.distance_km != null && w.distance_km > 0 && w.target_pace) {
          const minPerKm = parsePaceToMinPerKm(w.target_pace);
          if (minPerKm != null) durationMinutes = Math.round(w.distance_km * minPerKm);
        }
        await supabase.from("training_plan_workout").insert({
          user_id: user.id,
          plan_id: planRow.id,
          date: workoutDate.toISOString().slice(0, 10),
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

    await supabase
      .from("competition_season")
      .update({
        training_plan_id: planRow.id,
        end_goal_race_id: endGoalRaceId,
      })
      .eq("id", seasonId)
      .eq("user_id", user.id);

    await supabase.from("coaching_memory").delete().eq("user_id", user.id).in("category", ["goal", "race"]);
    await supabase.from("coaching_memory").insert({
      user_id: user.id,
      category: "goal",
      content: `Training for ${endGoalRace.name} (${endGoalRace.distance}) on ${endGoalRace.date} — ${totalWeeks} week season plan`,
      importance: 8,
      source: "plan",
    });

    return new Response(
      JSON.stringify({
        plan_id: planRow.id,
        plan_name: plan.plan_name ?? `${season.name} Plan`,
        season_id: seasonId,
        total_weeks: totalWeeks,
        peak_weekly_km: plan.peak_weekly_km ?? null,
        start_date: startDate.toISOString().slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("season-generate-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
