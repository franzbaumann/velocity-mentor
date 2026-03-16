import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  Check,
  X,
  Loader2,
  Send,
  Users,
  Dumbbell,
} from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { toast } from "sonner";
import type { FriendProfile } from "@/hooks/useFriends";

function useWorkoutInvites() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["workout-invites", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { received: [], sent: [] };

      const { data: received } = await supabase
        .from("workout_invite")
        .select("*")
        .eq("to_user", user.id)
        .order("created_at", { ascending: false });

      const { data: sent } = await supabase
        .from("workout_invite")
        .select("*")
        .eq("from_user", user.id)
        .order("created_at", { ascending: false });

      return {
        received: received ?? [],
        sent: sent ?? [],
      };
    },
    staleTime: 30_000,
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
        const { data: invite } = await supabase
          .from("workout_invite")
          .select("*")
          .eq("id", inviteId)
          .single();

        if (invite && !invite.combined_workout) {
          await supabase.auth.refreshSession();
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
            await fetch(`${baseUrl}/functions/v1/combined-workout`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
              },
              body: JSON.stringify({ invite_id: inviteId }),
            });
          }
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

      const { error } = await supabase.from("workout_invite").insert({
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
  const [selectedFriend, setSelectedFriend] = useState<string>("");
  const [proposedDate, setProposedDate] = useState(
    format(addDays(new Date(), 1), "yyyy-MM-dd")
  );
  const [message, setMessage] = useState("");
  const [inviteType, setInviteType] = useState<"combined" | "parallel">("combined");
  const sendInvite = useSendInvite();

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
        .select("type, name, description, distance_km, duration_minutes, target_pace")
        .eq("plan_id", plan.id)
        .eq("date", proposedDate)
        .limit(5);
      return workouts ?? [];
    },
    staleTime: 60_000,
  });

  const handleSend = () => {
    if (!selectedFriend || !proposedDate) return;

    sendInvite.mutate(
      { toUser: selectedFriend, proposedDate, message, inviteType },
      {
        onSuccess: () => {
          toast.success("Workout invite sent!");
          setSelectedFriend("");
          setMessage("");
          onClose();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Run Together</SheetTitle>
          <SheetDescription>Send a workout invite to a friend. Choose a date and optional message.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Friend
            </label>
            <Select value={selectedFriend} onValueChange={setSelectedFriend}>
              <SelectTrigger>
                <SelectValue placeholder="Select a friend" />
              </SelectTrigger>
              <SelectContent>
                {friends.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              Your plan for {format(parseISO(proposedDate), "EEE, MMM d")}
            </p>
            {myPlanWorkouts && myPlanWorkouts.length > 0 ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {(myPlanWorkouts as { type?: string; name?: string; description?: string; distance_km?: number; duration_minutes?: number; target_pace?: string }[]).map((w, i) => {
                  const parts = [w.type, w.name, w.description, w.distance_km ? `${w.distance_km} km` : null, w.duration_minutes ? `${w.duration_minutes} min` : null, w.target_pace ? `@ ${w.target_pace}` : null].filter(Boolean);
                  return <p key={i} className={i > 0 ? "mt-1" : ""}>{parts.join(" · ") || "Workout"}</p>;
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No planned workout for this date</p>
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
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Users className="w-5 h-5 mb-1.5 text-primary" />
                <p className="text-sm font-medium">Combined</p>
                <p className="text-xs text-muted-foreground">
                  Kipcoachee merges both plans into one shared session
                </p>
              </button>
              <button
                onClick={() => setInviteType("parallel")}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  inviteType === "parallel"
                    ? "border-primary bg-primary/5"
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

          <Button
            className="w-full"
            onClick={handleSend}
            disabled={!selectedFriend || !proposedDate || sendInvite.isPending}
          >
            {sendInvite.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send Invite
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type CombinedPreview = {
  summary?: string;
  athlete_a?: { name: string; workout?: string; adapted_workout?: string };
  athlete_b?: { name: string; workout?: string; adapted_workout?: string };
};

export function WorkoutInvites({ friends }: { friends: FriendProfile[] }) {
  const { user } = useAuth();
  const { data, isLoading } = useWorkoutInvites();
  const respond = useRespondToInvite();
  const [showNewInvite, setShowNewInvite] = useState(false);
  const [expandedInvite, setExpandedInvite] = useState<string | null>(null);
  const [previewInviteId, setPreviewInviteId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<CombinedPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchPreview = async (inviteId: string) => {
    if (previewInviteId === inviteId && previewData) return;
    setPreviewLoading(true);
    setPreviewInviteId(inviteId);
    setPreviewData(null);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
      const res = await fetch(`${baseUrl}/functions/v1/combined-workout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
        },
        body: JSON.stringify({ invite_id: inviteId, preview: true }),
      });
      if (res.ok) {
        const json = await res.json();
        setPreviewData((json.combined_workout ?? null) as CombinedPreview | null);
      } else {
        if (res.status === 401) {
          toast.error("Session expired. Sign out and sign in again to view the workout.");
        } else {
          toast.error("Could not load workout preview");
        }
      }
    } catch {
      toast.error("Could not load workout preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const friendNameMap = new Map(friends.map((f) => [f.id, f.name]));
  const received = data?.received ?? [];
  const sent = data?.sent ?? [];
  const pendingReceived = received.filter((r) => r.status === "pending");
  const autoFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingReceived.length !== 1 || isLoading) return;
    const inviteId = pendingReceived[0].id;
    if (autoFetchedRef.current === inviteId) return;
    autoFetchedRef.current = inviteId;
    fetchPreview(inviteId);
  }, [pendingReceived.length, pendingReceived[0]?.id, isLoading]);

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
                  <div className="flex flex-wrap gap-2 items-center mb-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => fetchPreview(invite.id)}
                      disabled={previewLoading && previewInviteId === invite.id}
                    >
                      {previewLoading && previewInviteId === invite.id ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Dumbbell className="w-3 h-3 mr-1" />
                      )}
                      See workout
                    </Button>
                  </div>
                  {previewInviteId === invite.id && previewData && (
                    <div className="mb-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground mb-1">Kipcoachee&apos;s Plan</p>
                      <p>{previewData.summary}</p>
                      {previewData.athlete_a && (
                        <p className="mt-1">
                          <span className="font-medium">{previewData.athlete_a.name}:</span>{" "}
                          {previewData.athlete_a.adapted_workout ?? previewData.athlete_a.workout}
                        </p>
                      )}
                      {previewData.athlete_b && (
                        <p>
                          <span className="font-medium">{previewData.athlete_b.name}:</span>{" "}
                          {previewData.athlete_b.adapted_workout ?? previewData.athlete_b.workout}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        respond.mutate(
                          { inviteId: invite.id, action: "accepted" },
                          {
                            onSuccess: () =>
                              toast.success("Accepted! Kipcoachee is creating your shared workout..."),
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
            {[...sent, ...received.filter((r) => r.status !== "pending")]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 10)
              .map((invite) => {
                const isSent = invite.from_user === user?.id;
                const otherName = friendNameMap.get(
                  isSent ? invite.to_user : invite.from_user
                ) ?? "Friend";
                const combined = invite.combined_workout as {
                  summary?: string;
                  athlete_a?: { name: string; workout: string };
                  athlete_b?: { name: string; workout: string };
                } | null;

                return (
                  <button
                    key={invite.id}
                    onClick={() =>
                      setExpandedInvite(expandedInvite === invite.id ? null : invite.id)
                    }
                    className="w-full text-left card-standard p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">
                          {isSent ? `You invited ${otherName}` : `${otherName} invited you`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(parseISO(invite.proposed_date), "MMM d")} ·{" "}
                          {invite.invite_type}
                        </div>
                      </div>
                      <Badge
                        variant={
                          invite.status === "accepted"
                            ? "default"
                            : invite.status === "pending"
                              ? "outline"
                              : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {invite.status}
                      </Badge>
                    </div>
                    {expandedInvite === invite.id && combined?.summary && (
                      <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground mb-1">Kipcoachee&apos;s Plan</p>
                        <p>{combined.summary}</p>
                        {combined.athlete_a && (
                          <p className="mt-1">
                            <span className="font-medium">{combined.athlete_a.name}:</span>{" "}
                            {combined.athlete_a.workout}
                          </p>
                        )}
                        {combined.athlete_b && (
                          <p>
                            <span className="font-medium">{combined.athlete_b.name}:</span>{" "}
                            {combined.athlete_b.workout}
                          </p>
                        )}
                      </div>
                    )}
                  </button>
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
