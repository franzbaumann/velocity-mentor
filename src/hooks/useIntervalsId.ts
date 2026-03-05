import { useState, useCallback } from "react";

const STORAGE_KEY = "intervals_icu_athlete_id";

export function useIntervalsId() {
  const [athleteId, setAthleteId] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? ""
  );

  const saveAthleteId = useCallback((id: string) => {
    const trimmed = id.trim();
    setAthleteId(trimmed);
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return { athleteId, saveAthleteId };
}
