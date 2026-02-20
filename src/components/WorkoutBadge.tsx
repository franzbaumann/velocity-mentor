import { WorkoutType } from "@/data/mockData";

const typeLabels: Record<WorkoutType, string> = {
  easy: "Easy",
  tempo: "Tempo",
  interval: "Interval",
  long: "Long",
  recovery: "Recovery",
  rest: "Rest",
  race: "Race",
};

export function WorkoutBadge({ type }: { type: WorkoutType }) {
  return (
    <span className={`workout-badge workout-${type}`}>
      {typeLabels[type]}
    </span>
  );
}
