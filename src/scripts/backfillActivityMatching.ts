/**
 * Backfill activity.planned_workout_id (+ optional workout completion) for Run-like rows
 * that have no link yet. Uses same-day training_plan_workout + distance tolerance as sync.
 *
 * Loads `.env` from repo root automatically (see loadProjectEnv). Optional: `npx dotenv -e .env -- …`
 *
 *   npx tsx src/scripts/backfillActivityMatching.ts
 *   DRY_RUN=1 npx tsx src/scripts/backfillActivityMatching.ts
 */

import { createClient } from "@supabase/supabase-js";
import {
  matchActivityToPlannedWorkout,
  RUN_LIKE_TYPES,
} from "../lib/training/activityMatcher";
import { getSupabaseUrl } from "../lib/supabase-url";
import {
  getEnvFilesTried,
  getScriptProjectRoot,
  loadProjectEnv,
  stripOuterQuotes,
} from "./loadProjectEnv";

const DRY_RUN = process.env.DRY_RUN === '1';

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

async function main() {
  const envPaths = loadProjectEnv();
  const url = resolveSupabaseUrl();
  const key = stripOuterQuotes(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "");
  if (!url || !key) {
    console.error("[backfill-activity-match] Need Supabase URL + SUPABASE_SERVICE_ROLE_KEY.");
    console.error("  Project root:", getScriptProjectRoot());
    console.error(
      envPaths.length ? `  Loaded: ${envPaths.join(", ")}` : `  No env files found (tried: ${getEnvFilesTried().join(", ")})`,
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const runTypes = [...RUN_LIKE_TYPES];
  const pageSize = 150;
  let from = 0;
  let linked = 0;
  let skipped = 0;
  let errors = 0;

  console.log(DRY_RUN ? "[backfill-activity-match] DRY_RUN" : "[backfill-activity-match] applying");

  for (;;) {
    const { data: rows, error: qErr } = await supabase
      .from("activity")
      .select("id, user_id, date, distance_km, type, planned_workout_id")
      .is("planned_workout_id", null)
      .not("date", "is", null)
      .in("type", runTypes)
      .order("date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (qErr) {
      console.error("[backfill-activity-match] query", qErr.message);
      process.exit(1);
    }
    const batch = rows ?? [];
    if (batch.length === 0) break;

    for (const row of batch) {
      const type = String(row.type ?? "");
      if (!RUN_LIKE_TYPES.has(type)) {
        skipped += 1;
        continue;
      }
      const dateStr = String(row.date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        skipped += 1;
        console.log(`[SKIP_BAD_DATE] id=${row.id}`);
        continue;
      }

      if (dryRun) {
        const { data: wrows } = await supabase
          .from("training_plan_workout")
          .select("id, distance_km, target_distance_km, type")
          .eq("user_id", row.user_id)
          .eq("date", dateStr)
          .limit(12);
        const n = wrows?.length ?? 0;
        console.log(
          `[DRY] activity=${row.id} date=${dateStr} dist_km=${row.distance_km ?? "null"} same_day_workouts=${n}`,
        );
        linked += 1;
        continue;
      }

      const res = await matchActivityToPlannedWorkout(supabase, {
        activityId: row.id,
        userId: row.user_id,
        activityDate: dateStr,
        actualDistanceKm: row.distance_km != null ? Number(row.distance_km) : null,
        activityType: type,
        markWorkoutCompleted: true,
      });

      if (res.linked) {
        linked += 1;
        console.log(`[LINKED] activity=${row.id} workout=${res.workoutId}`);
      } else {
        skipped += 1;
        console.log(`[SKIP] activity=${row.id} reason=${res.reason ?? "unknown"}`);
      }
      if (res.reason && res.linked && res.reason.startsWith("workout_update:")) {
        errors += 1;
        console.warn(`[WARN] activity=${row.id} ${res.reason}`);
      }
    }

    from += pageSize;
    if (batch.length < pageSize) break;
  }

  console.log(
    `[backfill-activity-match] done ${DRY_RUN ? "rows_inspected=" : "linked="}${linked} skipped=${skipped} errors=${errors}${DRY_RUN ? " (dry run, no writes)" : ""}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
