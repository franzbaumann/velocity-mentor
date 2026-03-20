import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AI_LIMITS } from "../_shared/ai-models.ts";
import { pickTopMemories } from "../_shared/coaching-memory-ranking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENING_PROMPT = `You are Coach Cade — an elite AI running coach built into Cade. Generate a dynamic opening message for this athlete.

PRIORITY SYSTEM — address the HIGHEST applicable priority first:

**CRITICAL** (always mention if present):
- Injury or pain reported in memories → ask for update, suggest caution
- Ramp rate > 7 → flag overtraining risk immediately
- TSB < -25 → serious fatigue warning
- TLS > 65 with hard session in next 24h → suggest scaling back

**HIGH** (mention if no critical):
- Days since last session > 7 → welcome back, acknowledge the break
- HRV dropped >20% vs 7d average → flag recovery concern
- Race in < 3 weeks → race prep focus
- Activities since last session that look unusual (very high/low volume)

**MEDIUM** (default coaching):
- One observation about current state (CTL trend, TSB, HRV, readiness)
- One observation about load (weekly volume vs target, consistency)
- One specific recommendation for today
- If no daily check-in today → briefly prompt: "Haven't seen your check-in today — how are you feeling?"

**LOW** (if nothing else):
- Acknowledge consistency and progress
- Forward-looking encouragement tied to data

RULES:
- Max 3 sentences, no bullet points
- Be conversational, direct, like a real coach
- No markdown headers (##). No filler. Reference specific numbers.
- Use athlete's name if available
- If you have memories about this athlete, weave them in naturally`;

const DASHBOARD_PROMPT = `You are Coach Cade — an elite AI running coach. Generate a very short coaching snippet for the dashboard (max 2 sentences).

Include: one observation about current state (HRV, TSB, readiness) and one specific recommendation for today. Be direct. No markdown. No filler. Reference actual numbers.`;

type ApiResult = { ok: string } | { rateLimit: true } | null;

const anthropicKeyList = () =>
  [Deno.env.get("ANTHROPIC_API_KEY"), Deno.env.get("ANTHROPIC_API_KEY_2"), Deno.env.get("ANTHROPIC_API_KEY_3")].filter(
    (k): k is string => !!k
  );
const groqKeyList = () =>
  [Deno.env.get("GROQ_API_KEY"), Deno.env.get("GROQ_API_KEY_2"), Deno.env.get("GROQ_API_KEY_3")].filter(
    (k): k is string => !!k
  );
const geminiKeyList = () =>
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

async function callClaude(systemPrompt: string, userContent: string): Promise<ApiResult> {
  const keys = anthropicKeyList();
  let last429 = false;
  for (const key of keys) {
    const url = "https://api.anthropic.com/v1/messages";
    const init: RequestInit = {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_LIMITS.openingMessage.model,
        max_tokens: AI_LIMITS.openingMessage.max_tokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    };
    const res = await fetchWith429Retry(url, init);
    if (res.status === 429) {
      last429 = true;
      continue;
    }
    if (!res.ok) {
      console.error("Claude opening error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const block = (json.content ?? []).find((b: { type: string }) => b.type === "text");
    const content = block?.text?.trim();
    return content ? { ok: content } : (last429 ? { rateLimit: true } : null);
  }
  return last429 ? { rateLimit: true } : null;
}

async function callGroq(systemPrompt: string, userContent: string): Promise<ApiResult> {
  const keys = groqKeyList();
  let last429 = false;
  for (const key of keys) {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const init: RequestInit = {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
        temperature: 0.5,
        max_tokens: 256,
      }),
    };
    const res = await fetchWith429Retry(url, init);
    if (res.status === 429) {
      last429 = true;
      continue;
    }
    if (!res.ok) {
      console.error("Groq opening error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content?.trim();
    return content ? { ok: content } : (last429 ? { rateLimit: true } : null);
  }
  return last429 ? { rateLimit: true } : null;
}

async function callGemini(systemPrompt: string, userContent: string): Promise<ApiResult> {
  const keys = geminiKeyList();
  let last429 = false;
  for (const key of keys) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`;
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 256 },
      }),
    };
    const res = await fetchWith429Retry(url, init);
    if (res.status === 429) {
      last429 = true;
      continue;
    }
    if (!res.ok) {
      console.error("Gemini opening error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return content ? { ok: content } : (last429 ? { rateLimit: true } : null);
  }
  return last429 ? { rateLimit: true } : null;
}

