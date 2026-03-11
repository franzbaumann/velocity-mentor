import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------------------------------------------------------------------------
// Types — mirrors src/lib/kipcoachee/types.ts
// ---------------------------------------------------------------------------

interface RecentActivity {
  date: string;
  name: string;
  distance_km: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  tss: number | null;
}

interface PersonalRecord {
  distance: string;
  time: string;
  date_achieved?: string;
}

interface PlanSummary {
  name: string;
  philosophy: string;
  current_week: number | null;
  total_weeks: number | null;
  peak_km: number | null;
}

interface AthleteContext {
  name: string;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  hrv_today: number | null;
  hrv_7d_avg: number | null;
  hrv_trend: "rising" | "falling" | "stable" | "unknown";
  resting_hr: number | null;
  philosophy: string | null;
  goal: string | null;
  goal_time: string | null;
  race_date: string | null;
  weeks_to_race: number | null;
  injuries: string | null;
  recent_activities: RecentActivity[];
  this_week_km: number;
  planned_week_km: number;
  four_week_avg_km: number;
  prs: PersonalRecord[];
  plan: PlanSummary | null;
  plan_workouts_text: string;
  onboarding_answers: Record<string, unknown> | null;
  readiness_history_text: string;
}

// ---------------------------------------------------------------------------
// Context Builder — pulls all athlete data from Supabase
// ---------------------------------------------------------------------------

function resolveCtlAtlTsb(r: Record<string, unknown>) {
  const ctl = (r.ctl ?? r.icu_ctl ?? null) as number | null;
  const atl = (r.atl ?? r.icu_atl ?? null) as number | null;
  const rawTsb = (r.tsb ?? r.icu_tsb ?? null) as number | null;
  const tsb = rawTsb ?? (ctl != null && atl != null ? ctl - atl : null);
  return { ctl, atl, tsb };
}

function isThisWeek(d: Date): boolean {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 7);
  return d >= mon && d < sun;
}

function calculate4WeekAvg(activities: Record<string, unknown>[]): number {
  if (!activities.length) return 0;
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const recent = activities.filter((a) => new Date(String(a.date ?? "")) >= fourWeeksAgo);
  const totalKm = recent.reduce((s, a) => s + (Number(a.distance_km) || 0), 0);
  return Math.round((totalKm / 4) * 10) / 10;
}

