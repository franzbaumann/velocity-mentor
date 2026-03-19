/**
 * Your Week — shows pending proposal, approved week, or no-plan state.
 * Placed between Readiness Card and Season widget on dashboard.
 */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTrainingPlan } from "@/hooks/use-training-plan";
import { checkAndGenerateProposal, type ProposedSession, type WeekProposal } from "@/lib/training/weekProposal";
import {
  approveProposal,
  modifySession,
  rejectProposal,
  openChatWithProposalContext,
} from "@/lib/training/proposalActions";
import { SESSION_LIBRARY } from "@/lib/training/sessionLibrary";
import { calculatePaceProfile } from "@/lib/training/vdot";
import { startOfWeek, addDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
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
import { Check, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function SessionDetailPanel({
  session,
  open,
  onOpenChange,
  onModify,
  canModify,
}: {
  session: ProposedSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModify?: (newSessionId: string) => void;
  canModify?: boolean;
}) {
  if (!session) return null;
  const s = session.selectedSession;
  const st = s.structure;
  const category = s.category;
  const alternatives = SESSION_LIBRARY.filter(
    (lib) =>
      lib.category === category ||
      (category === "long" && (lib.category === "easy" || lib.category === "long")) ||
      (category === "easy" && (lib.category === "easy" || lib.category === "long"))
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{s.sessionName}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4 text-sm">
          <p className="text-muted-foreground text-xs">ID: {s.sessionLibraryId}</p>
          <div>
            <p className="font-medium text-foreground mb-1">Warmup</p>
            <p className="text-muted-foreground">
              {st.warmup.distanceKm}km @ {st.warmup.pace || "easy"} — {st.warmup.instructions}
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Main set</p>
            <p className="text-muted-foreground">{st.main.description}</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Cooldown</p>
            <p className="text-muted-foreground">
              {st.cooldown.distanceKm}km @ {st.cooldown.pace || "easy"} — {st.cooldown.instructions}
            </p>
          </div>
          <p className="text-muted-foreground">
            Total: {st.totalDistanceKm}km · ~{st.totalDurationMinutes} min
          </p>
          <p className="text-muted-foreground">
            Primary metric: {s.paceGuidance.primaryMetric}
            {s.paceGuidance.targetPace && ` · ${s.paceGuidance.targetPace}`}
          </p>
          <div>
            <p className="font-medium text-foreground mb-1">Coach note</p>
            <p className="text-muted-foreground">{s.coachingNote}</p>
          </div>
          {canModify && onModify && alternatives.length > 1 && (
            <div className="pt-4 border-t">
              <p className="font-medium text-foreground mb-2">Change session</p>
              <Select
                onValueChange={(v) => {
                  onModify(v);
                  onOpenChange(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick alternative" />
                </SelectTrigger>
                <SelectContent>
                  {alternatives.map((lib) => (
                    <SelectItem key={lib.id} value={lib.id}>
                      {lib.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function WeekProposal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { plan } = useTrainingPlan();
  const [generating, setGenerating] = useState(false);
  const [detailSession, setDetailSession] = useState<ProposedSession | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const thisMondayStr = format(thisMonday, "yyyy-MM-dd");

  const { data: proposal, isLoading: proposalLoading } = useQuery({
    queryKey: ["week-proposal", user?.id, thisMondayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("week_proposals")
        .select("*")
        .eq("user_id", user!.id)
        .eq("week_start_date", thisMondayStr)
        .in("status", ["pending", "approved"])
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user || generating) return;
    setGenerating(true);
    checkAndGenerateProposal(user.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["week-proposal"] });
      })
      .catch(() => {
        // Silent — proposal may not be needed
      })
      .finally(() => setGenerating(false));
  }, [user?.id, queryClient]);

  const pendingProposal = proposal?.status === "pending" ? proposal : null;
  const hasPlan = !!plan?.plan;

  // State 3 — No plan
  if (!hasPlan && !pendingProposal) {
    return (
      <div className="glass-card p-6">
        <p className="text-sm font-medium text-foreground">No active plan</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => navigate("/coach")}
        >
          Build my plan
        </Button>
      </div>
    );
  }

  // State 1 — Pending proposal
  if (pendingProposal) {
    const sessions = (pendingProposal.sessions_json as ProposedSession[]) ?? [];
    const summary = pendingProposal.week_summary_json as WeekProposal["weekSummary"];
    const prop = summary?.proposedWeek ?? {};

    const sessionsByDay = new Map<number, ProposedSession>();
    for (const ps of sessions) {
      const d = typeof ps.date === "string" ? new Date(ps.date) : ps.date;
      sessionsByDay.set(d.getDay(), ps);
    }

    const handleApprove = async () => {
      try {
        await approveProposal(pendingProposal.id, user!.id);
        queryClient.invalidateQueries({ queryKey: ["week-proposal"] });
        queryClient.invalidateQueries({ queryKey: ["training-plan"] });
        toast.success("Week approved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to approve");
      }
    };

    const handleModify = async (date: Date, newSessionId: string) => {
      try {
        const profile = (plan?.plan as { pace_profile?: unknown })?.pace_profile;
        const paceProfile = profile
          ? (profile as Parameters<typeof calculatePaceProfile>[0])
          : calculatePaceProfile({});
        await modifySession(pendingProposal.id, date, newSessionId, user!.id, paceProfile);
        queryClient.invalidateQueries({ queryKey: ["week-proposal"] });
        setModifyDate(null);
        toast.success("Session updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to modify");
      }
    };

    const handleAskCoach = async () => {
      try {
        const { contextMessage } = await openChatWithProposalContext(
          pendingProposal.id,
          user!.id
        );
        sessionStorage.setItem("coach_proposal_context", contextMessage);
        navigate("/coach?from=proposal");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to open chat");
      }
    };

    return (
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Week {((plan?.plan as { current_week?: number })?.current_week ?? 1)} of{" "}
            {(plan?.plan as { total_weeks?: number })?.total_weeks ?? 14} ·{" "}
            {String(prop.phase ?? "Build").toUpperCase()} PHASE
          </h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {pendingProposal.coach_message}
        </p>
        <div className="grid grid-cols-7 gap-2">
          {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
            const ps = sessionsByDay.get(dow);
            const dayLabel = DAY_LABELS[dow === 0 ? 6 : dow - 1];
            return (
              <div key={dow} className="text-center">
                <p className="text-[10px] text-muted-foreground mb-1">{dayLabel}</p>
                {ps ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailSession(ps);
                      setDetailOpen(true);
                    }}
                    className="block w-full rounded-lg border border-border bg-muted/30 px-2 py-2 text-left text-xs hover:bg-muted/50 transition-colors"
                  >
                    <p className="font-medium text-foreground truncate">
                      {ps.selectedSession.sessionName}
                    </p>
                    <p className="text-muted-foreground text-[10px]">
                      {ps.selectedSession.targetDistanceKm > 0
                        ? `${ps.selectedSession.targetDistanceKm}km`
                        : "Rest"}
                    </p>
                    {ps.selectedSession.category === "quality" && (
                      <span className="text-[10px] text-primary">Quality</span>
                    )}
                  </button>
                ) : (
                  <div className="rounded-lg border border-dashed border-muted-foreground/30 px-2 py-2 text-[10px] text-muted-foreground">
                    —
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Total: {prop.totalKm ?? 0}km · {prop.qualitySessions ?? 0} quality sessions
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleApprove}>
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info("Click a session above to change it")}
          >
            Modify
          </Button>
          <Button variant="ghost" size="sm" onClick={handleAskCoach}>
            <MessageCircle className="w-4 h-4 mr-1" />
            Ask Coach Cade
          </Button>
        </div>
        <SessionDetailPanel
          session={detailSession}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onModify={handleModifySession}
          canModify={!!pendingProposal}
        />
      </div>
    );
  }

  // State 2 — Approved, show current week
  const planData = plan as {
    plan?: { current_week?: number; total_weeks?: number };
    weeks?: Array<{
      week_number?: number;
      start_date?: string;
      sessions?: Array<{
        scheduled_date?: string;
        session_type?: string;
        description?: string;
        distance_km?: number;
        completed?: boolean;
      }>;
    }>;
  };
  const weeks = planData?.weeks ?? [];
  const today = new Date();
  const planStart = planData?.plan
    ? new Date((planData.plan as { start_date?: string }).start_date ?? today)
    : today;
  const weekStart = startOfWeek(planStart, { weekStartsOn: 1 });
  const currentWeekNum = Math.max(
    1,
    Math.floor((today.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  );
  const thisWeekData = weeks.find(
    (w: { week_number?: number }) => w.week_number === currentWeekNum
  ) ?? weeks[weeks.length - 1];
  const sessions = (thisWeekData?.sessions ?? []) as Array<{
    scheduled_date?: string;
    session_type?: string;
    description?: string;
    distance_km?: number;
    completed?: boolean;
  }>;

  const mon = startOfWeek(today, { weekStartsOn: 1 });
  const totalKm = sessions.reduce((s, x) => s + (x.distance_km ?? 0), 0);
  const completedKm = sessions
    .filter((s) => s.completed)
    .reduce((sum, s) => sum + (s.distance_km ?? 0), 0);

  return (
    <div className="glass-card p-6">
      <h2 className="text-base font-semibold text-foreground mb-4">
        This Week · Week {currentWeekNum} ·{" "}
        {String((thisWeekData as { phase?: string })?.phase ?? "Build").toUpperCase()}
      </h2>
      <div className="grid grid-cols-7 gap-2">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const d = addDays(mon, i);
          const dateStr = format(d, "yyyy-MM-dd");
          const sess = sessions.find(
            (s) => s.scheduled_date && String(s.scheduled_date).slice(0, 10) === dateStr
          );
          const isToday = dateStr === format(today, "yyyy-MM-dd");
          const dayLabel = DAY_LABELS[i];
          return (
            <div key={i} className="text-center">
              <p className="text-[10px] text-muted-foreground mb-1">{dayLabel}</p>
              {sess ? (
                <div
                  className={`rounded-lg border px-2 py-2 min-h-[72px] text-left text-xs ${
                    isToday ? "ring-2 ring-[#2563EB] dark:ring-primary border-gray-200 dark:border-border bg-muted/30" : "border-border bg-muted/30"
                  }`}
                >
                  {sess.completed && (
                    <Check className="w-3 h-3 text-primary inline mr-1" />
                  )}
                  {isToday && <span className="text-[10px] text-[#2563EB] dark:text-primary font-medium">Today</span>}
                  <p className="font-medium text-foreground truncate">
                    {sess.description || sess.session_type || "Run"}
                  </p>
                  <p className="text-muted-foreground text-[10px]">
                    {sess.distance_km != null ? `${Math.round(sess.distance_km * 10) / 10}km` : "—"}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg min-h-[72px] border border-dashed border-gray-200 dark:border-muted px-2 py-2 text-[10px] text-muted-foreground flex items-center justify-center">
                  —
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        {Math.round(completedKm * 10) / 10} / {Math.round(totalKm * 10) / 10}km completed
      </p>
      {totalKm > 0 && (
        <div className="mt-2 h-1 bg-gray-200 dark:bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-[#2563EB] dark:bg-primary transition-all rounded-full"
            style={{ width: `${Math.min(100, Math.round((completedKm / totalKm) * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}
