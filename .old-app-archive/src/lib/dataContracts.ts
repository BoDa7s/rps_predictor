export type UiSurfaceKey =
  | "profileHeader"
  | "modeTiles"
  | "trainingBadge"
  | "liveStats"
  | "aiInsights";

export interface DemographicsProfileRecord {
  user_id: string;
  first_name: string | null;
  last_initial: string | null;
  grade: string | null;
  training_completed: boolean | null;
  training_count: number | null;
}

export interface StatsProfileRecord {
  id: string;
  user_id: string;
  base_name: string;
  display_name: string;
  profile_version: number;
  training_completed: boolean;
  training_count: number;
  predictor_default: boolean;
  seen_post_training_cta: boolean;
  previous_profile_id: string | null;
  next_profile_id: string | null;
  created_at: string;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  primary_stats_profile_id: string | null;
  client_session_id: string | null;
  started_at: string;
  ended_at: string | null;
  last_event_at: string | null;
}

export interface RoundRecord {
  id: string;
  user_id: string;
  stats_profile_id: string;
  session_id: string;
  match_id: string | null;
  client_round_id: string | null;
  round_number: number;
  played_at: string;
  mode: string;
  difficulty: string;
  best_of: number;
  player_move: string;
  ai_move: string;
  predicted_player_move: string | null;
  outcome: string;
  ai_confidence: number | null;
  confidence_bucket: string | null;
  decision_policy: string;
  reason: string | null;
}

export interface AiStateRecord {
  id: string;
  user_id: string;
  stats_profile_id: string;
  model_version: number;
  rounds_seen: number;
  state: unknown;
  needs_rebuild: boolean;
  updated_at: string;
  version: number;
}

export interface StatsCounterRecord {
  id: string;
  user_id: string;
  stats_profile_id: string;
  key: string;
  value_numeric: number | null;
  value_integer: number | null;
  value_json: unknown;
  sample_count: number | null;
  updated_at: string;
}

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
