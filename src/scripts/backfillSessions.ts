/**
 * Backfill training_plan_workout.session_library_id, session_structure, control_tool
 * for rows missing library linkage (non-rest).
 *
 * Requires:
 *   SUPABASE_SERVICE_ROLE_KEY — Dashboard → Settings → API → service_role (secret).
 *       Put in `.env` (or `.env.local`); scripts auto-load `.env` first — dotenv-cli optional.
 *   URL — optional: falls back to getSupabaseUrl() from repo. Or set SUPABASE_URL / VITE_SUPABASE_URL.
 *
 * Usage:
 *   npx tsx src/scripts/backfillSessions.ts
 *   DRY_RUN=1 npx tsx src/scripts/backfillSessions.ts   # log only, no updates
 *
 * After the main pass (rows missing session_library_id), a second pass fills
 * session_structure + control_tool for rows that already have session_library_id
 * but session_structure IS NULL (looks up SESSION_LIBRARY by id; does not change
 * distance_km / duration_minutes unless you run the main pass).
 *
 * Rows whose name contains "race day" are skipped (no session_library_id). If an older
 * backfill linked them to a quality session, clear in SQL: set session_library_id,
 * session_id, session_structure, control_tool to NULL where name ilike '%race day%'.
 */

import { createClient } from "@supabase/supabase-js";
import {
  defaultDistanceKmFromSession,
  defaultDurationMinutesFromSession,
} from "../lib/training/librarySessionVolume";
import {
  SESSION_LIBRARY,
  type Session,
  type TargetDistance,
} from "../lib/training/sessionLibrary";
import type { TrainingPhase } from "../lib/training/sessionLibrary";
import { buildSessionStructureFromSelected } from "../lib/training/sessionStructureUi";
import type { SelectedSession } from "../lib/training/sessionSelector";
import { getSupabaseUrl } from "../lib/supabase-url";
import {
  getEnvFilesTried,
  getScriptProjectRoot,
  loadProjectEnv,
  stripOuterQuotes,
} from "./loadProjectEnv";

function resolveSupabaseUrl(): string | undefined {
  const direct = stripOuterQuotes(
    process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      ""
  );
  if (direct) return direct;
  const id = stripOuterQuotes(process.env.VITE_SUPABASE_PROJECT_ID?.trim() ?? "");
  if (id) return `https://${id}.supabase.co`;
  return getSupabaseUrl();
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

/** Extra tokens appended to row description for scoring (PaceIQ type → library vocabulary). */
const TYPE_MATCH_ALIASES: Record<string, readonly string[]> = {
  tempo: ["threshold", "tempo", "lactate"],
  strides: ["strides", "easy", "acceleration"],
};

function typeAliasTokensFromType(type: string | null | undefined): string {
  const t = String(type ?? "").toLowerCase().trim();
  const out: string[] = [];
  for (const [key, aliases] of Object.entries(TYPE_MATCH_ALIASES)) {
    if (t === key || t.includes(key)) {
      out.push(...aliases);
    }
  }
  return [...new Set(out)].join(" ");
}

function augmentedMatchDescription(row: {
  type: string | null;
  description: string | null;
}): string {
  const base = (row.description ?? "").trim();
  const extra = typeAliasTokensFromType(row.type);
  return extra ? `${base} ${extra}`.trim() : base;
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
    if (j >= 0.28) return 70 + Math.round(j * 25);
    // PaceIQ titles often share only 1–2 tokens with library names; the old hard
    // cutoff at j>=0.34 made every pair score 0 and blocked all backfills.
    if (inter > 0) {
      const soft = Math.round(32 + j * 85);
      return Math.min(72, Math.max(MIN_SCORE_TO_MATCH, soft));
    }
  }

  return 0;
}

const MIN_SCORE_TO_MATCH = 40;

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
  const libKm = defaultDistanceKmFromSession(session);
  const libMin = defaultDurationMinutesFromSession(session);
  const km = libKm ?? Math.max(0, row.distance_km ?? session.distanceKmMin ?? session.distanceKmMax ?? 8);
  const totalMin =
    libMin > 0
      ? libMin
      : row.duration_minutes ?? (km > 0 ? Math.round(km * 6) : session.durationMinRange) ?? 45;
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

type WorkoutRowWithLibraryId = WorkoutRow & {
  session_library_id: string | null;
};

