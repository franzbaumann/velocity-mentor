import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchWith429Retry(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  let res = await fetch(url, init);
  for (let r = 0; r < maxRetries && res.status === 429; r++) {
    await new Promise((x) => setTimeout(x, (5 + r * 5) * 1000));
    res = await fetch(url, init);
  }
  return res;
}

const groqKeys = () =>
  [Deno.env.get("GROQ_API_KEY"), Deno.env.get("GROQ_API_KEY_2"), Deno.env.get("GROQ_API_KEY_3")].filter(
    (k): k is string => !!k
  );

const geminiKeys = () =>
  [Deno.env.get("GEMINI_API_KEY"), Deno.env.get("GEMINI_API_KEY_2"), Deno.env.get("GEMINI_API_KEY_3")].filter(
    (k): k is string => !!k
  );

const SYSTEM_PROMPT = `You are Coach Cade — an elite AI running coach built into Cade.
You are merging two athletes' planned workouts for a shared training session.

RULES:
1. No athlete does MORE intensity than their original plan called for.
2. Maximize shared running time (warm-up, cool-down, easy portions together).
3. Keep it fun and social — this is about training together.
4. If workouts are similar (both easy runs), merge into one shared session at the slower athlete's pace.
5. If one has quality work and the other has easy, the easy runner does their easy km alongside the quality runner's warm-up/cool-down, then jogs or rests during the other's intervals.
6. For parallel mode (track sessions): keep individual rep structures but align rest periods and share warm-up/cool-down.
7. GOAL-AWARE: Use each athlete's goal_distance, goal_time, VDOT, and LT pace to choose pacing. If one is training for a marathon and the other is a 5K runner, respect their different training intensities. Prefer the session that aligns with both athletes' goals when possible.
8. When both have rest or no planned workout, suggest a shared easy run at the slower athlete's pace.

Return ONLY valid JSON:
{
  "summary": "Brief 1-2 sentence description of the combined session",
  "shared_warmup": "e.g. 2 km easy together",
  "shared_cooldown": "e.g. 1.5 km easy together",
  "athlete_a": {
    "name": "Athlete A's name",
    "original_workout": "what they had planned",
    "adapted_workout": "what they'll do in the combined session"
  },
  "athlete_b": {
    "name": "Athlete B's name",
    "original_workout": "what they had planned",
    "adapted_workout": "what they'll do in the combined session"
  },
  "notes": "Any coaching notes about pacing, meeting points during the session, etc."
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const body = (await req.json().catch(() => ({}))) as {
    type?: string;
    table?: string;
    record?: {
      id?: string;
      from_user?: string;
      to_user?: string;
      proposed_date?: string;
      invite_type?: "combined" | "parallel";
    };
  };

  if (body.type !== "INSERT" || body.table !== "workout_invite" || !body.record?.id) {
    console.error("[on-invite-created] Invalid payload", { type: body.type, table: body.table });
    return json({ error: "Invalid webhook payload" }, 400);
  }

  const record = body.record;
  if ((record as { session_id?: string | null }).session_id) {
    return json({ ok: true, skipped: "Handled by create-session-invites" });
  }

  const inviteId = record.id;
  const fromUser = record.from_user;
  const toUser = record.to_user;
  const dateStr = record.proposed_date;
  const mode = (record.invite_type ?? "combined") as "combined" | "parallel";

  if (!fromUser || !toUser || !dateStr) {
    console.error("[on-invite-created] Missing required fields", record);
    return json({ error: "Missing from_user, to_user, or proposed_date" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const [profileA, profileB] = await Promise.all([
    admin.from("athlete_profile")
      .select("name, goal_distance, goal_time, lactate_threshold_pace, vdot")
      .eq("user_id", fromUser)
      .maybeSingle(),
    admin.from("athlete_profile")
      .select("name, goal_distance, goal_time, lactate_threshold_pace, vdot")
      .eq("user_id", toUser)
      .maybeSingle(),
  ]);

  const nameA = profileA.data?.name ?? "Athlete A";
  const nameB = profileB.data?.name ?? "Athlete B";

  const [planA, planB] = await Promise.all([
    admin.from("training_plan").select("id").eq("user_id", fromUser).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("training_plan").select("id").eq("user_id", toUser).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const [workoutsA, workoutsB] = await Promise.all([
    planA.data
      ? admin.from("training_plan_workout")
          .select("id, type, name, description, distance_km, duration_minutes, target_pace, key_focus, structure_detail")
          .eq("plan_id", planA.data.id)
          .eq("date", dateStr)
          .limit(3)
      : Promise.resolve({ data: [] }),
    planB.data
      ? admin.from("training_plan_workout")
          .select("id, type, name, description, distance_km, duration_minutes, target_pace, key_focus, structure_detail")
          .eq("plan_id", planB.data.id)
          .eq("date", dateStr)
          .limit(3)
      : Promise.resolve({ data: [] }),
  ]);

  const workoutDescA = (workoutsA.data ?? []).map((w) => {
    const parts = [w.type, w.name, w.description, w.distance_km ? `${w.distance_km}km` : null, w.duration_minutes ? `${w.duration_minutes}min` : null, w.target_pace ? `@${w.target_pace}` : null, w.structure_detail].filter(Boolean);
    return parts.join(" · ");
  }).join(" | ") || "Rest day / no planned workout";

  const workoutDescB = (workoutsB.data ?? []).map((w) => {
    const parts = [w.type, w.name, w.description, w.distance_km ? `${w.distance_km}km` : null, w.duration_minutes ? `${w.duration_minutes}min` : null, w.target_pace ? `@${w.target_pace}` : null, w.structure_detail].filter(Boolean);
    return parts.join(" · ");
  }).join(" | ") || "Rest day / no planned workout";

  const userPrompt = `Create a ${mode} workout session for ${dateStr}.

