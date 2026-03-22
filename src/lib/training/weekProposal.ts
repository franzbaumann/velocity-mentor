/**
 * Weekly Plan Proposal — triggers when a new week needs sessions selected,
 * generates a 2-week proposal via Session Selector and Coach Cade message.
 */

import { supabase } from "@/integrations/supabase/client";
import { resolveCtlAtlTsb } from "@/hooks/useReadiness";
import type { AthleteInput, GoalDistance, TrainingPhase } from "./planArchitect";
import {
  selectSessionsForWeeks,
  type SelectedSession,
} from "./sessionSelector";
import { calculatePaceProfile } from "./vdot";
import type { TargetDistance } from "./sessionLibrary";
import { startOfWeek, addDays, subDays, format } from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WeekSummary {
  previousWeek: {
    plannedKm: number;
    actualKm: number;
    qualitySessions: number;
    completedSessions: number;
    avgHRV?: number;
    avgTLS?: number;
    note: string;
  };
  proposedWeek: {
    totalKm: number;
    qualitySessions: number;
    longestRunKm: number;
    phase: string;
    focus: string;
  };
}

export interface ProposedSession {
  date: Date;
  dayOfWeek: string;
  selectedSession: SelectedSession;
  isModified: boolean;
  originalSession?: SelectedSession;
}

export interface WeekProposal {
  id: string;
  userId: string;
  status: "pending" | "approved" | "modified" | "rejected";
  weekStartDate: Date;
  weeksGenerated: 2;
  sessions: ProposedSession[];
  weekSummary: WeekSummary;
  coachMessage: string;
  generatedAt: Date;
  respondedAt?: Date;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapGoalDistance(g: string | null): GoalDistance {
  const t = (g ?? "").toLowerCase().replace(/\s/g, "_");
  if (["1500m", "5k", "10k", "half_marathon", "marathon", "ultra"].includes(t)) {
    return t as GoalDistance;
  }
  if (t.includes("marathon") && !t.includes("half")) return "marathon";
  if (t.includes("half")) return "half_marathon";
  if (t.includes("10")) return "10k";
  if (t.includes("5")) return "5k";
  if (t.includes("ultra")) return "ultra";
  return "marathon";
}

function goalDistanceToTarget(g: GoalDistance): TargetDistance {
  return g as TargetDistance;
}

/** Parse "3:30:00" or "1:45" to seconds */
function parseTimeToSeconds(s: string | null | undefined): number | undefined {
  if (!s || typeof s !== "string") return undefined;
  const parts = s.trim().split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => isNaN(n))) return undefined;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 1) return parts[0];
  return undefined;
}

// ─── generateCoachMessage ───────────────────────────────────────────────────

async function generateCoachMessage(
  summary: WeekSummary,
  sessions: ProposedSession[],
  athleteName?: string
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("week-proposal-message", {
    body: {
      weekSummary: summary,
      proposalSessions: sessions,
      athleteName: athleteName ?? "",
    },
  });
  if (error) throw error;
  const msg = data?.message;
  if (typeof msg !== "string" || !msg.trim()) {
    return "Here's your week. Review and approve when ready.";
  }
  return msg.trim();
}

// ─── checkAndGenerateProposal ───────────────────────────────────────────────

