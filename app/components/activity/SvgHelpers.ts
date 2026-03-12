type XY = { x: number; y: number };

export function buildSmoothPath(points: XY[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }
  const tension = 0.4;
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function buildAreaPath(points: XY[], viewH: number): string {
  const line = buildSmoothPath(points);
  if (!line || points.length < 2) return "";
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x},${viewH} L ${first.x},${viewH} Z`;
}

/**
 * Map values into viewBox coordinates with vertical padding
 * so lines are never clipped at the very top/bottom edge.
 */
export function normalizeToViewBox(
  values: number[],
  viewW: number,
  viewH: number,
  opts?: { reversed?: boolean; domainMin?: number; domainMax?: number },
): XY[] {
  if (values.length === 0) return [];
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return [];

  const rawMin = opts?.domainMin ?? Math.min(...valid);
  const rawMax = opts?.domainMax ?? Math.max(...valid);
  const range = rawMax - rawMin || 1;

  const pad = viewH * 0.06;
  const usableH = viewH - pad * 2;
  const step = viewW / (values.length - 1 || 1);

  return values.map((v, i) => {
    const clamped = Number.isFinite(v) ? v : rawMin;
    let y = pad + usableH - ((clamped - rawMin) / range) * usableH;
    if (opts?.reversed) y = pad + usableH - (y - pad);
    return { x: i * step, y: Math.max(0, Math.min(viewH, y)) };
  });
}
