export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          ai_analysis: string | null
          avg_hr: number | null
          avg_pace: string | null
          cadence: number | null
          created_at: string
          date: string
          distance_km: number | null
          duration_seconds: number | null
          elevation_gain: number | null
          external_id: string | null
          garmin_id: string | null
          hr_zones: Json | null
          hr_zone_times: Json | null
          id: string
          icu_training_load: number | null
          lap_splits: Json | null
          max_hr: number | null
          pace_zone_times: Json | null
          perceived_exertion: number | null
          polyline: string | null
          source: Database["public"]["Enums"]["activity_source"] | null
          splits: Json | null
          strava_id: string | null
          trimp: number | null
          type: string | null
          user_id: string
          name?: string | null
          user_notes?: string | null
          tss?: number | null
          intensity_factor?: number | null
          icu_vo2max_estimate?: number | null
          icu_lactate_threshold_hr?: number | null
          icu_lactate_threshold_pace?: string | null
          photo_url?: string | null
          caption?: string | null
          photos?: Json | null
        }
        Insert: {
          ai_analysis?: string | null
          avg_hr?: number | null
          avg_pace?: string | null
          cadence?: number | null
          created_at?: string
          date?: string
          distance_km?: number | null
          duration_seconds?: number | null
          elevation_gain?: number | null
          external_id?: string | null
          garmin_id?: string | null
          hr_zones?: Json | null
          hr_zone_times?: Json | null
          id?: string
          icu_training_load?: number | null
          lap_splits?: Json | null
          max_hr?: number | null
          pace_zone_times?: Json | null
          perceived_exertion?: number | null
          polyline?: string | null
          source?: Database["public"]["Enums"]["activity_source"] | null
          splits?: Json | null
          strava_id?: string | null
          trimp?: number | null
          type?: string | null
          user_id: string
          name?: string | null
          user_notes?: string | null
          tss?: number | null
          intensity_factor?: number | null
          icu_vo2max_estimate?: number | null
          icu_lactate_threshold_hr?: number | null
          icu_lactate_threshold_pace?: string | null
          photo_url?: string | null
          caption?: string | null
          photos?: Json | null
        }
        Update: {
          ai_analysis?: string | null
          avg_hr?: number | null
          avg_pace?: string | null
          cadence?: number | null
          created_at?: string
          date?: string
          distance_km?: number | null
          duration_seconds?: number | null
          elevation_gain?: number | null
          external_id?: string | null
          garmin_id?: string | null
          hr_zones?: Json | null
          hr_zone_times?: Json | null
          id?: string
          icu_training_load?: number | null
          lap_splits?: Json | null
          max_hr?: number | null
          pace_zone_times?: Json | null
          perceived_exertion?: number | null
          polyline?: string | null
          source?: Database["public"]["Enums"]["activity_source"] | null
          splits?: Json | null
          strava_id?: string | null
          trimp?: number | null
          type?: string | null
          user_id?: string
          name?: string | null
          user_notes?: string | null
          tss?: number | null
          intensity_factor?: number | null
          icu_vo2max_estimate?: number | null
          icu_lactate_threshold_hr?: number | null
          icu_lactate_threshold_pace?: string | null
          photo_url?: string | null
          caption?: string | null
          photos?: Json | null
        }
        Relationships: []
      }
      activity_streams: {
        Row: {
          id: string
          user_id: string
          activity_id: string
          heartrate: number[] | null
          cadence: number[] | null
          altitude: number[] | null
          pace: number[] | null
          distance: number[] | null
          time: number[] | null
          latlng: number[][] | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          activity_id: string
          heartrate?: number[] | null
          cadence?: number[] | null
          altitude?: number[] | null
          pace?: number[] | null
          distance?: number[] | null
          time?: number[] | null
          latlng?: number[][] | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          activity_id?: string
          heartrate?: number[] | null
          cadence?: number[] | null
          altitude?: number[] | null
          pace?: number[] | null
          distance?: number[] | null
          time?: number[] | null
          latlng?: number[][] | null
          created_at?: string
        }
        Relationships: []
      }
      athlete_profile: {
        Row: {
          created_at: string
          goal_race: Json | null
          id: string
          lab_name: string | null
          lab_test_date: string | null
          lactate_threshold_hr: number | null
          lactate_threshold_pace: string | null
          max_hr: number | null
          max_hr_measured: number | null
          name: string
          narrative: string | null
          preferred_longrun_day: string | null
          race_history: Json | null
          resting_hr: number | null
          training_philosophy:
            | Database["public"]["Enums"]["training_philosophy"]
            | null
          updated_at: string
          user_id: string
          vdot: number | null
          vlamax: number | null
          vo2max: number | null
          onboarding_complete: boolean | null
          onboarding_answers: Json | null
          recommended_philosophy: string | null
          goal_race_name: string | null
          goal_race_date: string | null
          goal_time: string | null
          goal_distance: string | null
          days_per_week: number | null
          injury_history_text: string | null
          lt1_hr?: number | null
          lt1_pace?: string | null
          zone_source?: string | null
        }
        Insert: {
          created_at?: string
          goal_race?: Json | null
          id?: string
          lab_name?: string | null
          lab_test_date?: string | null
          lactate_threshold_hr?: number | null
          lactate_threshold_pace?: string | null
          max_hr?: number | null
          max_hr_measured?: number | null
          name?: string
          narrative?: string | null
          preferred_longrun_day?: string | null
          race_history?: Json | null
          resting_hr?: number | null
          training_philosophy?:
            | Database["public"]["Enums"]["training_philosophy"]
            | null
          updated_at?: string
          user_id: string
          vdot?: number | null
          vlamax?: number | null
          vo2max?: number | null
          onboarding_complete?: boolean | null
          onboarding_answers?: Json | null
          recommended_philosophy?: string | null
          goal_race_name?: string | null
          goal_race_date?: string | null
          goal_time?: string | null
          goal_distance?: string | null
          days_per_week?: number | null
          injury_history_text?: string | null
          lt1_hr?: number | null
          lt1_pace?: string | null
          zone_source?: string | null
        }
        Update: {
          created_at?: string
          goal_race?: Json | null
          id?: string
          lab_name?: string | null
          lab_test_date?: string | null
          lactate_threshold_hr?: number | null
          lactate_threshold_pace?: string | null
          max_hr?: number | null
          max_hr_measured?: number | null
          name?: string
          narrative?: string | null
          preferred_longrun_day?: string | null
          race_history?: Json | null
          resting_hr?: number | null
          training_philosophy?:
            | Database["public"]["Enums"]["training_philosophy"]
            | null
          updated_at?: string
          user_id?: string
          vdot?: number | null
          vlamax?: number | null
          vo2max?: number | null
          onboarding_complete?: boolean | null
          onboarding_answers?: Json | null
          recommended_philosophy?: string | null
          goal_race_name?: string | null
          goal_race_date?: string | null
          goal_time?: string | null
          goal_distance?: string | null
          days_per_week?: number | null
          injury_history_text?: string | null
          lt1_hr?: number | null
          lt1_pace?: string | null
          zone_source?: string | null
        }
        Relationships: []
      }
      coach_message: {
        Row: {
          content: string
          created_at: string
          id: string
          message_type: string | null
          role: Database["public"]["Enums"]["coach_role"]
          timestamp: string
          triggered_by: Database["public"]["Enums"]["coach_trigger"] | null
          user_id: string
          ui_component: string | null
          ui_data: Json | null
          activity_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message_type?: string | null
          role?: Database["public"]["Enums"]["coach_role"]
          timestamp?: string
          triggered_by?: Database["public"]["Enums"]["coach_trigger"] | null
          user_id: string
          ui_component?: string | null
          ui_data?: Json | null
          activity_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message_type?: string | null
          role?: Database["public"]["Enums"]["coach_role"]
          timestamp?: string
          triggered_by?: Database["public"]["Enums"]["coach_trigger"] | null
          user_id?: string
          ui_component?: string | null
          ui_data?: Json | null
          activity_id?: string | null
        }
        Relationships: []
      }
      daily_readiness: {
        Row: {
          ai_summary: string | null
          atl: number | null
          created_at: string
          ctl: number | null
          date: string
          hrv: number | null
          hrv_baseline: number | null
          id: string
          resting_hr: number | null
          score: number | null
          sleep_hours: number | null
          sleep_quality: number | null
          tsb: number | null
          user_id: string
          sleep_score?: number | null
          icu_ctl?: number | null
          icu_atl?: number | null
          icu_tsb?: number | null
          vo2max?: number | null
          ramp_rate?: number | null
          icu_ramp_rate?: number | null
          steps?: number | null
          weight?: number | null
          readiness?: number | null
          stress_score?: number | null
          mood?: number | null
          energy?: number | null
          muscle_soreness?: number | null
        }
        Insert: {
          ai_summary?: string | null
          atl?: number | null
          created_at?: string
          ctl?: number | null
          date?: string
          hrv?: number | null
          hrv_baseline?: number | null
          id?: string
          resting_hr?: number | null
          score?: number | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          tsb?: number | null
          user_id: string
          sleep_score?: number | null
          icu_ctl?: number | null
          icu_atl?: number | null
          icu_tsb?: number | null
          vo2max?: number | null
          ramp_rate?: number | null
          icu_ramp_rate?: number | null
          steps?: number | null
          weight?: number | null
          readiness?: number | null
          stress_score?: number | null
          mood?: number | null
          energy?: number | null
          muscle_soreness?: number | null
        }
        Update: {
          ai_summary?: string | null
          atl?: number | null
          created_at?: string
          ctl?: number | null
          date?: string
          hrv?: number | null
          hrv_baseline?: number | null
          id?: string
          resting_hr?: number | null
          score?: number | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          tsb?: number | null
          user_id?: string
          sleep_score?: number | null
          icu_ctl?: number | null
          icu_atl?: number | null
          icu_tsb?: number | null
          vo2max?: number | null
          ramp_rate?: number | null
          icu_ramp_rate?: number | null
          steps?: number | null
          weight?: number | null
          readiness?: number | null
          stress_score?: number | null
          mood?: number | null
          energy?: number | null
          muscle_soreness?: number | null
        }
        Relationships: []
      }
      integrations: {
        Row: {
          api_key: string
          athlete_id: string
          created_at: string
          id: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string
          athlete_id?: string
          created_at?: string
          id?: string
          provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          athlete_id?: string
          created_at?: string
          id?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      training_plan: {
        Row: {
          id: string
          user_id: string
          race_date: string | null
          race_type: string | null
          target_time: string | null
          weeks_total: number | null
          plan_name: string | null
          philosophy: string | null
          goal_race: string | null
          goal_date: string | null
          goal_time: string | null
          is_active: boolean | null
          start_date: string | null
          end_date: string | null
          created_at: string
          updated_at: string
          peak_weekly_km: number | null
          total_weeks: number | null
        }
        Insert: {
          id?: string
          user_id: string
          race_date?: string | null
          race_type?: string | null
          target_time?: string | null
          weeks_total?: number | null
          plan_name?: string | null
          philosophy?: string | null
          goal_race?: string | null
          goal_date?: string | null
          goal_time?: string | null
          is_active?: boolean | null
          start_date?: string | null
          end_date?: string | null
          created_at?: string
          updated_at?: string
          peak_weekly_km?: number | null
          total_weeks?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          race_date?: string | null
          race_type?: string | null
          target_time?: string | null
          weeks_total?: number | null
          plan_name?: string | null
          philosophy?: string | null
          goal_race?: string | null
          goal_date?: string | null
          goal_time?: string | null
          is_active?: boolean | null
          start_date?: string | null
          end_date?: string | null
          created_at?: string
          updated_at?: string
          peak_weekly_km?: number | null
          total_weeks?: number | null
        }
        Relationships: []
      }
      training_week: {
        Row: {
          id: string
          plan_id: string
          week_number: number
          start_date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          week_number: number
          start_date: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          week_number?: number
          start_date?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      training_session: {
        Row: {
          id: string
          week_id: string
          day_of_week: number
          scheduled_date: string | null
          session_type: string
          description: string
          distance_km: number | null
          duration_min: number | null
          pace_target: string | null
          target_hr_zone: number | null
          tss_estimate: number | null
          completed_activity_id: string | null
          workout_type: string | null
          notes: string | null
          order_index: number
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          week_id: string
          day_of_week: number
          scheduled_date?: string | null
          session_type: string
          description: string
          distance_km?: number | null
          duration_min?: number | null
          pace_target?: string | null
          target_hr_zone?: number | null
          tss_estimate?: number | null
          completed_activity_id?: string | null
          workout_type?: string | null
          notes?: string | null
          order_index?: number
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          week_id?: string
          day_of_week?: number
          scheduled_date?: string | null
          session_type?: string
          description?: string
          distance_km?: number | null
          duration_min?: number | null
          pace_target?: string | null
          target_hr_zone?: number | null
          tss_estimate?: number | null
          completed_activity_id?: string | null
          workout_type?: string | null
          notes?: string | null
          order_index?: number
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_plan_workout: {
        Row: {
          id: string
          user_id: string
          plan_id: string
          date: string | null
          week_number: number | null
          phase: string | null
          day_of_week: number | null
          type: string | null
          name: string | null
          description: string | null
          key_focus: string | null
          distance_km: number | null
          duration_minutes: number | null
          target_pace: string | null
          target_hr_zone: number | null
          tss_estimate: number | null
          completed: boolean | null
          completed_activity_id: string | null
          actual_distance_km: number | null
          actual_avg_hr: number | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          plan_id: string
          date?: string | null
          week_number?: number | null
          phase?: string | null
          day_of_week?: number | null
          type?: string | null
          name?: string | null
          description?: string | null
          key_focus?: string | null
          distance_km?: number | null
          duration_minutes?: number | null
          target_pace?: string | null
          target_hr_zone?: number | null
          tss_estimate?: number | null
          completed?: boolean | null
          completed_activity_id?: string | null
          actual_distance_km?: number | null
          actual_avg_hr?: number | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          plan_id?: string
          date?: string | null
          week_number?: number | null
          phase?: string | null
          day_of_week?: number | null
          type?: string | null
          name?: string | null
          description?: string | null
          key_focus?: string | null
          distance_km?: number | null
          duration_minutes?: number | null
          target_pace?: string | null
          target_hr_zone?: number | null
          tss_estimate?: number | null
          completed?: boolean | null
          completed_activity_id?: string | null
          actual_distance_km?: number | null
          actual_avg_hr?: number | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      seasons: {
        Row: {
          id: string
          user_id: string
          name: string
          season_type: string
          start_date: string
          end_date: string
          primary_distance: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          season_type: string
          start_date: string
          end_date: string
          primary_distance?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          season_type?: string
          start_date?: string
          end_date?: string
          primary_distance?: string | null
          created_at?: string
        }
        Relationships: []
      }
      season_races: {
        Row: {
          id: string
          season_id: string
          user_id: string
          name: string
          race_date: string
          distance: string | null
          venue: string | null
          priority: "A" | "B" | "C"
          goal_time: string | null
          created_at: string
        }
        Insert: {
          id?: string
          season_id: string
          user_id: string
          name: string
          race_date: string
          distance?: string | null
          venue?: string | null
          priority: "A" | "B" | "C"
          goal_time?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          season_id?: string
          user_id?: string
          name?: string
          race_date?: string
          distance?: string | null
          venue?: string | null
          priority?: "A" | "B" | "C"
          goal_time?: string | null
          created_at?: string
        }
        Relationships: []
      }
      race_predictions: {
        Row: {
          id: string
          user_id: string
          predicted_at: string
          goal_distance: string | null
          predicted_time_seconds: number | null
          predicted_pace: string | null
          ctl_at_prediction: number | null
          zone2_pace: string | null
          threshold_pace: string | null
          vo2max_pace: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          predicted_at?: string
          goal_distance?: string | null
          predicted_time_seconds?: number | null
          predicted_pace?: string | null
          ctl_at_prediction?: number | null
          zone2_pace?: string | null
          threshold_pace?: string | null
          vo2max_pace?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          predicted_at?: string
          goal_distance?: string | null
          predicted_time_seconds?: number | null
          predicted_pace?: string | null
          ctl_at_prediction?: number | null
          zone2_pace?: string | null
          threshold_pace?: string | null
          vo2max_pace?: string | null
          created_at?: string
        }
        Relationships: []
      }
      personal_records: {
        Row: {
          id: string
          user_id: string
          activity_id: string | null
          distance: string | null
        }
        Insert: {
          id?: string
          user_id: string
          activity_id?: string | null
          distance?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          activity_id?: string | null
          distance?: string | null
        }
        Relationships: []
      }
      coaching_memory: {
        Row: {
          id: string
          user_id: string
          category: string | null
          content: string | null
          created_at: string | null
          importance: number | null
          expires_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          category?: string | null
          content?: string | null
          created_at?: string | null
          importance?: number | null
          expires_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          category?: string | null
          content?: string | null
          created_at?: string | null
          importance?: number | null
          expires_at?: string | null
        }
        Relationships: []
      }
      recovery_sessions: {
        Row: {
          id: string
          user_id: string | null
          program_id: string
          program_title: string
          completed_at: string | null
          duration_minutes: number | null
          exercises_completed: number | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          program_id: string
          program_title: string
          completed_at?: string | null
          duration_minutes?: number | null
          exercises_completed?: number | null
        }
        Update: {
          id?: string
          user_id?: string | null
          program_id?: string
          program_title?: string
          completed_at?: string | null
          duration_minutes?: number | null
          exercises_completed?: number | null
        }
        Relationships: []
      }
      sync_progress: {
        Row: {
          user_id: string
          stage: string | null
          detail: string | null
          done: boolean
          error: string | null
          updated_at: string
          activities_total: number | null
          activities_upserted: number | null
          streams_done: number | null
          streams_total: number | null
          intervals_count: number | null
          wellness_days: number | null
          pbs_count: number | null
          years_completed: Json | null
          ctl: number | null
          atl: number | null
          tsb: number | null
        }
        Insert: {
          user_id: string
          stage?: string | null
          detail?: string | null
          done?: boolean
          error?: string | null
          updated_at?: string
          activities_total?: number | null
          activities_upserted?: number | null
          streams_done?: number | null
          streams_total?: number | null
          intervals_count?: number | null
          wellness_days?: number | null
          pbs_count?: number | null
          years_completed?: Json | null
          ctl?: number | null
          atl?: number | null
          tsb?: number | null
        }
        Update: {
          user_id?: string
          stage?: string | null
          detail?: string | null
          done?: boolean
          error?: string | null
          updated_at?: string
          activities_total?: number | null
          activities_upserted?: number | null
          streams_done?: number | null
          streams_total?: number | null
          intervals_count?: number | null
          wellness_days?: number | null
          pbs_count?: number | null
          years_completed?: Json | null
          ctl?: number | null
          atl?: number | null
          tsb?: number | null
        }
        Relationships: []
      }
      oauth_tokens: {
        Row: {
          access_token: string
          athlete_id: string | null
          athlete_name: string | null
          created_at: string
          expires_at: string | null
          id: string
          last_sync_at: string | null
          provider: Database["public"]["Enums"]["oauth_provider"]
          refresh_token: string | null
          token_secret: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          athlete_id?: string | null
          athlete_name?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider: Database["public"]["Enums"]["oauth_provider"]
          refresh_token?: string | null
          token_secret?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          athlete_id?: string | null
          athlete_name?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider?: Database["public"]["Enums"]["oauth_provider"]
          refresh_token?: string | null
          token_secret?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      oauth_connections: {
        Row: {
          athlete_id: string | null
          athlete_name: string | null
          created_at: string | null
          expires_at: string | null
          id: string | null
          last_sync_at: string | null
          provider: Database["public"]["Enums"]["oauth_provider"] | null
          user_id: string | null
        }
        Insert: {
          athlete_id?: string | null
          athlete_name?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          last_sync_at?: string | null
          provider?: Database["public"]["Enums"]["oauth_provider"] | null
          user_id?: string | null
        }
        Update: {
          athlete_id?: string | null
          athlete_name?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          last_sync_at?: string | null
          provider?: Database["public"]["Enums"]["oauth_provider"] | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      activity_source: "garmin" | "strava" | "manual" | "intervals_icu"
      coach_role: "user" | "coach" | "assistant"
      coach_trigger: "user" | "proactive" | "activity_sync" | "readiness"
      oauth_provider: "garmin" | "strava"
      training_philosophy: "jack_daniels" | "pfitzinger" | "hansons" | "ai" | "80_20" | "lydiard"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_source: ["garmin", "strava", "manual", "intervals_icu"],
      coach_role: ["user", "coach", "assistant"],
      coach_trigger: ["user", "proactive", "activity_sync", "readiness"],
      oauth_provider: ["garmin", "strava"],
      training_philosophy: ["jack_daniels", "pfitzinger", "hansons", "ai", "80_20", "lydiard"],
    },
  },
} as const
