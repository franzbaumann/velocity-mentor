import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PHILOSOPHIES = [
  "80_20_polarized",
  "jack_daniels",
  "lydiard",
  "hansons",
  "pfitzinger",
  "kenyan_model",
];

const SYSTEM_PROMPT = `You are Coach Cade — an elite AI running coach built into Cade.
Recommend the best training philosophy for this athlete based on their data.
Available philosophies: 80_20_polarized, jack_daniels, lydiard, hansons, pfitzinger, kenyan_model
Return ONLY valid JSON, no other text:
{
  "primary": { "philosophy": string, "reason": string, "confidence": number },
  "alternatives": [
    { "philosophy": string, "reason": string },
    { "philosophy": string, "reason": string }
  ]
}`;

type ApiResult = { ok: { primary: unknown; alternatives: unknown[] } } | { rateLimit: true } | null;

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

async function callClaude(answers: Record<string, unknown>): Promise<ApiResult> {
  const prompt = `Athlete onboarding answers: ${JSON.stringify(answers)}`;
  let last429 = false;
  for (const key of anthropicKeys()) {
    const url = "https://api.anthropic.com/v1/messages";
    const init: RequestInit = {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    };
    const res = await fetchWith429Retry(url, init);
    if (res.status === 429) {
      last429 = true;
      continue;
    }
    if (!res.ok) {
      console.error("Claude error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const block = (json.content ?? []).find((b: { type: string }) => b.type === "text");
    const content = block?.text ?? "";
    const parsed = parsePhilosophyJson(content);
    return parsed ? { ok: parsed } : null;
  }
  return last429 ? { rateLimit: true } : null;
}

async function callGroq(answers: Record<string, unknown>): Promise<ApiResult> {
  let last429 = false;
  for (const key of groqKeys()) {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const init: RequestInit = {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Athlete onboarding answers: ${JSON.stringify(answers)}` },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      }),
    };
    const res = await fetchWith429Retry(url, init);
    if (res.status === 429) {
      last429 = true;
      continue;
    }
    if (!res.ok) {
      console.error("Groq error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = parsePhilosophyJson(content);
    return parsed ? { ok: parsed } : null;
  }
  return last429 ? { rateLimit: true } : null;
}

async function callGemini(answers: Record<string, unknown>): Promise<ApiResult> {
  const prompt = `${SYSTEM_PROMPT}\n\nAthlete onboarding answers: ${JSON.stringify(answers)}`;
  let last429 = false;
  for (const key of geminiKeys()) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`;
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2000 },
      }),
    };
    const res = await fetchWith429Retry(url, init);
    if (res.status === 429) {
      last429 = true;
      continue;
    }
    if (!res.ok) {
      console.error("Gemini error:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = parsePhilosophyJson(content);
    return parsed ? { ok: parsed } : null;
  }
  return last429 ? { rateLimit: true } : null;
}

function parsePhilosophyJson(content: string): { primary: unknown; alternatives: unknown[] } | null {
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!parsed.primary || !Array.isArray(parsed.alternatives)) return null;
    if (!PHILOSOPHIES.includes(parsed.primary.philosophy)) {
      parsed.primary.philosophy = PHILOSOPHIES[0];
    }
    return parsed;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const answers = body?.answers ?? body?.onboardingAnswers ?? {};

    // Priority: Claude (primary) → Groq → Gemini
    const claudeResult = await callClaude(answers);
    const groqResult = claudeResult?.ok ? null : await callGroq(answers);
    const geminiResult = (claudeResult ?? groqResult)?.ok ? null : await callGemini(answers);
    const final = claudeResult ?? groqResult ?? geminiResult;
    const result = final && "ok" in final ? final.ok : null;
    const rateLimit = final && "rateLimit" in final && final.rateLimit;
    if (!result) {
      const errMsg = rateLimit
        ? "Rate limit reached. Try again in 15–60 minutes, or add more API keys."
        : "AI service temporarily unavailable.";
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: rateLimit ? 429 : 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("paceiq-philosophy error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
