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

const SYSTEM_PROMPT = `You are Kipcoachee, an elite AI running coach.
Recommend the best training philosophy for this athlete.
Available philosophies: 80_20_polarized, jack_daniels, lydiard, hansons, pfitzinger, kenyan_model
Return ONLY valid JSON, no other text:
{
  "primary": { "philosophy": string, "reason": string, "confidence": number },
  "alternatives": [
    { "philosophy": string, "reason": string },
    { "philosophy": string, "reason": string }
  ]
}`;

async function callGroq(answers: Record<string, unknown>): Promise<{ primary: unknown; alternatives: unknown[] } | null> {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) return null;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Athlete onboarding answers: ${JSON.stringify(answers)}` },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) {
    console.error("Groq error:", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "";
  return parsePhilosophyJson(content);
}

async function callGemini(answers: Record<string, unknown>): Promise<{ primary: unknown; alternatives: unknown[] } | null> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) return null;
  const prompt = `${SYSTEM_PROMPT}\n\nAthlete onboarding answers: ${JSON.stringify(answers)}`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
      }),
    }
  );
  if (!res.ok) {
    console.error("Gemini error:", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parsePhilosophyJson(content);
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

    const result = (await callGroq(answers)) ?? (await callGemini(answers));
    if (!result) {
      return new Response(
        JSON.stringify({
          error: "AI unavailable. Set GROQ_API_KEY or GEMINI_API_KEY in Supabase secrets.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
