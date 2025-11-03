import type {
  AiStateRow,
  DemographicsProfileRow,
  RoundRow,
  SessionRow,
  StatsCounterRow,
  StatsProfileRow,
} from "./database.types";

export type UiSurfaceKey =
  | "profileHeader"
  | "modeTiles"
  | "trainingBadge"
  | "liveStats"
  | "aiInsights";

export type DemographicsProfileRecord = Pick<
  DemographicsProfileRow,
  "user_id" | "first_name" | "last_initial" | "grade" | "training_completed" | "training_count"
>;

export type StatsProfileRecord = StatsProfileRow;

export type SessionRecord = Pick<
  SessionRow,
  | "id"
  | "user_id"
  | "primary_stats_profile_id"
  | "client_session_id"
  | "started_at"
  | "ended_at"
  | "last_event_at"
>;

export type RoundRecord = Pick<
  RoundRow,
  | "id"
  | "user_id"
  | "stats_profile_id"
  | "session_id"
  | "match_id"
  | "client_round_id"
  | "round_number"
  | "played_at"
  | "mode"
  | "difficulty"
  | "best_of"
  | "player_move"
  | "ai_move"
  | "predicted_player_move"
  | "outcome"
  | "ai_confidence"
  | "confidence_bucket"
  | "decision_policy"
  | "reason"
>;

export type AiStateRecord = Pick<
  AiStateRow,
  | "id"
  | "user_id"
  | "stats_profile_id"
  | "model_version"
  | "rounds_seen"
  | "state"
  | "needs_rebuild"
  | "updated_at"
  | "version"
>;

export type StatsCounterRecord = Pick<
  StatsCounterRow,
  | "id"
  | "user_id"
  | "stats_profile_id"
  | "key"
  | "value_numeric"
  | "value_integer"
  | "value_json"
  | "sample_count"
  | "updated_at"
>;

export interface UiDataContractDescriptor {
  tables: Array<{
    name: string;
    fields: readonly string[];
  }>;
  notes?: string;
}

export const UI_DATA_CONTRACTS: Record<UiSurfaceKey, UiDataContractDescriptor> = {
  profileHeader: {
    tables: [
      {
        name: "demographics_profiles",
        fields: [
          "first_name",
          "last_initial",
          "grade",
          "training_completed",
          "training_count",
        ] as const,
      },
    ],
    notes: "Used for the welcome header and hero badge copy.",
  },
  modeTiles: {
    tables: [
      {
        name: "stats_profiles",
        fields: [
          "display_name",
          "training_completed",
          "training_count",
          "predictor_default",
        ] as const,
      },
      {
        name: "stats_counters",
        fields: ["key", "value_numeric", "value_integer"] as const,
      },
    ],
    notes: "Provides win-rate, streak, and profile completion for the mode select tiles.",
  },
  trainingBadge: {
    tables: [
      {
        name: "stats_profiles",
        fields: ["training_completed", "training_count", "profile_version"] as const,
      },
    ],
    notes: "Determines whether the training badge is shown in the header.",
  },
  liveStats: {
    tables: [
      {
        name: "stats_counters",
        fields: ["key", "value_numeric", "value_json", "sample_count"] as const,
      },
      {
        name: "rounds",
        fields: [
          "played_at",
          "mode",
          "difficulty",
          "outcome",
          "player_move",
          "ai_move",
        ] as const,
      },
    ],
    notes: "Feeds the live stats dashboard and spark-lines.",
  },
  aiInsights: {
    tables: [
      {
        name: "ai_states",
        fields: ["state", "rounds_seen", "model_version", "needs_rebuild", "updated_at"] as const,
      },
      {
        name: "rounds",
        fields: ["id", "played_at", "predicted_player_move", "ai_confidence"] as const,
      },
    ],
    notes: "Backs the Insight panel with latest Hedge model snapshot and confidence history.",
  },
};

export const CLOUD_ROUND_LIMIT = 250;
