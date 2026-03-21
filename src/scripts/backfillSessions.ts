/**
 * Backfill training_plan_workout.session_library_id, session_structure, control_tool
 * for rows missing library linkage (non-rest).
 *
 * Requires (env or .env in project root):
 *   SUPABASE_URL or VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npx tsx src/scripts/backfillSessions.ts
 *   DRY_RUN=1 npx tsx src/scripts/backfillSessions.ts   # log only, no updates
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SESSION_LIBRARY,
  type Session,
  type TargetDistance,
} from "../lib/training/sessionLibrary";
import type { TrainingPhase } from "../lib/training/sessionLibrary";
import { buildSessionStructureFromSelected } from "../lib/training/sessionStructureUi";
import type { SelectedSession } from "../lib/training/sessionSelector";

function loadDotEnv(): void {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
    break;
  }
}

function mapGoalRaceToTarget(g: string | null | undefined): TargetDistance {
  const t = (g ?? "").toLowerCase().replace(/\s/g, "_");
  if (["1500m", "5k", "10k", "half_marathon", "marathon", "ultra"].includes(t)) {
    return t as TargetDistance;
  }
  if (t.includes("marathon") && !t.includes("half")) return "marathon";
  if (t.includes("half")) return "half_marathon";
  if (t.includes("10")) return "10k";
  if (t.includes("5")) return "5k";
  if (t.includes("ultra")) return "ultra";
  return "marathon";
}

function workoutTypeToSelectorDayType(
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

function isVO2maxSession(s: Session): boolean {
  return (
    s.intensityZone.includes("Z5") ||
    s.intensityZone.includes("Z6") ||
    s.name.toLowerCase().includes("vo2max") ||
    s.name.toLowerCase().includes("interval")
  );
}

/** Same rules as getSessionsForDistanceAndPhase (no Supabase / client import). */
const KNOWN_PHASES = new Set(["base", "build", "peak", "taper", "recovery"]);

function normalizePhase(p: string | null): TrainingPhase {
  const x = (p ?? "base").toLowerCase();
  return (KNOWN_PHASES.has(x) ? x : "base") as TrainingPhase;
}

function candidatePool(
  targetDistance: TargetDistance,
  phase: TrainingPhase,
  dayType: "easy" | "quality" | "long" | "double" | "rest",
  currentCTL = 999
): Session[] {
  if (dayType === "rest") return [];
  return SESSION_LIBRARY.filter((s) => {
    if (!s.targetDistances.includes(targetDistance)) return false;
    if (!s.phases.includes(phase)) return false;

    if (dayType === "easy") {
      if (s.category !== "easy") return false;
    } else if (dayType === "long") {
      if (s.category !== "long") return false;
    } else if (dayType === "double") {
      if (s.category !== "double" && s.category !== "easy") return false;
    } else if (dayType === "quality") {
      if (s.category !== "quality") return false;
    }

    if (s.requiresCTL != null && currentCTL < s.requiresCTL) return false;

    if (
      (targetDistance === "marathon" || targetDistance === "ultra") &&
      (phase === "base" || phase === "build") &&
      isVO2maxSession(s)
    ) {
      return false;
    }

    return true;
  });
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—-]+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4)
  );
}

/** Score 0–100; needs >= MIN_SCORE_TO_MATCH to accept. */
function nameMatchScore(rowName: string | null, rowDesc: string | null, session: Session): number {
  const n = normalize(rowName ?? "");
  const d = normalize(rowDesc ?? "");
  const combined = `${n} ${d}`.trim();
  const sn = normalize(session.name);
  const sdesc = normalize(session.description);
  const sid = session.id.toLowerCase();

  if (n && n === sn) return 100;
  if (combined.includes(sid)) return 98;

  if (sn.length >= 5 && n.includes(sn)) return 92;
  if (n.length >= 5 && sn.includes(n)) return 90;

  const stop = new Set(["easy", "easy run", "run", "rest", "workout", "training"]);
  if (sn.length >= 6 && !stop.has(sn) && (n.includes(sn) || d.includes(sn))) return 88;
  if (n.length >= 6 && !stop.has(n) && (sn.includes(n) || sdesc.includes(n))) return 86;

  const tRow = tokens(combined);
  const tSes = tokens(`${session.name} ${session.description}`);
  if (tRow.size && tSes.size) {
    let inter = 0;
    for (const w of tSes) {
      if (tRow.has(w)) inter += 1;
    }
    const union = tRow.size + tSes.size - inter;
    const j = union > 0 ? inter / union : 0;
    if (j >= 0.34) return 70 + Math.round(j * 25);
  }

  return 0;
}

const MIN_SCORE_TO_MATCH = 68;

