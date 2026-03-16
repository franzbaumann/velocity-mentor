export function rollingAvg(arr: number[], window: number): number[] {
  if (!Array.isArray(arr) || arr.length === 0 || window <= 1) return arr;
  const half = Math.floor(window / 2);
  return arr.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      const v = arr[j];
      if (!Number.isFinite(v)) continue;
      sum += v;
      count++;
    }
    return count > 0 ? sum / count : arr[i];
  });
}

export function smoothPace(raw: number[], windowSize = 5): number[] {
  if (!Array.isArray(raw) || raw.length === 0) return raw;
  const cleaned = raw.map((v) => {
    if (!Number.isFinite(v) || v <= 0) return NaN;
    // Filter implausible GPS spikes (> 20 min/km)
    if (v > 20) return NaN;
    return v;
  });

  const half = Math.floor(windowSize / 2);
  const out: number[] = new Array(cleaned.length);

  for (let i = 0; i < cleaned.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(cleaned.length - 1, i + half); j++) {
      const v = cleaned[j];
      if (!Number.isFinite(v)) continue;
      sum += v;
      count++;
    }
    if (count === 0) {
      out[i] = raw[i];
    } else {
      out[i] = sum / count;
    }
  }

  return out;
}

export function downsample<T>(array: T[], targetPoints = 300): T[] {
  if (!Array.isArray(array) || array.length <= targetPoints || targetPoints <= 0) {
    return array;
  }
  const step = Math.floor(array.length / targetPoints) || 1;
  const result: T[] = [];
  for (let i = 0; i < array.length; i += step) {
    result.push(array[i]);
  }
  if (result[result.length - 1] !== array[array.length - 1]) {
    result.push(array[array.length - 1]);
  }
  return result;
}

