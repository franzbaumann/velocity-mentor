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

    const baseUrl = getVitalBaseUrl();
    const clientUserId = user.id;

    let vitalUserId: string;

    const resolveRes = await fetch(
      `${baseUrl}/v2/user/resolve/${encodeURIComponent(clientUserId)}`,
      {
        headers: {
          "x-vital-api-key": apiKey,
          Accept: "application/json",
        },
      }
    );

    if (resolveRes.ok) {
      const resolveData = (await resolveRes.json()) as { user_id?: string };
      vitalUserId = resolveData.user_id ?? "";
    } else if (resolveRes.status === 404) {
      const createRes = await fetch(`${baseUrl}/v2/user/`, {
        method: "POST",
        headers: {
          "x-vital-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ client_user_id: clientUserId }),
      });
      if (!createRes.ok) {
        const err = await createRes.text();
        console.error("[vital-link-token] create user error:", createRes.status, err);
        return json({ error: "Failed to create Vital user", detail: err, request_id: requestId }, 500);
      }
      const createData = (await createRes.json()) as { user_id?: string };
      vitalUserId = createData.user_id ?? "";
    } else {
      const err = await resolveRes.text();
      console.error("[vital-link-token] resolve user error:", resolveRes.status, err);
      return json({ error: "Failed to resolve Vital user", detail: err, request_id: requestId }, 500);
    }

    if (!vitalUserId) return json({ error: "No Vital user ID", request_id: requestId }, 500);

    const body = (await req.json().catch(() => ({}))) as { redirect_url?: string };
    let redirectUrl = typeof body.redirect_url === "string" ? body.redirect_url.trim() : undefined;
    if (redirectUrl) {
      redirectUrl = redirectUrl + (redirectUrl.includes("?") ? "&" : "?") + `vital_user_id=${encodeURIComponent(vitalUserId)}`;
    }

    const tokenPayload: Record<string, unknown> = { user_id: vitalUserId };
    if (redirectUrl) tokenPayload.redirect_url = redirectUrl;

    const tokenRes = await fetch(`${baseUrl}/v2/link/token`, {
      method: "POST",
      headers: {
        "x-vital-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(tokenPayload),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("[vital-link-token] link token error:", tokenRes.status, err);
      return json({ error: "Failed to generate link token", detail: err, request_id: requestId }, 500);
    }

    const tokenData = (await tokenRes.json()) as { link_token?: string; link_web_url?: string };
    const linkWebUrl = tokenData.link_web_url ?? tokenData.link_token;

    if (!linkWebUrl) return json({ error: "No link URL in response", request_id: requestId }, 500);

    return json({ link_token: tokenData.link_token, link_web_url: linkWebUrl, request_id: requestId });
  } catch (e) {
    console.error("[vital-link-token] Error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
