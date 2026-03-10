import { useSyncExternalStore } from "react";

const GARMIN_LAST_IMPORT_KEY = "garmin_last_import";
const GARMIN_STALE_DAYS = 7;
const CUSTOM_EVENT = "garmin_import_updated";

export type LastImportResult = { activitiesCount: number; readinessDaysCount: number } | null;

type StatusSnapshot = { banner: string | null; lastImportTs: number | null; lastResult: LastImportResult };

/** Cache for lastResult so useSyncExternalStore gets a stable reference (avoids infinite re-renders) */
let cachedLastResult: LastImportResult = null;
let cachedLastResultKey = "";

function getStatusSnapshot(): StatusSnapshot {
  try {
    const raw = localStorage.getItem(GARMIN_LAST_IMPORT_KEY);
    if (!raw) return { banner: "never", lastImportTs: null, lastResult: null };
    const parsed = JSON.parse(raw) as { ts?: number; activitiesCount?: number; readinessDaysCount?: number };
    const ts = parsed?.ts;
    if (!ts || typeof ts !== "number") return { banner: "never", lastImportTs: null, lastResult: null };
    const daysSince = (Date.now() - ts) / (24 * 60 * 60 * 1000);
    const banner =
      daysSince > GARMIN_STALE_DAYS
        ? `Garmin data is ${Math.floor(daysSince)} day${Math.floor(daysSince) === 1 ? "" : "s"} old — update import in Settings`
        : null;
    const lastResult: LastImportResult =
      typeof parsed.activitiesCount === "number" || typeof parsed.readinessDaysCount === "number"
        ? { activitiesCount: parsed.activitiesCount ?? 0, readinessDaysCount: parsed.readinessDaysCount ?? 0 }
        : null;
    // Use stable reference for useSyncExternalStore (prevents "Maximum update depth exceeded")
    let stableLastResult: LastImportResult = lastResult;
    if (lastResult) {
      const key = `${lastResult.activitiesCount}_${lastResult.readinessDaysCount}`;
      if (cachedLastResultKey === key && cachedLastResult) stableLastResult = cachedLastResult;
      else {
        cachedLastResultKey = key;
        cachedLastResult = lastResult;
      }
    } else {
      cachedLastResultKey = "";
      cachedLastResult = null;
    }
    return { banner, lastImportTs: ts, lastResult: stableLastResult };
  } catch {
    return { banner: "never", lastImportTs: null, lastResult: null };
  }
}

/** Returns: null = no banner, "never" = never imported, string = stale message */
function getSnapshot(): string | null {
  return getStatusSnapshot().banner;
}

/** Format last import time for display */
export function formatLastImport(ts: number): string {
  const sec = (Date.now() - ts) / 1000;
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function subscribe(cb: () => void) {
  window.addEventListener(CUSTOM_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CUSTOM_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useGarminImportStatus(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Returns timestamp (ms) of last Garmin import, or null if never imported */
export function useGarminLastImportTs(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => getStatusSnapshot().lastImportTs,
    () => getStatusSnapshot().lastImportTs
  );
}

/** Returns last import result (activitiesCount, readinessDaysCount) - persists across tab switches */
export function useGarminLastImportResult(): LastImportResult {
  return useSyncExternalStore(
    subscribe,
    () => getStatusSnapshot().lastResult,
    () => getStatusSnapshot().lastResult
  );
}

export function setGarminLastImport(result?: { activitiesCount: number; readinessDaysCount: number }) {
  try {
    const payload = {
      ts: Date.now(),
      activitiesCount: result?.activitiesCount ?? 0,
      readinessDaysCount: result?.readinessDaysCount ?? 0,
    };
    localStorage.setItem(GARMIN_LAST_IMPORT_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENT));
  } catch {
    // ignore
  }
}

/** Clear last import (for Reset button) - lets user try another drop */
export function clearGarminLastImport() {
  try {
    cachedLastResultKey = "";
    cachedLastResult = null;
    localStorage.removeItem(GARMIN_LAST_IMPORT_KEY);
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENT));
  } catch {
    // ignore
  }
}
