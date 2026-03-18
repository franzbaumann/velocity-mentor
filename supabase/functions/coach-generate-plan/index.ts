import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PlanSession {
  day_of_week: number;
  session_type: string;
  description: string;
  distance_km?: number;
  duration_min?: number;
  pace_target?: string;
}

interface PlanWeek {
  week_number: number;
  start_date: string;
  sessions: PlanSession[];
}

interface PlanOutput {
  race_date: string | null;
  race_type: string;
  target_time?: string;
  weeks: PlanWeek[];
}

type PlanResult = {
  plan_id: string;
  plan_name: string;
  philosophy: string;
  total_weeks: number;
  peak_weekly_km: number | null;
  start_date: string;
  first_workout: { name: string; date: string } | null;
};

function createFallbackPlan(intake: Record<string, unknown>): PlanOutput {
  const freq = Array.isArray(intake.weekly_frequency) ? 4 : 3;
  const requestedStart =
    typeof intake.plan_start_date === "string" ? new Date(intake.plan_start_date) : null;
  const startDate =
    requestedStart && !isNaN(requestedStart.getTime()) ? requestedStart : new Date();
  const weeks: PlanWeek[] = [];
  for (let w = 0; w < 8; w++) {
    const start = new Date(startDate);
    start.setDate(start.getDate() + w * 7);
    const sessions: PlanSession[] = [
      { day_of_week: 1, session_type: "easy", description: "Easy 30-40 min", duration_min: 35, pace_target: "comfortable" },
      { day_of_week: 3, session_type: "easy", description: "Easy 30-40 min", duration_min: 35, pace_target: "comfortable" },
      { day_of_week: 5, session_type: "tempo", description: "Tempo 20-30 min", duration_min: 25, pace_target: "moderate-hard" },
      { day_of_week: 6, session_type: "long", description: "Long run 60-90 min", duration_min: 75, pace_target: "easy" },
    ].slice(0, Math.min(freq + 1, 4));
    weeks.push({ week_number: w + 1, start_date: start.toISOString().slice(0, 10), sessions });
  }
  return { race_date: null, race_type: "General", weeks };
}

