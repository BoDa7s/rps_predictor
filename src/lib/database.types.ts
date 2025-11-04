export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      ai_states: {
        Row: {
          id: string;
          user_id: string;
          stats_profile_id: string;
          model_version: number;
          rounds_seen: number;
          state: Json;
          needs_rebuild: boolean;
          last_round_id: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stats_profile_id: string;
          model_version: number;
          rounds_seen?: number;
          state: Json;
          needs_rebuild?: boolean;
          last_round_id?: string | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stats_profile_id?: string;
          model_version?: number;
          rounds_seen?: number;
          state?: Json;
          needs_rebuild?: boolean;
          last_round_id?: string | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_states_last_round_id_fkey";
            columns: ["last_round_id"];
            referencedRelation: "rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_states_stats_profile_id_fkey";
            columns: ["stats_profile_id"];
            referencedRelation: "stats_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_states_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      demographics_profiles: {
        Row: {
          user_id: string;
          username: string | null;
          first_name: string | null;
          last_initial: string | null;
          grade: string | null;
          school: string | null;
          created_at: string | null;
          age: string | null;
          prior_experience: string | null;
          training_completed: boolean;
          training_count: number;
          storage_mode: Database["public"]["Enums"]["storage_mode_type"];
          updated_at: string;
          preferences: Json;
          consent_version: string | null;
          consent_granted_at: string | null;
          last_promoted_at: string | null;
        };
        Insert: {
          user_id: string;
          username?: string | null;
          first_name?: string | null;
          last_initial?: string | null;
          grade?: string | null;
          school?: string | null;
          created_at?: string | null;
          age?: string | null;
          prior_experience?: string | null;
          training_completed?: boolean;
          training_count?: number;
          storage_mode?: Database["public"]["Enums"]["storage_mode_type"];
          updated_at?: string;
          preferences?: Json;
          consent_version?: string | null;
          consent_granted_at?: string | null;
          last_promoted_at?: string | null;
        };
        Update: {
          user_id?: string;
          username?: string | null;
          first_name?: string | null;
          last_initial?: string | null;
          grade?: string | null;
          school?: string | null;
          created_at?: string | null;
          age?: string | null;
          prior_experience?: string | null;
          training_completed?: boolean;
          training_count?: number;
          storage_mode?: Database["public"]["Enums"]["storage_mode_type"];
          updated_at?: string;
          preferences?: Json;
          consent_version?: string | null;
          consent_granted_at?: string | null;
          last_promoted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      dev_audit_logs: {
        Row: {
          id: string;
          user_id: string;
          recorded_at: string;
          action: string;
          actor: string | null;
          target: string | null;
          notes: string | null;
          payload: Json;
        };
        Insert: {
          id?: string;
          user_id: string;
          recorded_at?: string;
          action: string;
          actor?: string | null;
          target?: string | null;
          notes?: string | null;
          payload?: Json;
        };
        Update: {
          id?: string;
          user_id?: string;
          recorded_at?: string;
          action?: string;
          actor?: string | null;
          target?: string | null;
          notes?: string | null;
          payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "dev_audit_logs_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      dev_dataset_snapshots: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          data: Json;
          metadata: Json;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          data: Json;
          metadata?: Json;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          data?: Json;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "dev_dataset_snapshots_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      device_shadows: {
        Row: {
          device_id: string;
          user_id: string;
          last_local_sync_at: string | null;
          promoted_at: string | null;
          storage_mode: Database["public"]["Enums"]["storage_mode_type"];
          payload: Json;
          metadata: Json;
          created_at: string;
          updated_at: string;
          needs_merge: boolean;
        };
        Insert: {
          device_id?: string;
          user_id: string;
          last_local_sync_at?: string | null;
          promoted_at?: string | null;
          storage_mode?: Database["public"]["Enums"]["storage_mode_type"];
          payload?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          needs_merge?: boolean;
        };
        Update: {
          device_id?: string;
          user_id?: string;
          last_local_sync_at?: string | null;
          promoted_at?: string | null;
          storage_mode?: Database["public"]["Enums"]["storage_mode_type"];
          payload?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          needs_merge?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "device_shadows_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      export_events: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          stats_profile_id: string | null;
          event_type: Database["public"]["Enums"]["export_event_type"];
          occurred_at: string;
          metadata: Json;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id?: string | null;
          stats_profile_id?: string | null;
          event_type: Database["public"]["Enums"]["export_event_type"];
          occurred_at?: string;
          metadata?: Json;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string | null;
          stats_profile_id?: string | null;
          event_type?: Database["public"]["Enums"]["export_event_type"];
          occurred_at?: string;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "export_events_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "export_events_stats_profile_id_fkey";
            columns: ["stats_profile_id"];
            referencedRelation: "stats_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "export_events_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      instrumentation_snapshots: {
        Row: {
          id: string;
          user_id: string;
          stats_profile_id: string | null;
          session_id: string | null;
          scope: Json;
          scope_key: string;
          trigger: Database["public"]["Enums"]["instrumentation_trigger_type"];
          captured_at: string;
          snapshot: Json;
          notes: string | null;
          pinned: boolean;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stats_profile_id?: string | null;
          session_id?: string | null;
          scope: Json;
          scope_key?: string;
          trigger: Database["public"]["Enums"]["instrumentation_trigger_type"];
          captured_at?: string;
          snapshot: Json;
          notes?: string | null;
          pinned?: boolean;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stats_profile_id?: string | null;
          session_id?: string | null;
          scope?: Json;
          scope_key?: string;
          trigger?: Database["public"]["Enums"]["instrumentation_trigger_type"];
          captured_at?: string;
          snapshot?: Json;
          notes?: string | null;
          pinned?: boolean;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "instrumentation_snapshots_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instrumentation_snapshots_stats_profile_id_fkey";
            columns: ["stats_profile_id"];
            referencedRelation: "stats_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instrumentation_snapshots_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      lifecycle_events: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          stats_profile_id: string | null;
          event_type: Database["public"]["Enums"]["lifecycle_event_type"];
          occurred_at: string;
          metadata: Json;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id?: string | null;
          stats_profile_id?: string | null;
          event_type: Database["public"]["Enums"]["lifecycle_event_type"];
          occurred_at?: string;
          metadata?: Json;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string | null;
          stats_profile_id?: string | null;
          event_type?: Database["public"]["Enums"]["lifecycle_event_type"];
          occurred_at?: string;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "lifecycle_events_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lifecycle_events_stats_profile_id_fkey";
            columns: ["stats_profile_id"];
            referencedRelation: "stats_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lifecycle_events_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      matches: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          stats_profile_id: string;
          client_match_id: string | null;
          started_at: string;
          ended_at: string | null;
          mode: Database["public"]["Enums"]["game_mode_type"];
          difficulty: Database["public"]["Enums"]["ai_mode_type"];
          best_of: number;
          rounds_played: number;
          score_you: number;
          score_ai: number;
          ai_win_rate: number | null;
          you_switched_rate: number | null;
          leaderboard_score: number | null;
          leaderboard_max_streak: number | null;
          leaderboard_round_count: number | null;
          leaderboard_timer_bonus: number | null;
          leaderboard_beat_confidence_bonus: number | null;
          leaderboard_type: string | null;
          notes: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          stats_profile_id: string;
          client_match_id?: string | null;
          started_at: string;
          ended_at?: string | null;
          mode: Database["public"]["Enums"]["game_mode_type"];
          difficulty: Database["public"]["Enums"]["ai_mode_type"];
          best_of: number;
          rounds_played?: number;
          score_you?: number;
          score_ai?: number;
          ai_win_rate?: number | null;
          you_switched_rate?: number | null;
          leaderboard_score?: number | null;
          leaderboard_max_streak?: number | null;
          leaderboard_round_count?: number | null;
          leaderboard_timer_bonus?: number | null;
          leaderboard_beat_confidence_bonus?: number | null;
          leaderboard_type?: string | null;
          notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string;
          stats_profile_id?: string;
          client_match_id?: string | null;
          started_at?: string;
          ended_at?: string | null;
          mode?: Database["public"]["Enums"]["game_mode_type"];
          difficulty?: Database["public"]["Enums"]["ai_mode_type"];
          best_of?: number;
          rounds_played?: number;
          score_you?: number;
          score_ai?: number;
          ai_win_rate?: number | null;
          you_switched_rate?: number | null;
          leaderboard_score?: number | null;
          leaderboard_max_streak?: number | null;
          leaderboard_round_count?: number | null;
          leaderboard_timer_bonus?: number | null;
          leaderboard_beat_confidence_bonus?: number | null;
          leaderboard_type?: string | null;
          notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "matches_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_stats_profile_id_fkey";
            columns: ["stats_profile_id"];
            referencedRelation: "stats_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      promotion_runs: {
        Row: {
          id: string;
          user_id: string;
          device_id: string | null;
          started_at: string;
          completed_at: string | null;
          status: "pending" | "succeeded" | "failed";
          total_rounds: number | null;
          total_matches: number | null;
          total_profiles: number | null;
          notes: string | null;
          metadata: Json;
        };
        Insert: {
          id?: string;
          user_id: string;
          device_id?: string | null;
          started_at?: string;
          completed_at?: string | null;
          status?: "pending" | "succeeded" | "failed";
          total_rounds?: number | null;
          total_matches?: number | null;
          total_profiles?: number | null;
          notes?: string | null;
          metadata?: Json;
        };
        Update: {
          id?: string;
          user_id?: string;
          device_id?: string | null;
          started_at?: string;
          completed_at?: string | null;
          status?: "pending" | "succeeded" | "failed";
          total_rounds?: number | null;
          total_matches?: number | null;
          total_profiles?: number | null;
          notes?: string | null;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "promotion_runs_device_id_fkey";
            columns: ["device_id"];
            referencedRelation: "device_shadows";
            referencedColumns: ["device_id"];
          },
          {
            foreignKeyName: "promotion_runs_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      rounds: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          stats_profile_id: string;
          match_id: string | null;
          client_round_id: string | null;
          round_number: number;
          played_at: string;
          mode: Database["public"]["Enums"]["game_mode_type"];
          difficulty: Database["public"]["Enums"]["ai_mode_type"];
          best_of: number;
          player_move: Database["public"]["Enums"]["move_type"];
          ai_move: Database["public"]["Enums"]["move_type"];
          predicted_player_move: Database["public"]["Enums"]["move_type"] | null;
          outcome: Database["public"]["Enums"]["round_outcome_type"];
          decision_policy: Database["public"]["Enums"]["decision_policy_type"];
          reason: string | null;
          ai_confidence: number | null;
          confidence_bucket: Database["public"]["Enums"]["confidence_bucket_type"] | null;
          decision_time_ms: number | null;
          response_time_ms: number | null;
          response_speed_ms: number | null;
          inter_round_delay_ms: number | null;
          ready_at: string | null;
          first_interaction_at: string | null;
          move_selected_at: string | null;
          completed_at: string | null;
          interactions: number | null;
          clicks: number | null;
          streak_ai: number | null;
          streak_you: number | null;
          ai_state: Json | null;
          mixer_trace: Json | null;
          heuristic_trace: Json | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          stats_profile_id: string;
          match_id?: string | null;
          client_round_id?: string | null;
          round_number: number;
          played_at?: string;
          mode: Database["public"]["Enums"]["game_mode_type"];
          difficulty: Database["public"]["Enums"]["ai_mode_type"];
          best_of: number;
          player_move: Database["public"]["Enums"]["move_type"];
          ai_move: Database["public"]["Enums"]["move_type"];
          predicted_player_move?: Database["public"]["Enums"]["move_type"] | null;
          outcome: Database["public"]["Enums"]["round_outcome_type"];
          decision_policy: Database["public"]["Enums"]["decision_policy_type"];
          reason?: string | null;
          ai_confidence?: number | null;
          confidence_bucket?: Database["public"]["Enums"]["confidence_bucket_type"] | null;
          decision_time_ms?: number | null;
          response_time_ms?: number | null;
          response_speed_ms?: number | null;
          inter_round_delay_ms?: number | null;
          ready_at?: string | null;
          first_interaction_at?: string | null;
          move_selected_at?: string | null;
          completed_at?: string | null;
          interactions?: number | null;
          clicks?: number | null;
          streak_ai?: number | null;
          streak_you?: number | null;
          ai_state?: Json | null;
          mixer_trace?: Json | null;
          heuristic_trace?: Json | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string;
          stats_profile_id?: string;
          match_id?: string | null;
          client_round_id?: string | null;
          round_number?: number;
          played_at?: string;
          mode?: Database["public"]["Enums"]["game_mode_type"];
          difficulty?: Database["public"]["Enums"]["ai_mode_type"];
          best_of?: number;
          player_move?: Database["public"]["Enums"]["move_type"];
          ai_move?: Database["public"]["Enums"]["move_type"];
          predicted_player_move?: Database["public"]["Enums"]["move_type"] | null;
          outcome?: Database["public"]["Enums"]["round_outcome_type"];
          decision_policy?: Database["public"]["Enums"]["decision_policy_type"];
          reason?: string | null;
          ai_confidence?: number | null;
          confidence_bucket?: Database["public"]["Enums"]["confidence_bucket_type"] | null;
          decision_time_ms?: number | null;
          response_time_ms?: number | null;
          response_speed_ms?: number | null;
          inter_round_delay_ms?: number | null;
          ready_at?: string | null;
          first_interaction_at?: string | null;
          move_selected_at?: string | null;
          completed_at?: string | null;
          interactions?: number | null;
          clicks?: number | null;
          streak_ai?: number | null;
          streak_you?: number | null;
          ai_state?: Json | null;
          mixer_trace?: Json | null;
          heuristic_trace?: Json | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rounds_match_id_fkey";
            columns: ["match_id"];
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_stats_profile_id_fkey";
            columns: ["stats_profile_id"];
            referencedRelation: "stats_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rounds_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          demographics_profile_id: string | null;
          primary_stats_profile_id: string | null;
          device_id: string | null;
          client_session_id: string | null;
          storage_mode: Database["public"]["Enums"]["storage_mode_type"];
          started_at: string;
          ended_at: string | null;
          last_event_at: string | null;
          session_label: string | null;
          client_version: string | null;
          locale: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          demographics_profile_id?: string | null;
          primary_stats_profile_id?: string | null;
          device_id?: string | null;
          client_session_id?: string | null;
          storage_mode?: Database["public"]["Enums"]["storage_mode_type"];
          started_at?: string;
          ended_at?: string | null;
          last_event_at?: string | null;
          session_label?: string | null;
          client_version?: string | null;
          locale?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          demographics_profile_id?: string | null;
          primary_stats_profile_id?: string | null;
          device_id?: string | null;
          client_session_id?: string | null;
          storage_mode?: Database["public"]["Enums"]["storage_mode_type"];
          started_at?: string;
          ended_at?: string | null;
          last_event_at?: string | null;
          session_label?: string | null;
          client_version?: string | null;
          locale?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_demographics_profile_id_fkey";
            columns: ["demographics_profile_id"];
            referencedRelation: "demographics_profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "sessions_primary_stats_profile_id_fkey";
            columns: ["primary_stats_profile_id"];
            referencedRelation: "stats_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sessions_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      settings_events: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          stats_profile_id: string | null;
          setting_key: string;
          old_value: Json | null;
          new_value: Json | null;
          source: string | null;
          occurred_at: string;
          metadata: Json;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id?: string | null;
          stats_profile_id?: string | null;
          setting_key: string;
          old_value?: Json | null;
          new_value?: Json | null;
          source?: string | null;
          occurred_at?: string;
          metadata?: Json;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string | null;
          stats_profile_id?: string | null;
          setting_key?: string;
          old_value?: Json | null;
          new_value?: Json | null;
          source?: string | null;
          occurred_at?: string;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "settings_events_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settings_events_stats_profile_id_fkey";
            columns: ["stats_profile_id"];
            referencedRelation: "stats_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settings_events_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      stats_counters: {
        Row: {
          id: string;
          user_id: string;
          stats_profile_id: string;
          key: string;
          value_numeric: number | null;
          value_integer: number | null;
          value_text: string | null;
          value_json: Json | null;
          sample_count: number | null;
          last_calculated_at: string | null;
          last_round_id: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stats_profile_id: string;
          key: string;
          value_numeric?: number | null;
          value_integer?: number | null;
          value_text?: string | null;
          value_json?: Json | null;
          sample_count?: number | null;
          last_calculated_at?: string | null;
          last_round_id?: string | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stats_profile_id?: string;
          key?: string;
          value_numeric?: number | null;
          value_integer?: number | null;
          value_text?: string | null;
          value_json?: Json | null;
          sample_count?: number | null;
          last_calculated_at?: string | null;
          last_round_id?: string | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stats_counters_last_round_id_fkey";
            columns: ["last_round_id"];
            referencedRelation: "rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stats_counters_stats_profile_id_fkey";
            columns: ["stats_profile_id"];
            referencedRelation: "stats_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stats_counters_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      stats_profiles: {
        Row: {
          id: string;
          user_id: string;
          demographics_profile_id: string | null;
          base_name: string;
          profile_version: number;
          display_name: string;
          training_count: number;
          training_completed: boolean;
          predictor_default: boolean;
          seen_post_training_cta: boolean;
          previous_profile_id: string | null;
          next_profile_id: string | null;
          archived: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          demographics_profile_id?: string | null;
          base_name: string;
          profile_version?: number;
          display_name: string;
          training_count?: number;
          training_completed?: boolean;
          predictor_default?: boolean;
          seen_post_training_cta?: boolean;
          previous_profile_id?: string | null;
          next_profile_id?: string | null;
          archived?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          demographics_profile_id?: string | null;
          base_name?: string;
          profile_version?: number;
          display_name?: string;
          training_count?: number;
          training_completed?: boolean;
          predictor_default?: boolean;
          seen_post_training_cta?: boolean;
          previous_profile_id?: string | null;
          next_profile_id?: string | null;
          archived?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "stats_profiles_demographics_profile_id_fkey";
            columns: ["demographics_profile_id"];
            referencedRelation: "demographics_profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "stats_profiles_next_profile_id_fkey";
            columns: ["next_profile_id"];
            referencedRelation: "stats_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stats_profiles_previous_profile_id_fkey";
            columns: ["previous_profile_id"];
            referencedRelation: "stats_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stats_profiles_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_settings: {
        Row: {
          id: string;
          user_id: string;
          stats_profile_id: string | null;
          session_id: string | null;
          scope: Database["public"]["Enums"]["settings_scope_type"];
          key: string;
          value: Json;
          version: number;
          created_at: string;
          updated_at: string;
          profile_scope_id: string;
          session_scope_id: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stats_profile_id?: string | null;
          session_id?: string | null;
          scope?: Database["public"]["Enums"]["settings_scope_type"];
          key: string;
          value: Json;
          version?: number;
          created_at?: string;
          updated_at?: string;
          profile_scope_id?: string;
          session_scope_id?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stats_profile_id?: string | null;
          session_id?: string | null;
          scope?: Database["public"]["Enums"]["settings_scope_type"];
          key?: string;
          value?: Json;
          version?: number;
          created_at?: string;
          updated_at?: string;
          profile_scope_id?: string;
          session_scope_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_settings_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_settings_stats_profile_id_fkey";
            columns: ["stats_profile_id"];
            referencedRelation: "stats_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_settings_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      developer_room_player_overview: {
        Row: {
          player_id: string;
          player_name: string | null;
          first_name: string | null;
          last_initial: string | null;
          username: string | null;
          grade: string | null;
          age_text: string | null;
          age_numeric: number | null;
          school: string | null;
          prior_experience: string | null;
          training_completed: boolean | null;
          training_count: number | null;
          consent_version: string | null;
          consent_granted_at: string | null;
          last_promoted_at: string | null;
          created_at: string | null;
          updated_at: string | null;
          storage_mode: Database["public"]["Enums"]["storage_mode_type"] | null;
          has_demographics: boolean | null;
          needs_review: boolean | null;
          profile_count: number | null;
          match_count: number | null;
          round_count: number | null;
          last_profile_updated_at: string | null;
          last_match_at: string | null;
          last_round_at: string | null;
          last_played_at: string | null;
          last_activity_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: {
      storage_mode_type: "local" | "cloud";
      game_mode_type: "challenge" | "practice" | "training";
      ai_mode_type: "fair" | "normal" | "ruthless";
      move_type: "rock" | "paper" | "scissors";
      round_outcome_type: "win" | "lose" | "tie";
      decision_policy_type: "mixer" | "heuristic";
      confidence_bucket_type: "low" | "medium" | "high";
      settings_scope_type: "global" | "profile" | "session" | "device";
      lifecycle_event_type:
        | "boot_completed"
        | "welcome_shown"
        | "training_started"
        | "training_completed"
        | "mode_entered"
        | "session_started"
        | "session_ended"
        | "storage_mode_changed"
        | "promotion_started"
        | "promotion_completed"
        | "promotion_failed"
        | "hydrate_started"
        | "hydrate_succeeded"
        | "hydrate_failed"
        | "export_started"
        | "export_completed"
        | "error";
      export_event_type:
        | "rounds_csv"
        | "matches_csv"
        | "ai_state"
        | "full_backup"
        | "local_export";
      instrumentation_trigger_type:
        | "manual"
        | "match-ended"
        | "round-interval"
        | "time-interval";
    };
    CompositeTypes: never;
  };
}

export type AiStateRow = Database["public"]["Tables"]["ai_states"]["Row"];
export type AiStateInsert = Database["public"]["Tables"]["ai_states"]["Insert"];
export type AiStateUpdate = Database["public"]["Tables"]["ai_states"]["Update"];

export type DemographicsProfileRow = Database["public"]["Tables"]["demographics_profiles"]["Row"];
export type DemographicsProfileInsert = Database["public"]["Tables"]["demographics_profiles"]["Insert"];
export type DemographicsProfileUpdate = Database["public"]["Tables"]["demographics_profiles"]["Update"];

export type DeviceShadowRow = Database["public"]["Tables"]["device_shadows"]["Row"];
export type DeviceShadowInsert = Database["public"]["Tables"]["device_shadows"]["Insert"];
export type DeviceShadowUpdate = Database["public"]["Tables"]["device_shadows"]["Update"];

export type ExportEventRow = Database["public"]["Tables"]["export_events"]["Row"];
export type ExportEventInsert = Database["public"]["Tables"]["export_events"]["Insert"];
export type ExportEventUpdate = Database["public"]["Tables"]["export_events"]["Update"];

export type InstrumentationSnapshotRow = Database["public"]["Tables"]["instrumentation_snapshots"]["Row"];
export type InstrumentationSnapshotInsert = Database["public"]["Tables"]["instrumentation_snapshots"]["Insert"];
export type InstrumentationSnapshotUpdate = Database["public"]["Tables"]["instrumentation_snapshots"]["Update"];

export type LifecycleEventRow = Database["public"]["Tables"]["lifecycle_events"]["Row"];
export type LifecycleEventInsert = Database["public"]["Tables"]["lifecycle_events"]["Insert"];
export type LifecycleEventUpdate = Database["public"]["Tables"]["lifecycle_events"]["Update"];

export type MatchRow = Database["public"]["Tables"]["matches"]["Row"];
export type MatchInsert = Database["public"]["Tables"]["matches"]["Insert"];
export type MatchUpdate = Database["public"]["Tables"]["matches"]["Update"];

export type PromotionRunRow = Database["public"]["Tables"]["promotion_runs"]["Row"];
export type PromotionRunInsert = Database["public"]["Tables"]["promotion_runs"]["Insert"];
export type PromotionRunUpdate = Database["public"]["Tables"]["promotion_runs"]["Update"];

export type RoundRow = Database["public"]["Tables"]["rounds"]["Row"];
export type RoundInsert = Database["public"]["Tables"]["rounds"]["Insert"];
export type RoundUpdate = Database["public"]["Tables"]["rounds"]["Update"];

export type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
export type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];
export type SessionUpdate = Database["public"]["Tables"]["sessions"]["Update"];

export type SettingsEventRow = Database["public"]["Tables"]["settings_events"]["Row"];
export type SettingsEventInsert = Database["public"]["Tables"]["settings_events"]["Insert"];
export type SettingsEventUpdate = Database["public"]["Tables"]["settings_events"]["Update"];

export type StatsCounterRow = Database["public"]["Tables"]["stats_counters"]["Row"];
export type StatsCounterInsert = Database["public"]["Tables"]["stats_counters"]["Insert"];
export type StatsCounterUpdate = Database["public"]["Tables"]["stats_counters"]["Update"];

export type StatsProfileRow = Database["public"]["Tables"]["stats_profiles"]["Row"];
export type StatsProfileInsert = Database["public"]["Tables"]["stats_profiles"]["Insert"];
export type StatsProfileUpdate = Database["public"]["Tables"]["stats_profiles"]["Update"];

export type UserSettingRow = Database["public"]["Tables"]["user_settings"]["Row"];
export type UserSettingInsert = Database["public"]["Tables"]["user_settings"]["Insert"];
export type UserSettingUpdate = Database["public"]["Tables"]["user_settings"]["Update"];
