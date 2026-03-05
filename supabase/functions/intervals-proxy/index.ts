import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

    // Auth
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get integration credentials
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: integration, error: intErr } = await supabaseAdmin
      .from("integrations")
      .select("athlete_id, api_key")
      .eq("user_id", user.id)
      .eq("provider", "intervals_icu")
      .maybeSingle();

    if (intErr || !integration || !integration.api_key || !integration.athlete_id) {
      return new Response(JSON.stringify({ error: "intervals.icu not connected" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { endpoint, oldest, newest } = await req.json();

    // Validate endpoint
    const allowedEndpoints = ["wellness", "activities"];
    if (!allowedEndpoints.includes(endpoint)) {
      return new Response(JSON.stringify({ error: "Invalid endpoint" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://intervals.icu/api/v1/athlete/${integration.athlete_id}/${endpoint}?oldest=${oldest}&newest=${newest}`;
    const basicAuth = btoa(`API_KEY:${integration.api_key}`);

    const apiRes = await fetch(url, {
      headers: { Authorization: `Basic ${basicAuth}` },
    });

    if (!apiRes.ok) {
      const text = await apiRes.text();
      console.error("intervals.icu error:", apiRes.status, text);
      return new Response(JSON.stringify({ error: `intervals.icu returned ${apiRes.status}` }), {
        status: apiRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await apiRes.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("intervals-proxy error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
