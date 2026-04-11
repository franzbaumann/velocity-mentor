import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const QUALITY_TYPES = new Set(["tempo", "interval", "intervals", "long", "race", "threshold", "vo2max", "repetition"]);

function getWeekBounds(dateStr: string): { start: string; end: string } {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Auth: verify caller is a logged-in user.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser(
    authHeader.replace("Bearer ", "").trim(),
  );
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as { invite_id?: string };
  const { invite_id } = body;
  if (!invite_id) return json({ error: "invite_id required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: invite } = await admin
    .from("workout_invite")
    .select("from_user, to_user, proposed_date, status, combined_workout")
    .eq("id", invite_id)
    .maybeSingle();

  if (!invite) return json({ error: "Invite not found" }, 404);
  if (invite.status !== "accepted") return json({ error: "Invite must be accepted first" }, 400);

  // Verify the caller is one of the invite participants.
  if (invite.from_user !== user.id && invite.to_user !== user.id) {
    return json({ error: "Forbidden — you are not part of this invite" }, 403);
  }

  const combined = invite.combined_workout as {
    athlete_a?: { adapted_workout?: string; workout?: string };
    athlete_b?: { adapted_workout?: string; workout?: string };
    shared_warmup?: string;
    shared_cooldown?: string;
    summary?: string;
  } | null;

  if (!combined) return json({ error: "No combined workout to arrange" }, 400);

  const proposedDate = invite.proposed_date as string;
  const { start: weekStart, end: weekEnd } = getWeekBounds(proposedDate);
  const userIds = [invite.from_user, invite.to_user] as string[];

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];
    const athlete = i === 0 ? combined.athlete_a : combined.athlete_b;
    const adapted = athlete?.adapted_workout ?? athlete?.workout ?? "Shared run with friend";
    const fullDesc = [
      combined.shared_warmup ? `Warm-up: ${combined.shared_warmup}` : null,
      adapted,
      combined.shared_cooldown ? `Cool-down: ${combined.shared_cooldown}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const { data: plan } = await admin
      .from("training_plan")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!plan) continue;

    const { data: weeks } = await admin
      .from("training_week")
      .select("id, start_date")
      .eq("plan_id", plan.id);

    if (weeks?.length) {
      const weekContaining = weeks.find((w) => {
        const start = new Date(w.start_date);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const d = new Date(proposedDate);
        return d >= start && d <= end;
      });
      if (weekContaining) {
        const { data: existingSession } = await admin
          .from("training_session")
          .select("id")
          .eq("week_id", weekContaining.id)
          .eq("scheduled_date", proposedDate)
          .maybeSingle();

        const dayOfWeek = new Date(proposedDate + "T12:00:00Z").getUTCDay() || 7;
        if (existingSession) {
          await admin
            .from("training_session")
            .update({
              session_type: "combined",
              description: fullDesc,
              notes: "Run together",
            })
            .eq("id", existingSession.id);
        } else {
          const { data: maxOrder } = await admin
            .from("training_session")
            .select("order_index")
            .eq("week_id", weekContaining.id)
            .order("order_index", { ascending: false })
            .limit(1)
            .maybeSingle();
          const orderIndex = (maxOrder?.order_index ?? -1) + 1;
          await admin.from("training_session").insert({
            week_id: weekContaining.id,
            scheduled_date: proposedDate,
            day_of_week: dayOfWeek,
            order_index: orderIndex,
            session_type: "combined",
            description: fullDesc,
            notes: "Run together",
          });
        }

        const { data: weekSessions } = await admin
          .from("training_session")
          .select("id, scheduled_date, session_type")
          .eq("week_id", weekContaining.id);

        for (const s of weekSessions ?? []) {
          if (s.scheduled_date !== proposedDate && s.session_type && QUALITY_TYPES.has(String(s.session_type).toLowerCase())) {
            await admin
              .from("training_session")
              .update({
                session_type: "easy",
                description: "Replaced for shared session — Coach Cade rearranged your week",
                notes: null,
              })
              .eq("id", s.id);
          }
        }
      }
    } else {
      const { data: existing } = await admin
        .from("training_plan_workout")
        .select("id")
        .eq("plan_id", plan.id)
        .eq("date", proposedDate)
        .maybeSingle();

      if (existing) {
        await admin
          .from("training_plan_workout")
          .update({
            type: "combined",
            name: "Shared session",
            description: fullDesc,
            key_focus: "Run together",
            structure_detail: combined.summary ?? null,
          })
          .eq("id", existing.id);
      } else {
        const dateObj = new Date(proposedDate + "T12:00:00Z");
        const weekNum = Math.ceil((dateObj.getTime() - new Date(weekStart).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
        await admin.from("training_plan_workout").insert({
          plan_id: plan.id,
          user_id: userId,
          date: proposedDate,
          week_number: weekNum,
          type: "combined",
          name: "Shared session",
          description: fullDesc,
          key_focus: "Run together",
          structure_detail: combined.summary ?? null,
        });
      }

      const { data: workouts } = await admin
        .from("training_plan_workout")
        .select("id, date, type")
        .eq("plan_id", plan.id)
        .gte("date", weekStart)
        .lte("date", weekEnd);

      for (const w of workouts ?? []) {
        if (w.date !== proposedDate && w.type && QUALITY_TYPES.has(String(w.type).toLowerCase())) {
          await admin
            .from("training_plan_workout")
            .update({
              type: "easy",
              name: "Easy run",
              description: "Replaced for shared session — Coach Cade rearranged your week",
              key_focus: null,
              structure_detail: null,
              workout_steps: null,
            })
            .eq("id", w.id);
        }
      }
    }
  }

  return json({ ok: true });
});
