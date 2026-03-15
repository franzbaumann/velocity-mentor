import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AI_LIMITS } from "../_shared/ai-models.ts";

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
  session_library_id?: string | null;
  structure_detail?: string | null;
  is_double_run?: boolean;
}

interface PlanWeek {
  week_number: number;
  start_date: string;
  phase?: string;
  sessions: PlanSession[];
}

interface PlanOutput {
  race_date: string | null;
  race_type: string;
  target_time?: string;
  weeks: PlanWeek[];
}

function createFallbackPlan(intake: Record<string, unknown>): PlanOutput {
  const freq = Array.isArray(intake.weekly_frequency) ? 4 : 3;
  const nextMon = new Date();
  nextMon.setDate(nextMon.getDate() + ((8 - nextMon.getDay()) % 7) || 7);
  const weeks: PlanWeek[] = [];
  for (let w = 0; w < 8; w++) {
    const start = new Date(nextMon);
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

const PLAN_PROMPT = `You are Coach Cade — an elite AI running coach. Generate a structured training plan as JSON only. No markdown, no explanation — just valid JSON.

Input: athlete intake (goals, experience, volume, race date, philosophy, injuries, stress, available days).

Output JSON format:
{
  "race_date": "YYYY-MM-DD" or null,
  "race_type": "5K" | "10K" | "Half Marathon" | "Marathon" | "Ultra" | "General",
  "target_time": "e.g. 3:30:00" or omit,
  "weeks": [
    {
      "week_number": 1,
      "start_date": "YYYY-MM-DD (Monday of that week)",
      "phase": "base" | "build" | "peak" | "taper",
      "sessions": [
        {
          "day_of_week": 1,
          "session_type": "easy" | "tempo" | "intervals" | "long" | "recovery" | "rest",
          "session_library_id": "m-01" or null,
          "description": "e.g. Easy 45min",
          "distance_km": 8,
          "duration_min": 45,
          "pace_target": "5:30/km",
          "structure_detail": "e.g. 5×1000m @ 3:45/km w/ 90s jog" or null,
          "is_double_run": false
        }
      ]
    }
  ]
}

SESSION LIBRARY IDs — ALWAYS use these when possible:
1500m: 1500-01 to 1500-10 (Easy Run, Strides, Hill Sprints, LT Continuous, Cruise Intervals, VO2max Short/Medium, Race Pace Rehearsal, Short Fartlek, Long Run)
5K: 5k-01 to 5k-12 (Easy Run, Recovery Run, LT Continuous, Cruise Intervals, Billat VO2max, 30-30, 1000m Repeats, Race Pace Intervals, Pyramid, Kenyan Fartlek, Long Run)
10K: 10k-03 to 10k-12 (LT Continuous, Threshold Intervals, Long Cruise, 1200m Repeats, Race Pace, Tempo Race Sim, General Aerobic MLR)
Half Marathon: hm-04 to hm-12 (Medium Long, Long Threshold, HM Pace Intervals, HM Pace Tempo, VO2max Sparse, Long Run Easy, Progressive Long)
Marathon: m-01 to m-16 (Easy Run, Recovery, GA Run, LT Continuous, Cruise Intervals, MP Short, MP Long, Long Run Easy, Progressive Long, B2B Day 1/2, Kipchoge Long, VO2max Sparse, Easy Double)
Ultra: u-01 to u-08 (Easy Trail, Long Aerobic, B2B Day 1/2, Long Hill Repeats, Trail Fartlek, Power Hiking)
Season: s-01 to s-08 (Sharpening, Pre-Race Tune-Up, Maintenance Threshold)
Strength: str-01, str-02. Mobility: mob-01, mob-02.

PLAN GENERATION RULES:
1. ALWAYS reference sessions by library ID in session_library_id field.
2. Calculate ALL paces from athlete's VDOT or race times. Never use generic percentages.
3. Apply philosophy rules strictly:
   - 80/20: NEVER use Z3 sessions. Only Z1-Z2 or Z4-Z5. No gray zone.
   - Norwegian: Dominate with threshold doubles. Minimal VO2max.
   - Lydiard: No intensity until Build week 3+. Aerobic base first.
   - Hansons: No run > 26km. Back-to-back is core. MP work is king.
   - Pfitzinger: Medium long runs every week. General aerobic important.
   - Daniels: Exact VDOT paces always. Structured intervals.
   - Japanese: Very high volume base. Long jogs at moderate effort.
4. Distance rules: Ultra=no VO2max; Marathon=VO2max max 1x/2wks peak only; 5K/10K=VO2max freely Build/Peak.
5. Volume from CTL: <30→50%; 30-50→65%; 50-70→75%; 70+→85% of target.
6. Double runs (is_double_run=true): only if athlete enabled AND CTL>65. Second run always easy. Max 3/week.
7. Recovery weeks: every 3rd week reduce volume 25%. Max 7% weekly volume increase.
8. day_of_week: 0=Sun, 1=Mon, ..., 6=Sat.
9. start_date: Monday of each week. If race_date exists, work backward.
10. Plan length: weeks until race, else 8 weeks.
11. Sessions per week: match weekly_frequency. Include rest days.
12. Progress: base → build → peak → taper. Use metric (km, /km pace).

CRITICAL — QUALITY SESSIONS (NEVER ALL EASY):
- NEVER generate a plan where weeks are only easy runs. Every week (except taper) MUST include at least 1–2 quality sessions: tempo, intervals, or long run.
- Marathon plans: Each base/build/peak week needs tempo OR MP run, plus a long run.
- Hansons: Tuesday = tempo/SOS, Thursday = speed or MP, Sunday = long run (max 26km). Easy runs fill other days.
- Plan length: If race_date exists, generate ALL weeks from start to race day. Do NOT truncate.`;

async function fetchWith429Retry(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  let res = await fetch(url, init);
  for (let r = 0; r < maxRetries && res.status === 429; r++) {
    await new Promise((x) => setTimeout(x, (5 + r * 5) * 1000));
    res = await fetch(url, init);
  }
  return res;
}

async function callClaude(userPrompt: string): Promise<string | null> {
  const keys = [Deno.env.get("ANTHROPIC_API_KEY"), Deno.env.get("ANTHROPIC_API_KEY_2"), Deno.env.get("ANTHROPIC_API_KEY_3")].filter((k): k is string => !!k);
  for (const key of keys) {
    const res = await fetchWith429Retry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_LIMITS.planGeneration.model,
        max_tokens: AI_LIMITS.planGeneration.max_tokens,
        system: PLAN_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (res.status === 429) continue;
    if (!res.ok) {
      console.error("coach-generate-plan Claude error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const block = (json.content ?? []).find((b: { type: string }) => b.type === "text");
    return block?.text ?? null;
  }
  return null;
}

async function callGroq(userPrompt: string): Promise<string | null> {
  const keys = [Deno.env.get("GROQ_API_KEY"), Deno.env.get("GROQ_API_KEY_2"), Deno.env.get("GROQ_API_KEY_3")].filter((k): k is string => !!k);
  for (const key of keys) {
    const res = await fetchWith429Retry("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: PLAN_PROMPT }, { role: "user", content: userPrompt }],
        temperature: 0.4,
        max_tokens: AI_LIMITS.planGeneration.max_tokens,
      }),
    });
    if (res.status === 429) continue;
    if (!res.ok) {
      console.error("coach-generate-plan Groq error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? null;
  }
  return null;
}

async function callGemini(userPrompt: string): Promise<string | null> {
  const keys = [Deno.env.get("GEMINI_API_KEY"), Deno.env.get("GEMINI_API_KEY_2"), Deno.env.get("GEMINI_API_KEY_3")].filter((k): k is string => !!k);
  const prompt = `${PLAN_PROMPT}\n\n${userPrompt}`;
  for (const key of keys) {
    const res = await fetchWith429Retry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: AI_LIMITS.planGeneration.max_tokens },
      }),
    });
    if (res.status === 429) continue;
    if (!res.ok) {
      console.error("coach-generate-plan Gemini error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anthropicKeys = [Deno.env.get("ANTHROPIC_API_KEY"), Deno.env.get("ANTHROPIC_API_KEY_2"), Deno.env.get("ANTHROPIC_API_KEY_3")].filter((k): k is string => !!k);
    const groqKeys = [Deno.env.get("GROQ_API_KEY"), Deno.env.get("GROQ_API_KEY_2"), Deno.env.get("GROQ_API_KEY_3")].filter((k): k is string => !!k);
    const geminiKeys = [Deno.env.get("GEMINI_API_KEY"), Deno.env.get("GEMINI_API_KEY_2"), Deno.env.get("GEMINI_API_KEY_3")].filter((k): k is string => !!k);
    if (anthropicKeys.length === 0 && groqKeys.length === 0 && geminiKeys.length === 0) {
      return new Response(JSON.stringify({ error: "AI service temporarily unavailable." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
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
    const userPrompt = `Generate a training plan. Intake: ${JSON.stringify(intakeAnswers)}${convStr}`;

    const rawContent =
      (await callClaude(userPrompt)) ?? (await callGroq(userPrompt)) ?? (await callGemini(userPrompt));
    if (!rawContent) {
      return new Response(JSON.stringify({ error: "AI service temporarily unavailable." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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
          phase: wk.phase ?? null,
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
        const offset = dow === 0 ? -1 : dow - 1;
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
          session_library_id: s.session_library_id ?? null,
          structure_detail: s.structure_detail ?? null,
          is_double_run: s.is_double_run ?? false,
        });
      }
    }

    return new Response(JSON.stringify({ plan_id: planRow.id }), {
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
