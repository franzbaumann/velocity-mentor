import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AI_LIMITS } from "../_shared/ai-models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EXTRACTION_PROMPT =
  'Extract the following markers from this sports lab test report and return ONLY valid JSON, no other text: { "vo2max": number|null, "lactate_threshold_hr": number|null, "lactate_threshold_pace": string|null, "vlamax": number|null, "anaerobic_threshold_hr": number|null, "max_hr_measured": number|null, "test_date": string|null, "lab_name": string|null }';

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!ANTHROPIC_API_KEY && !GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Auth failed" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { pdf } = await req.json();
    if (!pdf || typeof pdf !== "string") {
      return new Response(JSON.stringify({ error: "No PDF provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let rawText = "";

    // USAGE: exempt — not counted against daily limit (lab report extraction, not coaching chat)
    // Priority: Claude (primary) → Gemini (fallback)
    if (ANTHROPIC_API_KEY) {
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: AI_LIMITS.labExtract.model,
          max_tokens: AI_LIMITS.labExtract.max_tokens,
          messages: [{
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: pdf },
              },
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          }],
        }),
      });

      if (claudeRes.ok) {
        const data = await claudeRes.json();
        rawText = data?.content?.[0]?.text?.trim() ?? "";
      } else {
        console.error("Claude error:", claudeRes.status, await claudeRes.text());
      }
    }

    if (!rawText && GEMINI_API_KEY) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType: "application/pdf", data: pdf } },
                { text: EXTRACTION_PROMPT },
              ],
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: AI_LIMITS.labExtract.max_tokens },
          }),
        },
      );

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      } else {
        console.error("Gemini error:", geminiRes.status, await geminiRes.text());
      }
    }

    if (!rawText) {
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: "Could not parse lab results", raw: rawText }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(jsonMatch[0]);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const updates: Record<string, unknown> = {};
    if (extracted.vo2max != null) updates.vo2max = Number(extracted.vo2max);
    if (extracted.lactate_threshold_hr != null) updates.lactate_threshold_hr = Number(extracted.lactate_threshold_hr);
    if (extracted.lactate_threshold_pace != null) updates.lactate_threshold_pace = String(extracted.lactate_threshold_pace);
    if (extracted.vlamax != null) updates.vlamax = Number(extracted.vlamax);
    if (extracted.max_hr_measured != null) updates.max_hr_measured = Number(extracted.max_hr_measured);
    if (extracted.test_date != null) updates.lab_test_date = String(extracted.test_date);
    if (extracted.lab_name != null) updates.lab_name = String(extracted.lab_name);

    if (Object.keys(updates).length > 0) {
      await supabaseAdmin.from("athlete_profile").update(updates).eq("user_id", user.id);
    }

    return new Response(JSON.stringify({ extracted, saved: Object.keys(updates).length > 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lab-extract error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
