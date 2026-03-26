import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type PhilosophyRecommendation = {
  primary: { philosophy: string; reason: string; confidence: number };
  alternatives: Array<{ philosophy: string; reason: string }>;
};

function normStr(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

function safeWeeksUntil(dateStr: string): number | null {
  const s = normStr(dateStr);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const diff = d.getTime() - Date.now();
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
}

function normDistance(distance: string): "5k" | "10k" | "half" | "marathon" | "ultra" | "general" {
  const d = distance.toLowerCase();
  if (d.includes("marathon") && !d.includes("half")) return "marathon";
  if (d.includes("half")) return "half";
  if (d.includes("10")) return "10k";
  if (d.includes("5")) return "5k";
  if (d.includes("ultra")) return "ultra";
  return "general";
}

function isExperienced(level: string): boolean {
  return level === "experienced" || level === "competitive";
}

function hasInjurySignals(args: {
  injuries: unknown;
  injuryDetail: unknown;
  goal: unknown;
}): boolean {
  const injuries = Array.isArray(args.injuries) ? args.injuries.map((x) => normStr(x)) : [];
  const injuryDetail = normStr(args.injuryDetail);
  const goal = normStr(args.goal);
  const hasList = injuries.some((i) => i && i !== "none");
  const hasDetail = injuryDetail.length > 0 && injuryDetail.toLowerCase() !== "none";
  return hasList || hasDetail || goal === "return_injury";
}

function recommend(args: {
  weeklyKm: number;
  daysPerWeek: number;
  raceDistance: string;
  raceDate: string;
  hasIntervalsData: boolean;
  injuries: unknown;
  injuryDetail: unknown;
  experienceLevel: string;
  goal: unknown;
}): PhilosophyRecommendation {
  const weeklyKm = args.weeklyKm ?? 0;
  const daysPerWeek = args.daysPerWeek ?? 0;
  const distance = normDistance(args.raceDistance);
  const experienceLevel = args.experienceLevel;
  const weeksToRace = safeWeeksUntil(args.raceDate);
  const hasData = args.hasIntervalsData !== false;

  let primary: PhilosophyRecommendation["primary"];
  const alternatives: PhilosophyRecommendation["alternatives"] = [];

  if (hasInjurySignals({ injuries: args.injuries, injuryDetail: args.injuryDetail, goal: args.goal })) {
    primary = {
      philosophy: "80_20_polarized",
      reason:
        "With injury signals in your profile, a polarized structure keeps hard work constrained while you rebuild durable volume.",
      confidence: 0.88,
    };
    alternatives.push(
      { philosophy: "lydiard", reason: "Aerobic-first base building can work if you keep intensity tightly controlled." },
      { philosophy: "jack_daniels", reason: "VDOT structure is helpful later, once you're handling consistent volume." },
    );
    return { primary, alternatives };
  }

  if (!hasData && (weeksToRace == null || weeksToRace > 8)) {
    primary = {
      philosophy: "80_20_polarized",
      reason:
        "Without reliable training data, a polarized structure is the safest default: it protects consistency while still allowing focused progress.",
      confidence: 0.84,
    };
    alternatives.push(
      { philosophy: "jack_daniels", reason: "VDOT can work if you want stricter pace targets (but needs accurate paces)." },
      { philosophy: "lydiard", reason: "Base building is effective if you keep intensity honest and progress gradually." },
    );
    return { primary, alternatives };
  }

  if (weeksToRace != null && weeksToRace > 0 && weeksToRace <= 8) {
    const isA = distance !== "general";
    const canSharpen = isA && weeklyKm >= 25 && (daysPerWeek >= 3 || daysPerWeek === 0);
    const marathonHighVolumeSpecialist =
      isExperienced(experienceLevel) && daysPerWeek >= 5 && distance === "marathon" && weeklyKm >= 65;

    if (canSharpen && !marathonHighVolumeSpecialist) {
      primary = {
        philosophy: "jack_daniels",
        reason:
          "With race day approaching, VDOT-style structure gives clear pacing and sharpening while keeping the rest of training controlled.",
        confidence: 0.87,
      };
      alternatives.push(
        { philosophy: "80_20_polarized", reason: "Polarized is a good option if you want simpler intensity control approaching race day." },
        ...(distance === "marathon" || distance === "half"
          ? [{ philosophy: "hansons", reason: "Hansons can suit if you prefer consistent moderate work over big long runs." }]
          : [{ philosophy: "kenyan_model", reason: "If you thrive on fartlek and group-style sessions, this can be motivating." }]),
      );
      return { primary, alternatives };
    }
  }

  if (isExperienced(experienceLevel) && daysPerWeek >= 5 && (distance === "marathon" || distance === "half")) {
    if (weeklyKm >= 65) {
      primary = {
        philosophy: "pfitzinger",
        reason:
          "For experienced runners with higher volume, Pfitzinger-style LT + aerobic development tends to convert mileage into race performance efficiently.",
        confidence: 0.87,
      };
      alternatives.push(
        { philosophy: "hansons", reason: "Hansons can suit if you prefer more frequent moderate work and slightly shorter long runs." },
        { philosophy: "jack_daniels", reason: "VDOT paces provide a clean sharpening framework approaching race day." },
      );
      return { primary, alternatives };
    }
    if (weeklyKm >= 50) {
      primary = {
        philosophy: "hansons",
        reason:
          "At moderate-high volume with good frequency, Hansons-style consistency builds marathon readiness without over-relying on a single long run.",
        confidence: 0.85,
      };
      alternatives.push(
        { philosophy: "jack_daniels", reason: "VDOT structure can be simpler if you want clearer pace prescriptions." },
        { philosophy: "80_20_polarized", reason: "Polarized structure can reduce burnout while keeping key work effective." },
      );
      return { primary, alternatives };
    }
  }

  if (isExperienced(experienceLevel) && (distance === "5k" || distance === "10k") && weeklyKm >= 30) {
    primary = {
      philosophy: "jack_daniels",
      reason:
        "For 5K/10K with experience, VDOT-based pacing and structured quality sessions tend to deliver reliable speed gains.",
      confidence: 0.86,
    };
    alternatives.push(
      { philosophy: "80_20_polarized", reason: "Polarized distribution keeps intensity controlled while still sharpening speed." },
      { philosophy: "kenyan_model", reason: "If you thrive on fartlek and group-style sessions, this can be motivating." },
    );
    return { primary, alternatives };
  }

  if (experienceLevel === "beginner") {
    primary = {
      philosophy: "80_20_polarized",
      reason:
        "As a newer runner, keeping most work easy and limiting hard sessions helps consistency and reduces injury risk.",
      confidence: 0.86,
    };
    alternatives.push(
      { philosophy: "lydiard", reason: "Base building works well if you enjoy steady aerobic progression." },
      { philosophy: "jack_daniels", reason: "VDOT can be useful later once volume is stable." },
    );
    return { primary, alternatives };
  }

  if (weeklyKm < 30) {
    primary = {
      philosophy: "80_20_polarized",
      reason:
        "At under 30 km/week, 80/20 keeps intensity balanced and reduces injury risk while you build volume.",
      confidence: 0.85,
    };
    alternatives.push(
      {
        philosophy: "jack_daniels",
        reason: "VDOT-based training gives clear paces as you increase volume.",
      },
      {
        philosophy: "lydiard",
        reason: "Base-first approach suits lower volume; add intensity later.",
      },
    );
  } else if (weeklyKm <= 60) {
    primary = {
      philosophy: "jack_daniels",
      reason:
        "In the 30–60 km/week range, Jack Daniels VDOT provides structured zones and proven progressions.",
      confidence: 0.85,
    };
    alternatives.push(
      {
        philosophy: "80_20_polarized",
        reason: "Polarized model works well at this volume for race-focused training.",
      },
      {
        philosophy: "lydiard",
        reason: "Lydiard base-building fits if you prefer a long aerobic phase.",
      },
    );
  } else {
    primary = {
      philosophy: "lydiard",
      reason:
        "Above 60 km/week, Lydiard base-building leverages your volume and periodizes intensity effectively.",
      confidence: 0.85,
    };
    alternatives.push(
      {
        philosophy: "jack_daniels",
        reason: "VDOT structure pairs well with high volume for sharpening.",
      },
      {
        philosophy: "pfitzinger",
        reason: "Pfitzinger suits high mileage with lactate threshold focus.",
      },
    );
  }

  return { primary, alternatives };
}

const PHILOSOPHY_SYSTEM_PROMPT = `You are Kipcoachee, an elite AI running coach.
Recommend the best training philosophy for this athlete.
Available philosophies: 80_20_polarized, jack_daniels, lydiard, hansons, pfitzinger, kenyan_model
Return ONLY valid JSON, no other text:
{
  "primary": { "philosophy": string, "reason": string, "confidence": number },
  "alternatives": [
    { "philosophy": string, "reason": string },
    { "philosophy": string, "reason": string }
  ]
}`;

async function callGroqPhilosophy(answers: Record<string, unknown>): Promise<PhilosophyRecommendation | null> {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) return null;
  console.log("paceiq-philosophy: trying Groq...");
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: PHILOSOPHY_SYSTEM_PROMPT },
          { role: "user", content: `Athlete onboarding answers: ${JSON.stringify(answers)}` },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) { console.error("Groq error:", res.status, await res.text()); return null; }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    return parsePhilosophyJson(content);
  } catch (e) {
    console.error("Groq exception:", e);
    return null;
  }
}

