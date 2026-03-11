import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Kipcoachee — an elite AI running coach who creates live, adaptable training programs. You blend the philosophies of the world's best coaches (Jack Daniels, Pfitzinger, Hansons, Lydiard, Canova, 80/20) and adapt your approach to each athlete.

CRITICAL — KNOW YOUR ATHLETE BEFORE ANSWERING:
Before answering ANY question, mentally review ALL the context data provided (profile, plan, workouts, readiness, activities, PBs). You know this athlete — their name, goals, history, current fitness. NEVER ask questions you already have the answer to in the data. NEVER respond as if you don't know who you're talking to when you have their full profile.

When the athlete asks about a SPECIFIC WORKOUT or session:
1. Check if it appears in their current training plan workouts. If it does, you CREATED this workout.
2. Explain WHY this session is in the plan — what phase they're in, what physiological adaptation it targets (aerobic base, lactate threshold, VO2max, race specificity, recovery), and how it fits into the week's load pattern.
3. Reference their current CTL/ATL/TSB, recent activities, and readiness to explain why NOW is the right time for this session.
4. If it's an easy run: explain recovery purpose, aerobic development, keeping the engine running between harder sessions.
5. If it's a quality session: explain the training stimulus, expected adaptations, and how it connects to their race goal.
6. NEVER ask generic follow-up questions like "How are you feeling?" when you already have HRV, sleep, and readiness data. Use the data first.

ALWAYS START ANSWERS BY ANALYZING THE DATA:
- Open with your assessment based on their current state (CTL/TSB/readiness/recent sessions).
- Reference specific numbers: "Your CTL is X, TSB is Y, you ran Zkm yesterday at W pace."
- Be specific and personal, never generic.

INTAKE CONVERSATION (only when athlete is genuinely new — no profile data exists):
Conduct a DEEP conversation to gather the athlete's full history. Ask one or two questions at a time. Probe for:
- Running journey: How did they start? How long have they been running? What drew them to it?
- Race history: PRs at every distance, when they ran them, breakthrough races, disappointments.
- Current training: Weekly volume, frequency, typical sessions, long run length, how they feel.
- Goals: Next race (distance, date, target time), medium-term ambitions, why they matter.
- Injuries: Current niggles, past injuries (stress fractures, IT band, etc.), what’s worked for recovery.
- Life context: Work hours, family, sleep, stress, travel — what affects their training capacity.
- Philosophy: What approaches have they tried? What resonated? Daniels, Pfitzinger, 80/20, etc.?
- Physiology: Resting HR, max HR if known, any lab tests, perceived effort zones.

Let them tell their story. Follow up on every detail. Extract specifics: paces, distances, dates, feelings.

CORE PRINCIPLES:
1. LIVE & ADAPTIVE: Training plans change based on fatigue (CTL/ATL/TSB), stress, sleep, HRV, and readiness. Never rigid — always responsive to the athlete's current state.
2. INJURY MINIMIZATION: Err conservative. When TSB is very negative, HRV drops, sleep is poor, or life stress is high, reduce load and prioritize recovery. Flag risk proactively.
3. PEAK AT THE RIGHT TIME: Periodize toward the goal race. Build aerobic base first (Lydiard), add specific work (Canova), taper appropriately. Consistency over short-term gains.
4. PHILOSOPHY BLENDING: Use the athlete's preferred philosophy when known, blend elements as needed.
5. USE ALL DATA: The conversation history, intervals.icu wellness (CTL, ATL, TSB, HRV, sleep, resting HR), and activities. When data is sparse, work with what you have.

Your tone: Direct, data-driven, serious but encouraging. Never generic or fluffy. Use the athlete's data in every answer.

When building plans:
- Week-by-week structure with specific sessions (easy, tempo, intervals, long run).
- Adapt volume and intensity based on readiness — if fatigued, cut a session or reduce intensity.
- Include recovery weeks and race-specific blocks.
- Use metric units (km, /km pace) unless athlete specifies otherwise.

FORMATTING (critical — your response is rendered in a chat bubble):
- NEVER use ## or ### headers. They look ugly in chat bubbles. Instead use **bold text** for section titles on their own line.
- Use bullet lists (- or •) for workouts, tips, or steps. Keep each bullet to one clear line.
- For training programs: Use **bold** for week/day names (e.g. "**Week 1 — Base Building**"), then bullet points for each session (e.g. "- Easy 45min @ 5:30/km").
- Break long answers into short paragraphs (2-3 sentences max). Separate sections with a blank line and a bold title.
- Keep it conversational — you're chatting, not writing a document. Short, punchy, readable.

When data is missing: Still give actionable advice. Recommend connecting intervals.icu for live adaptation.

GOAL TIME REALISM:
- When the athlete states a goal time (e.g. marathon in 2:30), assess it against their data: recent race results, VDOT, weekly volume, best paces. If it is clearly unrealistic (e.g. 4:00 marathon for someone with 5:30/km easy pace and no recent races), tell them kindly and suggest a more achievable target with reasoning.
- Before they commit to a goal: Proactively recommend a target time based on their history, VDOT, recent activities, and readiness. Say "Based on your X, I'd suggest aiming for Y. Here's why."
- Use Jack Daniels VDOT equivalencies and training-load context. Be encouraging but honest.

