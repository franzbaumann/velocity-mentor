// Mock data for a fictional athlete: 38yo male, VDOT 52, targeting 2:55 marathon in 14 weeks

export const athlete = {
  name: "Marcus Chen",
  vdot: 52,
  maxHr: 186,
  restingHr: 48,
  weeklyMileage: 75,
  trainingPhilosophy: "jack_daniels" as const,
  goalRace: {
    type: "Marathon",
    targetTime: "2:55:00",
    raceDate: "2026-05-31",
    weeksRemaining: 14,
  },
  currentPhase: "Build" as const,
};

export const readiness = {
  score: 72,
  hrv: 48,
  hrvBaseline: 54,
  hrvTrend: "down" as const,
  sleepHours: 6.8,
  sleepQuality: 7,
  restingHr: 49,
  ctl: 62,
  atl: 71,
  tsb: -9,
  aiSummary:
    "Elevated fatigue this week — your HRV is 11% below baseline. Today's easy run is a good call. Consider an extra 30 min of sleep tonight.",
};

export const todaysWorkout = {
  type: "easy" as const,
  title: "Easy Aerobic Run",
  distance: 10,
  description: "Easy effort, stay in Zone 2. Focus on relaxed form and cadence around 170 spm.",
  paceRange: "5:10–5:30/km",
};

export const weekPlan = [
  { day: "Mon", date: "Feb 16", type: "easy" as const, title: "Easy Run", distance: 10, detail: "5:10–5:30/km" },
  { day: "Tue", date: "Feb 17", type: "interval" as const, title: "VO2max Intervals", distance: 13, detail: "5×1000m @ 3:45/km" },
  { day: "Wed", date: "Feb 18", type: "recovery" as const, title: "Recovery Jog", distance: 6, detail: "5:40+/km" },
  { day: "Thu", date: "Feb 19", type: "tempo" as const, title: "Tempo Run", distance: 14, detail: "8km @ 4:10/km" },
  { day: "Fri", date: "Feb 20", type: "easy" as const, title: "Easy Run", distance: 10, detail: "5:10–5:30/km", isToday: true },
  { day: "Sat", date: "Feb 21", type: "long" as const, title: "Long Run", distance: 28, detail: "Progressive: 5:20→4:40/km" },
  { day: "Sun", date: "Feb 22", type: "rest" as const, title: "Rest Day", distance: 0, detail: "Full rest" },
];

export const weekStats = {
  plannedKm: 81,
  actualKm: 53,
  qualityDone: 2,
  qualityPlanned: 3,
  tssData: [45, 62, 30, 78, 0, 0, 0], // mock TSS per day
};

export const lastActivity = {
  type: "Tempo Run",
  date: "Feb 19",
  distance: 14.2,
  avgPace: "4:12/km",
  avgHr: 168,
  maxHr: 176,
  duration: "59:42",
  hrZones: { z1: 5, z2: 18, z3: 32, z4: 40, z5: 5 },
};

export const recoveryMetrics = {
  hrv: 48,
  hrv7dayAvg: 54,
  hrvTrend: [58, 55, 52, 49, 51, 47, 48],
  sleepHours: 6.8,
  sleepQuality: 7,
  restingHrTrend: [47, 48, 48, 49, 50, 49, 49],
};

export const vdotPaces = {
  easy: "5:10–5:30/km",
  marathon: "4:08/km",
  threshold: "3:58/km",
  interval: "3:42/km",
  repetition: "3:28/km",
};

export type WorkoutType = "easy" | "tempo" | "interval" | "long" | "recovery" | "rest" | "race";
