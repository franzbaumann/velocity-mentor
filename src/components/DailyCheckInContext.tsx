import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { DailyCheckIn } from "@/components/DailyCheckIn";
import { useDailyLoad } from "@/hooks/useDailyLoad";
import { useCheckInStreak } from "@/hooks/useCheckInStreak";

type DailyCheckInContextValue = {
  openCheckIn: () => void;
  hasCheckedInToday: boolean;
  currentStreak: number;
  longestStreak: number;
  invalidateStreak: () => void;
};

const DailyCheckInContext = createContext<DailyCheckInContextValue | null>(null);

export function DailyCheckInProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { hasCheckedInToday } = useDailyLoad();
  const { currentStreak, longestStreak, invalidate: invalidateStreak } = useCheckInStreak();
  const openCheckIn = useCallback(() => setOpen(true), []);

  return (
    <DailyCheckInContext.Provider value={{ openCheckIn, hasCheckedInToday, currentStreak, longestStreak, invalidateStreak }}>
      {children}
      <DailyCheckIn open={open} onClose={() => setOpen(false)} />
    </DailyCheckInContext.Provider>
  );
}

export function useDailyCheckIn() {
  const ctx = useContext(DailyCheckInContext);
  return ctx ?? { openCheckIn: () => {}, hasCheckedInToday: false, currentStreak: 0, longestStreak: 0, invalidateStreak: () => {} };
}
