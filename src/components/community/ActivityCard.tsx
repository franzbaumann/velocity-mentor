import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Heart,
  MessageCircle,
  Send,
  Footprints,
  Bike,
  Waves,
  Dumbbell,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/useTheme";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistance, normalizePaceDisplay } from "@/lib/format";
import { toast } from "sonner";
import { FeedMapThumbnail } from "./FeedMapThumbnail";

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
  photos?: { url: string; path?: string }[];
  polyline?: string | null;
}

function getActivityIcon(type: string): LucideIcon {
  const t = (type ?? "").toLowerCase();
  if (/run|löpning|jog/i.test(t)) return Footprints;
  if (/ride|cycle|cykel|cykling|bike/i.test(t)) return Bike;
  if (/swim|sim/i.test(t)) return Waves;
  if (/strength|styrka|weight|lift/i.test(t)) return Dumbbell;
  return Activity;
}

function formatDurationShort(sec: number | null): string {
  if (sec == null) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ActivityCard({
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
  const { resolved: themeMode } = useTheme();
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
  const paceDisplay = pace ? pace.replace(/\/km$/i, "") + "/km" : null;
  const firstPhoto = activity.photos?.[0]?.url;
  const hasPolyline = activity.polyline && activity.polyline.length > 2;
  const ActivityIcon = getActivityIcon(activity.type);
  const isDark = themeMode === "dark";

  return (
    <div className="card-standard p-4">
      <Link
        to={`/activities/${activity.id}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md -m-1 p-1"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold shrink-0">
            {friendName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{friendName}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(activity.date), { addSuffix: true })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <ActivityIcon className="w-5 h-5 text-muted-foreground shrink-0" />
          <p className="text-base font-semibold">{activity.name ?? activity.type}</p>
        </div>

        {/* Strava-style big metrics row */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3">
          {activity.distance_km != null && activity.distance_km > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Distance</p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {formatDistance(activity.distance_km)}
              </p>
            </div>
          )}
          {paceDisplay && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pace</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{paceDisplay}</p>
            </div>
          )}
          {activity.duration_seconds != null && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Time</p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {formatDurationShort(activity.duration_seconds)}
              </p>
            </div>
          )}
          {activity.avg_hr != null &&
            (activity.distance_km == null || activity.distance_km <= 0) && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg HR</p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {activity.avg_hr} bpm
                </p>
              </div>
            )}
        </div>

        {firstPhoto && (
          <div className="rounded-lg overflow-hidden mb-3 aspect-video bg-muted">
            <img src={firstPhoto} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {!firstPhoto && hasPolyline && (
          <div className="mb-3">
            <FeedMapThumbnail polyline={activity.polyline!} isDark={isDark} />
          </div>
        )}
      </Link>

      <div
        className="flex items-center gap-4 pt-3 border-t border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => toggleLike.mutate()}
          className={`flex items-center gap-2 text-sm transition-colors ${
            userLiked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
          }`}
          disabled={toggleLike.isPending}
        >
          <Heart className={`w-5 h-5 ${userLiked ? "fill-current" : ""}`} />
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          {comments.length > 0 && <span>{comments.length}</span>}
        </button>
        {(likeCount > 0 || comments.length > 0) && (
          <span className="text-sm text-muted-foreground">
            {likeCount > 0 && `${likeCount} likes`}
            {likeCount > 0 && comments.length > 0 && " · "}
            {comments.length > 0 && `${comments.length} comments`}
          </span>
        )}
      </div>

      {showComments && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm font-semibold shrink-0">
                {(c.userId === user?.id ? "You" : allFriends.get(c.userId) ?? "Friend").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">
                    {c.userId === user?.id ? "You" : allFriends.get(c.userId) ?? "Friend"}
                  </span>{" "}
                  <span className="text-muted-foreground">{c.content}</span>
                </p>
                <p className="text-xs text-muted-foreground/80 mt-0.5">
                  {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                </p>
              </div>
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
              className="text-sm h-9"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-2"
              onClick={() => commentText.trim() && addComment.mutate(commentText.trim())}
              disabled={!commentText.trim() || addComment.isPending}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
