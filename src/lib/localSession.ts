const LOCAL_ACCOUNTS_KEY_VALUE = "rps_local_accounts_v1";
const LOCAL_ACTIVE_ACCOUNT_KEY_VALUE = "rps_local_active_account_v1";
const PLAYERS_STORAGE_KEY_VALUE = "rps_players_v1";
const CURRENT_PLAYER_STORAGE_KEY_VALUE = "rps_current_player_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export const LOCAL_ACCOUNTS_KEY = LOCAL_ACCOUNTS_KEY_VALUE;
export const LOCAL_ACTIVE_ACCOUNT_KEY = LOCAL_ACTIVE_ACCOUNT_KEY_VALUE;
export const PLAYERS_STORAGE_KEY = PLAYERS_STORAGE_KEY_VALUE;
export const CURRENT_PLAYER_STORAGE_KEY = CURRENT_PLAYER_STORAGE_KEY_VALUE;

export function clearActiveLocalSession(profileId?: string): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(LOCAL_ACTIVE_ACCOUNT_KEY_VALUE);
  if (!profileId) return;
  const currentId = window.localStorage.getItem(CURRENT_PLAYER_STORAGE_KEY_VALUE);
  if (currentId === profileId) {
    window.localStorage.removeItem(CURRENT_PLAYER_STORAGE_KEY_VALUE);
  }
}
