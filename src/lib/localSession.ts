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

export function clearActiveLocalSession(_profileId?: string): void {
  if (!isBrowser()) return;

  const pointerKeys = [LOCAL_ACTIVE_ACCOUNT_KEY_VALUE, CURRENT_PLAYER_STORAGE_KEY_VALUE];

  for (const key of pointerKeys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function readArrayFromStorage(key: string): any[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArrayToStorage(key: string, value: any[]): void {
  if (!isBrowser()) return;
  try {
    if (value.length === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // ignore persistence failures
  }
}

export function purgeLocalProfileData(profileId: string): void {
  if (!profileId || !isBrowser()) return;
  const storage = window.localStorage;

  // Players
  const storedPlayers = readArrayFromStorage(PLAYERS_STORAGE_KEY_VALUE);
  const filteredPlayers = storedPlayers.filter(player => {
    if (!player || typeof player !== "object") return true;
    const candidateId = typeof (player as { id?: unknown }).id === "string" ? (player as { id: string }).id : null;
    return candidateId !== profileId;
  });
  if (filteredPlayers.length !== storedPlayers.length) {
    writeArrayToStorage(PLAYERS_STORAGE_KEY_VALUE, filteredPlayers);
  }

  const currentPlayerId = storage.getItem(CURRENT_PLAYER_STORAGE_KEY_VALUE);
  if (currentPlayerId === profileId) {
    storage.removeItem(CURRENT_PLAYER_STORAGE_KEY_VALUE);
  }

  // Local account roster
  const storedAccounts = readArrayFromStorage(LOCAL_ACCOUNTS_KEY_VALUE);
  const filteredAccounts = storedAccounts.filter(account => {
    if (!account || typeof account !== "object") return true;
    const profile = (account as { profile?: { id?: unknown } }).profile;
    const accountId = profile && typeof profile.id === "string" ? profile.id : null;
    return accountId !== profileId;
  });
  if (filteredAccounts.length !== storedAccounts.length) {
    writeArrayToStorage(LOCAL_ACCOUNTS_KEY_VALUE, filteredAccounts);
  }

  const activeAccountId = storage.getItem(LOCAL_ACTIVE_ACCOUNT_KEY_VALUE);
  if (activeAccountId === profileId) {
    storage.removeItem(LOCAL_ACTIVE_ACCOUNT_KEY_VALUE);
  }

  // Stats profiles and related artifacts
  const storedStatsProfiles = readArrayFromStorage(STATS_PROFILES_KEY_VALUE);
  const removedStatsProfileIds = new Set<string>();
  const retainedStatsProfiles = storedStatsProfiles.filter(profile => {
    if (!profile || typeof profile !== "object") return true;
    const ownerId = (() => {
      if (typeof (profile as { user_id?: unknown }).user_id === "string") {
        return (profile as { user_id: string }).user_id;
      }
      if (typeof (profile as { playerId?: unknown }).playerId === "string") {
        return (profile as { playerId: string }).playerId;
      }
      return null;
    })();
    const statsProfileId = typeof (profile as { id?: unknown }).id === "string" ? (profile as { id: string }).id : null;
    if (ownerId === profileId) {
      if (statsProfileId) {
        removedStatsProfileIds.add(statsProfileId);
      }
      return false;
    }
    return true;
  });
  if (retainedStatsProfiles.length !== storedStatsProfiles.length) {
    writeArrayToStorage(STATS_PROFILES_KEY_VALUE, retainedStatsProfiles);
  }

  const currentStatsProfileId = storage.getItem(STATS_CURRENT_PROFILE_KEY_VALUE);
  if (currentStatsProfileId && removedStatsProfileIds.has(currentStatsProfileId)) {
    storage.removeItem(STATS_CURRENT_PROFILE_KEY_VALUE);
  }

  const storedRounds = readArrayFromStorage(STATS_ROUNDS_KEY_VALUE);
  const filteredRounds = storedRounds.filter(round => {
    if (!round || typeof round !== "object") return true;
    const ownerId = typeof (round as { playerId?: unknown }).playerId === "string"
      ? (round as { playerId: string }).playerId
      : null;
    return ownerId !== profileId;
  });
  if (filteredRounds.length !== storedRounds.length) {
    writeArrayToStorage(STATS_ROUNDS_KEY_VALUE, filteredRounds);
  }

  const storedMatches = readArrayFromStorage(STATS_MATCHES_KEY_VALUE);
  const filteredMatches = storedMatches.filter(match => {
    if (!match || typeof match !== "object") return true;
    const ownerId = typeof (match as { playerId?: unknown }).playerId === "string"
      ? (match as { playerId: string }).playerId
      : null;
    return ownerId !== profileId;
  });
  if (filteredMatches.length !== storedMatches.length) {
    writeArrayToStorage(STATS_MATCHES_KEY_VALUE, filteredMatches);
  }

  if (removedStatsProfileIds.size > 0) {
    const storedModelStates = readArrayFromStorage(STATS_MODEL_STATE_KEY_VALUE);
    const filteredStates = storedModelStates.filter(state => {
      if (!state || typeof state !== "object") return true;
      const statsProfileId = typeof (state as { profileId?: unknown }).profileId === "string"
        ? (state as { profileId: string }).profileId
        : null;
      if (statsProfileId && removedStatsProfileIds.has(statsProfileId)) {
        return false;
      }
      return true;
    });
    if (filteredStates.length !== storedModelStates.length) {
      writeArrayToStorage(STATS_MODEL_STATE_KEY_VALUE, filteredStates);
    }
  }
}
