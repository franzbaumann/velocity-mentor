import React, { createContext, useContext, useEffect, useState, useCallback, type PropsWithChildren } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSupabaseAuth } from "../SupabaseProvider";

const COMPLETED_KEY = "tutorial_v2_completed";
const COMPLETED_AT_KEY = "tutorial_v2_completed_at";

export type OnboardingStatus = "loading" | "new_user" | "returning_user";

type OnboardingContextValue = {
  status: OnboardingStatus;
  completeTutorial: () => Promise<void>;
  resetForTesting: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<OnboardingStatus>("loading");
  const { user, loading, devBypass } = useSupabaseAuth();
  const isAuthenticated = !!user || devBypass;

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        if (loading) return;

        if (!isAuthenticated) {
          if (!cancelled) setStatus("returning_user");
          return;
        }

        const completed = await AsyncStorage.getItem(COMPLETED_KEY);
        if (completed === "true") {
          if (!cancelled) setStatus("returning_user");
          return;
        }

        if (devBypass) {
          if (!cancelled) setStatus("new_user");
          return;
        }

        const createdAtStr = (user as any)?.created_at as string | null | undefined;
        const createdAt = createdAtStr ? new Date(createdAtStr).getTime() : NaN;
        if (!Number.isFinite(createdAt)) {
          if (!cancelled) setStatus("returning_user");
          return;
        }

        const accountAge = Date.now() - createdAt;
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (accountAge < sevenDays) {
          if (!cancelled) setStatus("new_user");
        } else {
          await AsyncStorage.setItem(COMPLETED_KEY, "true");
          if (!cancelled) setStatus("returning_user");
        }
      } catch {
        if (!cancelled) setStatus("returning_user");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [loading, isAuthenticated, user, devBypass]);

  const completeTutorial = useCallback(async () => {
    try {
      await AsyncStorage.multiSet([
        [COMPLETED_KEY, "true"],
        [COMPLETED_AT_KEY, new Date().toISOString()],
      ]);
    } catch {
      // best-effort
    }
    setStatus("returning_user");
  }, []);

  const resetForTesting = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([COMPLETED_KEY, COMPLETED_AT_KEY]);
    } catch {
      // ignore
    }
    setStatus("new_user");
  }, []);

  const value = React.useMemo(
    () => ({ status, completeTutorial, resetForTesting }),
    [status, completeTutorial, resetForTesting],
  );

  return React.createElement(OnboardingContext.Provider, { value }, children);
}

export function useOnboardingStatus(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboardingStatus must be used inside OnboardingProvider");
  }
  return ctx;
}