Athlete A: ${nameA}
- Goal: ${profileA.data?.goal_distance ?? "general fitness"} ${profileA.data?.goal_time ? `in ${profileA.data.goal_time}` : ""}
- LT pace: ${profileA.data?.lactate_threshold_pace ?? "unknown"}
- VDOT: ${profileA.data?.vdot ?? "unknown"}
- Planned workout: ${workoutDescA}

Athlete B: ${nameB}
- Goal: ${profileB.data?.goal_distance ?? "general fitness"} ${profileB.data?.goal_time ? `in ${profileB.data.goal_time}` : ""}
- LT pace: ${profileB.data?.lactate_threshold_pace ?? "unknown"}
- VDOT: ${profileB.data?.vdot ?? "unknown"}
- Planned workout: ${workoutDescB}

Mode: ${mode === "parallel" ? "PARALLEL — they do their own reps but share warm-up, cool-down, and match rest periods where possible." : "COMBINED — merge into one shared session that respects both plans."}`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  let text: string | null = null;

  for (const key of groqKeys()) {
    const res = await fetchWith429Retry("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.4,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });
    if (res.ok) {
      const j = await res.json();
      text = j.choices?.[0]?.message?.content?.trim() ?? null;
      if (text) break;
    }
  }

  if (!text) {
    for (const key of geminiKeys()) {
      const contents = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const res = await fetchWith429Retry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            generationConfig: { temperature: 0.4, maxOutputTokens: 1000 },
          }),
        }
      );
      if (res.ok) {
        const j = await res.json();
        text = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
        if (text) break;
      }
    }
  }

  if (!text) {
    console.error("[on-invite-created] AI service unavailable for invite", inviteId);
    return json({ error: "AI service unavailable" }, 503);
  }

  let combined: Record<string, unknown>;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    combined = JSON.parse(jsonMatch?.[0] ?? text);
  } catch {
    combined = { summary: text, athlete_a: { name: nameA, workout: workoutDescA }, athlete_b: { name: nameB, workout: workoutDescB } };
  }

  const { error } = await admin
    .from("workout_invite")
    .update({ combined_workout: combined })
    .eq("id", inviteId);

  if (error) {
    console.error("[on-invite-created] Failed to update invite", inviteId, error);
    return json({ error: "Failed to update invite" }, 500);
  }

  console.log("[on-invite-created] Generated combined workout for invite", inviteId);
  return json({ ok: true, invite_id: inviteId });
});
