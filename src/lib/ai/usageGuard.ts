import { supabase } from "@/integrations/supabase/client";
import { BETA_LIMITS, LIMIT_MESSAGES } from "./limits";

export interface UsageStatus {
  allowed: boolean;
  used: number;
  limit: number;
  message?: string;
}

export async function checkDailyLimit(userId: string): Promise<UsageStatus> {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("ai_usage")
    .select("messages_used")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();

  const used = (data as { messages_used?: number } | null)?.messages_used ?? 0;
  const limit = BETA_LIMITS.coachingMessagesPerDay;
  const allowed = used < limit;

  return {
    allowed,
    used,
    limit,
    message: allowed ? undefined : LIMIT_MESSAGES.dailyExhausted,
  };
}

export async function checkMonthlyPlanLimit(userId: string): Promise<UsageStatus> {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const from = firstOfMonth.toISOString().split("T")[0];

  const { count } = await supabase
    .from("training_plan")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", firstOfMonth.toISOString());

  const used = count ?? 0;
  const limit = BETA_LIMITS.planGenerationsPerMonth;
  const allowed = used < limit;

  return {
    allowed,
    used,
    limit,
    message: allowed ? undefined : LIMIT_MESSAGES.monthlyPlanExhausted,
  };
}
