const LOCAL_ACCOUNTS_KEY_VALUE = "rps_local_accounts_v1";
const LOCAL_ACTIVE_ACCOUNT_KEY_VALUE = "rps_local_active_account_v1";
const PLAYERS_STORAGE_KEY_VALUE = "rps_players_v1";
const CURRENT_PLAYER_STORAGE_KEY_VALUE = "rps_current_player_v1";
const STATS_PROFILES_KEY_VALUE = "rps_stats_profiles_v1";
const STATS_CURRENT_PROFILE_KEY_VALUE = "rps_current_stats_profile_v1";
const STATS_ROUNDS_KEY_VALUE = "rps_stats_rounds_v1";
const STATS_MATCHES_KEY_VALUE = "rps_stats_matches_v1";
const STATS_MODEL_STATE_KEY_VALUE = "rps_predictor_models_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export const LOCAL_ACCOUNTS_KEY = LOCAL_ACCOUNTS_KEY_VALUE;
export const LOCAL_ACTIVE_ACCOUNT_KEY = LOCAL_ACTIVE_ACCOUNT_KEY_VALUE;
export const PLAYERS_STORAGE_KEY = PLAYERS_STORAGE_KEY_VALUE;
export const CURRENT_PLAYER_STORAGE_KEY = CURRENT_PLAYER_STORAGE_KEY_VALUE;
export const STATS_PROFILES_KEY = STATS_PROFILES_KEY_VALUE;
export const STATS_CURRENT_PROFILE_KEY = STATS_CURRENT_PROFILE_KEY_VALUE;
export const STATS_ROUNDS_KEY = STATS_ROUNDS_KEY_VALUE;
export const STATS_MATCHES_KEY = STATS_MATCHES_KEY_VALUE;
export const STATS_MODEL_STATE_KEY = STATS_MODEL_STATE_KEY_VALUE;

export const LOCAL_PROFILE_SELECTED_EVENT = "rps_local_profile_selected_v1" as const;

export interface LocalProfileSelectionDetail {
  playerId: string | null;
  statsProfileId?: string | null;
}

function emitLocalProfileSelection(detail: LocalProfileSelectionDetail): void {
  if (!isBrowser()) return;
  try {
    const event = new CustomEvent<LocalProfileSelectionDetail>(LOCAL_PROFILE_SELECTED_EVENT, { detail });
    window.dispatchEvent(event);
  } catch {
    // ignore dispatch failures (e.g., older browsers without CustomEvent support)
  }
}

function writePointer(key: string, value: string | null): void {
  if (!isBrowser()) return;
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore persistence failures
  }
}

export function updateActiveLocalPointers(
  playerId: string | null,
  options: { statsProfileId?: string | null } = {},
): void {
  writePointer(LOCAL_ACTIVE_ACCOUNT_KEY_VALUE, playerId);
  writePointer(CURRENT_PLAYER_STORAGE_KEY_VALUE, playerId);
  emitLocalProfileSelection({ playerId, statsProfileId: options.statsProfileId });
}

export function getActiveLocalAccountId(): string | null {
  if (!isBrowser()) return null;
  try {
    const id = window.localStorage.getItem(LOCAL_ACTIVE_ACCOUNT_KEY_VALUE);
    return typeof id === "string" && id.trim() ? id : null;
  } catch {
    return null;
  }
}

export function getCurrentLocalPlayerId(): string | null {
  if (!isBrowser()) return null;
  try {
    const id = window.localStorage.getItem(CURRENT_PLAYER_STORAGE_KEY_VALUE);
    return typeof id === "string" && id.trim() ? id : null;
  } catch {
    return null;
  }
}
