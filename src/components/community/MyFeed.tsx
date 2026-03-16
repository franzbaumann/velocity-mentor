import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ActivityCard, type FeedActivity } from "./ActivityCard";
import { useLikesForActivities, useCommentsForActivities } from "./feedHooks";

function useMyFeedData(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-feed", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from("activity")
        .select("id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, user_id, photos")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(30);

      return (data ?? []) as FeedActivity[];
    },
    staleTime: 60_000,
  });
}

export function MyFeed() {
  const { user } = useAuth();
  const { data: activities = [], isLoading } = useMyFeedData(user?.id);
  const activityIds = activities.map((a) => a.id);
  const { data: likeData } = useLikesForActivities(activityIds);
  const { data: commentData } = useCommentsForActivities(activityIds);

  const friendNameMap = new Map<string, string>();
  if (user) friendNameMap.set(user.id, "You");

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">Sign in to see your runs.</p>
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
        <p className="text-sm text-muted-foreground mb-2">
          Complete a run to see it here.
        </p>
        <Link
          to="/activities"
          className="text-sm text-primary font-medium hover:underline"
        >
          View activities
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((a) => (
        <ActivityCard
          key={a.id}
          activity={a}
          friendName="You"
          likeCount={likeData?.likeCounts.get(a.id) ?? 0}
          userLiked={likeData?.userLiked.has(a.id) ?? false}
          comments={commentData?.get(a.id) ?? []}
          allFriends={friendNameMap}
        />
      ))}
    </div>
  );
}