function buildContextSummary(ctx: Record<string, unknown>): string {
  const v = (val: unknown, fallback = "?") => (val != null && val !== "" ? String(val) : fallback);
  const lines: string[] = [
    `Athlete: ${v(ctx.name, "Athlete")}`,
    `CTL: ${v(ctx.ctl)} | ATL: ${v(ctx.atl)} | TSB: ${v(ctx.tsb)}`,
    `Daily check-in today: ${ctx.has_checked_in_today ? `yes (TLS ${v(ctx.tls_today)}, mood ${v(ctx.mood_today)})` : "no"}`,
    `Ramp rate: ${v(ctx.ramp_rate)} CTL pts/week`,
    `HRV today: ${v(ctx.hrv_today)}ms | HRV 7d avg: ${v(ctx.hrv_7d_avg)}ms | HRV trend: ${v(ctx.hrv_trend)}`,
    `This week: ${v(ctx.this_week_km)}km done / ${v(ctx.planned_week_km)}km planned`,
    `Days since last coaching session: ${v(ctx.days_since_last_session)}`,
    `Last activity: ${(ctx.recent_activities as unknown[])?.[0] ? JSON.stringify((ctx.recent_activities as unknown[])[0]) : "none"}`,
    `Next planned workout: ${v(ctx.next_workout)}`,
    `Weeks to race: ${v(ctx.weeks_to_race)}`,
  ];

  const memories = ctx.memories as { category: string; content: string }[] | undefined;
  if (memories && memories.length > 0) {
    lines.push("", "What I remember about this athlete:");
    for (const m of memories) {
      lines.push(`- [${m.category}] ${m.content}`);
    }
  }

  const newActivities = ctx.activities_since_last_session as unknown[] | undefined;
  if (newActivities && newActivities.length > 0) {
    lines.push("", `Activities since last session (${newActivities.length}):`);
    for (const a of newActivities.slice(0, 5)) {
      const act = a as Record<string, unknown>;
      lines.push(`- ${act.date}: ${act.type ?? "Run"} ${act.distance_km ?? 0}km`);
    }
  }

  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (anthropicKeyList().length === 0 && groqKeyList().length === 0 && geminiKeyList().length === 0) {
      return new Response(
        JSON.stringify({ error: "Coach is temporarily unavailable." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let user: { id: string } | null = null;
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (token) {
      const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } } as Record<string, string>,
      });
      const { data: { user: u }, error: userError } = await supabaseUser.auth.getUser();
      if (!userError && u) user = u;
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let short = false;
    try {
      const body = await req.json().catch(() => ({}));
      short = body?.short === true;
    } catch {
      // optional
    }

    if (!user) {
      return new Response(JSON.stringify({ message: "Hey — connect your data in Settings so I can give you personalized guidance." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const mon = new Date();
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 7);

    const monStr = mon.toISOString().slice(0, 10);
    const sunStr = sun.toISOString().slice(0, 10);

    const [readinessRes, activitiesRes, planRes, workoutsRes, weekWorkoutsRes, profileRes, memoriesRes, lastMsgRes, dailyLoadRes] = await Promise.all([
      supabaseAdmin.from("daily_readiness").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(14),
      supabaseAdmin.from("activity").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(30),
      supabaseAdmin.from("training_plan").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("training_plan_workout").select("*").eq("user_id", user.id).gte("date", todayStr).order("date", { ascending: true }).limit(10),
      supabaseAdmin.from("training_plan_workout").select("*").eq("user_id", user.id).gte("date", monStr).lte("date", sunStr),
      supabaseAdmin.from("athlete_profile").select("*").eq("user_id", user.id).maybeSingle(),
      supabaseAdmin.from("coaching_memory").select("category, content, importance, created_at").eq("user_id", user.id)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("created_at", { ascending: false }).limit(30),
      supabaseAdmin.from("coach_message").select("created_at").eq("user_id", user.id).eq("role", "user")
        .order("created_at", { ascending: false }).limit(1),
      supabaseAdmin.from("daily_load").select("total_load_score, mood").eq("user_id", user.id).eq("date", todayStr).maybeSingle(),
    ]);

    const readiness = (readinessRes?.data ?? []) as Record<string, unknown>[];
    const activities = (activitiesRes?.data ?? []) as Record<string, unknown>[];
    const planRow = planRes?.data as Record<string, unknown> | null;
    const workouts = (workoutsRes?.data ?? []) as Record<string, unknown>[];
    const weekWorkouts = (weekWorkoutsRes?.data ?? []) as Record<string, unknown>[];
    const profile = profileRes?.data as Record<string, unknown> | null;
    const memPool = (memoriesRes?.data ?? []) as { category: string; content: string; importance: number; created_at?: string }[];
    const memoriesRanked = pickTopMemories(
      memPool.map((m) => ({
        ...m,
        created_at: m.created_at ?? new Date().toISOString(),
      })),
      10,
    );
    const memories = memoriesRanked.map(({ category, content, importance }) => ({ category, content, importance }));
    const lastMsg = (lastMsgRes?.data?.[0] as { created_at?: string } | undefined);
    const dailyLoad = dailyLoadRes?.data as { total_load_score?: number; mood?: string } | null;

    // Days since last session
    const daysSinceLastSession = lastMsg?.created_at
      ? Math.floor((Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Activities since last session
    let activitiesSinceLastSession: Record<string, unknown>[] = [];
    if (lastMsg?.created_at) {
      const sinceDate = new Date(lastMsg.created_at).toISOString().slice(0, 10);
      activitiesSinceLastSession = activities.filter((a) => String(a.date ?? "") >= sinceDate);
    }

    const todayReadiness = readiness.find((r) => String(r.date ?? "").slice(0, 10) === todayStr) ?? readiness[0] ?? {};
    const { ctl, atl, tsb } = (() => {
      const c = (todayReadiness.ctl ?? todayReadiness.icu_ctl ?? null) as number | null;
      const a = (todayReadiness.atl ?? todayReadiness.icu_atl ?? null) as number | null;
      const t = (todayReadiness.tsb ?? todayReadiness.icu_tsb ?? null) as number | null;
      return { ctl: c, atl: a, tsb: t ?? (c != null && a != null ? c - a : null) };
    })();

    const rampRate = (todayReadiness.ramp_rate ?? todayReadiness.icu_ramp_rate ?? null) as number | null;

    const hrvToday = (todayReadiness.hrv ?? todayReadiness.hrv_rmssd ?? null) as number | null;
    const hrvVals = readiness.map((r) => (r.hrv ?? r.hrv_rmssd ?? null) as number | null).filter((v): v is number => v != null);
    const hrv7dAvg = hrvVals.length ? hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length : null;
    const hrvTrend = hrvToday != null && hrv7dAvg != null
      ? (hrvToday > hrv7dAvg * 1.05 ? "rising" : hrvToday < hrv7dAvg * 0.95 ? "falling" : "stable")
      : "unknown";

    const isThisWeek = (d: Date) => {
      const t = d.getTime();
      return t >= mon.getTime() && t < sun.getTime();
    };
    const thisWeekKm = activities
      .filter((a) => isThisWeek(new Date(String(a.date ?? ""))))
      .reduce((s, a) => s + (Number(a.distance_km) || 0), 0);

    let plannedWeekKm = 0;
    let nextWorkout = "";
    if (planRow) {
      const planId = planRow.id;
      const planWorkouts = workouts.filter((w) => w.plan_id === planId) as { date?: string; name?: string; type?: string; description?: string; distance_km?: number; duration_minutes?: number }[];
      const first = planWorkouts[0];
      if (first) {
        const d = first.date ? String(first.date).slice(0, 10) : "";
        const desc = first.description || first.name || (first.distance_km ? `${first.distance_km}km` : first.type || "workout");
        nextWorkout = `${d}: ${desc}`;
      }
      const weekPlanWorkouts = weekWorkouts.filter((w) => w.plan_id === planId);
      plannedWeekKm = weekPlanWorkouts.reduce((s, w) => s + (Number(w.distance_km) || 0), 0);
    }

    const raceDate = profile?.goal_race_date ? String(profile.goal_race_date) : null;
    const weeksToRace = raceDate ? Math.ceil((new Date(raceDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)) : null;
    const athleteName = profile?.name ? String(profile.name).split(" ")[0] : null;

    const ctx = {
      name: athleteName,
      ctl, atl, tsb,
      ramp_rate: rampRate,
      hrv_today: hrvToday,
      hrv_7d_avg: hrv7dAvg != null ? Math.round(hrv7dAvg * 10) / 10 : null,
      hrv_trend: hrvTrend,
      this_week_km: Math.round(thisWeekKm * 10) / 10,
      planned_week_km: Math.round(plannedWeekKm * 10) / 10,
      recent_activities: activities.slice(0, 3),
      next_workout: nextWorkout || "none planned",
      weeks_to_race: weeksToRace,
      days_since_last_session: daysSinceLastSession,
      activities_since_last_session: activitiesSinceLastSession.slice(0, 5),
      memories,
      has_checked_in_today: !!dailyLoad,
      tls_today: dailyLoad?.total_load_score ?? null,
      mood_today: dailyLoad?.mood ?? null,
    };

    const contextStr = buildContextSummary(ctx);
    const prompt = short ? DASHBOARD_PROMPT : OPENING_PROMPT;

    // USAGE: exempt — not counted against daily limit (opening message, cached on client)
    // Priority: Claude (primary) → Groq → Gemini
    const claudeResult = await callClaude(prompt, contextStr);
    const groqResult = claudeResult?.ok ? null : await callGroq(prompt, contextStr);
    const geminiResult = (claudeResult ?? groqResult)?.ok ? null : await callGemini(prompt, contextStr);
    const result = claudeResult ?? groqResult ?? geminiResult;

    let finalMessage: string;
    let rateLimitHit = false;
    if (result && "ok" in result && result.ok.length > 10) {
      finalMessage = result.ok;
    } else if (result && "rateLimit" in result) {
      rateLimitHit = true;
      finalMessage = "Here's your week. What's on your mind?";
    } else {
      finalMessage = "Here's your week. What's on your mind?";
    }

    return new Response(JSON.stringify({ message: finalMessage, rateLimitHit }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("coach-opening error:", e);
    return new Response(
      JSON.stringify({ message: "Here's your week. What's on your mind?" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
