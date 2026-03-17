import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../shared/supabase";
import { getLocalDateString } from "../lib/date";

type DailyStreakState = {
  currentStreak: number;
  longestStreak: number;
  isOnStreak: boolean;
  isMilestone: boolean;
  milestoneDay: number | null;
  lastActiveDate: string;
};

const MILESTONES = [3, 7, 14, 21, 30, 60, 100, 365];

const LOCAL_STREAK_KEY = "daily_streak_local_v1";

type StorageRecord = {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
};

export function useDailyStreak(): DailyStreakState {
  const [state, setState] = useState<DailyStreakState>({
    currentStreak: 0,
    longestStreak: 0,
    isOnStreak: false,
    isMilestone: false,
    milestoneDay: null,
    lastActiveDate: "",
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const todayStr = getLocalDateString();
      const today = new Date(`${todayStr}T00:00:00`);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const milestoneKey = `daily_streak_last_milestone_${user?.id ?? "local"}`;
        const lastMilestoneRaw = await AsyncStorage.getItem(milestoneKey);
        const lastMilestoneShown = lastMilestoneRaw ? Number.parseInt(lastMilestoneRaw, 10) || 0 : 0;

        let currentStreak = 0;
        let longestStreak = 0;
        let lastActiveDate = todayStr;

        if (user) {
          const { data, error } = await supabase
            .from("daily_streaks")
            .select("id, current_streak, longest_streak, last_active_date")
            .eq("user_id", user.id)
            .maybeSingle();

          if (error) {
            // fall back to local storage
            const local = await AsyncStorage.getItem(LOCAL_STREAK_KEY);
            if (local) {
              const parsed: StorageRecord = JSON.parse(local);
              currentStreak = parsed.currentStreak;
              longestStreak = parsed.longestStreak;
              lastActiveDate = parsed.lastActiveDate;
            }
          } else if (!data) {
            currentStreak = 1;
            longestStreak = 1;
            lastActiveDate = todayStr;
            await supabase.from("daily_streaks").insert({
              user_id: user.id,
              current_streak: currentStreak,
              longest_streak: longestStreak,
              last_active_date: lastActiveDate,
            });
          } else {
            currentStreak = data.current_streak ?? 0;
            longestStreak = data.longest_streak ?? 0;
            lastActiveDate = data.last_active_date ?? todayStr;
          }
        } else {
          const local = await AsyncStorage.getItem(LOCAL_STREAK_KEY);
          if (local) {
            const parsed: StorageRecord = JSON.parse(local);
            currentStreak = parsed.currentStreak;
            longestStreak = parsed.longestStreak;
            lastActiveDate = parsed.lastActiveDate;
          }
        }

        // compute new streak based on lastActiveDate vs today
        const last = new Date(`${lastActiveDate}T00:00:00`);
        const diffDays = Math.round((today.getTime() - last.getTime()) / 86400000);

        let nextStreak = currentStreak;
        if (!currentStreak || !lastActiveDate) {
          nextStreak = 1;
        } else if (diffDays === 0) {
          nextStreak = currentStreak;
        } else if (diffDays === 1) {
          nextStreak = currentStreak + 1;
        } else if (diffDays > 1) {
          nextStreak = 1;
        }

        const nextLongest = Math.max(longestStreak || 1, nextStreak || 1);
        const nextLastActive = diffDays >= 1 ? todayStr : lastActiveDate || todayStr;
        const hasChanged = nextStreak !== currentStreak || nextLongest !== longestStreak || nextLastActive !== lastActiveDate;

        if (hasChanged) {
          if (user) {
            await supabase
              .from("daily_streaks")
              .upsert(
                {
                  user_id: user.id,
                  current_streak: nextStreak,
                  longest_streak: nextLongest,
                  last_active_date: nextLastActive,
                },
                { onConflict: "user_id" },
              );
          }

          await AsyncStorage.setItem(
            LOCAL_STREAK_KEY,
            JSON.stringify({
              currentStreak: nextStreak,
              longestStreak: nextLongest,
              lastActiveDate: nextLastActive,
            } satisfies StorageRecord),
          );
        }

        const isMilestoneRaw = MILESTONES.includes(nextStreak);
        const shouldCelebrate = isMilestoneRaw && nextStreak > lastMilestoneShown;

        if (shouldCelebrate) {
          await AsyncStorage.setItem(milestoneKey, String(nextStreak));
        }

        if (cancelled) return;

        setState({
          currentStreak: nextStreak,
          longestStreak: nextLongest,
          isOnStreak: nextStreak > 1,
          isMilestone: shouldCelebrate,
          milestoneDay: shouldCelebrate ? nextStreak : null,
          lastActiveDate: nextLastActive,
        });
      } catch {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          isMilestone: false,
          milestoneDay: null,
        }));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

