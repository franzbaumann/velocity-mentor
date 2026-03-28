import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Calendar,
  Check,
  X,
  Loader2,
  Send,
  Users,
  Dumbbell,
  Trash2,
} from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { toast } from "sonner";
import { logSocialTableError, type FriendProfile } from "@/hooks/useFriends";
import { useFriendWorkoutForDate, useFriendWorkoutsForDate } from "@/hooks/useFriends";
import { parseSteps, WorkoutStepsDisplay, CombinedWorkoutDisplay, type CombinedWorkoutPreview } from "@/lib/workout-steps";
import { getSupabaseUrl } from "@/lib/supabase-url";

function useWorkoutInvites() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["workout-invites", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { received: [], sent: [] };

      const { data: received, error: recErr } = await supabase
        .from("workout_invite")
        .select("*")
        .eq("to_user", user.id)
        .order("created_at", { ascending: false });

      if (recErr) logSocialTableError("workout_invite received list", recErr);

      const { data: sent, error: sentErr } = await supabase
        .from("workout_invite")
        .select("*")
        .eq("from_user", user.id)
        .order("created_at", { ascending: false });

      if (sentErr) logSocialTableError("workout_invite sent list", sentErr);

      return {
        received: recErr ? [] : received ?? [],
        sent: sentErr ? [] : sent ?? [],
      };
    },
    staleTime: 30_000,
    retry: 1,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      const all = [...(d.received ?? []), ...(d.sent ?? [])];
      const needsWorkout = all.some((i) => i.status === "pending" && !i.combined_workout);
      return needsWorkout ? 4000 : false;
    },
  });
}

function useRespondToInvite() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      inviteId,
      action,
    }: {
      inviteId: string;
      action: "accepted" | "declined";
    }) => {
      const { error } = await supabase
        .from("workout_invite")
        .update({ status: action, responded_at: new Date().toISOString() })
        .eq("id", inviteId);

      if (error) throw error;

      if (action === "accepted") {
        const { error: rearrangeErr } = await supabase.functions.invoke("rearrange-weeks-on-accept", {
          body: { invite_id: inviteId },
        });
        if (rearrangeErr) {
          console.warn("rearrange-weeks-on-accept:", rearrangeErr);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-invites"] });
      qc.invalidateQueries({ queryKey: ["pending-invites-count"] });
    },
  });
}

function useSendInvite() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      toUsers,
      proposedDate,
      message,
      inviteType,
      fromWorkoutId,
    }: {
      toUsers: string[];
      proposedDate: string;
      message: string;
      inviteType: "combined" | "parallel";
      fromWorkoutId?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired. Please refresh the page and try again.");

      const baseUrl = getSupabaseUrl();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000);

      let res: Response;
      try {
        res = await fetch(`${baseUrl}/functions/v1/create-session-invites`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: anonKey,
          },
          body: JSON.stringify({
            toUsers,
            proposedDate,
            message: message || null,
            inviteType,
            fromWorkoutId: fromWorkoutId || null,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("Request timed out. Coach Cade is generating the workout — please try again in a moment.");
        }
        throw err;
      }
      clearTimeout(timeoutId);

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Session expired. Please refresh the page and try again.");
        }
        const is404 = res.status === 404;
        if (is404 && toUsers.length === 1) {
          const { error: insertErr } = await supabase.from("workout_invite").insert({
            from_user: user.id,
            to_user: toUsers[0],
            proposed_date: proposedDate,
            message: message || null,
            invite_type: inviteType,
            from_workout_id: fromWorkoutId || null,
            session_id: null,
          });
          if (insertErr) throw new Error(insertErr.message ?? "Failed to send invite");
          return;
        }
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-invites"] });
      qc.invalidateQueries({ queryKey: ["pending-invites-count"] });
    },
  });
}

function useArrangeWeek() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const baseUrl = getSupabaseUrl();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
      const url = `${baseUrl}/functions/v1/arrange-week`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey },
        body: JSON.stringify({ invite_id: inviteId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-invites"] });
      qc.invalidateQueries({ queryKey: ["training-plan"] });
    },
  });
}

