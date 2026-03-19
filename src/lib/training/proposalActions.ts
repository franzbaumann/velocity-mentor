/**
 * Proposal actions — approve, modify, reject, open chat with context.
 */

import { supabase } from "@/integrations/supabase/client";
import { SESSION_LIBRARY } from "./sessionLibrary";
import type { SelectedSession } from "./sessionSelector";
import type { ProposedSession, WeekProposal, WeekSummary } from "./weekProposal";
import { format } from "date-fns";
import { formatPace } from "./vdot";
import type { PaceProfile } from "./vdot";
import { buildSessionStructureFromSelected } from "./sessionStructureUi";

/** Build a minimal SelectedSession from a library session and pace profile */
function buildSelectedSessionFromLibrary(
  sessionId: string,
  targetKm: number,
  paceProfile: PaceProfile
): SelectedSession | null {
  const lib = SESSION_LIBRARY.find((s) => s.id === sessionId);
  if (!lib) return null;

  const p = paceProfile.paces;
  const easyPace = `${formatPace(p.easy.min)}-${formatPace(p.easy.max)}/km`;

  return {
    sessionLibraryId: lib.id,
    sessionName: lib.name,
    category: lib.category,
    targetDistanceKm: Math.min(targetKm, lib.distanceKmMax ?? targetKm),
    targetDurationMinutes: lib.durationMinRange,
    structure: {
      warmup: { distanceKm: 1, pace: easyPace, instructions: "Easy jog" },
      main: { description: lib.description, recoveryType: "jog" },
      cooldown: { distanceKm: 1, pace: easyPace, instructions: "Easy jog" },
      totalDistanceKm: targetKm,
      totalDurationMinutes: Math.round(targetKm * 6),
    },
    paceGuidance: {
      primaryMetric: "pace",
      targetPace: easyPace,
      description: lib.description,
    },
    coachingNote: lib.purpose,
    whyThisSession: `Swapped to ${lib.name} per athlete request.`,
  };
}

export async function approveProposal(
  proposalId: string,
  userId: string
): Promise<void> {
  const { data: proposal, error: fetchErr } = await supabase
    .from("week_proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .single();

  if (fetchErr || !proposal) {
    throw new Error("Proposal not found or already responded");
  }

  const { data: plan } = await supabase
    .from("training_plan")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) throw new Error("No active plan");

  const sessions = (proposal.sessions_json as ProposedSession[]) ?? [];
  for (const ps of sessions) {
    const dateStr = typeof ps.date === "string" ? ps.date : format(new Date(ps.date), "yyyy-MM-dd");
    const session = ps.selectedSession;

    const sessionStructure = buildSessionStructureFromSelected(session);
    const controlTool =
      sessionStructure.control_tool === "heart_rate"
        ? "heart_rate"
        : sessionStructure.control_tool === "rpe"
          ? "rpe"
          : "pace";

    await supabase
      .from("training_plan_workout")
      .update({
        session_id: session.sessionLibraryId,
        session_library_id: session.sessionLibraryId,
        name: session.sessionName,
        description: session.structure.main.description,
        distance_km: session.targetDistanceKm,
        duration_minutes: session.targetDurationMinutes,
        target_distance_km: session.targetDistanceKm,
        target_duration_minutes: session.targetDurationMinutes,
        target_pace: session.paceGuidance.targetPace ?? null,
        structure_json: session.structure,
        pace_guidance_json: session.paceGuidance,
        session_structure: sessionStructure,
        control_tool: controlTool,
        coach_note: session.coachingNote,
        why_this_session: session.whyThisSession,
        primary_metric: session.paceGuidance.primaryMetric,
        key_focus: sessionStructure.key_focus,
        is_skeleton: false,
      })
      .eq("plan_id", plan.id)
      .eq("date", dateStr);
  }

  await supabase
    .from("week_proposals")
    .update({ status: "approved", responded_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("user_id", userId);
}

export async function modifySession(
  proposalId: string,
  date: Date,
  newSessionLibraryId: string,
  userId: string,
  paceProfile: PaceProfile
): Promise<WeekProposal> {
  const { data: proposal, error: fetchErr } = await supabase
    .from("week_proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .single();

  if (fetchErr || !proposal) {
    throw new Error("Proposal not found or already responded");
  }

  const sessions = (proposal.sessions_json as Array<ProposedSession & { date: string }>) ?? [];
  const dateStr = format(date, "yyyy-MM-dd");
  const idx = sessions.findIndex(
    (s) => (typeof s.date === "string" ? s.date : format(new Date(s.date), "yyyy-MM-dd")) === dateStr
  );
  if (idx === -1) throw new Error("Session not found for date");

  const prev = sessions[idx]!;
  const targetKm = prev.selectedSession?.targetDistanceKm ?? 10;
  const newSelected = buildSelectedSessionFromLibrary(newSessionLibraryId, targetKm, paceProfile);
  if (!newSelected) throw new Error("Invalid session library ID");

  const updated: ProposedSession & { date: string } = {
    ...prev,
    date: dateStr,
    selectedSession: newSelected,
    isModified: true,
    originalSession: prev.selectedSession,
  };
  sessions[idx] = updated;

  const { data: updatedRow, error: updateErr } = await supabase
    .from("week_proposals")
    .update({ sessions_json: sessions })
    .eq("id", proposalId)
    .eq("user_id", userId)
    .select()
    .single();

  if (updateErr) throw updateErr;

  return {
    id: updatedRow.id,
    userId: updatedRow.user_id,
    status: updatedRow.status as WeekProposal["status"],
    weekStartDate: new Date(updatedRow.week_start_date),
    weeksGenerated: 2,
    sessions: (updatedRow.sessions_json as ProposedSession[]).map((s) => ({
      ...s,
      date: new Date(typeof s.date === "string" ? s.date : (s as { date: Date }).date),
    })),
    weekSummary: updatedRow.week_summary_json as WeekSummary,
    coachMessage: updatedRow.coach_message,
    generatedAt: new Date(updatedRow.generated_at),
    respondedAt: updatedRow.responded_at ? new Date(updatedRow.responded_at) : undefined,
  };
}

export async function rejectProposal(proposalId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("week_proposals")
    .update({ status: "rejected", responded_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function openChatWithProposalContext(
  proposalId: string,
  userId: string
): Promise<{ contextMessage: string }> {
  const { data: proposal, error } = await supabase
    .from("week_proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("user_id", userId)
    .single();

  if (error || !proposal) {
    throw new Error("Proposal not found");
  }

  const summary = proposal.week_summary_json as WeekSummary;
  const sessions = (proposal.sessions_json as ProposedSession[]) ?? [];
  const prop = summary?.proposedWeek ?? {};
  const keySessions = sessions
    .slice(0, 5)
    .map((s) => s.selectedSession?.sessionName)
    .filter(Boolean);
  const prev = summary?.previousWeek ?? {};

  const contextMessage = `[CONTEXT: Athlete is reviewing their week proposal.
Proposed week: ${prop.totalKm ?? 0}km, phase: ${prop.phase ?? "—"}
Key sessions: ${keySessions.join(", ") || "—"}
Previous week: ${prev.actualKm ?? 0}km completed
The athlete may have questions about session choices, timing, or want to make changes. Be ready to explain and adjust the proposal if asked.]`;

  return { contextMessage };
}
