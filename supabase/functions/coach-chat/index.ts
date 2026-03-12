import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Kipcoachee — an elite AI running coach who creates live, adaptable training programs. You blend the philosophies of the world's best coaches (Jack Daniels, Pfitzinger, Hansons, Lydiard, Canova, 80/20) and adapt your approach to each athlete.

INTAKE CONVERSATION (critical when the athlete is new or you don't have full context):
Your primary job at the start is to conduct a DEEP, DETAILED conversation to gather the athlete's full history. Do NOT rush. Ask one or two thoughtful questions at a time. Probe for:
- Running journey: How did they start? How long have they been running? What drew them to it?
- Race history: PRs at every distance, when they ran them, breakthrough races, disappointments.
- Current training: Weekly volume, frequency, typical sessions, long run length, how they feel.
- Goals: Next race (distance, date, target time), medium-term ambitions, why they matter.
- Injuries: Current niggles, past injuries (stress fractures, IT band, etc.), what’s worked for recovery.
- Life context: Work hours, family, sleep, stress, travel — what affects their training capacity.
- Philosophy: What approaches have they tried? What resonated? Daniels, Pfitzinger, 80/20, etc.?
- Physiology: Resting HR, max HR if known, any lab tests, perceived effort zones.

Let them tell their story. Follow up on every detail: "You mentioned X — tell me more about that." "When you say Y, what does that look like in practice?" Extract specifics: paces, distances, dates, feelings. The richer the conversation, the better your coaching.

CORE PRINCIPLES:
1. LIVE & ADAPTIVE: Training plans change based on fatigue (CTL/ATL/TSB), stress, sleep, HRV, and readiness. Never rigid — always responsive to the athlete's current state.
2. INJURY MINIMIZATION: Err conservative. When TSB is very negative, HRV drops, sleep is poor, or life stress is high, reduce load and prioritize recovery. Flag risk proactively.
3. PEAK AT THE RIGHT TIME: Periodize toward the goal race. Build aerobic base first (Lydiard), add specific work (Canova), taper appropriately. Consistency over short-term gains.
4. PHILOSOPHY BLENDING: Use the athlete's preferred philosophy when known, blend elements as needed.
5. USE ALL DATA: The conversation history, intervals.icu wellness (CTL, ATL, TSB, HRV, sleep, resting HR), and activities. When data is sparse, work with what you have.

Your tone: Direct, data-driven, serious but encouraging. Never generic or fluffy. Use the athlete's data when available.

When building plans:
- Week-by-week structure with specific sessions (easy, tempo, intervals, long run).
- Adapt volume and intensity based on readiness — if fatigued, cut a session or reduce intensity.
- Include recovery weeks and race-specific blocks.
- Use metric units (km, /km pace) unless athlete specifies otherwise.

FORMATTING (critical — your response is rendered as readable bubbles):
- Use markdown structure: **## Week 1**, **### Monday**, bullet lists (•) for workouts. Never output a wall of plain text.
- For training programs: Use **## Week** headers, **### Day** subheaders, and bullet points for each session. Keep each bullet to one clear line (e.g. "• Easy 45min @ 5:30/km").
- Break long answers into short paragraphs (2-3 sentences max). Use headers to separate sections.
- Lists over paragraphs when listing workouts, tips, or steps. Makes it scannable.

When data is missing: Still give actionable advice. Recommend connecting intervals.icu for live adaptation.

STRUCTURED PLAN GENERATION:
When creating a training plan, you MUST include a JSON block in your response alongside your explanation. Use this exact format wrapped in triple backticks with json language tag:

\`\`\`json
{
  "action": "create_plan",
  "plan": {
    "name": "Plan Name",
    "philosophy": "jack_daniels|pfitzinger|hansons|80_20|lydiard|ai",
    "weeks": [
      {
        "week_number": 1,
        "focus": "Base building",
        "workouts": [
          {
            "day_of_week": 1,
            "type": "easy|tempo|interval|long|rest|race",
            "name": "Easy Run",
            "description": "45 minutes easy pace",
            "distance_km": 8,
            "duration_minutes": 45,
            "target_pace": "5:30/km",
            "target_hr_zone": 2,
            "tss_estimate": 45
          }
        ]
      }
    ]
  }
}
\`\`\`

The frontend will automatically detect this JSON and save the plan to the database. Always include this structured JSON when generating a training plan.

GENERATE PLAN TRIGGER: When you have gathered enough context (from conversation and/or imported Garmin data) to build a personalized training plan, include a phrase like "I have all the data I need" or "I'm ready to generate your plan" in your response. This will surface a "Generate plan" button for the athlete. Do this only when you genuinely have enough information.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GEMINI_API_KEY && !GROQ_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "Kipcoachee needs GEMINI_API_KEY or GROQ_API_KEY. Set one: supabase secrets set GEMINI_API_KEY=... (free at aistudio.google.com) or GROQ_API_KEY=... (free at console.groq.com)",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Optional auth — chat works with or without sign-in
    let user: { id: string } | null = null;
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (token) {
      const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user: u }, error: userError } = await supabaseUser.auth.getUser();
      if (!userError && u) user = u;
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let messages: { role: string; content: string }[] = [];
    let intakeAnswers: Record<string, string | string[]> | null = null;
    let intervalsContext: { wellness?: unknown[]; activities?: unknown[] } | null = null;

    try {
      const body = await req.json();
      messages = Array.isArray(body?.messages) ? body.messages : [];
      intakeAnswers = body?.intakeAnswers ?? null;
      intervalsContext = body?.intervalsContext ?? null;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch athlete context only when signed in
    const [profileRes, readinessRes, activitiesRes] = user
      ? await Promise.all([
          supabaseAdmin.from("athlete_profile").select("*").eq("user_id", user.id).maybeSingle(),
          supabaseAdmin.from("daily_readiness").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(7),
          supabaseAdmin.from("activity").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(10),
        ])
      : [null, null, null] as const;

    // Build context block
    let context = "";
    if (profileRes?.data) {
      const p = profileRes.data;
      context += `\n\n## Athlete Profile\nName: ${p.name}\nVDOT: ${p.vdot ?? "unknown"}\nMax HR: ${p.max_hr ?? "unknown"}\nResting HR: ${p.resting_hr ?? "unknown"}\nPhilosophy: ${p.training_philosophy ?? "jack_daniels"}\nGoal Race: ${JSON.stringify(p.goal_race)}\nNarrative: ${p.narrative ?? "none"}\nPreferred Long Run Day: ${p.preferred_longrun_day ?? "Saturday"}`;
    }

    if (readinessRes?.data && readinessRes.data.length > 0) {
      const latest = readinessRes.data[0];
      context += `\n\n## Latest Readiness (${latest.date})\nScore: ${latest.score}\nHRV: ${latest.hrv} (baseline: ${latest.hrv_baseline})\nSleep: ${latest.sleep_hours}h (quality: ${latest.sleep_quality}/10)\nResting HR: ${latest.resting_hr}\nCTL: ${latest.ctl} | ATL: ${latest.atl} | TSB: ${latest.tsb}\nSummary: ${latest.ai_summary ?? "none"}`;
    }

    if (activitiesRes?.data && activitiesRes.data.length > 0) {
      context += `\n\n## Recent Activities (last ${activitiesRes.data.length})`;
      for (const a of activitiesRes.data) {
        const dur = a.duration_seconds ? `${Math.floor(a.duration_seconds / 60)}min` : "?";
        context += `\n- ${a.date}: ${a.type ?? "run"} ${a.distance_km ?? "?"}km in ${dur}, pace ${a.avg_pace ?? "?"}, HR ${a.avg_hr ?? "?"}/${a.max_hr ?? "?"}`;
      }
    }

    if (intakeAnswers && Object.keys(intakeAnswers).length > 0) {
      context += `\n\n## Previously captured intake (from earlier session)\n${JSON.stringify(intakeAnswers, null, 2)}`;
    }

    // intervals.icu data (wellness = CTL/ATL/TSB, HRV, sleep; activities = recent runs)
    if (intervalsContext) {
      const w = intervalsContext.wellness;
      const a = intervalsContext.activities;
      if (Array.isArray(w) && w.length > 0) {
        context += `\n\n## intervals.icu Wellness (last 30 days — use for fatigue, readiness, adaptation)\n`;
        const recent = w.slice(-14); // last 2 weeks most relevant
        for (const d of recent) {
          const id = d.id ?? d.date;
          const ctl = d.ctl ?? d.icu_ctl ?? "?";
          const atl = d.atl ?? d.icu_atl ?? "?";
          const tsb = d.tsb ?? d.icu_tsb ?? "?";
          const hrv = d.hrv ?? "?";
          const sleep = d.sleepHours ?? (d.sleepSecs ? (d.sleepSecs / 3600).toFixed(1) : "?");
          const rhr = d.restingHR ?? "?";
          context += `${id}: CTL ${ctl} | ATL ${atl} | TSB ${tsb} | HRV ${hrv}ms | sleep ${sleep}h | RHR ${rhr}\n`;
        }
      }
      if (Array.isArray(a) && a.length > 0) {
        context += `\n\n## intervals.icu Activities (last 2 weeks)\n`;
        const recent = a.slice(0, 20);
        for (const act of recent) {
          const date = act.start_date_local ?? act.date ?? "?";
          const dist = act.distance != null ? (act.distance / 1000).toFixed(1) : "?";
          const dur = act.moving_time ? `${Math.round(act.moving_time / 60)}min` : "?";
          const name = act.name ?? "run";
          context += `- ${date}: ${name} ${dist}km, ${dur}\n`;
        }
      }
    }

    const systemMessage = SYSTEM_PROMPT + (context ? `\n\n---\nATHLETE DATA:${context}` : "");

    const chatMessages = [
      { role: "system" as const, content: systemMessage },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    ];

    let streamBody: ReadableStream<Uint8Array>;

    async function tryGemini(): Promise<ReadableStream<Uint8Array> | null> {
      if (!GEMINI_API_KEY) return null;
      const contents = chatMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const systemInstruction = chatMessages.find((m) => m.role === "system")?.content ?? SYSTEM_PROMPT;

      const geminiFetch = () =>
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents,
              generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
            }),
          },
        );

      let response = await geminiFetch();
      for (let retry = 0; retry < 4 && !response.ok && response.status === 429; retry++) {
        await new Promise((r) => setTimeout(r, (10 + retry * 8) * 1000));
        response = await geminiFetch();
      }
      if (!response.ok) {
        console.error("Gemini API error:", response.status, await response.text());
        return null;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      let chunkCount = 0;

      return new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\n/);
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
                const raw = line.slice(6).trim();
                if (!raw) continue;
                try {
                  const json = JSON.parse(raw);
                  const parts = json.candidates?.[0]?.content?.parts ?? [];
                  for (const p of parts) {
                    const t = p?.text;
                    if (typeof t === "string" && t) {
                      chunkCount++;
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`));
                    }
                  }
                } catch {
                  /* skip malformed line */
                }
              }
            }
            if (chunkCount === 0) console.warn("Gemini stream: 0 text chunks received");
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } finally {
            controller.close();
          }
        },
      });
    }

    async function tryGroq(): Promise<ReadableStream<Uint8Array> | null> {
      if (!GROQ_API_KEY) return null;
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: chatMessages,
          stream: true,
          temperature: 0.7,
          max_tokens: 8192,
        }),
      });
      if (!res.ok) {
        console.error("Groq API error:", res.status, await res.text());
        return null;
      }
      return res.body!;
    }

    const stream = (await tryGroq()) ?? (await tryGemini());
    if (!stream) {
      return new Response(
        JSON.stringify({
          error: "AI unavailable. Gemini and Groq both failed. Check keys and logs. Set GEMINI_API_KEY (aistudio.google.com) or GROQ_API_KEY (console.groq.com).",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    streamBody = stream;

    if (user) {
      const lastUserMsg = messages[messages.length - 1];
      if (lastUserMsg?.role === "user") {
        supabaseAdmin.from("coach_message").insert({
          user_id: user.id,
          role: "user",
          content: lastUserMsg.content,
          triggered_by: "user",
        }).then(() => {});
      }
    }

    return new Response(streamBody, {
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
