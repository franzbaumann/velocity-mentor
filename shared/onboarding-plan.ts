export type PhilosophyRecommendation = {
  primary: { philosophy: string; reason: string; confidence: number };
  alternatives: Array<{ philosophy: string; reason: string }>;
};

export type PhilosophyInputs = {
  weeklyKm: number;
  daysPerWeek?: number;
  raceDistance?: string;
  raceDate?: string;
  hasIntervalsData?: boolean;
  injuries?: string[];
  injuryDetail?: string;
  experienceLevel?: string;
  goal?: string;
};

function normStr(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

function safeWeeksUntil(dateStr: string | undefined): number | null {
  const s = normStr(dateStr);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const diff = d.getTime() - Date.now();
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
}

function hasInjurySignals(args: PhilosophyInputs): boolean {
  const injuries = Array.isArray(args.injuries) ? args.injuries : [];
  const injuryDetail = normStr(args.injuryDetail);
  const hasList = injuries.some((i) => i && i !== "none");
  const hasDetail = injuryDetail.length > 0 && injuryDetail.toLowerCase() !== "none";
  return hasList || hasDetail || args.goal === "return_injury";
}

function normDistance(distance: string): "5k" | "10k" | "half" | "marathon" | "ultra" | "general" {
  const d = distance.toLowerCase();
  if (d.includes("marathon") && !d.includes("half")) return "marathon";
  if (d.includes("half")) return "half";
  if (d.includes("10")) return "10k";
  if (d.includes("5")) return "5k";
  if (d.includes("ultra")) return "ultra";
  return "general";
}

function isExperienced(level: string): boolean {
  return ["experienced", "competitive"].includes(level);
}

export function getFallbackPhilosophy(args: PhilosophyInputs): PhilosophyRecommendation {
  const weeklyKm = args.weeklyKm ?? 0;
  const daysPerWeek = args.daysPerWeek ?? 0;
  const distance = normDistance(normStr(args.raceDistance));
  const experienceLevel = normStr(args.experienceLevel);
  const weeksToRace = safeWeeksUntil(args.raceDate);
  const hasData = args.hasIntervalsData !== false; // default optimistic unless explicitly false
  let primary: PhilosophyRecommendation["primary"];
  const alternatives: PhilosophyRecommendation["alternatives"] = [];

  // Highest priority: injury / return-from-injury → conservative intensity distribution.
  if (hasInjurySignals(args)) {
    primary = {
      philosophy: "80_20_polarized",
      reason:
        "With injury signals in your profile, a polarized structure keeps hard work constrained while you rebuild durable volume.",
      confidence: 0.88,
    };
    alternatives.push(
      { philosophy: "lydiard", reason: "Aerobic-first base building can work if you keep intensity tightly controlled." },
      { philosophy: "jack_daniels", reason: "VDOT structure is helpful later, once you're handling consistent volume." },
    );
    return { primary, alternatives };
  }

  // Low data confidence: prefer robust, lower-risk structure unless athlete is clearly in a sharpening window.
  if (!hasData && (weeksToRace == null || weeksToRace > 8)) {
    primary = {
      philosophy: "80_20_polarized",
      reason:
        "Without reliable training data, a polarized structure is the safest default: it protects consistency while still allowing focused progress.",
      confidence: 0.84,
    };
    alternatives.push(
      { philosophy: "jack_daniels", reason: "VDOT can work if you want stricter pace targets (but needs accurate paces)." },
      { philosophy: "lydiard", reason: "Base building is effective if you keep intensity honest and progress gradually." },
    );
    return { primary, alternatives };
  }

  // Close to race: bias toward clearer pace prescription / sharpening (unless marathon high-volume specialization applies).
  if (weeksToRace != null && weeksToRace > 0 && weeksToRace <= 8) {
    const isA = distance !== "general";
    const canSharpen = isA && weeklyKm >= 25 && (daysPerWeek >= 3 || daysPerWeek === 0);
    const marathonHighVolumeSpecialist =
      isExperienced(experienceLevel) && daysPerWeek >= 5 && distance === "marathon" && weeklyKm >= 65;

    if (canSharpen && !marathonHighVolumeSpecialist) {
      primary = {
        philosophy: "jack_daniels",
        reason:
          "With race day approaching, VDOT-style structure gives clear pacing and sharpening while keeping the rest of training controlled.",
        confidence: 0.87,
      };
      alternatives.push(
        { philosophy: "80_20_polarized", reason: "Polarized is a good option if you want simpler intensity control approaching race day." },
        ...(distance === "marathon" || distance === "half"
          ? [{ philosophy: "hansons", reason: "Hansons can suit if you prefer consistent moderate work over big long runs." }]
          : [{ philosophy: "kenyan_model", reason: "If you thrive on fartlek and group-style sessions, this can be motivating." }]),
      );
      return { primary, alternatives };
    }
  }

  // Marathon / half-marathon specialization for experienced runners with sufficient capacity.
  if (isExperienced(experienceLevel) && daysPerWeek >= 5 && (distance === "marathon" || distance === "half")) {
    if (weeklyKm >= 65) {
      primary = {
        philosophy: "pfitzinger",
        reason:
          "For experienced runners with higher volume, Pfitzinger-style LT + aerobic development tends to convert mileage into race performance efficiently.",
        confidence: 0.87,
      };
      alternatives.push(
        { philosophy: "hansons", reason: "Hansons can suit if you prefer more frequent moderate work and slightly shorter long runs." },
        { philosophy: "jack_daniels", reason: "VDOT paces provide a clean sharpening framework approaching race day." },
      );
      return { primary, alternatives };
    }
    if (weeklyKm >= 50) {
      primary = {
        philosophy: "hansons",
        reason:
          "At moderate-high volume with good frequency, Hansons-style consistency builds marathon readiness without over-relying on a single long run.",
        confidence: 0.85,
      };
      alternatives.push(
        { philosophy: "jack_daniels", reason: "VDOT structure can be simpler if you want clearer pace prescriptions." },
        { philosophy: "80_20_polarized", reason: "Polarized structure can reduce burnout while keeping key work effective." },
      );
      return { primary, alternatives };
    }
  }

  // Shorter distance sharpening: experienced runner → VDOT structure is usually a good default.
  if (isExperienced(experienceLevel) && (distance === "5k" || distance === "10k") && weeklyKm >= 30) {
    primary = {
      philosophy: "jack_daniels",
      reason:
        "For 5K/10K with experience, VDOT-based pacing and structured quality sessions tend to deliver reliable speed gains.",
      confidence: 0.86,
    };
    alternatives.push(
      { philosophy: "80_20_polarized", reason: "Polarized distribution keeps intensity controlled while still sharpening speed." },
      { philosophy: "kenyan_model", reason: "If you thrive on fartlek and group-style sessions, this can be motivating." },
    );
    return { primary, alternatives };
  }

  // Beginner / low experience: reduce complexity and protect consistency.
  if (experienceLevel === "beginner") {
    primary = {
      philosophy: "80_20_polarized",
      reason:
        "As a newer runner, keeping most work easy and limiting hard sessions helps consistency and reduces injury risk.",
      confidence: 0.86,
    };
    alternatives.push(
      { philosophy: "lydiard", reason: "Base building works well if you enjoy steady aerobic progression." },
      { philosophy: "jack_daniels", reason: "VDOT can be useful later once volume is stable." },
    );
    return { primary, alternatives };
  }

  if (weeklyKm < 30) {
    primary = {
      philosophy: "80_20_polarized",
      reason:
        "At under 30 km/week, 80/20 keeps intensity balanced and reduces injury risk while you build volume.",
      confidence: 0.85,
    };
    alternatives.push(
      {
        philosophy: "jack_daniels",
        reason: "VDOT-based training gives clear paces as you increase volume.",
      },
      {
        philosophy: "lydiard",
        reason: "Base-first approach suits lower volume; add intensity later.",
      },
    );
  } else if (weeklyKm <= 60) {
    primary = {
      philosophy: "jack_daniels",
      reason:
        "In the 30–60 km/week range, Jack Daniels VDOT provides structured zones and proven progressions.",
      confidence: 0.85,
    };
    alternatives.push(
      {
        philosophy: "80_20_polarized",
        reason: "Polarized model works well at this volume for race-focused training.",
      },
      {
        philosophy: "lydiard",
        reason: "Lydiard base-building fits if you prefer a long aerobic phase.",
      },
    );
  } else {
    primary = {
      philosophy: "lydiard",
      reason:
        "Above 60 km/week, Lydiard base-building leverages your volume and periodizes intensity effectively.",
      confidence: 0.85,
    };
    alternatives.push(
      {
        philosophy: "jack_daniels",
        reason: "VDOT structure pairs well with high volume for sharpening.",
      },
      {
        philosophy: "pfitzinger",
        reason: "Pfitzinger suits high mileage with lactate threshold focus.",
      },
    );
  }

  return { primary, alternatives };
}

export type PlanIntake = Record<string, string | string[] | number | undefined> & {
  race_date?: string;
  race_goal?: string;
  target_time?: string;
  plan_start_date?: string;
  weekly_frequency?: string;
  long_run_day?: string;
  available_days?: string[];
  detailed_injuries?: string;
  availability_notes?: string;
  training_history_notes?: string;
  philosophy?: string;
  plan_name?: string;
};

export function mapOnboardingAnswersToIntake(args: {
  raceDate?: string;
  raceDistance?: string;
  goalTime?: string;
  planStartDate?: string;
  daysPerWeek?: number;
  preferredDays?: string[];
  schedulingNote?: string;
  injuryDetail?: string;
  trainingHistoryNote?: string;
  philosophy?: string | null;
}): PlanIntake {
  const daysPerWeek = args.daysPerWeek ?? 0;
  const freqStr = daysPerWeek >= 6 ? "6-7" : daysPerWeek >= 1 ? `${daysPerWeek} days` : "4 days";
  const days =
    args.preferredDays && args.preferredDays.length > 0
      ? args.preferredDays
      : ["Monday", "Wednesday", "Friday", "Saturday"];

  const philosophy = args.philosophy ?? undefined;
  return {
    race_date: args.raceDate,
    race_goal: args.raceDistance || "General",
    target_time: args.goalTime,
    plan_start_date: normStr(args.planStartDate) || undefined,
    weekly_frequency: freqStr,
    long_run_day: /sunday/i.test(args.schedulingNote || "") ? "Sunday" : "Saturday",
    available_days: days,
    detailed_injuries: args.injuryDetail || "",
    availability_notes: args.schedulingNote || "",
    training_history_notes: args.trainingHistoryNote || "",
    ...(philosophy ? { philosophy, plan_name: `Plan · ${philosophy}` } : {}),
  };
}

