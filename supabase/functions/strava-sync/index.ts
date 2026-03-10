import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatPace(seconds: number, meters: number): string {
  if (!meters) return "--";
  const paceSeconds = (seconds / meters) * 1000;
  const min = Math.floor(paceSeconds / 60);
  const sec = Math.round(paceSeconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Authorization header", detail: "Sign in and try again" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Validate JWT via Auth API (more reliable than getUser in edge runtime)
    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: anonKey,
      },
    });
    if (!authRes.ok) {
      const errText = await authRes.text();
      console.error("Auth validation failed:", authRes.status, errText);
      return new Response(JSON.stringify({
        error: "Unauthorized",
        detail: authRes.status === 401 ? "Session expired. Sign out and sign back in." : errText,
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userData = await authRes.json();
    const user = userData as { id: string };
    if (!user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized", detail: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("STRAVA_CLIENT_ID");
    const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "Strava not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tokenRow, error: tokenErr } = await supabaseAdmin
      .from("oauth_tokens")
      .select("id, access_token, refresh_token, expires_at")
      .eq("user_id", user.id)
      .eq("provider", "strava")
      .single();

    if (tokenErr || !tokenRow) {
      return new Response(JSON.stringify({ error: "Strava not connected" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = tokenRow.access_token;
    const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null;
    const needsRefresh = expiresAt && expiresAt < new Date();

    if (needsRefresh && tokenRow.refresh_token) {
      const refreshRes = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: tokenRow.refresh_token,
        }),
      });
      if (!refreshRes.ok) {
        const err = await refreshRes.text();
        return new Response(JSON.stringify({ error: "Token refresh failed", detail: err }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const refreshed = await refreshRes.json();
      accessToken = refreshed.access_token;
      await supabaseAdmin.from("oauth_tokens").update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? tokenRow.refresh_token,
        expires_at: refreshed.expires_at ? new Date(refreshed.expires_at * 1000).toISOString() : null,
      }).eq("id", tokenRow.id);
    } else if (needsRefresh && !tokenRow.refresh_token) {
      return new Response(JSON.stringify({
        error: "Token expired",
        detail: "Personal token expired. Paste a new access token in Settings.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const activitiesRes = await fetch(
      "https://www.strava.com/api/v3/athlete/activities?per_page=30",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!activitiesRes.ok) {
      const err = await activitiesRes.text();
      const isPermissionError = err.includes("activity:read_permission") || err.includes("activity:read");
      const detail = isPermissionError
        ? "Token needs activity:read_all scope. Use Connect Strava (OAuth) or create a new token at Strava Settings → API with activity permissions."
        : err;
      return new Response(JSON.stringify({ error: "Strava API failed", detail }), {
        status: activitiesRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const activities = await activitiesRes.json();
    let runCount = 0;

    for (const a of activities) {
      if (a.type !== "Run") continue;
      const { error: upsertErr } = await supabaseAdmin.from("activity").upsert(
        {
          user_id: user.id,
          strava_id: String(a.id),
          date: a.start_date?.slice?.(0, 10) ?? new Date().toISOString().slice(0, 10),
          type: "run",
          distance_km: a.distance ? Math.round((a.distance / 1000) * 100) / 100 : null,
          duration_seconds: a.moving_time ?? null,
          avg_pace: a.moving_time && a.distance ? formatPace(a.moving_time, a.distance) : null,
          avg_hr: a.average_heartrate ?? null,
          max_hr: a.max_heartrate ?? null,
          cadence: a.average_cadence ?? null,
          elevation_gain: a.total_elevation_gain ?? null,
          polyline: a.map?.summary_polyline ?? null,
          source: "strava",
        },
        { onConflict: "user_id,strava_id" }
      );
      if (!upsertErr) runCount++;
    }

    await supabaseAdmin.from("oauth_tokens").update({
      last_sync_at: new Date().toISOString(),
    }).eq("id", tokenRow.id);

    return new Response(JSON.stringify({ synced: runCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Sync failed", detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
