export type CNSStatus = "fresh" | "normal" | "loaded" | "overloaded" | "critical";

export interface OtherTraining {
  type: string;
  duration_min: number;
  intensity: "easy" | "moderate" | "hard";
  label?: string;
}

export interface TLSInput {
  runningATL: number; // from intervals.icu, 0-100
  hrvScore: number; // 0-100 normalized
  sleepHours: number;
  sleepScore: number; // 0-100
  otherTraining: OtherTraining[];
  workStress: number; // 1-5
  lifeStress: number; // 1-5
  travel: boolean;
  mood: number; // 1-5
  energy: number; // 1-5
  legs: number; // 1-5
}

export interface TLSResult {
  totalScore: number;
  cnsStatus: CNSStatus;
  breakdown: {
    running: number;
    otherTraining: number;
    sleep: number;
    lifeStress: number;
    subjective: number;
  };
  recoveryScore: number;
}

// WEIGHTS — running still dominates but life load matters
const WEIGHTS = {
  running: 0.35,
  otherTraining: 0.2,
  sleep: 0.2,
  lifeStress: 0.15,
  subjective: 0.1,
};

function otherTrainingLoad(sessions: OtherTraining[]): number {
  const multiplier: Record<string, number> = { easy: 0.4, moderate: 0.7, hard: 1.0 };
  return sessions.reduce((sum, s) => {
    const hours = s.duration_min / 60;
    return sum + hours * (multiplier[s.intensity] ?? 0.7) * 20;
  }, 0);
  // 1hr hard padel = 20pts | 1hr easy cycling = 8pts
}

function sleepLoad(hours: number, score: number): number {
  const deficit = Math.max(0, 8 - hours);
  const qualityPenalty = ((100 - score) / 100) * 20;
  return deficit * 15 + qualityPenalty;
  // 6hr sleep = 30pts | poor quality adds up to 20 more
}

function lifeStressLoad(work: number, life: number, travel: boolean): number {
  const base = ((work - 1) + (life - 1)) / 8 * 40;
  return base + (travel ? 10 : 0);
}

function subjectiveLoad(mood: number, energy: number, legs: number): number {
  const avg = (6 - mood + (6 - energy) + (6 - legs)) / 3;
  return (avg / 4) * 30;
}

export function calculateTLS(input: TLSInput): TLSResult {
  const runningComponent = (input.runningATL / 100) * 100 * WEIGHTS.running;
  const trainingComponent = Math.min(otherTrainingLoad(input.otherTraining), 40) * WEIGHTS.otherTraining;
  const sleepComponent = Math.min(sleepLoad(input.sleepHours, input.sleepScore), 50) * WEIGHTS.sleep;
  const lifeComponent = lifeStressLoad(input.workStress, input.lifeStress, input.travel) * WEIGHTS.lifeStress;
  const subjectiveComponent = subjectiveLoad(input.mood, input.energy, input.legs) * WEIGHTS.subjective;

  const totalScore = Math.min(
    100,
    Math.round(runningComponent + trainingComponent + sleepComponent + lifeComponent + subjectiveComponent)
  );

  const recoveryScore = Math.round(100 - totalScore);

  const cnsStatus: CNSStatus =
    totalScore < 30 ? "fresh"
    : totalScore < 50 ? "normal"
    : totalScore < 65 ? "loaded"
    : totalScore < 80 ? "overloaded"
    : "critical";

  return {
    totalScore,
    cnsStatus,
    breakdown: {
      running: Math.round(runningComponent),
      otherTraining: Math.round(trainingComponent),
      sleep: Math.round(sleepComponent),
      lifeStress: Math.round(lifeComponent),
      subjective: Math.round(subjectiveComponent),
    },
    recoveryScore,
  };
}