const PLAN_PROMPT = `You are Kipcoachee. Generate a structured training plan as JSON only. No markdown, no explanation — just valid JSON.

Input: athlete intake (goals, experience, volume, race date, philosophy, injuries, stress, available days).

Output JSON format:
{
  "race_date": "YYYY-MM-DD" or null if no date,
  "race_type": "5K" | "10K" | "Half Marathon" | "Marathon" | "Ultra" | "General",
  "target_time": "e.g. 3:30:00" or omit,
  "weeks": [
    {
      "week_number": 1,
      "start_date": "YYYY-MM-DD (Monday of that week)",
      "sessions": [
        {
          "day_of_week": 1,
          "session_type": "easy" | "tempo" | "intervals" | "long" | "recovery" | "rest",
          "description": "e.g. Easy 45min",
          "distance_km": 8,
          "duration_min": 45,
          "pace_target": "5:30/km"
        }
      ]
    }
  ]
}

Rules:
- day_of_week: 0=Sun, 1=Mon, ..., 6=Sat. Use athlete's available_days and long_run_day.
- start_date: MUST be the Monday (YYYY-MM-DD) of each week.
  If intake includes plan_start_date, Week 1 start_date MUST equal that date.
  Else if race_date exists, work backward: race week = taper, then count back.
  Else start from today (or next day) — but keep start_date consistent week to week (start_date + 7d).
- Plan length: weeks until race (if known), else 8 weeks. If no race, 8 weeks.
- Sessions per week: match weekly_frequency from intake. Include rest days.
- Progress: base → intensity → taper. Recovery weeks every 3-4 weeks.
- Use metric (km, /km). Be specific: distance or duration, target pace.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!LOVABLE_API_KEY && !ANTHROPIC_API_KEY) {
      throw new Error(
        "No AI key configured. Set ANTHROPIC_API_KEY or LOVABLE_API_KEY in Supabase.",
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    let user: { id: string } | null = null;
    if (token) {
      try {
        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: { user: u }, error: ue } = await supabaseUser.auth.getUser();
        if (!ue && u) user = u;
      } catch (e) {
        console.error("Auth check failed:", e);
      }
    }

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized – sign in and try again" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const intakeAnswers = body?.intakeAnswers ?? {};
    const conversationContext = body?.conversationContext ?? [];

    if (typeof intakeAnswers !== "object") {
      return new Response(JSON.stringify({ error: "Missing intakeAnswers" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const convStr = Array.isArray(conversationContext) && conversationContext.length > 0
      ? `\n\nConversation context:\n${conversationContext.map((m: { role?: string; content?: string }) => `${m.role}: ${m.content}`).join("\n")}`
      : "";
    const userPrompt = `Generate a training plan. Intake: ${
      JSON.stringify(intakeAnswers)
    }${convStr}`;

    async function callAnthropic(): Promise<string | null> {
      if (!ANTHROPIC_API_KEY) return null;

      const anthropicFetch = () =>
        fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-latest",
            system: PLAN_PROMPT,
            max_tokens: 4096,
            temperature: 0.7,
            messages: [{ role: "user", content: userPrompt }],
          }),
        });

      let res = await anthropicFetch();
      for (
        let retry = 0;
        retry < 3 && !res.ok && res.status === 429;
        retry++
      ) {
        await new Promise((r) =>
          setTimeout(r, (5 + retry * 5) * 1000)
        );
        res = await anthropicFetch();
      }

      if (!res.ok) {
        console.error("Anthropic plan error:", res.status, await res.text());
        return null;
      }

      const json = await res.json();
      const content = Array.isArray(json.content)
        ? json.content
            .filter((c: { type?: string }) => c.type === "text")
            .map((c: { text?: string }) => c.text ?? "")
            .join("")
        : "";
      return content || null;
    }

    async function callLovable(): Promise<string | null> {
      if (!LOVABLE_API_KEY) return null;
      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: PLAN_PROMPT },
              { role: "user", content: userPrompt },
            ],
            stream: false,
          }),
        },
      );

      if (!response.ok) {
        const t = await response.text();
        console.error("Lovable AI error:", response.status, t);
        return null;
      }

      const json = await response.json();
      return json.choices?.[0]?.message?.content ?? null;
    }

    const rawContent =
      (await callAnthropic()) ??
      (await callLovable()) ??
      "";
    let cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
    let plan: PlanOutput;
    try {
      plan = JSON.parse(cleaned);
    } catch {
      console.error("Parse error, using fallback. Raw:", rawContent.slice(0, 500));
      plan = createFallbackPlan(intakeAnswers);
    }

    if (!plan.weeks || !Array.isArray(plan.weeks) || plan.weeks.length === 0) {
      plan = createFallbackPlan(intakeAnswers);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: planRow, error: planErr } = await supabase
      .from("training_plan")
      .insert({
        user_id: user.id,
        race_date: plan.race_date || null,
        race_type: plan.race_type || "General",
        target_time: plan.target_time || null,
        weeks_total: plan.weeks.length,
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

    for (const wk of plan.weeks) {
      const { data: weekRow, error: weekErr } = await supabase
        .from("training_week")
        .insert({
          plan_id: planRow.id,
          week_number: wk.week_number,
          start_date: wk.start_date,
        })
        .select("id")
        .single();

      if (weekErr || !weekRow) {
        console.error("Insert week error:", weekErr);
        continue;
      }

      const sessions = wk.sessions ?? [];
      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i];
        const startDate = new Date(wk.start_date);
        const sessionDate = new Date(startDate);
        const dow = s.day_of_week ?? 1;
        // Week start can be any day; schedule on next occurrence of requested weekday.
        const weekStartDow = startDate.getDay(); // 0=Sun..6=Sat
        const offset = (dow - weekStartDow + 7) % 7;
        sessionDate.setDate(sessionDate.getDate() + offset);
        const scheduledDate = sessionDate.toISOString().slice(0, 10);

        await supabase.from("training_session").insert({
          week_id: weekRow.id,
          day_of_week: s.day_of_week ?? 0,
          scheduled_date: scheduledDate,
          session_type: s.session_type || "easy",
          description: s.description || "",
          distance_km: s.distance_km ?? null,
          duration_min: s.duration_min ?? null,
          pace_target: s.pace_target ?? null,
          order_index: i,
        });
      }
    }

    // Return a richer payload so web + app can render immediately.
    const philosophy =
      (typeof (intakeAnswers as Record<string, unknown>)?.philosophy === "string"
        ? String((intakeAnswers as Record<string, unknown>).philosophy)
        : "") || "unknown";

    const { data: firstSession } = await supabase
      .from("training_session")
      .select("description, scheduled_date")
      .in(
        "week_id",
        (
          await supabase
            .from("training_week")
            .select("id")
            .eq("plan_id", planRow.id)
        ).data?.map((w: { id: string }) => w.id) ?? [],
      )
      .order("scheduled_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    const result: PlanResult = {
      plan_id: planRow.id,
      plan_name:
        (typeof (intakeAnswers as Record<string, unknown>)?.plan_name === "string"
          ? String((intakeAnswers as Record<string, unknown>).plan_name)
          : null) ??
        (typeof (intakeAnswers as Record<string, unknown>)?.race_goal === "string"
          ? `Plan for ${String((intakeAnswers as Record<string, unknown>).race_goal)}`
          : "Training Plan"),
      philosophy,
      total_weeks: plan.weeks.length,
      peak_weekly_km: null,
      start_date: plan.weeks[0]?.start_date ?? new Date().toISOString().slice(0, 10),
      first_workout: firstSession?.scheduled_date
        ? { name: firstSession.description ?? "Workout", date: String(firstSession.scheduled_date).slice(0, 10) }
        : null,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("coach-generate-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
