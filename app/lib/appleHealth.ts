import {
  WorkoutTypeIdentifier,
  type ObjectTypeIdentifier,
} from "@kingstinct/react-native-healthkit";

/**
 * Types we request for coaching: load, recovery, and Apple-recorded runs/walks.
 * Add identifiers here as features need them; keep App Store privacy labels in sync.
 */
export const APPLE_HEALTH_READ_TYPES: readonly ObjectTypeIdentifier[] = [
  WorkoutTypeIdentifier,
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierRunningSpeed",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierVO2Max",
  "HKCategoryTypeIdentifierSleepAnalysis",
];

export const appleHealthReadAuth = {
  toRead: APPLE_HEALTH_READ_TYPES,
} as const;
