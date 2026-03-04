import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are PaceIQ Coach — an elite-level AI running coach.
You have deep knowledge of Jack Daniels, Pfitzinger, Hansons, and modern periodization.
You speak in a direct, professional tone — like a real coach who knows the athlete personally.

Your responsibilities:
- Analyse training data, paces, HR zones, and weekly volume
- Build and adjust training plans based on the athlete's profile, goals, and readiness
- Provide recovery guidance based on HRV, sleep, and training load (CTL/ATL/TSB)
- Answer questions about pacing strategy, race-day nutrition, tapering, and injury prevention

Rules:
- Be concise. No fluff. Data-driven.
- Reference actual numbers from the athlete's profile and recent activities when available.
- If the athlete's intake questionnaire answers are provided, use them to personalize all advice.
- Use metric units (km, /km pace) unless the athlete specifies otherwise.
- When building plans, structure them week-by-week with specific sessions.
- Flag injury risks proactively when training load is high or readiness is low.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get auth token from request
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    // Create authenticated client to get user
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, intakeAnswers } = await req.json();

    // Fetch athlete context in parallel
    const [profileRes, readinessRes, activitiesRes] = await Promise.all([
      supabaseAdmin.from("athlete_profile").select("*").eq("user_id", user.id).maybeSingle(),
      supabaseAdmin.from("daily_readiness").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(7),
      supabaseAdmin.from("activity").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(10),
    ]);

    // Build context block
    let context = "";
    if (profileRes.data) {
      const p = profileRes.data;
      context += `\n\n## Athlete Profile\nName: ${p.name}\nVDOT: ${p.vdot ?? "unknown"}\nMax HR: ${p.max_hr ?? "unknown"}\nResting HR: ${p.resting_hr ?? "unknown"}\nPhilosophy: ${p.training_philosophy ?? "jack_daniels"}\nGoal Race: ${JSON.stringify(p.goal_race)}\nNarrative: ${p.narrative ?? "none"}\nPreferred Long Run Day: ${p.preferred_longrun_day ?? "Saturday"}`;
    }

    if (readinessRes.data && readinessRes.data.length > 0) {
      const latest = readinessRes.data[0];
      context += `\n\n## Latest Readiness (${latest.date})\nScore: ${latest.score}\nHRV: ${latest.hrv} (baseline: ${latest.hrv_baseline})\nSleep: ${latest.sleep_hours}h (quality: ${latest.sleep_quality}/10)\nResting HR: ${latest.resting_hr}\nCTL: ${latest.ctl} | ATL: ${latest.atl} | TSB: ${latest.tsb}\nSummary: ${latest.ai_summary ?? "none"}`;
    }

    if (activitiesRes.data && activitiesRes.data.length > 0) {
      context += `\n\n## Recent Activities (last ${activitiesRes.data.length})`;
      for (const a of activitiesRes.data) {
        const dur = a.duration_seconds ? `${Math.floor(a.duration_seconds / 60)}min` : "?";
        context += `\n- ${a.date}: ${a.type ?? "run"} ${a.distance_km ?? "?"}km in ${dur}, pace ${a.avg_pace ?? "?"}, HR ${a.avg_hr ?? "?"}/${a.max_hr ?? "?"}`;
      }
    }

    if (intakeAnswers) {
      context += `\n\n## Intake Questionnaire Answers\n${JSON.stringify(intakeAnswers, null, 2)}`;
    }

    const systemMessage = SYSTEM_PROMPT + (context ? `\n\n---\nATHLETE DATA:${context}` : "");

    // Call Lovable AI Gateway with streaming
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemMessage },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save user message to coach_message table (fire and forget)
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg?.role === "user") {
      supabaseAdmin.from("coach_message").insert({
        user_id: user.id,
        role: "user",
        content: lastUserMsg.content,
        triggered_by: "user",
      }).then(() => {});
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("coach-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
