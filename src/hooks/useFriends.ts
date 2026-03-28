import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

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

async function callProxy(path: string, body: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const resp = await fetch(`${baseUrl}/functions/v1/community-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: getAnonKey(),
    },
    body: JSON.stringify({ ...body, __path: path }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  return resp.json();
}

const getAnonKey = () =>
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Dev-only log for social table failures (e.g. 503, missing migration). */
export function logSocialTableError(context: string, err: { message?: string; code?: string } | null) {
  if (!err || import.meta.env.PROD) return;
  console.warn(`[social] ${context}:`, err.message ?? err.code ?? err);
}

function proxyFetch(path: string, body: Record<string, unknown> = {}) {
  return async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
    const resp = await fetch(`${baseUrl}/functions/v1/community-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: getAnonKey(),
      },
      body: JSON.stringify({ ...body, __path: path }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Request failed" }));
      throw new Error(err.error ?? "Request failed");
    }
    return resp.json();
  };
}

export function useFriendsList() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["friends", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      const { data: friendships } = await supabase
        .from("friendship")
        .select("id, user_a, user_b, created_at")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

      if (!friendships?.length) return [] as FriendProfile[];

      const friendIds = friendships.map((f) =>
        f.user_a === user.id ? f.user_b : f.user_a
      );

      const { data: profiles } = await supabase
        .from("athlete_profile")
        .select("user_id, name, goal_distance, goal_time")
        .in("user_id", friendIds);

      return (profiles ?? []).map((p) => ({
        id: p.user_id,
        name: p.name,
        goalDistance: p.goal_distance,
        goalTime: p.goal_time,
      })) as FriendProfile[];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function usePendingRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["friend-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      const { data: requests, error } = await supabase
        .from("friend_request")
        .select("id, from_user, created_at")
        .eq("to_user", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        logSocialTableError("friend_request pending (inbox)", error);
        return [] as PendingRequest[];
      }
      if (!requests?.length) return [] as PendingRequest[];

      const fromIds = requests.map((r) => r.from_user);
      const { data: profiles } = await supabase
        .from("athlete_profile")
        .select("user_id, name")
        .in("user_id", fromIds);

      const nameMap = new Map((profiles ?? []).map((p) => [p.user_id, p.name]));

      return requests.map((r) => ({
        id: r.id,
        fromUser: r.from_user,
        fromName: nameMap.get(r.from_user) ?? "Unknown",
        createdAt: r.created_at,
      })) as PendingRequest[];
    },
    staleTime: 15_000,
    retry: 1,
  });
}

export function useSentRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["sent-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      const { data: requests, error } = await supabase
        .from("friend_request")
        .select("id, to_user, created_at")
        .eq("from_user", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        logSocialTableError("friend_request pending (sent)", error);
        return [];
      }
      if (!requests?.length) return [];

      const toIds = requests.map((r) => r.to_user);
      const { data: profiles } = await supabase
        .from("athlete_profile")
        .select("user_id, name")
        .in("user_id", toIds);

      const nameMap = new Map((profiles ?? []).map((p) => [p.user_id, p.name]));

      return requests.map((r) => ({
        id: r.id,
        toUser: r.to_user,
        toName: nameMap.get(r.to_user) ?? "Unknown",
        createdAt: r.created_at,
      }));
    },
    staleTime: 15_000,
    retry: 1,
  });
}

export interface SearchAthleteResult {
  id: string;
  name: string;
  username?: string;
  is_friend?: boolean;
  is_pending?: boolean;
}

export function useSearchAthletes() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (query: string) => {
      const data = await proxyFetch("search", { query })();
      return (data.results ?? []) as SearchAthleteResult[];
    },
  });
}

export function useSendFriendRequest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (toUser: string) => proxyFetch("friend-request", { to_user: toUser })(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friend-requests"] });
      qc.invalidateQueries({ queryKey: ["sent-requests"] });
    },
  });
}

export function useRespondToRequest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, action }: { requestId: string; action: "accept" | "reject" }) =>
      proxyFetch("friend-request/respond", { request_id: requestId, action })(),
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
    mutationFn: (friendId: string) => proxyFetch("unfriend", { friend_id: friendId })(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends"] });
    },
  });
}

export function useFriendActivities(friendId: string | null) {
  return useQuery({
    queryKey: ["friend-activities", friendId],
    enabled: !!friendId,
    queryFn: proxyFetch("friend-activities", { friend_id: friendId! }),
    staleTime: 60_000,
  });
}

export function useFriendPlan(friendId: string | null) {
  return useQuery({
    queryKey: ["friend-plan", friendId],
    enabled: !!friendId,
    queryFn: proxyFetch("friend-plan", { friend_id: friendId! }),
    staleTime: 60_000,
  });
}

export function useFriendWorkoutForDate(friendId: string | null, date: string | null) {
  return useQuery({
    queryKey: ["friend-workout-for-date", friendId, date],
    enabled: !!friendId && !!date,
    queryFn: () => callProxy("friend-workout-for-date", { friend_id: friendId!, date: date! }),
    staleTime: 60_000,
  });
}

export interface FriendWorkoutForDateResult {
  friendId: string;
  workouts: { id?: string; type?: string; name?: string; description?: string; distance_km?: number; duration_minutes?: number; target_pace?: string; workout_steps?: unknown }[];
}

export function useFriendWorkoutsForDate(friendIds: string[], date: string | null) {
  const results = useQueries({
    queries: friendIds.map((friendId) => ({
      queryKey: ["friend-workout-for-date", friendId, date],
      enabled: !!friendId && !!date,
      queryFn: () => callProxy("friend-workout-for-date", { friend_id: friendId, date: date! }),
      staleTime: 60_000,
    })),
  });

  const byFriendId = new Map<string, FriendWorkoutForDateResult>();
  let isLoading = false;
  for (let i = 0; i < friendIds.length; i++) {
    const { data, isLoading: qLoading } = results[i];
    if (qLoading) isLoading = true;
    const workouts = (data as { workouts?: unknown[] })?.workouts ?? [];
    byFriendId.set(friendIds[i], { friendId: friendIds[i], workouts });
  }

  return { byFriendId, isLoading, results };
}

export function usePendingInvitesCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["pending-invites-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return 0;

      const { count, error: invErr } = await supabase
        .from("workout_invite")
        .select("id", { count: "exact", head: true })
        .eq("to_user", user.id)
        .eq("status", "pending");

      if (invErr) logSocialTableError("workout_invite pending count", invErr);

      const { count: reqCount, error: reqErr } = await supabase
        .from("friend_request")
        .select("id", { count: "exact", head: true })
        .eq("to_user", user.id)
        .eq("status", "pending");

      if (reqErr) logSocialTableError("friend_request pending count", reqErr);

      return (invErr ? 0 : count ?? 0) + (reqErr ? 0 : reqCount ?? 0);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
