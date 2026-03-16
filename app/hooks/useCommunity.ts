import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../shared/supabase";
import { useSupabaseAuth } from "../SupabaseProvider";

// Community tables aren't in local supabase-types yet (migration on main).
// Use untyped `.from()` until types are regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ---------------------------------------------------------------------------
// Types – mirrors web src/hooks/useFriends.ts exactly
// ---------------------------------------------------------------------------

export interface FriendProfile {
  id: string;
  name: string;
  goalDistance: string | null;
  goalTime: string | null;
}

export interface PendingRequest {
  id: string;
  fromUser: string;
  fromName: string;
  createdAt: string;
}

export interface SentRequest {
  id: string;
  toUser: string;
  toName: string;
  createdAt: string;
}

export interface SearchAthleteResult {
  id: string;
  name: string;
  username?: string;
  is_friend?: boolean;
  is_pending?: boolean;
}

export interface FeedPhotoEntry {
  url: string;
  path?: string;
}

export interface FeedActivity {
  id: string;
  date: string;
  type: string;
  name: string | null;
  distance_km: number | null;
  duration_seconds: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  user_id: string;
  source?: string | null;
  external_id?: string | null;
  photos?: FeedPhotoEntry[];
  caption?: string | null;
}

export interface FeedComment {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
}

export interface WorkoutInviteRow {
  id: string;
  from_user: string;
  to_user: string;
  proposed_date: string;
  message: string | null;
  status: string;
  invite_type: string;
  combined_workout: Record<string, unknown> | null;
  created_at: string;
  responded_at: string | null;
}

// ---------------------------------------------------------------------------
// Proxy helper – calls community-proxy edge function
// ---------------------------------------------------------------------------

async function callProxy<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  await supabase.auth.refreshSession();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/community-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
    },
    body: JSON.stringify({ ...body, __path: path }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  return resp.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Friends hooks
// ---------------------------------------------------------------------------

export function useFriendsList() {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ["friends", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as FriendProfile[];
      await supabase.auth.refreshSession();

      const { data: friendships } = await db
        .from("friendship")
        .select("id, user_a, user_b, created_at")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

      if (!friendships?.length) return [] as FriendProfile[];

      const friendIds = friendships.map((f: any) =>
        f.user_a === user.id ? f.user_b : f.user_a,
      );

      const { data: profiles } = await supabase
        .from("athlete_profile")
        .select("user_id, name, goal_distance, goal_time")
        .in("user_id", friendIds);

      return (profiles ?? []).map((p: any) => ({
        id: p.user_id,
        name: p.name,
        goalDistance: p.goal_distance,
        goalTime: p.goal_time,
      })) as FriendProfile[];
    },
    staleTime: 30_000,
  });
}

export function usePendingRequests() {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ["friend-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as PendingRequest[];
      await supabase.auth.refreshSession();

      const { data: requests } = await db
        .from("friend_request")
        .select("id, from_user, created_at")
        .eq("to_user", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (!requests?.length) return [] as PendingRequest[];

      const fromIds = requests.map((r: any) => r.from_user);
      const { data: profiles } = await supabase
        .from("athlete_profile")
        .select("user_id, name")
        .in("user_id", fromIds);

      const nameMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.name]));

      return requests.map((r: any) => ({
        id: r.id,
        fromUser: r.from_user,
        fromName: nameMap.get(r.from_user) ?? "Unknown",
        createdAt: r.created_at,
      })) as PendingRequest[];
    },
    staleTime: 15_000,
  });
}

export function useSentRequests() {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ["sent-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as SentRequest[];
      await supabase.auth.refreshSession();

      const { data: requests } = await db
        .from("friend_request")
        .select("id, to_user, created_at")
        .eq("from_user", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (!requests?.length) return [] as SentRequest[];

      const toIds = requests.map((r: any) => r.to_user);
      const { data: profiles } = await supabase
        .from("athlete_profile")
        .select("user_id, name")
        .in("user_id", toIds);

      const nameMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.name]));

      return requests.map((r: any) => ({
        id: r.id,
        toUser: r.to_user,
        toName: nameMap.get(r.to_user) ?? "Unknown",
        createdAt: r.created_at,
      })) as SentRequest[];
    },
    staleTime: 15_000,
  });
}

