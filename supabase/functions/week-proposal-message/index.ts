import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AI_LIMITS } from "../_shared/ai-models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Coach Cade, an elite AI running coach.
Write a weekly proposal message to your athlete.
Be direct, specific, and encouraging — like a real coach.
Reference actual data from their week.
Never be generic. Never use bullet points.
Maximum 60 words. No greetings like "Hi" or "Hey".`;

const anthropicKeys = () =>
  [Deno.env.get("ANTHROPIC_API_KEY"), Deno.env.get("ANTHROPIC_API_KEY_2"), Deno.env.get("ANTHROPIC_API_KEY_3")].filter(
    (k): k is string => !!k
  );

async function fetchWith429Retry(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  let res = await fetch(url, init);
  for (let r = 0; r < maxRetries && res.status === 429; r++) {
    await new Promise((x) => setTimeout(x, (5 + r * 5) * 1000));
    res = await fetch(url, init);
  }
  return res;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const weekSummary = body?.weekSummary ?? {};
    const proposalSessions = body?.proposalSessions ?? [];
    const athleteName = body?.athleteName ?? "";

    const prev = weekSummary.previousWeek ?? {};
    const prop = weekSummary.proposedWeek ?? {};
    const keySessions = proposalSessions
      .slice(0, 2)
      .map((s: { selectedSession?: { sessionName?: string } }) => s?.selectedSession?.sessionName ?? "")
      .filter(Boolean);

    const userPrompt = `Previous week: ${prev.actualKm ?? 0}km completed of ${prev.plannedKm ?? 0}km planned.
${prev.qualitySessions ?? 0} quality sessions completed.
HRV trend: ${prev.avgHRV ?? "—"}. TLS average: ${prev.avgTLS ?? "—"}.

Proposed week: ${prop.totalKm ?? 0}km, ${prop.qualitySessions ?? 0} quality sessions.
Phase: ${prop.phase ?? "—"}. Focus: ${prop.focus ?? "—"}.
Key sessions: ${keySessions.join(", ") || "—"}

Write the weekly proposal message.`;

    let message: string | null = null;
    for (const key of anthropicKeys()) {
      const res = await fetchWith429Retry(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: AI_LIMITS.weekProposalMessage.model,
            max_tokens: AI_LIMITS.weekProposalMessage.max_tokens,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userPrompt }],
          }),
        }
      );
      if (res.status === 429) continue;
      if (!res.ok) {
        console.error("week-proposal-message error:", res.status, await res.text());
        continue;
      }
      const json = await res.json();
      const block = (json.content ?? []).find((b: { type: string }) => b.type === "text");
      const text = block?.text?.trim();
      if (text) {
        message = text;
        break;
      }
    }

    if (!message) {
      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("week-proposal-message error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
