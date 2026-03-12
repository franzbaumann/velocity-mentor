const ZONE_COLORS: Record<string, string> = {
  z2: "#2196F3",
  z3: "#4CAF50",
  z4: "#FF9800",
  z5: "#e91e63",
};

export type HRBin = { bpm: number; time: number; zone: string; color: string };
export type CumulativePoint = { bpm: number; time: number };
export type MeanMaxPoint = { label: string; hr: number };

function getZone(bpm: number, maxHr: number): { zone: string; color: string } {
  const pct = bpm / maxHr;
  if (pct < 0.7) return { zone: "z2", color: ZONE_COLORS.z2 };
  if (pct < 0.8) return { zone: "z3", color: ZONE_COLORS.z3 };
  if (pct < 0.9) return { zone: "z4", color: ZONE_COLORS.z4 };
  return { zone: "z5", color: ZONE_COLORS.z5 };
}

export function computeHRDistribution(
  heartrate: number[],
  time: number[],
  maxHr: number,
): HRBin[] {
  if (heartrate.length < 2 || time.length < 2) return [];
  const bins: Record<number, number> = {};
  for (let i = 1; i < heartrate.length && i < time.length; i++) {
    if (!heartrate[i]) continue;
    const bin = Math.round(heartrate[i] / 4) * 4;
    const dt = Math.max(0, (time[i] - time[i - 1]) / 60);
    bins[bin] = (bins[bin] ?? 0) + dt;
  }
  return Object.entries(bins)
    .map(([bpm, t]) => {
      const b = Number(bpm);
      const { zone, color } = getZone(b, maxHr);
      return { bpm: b, time: t, zone, color };
    })
    .sort((a, b) => a.bpm - b.bpm);
}

export function computeCumulativeTime(
  heartrate: number[],
  time: number[],
): CumulativePoint[] {
  if (heartrate.length < 2 || time.length < 2) return [];
  const maxHr = Math.max(...heartrate.filter(Boolean));
  const minHr = Math.min(...heartrate.filter((h) => h > 0));
  const step = Math.max(1, Math.round((maxHr - minHr) / 50));
  const result: CumulativePoint[] = [];
  for (let hr = maxHr; hr >= minHr; hr -= step) {
    let cumMin = 0;
    for (let i = 1; i < heartrate.length && i < time.length; i++) {
      if (heartrate[i] >= hr) {
        cumMin += Math.max(0, (time[i] - time[i - 1]) / 60);
      }
    }
    result.push({ bpm: Math.round(hr), time: Math.round(cumMin * 10) / 10 });
  }
  return result;
}

export function computeMeanMaximalHR(
  heartrate: number[],
  time: number[],
): MeanMaxPoint[] {
  if (heartrate.length < 10 || time.length < 10) return [];
  const totalSec = time[time.length - 1] - time[0];
  const windows = [7, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600, 7200, 10800, 18000, 36000];
  const result: MeanMaxPoint[] = [];
  for (const w of windows) {
    if (w > totalSec * 0.95) break;
    let maxAvg = 0;
    let left = 0;
    for (let right = 0; right < heartrate.length && right < time.length; right++) {
      while (left < right && time[right] - time[left] > w) left++;
      if (time[right] - time[left] >= w * 0.8) {
        let sum = 0;
        let cnt = 0;
        for (let k = left; k <= right; k++) {
          if (heartrate[k]) {
            sum += heartrate[k];
            cnt++;
          }
        }
        if (cnt > 0) {
          const avg = sum / cnt;
          if (avg > maxAvg) maxAvg = avg;
        }
      }
    }
    if (maxAvg > 0) {
      const label =
        w < 60
          ? `${w}s`
          : w < 3600
            ? `${Math.round(w / 60)}m`
            : `${Math.round(w / 3600)}h`;
      result.push({ label, hr: Math.round(maxAvg) });
    }
  }
  return result;
}
