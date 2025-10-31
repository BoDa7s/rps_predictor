export const LOCAL_ACCOUNTS_KEY = "rps_local_accounts_v1";
export const LOCAL_ACTIVE_ACCOUNT_KEY = "rps_local_active_account_v1";
export const WELCOME_PREF_KEY = "rps_welcome_pref_v1";
export const LEGACY_WELCOME_SEEN_KEY = "rps_welcome_seen_v1";
export const PLAYERS_STORAGE_KEY = "rps_players_v1";
export const CURRENT_PLAYER_STORAGE_KEY = "rps_current_player_v1";
export const STATS_PROFILES_KEY = "rps_stats_profiles_v1";
export const STATS_CURRENT_PROFILE_KEY = "rps_current_stats_profile_v1";

interface ClearOptions {
  clearAccounts?: boolean;
  clearPreferences?: boolean;
  clearPlayers?: boolean;
  clearStats?: boolean;
}

export function clearWelcomeStorage(options?: ClearOptions): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(LOCAL_ACTIVE_ACCOUNT_KEY);
  } catch {
    /* noop */
  }
  if (options?.clearAccounts) {
    try {
      window.localStorage.removeItem(LOCAL_ACCOUNTS_KEY);
    } catch {
      /* noop */
    }
  }
  if (options?.clearPreferences) {
    try {
      window.localStorage.removeItem(WELCOME_PREF_KEY);
      window.localStorage.removeItem(LEGACY_WELCOME_SEEN_KEY);
    } catch {
      /* noop */
    }
  }
  if (options?.clearPlayers) {
    try {
      window.localStorage.removeItem(PLAYERS_STORAGE_KEY);
      window.localStorage.removeItem(CURRENT_PLAYER_STORAGE_KEY);
    } catch {
      /* noop */
    }
  }
  if (options?.clearStats) {
    try {
      window.localStorage.removeItem(STATS_PROFILES_KEY);
      window.localStorage.removeItem(STATS_CURRENT_PROFILE_KEY);
    } catch {
      /* noop */
    }
  }
}
