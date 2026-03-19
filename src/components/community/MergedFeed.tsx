import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { FriendProfile } from "@/hooks/useFriends";
import { ActivityCard, type FeedActivity } from "./ActivityCard";
import { useLikesForActivities, useCommentsForActivities } from "./feedHooks";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function useFeedData(friendIds: string[]) {
  return useQuery({
    queryKey: ["friend-feed", friendIds.sort().join(",")],
    enabled: friendIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity")
        .select("id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, user_id, photos, polyline, planned_session_label")
        .in("user_id", friendIds)
        .order("date", { ascending: false })
        .limit(40);

      return (data ?? []) as FeedActivity[];
    },
    staleTime: 60_000,
  });
}

function useMyFeedData(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-feed", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from("activity")
        .select("id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, user_id, photos, polyline, planned_session_label")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(40);

      return (data ?? []) as FeedActivity[];
    },
    staleTime: 60_000,
  });
}

/**
 * Single activity stream: your runs + friends' runs, newest first.
 */
export function MergedFeed({ friends }: { friends: FriendProfile[] }) {
  const { user } = useAuth();
  const friendIds = friends.map((f) => f.id);
  const friendNameMap = new Map(friends.map((f) => [f.id, f.name]));
  if (user) friendNameMap.set(user.id, "You");

  const { data: friendActivities = [], isLoading: loadingFriends } = useFeedData(friendIds);
  const { data: myActivities = [], isLoading: loadingMine } = useMyFeedData(user?.id);

  const merged = useMemo(() => {
    const byId = new Map<string, FeedActivity>();
    for (const a of myActivities) byId.set(a.id, a);
    for (const a of friendActivities) byId.set(a.id, a);
    return Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [friendActivities, myActivities]);

  const activityIds = merged.map((a) => a.id);
  const { data: likeData } = useLikesForActivities(activityIds);
  const { data: commentData } = useCommentsForActivities(activityIds);

  const loading = loadingFriends || loadingMine;

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">Sign in to see your feed.</p>
      </div>
    );
  }

  if (friends.length === 0 && myActivities.length === 0 && !loading) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">
          Add friends or log a run — your activity stream will show here.
        </p>
      </div>
    );
  }

  if (loading && merged.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (merged.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">No activities yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {merged.map((a) => {
        const isOwn = user?.id === a.user_id;
        const name = friendNameMap.get(a.user_id) ?? "Athlete";
        return (
          <ActivityCard
            key={a.id}
            activity={a}
            friendName={name}
            likeCount={likeData?.likeCounts.get(a.id) ?? 0}
            userLiked={likeData?.userLiked.has(a.id) ?? false}
            comments={commentData?.get(a.id) ?? []}
            allFriends={friendNameMap}
            feedVariant={isOwn ? "own" : "friend"}
          />
        );
      })}
    </div>
  );
}
