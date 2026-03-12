import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const ACTIVITIES_FIELDS =
  "id,start_date_local,type,name,distance,moving_time,elapsed_time," +
  "average_speed,max_speed,average_heartrate,max_heartrate,average_cadence," +
  "total_elevation_gain,calories," +
  "icu_training_load,icu_atl,icu_ctl,icu_hrss,icu_trimp," +
  "icu_hr_zone_times,icu_pace_zone_times," +
  "icu_weighted_avg_watts,icu_ftp,icu_efficiency_factor,icu_power_hr," +
  "icu_decoupling,icu_aerobic_decoupling,icu_avg_hr_reserve," +
  "perceived_exertion,athlete_max_hr,workout_type,description," +
  "gap,gap_model,use_gap,icu_zone_times";

const STREAM_TYPES =
  "heartrate,fixed_heartrate,cadence,altitude,distance,pace,latlng,time," +
  "velocity_smooth,temperature,respiration_rate,smo2,thb";

const START_YEAR = 2020;
const STREAM_BATCH_SIZE = 5;

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function buildAuth(apiKey: string): string {
  return `Basic ${btoa(`API_KEY:${apiKey}`)}`;
}

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonErr(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toArray(stream: unknown): number[] {
  if (!stream || typeof stream !== "object") return [];
  const s = stream as Record<string, unknown>;
  if (Array.isArray(s.data)) return s.data.map(Number).filter((n: number) => !isNaN(n));
  if (Array.isArray(stream)) return (stream as unknown[]).map(Number).filter((n: number) => !isNaN(n));
  return [];
}

function toLatlng(stream: unknown): number[][] {
  if (!stream || typeof stream !== "object") return [];
  const s = stream as Record<string, unknown>;
  const arr = Array.isArray(s.data) ? s.data : Array.isArray(stream) ? (stream as unknown[]) : [];
  return arr
    .filter((p): p is number[] => Array.isArray(p) && p.length >= 2)
    .map((p: number[]) => [Number(p[0]), Number(p[1])]);
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  const sq = arr.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(sq / (arr.length - 1));
}

function getHRZone(hr: number, lthr: number | null, maxHr: number | null): number {
  if (!lthr || lthr <= 0) return 0;
  const zones = [0.6, 0.7, 0.8, 0.9, 1.0].map((pct) => lthr * pct);
  for (let z = 0; z < zones.length; z++) {
    if (hr <= zones[z]) return z + 1;
  }
  return 5;
}

function computeCardiacDrift(heartrate: number[]): number | null {
  if (heartrate.length < 60) return null;
  const q = Math.floor(heartrate.length * 0.25);
  const firstQ = heartrate.slice(0, q).filter((h) => h > 0);
  const lastQ = heartrate.slice(heartrate.length - q).filter((h) => h > 0);
  if (firstQ.length < 10 || lastQ.length < 10) return null;
  const firstAvg = avg(firstQ);
  const lastAvg = avg(lastQ);
  if (firstAvg <= 0) return null;
  return ((lastAvg - firstAvg) / firstAvg) * 100;
}

function computePaceEfficiency(avgPaceMinPerKm: number, avgHr: number): number | null {
  if (avgPaceMinPerKm <= 0 || avgHr <= 0) return null;
  return avgPaceMinPerKm / avgHr;
}

function computeCadenceConsistency(cadence: number[]): number | null {
  const valid = cadence.filter((c) => c > 0);
  if (valid.length < 30) return null;
  return Math.round(stdDev(valid) * 100) / 100;
}

async function updateSyncProgress(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  updates: Record<string, unknown>
): Promise<void> {
  await supabase
    .from("sync_progress")
    .upsert(
      { user_id: userId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || token.length < 50) {
      return jsonErr("No valid session — sign in to PaceIQ", 401);
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser(token);
    if (userErr || !user) {
      console.error("intervals-proxy auth error:", userErr?.message);
      return jsonErr(userErr?.message ?? "Auth failed", 401);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let body: Record<string, unknown> = {};
    try {
      const raw = await req.json();
      body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    } catch {
      return jsonErr("Invalid request body — send JSON with action field", 400);
    }

    const action = String(body.action ?? "").trim();

    // Actions that don't require Intervals.icu (use Supabase only)
    const noIntervalsActions = ["workout_coach_note", "activity_coach_note"];
    let athleteId = "0";
    let headers: Record<string, string> = {};
    if (!noIntervalsActions.includes(action)) {
      const { data: integration } = await supabaseAdmin
        .from("integrations")
        .select("athlete_id, api_key")
        .eq("user_id", user.id)
        .eq("provider", "intervals_icu")
        .maybeSingle();

      if (!integration?.api_key) {
        return jsonErr("intervals.icu not connected", 404);
      }
      athleteId = String(integration.athlete_id ?? "0").trim() || "0";
      headers = { Authorization: buildAuth(integration.api_key) };
    }

    // ─── ACTION: single activity detail ───
    if (action === "activity" && body.activityId) {
      const url = `https://intervals.icu/api/v1/activity/${encodeURIComponent(String(body.activityId))}?intervals=true`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const t = await res.text();
        console.error("activity detail error:", res.status, t);
        return jsonErr(`intervals.icu ${res.status}`, res.status);
      }
      return jsonOk(await res.json());
    }

    // ─── ACTION: GPX export (build from streams latlng) ───
    if (action === "gpx" && body.activityId) {
      const actId = String(body.activityId);
      const streamsUrl = `https://intervals.icu/api/v1/activity/${encodeURIComponent(actId)}/streams.json?types=latlng,time,altitude`;
      const res = await fetch(streamsUrl, { headers });
      if (!res.ok) {
        const t = await res.text();
        console.error("gpx streams error:", res.status, t);
        return jsonErr(`Could not fetch streams for GPX: ${res.status}`, res.status);
      }
      const raw = await res.json();
      let latlng: number[][] = [];
      let timeArr: number[] = [];
      let altArr: number[] = [];
      if (Array.isArray(raw)) {
        for (const s of raw) {
          if (s?.type === "latlng" && Array.isArray(s.data)) latlng = s.data.filter((p: unknown) => Array.isArray(p) && p.length >= 2).map((p: number[]) => [Number(p[0]), Number(p[1])]);
          if (s?.type === "time" && Array.isArray(s.data)) timeArr = s.data.map(Number).filter((n) => !isNaN(n));
          if (s?.type === "altitude" && Array.isArray(s.data)) altArr = s.data.map(Number).filter((n) => !isNaN(n));
        }
      }
      if (latlng.length === 0) return jsonErr("No GPS track available for this activity", 404);
      const startEpoch = timeArr[0] ?? 0;
      const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const trkpts = latlng.map((ll, i) => {
        const t = timeArr[i] ?? startEpoch + i;
        const iso = new Date(t * 1000).toISOString();
        const ele = altArr[i] != null ? `\n    <ele>${Number(altArr[i]).toFixed(1)}</ele>` : "";
        return `  <trkpt lat="${ll[0]}" lon="${ll[1]}">${ele}\n    <time>${iso}</time>\n  </trkpt>`;
      }).join("\n");
      const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PaceIQ" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(String(body.activityId))}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
      return new Response(gpx, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/gpx+xml",
          "Content-Disposition": `attachment; filename="activity-${actId}.gpx"`,
        },
      });
    }

    // ─── ACTION: activity streams ───
    if (action === "streams" && body.activityId) {
      const url = `https://intervals.icu/api/v1/activity/${encodeURIComponent(String(body.activityId))}/streams.json?types=${STREAM_TYPES}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const t = await res.text();
        console.error("streams error:", res.status, t);
        return jsonErr(`streams ${res.status}`, res.status);
      }
      const raw = await res.json();
      // Convert Strava-compatible array format to object keyed by type
      let obj: Record<string, unknown>;
      if (Array.isArray(raw)) {
        obj = {};
        for (const s of raw) {
          if (s && typeof s === "object" && "type" in s) {
            obj[String(s.type)] = s;
          }
        }
      } else {
        obj = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
      }
      // Derive pace from velocity_smooth (m/s → min/km)
      if (obj.velocity_smooth && !obj.pace) {
        const vs = obj.velocity_smooth as Record<string, unknown>;
        const vData = Array.isArray(vs.data) ? vs.data : (Array.isArray(vs) ? vs as unknown[] : []);
        obj.pace = {
          type: "pace",
          data: vData.map((v: unknown) => {
            const n = Number(v);
            return n > 0.1 ? 1000 / n / 60 : 0;
          }),
        };
      }
      return jsonOk(obj);
    }

    // ─── ACTION: athlete profile ───
    if (action === "athlete") {
      const url = `https://intervals.icu/api/v1/athlete/${athleteId}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const t = await res.text();
        console.error("athlete error:", res.status, t);
        return jsonErr(`athlete ${res.status}`, res.status);
      }
      return jsonOk(await res.json());
    }

    // ─── ACTION: test_connection (always 200, so client can read error message) ───
    if (action === "test_connection") {
      const url = `https://intervals.icu/api/v1/athlete/${athleteId}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        let msg = `intervals.icu ${res.status}`;
        try {
          const t = await res.text();
          const parsed = t ? JSON.parse(t) : null;
          if (parsed && typeof parsed === "object" && "error" in parsed) {
            msg = String(parsed.error);
          } else if (t) {
            msg = t.slice(0, 120);
          }
        } catch {
          // use default msg
        }
        return jsonOk({ ok: false, error: msg });
      }
      return jsonOk({ ok: true });
    }

    // ─── ACTION: wellness ───
    if (action === "wellness") {
      const oldest = String(body.oldest ?? "2020-01-01");
      const newest = String(body.newest ?? todayStr());
      const url = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${oldest}&newest=${newest}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const t = await res.text();
        console.error("wellness error:", res.status, t);
        return jsonErr(`wellness ${res.status}`, res.status);
      }
      return jsonOk(await res.json());
    }

    // ─── ACTION: sync_activities only ───
    if (action === "sync_activities") {
      const currentYear = new Date().getFullYear();
      const allRuns: Record<string, unknown>[] = [];
      for (let year = START_YEAR; year <= currentYear; year++) {
        const oldest = `${year}-01-01`;
        const newest = year === currentYear ? todayStr() : `${year}-12-31`;
        const url = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${oldest}&newest=${newest}&fields=${ACTIVITIES_FIELDS}`;
        const res = await fetch(url, { headers });
        if (!res.ok) continue;
        const data = await res.json();
        allRuns.push(...(Array.isArray(data) ? data : []));
        if (year < currentYear) await new Promise((r) => setTimeout(r, 200));
      }
      let upserted = 0;
      for (const run of allRuns) {
        const externalId = String(run.id ?? "");
        if (!externalId) continue;
        const dateRaw = run.start_date_local ?? run.startDate ?? run.date;
        const d = new Date(String(dateRaw ?? ""));
        const date = isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
        if (!date) continue;
        const distM = Number(run.distance ?? 0);
        const distKm = distM > 100 ? distM / 1000 : distM;
        const movTime = Number(run.moving_time ?? run.elapsed_time ?? 0);
        const avgSpeed = Number(run.average_speed ?? 0);
        let avgPace: string | null = null;
        if (avgSpeed > 0) {
          const paceMin = 1000 / avgSpeed / 60;
          if (paceMin >= 2 && paceMin <= 25) {
            const m = Math.floor(paceMin);
            const s = Math.round((paceMin - m) * 60);
            avgPace = `${m}:${String(s).padStart(2, "0")}/km`;
          }
        }
        const rawType = String(run.type ?? "").trim();
        const KNOWN_TYPES = ["Run", "Ride", "Swim", "Walk", "Hike", "Yoga", "Strength", "VirtualRun", "TrailRun", "WeightTraining"];
        const activityType = KNOWN_TYPES.includes(rawType) ? rawType : rawType.toLowerCase().includes("run") ? "Run" : rawType.toLowerCase().includes("ride") || rawType.toLowerCase().includes("cycl") ? "Ride" : rawType.toLowerCase().includes("walk") ? "Walk" : rawType || "Run";
        const { error } = await supabaseAdmin.from("activity").upsert({
          user_id: user.id,
          date,
          type: activityType,
          name: String(run.name ?? "").trim() || null,
          distance_km: distKm > 0 ? Math.round(distKm * 100) / 100 : null,
          duration_seconds: movTime > 0 ? Math.round(movTime) : null,
          avg_pace: avgPace,
          avg_hr: run.average_heartrate != null ? Math.round(Number(run.average_heartrate)) : null,
          max_hr: run.max_heartrate != null ? Math.round(Number(run.max_heartrate)) : null,
          cadence: run.average_cadence != null ? Math.round(Number(run.average_cadence)) : null,
          elevation_gain: run.total_elevation_gain != null ? Number(run.total_elevation_gain) : null,
          source: "intervals_icu",
          external_id: externalId,
          description: run.description != null ? String(run.description).trim() || null : null,
          icu_training_load: run.icu_training_load != null ? Number(run.icu_training_load) : null,
          trimp: run.trimp != null ? Number(run.trimp) : null,
          icu_hrss: run.icu_hrss != null ? Number(run.icu_hrss) : null,
          icu_trimp: run.icu_trimp != null ? Number(run.icu_trimp) : null,
          icu_efficiency_factor: run.icu_efficiency_factor != null ? Number(run.icu_efficiency_factor) : null,
          icu_aerobic_decoupling: run.icu_aerobic_decoupling != null ? Number(run.icu_aerobic_decoupling) : run.icu_decoupling != null ? Number(run.icu_decoupling) : null,
          icu_power_hr: run.icu_power_hr != null ? Number(run.icu_power_hr) : null,
          icu_avg_hr_reserve: run.icu_avg_hr_reserve != null ? Number(run.icu_avg_hr_reserve) : null,
          gap: run.gap != null ? Number(run.gap) : null,
          workout_type: run.workout_type != null ? String(run.workout_type).trim() || null : null,
          hr_zone_times: run.icu_hr_zone_times ?? run.icu_zone_times ?? null,
          pace_zone_times: run.icu_pace_zone_times ?? null,
          perceived_exertion: run.perceived_exertion != null ? Number(run.perceived_exertion) : null,
          garmin_id: `icu_${externalId}`,
        }, { onConflict: "user_id,garmin_id" });
        if (!error) upserted++;
      }
      return jsonOk({ action: "sync_activities", done: true, activities: allRuns.length, upserted });
    }

    // ─── ACTION: sync_streams only ───
    if (action === "sync_streams") {
      const { data: activities } = await supabaseAdmin.from("activity").select("external_id, type").eq("user_id", user.id).not("external_id", "is", null);
      const { data: existingStreams } = await supabaseAdmin.from("activity_streams").select("activity_id").eq("user_id", user.id);
      const existingIds = new Set((existingStreams ?? []).map((r: { activity_id: string }) => r.activity_id));
      const hasGps = (t: string) => ["run", "ride", "walk", "hike"].some((x) => t.toLowerCase().includes(x));
      const toFetch = (activities ?? []).filter((a: { external_id: string; type: string }) => a.external_id && !existingIds.has(a.external_id) && hasGps(a.type ?? ""));
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < toFetch.length; i += STREAM_BATCH_SIZE) {
        const batch = toFetch.slice(i, i + STREAM_BATCH_SIZE);
        await Promise.all(batch.map(async (a: { external_id: string }) => {
          const actId = a.external_id;
          try {
            const res = await fetch(`https://intervals.icu/api/v1/activity/${encodeURIComponent(actId)}/streams.json?types=${STREAM_TYPES}`, { headers });
            if (!res.ok) { fail++; return; }
            const parsed = await res.json();
            let streams: Record<string, unknown> = {};
            if (Array.isArray(parsed)) {
              for (const s of parsed) {
                if (s && typeof s === "object" && "type" in (s as Record<string, unknown>)) streams[String((s as Record<string, unknown>).type)] = s;
              }
            } else if (parsed && typeof parsed === "object") streams = parsed as Record<string, unknown>;
            const hr = toArray(streams.heartrate);
            const fixedHr = toArray(streams.fixed_heartrate);
            const cad = toArray(streams.cadence);
            const alt = toArray(streams.altitude);
            const dist = toArray(streams.distance);
            let pace = toArray(streams.pace);
            const velocity = toArray(streams.velocity_smooth);
            if (pace.length === 0 && velocity.length > 0) pace = velocity.map((v: number) => v > 0.1 ? 1000 / v / 60 : 0);
            const time = toArray(streams.time);
            const ll = toLatlng(streams.latlng);
            const temp = toArray(streams.temperature);
            const respRate = toArray(streams.respiration_rate);
            const smo2Arr = toArray(streams.smo2);
            const thbArr = toArray(streams.thb);
            if (time.length === 0 && hr.length === 0) { fail++; return; }
            const { data: ap } = await supabaseAdmin.from("athlete_profile").select("lactate_threshold_hr, max_hr").eq("user_id", user.id).maybeSingle();
            const lthr = (ap as { lactate_threshold_hr?: number } | null)?.lactate_threshold_hr ?? null;
            const maxHr = (ap as { max_hr?: number } | null)?.max_hr ?? null;
            const hrZones = hr.length && (lthr || maxHr) ? hr.map((h) => getHRZone(h, lthr, maxHr)) : [];
            const { error: se } = await supabaseAdmin.from("activity_streams").upsert({
              user_id: user.id,
              activity_id: actId,
              heartrate: hr.length ? hr : null,
              fixed_heartrate: fixedHr.length ? fixedHr : null,
              cadence: cad.length ? cad : null,
              altitude: alt.length ? alt : null,
              distance: dist.length ? dist : null,
              pace: pace.length ? pace : null,
              time: time.length ? time.map(Math.round) : null,
              latlng: ll.length ? ll : null,
              temperature: temp.length ? temp : null,
              respiration_rate: respRate.length ? respRate : null,
              smo2: smo2Arr.length ? smo2Arr : null,
              thb: thbArr.length ? thbArr : null,
              hr_zones: hrZones.length ? hrZones : null,
            }, { onConflict: "user_id,activity_id" });
            if (se) { fail++; return; }
            ok++;
            const cardiacDrift = computeCardiacDrift(hr);
            const avgPaceVal = pace.length ? avg(pace.filter((p) => p > 0)) : 0;
            const avgHrVal = hr.length ? avg(hr.filter((h) => h > 0)) : 0;
            const paceEff = computePaceEfficiency(avgPaceVal, avgHrVal);
            const cadenceCons = computeCadenceConsistency(cad);
            const updates: Record<string, unknown> = {};
            if (cardiacDrift != null) updates.cardiac_drift = cardiacDrift;
            if (paceEff != null) updates.pace_efficiency = paceEff;
            if (cadenceCons != null) updates.cadence_consistency = cadenceCons;
            if (Object.keys(updates).length > 0) await supabaseAdmin.from("activity").update(updates).eq("user_id", user.id).eq("external_id", actId);
          } catch {
            fail++;
          }
        }));
        if (i + STREAM_BATCH_SIZE < toFetch.length) await new Promise((r) => setTimeout(r, 500));
      }
      return jsonOk({ action: "sync_streams", done: true, ok, failed: fail, total: toFetch.length });
    }

    // ─── ACTION: sync_intervals only ───
    if (action === "sync_intervals") {
      const { data: activities } = await supabaseAdmin.from("activity").select("external_id").eq("user_id", user.id).not("external_id", "is", null);
      let count = 0;
      for (const a of activities ?? []) {
        const actId = a.external_id;
        if (!actId) continue;
        try {
          const res = await fetch(`https://intervals.icu/api/v1/activity/${encodeURIComponent(actId)}/intervals`, { headers });
          if (!res.ok) continue;
          const intData = await res.json();
          const intArr = Array.isArray(intData) ? intData : (intData?.intervals ? (intData.intervals as unknown[]) : []);
          await supabaseAdmin.from("activity_intervals").delete().eq("user_id", user.id).eq("activity_id", actId);
          for (let idx = 0; idx < intArr.length; idx++) {
            const inv = intArr[idx] as Record<string, unknown>;
            const avgSpeed = Number(inv.avg_speed ?? inv.average_speed ?? 0);
            const avgPaceMinKm = avgSpeed > 0.1 ? 1000 / avgSpeed / 60 : null;
            await supabaseAdmin.from("activity_intervals").insert({
              user_id: user.id,
              activity_id: actId,
              interval_number: idx + 1,
              start_index: inv.start_index ?? inv.start ?? null,
              end_index: inv.end_index ?? inv.end ?? null,
              start_time_offset: inv.start_time_offset ?? inv.startTime ?? null,
              elapsed_time: inv.elapsed_time ?? inv.duration ?? null,
              distance_km: inv.distance_km ?? (inv.distance ? Number(inv.distance) / 1000 : null) ?? null,
              avg_pace: avgPaceMinKm,
              avg_hr: inv.avg_hr ?? inv.average_heartrate != null ? Math.round(Number(inv.average_heartrate)) : null,
              max_hr: inv.max_hr ?? inv.max_heartrate != null ? Math.round(Number(inv.max_heartrate)) : null,
              avg_cadence: inv.avg_cadence ?? inv.average_cadence != null ? Math.round(Number(inv.average_cadence)) : null,
              tss: inv.tss ?? inv.TSS != null ? Number(inv.TSS) : null,
              intensity_factor: inv.intensity_factor ?? inv.IF ?? inv.if != null ? Number(inv.intensity_factor ?? inv.IF ?? inv.if) : null,
              avg_power: inv.avg_power ?? inv.average_watts != null ? Number(inv.average_watts) : null,
              type: inv.type != null ? String(inv.type) : null,
              label: inv.label != null ? String(inv.label) : null,
            });
            count++;
          }
        } catch {
          // skip
        }
      }
      return jsonOk({ action: "sync_intervals", done: true, intervals: count });
    }

    // ─── ACTION: sync_wellness only ───
    if (action === "sync_wellness") {
      const wUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=2020-01-01&newest=${todayStr()}`;
      const wRes = await fetch(wUrl, { headers });
      if (!wRes.ok) return jsonErr(`wellness ${wRes.status}`, wRes.status);
      const wData = await wRes.json();
      const wArr = Array.isArray(wData) ? wData : [];
      let days = 0;
      for (let i = 0; i < wArr.length; i += 100) {
        const batch = wArr.slice(i, i + 100).map((w: Record<string, unknown>) => {
          const dateStr = String(w.id ?? w.date ?? w.calendarDate ?? "").slice(0, 10);
          const ctlVal = w.ctl ?? w.ctLoad ?? null;
          const atlVal = w.atl ?? w.atlLoad ?? null;
          const tsbRaw = w.tsb ?? w.form ?? null;
          const tsb = tsbRaw != null ? Number(tsbRaw) : (ctlVal != null && atlVal != null ? Number(ctlVal) - Number(atlVal) : null);
          return {
            user_id: user.id,
            date: dateStr,
            ctl: ctlVal != null ? Number(ctlVal) : null,
            atl: atlVal != null ? Number(atlVal) : null,
            tsb,
            icu_ctl: ctlVal != null ? Number(ctlVal) : null,
            icu_atl: atlVal != null ? Number(atlVal) : null,
            icu_tsb: tsb,
            icu_ramp_rate: w.rampRate ?? w.ramp_rate != null ? Number(w.rampRate ?? w.ramp_rate) : null,
            icu_long_term_power: w.longTermPower ?? w.long_term_power != null ? Number(w.longTermPower ?? w.long_term_power) : null,
            hrv: w.hrv ?? w.hrvSDNN ?? null,
            hrv_rmssd: w.hrvRMSSD ?? w.hrv_rmssd != null ? Number(w.hrvRMSSD ?? w.hrv_rmssd) : null,
            hrv_sdnn: w.hrvSDNN ?? w.hrv_sdnn != null ? Number(w.hrvSDNN ?? w.hrv_sdnn) : null,
            resting_hr: w.restingHR ?? w.resting_hr ?? null,
            sleep_hours: w.sleepSecs ? Number(w.sleepSecs) / 3600 : (w.sleepHours ?? null),
            sleep_secs: w.sleepSecs ?? w.sleep_secs != null ? Number(w.sleepSecs ?? w.sleep_secs) : null,
            sleep_score: w.sleepScore ?? w.sleep_score != null ? Number(w.sleepScore ?? w.sleep_score) : null,
            weight: w.weight != null ? Number(w.weight) : null,
            kcal: w.kcal ?? w.calories != null ? Math.round(Number(w.kcal ?? w.calories)) : null,
            steps: w.steps != null ? Math.round(Number(w.steps)) : null,
            stress_hrv: w.stressHrv ?? w.stress_hrv != null ? Number(w.stressHrv ?? w.stress_hrv) : null,
            readiness: w.readiness != null ? Number(w.readiness) : null,
            spo2: w.spo2 ?? w.spO2 != null ? Number(w.spo2 ?? w.spO2) : null,
            respiration_rate: w.respirationRate ?? w.respiration_rate != null ? Number(w.respirationRate ?? w.respiration_rate) : null,
          };
        }).filter((r: Record<string, unknown>) => r.date && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)));
        if (batch.length > 0) {
          await supabaseAdmin.from("daily_readiness").upsert(batch, { onConflict: "user_id,date" });
          days += batch.length;
        }
      }
      return jsonOk({ action: "sync_wellness", done: true, days });
    }

    // ─── ACTION: sync_pbs only ───
    if (action === "sync_pbs") {
      const pbRes = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}/pbs`, { headers });
      if (!pbRes.ok) return jsonErr(`pbs ${pbRes.status}`, pbRes.status);
      const pbData = await pbRes.json();
      const pbArr = Array.isArray(pbData) ? pbData : (pbData?.pbs ? (pbData.pbs as unknown[]) : []);
      await supabaseAdmin.from("personal_records").delete().eq("user_id", user.id).eq("source", "intervals");
      let count = 0;
      for (const pb of pbArr) {
        const p = pb as Record<string, unknown>;
        const dist = p.distance ?? p.name ?? "";
        if (!dist) continue;
        const bestTime = p.best_time ?? p.time ?? p.seconds;
        const bestTimeSec = typeof bestTime === "number" ? bestTime : bestTime ? parseInt(String(bestTime), 10) : null;
        await supabaseAdmin.from("personal_records").insert({
          user_id: user.id,
          distance: String(dist),
          best_time_seconds: bestTimeSec,
          best_pace: p.best_pace ?? p.pace != null ? String(p.pace) : null,
          date_achieved: p.date ?? p.achieved != null ? String(p.date ?? p.achieved).slice(0, 10) : null,
          activity_id: p.activity_id ?? p.activityId != null ? String(p.activity_id ?? p.activityId) : null,
          source: "intervals",
        });
        count++;
      }
      return jsonOk({ action: "sync_pbs", done: true, pbs: count });
    }

    // ─── ACTION: get_sync_progress (for polling) ───
    if (action === "get_sync_progress") {
      const { data } = await supabaseAdmin
        .from("sync_progress")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return jsonOk(data ?? { stage: "idle", done: true });
    }

    // ─── ACTION: quick_sync (yesterday + today only — fast for app load when data already synced) ───
    if (action === "quick_sync") {
      const today = todayStr();
      const d = new Date(today);
      d.setDate(d.getDate() - 2);
      const oldest = d.toISOString().slice(0, 10);

      await updateSyncProgress(supabaseAdmin, user.id, {
        stage: "quick_sync",
        detail: "Syncing yesterday and today...",
        done: false,
        error: null,
      });

      let activitiesUpserted = 0;
      try {
        const url = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${oldest}&newest=${today}&fields=${ACTIVITIES_FIELDS}`;
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          const arr = Array.isArray(data) ? data : [];
          for (const run of arr) {
            const externalId = String(run.id ?? "");
            if (!externalId) continue;
            const dateRaw = run.start_date_local ?? run.startDate ?? run.date;
            const dRun = new Date(String(dateRaw ?? ""));
            const date = isNaN(dRun.getTime()) ? null : dRun.toISOString().slice(0, 10);
            if (!date) continue;
            const distM = Number(run.distance ?? 0);
            const distKm = distM > 100 ? distM / 1000 : distM;
            const movTime = Number(run.moving_time ?? run.elapsed_time ?? 0);
            const avgSpeed = Number(run.average_speed ?? 0);
            let avgPace: string | null = null;
            if (avgSpeed > 0) {
              const paceMin = 1000 / avgSpeed / 60;
              if (paceMin >= 2 && paceMin <= 25) {
                const m = Math.floor(paceMin);
                const s = Math.round((paceMin - m) * 60);
                avgPace = `${m}:${String(s).padStart(2, "0")}/km`;
              }
            }
            const rawType = String(run.type ?? "").trim();
            const KNOWN_TYPES = ["Run", "Ride", "Swim", "Walk", "Hike", "Yoga", "Strength", "VirtualRun", "TrailRun", "WeightTraining"];
            const activityType = KNOWN_TYPES.includes(rawType) ? rawType : rawType.toLowerCase().includes("run") ? "Run" : rawType.toLowerCase().includes("ride") || rawType.toLowerCase().includes("cycl") ? "Ride" : rawType.toLowerCase().includes("walk") ? "Walk" : rawType || "Run";
            const { error } = await supabaseAdmin.from("activity").upsert({
              user_id: user.id,
              date,
              type: activityType,
              name: String(run.name ?? "").trim() || null,
              distance_km: distKm > 0 ? Math.round(distKm * 100) / 100 : null,
              duration_seconds: movTime > 0 ? Math.round(movTime) : null,
              avg_pace: avgPace,
              avg_hr: run.average_heartrate != null ? Math.round(Number(run.average_heartrate)) : null,
              max_hr: run.max_heartrate != null ? Math.round(Number(run.max_heartrate)) : null,
              cadence: run.average_cadence != null ? Math.round(Number(run.average_cadence)) : null,
              elevation_gain: run.total_elevation_gain != null ? Number(run.total_elevation_gain) : null,
              source: "intervals_icu",
              external_id: externalId,
              description: run.description != null ? String(run.description).trim() || null : null,
              icu_training_load: run.icu_training_load != null ? Number(run.icu_training_load) : null,
              trimp: run.trimp != null ? Number(run.trimp) : null,
              icu_hrss: run.icu_hrss != null ? Number(run.icu_hrss) : null,
              icu_trimp: run.icu_trimp != null ? Number(run.icu_trimp) : null,
              icu_efficiency_factor: run.icu_efficiency_factor != null ? Number(run.icu_efficiency_factor) : null,
              icu_aerobic_decoupling: run.icu_aerobic_decoupling != null ? Number(run.icu_aerobic_decoupling) : run.icu_decoupling != null ? Number(run.icu_decoupling) : null,
              icu_power_hr: run.icu_power_hr != null ? Number(run.icu_power_hr) : null,
              icu_avg_hr_reserve: run.icu_avg_hr_reserve != null ? Number(run.icu_avg_hr_reserve) : null,
              gap: run.gap != null ? Number(run.gap) : null,
              workout_type: run.workout_type != null ? String(run.workout_type).trim() || null : null,
              hr_zone_times: run.icu_hr_zone_times ?? run.icu_zone_times ?? null,
              pace_zone_times: run.icu_pace_zone_times ?? null,
              perceived_exertion: run.perceived_exertion != null ? Number(run.perceived_exertion) : null,
              garmin_id: `icu_${externalId}`,
            }, { onConflict: "user_id,garmin_id" });
            if (!error) activitiesUpserted++;
          }
        }
      } catch (e) {
        console.error("quick_sync activities error:", e);
      }

      let wellnessDays = 0;
      try {
        const wUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${oldest}&newest=${today}`;
        const wRes = await fetch(wUrl, { headers });
        if (wRes.ok) {
          const wData = await wRes.json();
          const wArr = Array.isArray(wData) ? wData : [];
          const batch = wArr.map((w: Record<string, unknown>) => {
            const dateStr = String(w.id ?? w.date ?? w.calendarDate ?? "").slice(0, 10);
            const ctlVal = w.ctl ?? w.ctLoad ?? null;
            const atlVal = w.atl ?? w.atlLoad ?? null;
            const tsbRaw = w.tsb ?? w.form ?? null;
            const tsb = tsbRaw != null ? Number(tsbRaw) : (ctlVal != null && atlVal != null ? Number(ctlVal) - Number(atlVal) : null);
            return {
              user_id: user.id,
              date: dateStr,
              ctl: ctlVal != null ? Number(ctlVal) : null,
              atl: atlVal != null ? Number(atlVal) : null,
              tsb,
              icu_ctl: ctlVal != null ? Number(ctlVal) : null,
              icu_atl: atlVal != null ? Number(atlVal) : null,
              icu_tsb: tsb,
              icu_ramp_rate: w.rampRate ?? w.ramp_rate != null ? Number(w.rampRate ?? w.ramp_rate) : null,
              icu_long_term_power: w.longTermPower ?? w.long_term_power != null ? Number(w.longTermPower ?? w.long_term_power) : null,
              hrv: w.hrv ?? w.hrvSDNN ?? null,
              hrv_rmssd: w.hrvRMSSD ?? w.hrv_rmssd != null ? Number(w.hrvRMSSD ?? w.hrv_rmssd) : null,
              hrv_sdnn: w.hrvSDNN ?? w.hrv_sdnn != null ? Number(w.hrvSDNN ?? w.hrv_sdnn) : null,
              resting_hr: w.restingHR ?? w.resting_hr ?? null,
              sleep_hours: w.sleepSecs ? Number(w.sleepSecs) / 3600 : (w.sleepHours ?? null),
              sleep_secs: w.sleepSecs ?? w.sleep_secs != null ? Number(w.sleepSecs ?? w.sleep_secs) : null,
              sleep_score: w.sleepScore ?? w.sleep_score != null ? Number(w.sleepScore ?? w.sleep_score) : null,
              weight: w.weight != null ? Number(w.weight) : null,
              kcal: w.kcal ?? w.calories != null ? Math.round(Number(w.kcal ?? w.calories)) : null,
              steps: w.steps != null ? Math.round(Number(w.steps)) : null,
              stress_hrv: w.stressHrv ?? w.stress_hrv != null ? Number(w.stressHrv ?? w.stress_hrv) : null,
              readiness: w.readiness != null ? Number(w.readiness) : null,
              spo2: w.spo2 ?? w.spO2 != null ? Number(w.spo2 ?? w.spO2) : null,
              respiration_rate: w.respirationRate ?? w.respiration_rate != null ? Number(w.respirationRate ?? w.respiration_rate) : null,
            };
          }).filter((r: Record<string, unknown>) => r.date && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)));
          if (batch.length > 0) {
            await supabaseAdmin.from("daily_readiness").upsert(batch, { onConflict: "user_id,date" });
            wellnessDays = batch.length;
          }
        }
      } catch (e) {
        console.error("quick_sync wellness error:", e);
      }

      try {
        const aUrl = `https://intervals.icu/api/v1/athlete/${athleteId}`;
        const aRes = await fetch(aUrl, { headers });
        if (aRes.ok) {
          const ap = await aRes.json() as Record<string, unknown>;
          const updates: Record<string, unknown> = {};
          if (ap.resting_hr != null) updates.resting_hr = Number(ap.resting_hr);
          if (ap.max_hr != null) updates.max_hr = Number(ap.max_hr);
          if (ap.icu_lt_hr != null) updates.lactate_threshold_hr = Number(ap.icu_lt_hr);
          if (Object.keys(updates).length > 0) {
            await supabaseAdmin.from("athlete_profile").update(updates).eq("user_id", user.id);
          }
        }
      } catch {
        // best effort
      }

      const { data: latestReadiness } = await supabaseAdmin
        .from("daily_readiness")
        .select("ctl, atl, tsb")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      await updateSyncProgress(supabaseAdmin, user.id, {
        stage: "done",
        detail: `Quick sync — ${activitiesUpserted} activities, ${wellnessDays} wellness days`,
        done: true,
        error: null,
        activities_upserted: activitiesUpserted,
        wellness_days: wellnessDays,
        ctl: latestReadiness?.ctl ?? null,
        atl: latestReadiness?.atl ?? null,
        tsb: latestReadiness?.tsb ?? null,
      });

      return jsonOk({
        action: "quick_sync",
        done: true,
        activities: activitiesUpserted,
        wellness: wellnessDays,
        ctl: latestReadiness?.ctl ?? null,
        atl: latestReadiness?.atl ?? null,
        tsb: latestReadiness?.tsb ?? null,
      });
    }

    // ─── ACTION: start_sync (fire-and-forget full_sync, returns immediately) ───
    if (action === "start_sync") {
      try {
        await supabaseAdmin.from("sync_progress").upsert({
          user_id: user.id,
          stage: "starting",
          detail: "Starting full sync...",
          done: false,
          error: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      } catch (e) {
        console.error("sync_progress upsert failed (run migration 20260312000000_sync_progress.sql):", e);
        return jsonErr("sync_progress table missing — run Supabase migrations", 500);
      }

      const fnUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/intervals-proxy`;
      fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader || `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "full_sync", _background: true }),
      }).catch((e) => console.error("start_sync background fetch error:", e));

      return jsonOk({ started: true, message: "Sync started — poll get_sync_progress for status" });
    }

    // ─── ACTION: full sync (activities + streams + intervals + wellness + PBs + athlete) ───
    if (action === "full_sync") {
      try {
      const log: string[] = [];
      const currentYear = new Date().getFullYear();
      const allRuns: Record<string, unknown>[] = [];
      const yearsCompleted: Record<string, number> = {};

      await updateSyncProgress(supabaseAdmin, user.id, {
        stage: "activities",
        detail: "Fetching activities...",
        done: false,
        error: null,
      });

      // 1. Fetch activities year by year
      for (let year = START_YEAR; year <= currentYear; year++) {
        const oldest = `${year}-01-01`;
        const newest = year === currentYear ? todayStr() : `${year}-12-31`;
        const url = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${oldest}&newest=${newest}&fields=${ACTIVITIES_FIELDS}`;

        try {
          const res = await fetch(url, { headers });
          if (!res.ok) {
            const t = await res.text();
            console.error(`${year} activities error:`, res.status, t);
            log.push(`${year}: ERROR ${res.status}`);
            if (res.status === 401 || res.status === 403) {
              await updateSyncProgress(supabaseAdmin, user.id, {
                stage: "error",
                detail: `Auth failed for ${year}`,
                done: true,
                error: t,
              });
              return jsonOk({ error: `Auth failed for ${year}: ${t}`, log });
            }
            continue;
          }
          const data = await res.json();
          const arr = Array.isArray(data) ? data : [];

          // Log every type for debugging
          const typeCounts: Record<string, number> = {};
          for (const a of arr) {
            const t = String((a as Record<string, unknown>).type ?? "unknown");
            typeCounts[t] = (typeCounts[t] ?? 0) + 1;
          }
          console.log(`intervals-proxy ${year}: ${arr.length} activities — types:`, JSON.stringify(typeCounts));

          // Save ALL activity types (not just runs) so the user sees everything
          allRuns.push(...arr);
          const runCount = arr.filter((a: Record<string, unknown>) => {
            const t = String(a.type ?? "").toLowerCase();
            return t === "run" || t.includes("run");
          }).length;
          log.push(`${year}: ${arr.length} total (${runCount} runs) — types: ${Object.entries(typeCounts).map(([k, v]) => `${k}:${v}`).join(", ")}`);
          yearsCompleted[String(year)] = arr.length;
          if (arr.length > 0) {
            console.log(`  first activity:`, JSON.stringify(arr[0]).slice(0, 300));
          }
        } catch (e) {
          log.push(`${year}: FETCH ERROR ${(e as Error).message}`);
          console.error(`${year} fetch error:`, e);
        }

        await updateSyncProgress(supabaseAdmin, user.id, {
          stage: "activities",
          detail: `Fetching ${year} activities... ✓ ${yearsCompleted[String(year)] ?? 0} activities`,
          years_completed: yearsCompleted,
        });
        if (year < currentYear) await new Promise(r => setTimeout(r, 200));
      }

      log.push(`Total activities: ${allRuns.length}`);
      console.log(`intervals-proxy total activities: ${allRuns.length}`);

      // 2. Upsert activities to DB
      let upsertedCount = 0;
      for (const run of allRuns) {
        const externalId = String(run.id ?? "");
        if (!externalId) continue;
        const dateRaw = run.start_date_local ?? run.startDate ?? run.date;
        const d = new Date(String(dateRaw ?? ""));
        const date = isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
        if (!date) continue;

        const distM = Number(run.distance ?? 0);
        const distKm = distM > 100 ? distM / 1000 : distM;
        const movTime = Number(run.moving_time ?? run.elapsed_time ?? 0);
        const avgSpeed = Number(run.average_speed ?? 0);
        let avgPace: string | null = null;
        if (avgSpeed > 0) {
          const paceMin = 1000 / avgSpeed / 60;
          if (paceMin >= 2 && paceMin <= 25) {
            const m = Math.floor(paceMin);
            const s = Math.round((paceMin - m) * 60);
            avgPace = `${m}:${String(s).padStart(2, "0")}/km`;
          }
        }

        // intervals.icu `type` is "Run", "Ride", "Swim", etc.
        // Normalize to standard types; fallback to "Run" for running activities
        const rawType = String(run.type ?? "").trim();
        const KNOWN_TYPES = ["Run", "Ride", "Swim", "Walk", "Hike", "Yoga", "Strength", "VirtualRun", "TrailRun", "WeightTraining"];
        const activityType = KNOWN_TYPES.includes(rawType)
          ? rawType
          : rawType.toLowerCase().includes("run") ? "Run"
          : rawType.toLowerCase().includes("ride") || rawType.toLowerCase().includes("cycl") ? "Ride"
          : rawType.toLowerCase().includes("walk") ? "Walk"
          : rawType || "Run";
        const activityName = String(run.name ?? "").trim() || null;

        const { error } = await supabaseAdmin.from("activity").upsert({
          user_id: user.id,
          date,
          type: activityType,
          name: activityName,
          distance_km: distKm > 0 ? Math.round(distKm * 100) / 100 : null,
          duration_seconds: movTime > 0 ? Math.round(movTime) : null,
          avg_pace: avgPace,
          avg_hr: run.average_heartrate != null ? Math.round(Number(run.average_heartrate)) : null,
          max_hr: run.max_heartrate != null ? Math.round(Number(run.max_heartrate)) : null,
          cadence: run.average_cadence != null ? Math.round(Number(run.average_cadence)) : null,
          elevation_gain: run.total_elevation_gain != null ? Number(run.total_elevation_gain) : null,
          source: "intervals_icu",
          external_id: externalId,
          description: run.description != null ? String(run.description).trim() || null : null,
          icu_training_load: run.icu_training_load != null ? Number(run.icu_training_load) : null,
          trimp: run.trimp != null ? Number(run.trimp) : null,
          icu_hrss: run.icu_hrss != null ? Number(run.icu_hrss) : null,
          icu_trimp: run.icu_trimp != null ? Number(run.icu_trimp) : null,
          icu_efficiency_factor: run.icu_efficiency_factor != null ? Number(run.icu_efficiency_factor) : null,
          icu_aerobic_decoupling: run.icu_aerobic_decoupling != null ? Number(run.icu_aerobic_decoupling) : run.icu_decoupling != null ? Number(run.icu_decoupling) : null,
          icu_power_hr: run.icu_power_hr != null ? Number(run.icu_power_hr) : null,
          icu_avg_hr_reserve: run.icu_avg_hr_reserve != null ? Number(run.icu_avg_hr_reserve) : null,
          gap: run.gap != null ? Number(run.gap) : null,
          workout_type: run.workout_type != null ? String(run.workout_type).trim() || null : null,
          hr_zone_times: run.icu_hr_zone_times ?? run.icu_zone_times ?? null,
          pace_zone_times: run.icu_pace_zone_times ?? null,
          perceived_exertion: run.perceived_exertion != null ? Number(run.perceived_exertion) : null,
          garmin_id: `icu_${externalId}`,
        }, { onConflict: "user_id,garmin_id" });

        if (!error) upsertedCount++;
        else console.error("upsert error:", error.message, "for", externalId);
      }
      log.push(`Upserted: ${upsertedCount} activities`);

      // 3. Fetch streams for each run (batched)
      let streamsOk = 0;
      let streamsFail = 0;
      const { data: existingStreams } = await supabaseAdmin
        .from("activity_streams")
        .select("activity_id")
        .eq("user_id", user.id);
      const existingIds = new Set((existingStreams ?? []).map((r: { activity_id: string }) => r.activity_id));

      const hasGps = (a: Record<string, unknown>) => {
        const t = String(a.type ?? "").toLowerCase();
        return t === "run" || t.includes("run") || t === "ride" || t === "walk" || t === "hike";
      };
      const toFetch = allRuns.filter(r => {
        const id = String((r as Record<string, unknown>).id ?? "");
        return id && !existingIds.has(id) && hasGps(r as Record<string, unknown>);
      });

      log.push(`Streams to fetch: ${toFetch.length} (${existingIds.size} already exist)`);

      await updateSyncProgress(supabaseAdmin, user.id, {
        stage: "streams",
        detail: `Activities saved. Fetching streams 0/${toFetch.length}...`,
        activities_total: allRuns.length,
        activities_upserted: upsertedCount,
        streams_total: toFetch.length,
        streams_done: 0,
      });

      for (let i = 0; i < toFetch.length; i += STREAM_BATCH_SIZE) {
        const batch = toFetch.slice(i, i + STREAM_BATCH_SIZE);
        await Promise.all(batch.map(async (run) => {
          const actId = String(run.id);
          try {
            const url = `https://intervals.icu/api/v1/activity/${actId}/streams.json?types=${STREAM_TYPES}`;
            console.log(`Fetching stream: ${url}`);
            const res = await fetch(url, { headers });
            if (!res.ok) {
              const errBody = await res.text();
              console.error(`Stream ${actId}: HTTP ${res.status} — ${errBody}`);
              streamsFail++;
              return;
            }
            const rawText = await res.text();
            console.log(`Stream ${actId} raw response (first 500 chars):`, rawText.slice(0, 500));
            let parsed: unknown;
            try {
              parsed = JSON.parse(rawText);
            } catch {
              console.error(`Stream ${actId}: invalid JSON`);
              streamsFail++;
              return;
            }

            // intervals.icu returns Strava-compatible format: array of {type, data, ...}
            // Convert to object keyed by type name for easy access
            let streams: Record<string, unknown>;
            if (Array.isArray(parsed)) {
              streams = {};
              for (const s of parsed) {
                if (s && typeof s === "object" && "type" in (s as Record<string, unknown>)) {
                  const streamObj = s as Record<string, unknown>;
                  streams[String(streamObj.type)] = streamObj;
                }
              }
              console.log(`Stream ${actId}: converted array (${parsed.length} items) to keys: ${Object.keys(streams).join(",")}`);
            } else if (parsed && typeof parsed === "object") {
              streams = parsed as Record<string, unknown>;
              console.log(`Stream ${actId} keys:`, Object.keys(streams));
            } else {
              console.error(`Stream ${actId}: unexpected response type: ${typeof parsed}`);
              streamsFail++;
              return;
            }

            const hr = toArray(streams.heartrate);
            const fixedHr = toArray(streams.fixed_heartrate);
            const cad = toArray(streams.cadence);
            const alt = toArray(streams.altitude);
            const dist = toArray(streams.distance);
            let pace = toArray(streams.pace);
            const velocity = toArray(streams.velocity_smooth);
            if (pace.length === 0 && velocity.length > 0) {
              pace = velocity.map((v: number) => v > 0.1 ? 1000 / v / 60 : 0);
            }
            const time = toArray(streams.time);
            const ll = toLatlng(streams.latlng);
            const temp = toArray(streams.temperature);
            const respRate = toArray(streams.respiration_rate);
            const smo2Arr = toArray(streams.smo2);
            const thbArr = toArray(streams.thb);

            const isFirst = actId === String((toFetch[0] as Record<string, unknown>)?.id ?? "");
            if (isFirst) {
              const types = Array.isArray(parsed) ? (parsed as Array<{ type?: string }>).map((s) => s?.type).filter(Boolean) : [];
              console.log(`Stream ${actId} (first) stream_types:`, JSON.stringify(types));
            }

            if (time.length === 0 && hr.length === 0) {
              console.log(`Stream ${actId}: no time or HR data, skipping`);
              streamsFail++;
              return;
            }

            const { data: ap } = await supabaseAdmin.from("athlete_profile").select("lactate_threshold_hr, max_hr").eq("user_id", user.id).maybeSingle();
            const lthr = (ap as { lactate_threshold_hr?: number } | null)?.lactate_threshold_hr ?? null;
            const maxHr = (ap as { max_hr?: number } | null)?.max_hr ?? null;
            const hrZones = hr.length && (lthr || maxHr) ? hr.map((h) => getHRZone(h, lthr, maxHr)) : [];
            const paceZones: number[] = []; // intervals.icu pace zones need pace zones config; leave empty for now

            const { error: streamErr } = await supabaseAdmin.from("activity_streams").upsert({
              user_id: user.id,
              activity_id: actId,
              heartrate: hr.length ? hr : null,
              fixed_heartrate: fixedHr.length ? fixedHr : null,
              cadence: cad.length ? cad : null,
              altitude: alt.length ? alt : null,
              distance: dist.length ? dist : null,
              pace: pace.length ? pace : null,
              time: time.length ? time.map(Math.round) : null,
              latlng: ll.length ? ll : null,
              temperature: temp.length ? temp : null,
              respiration_rate: respRate.length ? respRate : null,
              smo2: smo2Arr.length ? smo2Arr : null,
              thb: thbArr.length ? thbArr : null,
              hr_zones: hrZones.length ? hrZones : null,
              pace_zones: paceZones.length ? paceZones : null,
            }, { onConflict: "user_id,activity_id" });

            if (streamErr) {
              console.error(`Stream upsert ${actId}:`, streamErr.message);
              streamsFail++;
              return;
            }
            streamsOk++;

            const cardiacDrift = computeCardiacDrift(hr);
            const avgPaceVal = pace.length ? avg(pace.filter((p) => p > 0)) : 0;
            const avgHrVal = hr.length ? avg(hr.filter((h) => h > 0)) : 0;
            const paceEff = computePaceEfficiency(avgPaceVal, avgHrVal);
            const cadenceCons = computeCadenceConsistency(cad);
            const updates: Record<string, unknown> = {};
            if (cardiacDrift != null) updates.cardiac_drift = cardiacDrift;
            if (paceEff != null) updates.pace_efficiency = paceEff;
            if (cadenceCons != null) updates.cadence_consistency = cadenceCons;
            if (Object.keys(updates).length > 0) {
              await supabaseAdmin.from("activity").update(updates).eq("user_id", user.id).eq("external_id", actId);
            }
          } catch (e) {
            console.error(`Stream error ${actId}:`, (e as Error).message);
            streamsFail++;
          }
        }));
        const doneSoFar = Math.min(i + STREAM_BATCH_SIZE, toFetch.length);
        await updateSyncProgress(supabaseAdmin, user.id, {
          stage: "streams",
          detail: `Fetching streams ${doneSoFar}/${toFetch.length}...`,
          streams_done: streamsOk,
        });
        if (i + STREAM_BATCH_SIZE < toFetch.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      log.push(`Streams: ${streamsOk} ok, ${streamsFail} failed`);

      await updateSyncProgress(supabaseAdmin, user.id, {
        stage: "intervals",
        detail: "Fetching intervals...",
        streams_done: streamsOk,
      });

      // 4. Fetch intervals for each activity
      let intervalsCount = 0;
      for (const run of allRuns) {
        const actId = String(run.id ?? "");
        if (!actId) continue;
        try {
          const intUrl = `https://intervals.icu/api/v1/activity/${encodeURIComponent(actId)}/intervals`;
          const intRes = await fetch(intUrl, { headers });
          if (!intRes.ok) continue;
          const intData = await intRes.json();
          const intArr = Array.isArray(intData) ? intData : (intData?.intervals ? (intData.intervals as unknown[]) : []);
          await supabaseAdmin.from("activity_intervals").delete().eq("user_id", user.id).eq("activity_id", actId);
          for (let idx = 0; idx < intArr.length; idx++) {
            const inv = intArr[idx] as Record<string, unknown>;
            const avgSpeed = Number(inv.avg_speed ?? inv.average_speed ?? 0);
            const avgPaceMinKm = avgSpeed > 0.1 ? 1000 / avgSpeed / 60 : null;
            await supabaseAdmin.from("activity_intervals").insert({
              user_id: user.id,
              activity_id: actId,
              interval_number: idx + 1,
              start_index: inv.start_index ?? inv.start ?? null,
              end_index: inv.end_index ?? inv.end ?? null,
              start_time_offset: inv.start_time_offset ?? inv.startTime ?? null,
              elapsed_time: inv.elapsed_time ?? inv.duration ?? null,
              distance_km: inv.distance_km ?? (inv.distance ? Number(inv.distance) / 1000 : null) ?? null,
              avg_pace: avgPaceMinKm,
              avg_hr: inv.avg_hr ?? inv.average_heartrate != null ? Math.round(Number(inv.average_heartrate)) : null,
              max_hr: inv.max_hr ?? inv.max_heartrate != null ? Math.round(Number(inv.max_heartrate)) : null,
              avg_cadence: inv.avg_cadence ?? inv.average_cadence != null ? Math.round(Number(inv.average_cadence)) : null,
              tss: inv.tss ?? inv.TSS != null ? Number(inv.TSS) : null,
              intensity_factor: inv.intensity_factor ?? inv.IF ?? inv.if != null ? Number(inv.intensity_factor ?? inv.IF ?? inv.if) : null,
              avg_power: inv.avg_power ?? inv.average_watts != null ? Number(inv.average_watts) : null,
              type: inv.type != null ? String(inv.type) : null,
              label: inv.label != null ? String(inv.label) : null,
            });
            intervalsCount++;
          }
        } catch {
          // skip
        }
        if (intervalsCount % 50 === 0 && intervalsCount > 0) await new Promise((r) => setTimeout(r, 100));
      }
      log.push(`Intervals: ${intervalsCount} saved`);

      await updateSyncProgress(supabaseAdmin, user.id, {
        stage: "pbs",
        detail: "Fetching personal records...",
        intervals_count: intervalsCount,
      });

      // 5. Fetch personal records
      let pbsCount = 0;
      try {
        const pbUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/pbs`;
        const pbRes = await fetch(pbUrl, { headers });
        if (pbRes.ok) {
          const pbData = await pbRes.json();
          const pbArr = Array.isArray(pbData) ? pbData : (pbData?.pbs ? (pbData.pbs as unknown[]) : []);
          await supabaseAdmin.from("personal_records").delete().eq("user_id", user.id).eq("source", "intervals");
          for (const pb of pbArr) {
            const p = pb as Record<string, unknown>;
            const dist = p.distance ?? p.name ?? "";
            if (!dist) continue;
            const bestTime = p.best_time ?? p.time ?? p.seconds;
            const bestTimeSec = typeof bestTime === "number" ? bestTime : bestTime ? parseInt(String(bestTime), 10) : null;
            await supabaseAdmin.from("personal_records").insert({
              user_id: user.id,
              distance: String(dist),
              best_time_seconds: bestTimeSec,
              best_pace: p.best_pace ?? p.pace != null ? String(p.pace) : null,
              date_achieved: p.date ?? p.achieved != null ? String(p.date ?? p.achieved).slice(0, 10) : null,
              activity_id: p.activity_id ?? p.activityId != null ? String(p.activity_id ?? p.activityId) : null,
              source: "intervals",
            });
            pbsCount++;
          }
          log.push(`PBs: ${pbsCount} saved`);
        }
      } catch (e) {
        log.push(`PBs: ERROR ${(e as Error).message}`);
      }

      await updateSyncProgress(supabaseAdmin, user.id, {
        stage: "wellness",
        detail: "Fetching wellness data...",
        pbs_count: pbsCount,
      });

      // 6. Fetch wellness
      let wellnessDays = 0;
      try {
        const wUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${START_YEAR}-01-01&newest=${todayStr()}`;
        const wRes = await fetch(wUrl, { headers });
        if (wRes.ok) {
          const wData = await wRes.json();
          const wArr = Array.isArray(wData) ? wData : [];
          for (let i = 0; i < wArr.length; i += 100) {
            const batch = wArr.slice(i, i + 100).map((w: Record<string, unknown>) => {
              const dateStr = String(w.id ?? w.date ?? w.calendarDate ?? "").slice(0, 10);
              const ctlVal = w.ctl ?? w.ctLoad ?? null;
              const atlVal = w.atl ?? w.atlLoad ?? null;
              const tsbRaw = w.tsb ?? w.form ?? null;
              const tsb = tsbRaw != null ? Number(tsbRaw) : (ctlVal != null && atlVal != null ? Number(ctlVal) - Number(atlVal) : null);
              return {
                user_id: user.id,
                date: dateStr,
                ctl: ctlVal != null ? Number(ctlVal) : null,
                atl: atlVal != null ? Number(atlVal) : null,
                tsb,
                icu_ctl: ctlVal != null ? Number(ctlVal) : null,
                icu_atl: atlVal != null ? Number(atlVal) : null,
                icu_tsb: tsb,
                icu_ramp_rate: w.rampRate ?? w.ramp_rate != null ? Number(w.rampRate ?? w.ramp_rate) : null,
                icu_long_term_power: w.longTermPower ?? w.long_term_power != null ? Number(w.longTermPower ?? w.long_term_power) : null,
                hrv: w.hrv ?? w.hrvSDNN ?? null,
                hrv_rmssd: w.hrvRMSSD ?? w.hrv_rmssd != null ? Number(w.hrvRMSSD ?? w.hrv_rmssd) : null,
                hrv_sdnn: w.hrvSDNN ?? w.hrv_sdnn != null ? Number(w.hrvSDNN ?? w.hrv_sdnn) : null,
                resting_hr: w.restingHR ?? w.resting_hr ?? null,
                sleep_hours: w.sleepSecs ? Number(w.sleepSecs) / 3600 : (w.sleepHours ?? null),
                sleep_secs: w.sleepSecs ?? w.sleep_secs != null ? Number(w.sleepSecs ?? w.sleep_secs) : null,
                sleep_score: w.sleepScore ?? w.sleep_score != null ? Number(w.sleepScore ?? w.sleep_score) : null,
                weight: w.weight != null ? Number(w.weight) : null,
                kcal: w.kcal ?? w.calories != null ? Math.round(Number(w.kcal ?? w.calories)) : null,
                steps: w.steps != null ? Math.round(Number(w.steps)) : null,
                stress_hrv: w.stressHrv ?? w.stress_hrv != null ? Number(w.stressHrv ?? w.stress_hrv) : null,
                readiness: w.readiness != null ? Number(w.readiness) : null,
                spo2: w.spo2 ?? w.spO2 != null ? Number(w.spo2 ?? w.spO2) : null,
                respiration_rate: w.respirationRate ?? w.respiration_rate != null ? Number(w.respirationRate ?? w.respiration_rate) : null,
              };
            }).filter((r: Record<string, unknown>) => r.date && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)));
            if (batch.length > 0) {
              await supabaseAdmin.from("daily_readiness").upsert(batch, { onConflict: "user_id,date" });
            }
            wellnessDays += batch.length;
          }
          log.push(`Wellness: ${wellnessDays} days saved`);
        } else {
          log.push(`Wellness: ERROR ${wRes.status}`);
        }
      } catch (e) {
        log.push(`Wellness: FETCH ERROR ${(e as Error).message}`);
      }

      // 5. Fetch athlete profile
      try {
        const aUrl = `https://intervals.icu/api/v1/athlete/${athleteId}`;
        const aRes = await fetch(aUrl, { headers });
        if (aRes.ok) {
          const ap = await aRes.json() as Record<string, unknown>;
          const updates: Record<string, unknown> = {};
          if (ap.resting_hr != null) updates.resting_hr = Number(ap.resting_hr);
          if (ap.max_hr != null) updates.max_hr = Number(ap.max_hr);
          if (ap.icu_lt_hr != null) updates.lactate_threshold_hr = Number(ap.icu_lt_hr);
          if (Object.keys(updates).length > 0) {
            await supabaseAdmin.from("athlete_profile").update(updates).eq("user_id", user.id);
          }
          log.push(`Athlete profile: updated ${Object.keys(updates).join(", ") || "nothing"}`);
        }
      } catch (e) {
        log.push(`Athlete profile: ERROR ${(e as Error).message}`);
      }

      // Get latest CTL/ATL/TSB
      const { data: latestReadiness } = await supabaseAdmin
        .from("daily_readiness")
        .select("ctl, atl, tsb")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const summary = {
        runs: allRuns.length,
        upserted: upsertedCount,
        streams: { ok: streamsOk, failed: streamsFail, skipped: existingIds.size },
        wellness: wellnessDays,
        ctl: latestReadiness?.ctl ?? null,
        atl: latestReadiness?.atl ?? null,
        tsb: latestReadiness?.tsb ?? null,
        log,
      };

      await updateSyncProgress(supabaseAdmin, user.id, {
        stage: "done",
        detail: `Done — ${allRuns.length} activities, ${streamsOk} streams, ${wellnessDays} wellness days`,
        done: true,
        error: null,
        activities_total: allRuns.length,
        activities_upserted: upsertedCount,
        streams_done: streamsOk,
        streams_total: toFetch.length,
        intervals_count: intervalsCount,
        wellness_days: wellnessDays,
        pbs_count: pbsCount,
        ctl: latestReadiness?.ctl ?? null,
        atl: latestReadiness?.atl ?? null,
        tsb: latestReadiness?.tsb ?? null,
      });

      console.log("intervals-proxy full_sync done:", JSON.stringify(summary));
      return jsonOk(summary);
      } catch (e) {
        const errMsg = (e as Error).message ?? "Sync failed";
        console.error("full_sync error:", e);
        await updateSyncProgress(supabaseAdmin, user.id, {
          stage: "error",
          detail: errMsg,
          done: true,
          error: errMsg,
        });
        return jsonOk({ error: errMsg, log: [] });
      }
    }

    // ─── Legacy: activities endpoint (for backwards compat) ───
    if (action === "activities" || body.endpoint === "activities") {
      const oldest = String(body.oldest ?? `${START_YEAR}-01-01`);
      const newest = String(body.newest ?? todayStr());
      const startY = Math.max(START_YEAR, parseInt(oldest.slice(0, 4), 10));
      const endY = new Date().getFullYear();
      const all: unknown[] = [];

      for (let year = startY; year <= endY; year++) {
        const yo = year === startY ? oldest : `${year}-01-01`;
        const yn = year === endY ? newest : `${year}-12-31`;
        const url = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${yo}&newest=${yn}&fields=${ACTIVITIES_FIELDS}`;
        try {
          const res = await fetch(url, { headers });
          if (!res.ok) {
            console.error(`${year} error:`, res.status);
            continue;
          }
          const data = await res.json();
          const arr = Array.isArray(data) ? data : [];
          const runs = arr.filter((a: Record<string, unknown>) => {
            const t = String(a.type ?? "").toLowerCase();
            return t === "run" || t.includes("run");
          });
          all.push(...runs);
          console.log(`${year}: ${arr.length} total, ${runs.length} runs`);
        } catch (e) {
          console.error(`${year} fetch error:`, e);
        }
        if (year < endY) await new Promise(r => setTimeout(r, 100));
      }
      return jsonOk(all);
    }

    // ─── Legacy: wellness endpoint ───
    if (body.endpoint === "wellness") {
      const oldest = String(body.oldest ?? `${START_YEAR}-01-01`);
      const newest = String(body.newest ?? todayStr());
      const url = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${oldest}&newest=${newest}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const t = await res.text();
        return jsonErr(`wellness ${res.status}: ${t}`, res.status);
      }
      return jsonOk(await res.json());
    }

    // ─── ACTION: generate coach note for an activity ───
    if (action === "activity_coach_note") {
      const activityId = String(body.activityId ?? "").trim();
      if (!activityId) return jsonErr("Missing activityId", 400);

      // activityId can be: intervals external_id (e.g. "i130714268") or Supabase activity id (uuid)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activityId);
      const baseQuery = supabaseAdmin.from("activity").select("id, date, coach_note, type, name, description, distance_km, duration_seconds, avg_pace, avg_hr, max_hr, elevation_gain, cadence, icu_training_load, trimp, hr_zone_times, user_notes, nomio_drink, lactate_levels").eq("user_id", user.id);

      const { data: existing } = isUuid
        ? await baseQuery.eq("id", activityId).maybeSingle()
        : await baseQuery.eq("external_id", activityId).maybeSingle();

      const regenerate = body.regenerate === true;
      if (existing?.coach_note && !regenerate) {
        return jsonOk({ note: existing.coach_note, cached: true });
      }

      if (!existing) {
        return jsonErr("Activity not found", 404);
      }

      // Check if this activity is a PB (from personal_records - synced from intervals.icu)
      const extId = (existing as { external_id?: string }).external_id;
      const idsToCheck = [extId, existing.id].filter(Boolean) as string[];
      let pbDistances: string[] = [];
      if (idsToCheck.length > 0) {
        const { data: pbRows } = await supabaseAdmin
          .from("personal_records")
          .select("distance")
          .eq("user_id", user.id)
          .in("activity_id", idsToCheck);
        pbDistances = (pbRows ?? []).map((r: Record<string, unknown>) => String(r.distance ?? "")).filter(Boolean);
      }
      const isMarathonPb = pbDistances.some((d) => /marathon|42\.195|42\s/i.test(d));

      const anthropicKeys = [Deno.env.get("ANTHROPIC_API_KEY"), Deno.env.get("ANTHROPIC_API_KEY_2"), Deno.env.get("ANTHROPIC_API_KEY_3")].filter((k): k is string => !!k);
      const geminiKeys = [Deno.env.get("GEMINI_API_KEY"), Deno.env.get("GEMINI_API_KEY_2"), Deno.env.get("GEMINI_API_KEY_3")].filter((k): k is string => !!k);
      const groqKeys = [Deno.env.get("GROQ_API_KEY"), Deno.env.get("GROQ_API_KEY_2"), Deno.env.get("GROQ_API_KEY_3")].filter((k): k is string => !!k);
      if (anthropicKeys.length === 0 && geminiKeys.length === 0 && groqKeys.length === 0) {
        return jsonErr("Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY in Supabase secrets", 500);
      }

      // Rich context for personalized feedback
      const activityDate = existing.date;
      const cutoffDate = new Date(activityDate);
      cutoffDate.setDate(cutoffDate.getDate() - 21);
      const oldestDate = cutoffDate.toISOString().slice(0, 10);

      const { data: activityHistory } = await supabaseAdmin
        .from("activity")
        .select("id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, icu_training_load")
        .eq("user_id", user.id)
        .gte("date", oldestDate)
        .lte("date", activityDate)
        .order("date", { ascending: false })
        .limit(25);

      const { data: readinessHistory } = await supabaseAdmin
        .from("daily_readiness")
        .select("date, ctl, atl, tsb")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(14);

      const { data: athleteProfile } = await supabaseAdmin
        .from("athlete_profile")
        .select("max_hr, resting_hr, lactate_threshold_hr, vo2max, vdot, training_philosophy")
        .eq("user_id", user.id)
        .maybeSingle();

      const a = existing;
      const hrZones = Array.isArray(a.hr_zone_times) ? a.hr_zone_times : [];
      const totalZoneTime = hrZones.reduce((s: number, v: number) => s + (v || 0), 0);
      const zoneDistribution = totalZoneTime > 0
        ? hrZones.map((v: number, i: number) => `Z${i + 1}: ${Math.round((v / totalZoneTime) * 100)}%`).join(", ")
        : "unavailable";

      const currentId = existing.id;
      const historyLines = (activityHistory ?? [])
        .filter((r: Record<string, unknown>) => r.id !== currentId)
        .slice(0, 20)
        .map((r: Record<string, unknown>) => {
          const dist = r.distance_km != null ? `${r.distance_km}km` : "?";
          const pace = r.avg_pace ?? "?";
          const dur = r.duration_seconds != null ? `${Math.floor(Number(r.duration_seconds) / 60)}min` : "?";
          const name = r.name ? ` "${r.name}"` : "";
          return `${r.date}: ${r.type ?? "?"}${name} — ${dist} @ ${pace} (${dur})`;
        });

      const excludeCurrent = (r: Record<string, unknown>) => r.id !== currentId;
      const weekAgo = new Date(activityDate);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const twoWeeksAgo = new Date(activityDate);
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const weekStart = weekAgo.toISOString().slice(0, 10);
      const twoWeekStart = twoWeeksAgo.toISOString().slice(0, 10);
      const inLastWeek = (r: Record<string, unknown>) => excludeCurrent(r) && String(r.date) >= weekStart && String(r.date) <= activityDate;
      const inLastTwoWeeks = (r: Record<string, unknown>) => excludeCurrent(r) && String(r.date) >= twoWeekStart && String(r.date) <= activityDate;

      const weeklyKm = (activityHistory ?? []).filter(inLastWeek).reduce((sum: number, r: Record<string, unknown>) => sum + (Number(r.distance_km) || 0), 0);
      const twoWeekKm = (activityHistory ?? []).filter(inLastTwoWeeks).reduce((sum: number, r: Record<string, unknown>) => sum + (Number(r.distance_km) || 0), 0);

      const fitnessTrend = (readinessHistory ?? [])
        .slice(0, 7)
        .reverse()
        .map((r: Record<string, unknown>) => `${r.date}: CTL ${r.ctl ?? "?"} ATL ${r.atl ?? "?"} TSB ${r.tsb ?? "?"}`)
        .join("\n");

      const ap = athleteProfile as Record<string, unknown> | null;
      const profileLines: string[] = [];
      if (ap?.max_hr != null) profileLines.push(`Max HR: ${ap.max_hr} bpm`);
      if (ap?.resting_hr != null) profileLines.push(`Resting HR: ${ap.resting_hr} bpm`);
      if (ap?.lactate_threshold_hr != null) profileLines.push(`LTHR: ${ap.lactate_threshold_hr} bpm`);
      if (ap?.vo2max != null) profileLines.push(`VO2max: ${ap.vo2max}`);
      if (ap?.vdot != null) profileLines.push(`VDOT: ${ap.vdot}`);
      if (ap?.training_philosophy != null) profileLines.push(`Philosophy: ${ap.training_philosophy}`);

      const activityType = String(a.type ?? "Run").trim();
      const isRun = /run|jog|treadmill|trail|street|track|ultra/i.test(activityType);
      const activityDesc = (a.description as string)?.trim() || "";
      const typeContext = isRun
        ? "This is a RUN. Give running-specific feedback (pacing, form, training load for running)."
        : `This is NOT a run — it's "${activityType}". Give feedback appropriate for this activity type. Acknowledge it's great for general fitness but NOT equivalent to running: e.g. 40 km ski ≠ 40 km run in terms of running-specific load. Be encouraging about cross-training while being clear about the difference.`;

      const pbContext = pbDistances.length > 0
        ? (isMarathonPb
          ? `CRITICAL: This activity is a MARATHON PERSONAL BEST! Celebrate this major milestone. Lead with that. Make it memorable.`
          : `This activity is a PERSONAL BEST for: ${pbDistances.join(", ")}. Acknowledge and celebrate it in your feedback.`)
        : "";

      const prompt = `You are Kipcoachee — an elite AI running coach built into PaceIQ. Give brief, personalized feedback (2-4 sentences) for THIS activity. ${typeContext} Reference specific numbers from the athlete's data. Be direct, data-driven, warm but never soft. Never use ## headers or emojis. Use metric units.
${pbContext ? `\n${pbContext}\n` : ""}

=== ACTIVITY BEING ANALYZED ===
Type: ${activityType} ${a.name ? `"${a.name}"` : ""}
${activityDesc ? `Description: ${activityDesc}` : ""}
Distance: ${a.distance_km ? `${a.distance_km} km` : "?"} | Pace: ${a.avg_pace ?? "?"}
${a.user_notes ? `Athlete notes: ${a.user_notes}` : ""}
${a.nomio_drink ? "Nomio drink used before session." : ""}
${a.lactate_levels ? `Lactate levels: ${a.lactate_levels}` : ""}
Duration: ${a.duration_seconds ? `${Math.floor(a.duration_seconds / 60)}:${String(Math.floor(a.duration_seconds % 60)).padStart(2, "0")}` : "?"}
Avg HR: ${a.avg_hr ?? "?"} bpm | Max HR: ${a.max_hr ?? "?"} bpm | Elevation: ${a.elevation_gain ?? 0}m | Cadence: ${a.cadence ?? "?"} spm
Load: ${a.icu_training_load ?? "?"} | TRIMP: ${a.trimp ?? "?"} | HR zones: ${zoneDistribution}

=== ATHLETE PROFILE ===
${profileLines.length ? profileLines.join(" | ") : "Not set"}

=== RECENT TRAINING (last 7 days: ${Math.round(weeklyKm * 10) / 10} km | last 14 days: ${Math.round(twoWeekKm * 10) / 10} km) ===
${historyLines.length ? historyLines.join("\n") : "No other activities in this period"}

=== FITNESS TREND (CTL=fitness, ATL=fatigue, TSB=form) ===
${fitnessTrend || "No readiness data"}

Reply with ONLY the coach feedback. No greeting or sign-off. 2-4 punchy, personalized sentences.`;

      async function tryClaude(): Promise<string | null> {
        for (const key of anthropicKeys) {
          try {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "claude-sonnet-4-5",
                max_tokens: 300,
                messages: [{ role: "user", content: prompt }],
              }),
            });
            if (res.status === 429) continue;
            if (!res.ok) {
              console.error("Claude error:", res.status, await res.text());
              return null;
            }
            const json = (await res.json()) as Record<string, unknown>;
            const content = (json.content ?? []) as Array<{ type?: string; text?: string }>;
            const block = content.find((b) => b.type === "text");
            const text = block?.text?.trim();
            if (text) return text;
          } catch (e) {
            console.error("Claude error:", e);
          }
        }
        return null;
      }

      async function tryGemini(): Promise<string | null> {
        for (const key of geminiKeys) {
          try {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: { maxOutputTokens: 300, temperature: 0.6 },
                }),
              }
            );
            if (res.status === 429) continue;
            if (!res.ok) {
              console.error("Gemini error:", res.status, await res.text());
              return null;
            }
            const data = (await res.json()) as Record<string, unknown>;
            const candidates = (data.candidates ?? []) as Array<Record<string, unknown>>;
            const parts = ((candidates[0]?.content as Record<string, unknown>)?.parts ?? []) as Array<Record<string, unknown>>;
            const text = String(parts[0]?.text ?? "").trim();
            if (text) return text;
          } catch (e) {
            console.error("Gemini error:", e);
          }
        }
        return null;
      }

      async function tryGroq(): Promise<string | null> {
        for (const key of groqKeys) {
          try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: prompt }],
                stream: false,
                temperature: 0.6,
                max_tokens: 300,
              }),
            });
            if (res.status === 429) continue;
            if (!res.ok) {
              console.error("Groq error:", res.status, await res.text());
              return null;
            }
            const data = (await res.json()) as Record<string, unknown>;
            const choices = (data.choices ?? []) as Array<Record<string, unknown>>;
            const text = (choices[0]?.message as Record<string, unknown>)?.content;
            if (text) return String(text).trim();
          } catch (e) {
            console.error("Groq error:", e);
          }
        }
        return null;
      }

      try {
        const note = (await tryGroq()) ?? (await tryGemini()) ?? (await tryClaude());
        if (!note) {
          return jsonErr("AI generation failed. Check ANTHROPIC_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY in Supabase secrets.", 500);
        }

        if (isUuid) {
          await supabaseAdmin.from("activity").update({ coach_note: note }).eq("user_id", user.id).eq("id", activityId);
        } else {
          await supabaseAdmin.from("activity").update({ coach_note: note }).eq("user_id", user.id).eq("external_id", activityId);
        }

        return jsonOk({ note, cached: false });
      } catch (e) {
        console.error("Coach note generation error:", e);
        return jsonErr("AI generation failed", 500);
      }
    }

    // ─── ACTION: generate coach note for a training plan workout ───
    if (action === "workout_coach_note") {
      const workoutId = String(body.workoutId ?? "").trim();
      if (!workoutId) return jsonErr("Missing workoutId", 400);

      const { data: workout, error: workoutErr } = await supabaseAdmin
        .from("training_plan_workout")
        .select("id, date, coach_note, type, name, description, key_focus, distance_km, duration_minutes, target_pace, target_hr_zone, week_number, phase, plan_id, notes")
        .eq("user_id", user.id)
        .eq("id", workoutId)
        .maybeSingle();

      if (workoutErr || !workout) {
        return jsonErr("Workout not found", 404);
      }

      const regenerate = body.regenerate === true;
      if (workout.coach_note && !regenerate) {
        return jsonOk({ note: workout.coach_note, cached: true });
      }

      const { data: planRow } = await supabaseAdmin
        .from("training_plan")
        .select("plan_name, philosophy, goal_race, goal_date, goal_time")
        .eq("id", workout.plan_id)
        .maybeSingle();

      const { data: athleteProfile } = await supabaseAdmin
        .from("athlete_profile")
        .select("max_hr, resting_hr, lactate_threshold_hr, vo2max, vdot, training_philosophy, days_per_week, narrative")
        .eq("user_id", user.id)
        .maybeSingle();

      const anthropicKeys = [Deno.env.get("ANTHROPIC_API_KEY"), Deno.env.get("ANTHROPIC_API_KEY_2"), Deno.env.get("ANTHROPIC_API_KEY_3")].filter((k): k is string => !!k);
      const geminiKeys = [Deno.env.get("GEMINI_API_KEY"), Deno.env.get("GEMINI_API_KEY_2"), Deno.env.get("GEMINI_API_KEY_3")].filter((k): k is string => !!k);
      const groqKeys = [Deno.env.get("GROQ_API_KEY"), Deno.env.get("GROQ_API_KEY_2"), Deno.env.get("GROQ_API_KEY_3")].filter((k): k is string => !!k);
      if (anthropicKeys.length === 0 && geminiKeys.length === 0 && groqKeys.length === 0) {
        return jsonErr("Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY in Supabase secrets", 500);
      }

      // Fetch the week's other workouts for full context
      const { data: weekWorkouts } = await supabaseAdmin
        .from("training_plan_workout")
        .select("type, name, description, distance_km, duration_minutes, date")
        .eq("plan_id", workout.plan_id)
        .eq("week_number", workout.week_number ?? 0);

      // Fetch latest readiness for current state
      const { data: readinessRows } = await supabaseAdmin
        .from("daily_readiness")
        .select("date, ctl, atl, tsb, icu_ctl, icu_atl, icu_tsb, hrv, hrv_baseline, sleep_hours, resting_hr")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(3);

      const ap = athleteProfile as Record<string, unknown> | null;
      const profileLines: string[] = [];
      if (ap?.max_hr != null) profileLines.push(`Max HR: ${ap.max_hr} bpm`);
      if (ap?.resting_hr != null) profileLines.push(`Resting HR: ${ap.resting_hr} bpm`);
      if (ap?.vdot != null) profileLines.push(`VDOT: ${ap.vdot}`);
      if (ap?.training_philosophy != null) profileLines.push(`Philosophy: ${ap.training_philosophy}`);
      if (ap?.days_per_week != null) profileLines.push(`Days/week: ${ap.days_per_week}`);
      if (ap?.narrative != null) profileLines.push(`Context: ${ap.narrative}`);

      const plan = planRow as Record<string, unknown> | null;
      const planContext = plan
        ? `Plan: ${plan.plan_name ?? "?"} | Goal: ${plan.goal_race ?? "?"} | Race date: ${plan.goal_date ?? "?"} | Target: ${plan.goal_time ?? "?"}`
        : "No plan context";

      const weekSummary = (weekWorkouts ?? []).map((w: Record<string, unknown>) =>
        `${w.date}: ${w.type ?? "easy"} — ${w.name ?? w.description ?? "?"} ${w.distance_km ? `${w.distance_km}km` : ""}`
      ).join("\n");

      const readinessContext = (readinessRows ?? []).map((r: Record<string, unknown>) => {
        const ctl = r.ctl ?? r.icu_ctl ?? "?";
        const atl = r.atl ?? r.icu_atl ?? "?";
        const rawTsb = r.tsb ?? r.icu_tsb;
        const tsb = rawTsb != null ? rawTsb : (typeof ctl === "number" && typeof atl === "number" ? ctl - atl : "?");
        return `${r.date}: CTL ${ctl} ATL ${atl} TSB ${tsb} HRV ${r.hrv ?? "?"}ms Sleep ${r.sleep_hours ?? "?"}h RHR ${r.resting_hr ?? "?"}`;
      }).join("\n");

      const adjustmentNotes = (workout as Record<string, unknown>).notes as string | null;
      const hasAdjustment = adjustmentNotes && (adjustmentNotes.startsWith("[Adjustment]") || adjustmentNotes.startsWith("[Transition]"));

      const prompt = `You are Kipcoachee — an elite AI running coach built into PaceIQ. You CREATED this session as part of the athlete's plan. Write a brief, personalized description (2-4 sentences) explaining WHY this specific session is good for THIS athlete right now. Reference their current fitness state (CTL/TSB), the week's load pattern, their philosophy, and race goal. Be direct, data-driven, and specific — use actual numbers. Never use ## headers or emojis.${hasAdjustment ? `\n\nIMPORTANT: This session was modified due to a plan adjustment. The athlete's context for the change: "${adjustmentNotes}". You MUST reference this reason in your explanation — explain how this session helps given that specific situation.` : ""}

=== SESSION ===
Type: ${workout.type ?? "?"} | Week ${workout.week_number ?? "?"} | Phase: ${workout.phase ?? "?"}
Name: ${workout.name ?? workout.description ?? "?"}
${workout.description ? `Description: ${workout.description}` : ""}
${workout.key_focus ? `Key focus: ${workout.key_focus}` : ""}
Distance: ${workout.distance_km != null ? `${workout.distance_km} km` : "?"} | Duration: ${workout.duration_minutes != null ? `${workout.duration_minutes} min` : "?"}
Target pace: ${workout.target_pace ?? "?"} | HR zone: ${workout.target_hr_zone ?? "?"}

=== THIS WEEK'S FULL SCHEDULE ===
${weekSummary || "No other sessions"}

=== ATHLETE ===
${profileLines.length ? profileLines.join(" | ") : "Limited profile"}
${planContext}

=== CURRENT FITNESS STATE ===
${readinessContext || "No readiness data"}

Reply with ONLY the coach description. No greeting or sign-off. 2-4 punchy, personalized sentences.`;

      async function tryClaude(): Promise<string | null> {
        for (const key of anthropicKeys) {
          try {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "claude-sonnet-4-5",
                max_tokens: 300,
                messages: [{ role: "user", content: prompt }],
              }),
            });
            if (res.status === 429) continue;
            if (!res.ok) return null;
            const json = (await res.json()) as Record<string, unknown>;
            const content = (json.content ?? []) as Array<{ type?: string; text?: string }>;
            const block = content.find((b) => b.type === "text");
            const text = block?.text?.trim();
            if (text) return text;
          } catch {
            // continue to next key
          }
        }
        return null;
      }

      async function tryGemini(): Promise<string | null> {
        for (const key of geminiKeys) {
          try {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: { maxOutputTokens: 300, temperature: 0.6 },
                }),
              }
            );
            if (res.status === 429) continue;
            if (!res.ok) return null;
            const data = (await res.json()) as Record<string, unknown>;
            const candidates = (data.candidates ?? []) as Array<Record<string, unknown>>;
            const parts = ((candidates[0]?.content as Record<string, unknown>)?.parts ?? []) as Array<Record<string, unknown>>;
            const text = String(parts[0]?.text ?? "").trim();
            if (text) return text;
          } catch {
            // continue to next key
          }
        }
        return null;
      }

      async function tryGroq(): Promise<string | null> {
        for (const key of groqKeys) {
          try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: prompt }],
                stream: false,
                temperature: 0.6,
                max_tokens: 300,
              }),
            });
            if (res.status === 429) continue;
            if (!res.ok) return null;
            const data = (await res.json()) as Record<string, unknown>;
            const choices = (data.choices ?? []) as Array<Record<string, unknown>>;
            const text = (choices[0]?.message as Record<string, unknown>)?.content;
            if (text) return String(text).trim();
          } catch {
            // continue to next key
          }
        }
        return null;
      }

      const note = (await tryGroq()) ?? (await tryGemini()) ?? (await tryClaude());
      if (!note) {
        return jsonErr("AI generation failed. Check ANTHROPIC_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY in Supabase secrets.", 500);
      }

      await supabaseAdmin
        .from("training_plan_workout")
        .update({ coach_note: note })
        .eq("user_id", user.id)
        .eq("id", workoutId);

      return jsonOk({ note, cached: false });
    }

    return jsonErr(`Unknown action: ${action || "(empty)"}`.slice(0, 80), 400);
  } catch (e) {
    console.error("intervals-proxy error:", e);
    return jsonErr((e as Error).message ?? "Unknown error", 500);
  }
});
