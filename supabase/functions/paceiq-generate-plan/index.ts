import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_PROMPT = `You are Kipcoachee building a running training plan.
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
      "name": string,
      "description": string,
      "key_focus": string,
      "distance_km": number,
      "duration_minutes": number,
      "target_pace": string,
      "target_hr_zone": number,
      "tss_estimate": number
    }]
  }]
}

Rules:
- day_of_week: 1=Mon, 2=Tue, ..., 7=Sun
- Match athlete's days_per_week and longest_day from intake
- Respect injuries: avoid high load where relevant
- Use metric (km, /km pace)
- Include rest days. Progress: base → build → peak → taper.`;

function buildPlanUserPrompt(
  answers: Record<string, unknown>,
  philosophy: string,
  raceDate: string | null,
  requiredWeeks: number | null
): string {
  let prompt = `Athlete onboarding: ${JSON.stringify(answers)}.\n\n`;
  prompt += `CRITICAL: The athlete chose philosophy "${philosophy}". Build the plan STRICTLY using this philosophy — every workout type, volume, and progression must align with it.\n\n`;
  if (raceDate && requiredWeeks != null && requiredWeeks > 0) {
    prompt += `RACE DATE: ${raceDate}. You MUST generate exactly ${requiredWeeks} weeks of training. The last week must be taper ending on race day. Do not stop early — the plan must cover every week from start to race day.`;
  } else {
    prompt += `Use philosophy: ${philosophy}.`;
  }
  return prompt;
}

async function callGroq(
  answers: Record<string, unknown>,
  philosophy: string,
  raceDate: string | null,
  requiredWeeks: number | null
): Promise<unknown> {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) return null;
  console.log("paceiq-generate-plan: trying Groq...");
  const userContent = buildPlanUserPrompt(answers, philosophy, raceDate, requiredWeeks);
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: PLAN_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    console.error("Groq error:", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = parsePlanJson(content);
  if (!parsed) console.error("Groq returned ok but parsePlanJson failed (malformed JSON)");
  return parsed;
}

async function callGemini(
  answers: Record<string, unknown>,
  philosophy: string,
  raceDate: string | null,
  requiredWeeks: number | null
): Promise<unknown> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) return null;
  const userContent = buildPlanUserPrompt(answers, philosophy, raceDate, requiredWeeks);
  const prompt = `${PLAN_PROMPT}\n\n${userContent}`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
      }),
    }
  );
  if (!res.ok) {
    console.error("Gemini error:", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parsePlanJson(content);
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

function getNextMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d;
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

    const raceDate = (answers as { raceDate?: string }).raceDate ?? null;
    const startDate = getNextMonday();
    const requiredWeeks = raceDate
      ? Math.max(8, Math.ceil((new Date(raceDate).getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)))
      : null;

    const hasGroq = !!Deno.env.get("GROQ_API_KEY");
    const hasGemini = !!Deno.env.get("GEMINI_API_KEY");
    const planRaw = (await callGroq(answers, philosophy, raceDate, requiredWeeks)) ?? (await callGemini(answers, philosophy, raceDate, requiredWeeks));
    if (!planRaw || typeof planRaw !== "object") {
      const reason = !hasGroq && !hasGemini
        ? "No API keys in env"
        : `Both APIs failed (keys present: groq=${hasGroq} gemini=${hasGemini}). Check Supabase logs.`;
      console.error("paceiq-generate-plan AI failed:", reason);
      return new Response(
        JSON.stringify({ error: "AI unavailable. Set GROQ_API_KEY or GEMINI_API_KEY in Supabase secrets." }),
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
    const goalDistance = (answers as { goalDistance?: string }).goalDistance ?? null;
    const totalWeeks = requiredWeeks ?? plan.total_weeks ?? weeks.length;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + totalWeeks * 7 - 1);

    const { data: planRow, error: planErr } = await supabase
      .from("training_plan")
      .insert({
        user_id: user.id,
        plan_name: plan.plan_name ?? "Training Plan",
        philosophy: plan.philosophy ?? philosophy,
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
        goal_race: goalDistance ?? null,
        goal_date: raceDate,
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

    for (const wk of weeks) {
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + ((wk.week_number ?? 1) - 1) * 7);
      const workouts = wk.workouts ?? [];
      for (const w of workouts) {
        const dow = w.day_of_week ?? 1;
        const workoutDate = new Date(weekStart);
        workoutDate.setDate(workoutDate.getDate() + (dow - 1));
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
          duration_minutes: w.duration_minutes ?? null,
          target_pace: w.target_pace ?? null,
          target_hr_zone: w.target_hr_zone ?? null,
          tss_estimate: w.tss_estimate ?? null,
          completed: false,
        });
      }
    }

    return new Response(
      JSON.stringify({
        plan_id: planRow.id,
        plan_name: plan.plan_name ?? "Training Plan",
        philosophy: plan.philosophy ?? philosophy,
        total_weeks: totalWeeks,
        peak_weekly_km: plan.peak_weekly_km ?? null,
        start_date: startDate.toISOString().slice(0, 10),
        first_workout: (() => {
          const first = weeks[0]?.workouts?.[0];
          if (!first) return null;
          const d = new Date(startDate);
          d.setDate(d.getDate() + ((first.day_of_week ?? 1) - 1));
          return { name: first.name ?? first.description, date: d.toISOString().slice(0, 10) };
        })(),
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
