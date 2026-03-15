/**
 * Centralized AI model and token limits for cost optimization.
 * Haiku → fast, cheap, simple outputs. Sonnet → coaching quality.
 */

export const AI_MODELS = {
  HAIKU: "claude-haiku-4-5-20251001",
  SONNET: "claude-sonnet-4-6",
} as const;

export const AI_LIMITS = {
  openingMessage: { model: AI_MODELS.HAIKU, max_tokens: 150 },
  memoryExtraction: { model: AI_MODELS.HAIKU, max_tokens: 300 },
  workoutSteps: { model: AI_MODELS.HAIKU, max_tokens: 300 },
  labExtract: { model: AI_MODELS.HAIKU, max_tokens: 300 },

  coachingChat: { model: AI_MODELS.SONNET, max_tokens: 300 },
  postWorkoutAnalysis: { model: AI_MODELS.SONNET, max_tokens: 250 },
  planGeneration: { model: AI_MODELS.SONNET, max_tokens: 8000 },
  philosophyMatch: { model: AI_MODELS.SONNET, max_tokens: 500 },
} as const;
