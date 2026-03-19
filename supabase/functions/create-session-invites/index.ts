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

const SYSTEM_PROMPT_N = `You are Coach Cade — an elite AI running coach built into Cade.
You are merging N athletes' planned workouts for a shared training session.

RULES:
1. No athlete does MORE intensity than their original plan called for.
2. Maximize shared running time (warm-up, cool-down, easy portions together).
3. Keep it fun and social — this is about training together.
4. If workouts are similar (all easy runs), merge into one shared session at the slowest athlete's pace.
5. If some have quality work and others have easy, the easy runners do their easy km alongside the quality runners' warm-up/cool-down, then jog or rest during intervals.
6. For parallel mode: keep individual rep structures but align rest periods and share warm-up/cool-down.
7. GOAL-AWARE: Use each athlete's goal_distance, goal_time, VDOT, and LT pace. Respect different training intensities.
8. When all have rest or no planned workout, suggest a shared easy run at the slowest athlete's pace.

Return ONLY valid JSON. Use "athletes" array for 3+ athletes, or "athlete_a" and "athlete_b" for 2 athletes:

For 2 athletes:
{
  "summary": "Brief 1-2 sentence description",
  "shared_warmup": "e.g. 2 km easy together",
  "shared_cooldown": "e.g. 1.5 km easy together",
  "athlete_a": { "name": "...", "original_workout": "...", "adapted_workout": "..." },
  "athlete_b": { "name": "...", "original_workout": "...", "adapted_workout": "..." },
  "notes": "..."
}

For 3+ athletes:
{
  "summary": "Brief 1-2 sentence description",
  "shared_warmup": "e.g. 2 km easy together",
  "shared_cooldown": "e.g. 1.5 km easy together",
  "athletes": [
    { "name": "...", "original_workout": "...", "adapted_workout": "..." }
  ],
  "notes": "..."
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as {
    toUsers?: string[];
    proposedDate?: string;
    message?: string;
    inviteType?: "combined" | "parallel";
    fromWorkoutId?: string | null;
  };

  const toUsers = body.toUsers ?? [];
  const proposedDate = body.proposedDate;
  const message = body.message ?? null;
  const inviteType = (body.inviteType ?? "combined") as "combined" | "parallel";
  const fromWorkoutId = body.fromWorkoutId ?? null;

  if (!toUsers.length || !proposedDate) {
    return json({ error: "toUsers and proposedDate required" }, 400);
  }

  const uniqueToUsers = [...new Set(toUsers)].filter((id) => id !== user.id);
  if (uniqueToUsers.length === 0) {
    return json({ error: "No valid friends to invite" }, 400);
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: session, error: sessionErr } = await admin
    .from("workout_session")
    .insert({
      from_user: user.id,
      proposed_date: proposedDate,
      message,
      invite_type: inviteType,
    })
    .select("id")
    .single();

  if (sessionErr || !session) {
    console.error("[create-session-invites] Failed to create session", sessionErr);
    return json({ error: sessionErr?.message ?? "Failed to create session" }, 500);
  }

  const sessionId = session.id;

  const invitesToInsert = uniqueToUsers.map((toUser) => ({
    from_user: user.id,
    to_user: toUser,
    proposed_date: proposedDate,
    message,
    invite_type: inviteType,
    from_workout_id: fromWorkoutId,
    session_id: sessionId,
  }));

  const { data: invites, error: invitesErr } = await admin
    .from("workout_invite")
    .insert(invitesToInsert)
    .select("id");

  if (invitesErr || !invites?.length) {
    console.error("[create-session-invites] Failed to create invites", invitesErr);
    await admin.from("workout_session").delete().eq("id", sessionId);
    return json({ error: invitesErr?.message ?? "Failed to create invites" }, 500);
  }

  const userIds = [user.id, ...uniqueToUsers];
  const profiles = await Promise.all(
    userIds.map((uid) =>
      admin.from("athlete_profile")
        .select("name, goal_distance, goal_time, lactate_threshold_pace, vdot")
        .eq("user_id", uid)
        .maybeSingle()
    )
  );

  const plans = await Promise.all(
    userIds.map((uid) =>
      admin.from("training_plan")
        .select("id")
        .eq("user_id", uid)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    )
  );

  const workoutDescs: string[] = [];
  for (let i = 0; i < userIds.length; i++) {
    const plan = plans[i]?.data ?? null;
    const workouts = plan
      ? await admin.from("training_plan_workout")
          .select("id, type, name, description, distance_km, duration_minutes, target_pace, key_focus, structure_detail")
          .eq("plan_id", plan.id)
          .eq("date", proposedDate)
          .limit(3)
      : { data: [] };
    const desc = (workouts.data ?? []).map((w) => {
      const parts = [w.type, w.name, w.description, w.distance_km ? `${w.distance_km}km` : null, w.duration_minutes ? `${w.duration_minutes}min` : null, w.target_pace ? `@${w.target_pace}` : null, w.structure_detail].filter(Boolean);
      return parts.join(" · ");
    }).join(" | ") || "Rest day / no planned workout";
    workoutDescs.push(desc);
  }

  const names = userIds.map((uid, i) => profiles[i].data?.name ?? `Athlete ${String.fromCharCode(65 + i)}`);

  const athleteBlocks = userIds.map((_, i) => {
    const p = profiles[i].data;
    return `Athlete ${String.fromCharCode(65 + i)} (${names[i]}):
- Goal: ${p?.goal_distance ?? "general fitness"} ${p?.goal_time ? `in ${p.goal_time}` : ""}
- LT pace: ${p?.lactate_threshold_pace ?? "unknown"}
- VDOT: ${p?.vdot ?? "unknown"}
- Planned workout: ${workoutDescs[i]}`;
  }).join("\n\n");

  const userPrompt = `Create a ${inviteType} workout session for ${proposedDate} with ${userIds.length} athletes.

${athleteBlocks}

Mode: ${inviteType === "parallel" ? "PARALLEL — they do their own reps but share warm-up, cool-down, and match rest periods where possible." : "COMBINED — merge into one shared session that respects all plans."}`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT_N },
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
        max_tokens: 1500,
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
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT_N }] },
            generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
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

  let combined: Record<string, unknown>;
  if (text) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      combined = JSON.parse(jsonMatch?.[0] ?? text);
    } catch {
      combined = {
        summary: text,
        athletes: userIds.map((_, i) => ({
          name: names[i],
          original_workout: workoutDescs[i],
          adapted_workout: workoutDescs[i],
        })),
      };
    }
  } else {
    combined = {
      summary: "Combined session — Coach Cade will generate details shortly.",
      athletes: userIds.map((_, i) => ({
        name: names[i],
        original_workout: workoutDescs[i],
        adapted_workout: workoutDescs[i],
      })),
    };
  }

  await admin.from("workout_session").update({ combined_workout: combined }).eq("id", sessionId);

  for (const inv of invites) {
    await admin.from("workout_invite").update({ combined_workout: combined }).eq("id", inv.id);
  }

  return json({ ok: true, session_id: sessionId, invite_ids: invites.map((i) => i.id) });
  } catch (e) {
    console.error("[create-session-invites] Error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