async function main(): Promise<void> {
  const envPaths = loadProjectEnv();
  const url = resolveSupabaseUrl();
  const key = stripOuterQuotes(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_KEY?.trim() ||
      ""
  );
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

  if (!url || !key) {
    console.error("Backfill needs Supabase URL + service_role key.\n");
    console.error("Project root (env files):", getScriptProjectRoot());
    console.error("process.cwd():", process.cwd());
    if (envPaths.length === 0) {
      console.error("No env files found. Tried under project root:", getEnvFilesTried().join(", "));
      console.error("Copy .env.example to .env and add SUPABASE_SERVICE_ROLE_KEY:\n");
    } else {
      console.error("Loaded:", envPaths.join(", "));
    }
    if (!url) {
      console.error(
        "- URL: set VITE_SUPABASE_URL or SUPABASE_URL, or VITE_SUPABASE_PROJECT_ID (https://<id>.supabase.co)"
      );
    }
    if (!key) {
      console.error(
        "- Key: Supabase Dashboard → Project Settings → API → service_role → copy secret key"
      );
      console.error("  In .env or .env.local (never commit):\n  SUPABASE_SERVICE_ROLE_KEY=<paste here>\n");
      console.error(
        "  Tip: empty SUPABASE_SERVICE_ROLE_KEY= in .env.local overrides .env — remove the line or fill it."
      );
      const setButEmpty =
        process.env.SUPABASE_SERVICE_ROLE_KEY !== undefined &&
        process.env.SUPABASE_SERVICE_ROLE_KEY.trim() === "";
      if (setButEmpty) {
        console.error("  Detected: SUPABASE_SERVICE_ROLE_KEY is set but empty.");
      }
    }
    process.exit(1);
  }

  const supabase = createClient(url, key);
  console.log(dryRun ? "[backfill] DRY_RUN — no writes" : "[backfill] applying updates");

  const pageSize = 200;
  let from = 0;
  let matched = 0;
  let noMatch = 0;
  let skipped = 0;
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

      const rowNameNorm = normalize(row.name ?? "");
      if (/\brace day\b/.test(rowNameNorm)) {
        skipped += 1;
        console.log(`[SKIP_RACE_DAY] id=${row.id} name=${JSON.stringify(row.name ?? "")}`);
        continue;
      }

      const targetDistance = await targetForPlan(row.plan_id);
      const pool = candidatePool(targetDistance, phase, dayType);
      const picked = pickBestSession(pool, row.name, augmentedMatchDescription(row));

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
          distance_km: defaultDistanceKmFromSession(session),
          duration_minutes: defaultDurationMinutesFromSession(session),
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
    `[backfill] pass1 done matched=${matched} no_match=${noMatch} skipped=${skipped} errors=${errors}${dryRun ? " (dry run)" : ""}`
  );

  // Pass 2: session_library_id set but session_structure missing (enrich without structure, etc.)
  let structFilled = 0;
  let structSkipped = 0;
  let structErrors = 0;
  let structFrom = 0;

  for (;;) {
    const { data: structRows, error: sErr } = await supabase
      .from("training_plan_workout")
      .select(
        "id, plan_id, type, name, description, phase, distance_km, duration_minutes, target_pace, session_library_id"
      )
      .not("session_library_id", "is", null)
      .is("session_structure", null)
      .neq("type", "rest")
      .order("date", { ascending: true })
      .range(structFrom, structFrom + pageSize - 1);

    if (sErr) {
      console.error("[backfill] pass2 query error", sErr.message);
      process.exit(1);
    }
    const sBatch = (structRows ?? []) as WorkoutRowWithLibraryId[];
    if (sBatch.length === 0) break;

    for (const row of sBatch) {
      const libId = String(row.session_library_id ?? "").trim();
      if (!libId || libId === "rest") {
        structSkipped += 1;
        console.log(`[STRUCT_SKIP] id=${row.id} library_id=${JSON.stringify(libId)}`);
        continue;
      }

      const session = SESSION_LIBRARY.find((s) => s.id === libId);
      if (!session) {
        structSkipped += 1;
        console.log(`[STRUCT_UNKNOWN_LIBRARY] id=${row.id} session_library_id=${JSON.stringify(libId)}`);
        continue;
      }

      const pseudo = buildPseudoSelected(session, row);
      const sessionStructure = buildSessionStructureFromSelected(pseudo);
      const controlTool = sessionStructure.control_tool;

      structFilled += 1;
      console.log(
        `[STRUCT] id=${row.id} library_id=${session.id} control_tool=${controlTool}`
      );

      if (dryRun) continue;

      const { error: uErr } = await supabase
        .from("training_plan_workout")
        .update({
          session_id: session.id,
          session_structure: sessionStructure as unknown as Record<string, unknown>,
          control_tool: controlTool,
          why_this_session: session.purpose ?? null,
        })
        .eq("id", row.id);

      if (uErr) {
        structErrors += 1;
        console.error(`[STRUCT_ERROR] id=${row.id}`, uErr.message);
      }
    }

    structFrom += pageSize;
    if (sBatch.length < pageSize) break;
  }

  console.log(
    `[backfill] pass2 structure filled=${structFilled} skipped=${structSkipped} errors=${structErrors}${dryRun ? " (dry run)" : ""}`
  );
  console.log(
    "[backfill] verify SQL:\n  SELECT session_library_id IS NOT NULL AS has_lib, session_structure IS NOT NULL AS has_struct FROM training_plan_workout WHERE type != 'rest' ORDER BY date ASC LIMIT 20;"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
