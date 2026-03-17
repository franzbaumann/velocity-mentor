import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FriendProfile } from "@/hooks/useFriends";
import { ActivityCard, type FeedActivity } from "./ActivityCard";
import { useLikesForActivities, useCommentsForActivities } from "./feedHooks";

function useFeedData(friendIds: string[]) {
  return useQuery({
    queryKey: ["friend-feed", friendIds.sort().join(",")],
    enabled: friendIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity")
        .select("id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, user_id, photos, polyline")
        .in("user_id", friendIds)
        .order("date", { ascending: false })
        .limit(30);

      return (data ?? []) as FeedActivity[];
    },
    staleTime: 60_000,
  });
}

export function FriendFeed({ friends }: { friends: FriendProfile[] }) {
  const friendIds = friends.map((f) => f.id);
  const friendNameMap = new Map(friends.map((f) => [f.id, f.name]));
  const { user } = useAuth();
  if (user) friendNameMap.set(user.id, "You");

  const { data: activities = [], isLoading } = useFeedData(friendIds);
  const activityIds = activities.map((a) => a.id);
  const { data: likeData } = useLikesForActivities(activityIds);
  const { data: commentData } = useCommentsForActivities(activityIds);

  if (friends.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">
          Add friends to see their activities here.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">
          No activities from your friends yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activities.map((a) => (
        <ActivityCard
          key={a.id}
          activity={a}
          friendName={friendNameMap.get(a.user_id) ?? "Friend"}
          likeCount={likeData?.likeCounts.get(a.id) ?? 0}
          userLiked={likeData?.userLiked.has(a.id) ?? false}
          comments={commentData?.get(a.id) ?? []}
          allFriends={friendNameMap}
        />
      ))}
    </div>
  );
}