export async function checkAndGenerateProposal(userId: string): Promise<WeekProposal | null> {
  const today = new Date();
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
  const thisMondayStr = format(thisMonday, "yyyy-MM-dd");
  const twoWeeksEnd = addDays(thisMonday, 14);
  const twoWeeksEndStr = format(twoWeeksEnd, "yyyy-MM-dd");

  // 1. Fetch active plan
  const { data: plan, error: planErr } = await supabase
    .from("training_plan")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planErr || !plan) return null;

  const planId = plan.id;

  // 2. Check existing pending proposal
  const { data: existing } = await supabase
    .from("week_proposals")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start_date", thisMondayStr)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return rowToProposal(existing);
  }

  // 3. Fetch skeleton workouts for next 2 weeks
  const { data: workouts } = await supabase
    .from("training_plan_workout")
    .select("*")
    .eq("plan_id", planId)
    .gte("date", thisMondayStr)
    .lt("date", twoWeeksEndStr)
    .order("date", { ascending: true });

  const skeletonWorkouts = (workouts ?? []).filter(
    (w) => (w as { is_skeleton?: boolean }).is_skeleton === true
  );

  // 4. Trigger conditions
  const hasSkeletonOnly =
    skeletonWorkouts.length > 0 &&
    (workouts ?? []).every((w) => (w as { is_skeleton?: boolean }).is_skeleton === true);

  const hasAnyWorkouts = (workouts ?? []).length > 0;
  const hasApprovedWorkouts = (workouts ?? []).some(
    (w) => (w as { is_skeleton?: boolean }).is_skeleton === false
  );

  const prevMonday = subDays(thisMonday, 7);
  const prevSunday = subDays(thisMonday, 1);
  const { data: prevWeekWorkouts } = await supabase
    .from("training_plan_workout")
    .select("id, completed")
    .eq("plan_id", planId)
    .gte("date", format(prevMonday, "yyyy-MM-dd"))
    .lte("date", format(prevSunday, "yyyy-MM-dd"));

  const prevWeekAllCompleted =
    (prevWeekWorkouts ?? []).length > 0 &&
    (prevWeekWorkouts ?? []).every((w) => (w as { completed?: boolean }).completed === true);

  const isMonday = today.getDay() === 1;
  const next7DaysEmpty =
    !hasAnyWorkouts ||
    (workouts ?? []).filter((w) => {
      const d = w.date ? new Date(w.date) : null;
      return d && d >= today && d < addDays(today, 7);
    }).length === 0;

  const shouldGenerate =
    (isMonday && !hasApprovedWorkouts) ||
    prevWeekAllCompleted ||
    (hasSkeletonOnly && skeletonWorkouts.length > 0) ||
    next7DaysEmpty;

  if (!shouldGenerate || skeletonWorkouts.length === 0) return null;

  // 5. Build athlete context
  const { data: profile } = await supabase
    .from("athlete_profile")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: readinessRows } = await supabase
    .from("daily_readiness")
    .select("*")
    .eq("user_id", userId)
    .gte("date", subDays(today, 14).toISOString().slice(0, 10))
    .order("date", { ascending: false })
    .limit(14);

  const latestReadiness = readinessRows?.[0];
  const { ctl, tsb } = latestReadiness
    ? resolveCtlAtlTsb(latestReadiness as Parameters<typeof resolveCtlAtlTsb>[0])
    : { ctl: null, tsb: null };

  const { data: loadRows } = await supabase
    .from("daily_load")
    .select("total_load_score")
    .eq("user_id", userId)
    .gte("date", subDays(today, 7).toISOString().slice(0, 10))
    .order("date", { ascending: false })
    .limit(7);

  const avgTLS =
    loadRows?.length && loadRows.some((r) => r.total_load_score != null)
      ? loadRows.reduce((s, r) => s + (r.total_load_score ?? 0), 0) /
        loadRows.filter((r) => r.total_load_score != null).length
      : undefined;

  const paceProfile =
    (plan.pace_profile as { paces?: unknown; source?: string } | null) != null
      ? (plan.pace_profile as {
          paces: AthleteInput["paceProfile"]["paces"];
          source: AthleteInput["paceProfile"]["source"];
          vdot?: number;
          confidence: "high" | "medium" | "low";
          lastUpdated: string;
          sourceDescription: string;
        })
      : calculatePaceProfile({
          recentRaces: [],
        });

  const goalDistance = mapGoalDistance(
    plan.goal_race?.trim() || profile?.goal_distance?.trim() || null
  );
  const goalRaceDate = profile?.goal_race_date
    ? new Date(profile.goal_race_date)
    : plan.start_date
      ? addDays(new Date(plan.start_date), (plan.total_weeks ?? 14) * 7)
      : addDays(today, 14 * 7);

  const injuryHistory: string[] = Array.isArray(profile?.injury_history)
    ? (profile.injury_history as string[])
    : profile?.injury_history_text
      ? [profile.injury_history_text]
      : [];

  const athleteInput: AthleteInput = {
    userId,
    goalDistance,
    goalRaceDate,
    goalTimeSeconds: profile?.goal_time_seconds ?? parseTimeToSeconds(profile?.goal_time ?? plan.goal_time),
    currentWeeklyKm: Number(profile?.current_weekly_km ?? 50),
    trainingDaysPerWeek: profile?.training_days_per_week ?? profile?.days_per_week ?? 5,
    longestSessionMinutes: profile?.longest_session_minutes ?? 90,
    doubleRunsEnabled: profile?.double_runs_enabled ?? false,
    doubleRunDays: (profile?.double_run_days as string[]) ?? [],
    doubleRunDurationMinutes: profile?.double_run_duration ?? 30,
    experienceLevel:
      (profile?.experience_level as AthleteInput["experienceLevel"]) ?? "building",
    injuryHistory,
    paceProfile,
  };

  // 6. Build days for selectSessionsForWeeks
  const planStart = plan.start_date ? new Date(plan.start_date) : thisMonday;
  const totalWeeks = plan.total_weeks ?? 14;

  const days = skeletonWorkouts.map((w) => {
    const date = new Date(w.date!);
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const weekNum = Math.floor(
      (date.getTime() - startOfWeek(planStart, { weekStartsOn: 1 }).getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    ) + 1;
    const phase = (w.phase as TrainingPhase) ?? "base";
    const phaseStructure = plan.phase_structure as
      | { base?: { startWeek: number; endWeek: number }; build?: { startWeek: number; endWeek: number }; peak?: { startWeek: number; endWeek: number }; taper?: { startWeek: number; endWeek: number } }
      | null;
    let weekNumberInPhase = 1;
    if (phaseStructure) {
      const phaseRange = phaseStructure[phase as keyof typeof phaseStructure];
      if (phaseRange && "startWeek" in phaseRange) {
        weekNumberInPhase = Math.max(1, weekNum - (phaseRange.startWeek ?? 1) + 1);
      }
    }
    const dayType = (w as { skeleton_session_type?: string }).skeleton_session_type ?? "easy";
    return {
      date,
      dayType,
      targetVolumeKm: Number(w.target_distance_km ?? w.distance_km ?? 10),
      phase,
      weekNumber: weekNum,
      weekNumberInPhase,
    };
  });

  if (days.length === 0) return null;

  // 7. Call selectSessionsForWeeks
  const selectedSessions = await selectSessionsForWeeks({
    days,
    athleteContext: {
      targetDistance: goalDistanceToTarget(goalDistance),
      paceProfile,
      philosophy: profile?.recommended_philosophy ?? profile?.training_philosophy ?? undefined,
      previousSessions: [],
      currentCTL: ctl ?? 50,
      currentTSB: tsb ?? 0,
      injuryFlags: injuryHistory,
      totalWeeks,
    },
  });

  // 8. Build ProposedSession[] and WeekSummary
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const proposedSessions: ProposedSession[] = days.map((d, i) => ({
    date: d.date,
    dayOfWeek: dayNames[d.date.getDay()],
    selectedSession: selectedSessions[i]!,
    isModified: false,
  }));

  const proposedTotalKm = proposedSessions.reduce(
    (s, p) => s + (p.selectedSession.targetDistanceKm ?? 0),
    0
  );
  const proposedQuality = proposedSessions.filter(
    (p) => p.selectedSession.category === "quality"
  ).length;
  const proposedLongest = Math.max(
    ...proposedSessions.map((p) => p.selectedSession.targetDistanceKm ?? 0),
    0
  );

  const { data: prevWeekActivities } = await supabase
    .from("activity")
    .select("distance_km, date, type")
    .eq("user_id", userId)
    .gte("date", format(prevMonday, "yyyy-MM-dd"))
    .lte("date", format(prevSunday, "yyyy-MM-dd"))
    .eq("type", "Run");

  const prevActualKm = (prevWeekActivities ?? []).reduce(
    (s, a) => s + (a.distance_km ?? 0),
    0
  );

  const { data: prevWeekPlanned } = await supabase
    .from("training_plan_workout")
    .select("distance_km, session_category, completed")
    .eq("plan_id", planId)
    .gte("date", format(prevMonday, "yyyy-MM-dd"))
    .lte("date", format(prevSunday, "yyyy-MM-dd"));

  const prevPlannedKm = (prevWeekPlanned ?? []).reduce(
    (s, w) => s + (w.distance_km ?? 0),
    0
  );
  const prevQualityCompleted = (prevWeekPlanned ?? []).filter(
    (w) =>
      (w as { session_category?: string }).session_category === "quality" &&
      (w as { completed?: boolean }).completed === true
  ).length;
  const prevCompleted = (prevWeekPlanned ?? []).filter(
    (w) => (w as { completed?: boolean }).completed === true
  ).length;

  const hrvVals = (readinessRows ?? [])
    .filter((r) => r.date >= format(prevMonday, "yyyy-MM-dd") && r.date <= format(prevSunday, "yyyy-MM-dd"))
    .map((r) => r.hrv ?? (r as { hrv_rmssd?: number }).hrv_rmssd)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const avgHRV = hrvVals.length ? hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length : undefined;

  const phaseFocus: Record<string, string> = {
    base: "Aerobic base building",
    build: "Threshold development",
    peak: "Race-specific sharpening",
    taper: "Recovery and race prep",
  };

  const weekSummary: WeekSummary = {
    previousWeek: {
      plannedKm: Math.round(prevPlannedKm * 10) / 10,
      actualKm: Math.round(prevActualKm * 10) / 10,
      qualitySessions: prevQualityCompleted,
      completedSessions: prevCompleted,
      avgHRV: avgHRV != null ? Math.round(avgHRV) : undefined,
      avgTLS: avgTLS != null ? Math.round(avgTLS) : undefined,
      note:
        prevActualKm >= prevPlannedKm * 0.9
          ? "Strong week — you hit your targets"
          : prevActualKm > 0
            ? "Solid effort — a bit under target"
            : "Rest week or no data",
    },
    proposedWeek: {
      totalKm: Math.round(proposedTotalKm * 10) / 10,
      qualitySessions: proposedQuality,
      longestRunKm: Math.round(proposedLongest * 10) / 10,
      phase: (plan.current_phase as string) ?? "build",
      focus: phaseFocus[(plan.current_phase as string) ?? "build"] ?? "Training",
    },
  };

  // 9. Generate coach message
  const coachMessage = await generateCoachMessage(
    weekSummary,
    proposedSessions,
    profile?.name
  );

  // 10. Insert into week_proposals
  const sessionsJson = proposedSessions.map((p) => ({
    ...p,
    date: format(p.date, "yyyy-MM-dd"),
    selectedSession: p.selectedSession,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("week_proposals")
    .insert({
      user_id: userId,
      status: "pending",
      week_start_date: thisMondayStr,
      sessions_json: sessionsJson,
      week_summary_json: weekSummary,
      coach_message: coachMessage,
    })
    .select()
    .single();

  if (insertErr) throw insertErr;
  return inserted ? rowToProposal(inserted) : null;
}

function rowToProposal(row: {
  id: string;
  user_id: string;
  status: string;
  week_start_date: string;
  sessions_json: unknown;
  week_summary_json: unknown;
  coach_message: string;
  generated_at: string;
  responded_at?: string | null;
}): WeekProposal {
  const sessions = (row.sessions_json as Array<{ date: string; dayOfWeek: string; selectedSession: SelectedSession; isModified?: boolean; originalSession?: SelectedSession }>) ?? [];
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status as WeekProposal["status"],
    weekStartDate: new Date(row.week_start_date),
    weeksGenerated: 2,
    sessions: sessions.map((s) => ({
      date: new Date(s.date),
      dayOfWeek: s.dayOfWeek,
      selectedSession: s.selectedSession,
      isModified: s.isModified ?? false,
      originalSession: s.originalSession,
    })),
    weekSummary: (row.week_summary_json as WeekSummary) ?? {
      previousWeek: { plannedKm: 0, actualKm: 0, qualitySessions: 0, completedSessions: 0, note: "" },
      proposedWeek: { totalKm: 0, qualitySessions: 0, longestRunKm: 0, phase: "", focus: "" },
    },
    coachMessage: row.coach_message ?? "",
    generatedAt: new Date(row.generated_at),
    respondedAt: row.responded_at ? new Date(row.responded_at) : undefined,
  };
}