async function buildAthleteContext(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  intakeAnswers: Record<string, unknown> | null,
  intervalsContext: { wellness?: unknown[]; activities?: unknown[] } | null,
): Promise<AthleteContext> {
  const [profileRes, readinessRes, activitiesRes, planRes, workoutsRes, pbsRes] = await Promise.all([
    supabaseAdmin.from("athlete_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("daily_readiness").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(7),
    supabaseAdmin.from("activity").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(30),
    supabaseAdmin.from("training_plan").select("*").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("training_plan_workout").select("*").eq("user_id", userId).order("date", { ascending: true }).limit(200),
    supabaseAdmin.from("personal_records").select("distance, date_achieved, best_time_seconds, best_pace").eq("user_id", userId).order("date_achieved", { ascending: false }).limit(20),
  ]);

  const p = profileRes?.data as Record<string, unknown> | null;
  const readiness = (readinessRes?.data ?? []) as Record<string, unknown>[];
  const activities = (activitiesRes?.data ?? []) as Record<string, unknown>[];
  const planRow = planRes?.data as Record<string, unknown> | null;
  const workouts = (workoutsRes?.data ?? []) as Record<string, unknown>[];
  const pbs = (pbsRes?.data ?? []) as Record<string, unknown>[];

  // Readiness
  const today = readiness[0] ?? {};
  const { ctl, atl, tsb } = resolveCtlAtlTsb(today);
  const hrvToday = (today.hrv ?? today.hrv_rmssd ?? null) as number | null;
  const hrvValues = readiness.map((r) => (r.hrv ?? r.hrv_rmssd ?? null) as number | null).filter((v): v is number => v != null);
  const hrv7dAvg = hrvValues.length ? Math.round((hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length) * 10) / 10 : null;
  const hrvTrend: AthleteContext["hrv_trend"] =
    hrvToday != null && hrv7dAvg != null
      ? hrvToday > hrv7dAvg * 1.05 ? "rising" : hrvToday < hrv7dAvg * 0.95 ? "falling" : "stable"
      : "unknown";

  const readinessHistoryText = readiness.map((r) => {
    const { ctl: c, atl: a, tsb: t } = resolveCtlAtlTsb(r);
    const hrv = r.hrv ?? r.hrv_rmssd ?? "?";
    const sleep = r.sleep_hours ?? (typeof r.sleep_secs === "number" ? ((r.sleep_secs as number) / 3600).toFixed(1) : "?");
    const rhr = r.resting_hr ?? "?";
    return `${r.date}: CTL ${c ?? "?"} | ATL ${a ?? "?"} | TSB ${t ?? "?"} | HRV ${hrv}ms | sleep ${sleep}h | RHR ${rhr}`;
  }).join("\n");

  // Recent activities
  const recentActivities: RecentActivity[] = activities.slice(0, 14).map((a) => ({
    date: String(a.date ?? "?"),
    name: String(a.type ?? a.name ?? "run"),
    distance_km: a.distance_km != null ? Number(a.distance_km) : null,
    avg_pace: a.avg_pace != null ? String(a.avg_pace) : null,
    avg_hr: a.avg_hr != null ? Number(a.avg_hr) : null,
    tss: (a.icu_training_load ?? a.training_load ?? null) != null ? Number(a.icu_training_load ?? a.training_load) : null,
  }));

  const thisWeekKm = Math.round(
    activities.filter((a) => isThisWeek(new Date(String(a.date ?? "")))).reduce((s, a) => s + (Number(a.distance_km) || 0), 0) * 10,
  ) / 10;

  // PRs
  const prList: PersonalRecord[] = pbs.slice(0, 10).map((pr) => {
    const secs = Number(pr.best_time_seconds) || 0;
    const timeStr = secs > 0 ? `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}` : "?";
    return { distance: String(pr.distance ?? "?"), time: timeStr, date_achieved: String(pr.date_achieved ?? "?") };
  });

  // Plan
  let planSummary: PlanSummary | null = null;
  let planWorkoutsText = "";
  let plannedWeekKm = 0;

  if (planRow) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const planId = planRow.id;
    const planWorkouts = workouts.filter((w) => w.plan_id === planId);

    planSummary = {
      name: String(planRow.plan_name ?? "Training Plan"),
      philosophy: String(planRow.philosophy ?? "?"),
      current_week: null,
      total_weeks: planRow.total_weeks != null ? Number(planRow.total_weeks) : null,
      peak_km: planRow.peak_weekly_km != null ? Number(planRow.peak_weekly_km) : null,
    };

    if (planWorkouts.length > 0) {
      const byWeek = new Map<number, typeof planWorkouts>();
      for (const w of planWorkouts) {
        const wn = Number(w.week_number ?? 0);
        if (!byWeek.has(wn)) byWeek.set(wn, []);
        byWeek.get(wn)!.push(w);
      }
      const sortedWeeks = [...byWeek.keys()].sort((a, b) => a - b);
      const lines: string[] = [];

      for (const wn of sortedWeeks) {
        const weekWorkouts = byWeek.get(wn)!;
        const weekFocus = String(weekWorkouts[0]?.week_focus ?? weekWorkouts[0]?.phase ?? "");
        const weekKm = weekWorkouts.reduce((s, w) => s + (Number(w.distance_km) || 0), 0);
        const isPast = weekWorkouts.every((w) => String(w.date ?? "").slice(0, 10) < todayStr);
        const isCurrent = weekWorkouts.some((w) => {
          const d = String(w.date ?? "").slice(0, 10);
          const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          return d >= todayStr && d <= weekEnd;
        });

        if (isCurrent) {
          planSummary!.current_week = wn;
          plannedWeekKm = weekKm;
        }

        const marker = isCurrent ? " ← CURRENT WEEK" : isPast ? " (done)" : "";
        lines.push(`Week ${wn}${weekFocus ? ` — ${weekFocus}` : ""} (~${Math.round(weekKm)}km)${marker}`);
        for (const w of weekWorkouts) {
          const d = w.date ? String(w.date).slice(0, 10) : "?";
          const done = w.completed ? " ✓" : "";
          lines.push(`  - ${d}: ${w.name ?? w.type ?? "workout"} ${w.distance_km ? `${w.distance_km}km` : ""} ${w.duration_minutes ? `${w.duration_minutes}min` : ""} ${w.target_pace ? `@${w.target_pace}` : ""} (${w.type ?? "easy"})${done}`);
        }
      }
      planWorkoutsText = lines.join("\n");
    }
  }

  // Merge intervals.icu data if available (client-side wellness/activities)
  if (intervalsContext) {
    const w = intervalsContext.wellness;
    if (Array.isArray(w) && w.length > 0) {
      const last = w[w.length - 1] as Record<string, unknown>;
      if (ctl == null && last) {
        const ic = resolveCtlAtlTsb(last);
        if (ic.ctl != null) Object.assign(today, { ctl: ic.ctl, atl: ic.atl, tsb: ic.tsb });
      }
    }
  }

  // Weeks to race
  const raceDate = p?.goal_race_date ? String(p.goal_race_date) : null;
  const weeksToRace = raceDate ? Math.ceil((new Date(raceDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)) : null;

  // Onboarding answers
  const onboarding = p?.onboarding_answers && typeof p.onboarding_answers === "object"
    ? p.onboarding_answers as Record<string, unknown>
    : intakeAnswers;

  return {
    name: String(p?.name ?? "there").split(" ")[0],
    ctl: resolveCtlAtlTsb(today).ctl,
    atl: resolveCtlAtlTsb(today).atl,
    tsb: resolveCtlAtlTsb(today).tsb,
    hrv_today: hrvToday,
    hrv_7d_avg: hrv7dAvg,
    hrv_trend: hrvTrend,
    resting_hr: (today.resting_hr ?? null) as number | null,
    philosophy: String(p?.training_philosophy ?? p?.recommended_philosophy ?? p?.philosophy ?? ""),
    goal: String(p?.goal_race_name ?? p?.goal_distance ?? ""),
    goal_time: p?.goal_time ? String(p.goal_time) : null,
    race_date: raceDate,
    weeks_to_race: weeksToRace,
    injuries: p?.injury_history_text ? String(p.injury_history_text) : null,
    recent_activities: recentActivities,
    this_week_km: thisWeekKm,
    planned_week_km: Math.round(plannedWeekKm * 10) / 10,
    four_week_avg_km: calculate4WeekAvg(activities),
    prs: prList,
    plan: planSummary,
    plan_workouts_text: planWorkoutsText,
    onboarding_answers: onboarding,
    readiness_history_text: readinessHistoryText,
  };
}

// ---------------------------------------------------------------------------
// System Prompt Builder — canonical version lives in src/lib/kipcoachee/system-prompt.ts
// This is the Deno-compatible copy used by the edge function.
// ---------------------------------------------------------------------------

function buildKipcoacheeSystemPrompt(ctx: AthleteContext): string {
  const v = (val: unknown, fallback = "unknown") =>
    val != null && val !== "" ? String(val) : fallback;

  const activitiesBlock =
    ctx.recent_activities.length > 0
      ? ctx.recent_activities
          .map((a) => `- ${a.date}: ${a.name} — ${v(a.distance_km)}km @ ${v(a.avg_pace)}/km, avg HR ${v(a.avg_hr)}, load ${v(a.tss)}`)
          .join("\n")
      : "No recent activities synced.";

  const prsBlock =
    ctx.prs.length > 0
      ? ctx.prs.map((pr) => `${pr.distance}: ${pr.time}`).join(", ")
      : "none recorded";

  return `You are Kipcoachee — an elite AI running coach built into PaceIQ.

WHO YOU ARE
You are direct, data-driven, and deeply knowledgeable about endurance training science. You speak like a world-class coach who has worked with everyone from beginners to Olympic athletes. You are warm but never soft. You push when needed, back off when the data says to. You are never generic — every response references this specific athlete's data.

Your coaching is grounded in exercise physiology:
- You understand CTL/ATL/TSB and use them to guide load decisions
- You know the difference between aerobic and anaerobic adaptation
- You understand HRV as a recovery signal, not just a number
- You know all major training philosophies: 80/20, Jack Daniels, Lydiard, Hansons, Pfitzinger, Kenyan model
- You understand lactate threshold, VO2max, cardiac drift, running economy
- You can read FIT file metrics and explain what they mean

CURRENT ATHLETE DATA
Name: ${v(ctx.name, "Athlete")}
CTL (fitness): ${v(ctx.ctl)}
ATL (fatigue): ${v(ctx.atl)}
TSB (form): ${v(ctx.tsb)}
HRV today: ${v(ctx.hrv_today)}${ctx.hrv_today != null ? "ms" : ""}
HRV 7-day average: ${v(ctx.hrv_7d_avg)}${ctx.hrv_7d_avg != null ? "ms" : ""}
HRV trend: ${v(ctx.hrv_trend)}
Resting HR today: ${v(ctx.resting_hr)}${ctx.resting_hr != null ? " bpm" : ""}
Recommended philosophy: ${v(ctx.philosophy, "not set")}
Goal: ${v(ctx.goal, "not set")}
Race date: ${v(ctx.race_date, "not set")}
Weeks to race: ${v(ctx.weeks_to_race)}
Goal time: ${v(ctx.goal_time, "not set")}
Injury history: ${v(ctx.injuries, "none reported")}

Last 14 days:
${activitiesBlock}

This week: ${ctx.this_week_km}km of planned ${ctx.planned_week_km}km
Last 4 weeks avg: ${ctx.four_week_avg_km}km/week
Personal records: ${prsBlock}

${ctx.plan ? `ACTIVE TRAINING PLAN
Name: ${ctx.plan.name}
Philosophy: ${ctx.plan.philosophy}
Week: ${v(ctx.plan.current_week)} of ${v(ctx.plan.total_weeks)}
Peak volume: ${v(ctx.plan.peak_km)}km/week` : "No active training plan."}

${ctx.plan_workouts_text ? `PLAN WORKOUTS (you created these — explain their purpose when asked)
${ctx.plan_workouts_text}` : ""}

${ctx.readiness_history_text ? `READINESS HISTORY (last 7 days)
${ctx.readiness_history_text}` : ""}

${ctx.onboarding_answers ? `ONBOARDING ANSWERS (athlete's self-reported context)
${JSON.stringify(ctx.onboarding_answers, null, 2)}` : ""}

HOW YOU THINK — DECISION FRAMEWORK

Before every response, silently run through this:

1. READINESS CHECK
   - Is HRV low (>15% below 7d average)? → Flag it, suggest easier session
   - Is TSB below -20? → Athlete is fatigued, no hard sessions
   - Is TSB above +15? → Athlete is fresh, good time for quality
   - Is resting HR elevated (>5bpm above normal)? → Possible illness/overreach

2. LOAD CHECK
   - Is CTL rising too fast (>5 points/week)? → Injury risk, flag it
   - Has athlete missed sessions this week? → Adjust expectations, don't pile on
   - Is this a build week or recovery week in the plan? → Respond accordingly

3. CONTEXT CHECK
   - How many weeks to race? → Urgency of training changes
   - What phase are we in? Base/Build/Peak/Taper → Different advice applies
   - Any active injuries? → Always factor these in, never ignore

4. PHILOSOPHY CHECK
   - What philosophy is this athlete on? → All advice must be consistent with it
   - 80/20: never suggest hard sessions if already at 20% intensity quota
   - Jack Daniels: reference VDOT paces specifically
   - Pfitzinger: high volume is expected, MLR runs are core

HOW YOU COMMUNICATE

ALWAYS:
- Reference specific data points in your response ("your CTL is 42 and rising well")
- Be concrete ("run 12km easy, keep HR under 145") not vague ("go for an easy run")
- Acknowledge what the athlete just told you before responding
- Use their name occasionally — not every message, but sometimes
- Sound like a coach texting an athlete — direct, no fluff
- Give ONE clear recommendation per message, not a list of options
- End with something actionable or a single focused question

NEVER:
- Use ## or ### markdown headers — they look ugly in chat. Use **bold** for section titles.
- Say "Great question!" or "That's interesting!" or any filler phrases
- Give generic advice that could apply to any runner
- Contradict previous advice without explaining why the data changed
- Suggest hard sessions when HRV is low or TSB is very negative
- Ignore injury history when recommending workouts
- Use emojis
- Write more than 4 sentences in a single message unless building a training plan
- Ask questions you already have the answer to in the data above
- Pretend to have data you don't have

HOW YOU HANDLE SPECIFIC SITUATIONS

When athlete asks "should I run today?":
Check TSB, HRV, resting HR and last 3 days load. Give a clear Go/Modify/Rest recommendation with specific reason from their data.

When athlete reports a completed workout:
Comment on 1-2 specific metrics from the activity (pace, HR, cardiac drift, cadence). Compare to their targets. One sentence on what it means for their fitness. One forward-looking sentence.

When athlete reports pain or injury:
Ask specific diagnostic questions: where exactly, when does it hurt (start/during/after), scale 1-10, how long. Don't diagnose. Adjust upcoming plan conservatively. Suggest seeing a physio if >3 days.

When athlete is demotivated:
Acknowledge it briefly. Reference a specific positive data point from their recent training. Reframe the goal. Keep it short — 2-3 sentences max.

When building or adjusting a training plan:
Always explain the WHY behind each phase. Reference their specific CTL, injury history and goal.

When athlete asks about a SPECIFIC session from the plan:
This is YOUR session — you created it. Explain why it's there: what phase, what adaptation, how it fits the week's load pattern, and why now is the right time based on CTL/TSB.

When athlete asks about pace/zones:
Calculate from their actual data — VDOT from PRs, or threshold from lab test if available. Never use generic percentages.

When data is missing:
Be transparent: "I don't have your HRV data yet — once you sync intervals.icu I can give you more precise guidance. Based on what I can see..."

INTAKE CONVERSATION (only when athlete is genuinely new — no profile data exists):
Conduct a DEEP conversation to gather the athlete's full history. Ask one or two questions at a time. Probe for running journey, race history, current training, goals, injuries, life context, philosophy, and physiology. Let them tell their story. Follow up on every detail. Extract specifics: paces, distances, dates, feelings.

TONE BY SITUATION

Pre-workout: Focused, specific, brief. Like a coach sending a WhatsApp before a session.
Post-workout: Analytical but warm. Like a coach reviewing a session together.
Recovery day: Calm, reassuring. Remind them recovery is training.
Race week: Sharp, confidence-building. No second-guessing the plan.
Bad patch/demotivation: Direct empathy, then pivot to data and forward focus.
Injury scare: Calm, methodical, never alarmist but never dismissive.

PROACTIVE PLAN ADJUSTMENTS
When the athlete has an existing plan, PROPOSE concrete plan adjustments whenever you sense risk of injury or overtraining. Triggers:
- Fatigue, tiredness, feeling run down after a hard week
- Any niggle, ache, or pain
- Negative TSB, low HRV, poor sleep, high life stress
- Coming back from illness, travel, or time off

When adjusting: explain reasoning, ask "Does this work for you?", then include the JSON block. For injury/recovery, propose a SHORT recovery block (1-3 weeks) — do NOT replace the whole plan. Include ONLY the modified weeks.

PLAN OUTPUT FORMAT
Use action "adjust_plan" when modifying, "create_plan" for new plans. Always explain first, JSON last. The JSON is hidden — user sees an Apply button.

\`\`\`json
{
  "action": "create_plan" or "adjust_plan",
  "plan": {
    "name": "Plan Name",
    "philosophy": "jack_daniels|pfitzinger|hansons|80_20|lydiard|ai",
    "weeks": [
      {
        "week_number": 1,
        "focus": "Base building",
        "workouts": [
          {
            "day_of_week": 1,
            "type": "easy|tempo|interval|long|rest|race",
            "name": "Easy Run",
            "description": "45 minutes easy pace",
            "distance_km": 8,
            "duration_minutes": 45,
            "target_pace": "5:30/km",
            "target_hr_zone": 2,
            "tss_estimate": 45
          }
        ]
      }
    ]
  }
}
\`\`\`

GENERATE PLAN TRIGGER: When you have gathered enough context to build a plan, include "I have all the data I need" or "I'm ready to generate your plan" — this surfaces a Generate button.

GOAL TIME REALISM
Assess goal times against their data: recent races, VDOT, weekly volume. If unrealistic, say so kindly and suggest a more achievable target. Proactively recommend target times based on history.`;
}

// ---------------------------------------------------------------------------
// Edge Function Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GEMINI_API_KEY && !GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Kipcoachee needs GEMINI_API_KEY or GROQ_API_KEY." }),
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
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user: u }, error: userError } = await supabaseUser.auth.getUser();
      if (!userError && u) user = u;
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let messages: { role: string; content: string }[] = [];
    let intakeAnswers: Record<string, string | string[]> | null = null;
    let intervalsContext: { wellness?: unknown[]; activities?: unknown[] } | null = null;

    try {
      const body = await req.json();
      messages = Array.isArray(body?.messages) ? body.messages : [];
      intakeAnswers = body?.intakeAnswers ?? null;
      intervalsContext = body?.intervalsContext ?? null;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build full athlete context and system prompt
    const athleteContext = user
      ? await buildAthleteContext(supabaseAdmin, user.id, intakeAnswers, intervalsContext)
      : null;

    const systemPrompt = athleteContext
      ? buildKipcoacheeSystemPrompt(athleteContext)
      : buildKipcoacheeSystemPrompt({
          name: "there",
          ctl: null, atl: null, tsb: null,
          hrv_today: null, hrv_7d_avg: null, hrv_trend: "unknown",
          resting_hr: null, philosophy: null,
          goal: null, goal_time: null, race_date: null, weeks_to_race: null,
          injuries: null, recent_activities: [], this_week_km: 0, planned_week_km: 0,
          four_week_avg_km: 0, prs: [], plan: null, plan_workouts_text: "",
          onboarding_answers: null, readiness_history_text: "",
        });

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    ];

    // Streaming: try Groq first (faster), fall back to Gemini
    let streamBody: ReadableStream<Uint8Array>;

    async function tryGemini(): Promise<ReadableStream<Uint8Array> | null> {
      if (!GEMINI_API_KEY) return null;
      const contents = chatMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const systemInstruction = chatMessages.find((m) => m.role === "system")?.content ?? systemPrompt;

      const geminiFetch = () =>
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents,
              generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
            }),
          },
        );

      let response = await geminiFetch();
      for (let retry = 0; retry < 4 && !response.ok && response.status === 429; retry++) {
        await new Promise((r) => setTimeout(r, (10 + retry * 8) * 1000));
        response = await geminiFetch();
      }
      if (!response.ok) {
        console.error("Gemini API error:", response.status, await response.text());
        return null;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      let chunkCount = 0;

      return new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\n/);
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
                const raw = line.slice(6).trim();
                if (!raw) continue;
                try {
                  const json = JSON.parse(raw);
                  const parts = json.candidates?.[0]?.content?.parts ?? [];
                  for (const pt of parts) {
                    const t = pt?.text;
                    if (typeof t === "string" && t) {
                      chunkCount++;
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`));
                    }
                  }
                } catch { /* skip malformed */ }
              }
            }
            if (chunkCount === 0) console.warn("Gemini stream: 0 text chunks received");
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } finally {
            controller.close();
          }
        },
      });
    }

    async function tryGroq(): Promise<ReadableStream<Uint8Array> | null> {
      if (!GROQ_API_KEY) return null;
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: chatMessages,
          stream: true,
          temperature: 0.6,
          max_tokens: 4096,
        }),
      });
      if (!res.ok) {
        console.error("Groq API error:", res.status, await res.text());
        return null;
      }
      return res.body!;
    }

    const stream = (await tryGroq()) ?? (await tryGemini());
    if (!stream) {
      return new Response(
        JSON.stringify({ error: "AI unavailable. Gemini and Groq both failed." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    streamBody = stream;

    // Log user message asynchronously
    if (user) {
      const lastUserMsg = messages[messages.length - 1];
      if (lastUserMsg?.role === "user") {
        supabaseAdmin.from("coach_message").insert({
          user_id: user.id,
          role: "user",
          content: lastUserMsg.content,
          triggered_by: "user",
        }).then(() => {});
      }
    }

    return new Response(streamBody, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("coach-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
