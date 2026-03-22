import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  atlToScore,
  calculateTLS,
  hrvToScore,
  type OtherTraining,
} from "../_shared/calculate-tls.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
        if (/^\d{4}-\d{2}-\d{2}$/.test(candidate) && !isNaN(new Date(candidate).getTime())) {
          dateStr = candidate;
        }
      }
    } catch {
      // use today
    }

    const { data: readinessRow } = await supabaseAdmin
      .from("daily_readiness")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", dateStr)
      .maybeSingle();

    const r = (readinessRow ?? {}) as Record<string, unknown>;
    const atl = (r.atl ?? r.icu_atl ?? null) as number | null;
    const hrv = (r.hrv ?? r.hrv_rmssd ?? null) as number | null;
    const sleepHours = (r.sleep_hours ?? (typeof r.sleep_secs === "number" ? (r.sleep_secs as number) / 3600 : null)) as
      | number
      | null;
    const sleepScore = (r.sleep_score ?? r.readiness ?? r.score ?? null) as number | null;
    const restingHr = (r.resting_hr ?? null) as number | null;

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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("calculate-daily-load error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
