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
  "total_elevation_gain,calories,icu_training_load,icu_atl,icu_ctl," +
  "icu_hr_zone_times,icu_pace_zone_times,trimp,perceived_exertion," +
  "athlete_max_hr,workout_type,description";

const START_YEAR = 2015;
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

    const { data: integration } = await supabaseAdmin
      .from("integrations")
      .select("athlete_id, api_key")
      .eq("user_id", user.id)
      .eq("provider", "intervals_icu")
      .maybeSingle();

    if (!integration?.api_key) {
      return jsonErr("intervals.icu not connected", 404);
    }

    const rawAthleteId = (integration.athlete_id ?? "").toString().trim();
    const headers = { Authorization: buildAuth(integration.api_key) };

    // Auto-resolve athlete ID from the API key by calling the profile endpoint.
    // intervals.icu athlete IDs can be alphanumeric (e.g. "i12345", "p12345").
    // We accept whatever the user entered; if empty/invalid we discover it.
    let athleteId = rawAthleteId;
    if (!athleteId || athleteId === "0") {
      try {
        const profileRes = await fetch("https://intervals.icu/api/v1/athlete/0", { headers });
        if (profileRes.ok) {
          const profile = await profileRes.json() as Record<string, unknown>;
          if (profile.id) {
            athleteId = String(profile.id);
            console.log(`intervals-proxy: auto-resolved athlete ID → ${athleteId}`);
          }
        } else {
          console.error(`intervals-proxy: athlete/0 returned ${profileRes.status}`);
        }
      } catch (e) {
        console.error("intervals-proxy: failed to auto-resolve athlete ID:", e);
      }
    }
    if (!athleteId || athleteId === "0") {
      return jsonErr("Kunde inte hitta ditt athlete ID. Ange det i fältet Athlete ID (t.ex. i401784) – hittar du under intervals.icu → Settings.", 400);
    }
    // API path expects numeric id (e.g. 401784). UI shows "i401784" – strip leading letter.
    const athleteIdForPath = athleteId.replace(/^[ip]/i, "") || athleteId;
    console.log(`intervals-proxy: using athlete ID ${athleteId} → path ${athleteIdForPath}`);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return jsonErr("Invalid request body", 400);
    }

    const action = String(body.action ?? "");

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

    // ─── ACTION: activity streams ───
    if (action === "streams" && body.activityId) {
      const url = `https://intervals.icu/api/v1/activity/${encodeURIComponent(String(body.activityId))}/streams.json?types=heartrate,cadence,altitude,distance,latlng,time,velocity_smooth`;
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
      const url = `https://intervals.icu/api/v1/athlete/${athleteIdForPath}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const t = await res.text();
        console.error("athlete error:", res.status, t);
        return jsonErr(`athlete ${res.status}`, res.status);
      }
      return jsonOk(await res.json());
    }

    // ─── ACTION: wellness ───
    if (action === "wellness") {
      const oldest = String(body.oldest ?? "2020-01-01");
      const newest = String(body.newest ?? todayStr());
      const url = `https://intervals.icu/api/v1/athlete/${athleteIdForPath}/wellness?oldest=${oldest}&newest=${newest}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const t = await res.text();
        console.error("wellness error:", res.status, t);
        return jsonErr(`wellness ${res.status}`, res.status);
      }
      return jsonOk(await res.json());
    }

    // ─── ACTION: full sync (activities + streams + wellness + athlete) ───
    if (action === "full_sync") {
      const log: string[] = [];
      const currentYear = new Date().getFullYear();
      const allRuns: Record<string, unknown>[] = [];

      // 1. Fetch activities year by year
      for (let year = START_YEAR; year <= currentYear; year++) {
        const oldest = `${year}-01-01`;
        const newest = year === currentYear ? todayStr() : `${year}-12-31`;
        const url = `https://intervals.icu/api/v1/athlete/${athleteIdForPath}/activities?oldest=${oldest}&newest=${newest}&fields=${ACTIVITIES_FIELDS}`;

        try {
          const res = await fetch(url, { headers });
          if (!res.ok) {
            const t = await res.text();
            console.error(`${year} activities error:`, res.status, t);
            log.push(`${year}: ERROR ${res.status} — ${t.slice(0, 120)}`);
            if (res.status === 401) {
              return jsonOk({ error: `Auth failed: ${t}`, log });
            }
            if (res.status === 403) {
              log.push(
                `${year}: Access denied (403). Skipping this year, continuing with later years. If you want these older workouts too, check your intervals.icu API key permissions or plan.`,
              );
            }
            continue;
          }
          const rawText = await res.text();
          const contentType = res.headers.get("content-type") ?? "";
          if (year === currentYear) {
            log.push(`Response sample: type=${contentType.slice(0, 30)} len=${rawText.length} start=${rawText.slice(0, 200)}`);
          }
          let data: unknown;
          try {
            data = JSON.parse(rawText);
          } catch {
            log.push(`${year}: Response is not JSON — ${rawText.slice(0, 150)}`);
            continue;
          }
          let arr: unknown[] = [];
          if (Array.isArray(data)) {
            arr = data;
          } else if (data && typeof data === "object") {
            const obj = data as Record<string, unknown>;
            if (obj.activities && Array.isArray(obj.activities)) {
              arr = obj.activities as unknown[];
            } else {
              arr = Object.entries(obj).map(([id, v]) =>
                v && typeof v === "object" ? { ...(v as Record<string, unknown>), id } : v,
              );
            }
          }

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
          if (arr.length > 0) {
            console.log(`  first activity:`, JSON.stringify(arr[0]).slice(0, 300));
          }
        } catch (e) {
          log.push(`${year}: FETCH ERROR ${(e as Error).message}`);
          console.error(`${year} fetch error:`, e);
        }

        if (year < currentYear) await new Promise(r => setTimeout(r, 200));
      }

      log.push(`Total activities: ${allRuns.length}`);
      console.log(`intervals-proxy total activities: ${allRuns.length}`);

      // 2. Upsert activities to DB
      let upsertedCount = 0;
      for (const run of allRuns) {
        const externalId = String(run.id ?? (run as Record<string, unknown>)._id ?? "").trim();
        if (!externalId) continue;
        const dateRaw = run.start_date_local ?? run.startDate ?? run.date ?? (run as Record<string, unknown>).startDateLocal;
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
          icu_training_load: run.icu_training_load != null ? Number(run.icu_training_load) : null,
          trimp: run.trimp != null ? Number(run.trimp) : null,
          hr_zone_times: run.icu_hr_zone_times ?? null,
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

      for (let i = 0; i < toFetch.length; i += STREAM_BATCH_SIZE) {
        const batch = toFetch.slice(i, i + STREAM_BATCH_SIZE);
        await Promise.all(batch.map(async (run) => {
          const actId = String(run.id);
          try {
            const url = `https://intervals.icu/api/v1/activity/${actId}/streams.json?types=heartrate,cadence,altitude,distance,latlng,time,velocity_smooth`;
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
            const cad = toArray(streams.cadence);
            const alt = toArray(streams.altitude);
            const dist = toArray(streams.distance);
            const velocity = toArray(streams.velocity_smooth);
            const pace = velocity.length > 0
              ? velocity.map((v: number) => v > 0.1 ? 1000 / v / 60 : 0)
              : [];
            const time = toArray(streams.time);
            const ll = toLatlng(streams.latlng);

            console.log(`Stream ${actId} parsed lengths: hr=${hr.length}, cad=${cad.length}, alt=${alt.length}, dist=${dist.length}, pace=${pace.length}, time=${time.length}, ll=${ll.length}`);

            if (time.length === 0 && hr.length === 0) {
              console.log(`Stream ${actId}: no time or HR data, skipping`);
              streamsFail++;
              return;
            }

            const { error } = await supabaseAdmin.from("activity_streams").upsert({
              user_id: user.id,
              activity_id: actId,
              heartrate: hr.length ? hr : null,
              cadence: cad.length ? cad : null,
              altitude: alt.length ? alt : null,
              distance: dist.length ? dist : null,
              pace: pace.length ? pace : null,
              time: time.length ? time.map(Math.round) : null,
              latlng: ll.length ? ll : null,
            }, { onConflict: "user_id,activity_id" });

            if (error) {
              console.error(`Stream upsert ${actId}:`, error.message);
              streamsFail++;
            } else {
              console.log(`Stream ${actId}: saved successfully`);
              streamsOk++;
            }
          } catch (e) {
            console.error(`Stream error ${actId}:`, (e as Error).message);
            streamsFail++;
          }
        }));
        if (i + STREAM_BATCH_SIZE < toFetch.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      log.push(`Streams: ${streamsOk} ok, ${streamsFail} failed`);

      // 4. Fetch wellness
      let wellnessDays = 0;
      try {
        const wUrl = `https://intervals.icu/api/v1/athlete/${athleteIdForPath}/wellness?oldest=${START_YEAR}-01-01&newest=${todayStr()}`;
        const wRes = await fetch(wUrl, { headers });
        if (wRes.ok) {
          const wData = await wRes.json();
          const wArr = Array.isArray(wData) ? wData : [];
          for (let i = 0; i < wArr.length; i += 100) {
            const batch = wArr.slice(i, i + 100).map((w: Record<string, unknown>) => {
              const dateStr = String(w.id ?? w.date ?? w.calendarDate ?? "").slice(0, 10);
              return {
                user_id: user.id,
                date: dateStr,
                ctl: w.ctl ?? w.ctLoad ?? null,
                atl: w.atl ?? w.atlLoad ?? null,
                tsb: w.tsb ?? w.form ?? null,
                hrv: w.hrv ?? w.hrvSDNN ?? null,
                resting_hr: w.restingHR ?? w.resting_hr ?? null,
                sleep_hours: w.sleepSecs ? Number(w.sleepSecs) / 3600 : (w.sleepHours ?? null),
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
        const aUrl = `https://intervals.icu/api/v1/athlete/${athleteIdForPath}`;
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

      console.log("intervals-proxy full_sync done:", JSON.stringify(summary));
      return jsonOk(summary);
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
        const url = `https://intervals.icu/api/v1/athlete/${athleteIdForPath}/activities?oldest=${yo}&newest=${yn}&fields=${ACTIVITIES_FIELDS}`;
        try {
          const res = await fetch(url, { headers });
          if (!res.ok) {
            console.error(`${year} error:`, res.status);
            continue;
          }
          const data = await res.json();
          let arr: unknown[] = [];
          if (Array.isArray(data)) {
            arr = data;
          } else if (data && typeof data === "object") {
            const obj = data as Record<string, unknown>;
            arr = Object.entries(obj).map(([id, v]) =>
              v && typeof v === "object" ? { ...(v as Record<string, unknown>), id } : v,
            );
          }
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
      const url = `https://intervals.icu/api/v1/athlete/${athleteIdForPath}/wellness?oldest=${oldest}&newest=${newest}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const t = await res.text();
        return jsonErr(`wellness ${res.status}: ${t}`, res.status);
      }
      return jsonOk(await res.json());
    }

    return jsonErr("Unknown action", 400);
  } catch (e) {
    console.error("intervals-proxy error:", e);
    return jsonErr((e as Error).message ?? "Unknown error", 500);
  }
});
