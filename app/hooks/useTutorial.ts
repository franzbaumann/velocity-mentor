import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type UseTutorialResult = {
  shouldShow: boolean | null;
  complete: () => Promise<void>;
};

const COMPLETED_KEY = "tutorial_completed";
const COMPLETED_AT_KEY = "tutorial_completed_at";
const ACCOUNT_CREATED_AT_KEY = "account_created_at";

export function useTutorial(): UseTutorialResult {
  const [shouldShow, setShouldShow] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const [seen, createdAt] = await Promise.all([
          AsyncStorage.getItem(COMPLETED_KEY),
          AsyncStorage.getItem(ACCOUNT_CREATED_AT_KEY),
        ]);
        if (cancelled) return;
        const isNewUser = !!createdAt;
        if (seen === "true") {
          setShouldShow(false);
        } else if (isNewUser) {
          setShouldShow(true);
        } else {
          setShouldShow(false);
        }
      } catch {
        if (!cancelled) {
          setShouldShow(false);
        }
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const complete = async () => {
    try {
      const now = new Date().toISOString();
      await AsyncStorage.multiSet([
        [COMPLETED_KEY, "true"],
        [COMPLETED_AT_KEY, now],
      ]);
    } catch {
      // ignore
    }
    setShouldShow(false);
  };

  return { shouldShow, complete };
}