export function useSearchAthletes() {
  return useMutation({
    mutationFn: async (query: string) => {
      const data = await callProxy<{ results: SearchAthleteResult[] }>("search", { query });
      return data.results ?? [];
    },
  });
}

export function useSendFriendRequest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (toUser: string) => callProxy("friend-request", { to_user: toUser }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friend-requests"] });
      qc.invalidateQueries({ queryKey: ["sent-requests"] });
    },
  });
}

export function useRespondToRequest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      action,
    }: {
      requestId: string;
      action: "accept" | "reject";
    }) => callProxy("friend-request/respond", { request_id: requestId, action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends"] });
      qc.invalidateQueries({ queryKey: ["friend-requests"] });
      qc.invalidateQueries({ queryKey: ["sent-requests"] });
      qc.refetchQueries({ queryKey: ["friends"] });
    },
  });
}

export function useUnfriend() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (friendId: string) => callProxy("unfriend", { friend_id: friendId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends"] });
    },
  });
}

export function useFriendActivities(friendId: string | null) {
  return useQuery({
    queryKey: ["friend-activities", friendId],
    enabled: !!friendId,
    queryFn: () =>
      callProxy<{ activities: FeedActivity[] }>("friend-activities", {
        friend_id: friendId!,
      }),
    staleTime: 60_000,
  });
}

export function useFriendPlan(friendId: string | null) {
  return useQuery({
    queryKey: ["friend-plan", friendId],
    enabled: !!friendId,
    queryFn: () =>
      callProxy<{
        plan: {
          plan_name: string;
          philosophy: string;
          goal_race: string;
          goal_time: string;
        } | null;
        workouts: {
          id: string;
          date: string;
          type: string;
          name: string;
          distance_km: number | null;
          duration_minutes: number | null;
        }[];
      }>("friend-plan", { friend_id: friendId! }),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Feed hooks (likes / comments)
// ---------------------------------------------------------------------------

export function useFeedData(userIds: string[]) {
  return useQuery({
    queryKey: ["friend-feed", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity")
        .select(
          "id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, user_id, source, external_id, photos, caption",
        )
        .in("user_id", userIds)
        .order("date", { ascending: false })
        .limit(30);

      if (!error) return (data ?? []) as FeedActivity[];

      // photos column may not exist yet – retry without it
      const { data: fallback } = await supabase
        .from("activity")
        .select(
          "id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, user_id",
        )
        .in("user_id", userIds)
        .order("date", { ascending: false })
        .limit(30);

      return (fallback ?? []) as FeedActivity[];
    },
    staleTime: 60_000,
  });
}

export function useLikesForActivities(activityIds: string[]) {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ["activity-likes", activityIds.sort().join(",")],
    enabled: activityIds.length > 0,
    queryFn: async () => {
      const { data } = await db
        .from("activity_like")
        .select("id, activity_id, user_id")
        .in("activity_id", activityIds);

      const likeCounts = new Map<string, number>();
      const userLiked = new Set<string>();
      for (const like of (data ?? []) as any[]) {
        likeCounts.set(
          like.activity_id,
          (likeCounts.get(like.activity_id) ?? 0) + 1,
        );
        if (like.user_id === user?.id) userLiked.add(like.activity_id);
      }
      return { likeCounts, userLiked };
    },
    staleTime: 30_000,
  });
}

export function useCommentsForActivities(activityIds: string[]) {
  return useQuery({
    queryKey: ["activity-comments", activityIds.sort().join(",")],
    enabled: activityIds.length > 0,
    queryFn: async () => {
      const { data } = await db
        .from("activity_comment")
        .select("id, activity_id, user_id, content, created_at")
        .in("activity_id", activityIds)
        .order("created_at", { ascending: true });

      const commentsByActivity = new Map<string, FeedComment[]>();
      for (const c of (data ?? []) as any[]) {
        const list = commentsByActivity.get(c.activity_id) ?? [];
        list.push({
          id: c.id,
          userId: c.user_id,
          content: c.content,
          createdAt: c.created_at,
        });
        commentsByActivity.set(c.activity_id, list);
      }
      return commentsByActivity;
    },
    staleTime: 30_000,
  });
}

export function useToggleLike() {
  const { user } = useSupabaseAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      activityId,
      liked,
    }: {
      activityId: string;
      liked: boolean;
    }) => {
      if (!user) return;
      if (liked) {
        await db
          .from("activity_like")
          .delete()
          .eq("activity_id", activityId)
          .eq("user_id", user.id);
      } else {
        await db
          .from("activity_like")
          .insert({ activity_id: activityId, user_id: user.id });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activity-likes"] }),
  });
}

