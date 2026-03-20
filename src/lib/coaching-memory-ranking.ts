/**
 * Recency-weighted ranking for coaching_memory rows in AI prompts.
 * Keep in sync with supabase/functions/_shared/coaching-memory-ranking.ts
 */

const HALF_LIFE_DAYS: Record<string, number> = {
  lifestyle: 14,
  race: 45,
  preference: 120,
  injury: 365,
  goal: 180,
  personality: 120,
  other: 90,
};

export function scoreMemoryForPrompt(
  category: string,
  importance: number,
  createdAtIso: string,
  nowMs: number = Date.now(),
): number {
  const halfLife = HALF_LIFE_DAYS[category] ?? HALF_LIFE_DAYS.other;
  const created = new Date(createdAtIso).getTime();
  if (Number.isNaN(created)) return importance;
  const ageDays = Math.max(0, (nowMs - created) / (1000 * 60 * 60 * 24));
  const decay = Math.exp(-ageDays / halfLife);
  return importance * decay;
}

export function pickTopMemories<T extends { category: string; importance: number; created_at: string }>(
  rows: T[],
  limit: number,
  nowMs: number = Date.now(),
): T[] {
  if (rows.length <= limit) {
    return [...rows].sort(
      (a, b) =>
        scoreMemoryForPrompt(b.category, b.importance, b.created_at, nowMs) -
        scoreMemoryForPrompt(a.category, a.importance, a.created_at, nowMs),
    );
  }
  return [...rows]
    .map((row) => ({
      row,
      score: scoreMemoryForPrompt(row.category, row.importance, row.created_at, nowMs),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.row);
}
