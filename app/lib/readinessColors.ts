export function readinessColorForScore(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  if (s >= 75) return "hsl(141, 72%, 50%)"; // green
  if (s >= 50) return "hsl(36, 100%, 52%)"; // amber
  return "hsl(0, 84%, 60%)"; // red
}

export function readinessStatusForScore(score: number): "Ready" | "Neutral" | "Fatigued" {
  const s = Math.max(0, Math.min(100, score));
  if (s >= 75) return "Ready";
  if (s >= 50) return "Neutral";
  return "Fatigued";
}

