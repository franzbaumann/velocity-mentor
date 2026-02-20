export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
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
          garmin_id: string | null
          hr_zones: Json | null
          id: string
          max_hr: number | null
          polyline: string | null
          source: Database["public"]["Enums"]["activity_source"] | null
          splits: Json | null
          strava_id: string | null
          type: string | null
          user_id: string
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
          garmin_id?: string | null
          hr_zones?: Json | null
          id?: string
          max_hr?: number | null
          polyline?: string | null
          source?: Database["public"]["Enums"]["activity_source"] | null
          splits?: Json | null
          strava_id?: string | null
          type?: string | null
          user_id: string
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
          garmin_id?: string | null
          hr_zones?: Json | null
          id?: string
          max_hr?: number | null
          polyline?: string | null
          source?: Database["public"]["Enums"]["activity_source"] | null
          splits?: Json | null
          strava_id?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      athlete_profile: {
        Row: {
          created_at: string
          goal_race: Json | null
          id: string
          max_hr: number | null
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
        }
        Insert: {
          created_at?: string
          goal_race?: Json | null
          id?: string
          max_hr?: number | null
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
        }
        Update: {
          created_at?: string
          goal_race?: Json | null
          id?: string
          max_hr?: number | null
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
        }
        Relationships: []
      }
      coach_message: {
        Row: {
          content: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["coach_role"]
          timestamp: string
          triggered_by: Database["public"]["Enums"]["coach_trigger"] | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["coach_role"]
          timestamp?: string
          triggered_by?: Database["public"]["Enums"]["coach_trigger"] | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["coach_role"]
          timestamp?: string
          triggered_by?: Database["public"]["Enums"]["coach_trigger"] | null
          user_id?: string
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
      activity_source: "garmin" | "strava" | "manual"
      coach_role: "user" | "coach"
      coach_trigger: "user" | "proactive" | "activity_sync" | "readiness"
      oauth_provider: "garmin" | "strava"
      training_philosophy: "jack_daniels" | "pfitzinger" | "hansons" | "ai"
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
      activity_source: ["garmin", "strava", "manual"],
      coach_role: ["user", "coach"],
      coach_trigger: ["user", "proactive", "activity_sync", "readiness"],
      oauth_provider: ["garmin", "strava"],
      training_philosophy: ["jack_daniels", "pfitzinger", "hansons", "ai"],
    },
  },
} as const
