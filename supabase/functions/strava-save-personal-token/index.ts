import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      console.error("Edge function missing SUPABASE_URL or SUPABASE_ANON_KEY");
      return jsonResponse({
        error: "Server configuration error",
      }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({
        error: "Missing Authorization header",
        detail: "Ensure you are signed in and the request includes Bearer token",
      }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse({ error: "Empty token", detail: "Authorization Bearer value is empty" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth failed:", userError?.message ?? "No user", "| status:", userError?.status);
      return jsonResponse({
        error: "Unauthorized",
        detail: userError?.message ?? "Invalid or expired session. Sign out and sign back in.",
      }, 401);
    }

    const { access_token, refresh_token } = await req.json();
    if (!access_token || typeof access_token !== "string") {
      return jsonResponse({ error: "Missing access token", detail: "Provide access_token in the request body" }, 400);
    }

    // Validate token and fetch athlete
    const athleteRes = await fetch("https://www.strava.com/api/v3/athlete", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!athleteRes.ok) {
      const err = await athleteRes.text();
      return new Response(JSON.stringify({ error: "Invalid token", detail: err }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const athlete = await athleteRes.json();
    const athleteName = athlete.firstname || athlete.lastname
      ? `${athlete.firstname ?? ""} ${athlete.lastname ?? ""}`.trim()
      : null;
    const athleteId = athlete.id ? String(athlete.id) : null;

    // Access tokens expire in 6 hours
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { error: upsertError } = await supabase.from("oauth_tokens").upsert(
      {
        user_id: user.id,
        provider: "strava",
        access_token,
        refresh_token: refresh_token && typeof refresh_token === "string" ? refresh_token : null,
        expires_at: expiresAt,
        athlete_id: athleteId,
        athlete_name: athleteName,
      },
      { onConflict: "user_id,provider" }
    );

    if (upsertError) {
      console.error("Upsert oauth_tokens failed:", upsertError.message);
      return jsonResponse({ error: "Failed to save token", detail: upsertError.message }, 500);
    }

    return jsonResponse({ athlete_name: athleteName, athlete_id: athleteId }, 200);
  } catch (err) {
    console.error("strava-save-personal-token error:", err);
    return jsonResponse({ error: "Failed", detail: String(err) }, 500);
  }
});
