export const BETA_LIMITS = {
  // Counted against daily limit
  // BETA OVERRIDE: raised from 10 → 50 to allow heavy exploration during beta testing. Revert to 10 (or remove cap) at launch.
  coachingMessagesPerDay: 50,

  // Counted separately
  planGenerationsPerMonth: 2,

  // These are FREE — never counted
  // opening message (cached), suggestion pills (cached),
  // memory extraction, post-workout analysis (Haiku)
} as const;

export const LIMIT_MESSAGES = {
  dailyExhausted:
    "You've used your 50 daily messages with Cade. Your limit resets tomorrow. During beta, usage is capped — this changes at launch.",
  monthlyPlanExhausted:
    "You've generated 2 training plans this month, which is the beta limit. Your limit resets next month.",
} as const;
