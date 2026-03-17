import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {} as Record<string, unknown>;
  // Path can be in body (client POSTs to /functions/v1/community-proxy only) or in URL subpath
  const pathFromUrl = url.pathname.replace(/^\/functions\/v1\/community-proxy\/?/, "").replace(/^\/community-proxy\/?/, "").replace(/^\/?/, "");
  const path = (body.__path as string) ?? pathFromUrl;

  // POST /username/check — no auth required (used on signup). Returns { available: boolean }
  if (path === "username/check" && req.method === "POST") {
    const raw = (body.username ?? "").toString().trim();
    const username = normalizeUsername(raw);
    if (!username || !USERNAME_REGEX.test(username)) {
      return json({ available: false, error: "Username must be 3–30 characters, letters, numbers, and underscores only" });
    }
    const { data: existing } = await admin
      .from("athlete_profile")
      .select("user_id")
      .ilike("username", username)
      .maybeSingle();
    return json({ available: !existing });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  // POST /username/set — require auth. Set current user's username.
  if (path === "username/set" && req.method === "POST") {
    const raw = (body.username ?? "").toString().trim();
    const username = normalizeUsername(raw);
    if (!username || !USERNAME_REGEX.test(username)) {
      return json({ error: "Username must be 3–30 characters, letters, numbers, and underscores only" }, 400);
    }
    const { data: taken } = await admin
      .from("athlete_profile")
      .select("user_id")
      .ilike("username", username)
      .maybeSingle();
    if (taken && taken.user_id !== user.id) {
      return json({ error: "Username is already taken" }, 409);
    }
    const { error: updateErr } = await admin
      .from("athlete_profile")
      .update({ username })
      .eq("user_id", user.id);
    if (updateErr) return json({ error: updateErr.message }, 500);
    return json({ ok: true, username });
  }

  // POST /search — search athletes by username (prefix) or name; include friends with is_friend/is_pending
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

    const pendingUserIds = new Set<string>();
    for (const p of pending ?? []) {
      if (p.from_user !== user.id) pendingUserIds.add(p.from_user);
      if (p.to_user !== user.id) pendingUserIds.add(p.to_user);
    }

    const q = query.replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/"/g, '\\"');
    const { data: profiles } = await admin
      .from("athlete_profile")
      .select("user_id, name, username")
      .or(`username.ilike."${q}%",name.ilike."%${q}%"`)
      .neq("user_id", user.id)
      .limit(10);

    return json({
      results: (profiles ?? []).map((p: { user_id: string; name: string; username?: string | null }) => ({
        id: p.user_id,
        name: p.name,
        username: p.username ?? undefined,
        is_friend: friendIds.has(p.user_id),
        is_pending: pendingUserIds.has(p.user_id),
      })),
    });
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

  // POST /friend-workout-for-date — get friend's workouts for a specific date (for Run Together combined sessions)
  if (path === "friend-workout-for-date" && req.method === "POST") {
    const { friend_id, date } = body;
    if (!friend_id || !date) return json({ error: "friend_id and date required" }, 400);

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
      .select("id")
      .eq("user_id", friend_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!plan) return json({ workouts: [] });

    const { data: workouts } = await admin
      .from("training_plan_workout")
      .select("id, type, name, description, distance_km, duration_minutes, target_pace, workout_steps, coach_note, structure_detail, key_focus")
      .eq("plan_id", plan.id)
      .eq("date", date)
      .limit(5);

    return json({ workouts: workouts ?? [] });
  }

  // POST /friend-activity-detail — full activity row + streams + social for a friend's activity (server-side, bypasses RLS)
  if (path === "friend-activity-detail" && req.method === "POST") {
    const activityId = (body.activity_id ?? "").toString().trim();
    if (!activityId) return json({ error: "activity_id required" }, 400);

    const { data: activityRow } = await admin
      .from("activity")
      .select("*")
      .eq("id", activityId)
      .maybeSingle();

    if (!activityRow) return json({ activity: null, stream: null });
    const ownerId = activityRow.user_id as string;

    if (ownerId === user.id) {
      return json({ activity: activityRow, stream: null });
    }

    const sorted = [user.id, ownerId].sort();
    const { data: fs } = await admin
      .from("friendship")
      .select("id")
      .eq("user_a", sorted[0])
      .eq("user_b", sorted[1])
      .maybeSingle();
    if (!fs) {
      console.log("[friend-activity-detail] 403 Not friends", { activityId, viewerId: user.id, ownerId });
      return json({ error: "Not friends" }, 403);
    }

    const safeActivity = { ...activityRow, coach_note: null, user_notes: null, enhancing_supplements: null };

    // Fetch streams
    const extId = (activityRow.external_id as string) ?? null;
    const garminId = (activityRow.garmin_id as string) ?? null;
    const extIdNumeric = extId != null && extId.startsWith("i") && extId.length > 1 ? extId.slice(1) : null;
    const keys = [extId, extIdNumeric, activityId, garminId != null ? `garmin_${garminId}` : null].filter((k): k is string => k != null && k !== "");
    const seen = new Set<string>();
    const keysToTry = keys.filter((k) => { if (seen.has(k)) return false; seen.add(k); return true; });
    const cols = "time, heartrate, cadence, altitude, pace, distance, latlng, temperature, respiration_rate";
    let stream: unknown = null;
    for (const key of keysToTry) {
      const { data } = await admin.from("activity_streams").select(cols).eq("user_id", ownerId).eq("activity_id", key).maybeSingle();
      if (data) { stream = data; break; }
    }

    // Fetch likes and comments (bypasses RLS)
    const [likesRes, commentsRes] = await Promise.all([
      admin.from("activity_like").select("id, user_id").eq("activity_id", activityId),
      admin.from("activity_comment").select("id, user_id, content, created_at").eq("activity_id", activityId).order("created_at", { ascending: true }),
    ]);

    console.log("[friend-activity-detail]", { activityId, ownerId, hasStream: !!stream });
    return json({ activity: safeActivity, stream, likes: likesRes.data ?? [], comments: commentsRes.data ?? [] });
  }

  // POST /activity-stream — get stream for a friend's activity (server-side so it works without RLS on activity_streams)
  if (path === "activity-stream" && req.method === "POST") {
    const activityId = (body.activity_id ?? "").toString().trim();
    if (!activityId) return json({ error: "activity_id required" }, 400);

    const { data: activityRow } = await admin
      .from("activity")
      .select("user_id, external_id, garmin_id")
      .eq("id", activityId)
      .maybeSingle();

    if (!activityRow) return json({ stream: null });
    const ownerId = activityRow.user_id as string;
    if (ownerId === user.id) return json({ stream: null }); // owner uses client query

    // Friendship = one user sent a friend request and the other accepted (creates a row in friendship). No separate "accept sharing" step.
    const sorted = [user.id, ownerId].sort();
    const { data: fs } = await admin
      .from("friendship")
      .select("id")
      .eq("user_a", sorted[0])
      .eq("user_b", sorted[1])
      .maybeSingle();
    if (!fs) {
      console.log("[activity-stream] 403 Not friends", { activityId, viewerId: user.id, ownerId });
      return json({ error: "Not friends" }, 403);
    }

    const extId = (activityRow.external_id as string) ?? null;
    const garminId = (activityRow.garmin_id as string) ?? null;
    const extIdNumeric = extId != null && extId.startsWith("i") && extId.length > 1 ? extId.slice(1) : null;
    const keys = [extId, extIdNumeric, activityId, garminId != null ? `garmin_${garminId}` : null].filter((k): k is string => k != null && k !== "");
    const seen = new Set<string>();
    const keysToTry = keys.filter((k) => {
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const cols = "time, heartrate, cadence, altitude, pace, distance, latlng, temperature, respiration_rate";
    let stream: unknown = null;
    let foundKey: string | null = null;
    for (const key of keysToTry) {
      const { data } = await admin
        .from("activity_streams")
        .select(cols)
        .eq("user_id", ownerId)
        .eq("activity_id", key)
        .maybeSingle();
      if (data) {
        stream = data;
        foundKey = key;
        break;
      }
    }
    if (!stream) {
      const { data: existing } = await admin
        .from("activity_streams")
        .select("activity_id")
        .eq("user_id", ownerId)
        .limit(20);
      const existingIds = (existing ?? []).map((r: { activity_id: string }) => r.activity_id);
      console.log("[activity-stream]", { activityId, ownerId, keysToTry, foundKey, hasStream: false, existingActivityIdsForOwner: existingIds });
    } else {
      console.log("[activity-stream]", { activityId, ownerId, keysToTry, foundKey, hasStream: true });
    }
    return json({ stream });
  }

  return json({ error: "Not found" }, 404);
});
