import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AI_LIMITS } from "../_shared/ai-models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const anthropicKeys = () =>
  [Deno.env.get("ANTHROPIC_API_KEY"), Deno.env.get("ANTHROPIC_API_KEY_2"), Deno.env.get("ANTHROPIC_API_KEY_3")].filter(
    (k): k is string => !!k
  );
const groqKeys = () =>
  [Deno.env.get("GROQ_API_KEY"), Deno.env.get("GROQ_API_KEY_2"), Deno.env.get("GROQ_API_KEY_3")].filter(
    (k): k is string => !!k
  );
const geminiKeys = () =>
  [Deno.env.get("GEMINI_API_KEY"), Deno.env.get("GEMINI_API_KEY_2"), Deno.env.get("GEMINI_API_KEY_3")].filter(
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

function extractJson(content: string): string | null {
  const cleaned = content.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let str = cleaned.slice(start, end + 1);
  str = str.replace(/,(\s*[}\]])/g, "$1");
  try {
    JSON.parse(str);
    return str;
  } catch {
    return null;
  }
}

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  modelPreference: "haiku" | "sonnet"
): Promise<string | null> {
  const limits =
    modelPreference === "sonnet"
      ? AI_LIMITS.sessionSelector
      : AI_LIMITS.sessionSelectorHaiku;

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
          model: limits.model,
          max_tokens: limits.max_tokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          temperature: 0.4,
        }),
      }
    );
    if (res.status === 429) continue;
    if (!res.ok) {
      console.error("session-selector Anthropic error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const block = (json.content ?? []).find((b: { type: string }) => b.type === "text");
    const text = block?.text ?? "";
    const extracted = extractJson(text);
    if (extracted) return extracted;
  }
  return null;
}

async function callGroq(systemPrompt: string, userPrompt: string): Promise<string | null> {
  for (const key of groqKeys()) {
    const res = await fetchWith429Retry("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: AI_LIMITS.sessionSelector.max_tokens,
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) continue;
    if (!res.ok) {
      console.error("session-selector Groq error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    const extracted = extractJson(content);
    if (extracted) return extracted;
  }
  return null;
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const prompt = `${systemPrompt}\n\n${userPrompt}`;
  for (const key of geminiKeys()) {
    const res = await fetchWith429Retry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: AI_LIMITS.sessionSelector.max_tokens,
          },
        }),
      }
    );
    if (!res.ok) {
      console.error("session-selector Gemini error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const extracted = extractJson(content);
    if (extracted) return extracted;
  }
  return null;
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
    const systemPrompt = body?.systemPrompt ?? "";
    const userPrompt = body?.userPrompt ?? "";
    const modelPreference = body?.modelPreference === "sonnet" ? "sonnet" : "haiku";

    if (!systemPrompt || !userPrompt) {
      return new Response(
        JSON.stringify({ error: "systemPrompt and userPrompt are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content =
      (await callAnthropic(systemPrompt, userPrompt, modelPreference)) ??
      (await callGroq(systemPrompt, userPrompt)) ??
      (await callGemini(systemPrompt, userPrompt));

    if (!content) {
      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("session-selector error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
