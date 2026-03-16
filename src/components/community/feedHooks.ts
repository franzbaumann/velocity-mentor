import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export function useLikesForActivities(activityIds: string[]) {
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

export function useCommentsForActivities(activityIds: string[]) {
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