function useDeleteInvite() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      inviteId,
      sessionId,
      isSent,
    }: { inviteId: string; sessionId?: string | null; isSent?: boolean }) => {
      if (sessionId && isSent) {
        const { error } = await supabase.from("workout_session").delete().eq("id", sessionId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("workout_invite")
          .delete()
          .eq("id", inviteId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-invites"] });
      qc.invalidateQueries({ queryKey: ["pending-invites-count"] });
    },
  });
}

function NewInviteSheet({
  open,
  onClose,
  friends,
}: {
  open: boolean;
  onClose: () => void;
  friends: FriendProfile[];
}) {
  const { user } = useAuth();
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [proposedDate, setProposedDate] = useState(
    format(addDays(new Date(), 1), "yyyy-MM-dd")
  );
  const [message, setMessage] = useState("");
  const [inviteType, setInviteType] = useState<"combined" | "parallel">("combined");
  const sendInvite = useSendInvite();

  const { byFriendId, isLoading: friendWorkoutsLoading } = useFriendWorkoutsForDate(
    selectedFriends,
    selectedFriends.length > 0 && proposedDate ? proposedDate : null
  );

  const { data: myPlanWorkouts } = useQuery({
    queryKey: ["my-plan-workout-for-date", user?.id, proposedDate, open],
    enabled: !!user && open,
    queryFn: async () => {
      if (!user) return [];
      const { data: plan } = await supabase
        .from("training_plan")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!plan) return [];
      const { data: workouts } = await supabase
        .from("training_plan_workout")
        .select("id, type, name, description, distance_km, duration_minutes, target_pace, workout_steps, coach_note, structure_detail, key_focus")
        .eq("plan_id", plan.id)
        .eq("date", proposedDate)
        .limit(5);
      return workouts ?? [];
    },
    staleTime: 60_000,
  });

  const firstWorkoutId = (myPlanWorkouts && myPlanWorkouts.length > 0)
    ? (myPlanWorkouts[0] as { id?: string }).id ?? null
    : null;

  const handleSend = () => {
    if (!selectedFriends.length || !proposedDate) return;

    sendInvite.mutate(
      {
        toUsers: selectedFriends,
        proposedDate,
        message,
        inviteType,
        fromWorkoutId: firstWorkoutId,
      },
      {
        onSuccess: () => {
          toast.success(
            selectedFriends.length === 1
              ? "Workout invite sent! Coach Cade will generate the combined workout — it will appear shortly."
              : `Invites sent to ${selectedFriends.length} friends! Coach Cade will generate the combined workout — it will appear shortly.`
          );
          setSelectedFriends([]);
          setMessage("");
          onClose();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const toggleFriend = (id: string) => {
    setSelectedFriends((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh] p-0 gap-0">
        <div className="px-6 pt-6 pb-2 pr-12 shrink-0">
          <DialogHeader>
            <DialogTitle>Run Together</DialogTitle>
            <DialogDescription>Send a workout invite to a friend. Choose a date and optional message.</DialogDescription>
          </DialogHeader>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
        <div className="space-y-5 mt-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Friends
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal"
                >
                  {selectedFriends.length === 0
                    ? "Select friends"
                    : selectedFriends.length === 1
                      ? friends.find((f) => f.id === selectedFriends[0])?.name ?? "1 friend"
                      : `${selectedFriends.length} friends selected`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {friends.map((f) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedFriends.includes(f.id)}
                        onCheckedChange={() => toggleFriend(f.id)}
                      />
                      <span className="text-sm">{f.name}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Date
            </label>
            <Input
              type="date"
              value={proposedDate}
              onChange={(e) => setProposedDate(e.target.value)}
              min={format(new Date(), "yyyy-MM-dd")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Your plan for {format(parseISO(proposedDate), "EEE, MMM d")}
              </p>
              {myPlanWorkouts && myPlanWorkouts.length > 0 ? (
                <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                  {(myPlanWorkouts as { id?: string; type?: string; name?: string; description?: string; distance_km?: number; duration_minutes?: number; target_pace?: string; workout_steps?: unknown }[]).map((w, i) => {
                    const steps = parseSteps(w.workout_steps);
                    if (steps && steps.length > 0) {
                      return (
                        <div key={i} className={i > 0 ? "mt-4 pt-3 border-t border-border/50" : ""}>
                          <WorkoutStepsDisplay steps={steps} workoutType={w.type} />
                        </div>
                      );
                    }
                    const parts = [w.type, w.name, w.description, w.distance_km ? `${w.distance_km} km` : null, w.duration_minutes ? `${w.duration_minutes} min` : null, w.target_pace ? `@ ${w.target_pace}` : null].filter(Boolean);
                    return <p key={i} className={`text-xs text-muted-foreground ${i > 0 ? "mt-1" : ""}`}>{parts.join(" · ") || "Workout"}</p>;
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No planned workout for this date</p>
              )}
            </div>
            {selectedFriends.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  Plans for {format(parseISO(proposedDate), "EEE, MMM d")}
                </p>
                {friendWorkoutsLoading ? (
                  <p className="text-xs text-muted-foreground italic">Loading…</p>
                ) : (
                  <div className="rounded-lg border border-border/60 bg-gray-50 dark:bg-muted/40 px-3 py-3 space-y-3 max-h-48 overflow-y-auto">
                    {selectedFriends.map((friendId) => {
                      const friendName = friends.find((f) => f.id === friendId)?.name ?? "Friend";
                      const result = byFriendId.get(friendId);
                      const workouts = result?.workouts ?? [];
                      return (
                        <div key={friendId} className={selectedFriends.length > 1 ? "pb-3 border-b border-border/50 last:border-0 last:pb-0" : ""}>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">{friendName}&apos;s plan</p>
                          {workouts.length > 0 ? (
                            workouts.map((w, i) => {
                              const steps = parseSteps(w.workout_steps);
                              if (steps && steps.length > 0) {
                                return (
                                  <div key={i} className={i > 0 ? "mt-2 pt-2 border-t border-border/50" : ""}>
                                    <WorkoutStepsDisplay steps={steps} workoutType={w.type} />
                                  </div>
                                );
                              }
                              const parts = [w.type, w.name, w.description, w.distance_km ? `${w.distance_km} km` : null, w.duration_minutes ? `${w.duration_minutes} min` : null, w.target_pace ? `@ ${w.target_pace}` : null].filter(Boolean);
                              return <p key={i} className="text-xs text-muted-foreground">{parts.join(" · ") || "Workout"}</p>;
                            })
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No planned workout for this date</p>
                          )}
                        </div>
                      );
                    })}
                    {selectedFriends.length > 1 && (
                      <p className="text-xs text-muted-foreground italic pt-2 border-t border-border/50">
                        Coach Cade will merge these into one session
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Workout Style
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setInviteType("combined")}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  inviteType === "combined"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/35 dark:border-blue-500"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Users className="w-5 h-5 mb-1.5 text-primary" />
                <p className="text-sm font-medium">Combined</p>
                <p className="text-xs text-muted-foreground">
                  Coach Cade merges both plans into one shared session
                </p>
              </button>
              <button
                onClick={() => setInviteType("parallel")}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  inviteType === "parallel"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/35 dark:border-blue-500"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Dumbbell className="w-5 h-5 mb-1.5 text-primary" />
                <p className="text-sm font-medium">Parallel</p>
                <p className="text-xs text-muted-foreground">
                  Own reps, shared warm-up, cool-down and rests
                </p>
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Message (optional)
            </label>
            <Input
              placeholder="Track session at 18:00?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleSend}
              disabled={!selectedFriends.length || !proposedDate || sendInvite.isPending}
            >
              {sendInvite.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Invite
            </Button>
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type CombinedPreview = CombinedWorkoutPreview;

export function WorkoutInvites({ friends }: { friends: FriendProfile[] }) {
  const { user } = useAuth();
  const { data, isLoading } = useWorkoutInvites();
  const respond = useRespondToInvite();
  const deleteInvite = useDeleteInvite();
  const arrangeWeek = useArrangeWeek();
  const [showNewInvite, setShowNewInvite] = useState(false);
  const [expandedInvite, setExpandedInvite] = useState<string | null>(null);

  const friendNameMap = new Map(friends.map((f) => [f.id, f.name]));
  const received = data?.received ?? [];
  const sent = data?.sent ?? [];
  const pendingReceived = received.filter((r) => r.status === "pending");

  const allHistoryInvites = [...sent, ...received.filter((r) => r.status !== "pending")]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const historyGroups = (() => {
    const bySession = new Map<string | null, typeof allHistoryInvites>();
    for (const inv of allHistoryInvites) {
      const key = (inv as { session_id?: string | null }).session_id ?? `legacy-${inv.id}`;
      if (!bySession.has(key)) bySession.set(key, []);
      bySession.get(key)!.push(inv);
    }
    return Array.from(bySession.values())
      .map((group) => ({
        invites: group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        first: group[0],
        sessionId: (group[0] as { session_id?: string | null }).session_id ?? null,
      }))
      .slice(0, 10);
  })();
  const expandedInviteData = expandedInvite ? allHistoryInvites.find((i) => i.id === expandedInvite) : null;
  const expandedFromWorkoutId = expandedInviteData?.from_workout_id as string | null | undefined;
  const expandedProposedDate = expandedInviteData?.proposed_date as string | undefined;
  const isExpandedSent = expandedInviteData?.from_user === user?.id;

  const { data: expandedWorkout } = useQuery({
    queryKey: ["invite-workout-detail", expandedFromWorkoutId ?? expandedProposedDate, expandedInvite, isExpandedSent],
    enabled: !!expandedInvite && !!user && (!!expandedFromWorkoutId || (!!expandedProposedDate && isExpandedSent)),
    queryFn: async () => {
      if (!user) return null;
      if (expandedFromWorkoutId) {
        const { data } = await supabase
          .from("training_plan_workout")
          .select("id, type, name, description, distance_km, duration_minutes, target_pace, workout_steps, key_focus")
          .eq("id", expandedFromWorkoutId)
          .maybeSingle();
        return data;
      }
      if (expandedProposedDate && isExpandedSent) {
        const { data: plan } = await supabase
          .from("training_plan")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!plan) return null;
        const { data: workouts } = await supabase
          .from("training_plan_workout")
          .select("id, type, name, description, distance_km, duration_minutes, target_pace, workout_steps, key_focus")
          .eq("plan_id", plan.id)
          .eq("date", expandedProposedDate)
          .limit(1);
        return workouts?.[0] ?? null;
      }
      return null;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Run Together
        </h2>
        <Button
          size="sm"
          onClick={() => setShowNewInvite(true)}
          disabled={friends.length === 0}
        >
          <Send className="w-4 h-4 mr-1.5" />
          New Invite
        </Button>
      </div>

      {friends.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Add friends first to send workout invites.
        </p>
      )}

      {received.filter((r) => r.status === "pending").length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs text-muted-foreground mb-2">Incoming</h3>
          <div className="space-y-2">
            {received
              .filter((r) => r.status === "pending")
              .map((invite) => (
                <div
                  key={invite.id}
                  className="card-standard p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium">
                        {friendNameMap.get(invite.from_user) ?? "Friend"} wants to run together
                      </p>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {format(parseISO(invite.proposed_date), "EEEE, MMM d")}
                        <span className="mx-1">·</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {invite.invite_type}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {invite.message && (
                    <p className="text-xs text-foreground/80 mb-3 italic">
                      &ldquo;{invite.message}&rdquo;
                    </p>
                  )}
                  {invite.combined_workout && (
                    <div className="mb-3 pt-3 border-t border-border/50">
                      <CombinedWorkoutDisplay
                        data={invite.combined_workout as CombinedPreview}
                      />
                    </div>
                  )}
                  {!invite.combined_workout && (
                    <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                      Coach Cade is generating your workout...
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        respond.mutate(
                          { inviteId: invite.id, action: "accepted" },
                          {
                            onSuccess: () =>
                              toast.success("Accepted! Coach Cade is creating your shared workout..."),
                          }
                        )
                      }
                      disabled={respond.isPending}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        respond.mutate(
                          { inviteId: invite.id, action: "declined" },
                          { onSuccess: () => toast("Invite declined") }
                        )
                      }
                      disabled={respond.isPending}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {(sent.length > 0 || received.filter((r) => r.status !== "pending").length > 0) && (
        <div>
          <h3 className="text-xs text-muted-foreground mb-2">History</h3>
          <div className="space-y-2">
            {historyGroups.map((group) => {
              const invite = group.first;
              const isSent = invite.from_user === user?.id;
              const otherNames = [...new Set(
                group.invites.map((i) =>
                  friendNameMap.get(isSent ? i.to_user : i.from_user) ?? "Friend"
                )
              )];
              const otherNameDisplay =
                otherNames.length === 1
                  ? otherNames[0]
                  : otherNames.length === 2
                    ? `${otherNames[0]} and ${otherNames[1]}`
                    : `${otherNames.slice(0, -1).join(", ")}, and ${otherNames[otherNames.length - 1]}`;
              const combined = invite.combined_workout as CombinedWorkoutPreview | null;
              const hasCombined = combined && (
                combined.summary ||
                combined.shared_warmup ||
                combined.shared_cooldown ||
                combined.athlete_a ||
                combined.athlete_b ||
                (combined.athletes && combined.athletes.length > 0)
              );
              const isExpanded = expandedInvite === invite.id;
              const steps = expandedWorkout && isExpanded ? parseSteps(expandedWorkout.workout_steps) : null;
              const statusCounts = { accepted: 0, pending: 0, declined: 0 };
              for (const i of group.invites) {
                statusCounts[i.status as keyof typeof statusCounts]++;
              }
              const displayStatus =
                statusCounts.accepted > 0 ? "accepted" : statusCounts.pending > 0 ? "pending" : "declined";

              return (
                <div
                  key={group.sessionId ?? invite.id}
                  className="w-full text-left card-standard p-3 hover:bg-muted/30 transition-colors"
                >
                  <button
                    onClick={() =>
                      setExpandedInvite(isExpanded ? null : invite.id)
                    }
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">
                          {isSent ? `You invited ${otherNameDisplay}` : `${otherNameDisplay} invited you`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(parseISO(invite.proposed_date), "MMM d")} ·{" "}
                          {invite.invite_type}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            displayStatus === "accepted"
                              ? "default"
                              : displayStatus === "pending"
                                ? "outline"
                                : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {displayStatus}
                        </Badge>
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                    <>
                      {hasCombined ? (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <CombinedWorkoutDisplay data={combined} />
                        </div>
                      ) : steps && steps.length > 0 ? (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <WorkoutStepsDisplay steps={steps} workoutType={(expandedWorkout as { type?: string })?.type} />
                        </div>
                      ) : expandedWorkout ? (
                        <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                          <p className="font-medium text-foreground">{(expandedWorkout as { type?: string; name?: string; description?: string }).type ?? "Workout"}</p>
                          <p>{(expandedWorkout as { type?: string; name?: string; description?: string }).name ?? (expandedWorkout as { description?: string }).description ?? "—"}</p>
                        </div>
                      ) : null}
                      <div className="mt-2 pt-2 border-t border-border/50 flex justify-between items-center">
                        <div>
                          {!isSent && invite.status === "accepted" && combined && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() =>
                                arrangeWeek.mutate(invite.id, {
                                  onSuccess: () => toast.success("Week arranged! Check your Training Plan."),
                                  onError: () => toast.error("Could not arrange week"),
                                })
                              }
                              disabled={arrangeWeek.isPending}
                            >
                              {arrangeWeek.isPending ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Calendar className="w-3 h-3 mr-1" />
                              )}
                              Arrange week
                            </Button>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            deleteInvite.mutate(
                              { inviteId: invite.id, sessionId: group.sessionId, isSent },
                              {
                                onSuccess: () => toast.success("Invite deleted"),
                                onError: () => toast.error("Could not delete invite"),
                              }
                            )
                          }
                          disabled={deleteInvite.isPending}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {received.length === 0 && sent.length === 0 && friends.length > 0 && (
        <div className="text-center py-12">
          <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No workout invites yet. Send one to train with a friend!
          </p>
        </div>
      )}

      <NewInviteSheet
        open={showNewInvite}
        onClose={() => setShowNewInvite(false)}
        friends={friends}
      />
    </div>
  );
}
