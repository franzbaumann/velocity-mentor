import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code, redirect_uri } = await req.json();

    if (!code || typeof code !== "string") {
      return new Response(JSON.stringify({ error: "Missing authorization code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate redirect_uri against allowlist (prevents OAuth redirect hijacking).
    // ALLOWED_REDIRECT_URIS must be set in Supabase secrets for production.
    // In local dev (SUPABASE_URL contains localhost) localhost URIs are allowed as fallback.
    const allowedUrisEnv = Deno.env.get("ALLOWED_REDIRECT_URIS");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const isLocalDev = supabaseUrl.includes("localhost") || supabaseUrl.includes("127.0.0.1");
    if (!allowedUrisEnv && !isLocalDev) {
      console.error("[strava-oauth] ALLOWED_REDIRECT_URIS is not configured — refusing OAuth redirect");
      return new Response(JSON.stringify({ error: "OAuth redirect URIs not configured. Set ALLOWED_REDIRECT_URIS in Supabase secrets." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const devFallback = "http://localhost:5173/auth/strava/callback,http://localhost:8080/auth/strava/callback,http://127.0.0.1:5173/auth/strava/callback,http://127.0.0.1:8080/auth/strava/callback";
    const allowedList = (allowedUrisEnv ?? devFallback).split(",").map((u) => u.trim()).filter(Boolean);
    const redirectUri = typeof redirect_uri === "string" ? redirect_uri.trim() : "";
    if (!redirectUri || !allowedList.includes(redirectUri)) {
      return new Response(JSON.stringify({ error: "Invalid redirect_uri" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("STRAVA_CLIENT_ID");
    const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "Strava credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate user before exchanging code
    const token = authHeader.replace("Bearer ", "").trim();
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return new Response(JSON.stringify({ error: "Strava token exchange failed", detail: err }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenData = await tokenRes.json();
    const { access_token, refresh_token, expires_at, athlete } = tokenData;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Upsert tokens using service role (bypasses RLS for INSERT)
    const { error: upsertError } = await supabase
      .from("oauth_tokens")
      .upsert(
        {
          user_id: user.id,
          provider: "strava",
          access_token,
          refresh_token: refresh_token ?? null,
          expires_at: expires_at ? new Date(expires_at * 1000).toISOString() : null,
          athlete_id: athlete ? String(athlete.id) : null,
          athlete_name: athlete
            ? `${athlete.firstname ?? ""} ${athlete.lastname ?? ""}`.trim()
            : null,
        },
        { onConflict: "user_id,provider" },
      );

    if (upsertError) {
      return new Response(JSON.stringify({ error: "Failed to save tokens", detail: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        athlete_name: athlete
          ? `${athlete.firstname ?? ""} ${athlete.lastname ?? ""}`.trim()
          : null,
        athlete_id: athlete ? String(athlete.id) : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
