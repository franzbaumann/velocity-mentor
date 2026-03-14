import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type CNSStatus = "fresh" | "normal" | "loaded" | "overloaded" | "critical";

interface OtherTraining {
  type: string;
  duration_min: number;
  intensity: "easy" | "moderate" | "hard";
  label?: string;
}

const WEIGHTS = { running: 0.35, otherTraining: 0.2, sleep: 0.2, lifeStress: 0.15, subjective: 0.1 };

function otherTrainingLoad(sessions: OtherTraining[]): number {
  const multiplier: Record<string, number> = { easy: 0.4, moderate: 0.7, hard: 1.0 };
  return sessions.reduce((sum, s) => {
    const hours = s.duration_min / 60;
    return sum + hours * (multiplier[s.intensity] ?? 0.7) * 20;
  }, 0);
}

function sleepLoad(hours: number, score: number): number {
  const deficit = Math.max(0, 8 - hours);
  const qualityPenalty = ((100 - score) / 100) * 20;
  return deficit * 15 + qualityPenalty;
}

function lifeStressLoad(work: number, life: number, travel: boolean): number {
  const base = ((work - 1) + (life - 1)) / 8 * 40;
  return base + (travel ? 10 : 0);
}

function subjectiveLoad(mood: number, energy: number, legs: number): number {
  const avg = (6 - mood + (6 - energy) + (6 - legs)) / 3;
  return (avg / 4) * 30;
}

function calculateTLS(input: {
  runningATL: number;
  hrvScore: number;
  sleepHours: number;
  sleepScore: number;
  otherTraining: OtherTraining[];
  workStress: number;
  lifeStress: number;
  travel: boolean;
  mood: number;
  energy: number;
  legs: number;
}): { totalScore: number; cnsStatus: CNSStatus; recoveryScore: number; breakdown: Record<string, number> } {
  const runningComponent = (input.runningATL / 100) * 100 * WEIGHTS.running;
  const trainingComponent = Math.min(otherTrainingLoad(input.otherTraining), 40) * WEIGHTS.otherTraining;
  const sleepComponent = Math.min(sleepLoad(input.sleepHours, input.sleepScore), 50) * WEIGHTS.sleep;
  const lifeComponent = lifeStressLoad(input.workStress, input.lifeStress, input.travel) * WEIGHTS.lifeStress;
  const subjectiveComponent = subjectiveLoad(input.mood, input.energy, input.legs) * WEIGHTS.subjective;

  const totalScore = Math.min(
    100,
    Math.round(runningComponent + trainingComponent + sleepComponent + lifeComponent + subjectiveComponent)
  );
  const recoveryScore = Math.round(100 - totalScore);
  const cnsStatus: CNSStatus =
    totalScore < 30 ? "fresh"
    : totalScore < 50 ? "normal"
    : totalScore < 65 ? "loaded"
    : totalScore < 80 ? "overloaded"
    : "critical";

  return {
    totalScore,
    cnsStatus,
    recoveryScore,
    breakdown: {
      running: Math.round(runningComponent),
      otherTraining: Math.round(trainingComponent),
      sleep: Math.round(sleepComponent),
      lifeStress: Math.round(lifeComponent),
      subjective: Math.round(subjectiveComponent),
    },
  };
}

/** Normalize HRV ms to 0-100. Typical range 20-100ms. */
function hrvToScore(hrv: number | null): number {
  if (hrv == null) return 50;
  return Math.min(100, Math.max(0, ((hrv - 20) / 80) * 100));
}

/** Normalize ATL to 0-100 for TLS input. */
function atlToScore(atl: number | null): number {
  if (atl == null) return 0;
  return Math.min(100, Math.max(0, atl));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let dateStr = new Date().toISOString().slice(0, 10);
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.date && typeof body.date === "string") {
        const candidate = body.date.slice(0, 10);
        // Validate YYYY-MM-DD format and valid date
        if (/^\d{4}-\d{2}-\d{2}$/.test(candidate) && !isNaN(new Date(candidate).getTime())) {
          dateStr = candidate;
        }
      }
    } catch {
      // use today
    }

    // 1. Fetch daily_readiness for date
    const { data: readinessRow } = await supabaseAdmin
      .from("daily_readiness")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", dateStr)
      .maybeSingle();

    const r = (readinessRow ?? {}) as Record<string, unknown>;
    const atl = (r.atl ?? r.icu_atl ?? null) as number | null;
    const hrv = (r.hrv ?? r.hrv_rmssd ?? null) as number | null;
    const sleepHours = (r.sleep_hours ?? (typeof r.sleep_secs === "number" ? (r.sleep_secs as number) / 3600 : null)) as number | null;
    const sleepScore = (r.sleep_score ?? r.readiness ?? r.score ?? null) as number | null;
    const restingHr = (r.resting_hr ?? null) as number | null;

    // 2. Fetch or create daily_load for date
    const { data: loadRow } = await supabaseAdmin
      .from("daily_load")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", dateStr)
      .maybeSingle();

    const load = (loadRow ?? {}) as Record<string, unknown>;
    const otherTraining = (load.other_training ?? []) as OtherTraining[];
    const workStress = (load.work_stress ?? 1) as number;
    const lifeStress = (load.life_stress ?? 1) as number;
    const travel = (load.travel ?? false) as boolean;
    const mood = (load.mood ?? 3) as number;
    const energy = (load.energy ?? 3) as number;
    const legs = (load.legs ?? 3) as number;

    const runningATL = atlToScore(atl);
    const hrvScore = load.hrv_score != null ? Number(load.hrv_score) : hrvToScore(hrv);
    const sleepHoursVal = load.sleep_hours != null ? Number(load.sleep_hours) : (sleepHours ?? 7);
    const sleepScoreVal = load.sleep_score != null ? Number(load.sleep_score) : (sleepScore ?? 70);

    const { totalScore, cnsStatus, recoveryScore, breakdown } = calculateTLS({
      runningATL,
      hrvScore,
      sleepHours: sleepHoursVal,
      sleepScore: sleepScoreVal,
      otherTraining,
      workStress,
      lifeStress,
      travel,
      mood,
      energy,
      legs,
    });

    const upsertPayload: Record<string, unknown> = {
      user_id: user.id,
      date: dateStr,
      running_atl: atl,
      hrv_score: load.hrv_score ?? hrvToScore(hrv),
      sleep_hours: load.sleep_hours ?? sleepHours,
      sleep_score: load.sleep_score ?? sleepScore,
      resting_hr: load.resting_hr ?? restingHr,
      other_training: otherTraining,
      work_stress: workStress,
      life_stress: lifeStress,
      travel,
      mood,
      energy,
      legs,
      total_load_score: totalScore,
      recovery_score: recoveryScore,
      cns_status: cnsStatus,
      breakdown,
    };

    if (load.life_note != null) upsertPayload.life_note = load.life_note;
    if (load.travel_note != null) upsertPayload.travel_note = load.travel_note;

    const { error } = await supabaseAdmin
      .from("daily_load")
      .upsert(upsertPayload, { onConflict: "user_id,date" });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ total_load_score: totalScore, cns_status: cnsStatus, recovery_score: recoveryScore }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("calculate-daily-load error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