async function callGeminiPhilosophy(answers: Record<string, unknown>): Promise<PhilosophyRecommendation | null> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) return null;
  console.log("paceiq-philosophy: trying Gemini...");
  try {
    const prompt = `${PHILOSOPHY_SYSTEM_PROMPT}\n\nAthlete onboarding answers: ${JSON.stringify(answers)}`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
        }),
      }
    );
    if (!res.ok) { console.error("Gemini error:", res.status, await res.text()); return null; }
    const json = await res.json();
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return parsePhilosophyJson(content);
  } catch (e) {
    console.error("Gemini exception:", e);
    return null;
  }
}

function parsePhilosophyJson(content: string): PhilosophyRecommendation | null {
  const cleaned = content.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      primary?: { philosophy?: string; reason?: string; confidence?: number };
      alternatives?: Array<{ philosophy?: string; reason?: string }>;
    };
    const validPhilosophies = ["80_20_polarized", "jack_daniels", "lydiard", "hansons", "pfitzinger", "kenyan_model"];
    if (!parsed?.primary?.philosophy || !validPhilosophies.includes(parsed.primary.philosophy)) return null;
    return {
      primary: {
        philosophy: parsed.primary.philosophy,
        reason: parsed.primary.reason ?? "",
        confidence: typeof parsed.primary.confidence === "number" ? parsed.primary.confidence : 0.85,
      },
      alternatives: (parsed.alternatives ?? [])
        .filter((a) => a.philosophy && validPhilosophies.includes(a.philosophy))
        .slice(0, 2)
        .map((a) => ({ philosophy: a.philosophy!, reason: a.reason ?? "" })),
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized – sign in and try again" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: ue } = await supabase.auth.getUser();
    if (ue || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized – sign in and try again" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const answers = body?.answers ?? {};
    const rawWeeklyKm = (answers?.weeklyKm ?? answers?.weekly_km ?? answers?.fitnessKm ?? 0) as unknown;
    const weeklyKm = typeof rawWeeklyKm === "number" ? rawWeeklyKm : Number(String(rawWeeklyKm || 0));
    const rawDays = (answers?.daysPerWeek ?? answers?.days_per_week ?? 0) as unknown;
    const daysPerWeek = typeof rawDays === "number" ? rawDays : Number(String(rawDays || 0));
    const raceDistance = normStr(answers?.raceDistance ?? answers?.race_distance ?? answers?.race_goal ?? "");
    const raceDate = normStr(answers?.raceDate ?? answers?.race_date ?? answers?.goal_race_date ?? "");
    const experienceLevel = normStr(answers?.experienceLevel ?? answers?.experience_level ?? "");
    const injuries = answers?.injuries ?? [];
    const injuryDetail = answers?.injuryDetail ?? answers?.detailed_injuries ?? "";
    const goal = answers?.goal ?? answers?.mainGoal ?? "";
    const rawHasData = (answers?.hasIntervalsData ?? answers?.has_intervals_data ?? answers?.hasData ?? null) as unknown;
    const hasIntervalsData =
      typeof rawHasData === "boolean" ? rawHasData : (String(rawHasData || "").toLowerCase() === "true");

    // Try AI first (Groq → Gemini), fall back to rule engine
    const aiRec = (await callGroqPhilosophy(answers)) ?? (await callGeminiPhilosophy(answers));
    if (aiRec) {
      return new Response(JSON.stringify(aiRec), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("paceiq-philosophy: AI unavailable, using rule engine");
    const rec = recommend({
      weeklyKm: Number.isFinite(weeklyKm) ? weeklyKm : 0,
      daysPerWeek: Number.isFinite(daysPerWeek) ? daysPerWeek : 0,
      raceDistance,
      raceDate,
      hasIntervalsData,
      injuries,
      injuryDetail,
      experienceLevel,
      goal,
    });
    return new Response(JSON.stringify(rec), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("paceiq-philosophy error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

