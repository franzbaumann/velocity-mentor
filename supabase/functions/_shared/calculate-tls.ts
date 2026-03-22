export type CNSStatus = "fresh" | "normal" | "loaded" | "overloaded" | "critical";

export interface OtherTraining {
  type: string;
  duration_min: number;
  intensity: "easy" | "moderate" | "hard";
  label?: string;
}

const WEIGHTS = { running: 0.35, otherTraining: 0.2, sleep: 0.2, lifeStress: 0.15, subjective: 0.1 };

function otherTrainingLoad(sessions: OtherTraining[]): number {
  const multiplier: Record<string, number> = { easy: 0.4, moderate: 0.7, hard: 1.0 };
  return sessions.reduce((sum, s) => {
    const hours = s.duration_min / 60;
    return sum + hours * (multiplier[s.intensity] ?? 0.7) * 20;
  }, 0);
}

function sleepLoad(hours: number, score: number): number {
  const deficit = Math.max(0, 8 - hours);
  const qualityPenalty = ((100 - score) / 100) * 20;
  return deficit * 15 + qualityPenalty;
}

function lifeStressLoad(work: number, life: number, travel: boolean): number {
  const base = ((work - 1) + (life - 1)) / 8 * 40;
  return base + (travel ? 10 : 0);
}

function subjectiveLoad(mood: number, energy: number, legs: number): number {
  const avg = (6 - mood + (6 - energy) + (6 - legs)) / 3;
  return (avg / 4) * 30;
}

export function calculateTLS(input: {
  runningATL: number;
  hrvScore: number;
  sleepHours: number;
  sleepScore: number;
  otherTraining: OtherTraining[];
  workStress: number;
  lifeStress: number;
  travel: boolean;
  mood: number;
  energy: number;
  legs: number;
}): { totalScore: number; cnsStatus: CNSStatus; recoveryScore: number; breakdown: Record<string, number> } {
  const runningComponent = (input.runningATL / 100) * 100 * WEIGHTS.running;
  const trainingComponent = Math.min(otherTrainingLoad(input.otherTraining), 40) * WEIGHTS.otherTraining;
  const sleepComponent = Math.min(sleepLoad(input.sleepHours, input.sleepScore), 50) * WEIGHTS.sleep;
  const lifeComponent = lifeStressLoad(input.workStress, input.lifeStress, input.travel) * WEIGHTS.lifeStress;
  const subjectiveComponent = subjectiveLoad(input.mood, input.energy, input.legs) * WEIGHTS.subjective;

  const totalScore = Math.min(
    100,
    Math.round(runningComponent + trainingComponent + sleepComponent + lifeComponent + subjectiveComponent),
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
    recoveryScore,
    breakdown: {
      running: Math.round(runningComponent),
      otherTraining: Math.round(trainingComponent),
      sleep: Math.round(sleepComponent),
      lifeStress: Math.round(lifeComponent),
      subjective: Math.round(subjectiveComponent),
    },
  };
}

/** Normalize HRV ms to 0-100. Typical range 20-100ms. */
export function hrvToScore(hrv: number | null): number {
  if (hrv == null) return 50;
  return Math.min(100, Math.max(0, ((hrv - 20) / 80) * 100));
}

/** Normalize ATL to 0-100 for TLS input. */
export function atlToScore(atl: number | null): number {
  if (atl == null) return 0;
  return Math.min(100, Math.max(0, atl));
}
