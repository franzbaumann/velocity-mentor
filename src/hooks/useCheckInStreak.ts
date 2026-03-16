import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const QK = ["check_in_streak"] as const;

function parseDatesToSet(rows: { date: string }[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) if (r?.date) set.add(String(r.date).slice(0, 10));
  return set;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/** Current streak = consecutive days with check-in ending on the most recent check-in date. */
function computeStreaks(dates: Set<string>, todayKey: string): { currentStreak: number; longestStreak: number; lastCheckInDate: string | null } {
  if (dates.size === 0) return { currentStreak: 0, longestStreak: 0, lastCheckInDate: null };

  const sorted = Array.from(dates).sort();
  const minDate = sorted[0];
  const maxDate = sorted[sorted.length - 1];

  let currentStreak = 0;
  const endDate = new Date(maxDate + "T12:00:00");
  let cursor = new Date(endDate);
  const cursorKey = () => toDateKey(cursor);
  while (dates.has(cursorKey())) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  let longestStreak = 0;
  let run = 0;
  const start = new Date(minDate + "T12:00:00");
  let day = new Date(start);
  const end = new Date(maxDate + "T12:00:00");
  while (day <= end) {
    const key = toDateKey(day);
    if (dates.has(key)) {
      run++;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 0;
    }
    day = addDays(day, 1);
  }

  return {
    currentStreak,
    longestStreak,
    lastCheckInDate: maxDate || null,
  };
}

export function useCheckInStreak() {
  const queryClient = useQueryClient();
  const todayKey = toDateKey(new Date());

  const { data, isLoading } = useQuery({
    queryKey: [...QK],
    queryFn: async (): Promise<{ currentStreak: number; longestStreak: number; lastCheckInDate: string | null }> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return { currentStreak: 0, longestStreak: 0, lastCheckInDate: null };

      const start = new Date();
      start.setDate(start.getDate() - 365);
      const startStr = toDateKey(start);

      const { data: rows, error } = await supabase
        .from("daily_load")
        .select("date")
        .eq("user_id", session.user.id)
        .gte("date", startStr)
        .lte("date", todayKey);

      if (error) throw error;
      const dates = parseDatesToSet(rows ?? []);
      return computeStreaks(dates, todayKey);
    },
    staleTime: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QK });

  return {
    currentStreak: data?.currentStreak ?? 0,
    longestStreak: data?.longestStreak ?? 0,
    lastCheckInDate: data?.lastCheckInDate ?? null,
    isLoading,
    invalidate,
  };
}
