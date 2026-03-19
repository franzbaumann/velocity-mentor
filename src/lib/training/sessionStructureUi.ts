/**
 * UI-facing session structure for SessionCard (stored in training_plan_workout.session_structure).
 */
import type { SelectedSession, SessionStructure as SelectorStructure, PaceGuidance } from "./sessionSelector";

export type ControlToolUi = "pace" | "heart_rate" | "rpe";

export interface SessionStructureStored {
  warmup: {
    duration_min: number;
    description: string;
    pace_zone?: string;
  };
  main: {
    description: string;
    intervals?: {
      reps: number;
      distance_m?: number;
      duration_min?: number;
      pace?: string;
      rest_sec?: number;
      rest_description?: string;
    };
    continuous?: {
      distance_km: number;
      pace?: string;
      hr_zone?: string;
      rpe?: number;
    };
  };
  cooldown: {
    duration_min: number;
    description: string;
  };
  purpose: string;
  control_tool: ControlToolUi;
  key_focus: string;
}

function controlFromGuidance(pg: PaceGuidance): ControlToolUi {
  if (pg.primaryMetric === "pace") return "pace";
  if (pg.primaryMetric === "hr") return "heart_rate";
  return "rpe";
}

function estimateWarmupCoolMin(st: SelectorStructure, totalMin: number): { w: number; c: number } {
  const wKm = st.warmup.distanceKm ?? 0;
  const cKm = st.cooldown.distanceKm ?? 0;
  const tKm = st.totalDistanceKm > 0 ? st.totalDistanceKm : 1;
  const fracW = Math.min(0.35, (wKm / tKm) * 1.2);
  const fracC = Math.min(0.35, (cKm / tKm) * 1.2);
  const wMin = Math.max(5, Math.round(totalMin * fracW));
  const cMin = Math.max(5, Math.round(totalMin * fracC));
  return { w: wMin, c: cMin };
}

/** Build DB session_structure from a SelectedSession (session selector / proposals). */
export function buildSessionStructureFromSelected(session: SelectedSession): SessionStructureStored {
  const st = session.structure;
  const pg = session.paceGuidance;
  const totalMin = session.targetDurationMinutes || st.totalDurationMinutes || 45;
  const { w: warmupMin, c: coolMin } = estimateWarmupCoolMin(st, totalMin);

  const warmupDesc = [
    st.warmup.distanceKm ? `${st.warmup.distanceKm} km` : null,
    st.warmup.pace ? `@ ${st.warmup.pace}` : null,
    st.warmup.instructions,
  ].filter(Boolean).join(" — ");

  const coolDesc = [
    st.cooldown.distanceKm ? `${st.cooldown.distanceKm} km` : null,
    st.cooldown.pace ? `@ ${st.cooldown.pace}` : null,
    st.cooldown.instructions,
  ].filter(Boolean).join(" — ");

  const main = st.main;
  const hasIntervals =
    main.reps != null &&
    main.reps > 0 &&
    (main.repDistanceM != null || main.repDurationSeconds != null);

  let mainBlock: SessionStructureStored["main"];

  if (hasIntervals) {
    const restSec = main.recoveryDurationSeconds ?? 90;
    const restDesc =
      main.recoveryType === "walk"
        ? `${restSec} sec easy walk`
        : main.recoveryType === "rest"
          ? `${restSec} sec standing / walk`
          : `${restSec} sec easy jog between reps`;
    mainBlock = {
      description: main.description,
      intervals: {
        reps: main.reps!,
        ...(main.repDistanceM != null ? { distance_m: main.repDistanceM } : {}),
        ...(main.repDurationSeconds != null
          ? { duration_min: Math.round(main.repDurationSeconds / 60) }
          : {}),
        ...(main.repPace ? { pace: main.repPace } : {}),
        rest_sec: restSec,
        rest_description: restDesc,
      },
    };
  } else {
    mainBlock = {
      description: main.description,
      continuous: {
        distance_km: session.targetDistanceKm,
        ...(pg.targetPace ? { pace: pg.targetPace } : {}),
        ...(pg.targetHRZone ? { hr_zone: pg.targetHRZone } : {}),
        ...(pg.targetRPE ? { rpe: Number.parseInt(String(pg.targetRPE), 10) || undefined } : {}),
      },
    };
  }

  const control = controlFromGuidance(pg);

  return {
    warmup: {
      duration_min: warmupMin,
      description: warmupDesc || "Easy warm-up — start easy and build gradually.",
      pace_zone: "easy",
    },
    main: mainBlock,
    cooldown: {
      duration_min: coolMin,
      description: coolDesc || "Easy cool-down — bring HR down.",
    },
    purpose: session.whyThisSession || session.coachingNote || "",
    control_tool: control,
    key_focus: pg.description || session.coachingNote || "",
  };
}

