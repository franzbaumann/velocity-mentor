/** Badge styles for planned session `type` / session_type (easy, long, tempo, …). */
export function sessionTypeBadgeClass(sessionType: string | null | undefined): string {
  const t = (sessionType ?? "easy").toLowerCase();
  if (t === "rest" || t === "off") {
    return "bg-muted text-muted-foreground";
  }
  if (t === "long") {
    return "bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200";
  }
  if (
    ["tempo", "threshold", "interval", "intervals", "vo2", "quality", "hard", "strides", "cruise", "speed", "hill"].some(
      (k) => t.includes(k)
    )
  ) {
    return "bg-orange-500/15 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200";
  }
  if (t.includes("recovery")) {
    return "bg-emerald-500/12 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200";
  }
  if (t === "strength" || t.includes("strength")) {
    return "bg-violet-500/15 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200";
  }
  if (t === "mobility" || t.includes("mobility")) {
    return "bg-teal-500/15 text-teal-900 dark:bg-teal-500/20 dark:text-teal-200";
  }
  return "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200";
}

/** First sentence or line for subtitle (muted). */
export function sessionDescriptionSubtitle(description: string | null | undefined, maxLen = 200): string {
  if (!description?.trim()) return "";
  const oneLine = description.trim().split(/\n/)[0] ?? "";
  const m = oneLine.match(/^.{1,400}?[.!?](?=\s|$)/);
  const first = m ? m[0] : oneLine;
  const t = first.trim();
  return t.length > maxLen ? `${t.slice(0, maxLen).trim()}…` : t;
}