PROACTIVE PLAN ADJUSTMENTS (critical — be proactive, not reactive):
When the athlete has an existing plan, PROPOSE concrete plan adjustments whenever you sense risk of injury or illness. Do NOT wait for them to ask "adjust my plan." Triggers include:
- Fatigue, tiredness, feeling run down after a hard week
- Any niggle, ache, or pain (Achilles, knee, shin, etc.)
- Negative TSB, low HRV, poor sleep, high life stress
- "Coming back from" illness, travel, or time off
- Overtraining signs: heavy legs, elevated RHR, low motivation

When any of these apply: 1) Explain your reasoning and the suggested changes. 2) Ask "Does this work for you?" 3) Include the adjust_plan JSON with ONLY the modified week(s). The user sees an "Apply to my plan" button.

CRITICAL — adjust_plan behavior:
- For injury/recovery (Achilles, niggle, fatigue, illness): Propose a SHORT recovery block (1–3 weeks) to get the athlete feeling good, then they RESUME their existing plan. Do NOT replace the whole plan.
- Include ONLY the weeks you are modifying in the JSON. E.g. if they're in week 5 and need recovery, output weeks 5 and 6 with reduced volume. The system will merge these into the existing plan — the rest of the plan stays intact.
- NEVER output a full replacement plan for adjust_plan. Only the modified weeks. Focus on: reduce load → recover → return to plan.

PLAN ADJUSTMENT FORMAT:
1. FIRST explain the suggested changes clearly — bullet points, headers, no raw code.
2. Ask for confirmation: "Does this work for you?" or "Want me to apply these changes?"
3. THEN include the JSON block. Use action "adjust_plan" when modifying an existing plan, "create_plan" for a brand new plan.
4. NEVER show raw JSON as the main content — always lead with clear explanation. The JSON is hidden and shown as an interactive Apply button.