function pickBestSession(
  pool: Session[],
  rowName: string | null,
  rowDesc: string | null
): { session: Session; score: number } | null {
  if (pool.length === 0) return null;
  let best: Session = pool[0]!;
  let bestScore = nameMatchScore(rowName, rowDesc, best);
  for (let i = 1; i < pool.length; i++) {
    const s = pool[i]!;
    const sc = nameMatchScore(rowName, rowDesc, s);
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  if (bestScore < MIN_SCORE_TO_MATCH) return null;
  return { session: best, score: bestScore };
}

function selectedCategory(session: Session): SelectedSession["category"] {
  if (session.category === "quality") return "quality";
  if (session.category === "long") return "long";
  if (session.category === "double") return "double";
  return "easy";
}

function buildPseudoSelected(session: Session, row: WorkoutRow): SelectedSession {
  const dayType = workoutTypeToSelectorDayType(row.type);
  const km = Math.max(0, row.distance_km ?? session.distanceKmMin ?? session.distanceKmMax ?? 8);
  const totalMin =
    row.duration_minutes ??
    (km > 0 ? Math.round(km * 6) : session.durationMinRange) ??
    45;
  const paceStr = row.target_pace?.trim() ?? "";
  const primaryMetric: "pace" | "hr" | "rpe" =
    dayType === "quality" ? "pace" : row.type?.toLowerCase().includes("ultra") ? "rpe" : "hr";

  const wKm = Math.min(2, Math.max(0.5, km * 0.08));
  const cKm = Math.min(2, Math.max(0.5, km * 0.08));

  return {
    sessionLibraryId: session.id,
    sessionName: session.name,
    category: selectedCategory(session),
    targetDistanceKm: km,
    targetDurationMinutes: totalMin,
    structure: {
      warmup: {
        distanceKm: wKm,
        pace: paceStr || "easy",
        instructions: "Easy jog — build gradually into the main set.",
      },
      main: {
        description: session.structure,
        recoveryType: "jog",
      },
      cooldown: {
        distanceKm: cKm,
        pace: paceStr || "easy",
        instructions: "Easy jog — bring heart rate down.",
      },
      totalDistanceKm: km,
      totalDurationMinutes: totalMin,
    },
    paceGuidance: {
      primaryMetric,
      targetPace: paceStr || undefined,
      description: session.purpose || session.description,
    },
    coachingNote: session.purpose,
    whyThisSession: session.purpose,
  };
}

type WorkoutRow = {
  id: string;
  plan_id: string;
  type: string | null;
  name: string | null;
  description: string | null;
  phase: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  target_pace: string | null;
};

async function main(): Promise<void> {
  loadDotEnv();
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

  if (!url || !key) {
    console.error(
      "Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in environment or .env"
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);
  console.log(dryRun ? "[backfill] DRY_RUN — no writes" : "[backfill] applying updates");

  const pageSize = 200;
  let from = 0;
  let matched = 0;
  let noMatch = 0;
  let errors = 0;

  const planCache = new Map<string, TargetDistance>();

  async function targetForPlan(planId: string): Promise<TargetDistance> {
    const hit = planCache.get(planId);
    if (hit) return hit;
    const { data, error } = await supabase
      .from("training_plan")
      .select("goal_race")
      .eq("id", planId)
      .maybeSingle();
    if (error) {
      console.warn("[backfill] plan fetch error", planId, error.message);
    }
    const t = mapGoalRaceToTarget(data?.goal_race as string | null);
    planCache.set(planId, t);
    return t;
  }

  for (;;) {
    const { data: rows, error: qErr } = await supabase
      .from("training_plan_workout")
      .select(
        "id, plan_id, type, name, description, phase, distance_km, duration_minutes, target_pace"
      )
      .is("session_library_id", null)
      .neq("type", "rest")
      .order("date", { ascending: true })
      .range(from, from + pageSize - 1);

    if (qErr) {
      console.error("[backfill] query error", qErr.message);
      process.exit(1);
    }
    const batch = (rows ?? []) as WorkoutRow[];
    if (batch.length === 0) break;

    for (const row of batch) {
      const phase = normalizePhase(row.phase);
      const dayType = workoutTypeToSelectorDayType(row.type);
      if (dayType === "rest") continue;

      const targetDistance = await targetForPlan(row.plan_id);
      const pool = candidatePool(targetDistance, phase, dayType);
      const picked = pickBestSession(pool, row.name, row.description);

      if (!picked) {
        noMatch += 1;
        console.log(
          `[NO_MATCH] id=${row.id} type=${row.type ?? ""} phase=${phase} name=${JSON.stringify(row.name ?? "")} pool=${pool.length}`
        );
        continue;
      }

      const { session, score } = picked;
      const pseudo = buildPseudoSelected(session, row);
      const sessionStructure = buildSessionStructureFromSelected(pseudo);
      const controlTool = sessionStructure.control_tool;

      matched += 1;
      console.log(
        `[MATCH] id=${row.id} score=${score} library_id=${session.id} name=${JSON.stringify(session.name)} control_tool=${controlTool}`
      );

      if (dryRun) continue;

      const { error: uErr } = await supabase
        .from("training_plan_workout")
        .update({
          session_library_id: session.id,
          session_id: session.id,
          session_structure: sessionStructure as unknown as Record<string, unknown>,
          control_tool: controlTool,
        })
        .eq("id", row.id);

      if (uErr) {
        errors += 1;
        console.error(`[ERROR] id=${row.id}`, uErr.message);
      }
    }

    from += pageSize;
    if (batch.length < pageSize) break;
  }

  console.log(
    `[backfill] done matched=${matched} no_match=${noMatch} errors=${errors}${dryRun ? " (dry run)" : ""}`
  );
  console.log(
    "[backfill] verify SQL:\n  SELECT type, name, session_library_id IS NOT NULL AS matched FROM training_plan_workout ORDER BY date ASC LIMIT 20;"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
