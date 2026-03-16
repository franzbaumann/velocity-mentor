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

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/community-proxy\/?/, "");
  const body = req.method === "POST" ? await req.json() : {};

  // POST /search — search athletes by name
  if (path === "search" && req.method === "POST") {
    const query = (body.query ?? "").trim();
    if (!query || query.length < 2) return json({ results: [] });

    const { data: friends } = await admin
      .from("friendship")
      .select("user_a, user_b")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

    const friendIds = new Set<string>();
    friendIds.add(user.id);
    for (const f of friends ?? []) {
      friendIds.add(f.user_a);
      friendIds.add(f.user_b);
    }

    const { data: pending } = await admin
      .from("friend_request")
      .select("from_user, to_user")
      .eq("status", "pending")
      .or(`from_user.eq.${user.id},to_user.eq.${user.id}`);

    for (const p of pending ?? []) {
      friendIds.add(p.from_user);
      friendIds.add(p.to_user);
    }

    const excludeIds = Array.from(friendIds);

    const { data: profiles } = await admin
      .from("athlete_profile")
      .select("user_id, name")
      .ilike("name", `%${query}%`)
      .not("user_id", "in", `(${excludeIds.join(",")})`)
      .limit(10);

    return json({ results: (profiles ?? []).map((p: { user_id: string; name: string }) => ({ id: p.user_id, name: p.name })) });
  }

  // POST /friend-request — send a request
  if (path === "friend-request" && req.method === "POST" && !body.action) {
    const toUser = body.to_user;
    if (!toUser) return json({ error: "to_user required" }, 400);
    if (toUser === user.id) return json({ error: "Cannot friend yourself" }, 400);

    const a = [user.id, toUser].sort();
    const { data: existing } = await admin
      .from("friendship")
      .select("id")
      .eq("user_a", a[0])
      .eq("user_b", a[1])
      .maybeSingle();

    if (existing) return json({ error: "Already friends" }, 409);

    const { data: pendingReq } = await admin
      .from("friend_request")
      .select("id")
      .eq("status", "pending")
      .or(`and(from_user.eq.${user.id},to_user.eq.${toUser}),and(from_user.eq.${toUser},to_user.eq.${user.id})`)
      .maybeSingle();

    if (pendingReq) return json({ error: "Request already pending" }, 409);

    const { error } = await admin.from("friend_request").insert({
      from_user: user.id,
      to_user: toUser,
      status: "pending",
    });

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // POST /friend-request/respond — accept or reject
  if (path === "friend-request/respond" && req.method === "POST") {
    const { request_id, action } = body;
    if (!request_id || !["accept", "reject"].includes(action)) {
      return json({ error: "request_id and action (accept|reject) required" }, 400);
    }

    const { data: reqRow } = await admin
      .from("friend_request")
      .select("*")
      .eq("id", request_id)
      .eq("to_user", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (!reqRow) return json({ error: "Request not found" }, 404);

    const newStatus = action === "accept" ? "accepted" : "rejected";
    await admin
      .from("friend_request")
      .update({ status: newStatus, responded_at: new Date().toISOString() })
      .eq("id", request_id);

    if (action === "accept") {
      const sorted = [reqRow.from_user, reqRow.to_user].sort();
      await admin.from("friendship").insert({
        user_a: sorted[0],
        user_b: sorted[1],
      });
    }

    return json({ ok: true, status: newStatus });
  }

  // POST /unfriend — remove a friendship
  if (path === "unfriend" && req.method === "POST") {
    const { friend_id } = body;
    if (!friend_id) return json({ error: "friend_id required" }, 400);

    const sorted = [user.id, friend_id].sort();
    await admin
      .from("friendship")
      .delete()
      .eq("user_a", sorted[0])
      .eq("user_b", sorted[1]);

    return json({ ok: true });
  }

  // POST /friend-activities — get recent activities from a specific friend
  if (path === "friend-activities" && req.method === "POST") {
    const { friend_id, limit: lim } = body;
    if (!friend_id) return json({ error: "friend_id required" }, 400);

    const sorted = [user.id, friend_id].sort();
    const { data: fs } = await admin
      .from("friendship")
      .select("id")
      .eq("user_a", sorted[0])
      .eq("user_b", sorted[1])
      .maybeSingle();

    if (!fs) return json({ error: "Not friends" }, 403);

    const { data: activities } = await admin
      .from("activity")
      .select("id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, user_id")
      .eq("user_id", friend_id)
      .order("date", { ascending: false })
      .limit(lim ?? 20);

    return json({ activities: activities ?? [] });
  }

  // POST /friend-plan — get friend's active training plan summary
  if (path === "friend-plan" && req.method === "POST") {
    const { friend_id } = body;
    if (!friend_id) return json({ error: "friend_id required" }, 400);

    const sorted = [user.id, friend_id].sort();
    const { data: fs } = await admin
      .from("friendship")
      .select("id")
      .eq("user_a", sorted[0])
      .eq("user_b", sorted[1])
      .maybeSingle();

    if (!fs) return json({ error: "Not friends" }, 403);

    const { data: plan } = await admin
      .from("training_plan")
      .select("id, plan_name, philosophy, goal_race, goal_time, start_date, end_date, total_weeks")
      .eq("user_id", friend_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!plan) return json({ plan: null });

    const today = new Date().toISOString().slice(0, 10);
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const { data: workouts } = await admin
      .from("training_plan_workout")
      .select("id, date, type, name, description, distance_km, duration_minutes, target_pace")
      .eq("plan_id", plan.id)
      .gte("date", today)
      .lte("date", weekEnd)
      .order("date", { ascending: true })
      .limit(10);

    return json({ plan, workouts: workouts ?? [] });
  }

  return json({ error: "Not found" }, 404);
});
