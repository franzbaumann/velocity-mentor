export const athlete = {
  currentPhase: "Build",
  goalRace: { type: "HM", weeksRemaining: 8 },
};

export const readiness = {
  score: 72,
  aiSummary:
    "Elevated fatigue this week — your HRV is 11% below baseline. Today's easy run is a good call. Consider an extra 30 min of sleep tonight.",
  hrv: 48,
  sleepHours: 6.8,
  tsb: -9,
  ctl: 62,
};

export const todaysWorkout = { type: "easy" as const, title: "Easy Aerobic Run" };

export const weekStats = {
  actualKm: 53,
  plannedKm: 81,
  qualityPlanned: 3,
  qualityDone: 2,
  tssData: [45, 62, 30, 78, 0, 0, 0],
};

export const lastActivity = {
  type: "Tempo Run",
  date: "Feb 19",
  distance: "14.2 km",
  avgPace: "4:12/km",
  avgHr: 168,
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

export const weekPlan = [
  { day: "Mon", date: "16 Feb", type: "easy" as const, title: "Easy Run", distance: 10, detail: "5:10–5:30/km", isToday: false },
  { day: "Tue", date: "17 Feb", type: "interval" as const, title: "VO2max Intervals", distance: 13, detail: "5×1000m @ 3:45/km", isToday: false },
  { day: "Wed", date: "18 Feb", type: "recovery" as const, title: "Recovery Jog", distance: 6, detail: "5:40+/km", isToday: false },
  { day: "Thu", date: "19 Feb", type: "tempo" as const, title: "Tempo Run", distance: 14, detail: "8km @ 4:10/km", isToday: false },
  { day: "Fri", date: "20 Feb", type: "easy" as const, title: "Easy Run", distance: 10, detail: "5:10–5:30/km", isToday: true },
  { day: "Sat", date: "21 Feb", type: "long" as const, title: "Long Run", distance: 28, detail: "Progressive: 5:20→4:40/km", isToday: false },
  { day: "Sun", date: "22 Feb", type: "rest" as const, title: "Rest Day", distance: 0, detail: "Full rest", isToday: false },
];
