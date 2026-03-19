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

function getVitalBaseUrl(): string {
  const region = Deno.env.get("VITAL_REGION") ?? "us";
  const env = Deno.env.get("VITAL_ENVIRONMENT") ?? "production";
  const host = env === "sandbox" ? `api.sandbox.${region}.junction.com` : `api.${region}.junction.com`;
  return `https://${host}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header", request_id: requestId }, 401);

    const apiKey = Deno.env.get("VITAL_API_KEY");
    if (!apiKey) return json({ error: "Vital API key not configured", request_id: requestId }, 500);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", "").trim()
    );
    if (userError || !user) return json({ error: "Unauthorized", request_id: requestId }, 401);

    const body = (await req.json().catch(() => ({}))) as { vital_user_id?: string };
    const vitalUserId = typeof body.vital_user_id === "string" ? body.vital_user_id.trim() : "";
    if (!vitalUserId) return json({ error: "Missing vital_user_id", request_id: requestId }, 400);

    const baseUrl = getVitalBaseUrl();
    const resolveRes = await fetch(
      `${baseUrl}/v2/user/resolve/${encodeURIComponent(user.id)}`,
      {
        headers: { "x-vital-api-key": apiKey, Accept: "application/json" },
      }
    );
    if (!resolveRes.ok) {
      const detail = await resolveRes.text().catch(() => "");
      console.error("[vital-oauth-callback] resolve error:", resolveRes.status, detail);
      return json({ error: "Could not verify Vital user", detail, request_id: requestId }, 400);
    }
    const resolveData = (await resolveRes.json()) as { user_id?: string };
    if (resolveData.user_id !== vitalUserId) {
      return json({ error: "Vital user ID does not match", request_id: requestId }, 403);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: upsertErr } = await supabase
      .from("integrations")
      .upsert(
        {
          user_id: user.id,
          provider: "vital",
          athlete_id: vitalUserId,
          api_key: "",
        },
        { onConflict: "user_id,provider" }
      );
    if (upsertErr) {
      console.error("[vital-oauth-callback] upsert error:", upsertErr);
      return json({ error: "Failed to save connection", detail: upsertErr.message, request_id: requestId }, 500);
    }

    return json({ ok: true, request_id: requestId });
  } catch (e) {
    console.error("[vital-oauth-callback] Error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
