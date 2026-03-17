import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, UserMinus } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFriendsList, useFriendPlan, useUnfriend } from "@/hooks/useFriends";
import { ActivityCard, type FeedActivity } from "@/components/community/ActivityCard";
import { useLikesForActivities, useCommentsForActivities } from "@/components/community/feedHooks";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

function useProfileFeed(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile-feed", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from("activity")
        .select("id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, user_id, photos, polyline")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(50);

      return (data ?? []) as FeedActivity[];
    },
    staleTime: 60_000,
  });
}

export default function FriendProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: friends = [] } = useFriendsList();
  const { data: activities = [], isLoading } = useProfileFeed(userId ?? undefined);
  const { data: planData } = useFriendPlan(userId ?? null);
  const unfriend = useUnfriend();

  const friend = friends.find((f) => f.id === userId);
  const activityIds = activities.map((a) => a.id);
  const { data: likeData } = useLikesForActivities(activityIds);
  const { data: commentData } = useCommentsForActivities(activityIds);

  const friendNameMap = new Map<string, string>();
  if (friend) friendNameMap.set(friend.id, friend.name);
  if (user) friendNameMap.set(user.id, "You");

  const plan = planData?.plan as {
    plan_name: string;
    philosophy: string;
    goal_race: string;
    goal_time: string;
  } | null;
  const upcomingWorkouts = (planData?.workouts ?? []) as {
    id: string;
    date: string;
    type: string;
    name: string;
    distance_km: number | null;
    duration_minutes: number | null;
  }[];

  if (!userId) {
    return (
      <AppLayout>
        <div className="animate-fade-in">
          <Link to="/community" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Community
          </Link>
          <p className="text-muted-foreground">Invalid profile.</p>
        </div>
      </AppLayout>
    );
  }

  if (!friend) {
    return (
      <AppLayout>
        <div className="animate-fade-in">
          <Link to="/community" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Community
          </Link>
          <p className="text-muted-foreground">Friend not found.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6 max-w-3xl mx-auto">
        <Link
          to="/community"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground -ml-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Community
        </Link>

        {/* Header */}
        <div className="card-standard p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-semibold shrink-0">
                {friend.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl font-bold">{friend.name}</h1>
                {(friend.goalDistance || friend.goalTime) && (
                  <p className="text-muted-foreground mt-0.5">
                    {friend.goalDistance ?? ""}
                    {friend.goalDistance && friend.goalTime ? " in " : ""}
                    {friend.goalTime ?? ""}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive shrink-0"
              onClick={() => {
                unfriend.mutate(friend.id, {
                  onSuccess: () => {
                    toast.success(`Removed ${friend.name} from friends`);
                    navigate("/community");
                  },
                });
              }}
              disabled={unfriend.isPending}
            >
              <UserMinus className="w-4 h-4 mr-1.5" />
              Remove friend
            </Button>
          </div>
        </div>

        {/* Current Plan */}
        {plan && (
          <div className="card-standard p-5">
            <h2 className="text-sm font-semibold text-foreground mb-2">Current Plan</h2>
            <p className="text-base font-medium">{plan.plan_name}</p>
            <p className="text-sm text-muted-foreground mt-3">
              {plan.philosophy?.replace(/_/g, " ")}
              {plan.goal_race ? ` · ${plan.goal_race}` : ""}
              {plan.goal_time ? ` · ${plan.goal_time}` : ""}
            </p>

            {upcomingWorkouts.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">This week</p>
                {upcomingWorkouts.slice(0, 7).map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center gap-2 py-2 px-3 rounded-lg bg-muted/30"
                  >
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-border font-medium">
                      {w.type}
                    </span>
                    <span className="text-sm font-medium">{w.name || w.type}</span>
                    {w.distance_km != null && (
                      <span className="text-[10px] text-muted-foreground ml-auto">{w.distance_km} km</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Activities */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-4">Activities</h2>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : activities.length === 0 ? (
            <div className="card-standard p-8 text-center">
              <p className="text-muted-foreground">No activities yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {activities.map((a) => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  friendName={friend.name}
                  likeCount={likeData?.likeCounts.get(a.id) ?? 0}
                  userLiked={likeData?.userLiked.has(a.id) ?? false}
                  comments={commentData?.get(a.id) ?? []}
                  allFriends={friendNameMap}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