export function useAddComment() {
  const { user } = useSupabaseAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      activityId,
      content,
    }: {
      activityId: string;
      content: string;
    }) => {
      if (!user) return;
      await db
        .from("activity_comment")
        .insert({ activity_id: activityId, user_id: user.id, content });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activity-comments"] }),
  });
}

// ---------------------------------------------------------------------------
// Workout invites hooks
// ---------------------------------------------------------------------------

export function useWorkoutInvites() {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ["workout-invites", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { received: [] as WorkoutInviteRow[], sent: [] as WorkoutInviteRow[] };

      const { data: received } = await db
        .from("workout_invite")
        .select("*")
        .eq("to_user", user.id)
        .order("created_at", { ascending: false });

      const { data: sent } = await db
        .from("workout_invite")
        .select("*")
        .eq("from_user", user.id)
        .order("created_at", { ascending: false });

      return {
        received: (received ?? []) as WorkoutInviteRow[],
        sent: (sent ?? []) as WorkoutInviteRow[],
      };
    },
    staleTime: 30_000,
  });
}

export function useSendInvite() {
  const { user } = useSupabaseAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      toUser,
      proposedDate,
      message,
      inviteType,
    }: {
      toUser: string;
      proposedDate: string;
      message: string;
      inviteType: "combined" | "parallel";
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await db.from("workout_invite").insert({
        from_user: user.id,
        to_user: toUser,
        proposed_date: proposedDate,
        message: message || null,
        invite_type: inviteType,
        status: "pending",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-invites"] });
    },
  });
}

export function useRespondToInvite() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      inviteId,
      action,
    }: {
      inviteId: string;
      action: "accepted" | "declined";
    }) => {
      const { error } = await db
        .from("workout_invite")
        .update({ status: action, responded_at: new Date().toISOString() })
        .eq("id", inviteId);

      if (error) throw error;

      if (action === "accepted") {
        await supabase.auth.refreshSession();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          await fetch(`${SUPABASE_URL}/functions/v1/combined-workout`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
            },
            body: JSON.stringify({ invite_id: inviteId }),
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-invites"] });
    },
  });
}

// ---------------------------------------------------------------------------
// My-activities hooks (own feed, rename, photo upload)
// ---------------------------------------------------------------------------

export function useMyActivities(limit = 50) {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ["my-activities", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as FeedActivity[];

      const { data, error } = await supabase
        .from("activity")
        .select(
          "id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, user_id, source, external_id, photos, caption",
        )
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(limit);

      if (!error) return (data ?? []) as FeedActivity[];

      const { data: fallback } = await supabase
        .from("activity")
        .select(
          "id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, user_id, source, external_id",
        )
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(limit);

      return (fallback ?? []) as FeedActivity[];
    },
    staleTime: 60_000,
  });
}

export function useUpdateActivity() {
  const { user } = useSupabaseAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      activityId,
      name,
      photos,
      caption,
    }: {
      activityId: string;
      name?: string;
      photos?: FeedPhotoEntry[];
      caption?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (photos !== undefined) updates.photos = photos;
      if (caption !== undefined) updates.caption = caption;

      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activityId);
      const externalId = activityId.startsWith("icu_")
        ? activityId.replace(/^icu_/, "")
        : activityId;
      const base = supabase
        .from("activity")
        .update(updates)
        .eq("user_id", user.id);
      const { error } = isUuid
        ? await base.eq("id", activityId)
        : await base.eq("external_id", externalId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-activities"] });
      qc.invalidateQueries({ queryKey: ["friend-feed"] });
    },
  });
}

export function usePendingInvitesCount() {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ["pending-invites-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return 0;

      const { count } = await db
        .from("workout_invite")
        .select("id", { count: "exact", head: true })
        .eq("to_user", user.id)
        .eq("status", "pending");

      const { count: reqCount } = await db
        .from("friend_request")
        .select("id", { count: "exact", head: true })
        .eq("to_user", user.id)
        .eq("status", "pending");

      return (count ?? 0) + (reqCount ?? 0);
    },
    staleTime: 30_000,
  });
}
