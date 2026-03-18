import type { ColorPalette } from "../theme/theme";

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp01(s);
  const ll = clamp01(l);

  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;

  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function parseCssColorToRgb(input: string): { r: number; g: number; b: number } | null {
  const c = input.trim();

  // #rgb / #rrggbb
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      return { r, g, b };
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  }

  // rgb()/rgba()
  const rgb = c.match(/^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})/i);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }

  // hsl()/hsla() with degrees + percentages
  const hsl = c.match(/^hsla?\(\s*([0-9.]+)\s*(deg)?\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%/i);
  if (hsl) {
    const h = Number(hsl[1]);
    const s = Number(hsl[3]) / 100;
    const l = Number(hsl[4]) / 100;
    return hslToRgb(h, s, l);
  }

  return null;
}

function withAlpha(color: string, alpha: number): string {
  const rgb = parseCssColorToRgb(color);
  if (!rgb) return color; // fallback; better than crashing
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${clamp01(alpha)})`;
}

export function getWorkoutTypeBaseColor(type: string | null | undefined, colors: ColorPalette): string {
  const t = String(type ?? "").toLowerCase();
  if (t.includes("interval") || t.includes("repeat") || t.includes("fartlek")) return "#ef4444";
  if (t.includes("tempo") || t.includes("threshold")) return "#3b82f6";
  if (t.includes("easy") || t.includes("recovery")) return "#22c55e";
  if (t.includes("long")) return "#f97316";
  if (t.includes("rest") || t.includes("off")) return colors.mutedForeground;
  if (t.includes("race") || t.includes("tt")) return "#a855f7";
  return colors.primary;
}

export function getWorkoutTypeTintGradientColors(type: string | null | undefined, colors: ColorPalette): readonly [string, string, string] {
  const base = getWorkoutTypeBaseColor(type, colors);
  // Matches Plan list SessionCard gradient opacity: 0x2e (~18%), 0x10 (~6%), 0x00 (0%).
  return [withAlpha(base, 0.18), withAlpha(base, 0.06), withAlpha(base, 0)] as const;
}

