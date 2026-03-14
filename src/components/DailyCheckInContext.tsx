import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { DailyCheckIn } from "@/components/DailyCheckIn";
import { useDailyLoad } from "@/hooks/useDailyLoad";

type DailyCheckInContextValue = {
  openCheckIn: () => void;
  hasCheckedInToday: boolean;
};

const DailyCheckInContext = createContext<DailyCheckInContextValue | null>(null);

export function DailyCheckInProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { hasCheckedInToday } = useDailyLoad();
  const openCheckIn = useCallback(() => setOpen(true), []);

  return (
    <DailyCheckInContext.Provider value={{ openCheckIn, hasCheckedInToday }}>
      {children}
      <DailyCheckIn open={open} onClose={() => setOpen(false)} />
    </DailyCheckInContext.Provider>
  );
}

export function useDailyCheckIn() {
  const ctx = useContext(DailyCheckInContext);
  return ctx ?? { openCheckIn: () => {}, hasCheckedInToday: false };
}