STRUCTURED PLAN FORMAT (put at end of message, in \`\`\`json block):
\`\`\`json
{
  "action": "create_plan" or "adjust_plan",
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

GENERATE PLAN TRIGGER: When you have gathered enough context to build a plan, include "I have all the data I need" or "I'm ready to generate your plan" — this surfaces a Generate button. Do this only when you genuinely have enough information.`;

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
    const [profileRes, readinessRes, activitiesRes, planRes, workoutsRes, pbsRes] = user
      ? await Promise.all([
          supabaseAdmin.from("athlete_profile").select("*").eq("user_id", user.id).maybeSingle(),
          supabaseAdmin.from("daily_readiness").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(7),
          supabaseAdmin.from("activity").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(30),
          supabaseAdmin.from("training_plan").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabaseAdmin.from("training_plan_workout").select("*").eq("user_id", user.id).order("date", { ascending: true }).limit(200),
          supabaseAdmin.from("personal_records").select("distance, date_achieved, best_time_seconds, best_pace").eq("user_id", user.id).order("date_achieved", { ascending: false }).limit(20),
        ])
      : [null, null, null, null, null, null] as const;

    // Build context block
    let context = "";
    if (profileRes?.data) {
      const p = profileRes.data;
      context += `\n\n## Athlete Profile\nName: ${p.name}\nVDOT: ${p.vdot ?? "unknown"}\nMax HR: ${p.max_hr ?? "unknown"}\nResting HR: ${p.resting_hr ?? "unknown"}\nPhilosophy: ${p.training_philosophy ?? p.philosophy ?? "jack_daniels"}\nGoal Race: ${p.goal_race_name ?? p.goal_race ?? "none"}\nGoal Date: ${p.goal_race_date ?? "none"}\nGoal Time: ${p.goal_time ?? "none"}\nDays/week: ${p.days_per_week ?? "?"}\nNarrative: ${p.narrative ?? "none"}\nPreferred Long Run Day: ${p.preferred_longrun_day ?? "Saturday"}`;
      if (p.onboarding_answers && typeof p.onboarding_answers === "object") {
        context += `\n\n## PaceIQ Onboarding (goals, fitness, injuries, history)\n${JSON.stringify(p.onboarding_answers, null, 2)}`;
      }
    }

    if (planRes?.data) {
      const plan = planRes.data;
      context += `\n\n## Current Training Plan\nName: ${plan.plan_name ?? "Training Plan"}\nPhilosophy: ${plan.philosophy ?? "?"}\nStart: ${plan.start_date ?? "?"}\nEnd: ${plan.end_date ?? "?"}\nTotal weeks: ${plan.total_weeks ?? "?"}\nPeak km/week: ${plan.peak_weekly_km ?? "?"}`;
    }

    if (workoutsRes?.data && workoutsRes.data.length > 0 && planRes?.data) {
      const planId = planRes.data.id;
      const planWorkouts = workoutsRes.data.filter((w) => w.plan_id === planId);
      if (planWorkouts.length > 0) {
        const today = new Date().toISOString().slice(0, 10);

        // Full plan structure — the coach needs to understand the whole periodization
        const byWeek = new Map<number, typeof planWorkouts>();
        for (const w of planWorkouts) {
          const wn = w.week_number ?? 0;
          if (!byWeek.has(wn)) byWeek.set(wn, []);
          byWeek.get(wn)!.push(w);
        }
        const sortedWeeks = [...byWeek.keys()].sort((a, b) => a - b);
        context += `\n\n## Full Training Plan Structure (YOU created these sessions — explain their purpose when asked)\n`;
        for (const wn of sortedWeeks) {
          const weekWorkouts = byWeek.get(wn)!;
          const weekFocus = weekWorkouts[0]?.week_focus ?? "";
          const weekKm = weekWorkouts.reduce((s, w) => s + (w.distance_km ?? 0), 0);
          const isPast = weekWorkouts.every((w) => String(w.date ?? "").slice(0, 10) < today);
          const isCurrent = weekWorkouts.some((w) => {
            const d = String(w.date ?? "").slice(0, 10);
            const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            return d >= today && d <= weekEnd;
          });
          const marker = isCurrent ? " ← CURRENT WEEK" : isPast ? " (done)" : "";
          context += `\n### Week ${wn}${weekFocus ? ` — ${weekFocus}` : ""} (~${Math.round(weekKm)}km)${marker}\n`;
          for (const w of weekWorkouts) {
            const d = w.date ? String(w.date).slice(0, 10) : "?";
            const done = w.completed ? " ✓" : "";
            context += `- ${d}: ${w.name ?? w.type ?? "workout"} ${w.distance_km ? `${w.distance_km}km` : ""} ${w.duration_minutes ? `${w.duration_minutes}min` : ""} ${w.target_pace ? `@${w.target_pace}` : ""} (${w.type ?? "easy"})${done}\n`;
          }
        }
        context += `\nFor injury/recovery adjust_plan, output ONLY the week(s) you are modifying.\n`;
      }
    }

    if (readinessRes?.data && readinessRes.data.length > 0) {
      const latest = readinessRes.data[0] as { date: string; score?: number | null; hrv?: number | null; hrv_baseline?: number | null; sleep_hours?: number | null; sleep_quality?: number | null; resting_hr?: number | null; ctl?: number | null; atl?: number | null; tsb?: number | null; icu_ctl?: number | null; icu_atl?: number | null; icu_tsb?: number | null; ai_summary?: string | null };
      const ctl = latest.ctl ?? latest.icu_ctl ?? null;
      const atl = latest.atl ?? latest.icu_atl ?? null;
      const tsb = latest.tsb ?? latest.icu_tsb ?? (ctl != null && atl != null ? ctl - atl : null);
      context += `\n\n## Latest Readiness (${latest.date})\nScore: ${latest.score}\nHRV: ${latest.hrv} (baseline: ${latest.hrv_baseline})\nSleep: ${latest.sleep_hours}h (quality: ${latest.sleep_quality}/10)\nResting HR: ${latest.resting_hr}\nCTL: ${ctl} | ATL: ${atl} | TSB: ${tsb}\nSummary: ${latest.ai_summary ?? "none"}`;
    }

    if (activitiesRes?.data && activitiesRes.data.length > 0) {
      context += `\n\n## Recent Activities (last ${activitiesRes.data.length})`;
      for (const a of activitiesRes.data) {
        const dur = a.duration_seconds ? `${Math.floor(a.duration_seconds / 60)}min` : "?";
        context += `\n- ${a.date}: ${a.type ?? "run"} ${a.distance_km ?? "?"}km in ${dur}, pace ${a.avg_pace ?? "?"}, HR ${a.avg_hr ?? "?"}/${a.max_hr ?? "?"}`;
      }
    }

    if (pbsRes?.data && pbsRes.data.length > 0) {
      context += `\n\n## Personal Bests (celebrate these when relevant)`;
      const marathonPbs = (pbsRes.data as { distance?: string; date_achieved?: string }[]).filter((p) => /marathon|42/i.test(String(p.distance ?? "")));
      if (marathonPbs.length > 0) {
        context += `\nMarathon PB(s): ${marathonPbs.map((p) => `${p.date_achieved ?? "?"} — ${p.distance ?? "?"}`).join("; ")}. When the athlete mentions a marathon or marathon PB, acknowledge it as a major milestone.`;
      }
      for (const p of (pbsRes.data as { distance?: string; date_achieved?: string; best_time_seconds?: number }[]).slice(0, 10)) {
        const timeStr = p.best_time_seconds ? `${Math.floor(p.best_time_seconds / 60)}:${String(p.best_time_seconds % 60).padStart(2, "0")}` : "?";
        context += `\n- ${p.distance ?? "?"}: ${timeStr} (${p.date_achieved ?? "?"})`;
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
        context += `\n\n## intervals.icu Activities (last 16 weeks)\n`;
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
