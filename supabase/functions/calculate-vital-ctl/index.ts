import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Exponential decay constants
const K_CTL = Math.exp(-1 / 42);
const K_ATL = Math.exp(-1 / 7);
const W_CTL = 1 - K_CTL;
const W_ATL = 1 - K_ATL;

// Parse "MM:SS" or "H:MM:SS" pace string to seconds per km
function parsePaceToSecPerKm(pace: string | null | undefined): number | null {
  if (!pace) return null;
  const parts = pace.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function estimateRTSS(params: {
  duration_seconds: number | null;
  avg_pace_min_per_km: string | null;
  avg_hr: number | null;
  threshold_pace_sec_per_km: number | null;
  max_hr: number;
  rest_hr: number;
}): number {
  const { duration_seconds, avg_pace_min_per_km, avg_hr, threshold_pace_sec_per_km, max_hr, rest_hr } = params;

  if (!duration_seconds || duration_seconds <= 0) return 0;

  // --- Method 1: pace-based rTSS ---
  const avgPaceSec = parsePaceToSecPerKm(avg_pace_min_per_km);
  if (avgPaceSec != null && avgPaceSec > 0 && threshold_pace_sec_per_km != null && threshold_pace_sec_per_km > 0) {
    // rTSS = (duration_hr) × (threshold_pace / avg_pace)² × 100
    // Slower pace → higher sec/km → ratio < 1, meaning easier run → lower TSS. Correct.
    const durationHr = duration_seconds / 3600;
    const intensityRatio = threshold_pace_sec_per_km / avgPaceSec; // >1 when faster than threshold
    const tss = durationHr * intensityRatio * intensityRatio * 100;
    return Math.min(150, Math.max(0, tss));
  }

  // --- Method 2: TRIMP from heart rate (Banister) ---
  if (avg_hr != null && avg_hr > 0 && max_hr > rest_hr) {
    const hrReserve = Math.max(0, Math.min(1, (avg_hr - rest_hr) / (max_hr - rest_hr)));
    const durationMin = duration_seconds / 60;
    const trimp = durationMin * hrReserve * 0.64 * Math.exp(1.92 * hrReserve);
    return Math.min(150, Math.max(0, trimp));
  }

  // --- Method 3: duration-only fallback (60 min easy ≈ 50 TSS) ---
  const durationMin = duration_seconds / 60;
  return Math.min(150, (durationMin / 60) * 50);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Accept user_id from body or query param
    let userId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        userId = body?.user_id ?? null;
      } catch {
        // ignore parse errors
      }
    }
    if (!userId) {
      const url = new URL(req.url);
      userId = url.searchParams.get("user_id");
    }
    if (!userId) {
      return json({ error: "user_id is required" }, 400);
    }

    console.log(`[calculate-vital-ctl] Starting for user ${userId}`);

    // --- Fetch athlete profile ---
    const { data: profile } = await supabase
      .from("athlete_profile")
      .select("max_hr, resting_hr, threshold_pace, lactate_threshold_pace, vdot")
      .eq("user_id", userId)
      .maybeSingle();

    const maxHr = profile?.max_hr ?? 180;
    const restHr = profile?.resting_hr ?? 45;

    // threshold_pace is stored as "MM:SS" per km
    const thresholdPaceStr = profile?.lactate_threshold_pace ?? profile?.threshold_pace ?? null;
    const thresholdPaceSecPerKm = parsePaceToSecPerKm(thresholdPaceStr);

    // --- Fetch last 90 days of activities ---
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const startDate = ninetyDaysAgo.toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    const { data: activities, error: activitiesError } = await supabase
      .from("activity")
      .select("id, date, duration_seconds, avg_hr, avg_pace, type")
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", today)
      .order("date", { ascending: true });

    if (activitiesError) {
      console.error("[calculate-vital-ctl] Error fetching activities:", activitiesError);
      return json({ error: activitiesError.message }, 500);
    }

    console.log(`[calculate-vital-ctl] Found ${activities?.length ?? 0} activities in last 90 days`);

    // --- Compute TSS per activity and aggregate to daily ---
    const dailyTss: Record<string, number> = {};
    let workoutsProcessed = 0;
    let workoutsSkipped = 0;

    for (const act of activities ?? []) {
      try {
        const dateKey = String(act.date ?? "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
          workoutsSkipped++;
          continue;
        }

        // Only count running activities for rTSS; other types use TRIMP
        const isRun = /^(run|running|trail_run|treadmill)$/i.test(act.type ?? "");

        const tss = estimateRTSS({
          duration_seconds: act.duration_seconds,
          avg_pace_min_per_km: isRun ? (act.avg_pace ?? null) : null,
          avg_hr: act.avg_hr ?? null,
          threshold_pace_sec_per_km: isRun ? thresholdPaceSecPerKm : null,
          max_hr: maxHr,
          rest_hr: restHr,
        });

        dailyTss[dateKey] = (dailyTss[dateKey] ?? 0) + tss;
        workoutsProcessed++;
      } catch (err) {
        console.warn(`[calculate-vital-ctl] Skipping activity ${act.id}:`, err);
        workoutsSkipped++;
      }
    }

    // --- Iterate day-by-day over 90-day window, computing CTL/ATL/TSB ---
    let ctl = 0;
    let atl = 0;

    const rows: Array<{ user_id: string; date: string; ctl: number; atl: number; tsb: number }> = [];

    const cursor = new Date(ninetyDaysAgo);
    cursor.setDate(cursor.getDate()); // inclusive start
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    while (cursor <= todayDate) {
      const dateStr = cursor.toISOString().split("T")[0];
      const tssTodayRaw = dailyTss[dateStr] ?? 0;

      ctl = ctl * K_CTL + tssTodayRaw * W_CTL;
      atl = atl * K_ATL + tssTodayRaw * W_ATL;
      const tsb = ctl - atl;

      rows.push({
        user_id: userId,
        date: dateStr,
        ctl: Math.round(ctl * 10) / 10,
        atl: Math.round(atl * 10) / 10,
        tsb: Math.round(tsb * 10) / 10,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    // --- Upsert into daily_readiness ---
    // Batch in chunks of 50 to avoid payload limits
    const CHUNK = 50;
    let upsertedCount = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error: upsertError } = await supabase
        .from("daily_readiness")
        .upsert(chunk, { onConflict: "user_id,date" });
      if (upsertError) {
        console.error(`[calculate-vital-ctl] Upsert error at chunk ${i}:`, upsertError);
      } else {
        upsertedCount += chunk.length;
      }
    }

    const finalRow = rows[rows.length - 1];
    console.log(
      `[calculate-vital-ctl] Done. workouts_processed=${workoutsProcessed} workouts_skipped=${workoutsSkipped}` +
      ` rows_upserted=${upsertedCount} ctl=${finalRow?.ctl} atl=${finalRow?.atl} tsb=${finalRow?.tsb}`,
    );

    return json({
      ok: true,
      workouts_processed: workoutsProcessed,
      workouts_skipped: workoutsSkipped,
      rows_upserted: upsertedCount,
      ctl: finalRow?.ctl,
      atl: finalRow?.atl,
      tsb: finalRow?.tsb,
    });
  } catch (e) {
    console.error("[calculate-vital-ctl] Fatal error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
