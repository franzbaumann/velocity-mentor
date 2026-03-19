/**
 * Hard rules for training philosophy recommendations during onboarding.
 * Applied client-side after the AI response so they cannot be overridden.
 */

import type { PhilosophyRecommendation } from "@/components/onboarding-v2/types";

export type PhilosophyConstraintDistance =
  | "1500m"
  | "mile"
  | "5k"
  | "10k"
  | "half_marathon"
  | "marathon"
  | "ultra";

export function normalizeRaceDistanceToConstraintKey(
  raceDistance: string
): PhilosophyConstraintDistance | null {
  const x = raceDistance.trim();
  const map: Record<string, PhilosophyConstraintDistance> = {
    "1500m": "1500m",
    Mile: "mile",
    "5K": "5k",
    "10K": "10k",
    "Half Marathon": "half_marathon",
    Marathon: "marathon",
    Ultra: "ultra",
  };
  return map[x] ?? null;
}

/** Canonical keys used in exclusion / preference lists (not always API ids). */
export type PhilosophyCanonical =
  | "hansons"
  | "pfitzinger"
  | "lydiard"
  | "daniels"
  | "80_20"
  | "norwegian";

export function getPhilosophyConstraints(distance: PhilosophyConstraintDistance | null): {
  excluded: PhilosophyCanonical[];
  preferred: PhilosophyCanonical[];
} {
  switch (distance) {
    case "1500m":
    case "mile":
    case "5k":
      return {
        excluded: ["hansons", "pfitzinger", "lydiard"],
        preferred: ["daniels", "80_20", "norwegian"],
      };
    case "10k":
      return {
        excluded: ["hansons"],
        preferred: ["daniels", "80_20", "norwegian"],
      };
    case "half_marathon":
      return {
        excluded: ["hansons"],
        preferred: ["daniels", "80_20", "pfitzinger", "norwegian"],
      };
    case "marathon":
      return {
        excluded: [],
        preferred: ["hansons", "pfitzinger", "daniels", "80_20"],
      };
    case "ultra":
      return {
        excluded: ["hansons", "daniels"],
        preferred: ["80_20", "lydiard"],
      };
    default:
      return { excluded: [], preferred: ["daniels", "80_20"] };
  }
}

const API_TO_CANONICAL: Record<string, PhilosophyCanonical | null> = {
  jack_daniels: "daniels",
  "80_20_polarized": "80_20",
  kenyan_model: "norwegian",
  hansons: "hansons",
  pfitzinger: "pfitzinger",
  lydiard: "lydiard",
};

export function apiPhilosophyToCanonical(apiId: string): PhilosophyCanonical | null {
  if (API_TO_CANONICAL[apiId] !== undefined) return API_TO_CANONICAL[apiId];
  const low = apiId.toLowerCase();
  if (low.includes("hanson")) return "hansons";
  if (low.includes("pfitz")) return "pfitzinger";
  if (low.includes("lydiard")) return "lydiard";
  if (low.includes("daniel")) return "daniels";
  if (low.includes("80_20") || low.includes("polarized")) return "80_20";
  if (low.includes("kenyan")) return "norwegian";
  return null;
}

function canonicalToApiId(c: PhilosophyCanonical): string {
  const m: Record<PhilosophyCanonical, string> = {
    daniels: "jack_daniels",
    "80_20": "80_20_polarized",
    norwegian: "kenyan_model",
    hansons: "hansons",
    pfitzinger: "pfitzinger",
    lydiard: "lydiard",
  };
  return m[c];
}

function isApiExcluded(apiId: string, excluded: ReadonlySet<PhilosophyCanonical>): boolean {
  const c = apiPhilosophyToCanonical(apiId);
  if (!c) return false;
  return excluded.has(c);
}

function pickFallbackPrimary(
  excluded: ReadonlySet<PhilosophyCanonical>,
  preferred: readonly PhilosophyCanonical[]
): { philosophy: string; reason: string; confidence: number } {
  for (const p of preferred) {
    if (!excluded.has(p)) {
      return {
        philosophy: canonicalToApiId(p),
        reason: "",
        confidence: 0.85,
      };
    }
  }
  if (!excluded.has("daniels")) {
    return { philosophy: "jack_daniels", reason: "", confidence: 0.85 };
  }
  if (!excluded.has("80_20")) {
    return { philosophy: "80_20_polarized", reason: "", confidence: 0.85 };
  }
  return { philosophy: "lydiard", reason: "", confidence: 0.85 };
}

