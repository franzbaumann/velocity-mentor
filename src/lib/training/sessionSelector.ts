/**
 * Session Selector — selects optimal sessions from the library for each skeleton day.
 * Uses Claude via session-selector edge function. Only place AI is involved in plan generation.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  SESSION_LIBRARY,
  type Session,
  type SessionCategory,
  type TargetDistance,
  type Philosophy,
} from "./sessionLibrary";
import type { PaceProfile } from "./vdot";
import { formatPace } from "./vdot";
import type { TrainingPhase } from "./planArchitect";
import { buildSessionStructureFromSelected } from "./sessionStructureUi";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SessionStructure {
  warmup: { distanceKm: number; pace: string; instructions: string };
  main: {
    description: string;
    sets?: number;
    reps?: number;
    repDistanceM?: number;
    repPace?: string;
    repDurationSeconds?: number;
    recoveryType: "jog" | "walk" | "rest";
    recoveryDurationSeconds?: number;
    recoveryDistanceM?: number;
  };
  cooldown: { distanceKm: number; pace: string; instructions: string };
  totalDistanceKm: number;
  totalDurationMinutes: number;
}

export interface PaceGuidance {
  primaryMetric: "pace" | "hr" | "rpe";
  targetPace?: string;
  targetHRZone?: string;
  targetRPE?: string;
  description: string;
}

export interface SelectedSession {
  sessionLibraryId: string;
  sessionName: string;
  category: SessionCategory;
  targetDistanceKm: number;
  targetDurationMinutes: number;
  structure: SessionStructure;
  paceGuidance: PaceGuidance;
  coachingNote: string;
  whyThisSession: string;
}

const INJURY_KEYWORDS: Record<string, string[]> = {
  achilles: ["hill", "sprint", "speed", "uphill", "downhill"],
  knee: ["hill", "sprint", "downhill", "strides"],
  calf: ["hill", "sprint", "strides"],
  hamstring: ["sprint", "strides", "speed"],
  plantar: ["hill", "sprint"],
};

function isVO2maxSession(s: Session): boolean {
  return (
    s.intensityZone.includes("Z5") ||
    s.intensityZone.includes("Z6") ||
    s.name.toLowerCase().includes("vo2max") ||
    s.name.toLowerCase().includes("interval")
  );
}

function isInjuryExcluded(session: Session, injuryFlags: string[]): boolean {
  const lower = (session.name + " " + session.structure + " " + session.description).toLowerCase();
  for (const flag of injuryFlags) {
    const keywords = INJURY_KEYWORDS[flag.toLowerCase()];
    if (keywords) {
      for (const kw of keywords) {
        if (lower.includes(kw)) return true;
      }
    }
  }
  return false;
}

function mapPhilosophy(philosophy?: string): Philosophy | undefined {
  if (!philosophy) return undefined;
  const m: Record<string, Philosophy> = {
    jack_daniels: "daniels",
    daniels: "daniels",
    pfitzinger: "pfitzinger",
    hansons: "hansons",
    lydiard: "lydiard",
    "80_20": "80_20",
    norwegian: "norwegian",
    japanese: "japanese",
  };
  return m[philosophy.toLowerCase().replace(/\s/g, "_")];
}

/**
 * Get sessions from the library filtered by distance, phase, day type, injuries, and philosophy.
 */
export function getSessionsForDistanceAndPhase(
  targetDistance: TargetDistance,
  phase: TrainingPhase,
  dayType: "easy" | "quality" | "long" | "double" | "rest",
  injuryFlags: string[],
  philosophy?: string,
  currentCTL?: number
): Session[] {
  const mappedPhil = mapPhilosophy(philosophy);

  let filtered = SESSION_LIBRARY.filter((s) => {
    if (!s.targetDistances.includes(targetDistance)) return false;
    if (!s.phases.includes(phase)) return false;

    if (dayType === "rest") return false;

    if (dayType === "easy" || dayType === "long" || dayType === "double") {
      if (s.category !== "easy" && s.category !== "long" && s.category !== "double") return false;
    } else if (dayType === "quality") {
      if (s.category !== "quality") return false;
    }

    if (mappedPhil && s.forbiddenFor?.includes(mappedPhil)) return false;
    if (mappedPhil && s.philosophyForbidden?.includes(mappedPhil)) return false;

    if (s.requiresCTL != null && (currentCTL ?? 0) < s.requiresCTL) return false;

    if (isInjuryExcluded(s, injuryFlags)) return false;

    if (
      (targetDistance === "marathon" || targetDistance === "ultra") &&
      (phase === "base" || phase === "build") &&
      isVO2maxSession(s)
    ) {
      return false;
    }

    return true;
  });

  return filtered;
}

