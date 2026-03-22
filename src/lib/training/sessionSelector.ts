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

/**
 * Map stored plan/profile philosophy strings to library `Philosophy` keys.
 * Handles "80/20 Polarized", "8020", etc., so `philosophyForbidden` / `forbiddenFor` apply.
 */
export function mapPhilosophy(philosophy?: string): Philosophy | undefined {
  if (!philosophy?.trim()) return undefined;
  const key = philosophy.toLowerCase().trim().replace(/\s+/g, "_").replace(/\//g, "_");
  const compact = key.replace(/_/g, "");

  if (
    compact.includes("8020") ||
    (compact.includes("80") && compact.includes("20") && compact.includes("polarized")) ||
    /^80_20$|^80-20$/i.test(philosophy.trim().replace(/\s/g, "")) ||
    key === "80_20" ||
    key.startsWith("80_20_")
  ) {
    return "80_20";
  }

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
  return m[key];
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

  const filtered = SESSION_LIBRARY.filter((s) => {
    if (!s.targetDistances.includes(targetDistance)) return false;
    if (!s.phases.includes(phase)) return false;

    if (dayType === "rest") return false;

    if (dayType === "easy") {
      if (s.category !== "easy") return false;
    } else if (dayType === "long") {
      if (s.category !== "long") return false;
    } else if (dayType === "double") {
      if (s.category !== "double" && s.category !== "easy") return false;
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

/** Map high-level session type labels (tests, external callers) to selector `dayType`. */
export function mapSessionTypeToDayType(
  sessionType: string
): "easy" | "quality" | "long" | "double" | "rest" {
  const s = sessionType.toLowerCase().trim();
  if (s === "rest" || s === "off") return "rest";
  if (s === "long") return "long";
  if (s.includes("double")) return "double";
  if (
    s.includes("threshold") ||
    s.includes("vo2") ||
    s.includes("vo2max") ||
    s.includes("tempo") ||
    s.includes("interval") ||
    s.includes("quality") ||
    s.includes("strides") ||
    s.includes("speed") ||
    s.includes("hill")
  ) {
    return "quality";
  }
  if (s === "recovery") return "easy";
  return "easy";
}

export function getDefaultSession(
  sessionType: string,
  distance: TargetDistance,
  phase: TrainingPhase,
  injuryFlags: string[] = [],
  philosophy?: string,
  currentCTL = 55
): Session | null {
  const dayType = mapSessionTypeToDayType(sessionType);
  if (dayType === "rest") return null;
  const pool = getSessionsForDistanceAndPhase(
    distance,
    phase,
    dayType,
    injuryFlags,
    philosophy,
    currentCTL
  );
  if (pool.length > 0) return pool[0]!;
  return (
    SESSION_LIBRARY.find(
      (s) =>
        s.targetDistances.includes(distance) &&
        (dayType === "easy" || dayType === "long"
          ? s.category === "easy" || s.category === "long"
          : s.category === "quality")
    ) ?? null
  );
}

export interface SelectedSessionSummary {
  id: string;
  title: string;
  name: string;
  description: string;
  category: SessionCategory;
}

/**
 * Deterministic session choice for a plan slot (no AI). Used by tests and tooling.
 * Varies by week, weekday, volume, and session type.
 */
export function selectSession(params: {
  distance: TargetDistance;
  phase: TrainingPhase;
  sessionType: string;
  weekNumber: number;
  dayOfWeek: number;
  philosophy: string;
  weeklyVolume: number;
  previousLibraryId?: string | null;
  injuryFlags?: string[];
  currentCTL?: number;
}): SelectedSessionSummary | null {
  const dayType = mapSessionTypeToDayType(params.sessionType);
  if (dayType === "rest") {
    return {
      id: "rest",
      title: "Rest Day",
      name: "Rest Day",
      description: "Full rest — absorb training and reset for the next stimulus.",
      category: "easy",
    };
  }

  const variationIndex =
    params.weekNumber * 31 +
    params.dayOfWeek * 17 +
    Math.round(Math.abs(params.weeklyVolume) % 23);

  let picked = pickDeterministicLibrarySession({
    targetDistance: params.distance,
    phase: params.phase,
    dayType,
    injuryFlags: params.injuryFlags ?? [],
    philosophy: params.philosophy,
    currentCTL: params.currentCTL ?? 55,
    variationIndex,
    previousLibraryId: params.previousLibraryId ?? null,
    dayOfWeekIndex: params.dayOfWeek,
  });

  if (!picked) {
    picked = getDefaultSession(
      params.sessionType,
      params.distance,
      params.phase,
      params.injuryFlags ?? [],
      params.philosophy,
      params.currentCTL ?? 55
    );
  }

  if (!picked) return null;

  return {
    id: picked.id,
    title: picked.name,
    name: picked.name,
    description: picked.description,
    category: picked.category,
  };
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
  /** 0 = Monday … 6 = Sunday — extra salt for intra-week variety */
  dayOfWeekIndex?: number;
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
  const salt = (input.dayOfWeekIndex ?? 0) * 11;
  let idx = Math.abs(input.variationIndex + salt) % pool.length;
  let picked = pool[idx]!;
  if (picked.id === input.previousLibraryId && pool.length > 1) {
    idx = (idx + 1) % pool.length;
    picked = pool[idx]!;
  }
  if (import.meta.env.DEV) {
    console.log("[SessionSelector] selected:", picked.id, "for", {
      dayType: input.dayType,
      variationIndex: input.variationIndex,
      dayOfWeekIndex: input.dayOfWeekIndex,
    });
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
9. whyThisSession MUST reference at least one specific number from the athlete context (CTL, TSB, week number, or days to race). Never write a generic rationale.
10. coachingNote is what a real coach says to the athlete before the session — brief, specific, motivating. Reference their phase or fitness state.

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

  const tsbStatus = input.currentTSB > 5 ? "fresh (good for quality)"
    : input.currentTSB < -10 ? "fatigued (consider pacing conservatively)"
    : "neutral";

  return `Athlete context:
- Target race: ${input.targetDistance}
- Phase: ${input.phase}, week ${input.weekNumberInPhase} of phase
- Overall week: ${input.weekNumber} of ${input.totalWeeks}
- Current CTL: ${input.currentCTL} (${input.currentCTL > 60 ? "well-trained, can handle quality" : input.currentCTL > 40 ? "moderate fitness" : "building base"})
- Current TSB: ${input.currentTSB} — ${tsbStatus}
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
    console.log("[SessionSelector] selected:", parsed.sessionLibraryId, "for", {
      date: input.date.toISOString().slice(0, 10),
      dayType: input.dayType,
      sessionName: parsed.sessionName,
    });
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