export function filterPhilosophyRecommendation(
  data: PhilosophyRecommendation,
  raceDistance: string
): PhilosophyRecommendation {
  const dist = normalizeRaceDistanceToConstraintKey(raceDistance);
  const { excluded, preferred } = getPhilosophyConstraints(dist);
  const excludedSet = new Set(excluded);

  const ordered: { philosophy: string; reason: string; confidence?: number }[] = [
    {
      philosophy: data.primary.philosophy,
      reason: data.primary.reason,
      confidence: data.primary.confidence,
    },
    ...data.alternatives.map((a) => ({ philosophy: a.philosophy, reason: a.reason })),
  ];

  const seen = new Set<string>();
  const valid: { philosophy: string; reason: string; confidence?: number }[] = [];
  for (const item of ordered) {
    if (seen.has(item.philosophy)) continue;
    if (isApiExcluded(item.philosophy, excludedSet)) continue;
    seen.add(item.philosophy);
    valid.push(item);
  }

  let primary = valid[0];
  if (!primary) {
    primary = pickFallbackPrimary(excludedSet, preferred);
    valid.unshift(primary);
  }

  const alts = valid
    .filter((v) => v.philosophy !== primary.philosophy)
    .slice(0, 2)
    .map((v) => ({ philosophy: v.philosophy, reason: v.reason }));

  return {
    primary: {
      philosophy: primary.philosophy,
      reason: primary.reason,
      confidence: primary.confidence ?? data.primary.confidence ?? 0.85,
    },
    alternatives: alts,
  };
}

const PHILOSOPHY_PITCH: Record<string, Record<string, string>> = {
  hansons: {
    marathon: "Trains you on tired legs — so race day feels easier than training.",
    default: "High-consistency approach built around cumulative fatigue.",
  },
  daniels: {
    "10k":
      "Precise paces, structured quality sessions. Built for runners who want to know exactly why every run is in the plan.",
    "5k": "VO2max-focused with careful periodization. Daniels wrote the book on 5K development.",
    marathon:
      "Scientific pacing and structured phases. The gold standard for data-driven runners.",
    default: "Evidence-based training with precise pace targets at every intensity.",
  },
  "80_20": {
    default:
      "80% easy, 20% hard — backed by more research than any other approach. Works at every distance.",
  },
  pfitzinger: {
    marathon: "Higher mileage than most plans dare. Built for runners ready to commit to the process.",
    default: "Serious mileage, serious results.",
  },
  norwegian: {
    default:
      "Double threshold work at controlled lactate. The method behind some of the world's fastest marathoners.",
  },
  lydiard: {
    default: "Long aerobic base before any speed work. Old school, still works.",
  },
};

function pitchKeyForApi(apiId: string): keyof typeof PHILOSOPHY_PITCH {
  const c = apiPhilosophyToCanonical(apiId);
  if (c === "daniels") return "daniels";
  if (c === "80_20") return "80_20";
  if (c === "norwegian") return "norwegian";
  if (c === "hansons") return "hansons";
  if (c === "pfitzinger") return "pfitzinger";
  if (c === "lydiard") return "lydiard";
  return "daniels";
}

export function getPhilosophyPitch(apiId: string, distance: PhilosophyConstraintDistance | null): string {
  const pk = pitchKeyForApi(apiId);
  const bucket = PHILOSOPHY_PITCH[pk];
  if (!bucket) {
    return PHILOSOPHY_PITCH.daniels.default;
  }
  const d = distance ?? "";
  if (d && bucket[d]) return bucket[d];
  return bucket.default;
}

export function getPhilosophyHeadline(distance: PhilosophyConstraintDistance | null): string {
  if (!distance) return "Built for your goal.";
  const headlines: Record<PhilosophyConstraintDistance, string> = {
    "1500m": "Built for your 1500m.",
    mile: "Built for your mile.",
    "5k": "Built for your 5K.",
    "10k": "Built for your 10K.",
    half_marathon: "Built for your half marathon.",
    marathon: "Built for your marathon.",
    ultra: "Built for your ultra.",
  };
  return headlines[distance];
}

export function formatSummaryRaceDistance(raceDistance: string): string {
  const key = normalizeRaceDistanceToConstraintKey(raceDistance);
  if (!key) return raceDistance || "Your goal";
  const labels: Record<PhilosophyConstraintDistance, string> = {
    "1500m": "1500m",
    mile: "Mile",
    "5k": "5K",
    "10k": "10K",
    half_marathon: "Half marathon",
    marathon: "Marathon",
    ultra: "Ultra",
  };
  return labels[key];
}