/** Map `training_plan_workout.type` (PaceIQ / UI) to library filter `dayType`. */
export function workoutTypeToSelectorDayType(
  type: string | null | undefined
): "easy" | "quality" | "long" | "double" | "rest" {
  const x = String(type ?? "easy").toLowerCase();
  if (x === "rest" || x === "off") return "rest";
  if (x === "long") return "long";
  if (x.includes("double")) return "double";
  if (
    [
      "tempo",
      "interval",
      "intervals",
      "strides",
      "threshold",
      "vo2",
      "mp",
      "marathon_pace",
      "race",
      "hard",
      "quality",
      "cruise",
      "speed",
      "hill",
    ].some((k) => x.includes(k))
  ) {
    return "quality";
  }
  return "easy";
}

/**
 * Pick a library session without AI — varies by `variationIndex` and avoids repeating
 * the same library id as the previous day when possible.
 */
export function pickDeterministicLibrarySession(input: {
  targetDistance: TargetDistance;
  phase: TrainingPhase;
  dayType: "easy" | "quality" | "long" | "double" | "rest";
  injuryFlags: string[];
  philosophy?: string;
  currentCTL: number;
  variationIndex: number;
  previousLibraryId: string | null;
}): Session | null {
  if (input.dayType === "rest") return null;
  const pool = getSessionsForDistanceAndPhase(
    input.targetDistance,
    input.phase,
    input.dayType,
    input.injuryFlags,
    input.philosophy,
    input.currentCTL
  );
  if (pool.length === 0) return null;
  let idx = Math.abs(input.variationIndex) % pool.length;
  let picked = pool[idx]!;
  if (picked.id === input.previousLibraryId && pool.length > 1) {
    idx = (idx + 1) % pool.length;
    picked = pool[idx]!;
  }
  if (import.meta.env.DEV) {
    console.log("[SessionSelector] deterministic pick:", picked.id, picked.name, "idx", input.variationIndex);
  }
  return picked;
}

// ─── Prompt building ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the session selector for Cade, an AI running coach.
Your only job is to select the optimal session from the provided library and return a complete session structure as JSON.

RULES YOU MUST NEVER BREAK:
1. Always select from the provided session library. Never invent sessions.
2. Never select a quality session if dayType is easy, long, or double.
3. Never select VO2max for marathon or ultra in base/build phase.
4. Never select two sessions of the same type as the previous day.
5. Never exceed targetVolumeKm by more than 15%.
6. Always calculate exact paces from the provided paceProfile.
7. Return only valid JSON matching the SelectedSession interface. No markdown, no explanation.
8. Keep coachingNote under 40 words — a real coach is concise.

SelectedSession JSON shape:
{
  "sessionLibraryId": string,
  "sessionName": string,
  "category": "easy"|"quality"|"long"|"double",
  "targetDistanceKm": number,
  "targetDurationMinutes": number,
  "structure": {
    "warmup": { "distanceKm": number, "pace": string, "instructions": string },
    "main": { "description": string, "recoveryType": "jog"|"walk"|"rest", ... },
    "cooldown": { "distanceKm": number, "pace": string, "instructions": string },
    "totalDistanceKm": number,
    "totalDurationMinutes": number
  },
  "paceGuidance": { "primaryMetric": "pace"|"hr"|"rpe", "targetPace"?: string, "description": string },
  "coachingNote": string,
  "whyThisSession": string
}`;

function buildUserPrompt(input: {
  date: Date;
  dayType: string;
  targetVolumeKm: number;
  phase: string;
  weekNumber: number;
  totalWeeks: number;
  weekNumberInPhase: number;
  targetDistance: TargetDistance;
  paceProfile: PaceProfile;
  philosophy?: string;
  previousSessions: Array<{ date: Date; sessionId: string; sessionName: string; category: string }>;
  nextPlannedDayType?: string;
  currentCTL: number;
  currentTSB: number;
  injuryFlags: string[];
  availableSessions: Session[];
}): string {
  const p = input.paceProfile.paces;
  const sessionsJson = JSON.stringify(
    input.availableSessions.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
      structure: s.structure,
      durationMinRange: s.durationMinRange,
      durationMaxRange: s.durationMaxRange,
      distanceKmMin: s.distanceKmMin,
      distanceKmMax: s.distanceKmMax,
      intensityZone: s.intensityZone,
    })),
    null,
    2
  );

  return `Athlete context:
- Target race: ${input.targetDistance}
- Phase: ${input.phase}, week ${input.weekNumberInPhase} of phase
- Overall week: ${input.weekNumber} of ${input.totalWeeks}
- Current CTL: ${input.currentCTL}
- Current TSB: ${input.currentTSB}
- Injury flags: ${input.injuryFlags.join(", ") || "none"}
- Philosophy: ${input.philosophy ?? "evidence-based default"}

Today:
- Day type: ${input.dayType}
- Target volume: ${input.targetVolumeKm} km

Recent sessions (last 7 days):
${input.previousSessions.map((s) => `- ${s.date.toISOString().slice(0, 10)}: ${s.sessionName} (${s.category})`).join("\n") || "None"}

Tomorrow planned: ${input.nextPlannedDayType ?? "unknown"}

Pace profile (source: ${input.paceProfile.source}):
- Easy: ${formatPace(p.easy.min)}-${formatPace(p.easy.max)}/km
- Marathon: ${formatPace(p.marathon)}/km
- Threshold: ${formatPace(p.threshold)}/km
- Interval: ${formatPace(p.interval)}/km
- Repetition: ${formatPace(p.repetition)}/km

Available sessions for ${input.targetDistance} in ${input.phase} phase:
${sessionsJson}

Select the optimal session and return complete JSON only.`;
}

// ─── Core: selectSessionForDay ──────────────────────────────────────────────

export async function selectSessionForDay(input: {
  date: Date;
  dayType: "easy" | "quality" | "long" | "double" | "rest";
  targetVolumeKm: number;
  phase: TrainingPhase;
  weekNumber: number;
  totalWeeks: number;
  weekNumberInPhase: number;
  targetDistance: TargetDistance;
  paceProfile: PaceProfile;
  philosophy?: string;
  previousSessions: Array<{
    date: Date;
    sessionId: string;
    sessionName: string;
    category: string;
  }>;
  nextPlannedDayType?: string;
  currentCTL: number;
  currentTSB: number;
  currentTLS?: number;
  injuryFlags: string[];
}): Promise<SelectedSession> {
  if (input.dayType === "rest") {
    return {
      sessionLibraryId: "rest",
      sessionName: "Rest Day",
      category: "easy",
      targetDistanceKm: 0,
      targetDurationMinutes: 0,
      structure: {
        warmup: { distanceKm: 0, pace: "", instructions: "Rest" },
        main: { description: "Rest", recoveryType: "rest" },
        cooldown: { distanceKm: 0, pace: "", instructions: "" },
        totalDistanceKm: 0,
        totalDurationMinutes: 0,
      },
      paceGuidance: { primaryMetric: "rpe", targetRPE: "0", description: "Full rest" },
      coachingNote: "Recovery day. No running.",
      whyThisSession: "Scheduled rest day.",
    };
  }

  const availableSessions = getSessionsForDistanceAndPhase(
    input.targetDistance,
    input.phase,
    input.dayType,
    input.injuryFlags,
    input.philosophy,
    input.currentCTL
  );

  if (availableSessions.length === 0) {
    const fallback = SESSION_LIBRARY.find(
      (s) =>
        s.targetDistances.includes(input.targetDistance) &&
        (input.dayType === "easy" || input.dayType === "long"
          ? s.category === "easy" || s.category === "long"
          : s.category === "quality")
    );
    if (!fallback) throw new Error(`No sessions available for ${input.dayType} ${input.targetDistance}`);
    return {
      sessionLibraryId: fallback.id,
      sessionName: fallback.name,
      category: fallback.category,
      targetDistanceKm: Math.min(input.targetVolumeKm, fallback.distanceKmMax ?? input.targetVolumeKm),
      targetDurationMinutes: fallback.durationMinRange,
      structure: {
        warmup: { distanceKm: 1, pace: `${formatPace(input.paceProfile.paces.easy.max)}/km`, instructions: "Easy jog" },
        main: { description: fallback.description, recoveryType: "jog" },
        cooldown: { distanceKm: 1, pace: `${formatPace(input.paceProfile.paces.easy.max)}/km`, instructions: "Easy jog" },
        totalDistanceKm: input.targetVolumeKm,
        totalDurationMinutes: Math.round(input.targetVolumeKm * 6),
      },
      paceGuidance: {
        primaryMetric: "pace",
        targetPace: `${formatPace(input.paceProfile.paces.easy.min)}-${formatPace(input.paceProfile.paces.easy.max)}/km`,
        description: "Easy conversational pace",
      },
      coachingNote: "Fallback selection — no matching sessions in library.",
      whyThisSession: "Default session when filter returned empty.",
    };
  }

  const userPrompt = buildUserPrompt({
    ...input,
    availableSessions,
  });

  const modelPreference = input.dayType === "quality" ? "sonnet" : "haiku";

  const { data, error } = await supabase.functions.invoke("session-selector", {
    body: { systemPrompt: SYSTEM_PROMPT, userPrompt, modelPreference },
  });

  if (error) throw error;
  if (!data?.content) throw new Error("Session selector returned no content");

  const parsed = JSON.parse(data.content) as SelectedSession;
  if (!parsed.sessionLibraryId || !parsed.sessionName) {
    throw new Error("Invalid session selector response");
  }
  if (import.meta.env.DEV) {
    console.log(
      "[SessionSelector] AI selected:",
      parsed.sessionLibraryId,
      parsed.sessionName,
      input.date.toISOString().slice(0, 10),
      input.dayType
    );
  }
  return parsed;
}

// ─── Batch: selectSessionsForWeeks ──────────────────────────────────────────

export async function selectSessionsForWeeks(input: {
  days: Array<{
    date: Date;
    dayType: string;
    targetVolumeKm: number;
    phase: TrainingPhase;
    weekNumber: number;
    weekNumberInPhase: number;
  }>;
  athleteContext: Omit<
    Parameters<typeof selectSessionForDay>[0],
    "date" | "dayType" | "targetVolumeKm" | "phase" | "weekNumber" | "weekNumberInPhase"
  >;
}): Promise<SelectedSession[]> {
  const results: SelectedSession[] = [];
  const previousSessions: Array<{ date: Date; sessionId: string; sessionName: string; category: string }> = [];

  for (let i = 0; i < input.days.length; i++) {
    const day = input.days[i];
    const nextDay = input.days[i + 1];

    const session = await selectSessionForDay({
      ...input.athleteContext,
      date: day.date,
      dayType: day.dayType as "easy" | "quality" | "long" | "double" | "rest",
      targetVolumeKm: day.targetVolumeKm,
      phase: day.phase,
      weekNumber: day.weekNumber,
      totalWeeks: input.athleteContext.totalWeeks,
      weekNumberInPhase: day.weekNumberInPhase,
      previousSessions: [...previousSessions],
      nextPlannedDayType: nextDay?.dayType,
    });

    results.push(session);
    previousSessions.push({
      date: day.date,
      sessionId: session.sessionLibraryId,
      sessionName: session.sessionName,
      category: session.category,
    });
  }

  return results;
}

// ─── Save to database ──────────────────────────────────────────────────────

export async function saveSelectedSessions(
  planId: string,
  sessions: Array<{ date: Date; session: SelectedSession }>
): Promise<void> {
  for (const { date, session } of sessions) {
    const dateStr = date.toISOString().split("T")[0];

    const sessionStructure = buildSessionStructureFromSelected(session);
    const controlTool =
      sessionStructure.control_tool === "heart_rate"
        ? "heart_rate"
        : sessionStructure.control_tool === "rpe"
          ? "rpe"
          : "pace";

    const { error } = await supabase
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
      .eq("plan_id", planId)
      .eq("date", dateStr);

    if (error) throw error;
  }
}
