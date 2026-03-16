import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, MessageCircle, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistance, normalizePaceDisplay } from "@/lib/format";
import type { FriendProfile } from "@/hooks/useFriends";
import { toast } from "sonner";

interface FeedActivity {
  id: string;
  date: string;
  type: string;
  name: string | null;
  distance_km: number | null;
  duration_seconds: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  user_id: string;
}

function formatDurationFromSec(sec: number | null): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h}:${String(rem).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  }
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

function useFeedData(friendIds: string[]) {
  return useQuery({
    queryKey: ["friend-feed", friendIds.sort().join(",")],
    enabled: friendIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity")
        .select("id, date, type, name, distance_km, duration_seconds, avg_pace, avg_hr, user_id")
        .in("user_id", friendIds)
        .order("date", { ascending: false })
        .limit(30);

      return (data ?? []) as FeedActivity[];
    },
    staleTime: 60_000,
  });
}

function useLikesForActivities(activityIds: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["activity-likes", activityIds.sort().join(",")],
    enabled: activityIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_like")
        .select("id, activity_id, user_id")
        .in("activity_id", activityIds);

      const likeCounts = new Map<string, number>();
      const userLiked = new Set<string>();
      for (const like of data ?? []) {
        likeCounts.set(like.activity_id, (likeCounts.get(like.activity_id) ?? 0) + 1);
        if (like.user_id === user?.id) userLiked.add(like.activity_id);
      }
      return { likeCounts, userLiked };
    },
    staleTime: 30_000,
  });
}

function useCommentsForActivities(activityIds: string[]) {
  return useQuery({
    queryKey: ["activity-comments", activityIds.sort().join(",")],
    enabled: activityIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_comment")
        .select("id, activity_id, user_id, content, created_at")
        .in("activity_id", activityIds)
        .order("created_at", { ascending: true });

      const commentsByActivity = new Map<
        string,
        { id: string; userId: string; content: string; createdAt: string }[]
      >();
      for (const c of data ?? []) {
        const list = commentsByActivity.get(c.activity_id) ?? [];
        list.push({ id: c.id, userId: c.user_id, content: c.content, createdAt: c.created_at });
        commentsByActivity.set(c.activity_id, list);
      }
      return commentsByActivity;
    },
    staleTime: 30_000,
  });
}

function ActivityCard({
  activity,
  friendName,
  likeCount,
  userLiked,
  comments,
  allFriends,
}: {
  activity: FeedActivity;
  friendName: string;
  likeCount: number;
  userLiked: boolean;
  comments: { id: string; userId: string; content: string; createdAt: string }[];
  allFriends: Map<string, string>;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");

  const toggleLike = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (userLiked) {
        await supabase
          .from("activity_like")
          .delete()
          .eq("activity_id", activity.id)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("activity_like")
          .insert({ activity_id: activity.id, user_id: user.id });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activity-likes"] }),
  });

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      if (!user) return;
      await supabase
        .from("activity_comment")
        .insert({ activity_id: activity.id, user_id: user.id, content });
    },
    onSuccess: () => {
      setCommentText("");
      qc.invalidateQueries({ queryKey: ["activity-comments"] });
    },
    onError: () => toast.error("Failed to post comment"),
  });

  const pace = normalizePaceDisplay(activity.avg_pace) || activity.avg_pace;

  return (
    <div className="card-standard p-4">
      <Link
        to={`/activities/${activity.id}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md -m-1 p-1"
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
            {friendName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium">{friendName}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(activity.date), { addSuffix: true })}
            </p>
          </div>
        </div>

        <p className="text-sm font-semibold mb-1">{activity.name ?? activity.type}</p>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
          {activity.distance_km != null && activity.distance_km > 0 && (
            <span className="text-primary font-medium">{formatDistance(activity.distance_km)}</span>
          )}
          {pace && <span>{pace.replace(/\/km$/i, "")}/km</span>}
          {activity.avg_hr != null && <span>{activity.avg_hr} bpm</span>}
          {activity.duration_seconds != null && (
            <span>{formatDurationFromSec(activity.duration_seconds)}</span>
          )}
        </div>
      </Link>

      <div className="flex items-center gap-4 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => toggleLike.mutate()}
          className={`flex items-center gap-1.5 text-xs transition-colors ${
            userLiked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
          }`}
          disabled={toggleLike.isPending}
        >
          <Heart className={`w-4 h-4 ${userLiked ? "fill-current" : ""}`} />
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          {comments.length > 0 && <span>{comments.length}</span>}
        </button>
      </div>

      {showComments && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="text-xs">
              <span className="font-medium">
                {c.userId === user?.id ? "You" : allFriends.get(c.userId) ?? "Friend"}
              </span>{" "}
              <span className="text-muted-foreground">{c.content}</span>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="Add a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && commentText.trim()) addComment.mutate(commentText.trim());
              }}
              className="text-xs h-8"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={() => commentText.trim() && addComment.mutate(commentText.trim())}
              disabled={!commentText.trim() || addComment.isPending}
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
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
    <div className="space-y-4">
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
