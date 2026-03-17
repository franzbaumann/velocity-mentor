export type SeasonType = "indoor_track" | "outdoor_track" | "road" | "cross_country" | "mixed";
export type RacePriority = "A" | "B" | "C";
export type RaceStatus = "upcoming" | "completed" | "cancelled" | "DNS" | "DNF";
export type SeasonStatus = "planning" | "active" | "completed";
export type SeasonPhase = "base" | "build" | "peak" | "taper" | "race_week" | "recovery";

export interface CompetitionSeason {
  id: string;
  user_id: string;
  name: string;
  season_type: SeasonType;
  start_date: string;
  end_date: string;
  primary_distance: string | null;
  status: SeasonStatus;
  notes: string | null;
  created_at: string;
  end_goal_race_id: string | null;
  training_plan_id: string | null;
}

export interface SeasonRace {
  id: string;
  season_id: string;
  user_id: string;
  name: string;
  date: string;
  distance: string;
  venue: string | null;
  surface: string | null;
  priority: RacePriority;
  goal_time: string | null;
  actual_time: string | null;
  actual_place: number | null;
  notes: string | null;
  status: RaceStatus;
  activity_id: string | null;
  created_at: string;
}

export interface SeasonPerformance {
  id: string;
  season_id: string;
  user_id: string;
  date: string;
  ctl_at_date: number | null;
  atl_at_date: number | null;
  tsb_at_date: number | null;
  hrv_at_date: number | null;
  note: string | null;
  created_at: string;
}

export interface TaperWeek {
  weekLabel: string;
  instruction: string;
}

export interface SeasonWithRaces extends CompetitionSeason {
  races: SeasonRace[];
}

export interface SeasonContext {
  active_season: {
    name: string;
    type: SeasonType;
    weeks_remaining: number;
    primary_distance: string;
  } | null;
  next_race: {
    name: string;
    date: string;
    distance: string;
    priority: RacePriority;
    days_away: number;
    taper_starts: string | null;
    goal_time: string | null;
  } | null;
  next_a_race: {
    name: string;
    date: string;
    days_away: number;
  } | null;
  upcoming_races_30_days: SeasonRace[];
  season_phase: SeasonPhase;
}