function isStoredShape(v: unknown): v is SessionStructureStored {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.warmup === "object" &&
    typeof o.main === "object" &&
    typeof o.cooldown === "object" &&
    typeof o.purpose === "string" &&
    typeof o.control_tool === "string" &&
    typeof o.key_focus === "string"
  );
}

/** Prefer session_structure; else derive a display shape from structure_json + pace guidance. */
export function resolveSessionStructureForWorkout(row: {
  session_structure?: unknown;
  structure_json?: unknown;
  pace_guidance_json?: unknown;
  primary_metric?: string | null;
  control_tool?: string | null;
  why_this_session?: string | null;
  coach_note?: string | null;
  key_focus?: string | null;
  description?: string | null;
  distance_km?: number | null;
  duration_minutes?: number | null;
  target_pace?: string | null;
}): SessionStructureStored | null {
  if (isStoredShape(row.session_structure)) return row.session_structure;

  const rawSt = row.structure_json as SelectorStructure | null;
  if (!rawSt || typeof rawSt !== "object") return null;

  const mainRaw = rawSt.main ?? { description: "", recoveryType: "jog" as const };
  const st: SelectorStructure = {
    warmup: rawSt.warmup ?? { distanceKm: 1, pace: "", instructions: "Easy jog" },
    main: {
      description: mainRaw.description ?? "",
      recoveryType: mainRaw.recoveryType ?? "jog",
      ...mainRaw,
    },
    cooldown: rawSt.cooldown ?? { distanceKm: 1, pace: "", instructions: "Easy jog" },
    totalDistanceKm: rawSt.totalDistanceKm ?? row.distance_km ?? 0,
    totalDurationMinutes: rawSt.totalDurationMinutes ?? row.duration_minutes ?? 45,
  };

  const pg = (row.pace_guidance_json ?? {}) as Partial<PaceGuidance>;
  const primary =
    pg.primaryMetric ??
    (row.primary_metric === "pace" ? "pace" : row.primary_metric === "hr" ? "hr" : "rpe");

  const pseudo: SelectedSession = {
    sessionLibraryId: "",
    sessionName: "Session",
    category: "easy",
    targetDistanceKm: row.distance_km ?? st.totalDistanceKm ?? 0,
    targetDurationMinutes: row.duration_minutes ?? st.totalDurationMinutes ?? 45,
    structure: st,
    paceGuidance: {
      primaryMetric: primary === "pace" ? "pace" : primary === "hr" ? "hr" : "rpe",
      targetPace: pg.targetPace ?? row.target_pace ?? undefined,
      targetHRZone: pg.targetHRZone,
      targetRPE: pg.targetRPE,
      description: pg.description ?? row.key_focus ?? "",
    },
    coachingNote: row.coach_note ?? "",
    whyThisSession: row.why_this_session ?? row.description ?? "",
  };

  const built = buildSessionStructureFromSelected(pseudo);
  if (row.control_tool === "pace" || row.control_tool === "heart_rate" || row.control_tool === "rpe") {
    built.control_tool = row.control_tool;
  }
  if (row.key_focus) built.key_focus = row.key_focus;
  return built;
}
