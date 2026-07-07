// Transient runtime resume state only. Historical match truth remains in telemetry.
const STORAGE_KEY = "rps_in_progress_matches_v1";

type MatchMode = "training" | "challenge";

type SnapshotStore = Record<string, unknown>;
type PersistedSnapshotEnvelope = {
  version: 1;
  mode: MatchMode;
  playerId: string;
  profileId: string;
  savedAt: string;
  data: unknown;
};

function loadStore(): SnapshotStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SnapshotStore) : {};
  } catch {
    return {};
  }
}

function persistStore(store: SnapshotStore) {
  if (typeof window === "undefined") return;
  if (Object.keys(store).length === 0) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function buildKey(mode: MatchMode, playerId: string, profileId: string) {
  return `${mode}:${playerId}:${profileId}`;
}

function isPersistedSnapshotEnvelope(value: unknown): value is PersistedSnapshotEnvelope {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<PersistedSnapshotEnvelope>;
  return (
    input.version === 1 &&
    (input.mode === "training" || input.mode === "challenge") &&
    typeof input.playerId === "string" &&
    typeof input.profileId === "string" &&
    typeof input.savedAt === "string" &&
    "data" in input
  );
}

export function loadPersistedMatchSnapshot<T>(mode: MatchMode, playerId: string, profileId: string): T | null {
  const store = loadStore();
  const key = buildKey(mode, playerId, profileId);
  const value = store[key];
  if (!value) return null;
  if (isPersistedSnapshotEnvelope(value)) {
    if (value.mode !== mode || value.playerId !== playerId || value.profileId !== profileId) {
      delete store[key];
      persistStore(store);
      return null;
    }
    return value.data ? (value.data as T) : null;
  }
  return value as T;
}

export function savePersistedMatchSnapshot(
  mode: MatchMode,
  playerId: string,
  profileId: string,
  snapshot: unknown,
) {
  const store = loadStore();
  store[buildKey(mode, playerId, profileId)] = {
    version: 1,
    mode,
    playerId,
    profileId,
    savedAt: new Date().toISOString(),
    data: snapshot,
  } satisfies PersistedSnapshotEnvelope;
  persistStore(store);
}

export function clearPersistedMatchSnapshot(mode: MatchMode, playerId: string, profileId: string) {
  const store = loadStore();
  delete store[buildKey(mode, playerId, profileId)];
  persistStore(store);
}
