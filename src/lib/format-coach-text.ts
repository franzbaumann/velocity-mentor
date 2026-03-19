/**
 * Rounds long decimal numbers in AI coach copy for readable UI.
 * Matches numbers with 2+ digits after the decimal point.
 */
export function formatCoachText(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text.replace(/(-?\d+)\.(\d{2,})/g, (_full, intPart: string, frac: string) => {
    const n = parseFloat(`${intPart}.${frac}`);
    if (Number.isNaN(n)) return _full;
    if (Math.abs(n) >= 100) return String(Math.round(n));
    return String(Math.round(n * 10) / 10);
  });
}
