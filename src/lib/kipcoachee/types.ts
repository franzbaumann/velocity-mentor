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

export interface CoachingMemory {
  id: string;
  category: "preference" | "goal" | "injury" | "lifestyle" | "race" | "personality" | "other";
  content: string;
  importance: number;
  created_at: string;
  expires_at: string | null;
}

export interface SeasonContextForPrompt {
  active_season: {
    name: string;
    type: string;
    weeks_remaining: number;
    primary_distance: string | null;
    phase: string;
  } | null;
  next_race: {
    name: string;
    date: string;
    distance: string;
    priority: string;
    days_away: number;
    taper_starts: string | null;
    goal_time: string | null;
  } | null;
  next_a_race: {
    name: string;
    date: string;
    days_away: number;
  } | null;
  upcoming_races_30d: Array<{
    name: string;
    date: string;
    priority: string;
    distance: string;
  }>;
}

export interface TLSContextForPrompt {
  today: number;
  status: string;
  breakdown: Record<string, number>;
  last7Days: number[];
  average7d: number;
  hasCheckedInToday: boolean;
}

/** Next incomplete planned run in the active plan (for contextual coaching). */
export interface NextPlannedSessionForPrompt {
  date: string;
  title: string;
  main_description: string | null;
  purpose: string | null;
  control_tool: string | null;
  key_focus: string | null;
}

export interface AthleteContext {
  name: string;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  ramp_rate: number | null;
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
  last_28_days_run_km: number;
  profile_stated_weekly_km: number | null;
  prs: PersonalRecord[];
  plan: PlanSummary | null;
  plan_workouts_text: string;
  /** Rich session structure for the next incomplete workout, when available. */
  next_planned_session: NextPlannedSessionForPrompt | null;
  onboarding_answers: Record<string, unknown> | null;
  readiness_history_text: string;
  memories: CoachingMemory[];
  season?: SeasonContextForPrompt;
  tls?: TLSContextForPrompt;
}
