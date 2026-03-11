export interface RecentActivity {
  date: string;
  name: string;
  distance_km: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  tss: number | null;
}

export interface PersonalRecord {
  distance: string;
  time: string;
  date_achieved?: string;
}

export interface PlanSummary {
  name: string;
  philosophy: string;
  current_week: number | null;
  total_weeks: number | null;
  peak_km: number | null;
}

export interface AthleteContext {
  name: string;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  hrv_today: number | null;
  hrv_7d_avg: number | null;
  hrv_trend: "rising" | "falling" | "stable" | "unknown";
  resting_hr: number | null;
  philosophy: string | null;
  goal: string | null;
  goal_time: string | null;
  race_date: string | null;
  weeks_to_race: number | null;
  injuries: string | null;
  recent_activities: RecentActivity[];
  this_week_km: number;
  planned_week_km: number;
  four_week_avg_km: number;
  prs: PersonalRecord[];
  plan: PlanSummary | null;
  plan_workouts_text: string;
  onboarding_answers: Record<string, unknown> | null;
  readiness_history_text: string;
}
