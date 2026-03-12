/** Strip JSON plan blocks from assistant content so user sees only explanation text. */
export function stripPlanJson(content: string): string {
  return content
    .replace(/```json\s*([\s\S]*?)```/gi, "")
    .replace(/```\s*\{[\s\S]*?"action"\s*:\s*"(?:create_plan|adjust_plan)"[\s\S]*?\}\s*```?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract plan JSON (create_plan or adjust_plan) from assistant content. */
export function extractPlanJson(
  content: string,
): { action: "create_plan" | "adjust_plan"; plan: Record<string, unknown> } | null {
  const jsonMatch =
    content.match(/```json\s*([\s\S]*?)```/) ??
    content.match(/\{[\s\S]*?"action"\s*:\s*"(?:create_plan|adjust_plan)"[\s\S]*?\}/);

  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
    if (
      (parsed?.action === "create_plan" || parsed?.action === "adjust_plan") &&
      parsed?.plan
    ) {
      return { action: parsed.action, plan: parsed.plan };
    }
  } catch {
    // ignore malformed JSON; caller will just treat as no plan
  }

  return null;
}

