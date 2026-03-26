/** Defaults match previous coach behavior (~2 strength + regular mobility in healthy base/build). */
export const DEFAULT_STRENGTH_SESSIONS_CAP = 2;
export const DEFAULT_MOBILITY_SESSIONS_CAP = 2;

/** Onboarding `daysPerWeek`; 6–7 → allow stacking strength after easy/long same day. */
export function parseDaysPerWeekFromAnswers(
  answers: Record<string, unknown> | { daysPerWeek?: number },
): number {
  const v = (answers as { daysPerWeek?: unknown }).daysPerWeek;
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(7, Math.round(v)));
}

export function isHighFrequencyRunWeek(daysPerWeek: number): boolean {
  return daysPerWeek >= 6;
}

export function parseStrengthMobilityCaps(
  answers: Record<string, unknown> | {
    strengthSessionsPerWeekCap?: number;
    mobilitySessionsPerWeekCap?: number;
  },
): { strength: number; mobility: number } {
  const rec = answers as {
    strengthSessionsPerWeekCap?: number;
    mobilitySessionsPerWeekCap?: number;
  };
  let s =
    typeof rec.strengthSessionsPerWeekCap === "number"
      ? rec.strengthSessionsPerWeekCap
      : DEFAULT_STRENGTH_SESSIONS_CAP;
  let m =
    typeof rec.mobilitySessionsPerWeekCap === "number"
      ? rec.mobilitySessionsPerWeekCap
      : DEFAULT_MOBILITY_SESSIONS_CAP;
  if (!Number.isFinite(s)) s = DEFAULT_STRENGTH_SESSIONS_CAP;
  if (!Number.isFinite(m)) m = DEFAULT_MOBILITY_SESSIONS_CAP;
  return {
    strength: Math.max(0, Math.min(3, Math.round(s))),
    mobility: Math.max(0, Math.min(5, Math.round(m))),
  };
}

export function formatStrengthMobilitySummaryLines(
  strength: number,
  mobility: number,
  daysPerWeek?: number,
): { strengthLine: string; mobilityLine: string; noteLine: string } {
  const strengthLine =
    strength === 0
      ? "No dedicated strength blocks — your plan stays running-focused."
      : strength === 1
        ? "Up to 1 strength session per week when scheduling allows (usually none in taper)."
        : `Up to ${strength} strength sessions per week in base, build, and peak (taper scales down).`;

  const mobilityLine =
    mobility === 0
      ? "No standalone mobility sessions — Cade may still add brief cues on easy days if your injury notes require it."
      : `Up to ${mobility} mobility touchpoint${mobility === 1 ? "" : "s"} per week — usually ~15–20 min after a run, not a full separate day.`;

  const high = daysPerWeek != null && daysPerWeek >= 6;
  const noteLine = high
    ? `You train ${daysPerWeek} days/week: strength can follow an easy or long run the same day. Hard running and strength stay on different days. Runs are never dropped for strength or mobility unless your injury notes require it.`
    : "Hard running (tempo, intervals, threshold, strides, race pace) and strength are never on the same day. Runs stay in the plan — strength and mobility add on, they don’t replace running unless injury notes say otherwise.";

  return { strengthLine, mobilityLine, noteLine };
}

/** One-line for philosophy step recap */
export function formatStrengthMobilityCapsShort(strength: number, mobility: number): string {
  if (strength === 0 && mobility === 0) return "Strength 0/wk · Mobility 0/wk";
  return `Strength ≤${strength}/wk · Mobility ≤${mobility}/wk`;
}
