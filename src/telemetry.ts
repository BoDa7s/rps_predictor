import { useSyncExternalStore } from "react";
import type { AIMode, BestOf, Mode, Move, Outcome } from "./gameTypes";

export type TelemetryMode = "challenge" | "training";

export type TelemetryId = string;
export type ConfidenceBucket = "low" | "medium" | "high";
export type MatchStatus = "active" | "completed" | "abandoned";
export type MatchWinner = "player" | "ai" | "tie";

export interface GameplayPreferenceSnapshot {
  aiDifficulty: AIMode;
  bestOf: BestOf;
}

export type TelemetryThemePreference = "system" | "light" | "dark";

export interface TelemetryThemeModeColors {
  accent: string;
  background: string;
}

export type TelemetryThemeColorPreferences = Record<"light" | "dark", TelemetryThemeModeColors>;

export interface TelemetryProfilePreferences {
  theme: TelemetryThemePreference;
  themeColors: TelemetryThemeColorPreferences;
  gameplay: GameplayPreferenceSnapshot;
}

export interface AppPlayerRecord {
  id: string;
  playerName: string;
  grade: string;
  school?: string;
  priorExperience?: string;
  consent?: {
    agreed: boolean;
    timestamp?: string;
    consentTextVersion: string;
  };
  needsReview: boolean;
}

export interface PredictorModelStateRecord {
  profileId: string;
  modelVersion: number;
  updatedAt: string;
  roundsSeen: number;
  state: {
    eta: number;
    weights: number[];
    experts: unknown[];
  };
}

// Must-have v1 fields are kept flat and close to existing app data so legacy
// round/match logging can be mirrored without a large rewrite.
// Optional/later fields are included as optional properties.
export interface PlayerProfile {
  id: TelemetryId;
  playerId: string;
  sourcePlayerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  playerName: string;
  grade: string;
  school?: string;
  priorExperience?: string;
  trainingCount: number;
  trained: boolean;
  predictorDefault: boolean;
  seenPostTrainingCTA: boolean;
  baseName: string;
  version: number;
  previousProfileId?: string | null;
  nextProfileId?: string | null;
  preferences: GameplayPreferenceSnapshot;
  consentAgreed?: boolean;
  consentTimestamp?: string;
  consentTextVersion?: string;
  needsReview?: boolean;
}

export interface GameSession {
  id: TelemetryId;
  playerId: string;
  profileId: string | null;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  source: "play-app";
  activeMatchId?: string | null;
  initialRoute?: string;
  status: "active" | "ended";
}

export interface MatchRecord {
  id: TelemetryId;
  sourceMatchId?: string;
  sessionId: string;
  playerId: string;
  profileId: string;
  startedAt: string;
  endedAt: string;
  mode: TelemetryMode;
  bestOf: BestOf;
  difficulty: AIMode;
  score: { you: number; ai: number };
  rounds: number;
  roundsPlayed: number;
  winner: MatchWinner;
  completed: boolean;
  status: MatchStatus;
  aiWinRate: number;
  youSwitchedRate: number;
  notes?: string;
  leaderboardScore?: number;
  leaderboardMaxStreak?: number;
  leaderboardRoundCount?: number;
  leaderboardTimerBonus?: number;
  leaderboardBeatConfidenceBonus?: number;
  leaderboardType?: "Challenge" | "Practice Legacy";
}

export interface PredictionExpertSample {
  name: string;
  weight: number;
  pActual?: number;
}

export interface AIPredictionRecord {
  id: TelemetryId;
  sessionId: string;
  matchId?: string;
  roundId: string;
  playerId: string;
  profileId: string;
  timestamp: string;
  mode: TelemetryMode;
  difficulty: AIMode;
  policy: "mixer" | "heuristic";
  confidence: number;
  confidenceBucket: ConfidenceBucket;
  reason: string;
  predictedPlayerMove?: Move | null;
  counterMoveChosen?: Move | null;
  chosenAiMove?: Move | null;
  mixerDist?: Record<Move, number>;
  topExperts?: PredictionExpertSample[];
  realtimeWeight?: number;
  historyWeight?: number;
  realtimeRounds?: number;
  historyRounds?: number;
  conflict?: { realtime: Move | null; history: Move | null } | null;
  heuristicConfidence?: number | null;
}

export interface RoundRecord {
  id: TelemetryId;
  sessionId: string;
  matchId?: string;
  playerId: string;
  profileId: string;
  timestamp: string;
  roundNumber: number;
  mode: TelemetryMode;
  bestOf: BestOf;
  difficulty: AIMode;
  player: Move;
  ai: Move;
  outcome: Outcome;
  policy: "mixer" | "heuristic";
  confidence: number;
  confidenceBucket: ConfidenceBucket;
  reason: string;
  decisionTimeMs?: number;
  streakAI: number;
  streakYou: number;
  predictionId?: string;
  mixer?: {
    dist: Record<Move, number>;
    counter: Move;
    confidence: number;
    realtimeWeight?: number;
    historyWeight?: number;
    realtimeRounds?: number;
    historyRounds?: number;
    conflict?: { realtime: Move | null; history: Move | null } | null;
    topExperts: PredictionExpertSample[];
  };
  heuristic?: {
    predicted?: Move | null;
    conf?: number | null;
    reason?: string;
  };
}

export interface UIEventRecord {
  id: TelemetryId;
  sessionId: string;
  timestamp: string;
  playerId?: string;
  profileId?: string | null;
  matchId?: string;
  roundId?: string;
  surface: string;
  action: string;
  value?: string;
  detail?: string;
  meta?: Record<string, string | number | boolean | null>;
}

type UpsertableMatchRecord = Omit<MatchRecord, "mode"> & { mode: Mode | TelemetryMode };
type UpsertableRoundRecord = Omit<RoundRecord, "mode"> & { mode: Mode | TelemetryMode };

export interface TelemetryStore {
  version: 1;
  appPlayersById: Record<string, AppPlayerRecord>;
  playersById: Record<string, PlayerProfile>;
  sessionsById: Record<string, GameSession>;
  matchesById: Record<string, MatchRecord>;
  roundsById: Record<string, RoundRecord>;
  predictionsById: Record<string, AIPredictionRecord>;
  uiEventsById: Record<string, UIEventRecord>;
  profilePreferencesById: Record<string, TelemetryProfilePreferences>;
  modelStatesByProfileId: Record<string, PredictorModelStateRecord>;
  currentPlayerId: string | null;
  currentProfileId: string | null;
  appPlayerIds: string[];
  playerIds: string[];
  sessionIds: string[];
  matchIds: string[];
  roundIds: string[];
  predictionIds: string[];
  uiEventIds: string[];
}

export interface ResolvedTelemetryProfileSelection {
  orderedProfiles: PlayerProfile[];
  activeProfile: PlayerProfile | null;
  activeProfileId: string | null;
  requestedProfileId: string | null;
  usedFallback: boolean;
}

const STORAGE_KEY = "rps_telemetry_v1";
// Legacy bootstrap keys from the pre-telemetry app. These are only used to
// create the initial telemetry store when no canonical telemetry store exists.
const LEGACY_PLAYERS_KEY = "rps_players_v1";
const LEGACY_CURRENT_PLAYER_KEY = "rps_current_player_v1";
const LEGACY_PROFILE_KEY = "rps_stats_profiles_v1";
const LEGACY_CURRENT_PROFILE_KEY = "rps_current_stats_profile_v1";
const LEGACY_MODEL_STATE_KEY = "rps_predictor_models_v1";
const DEFAULT_THEME_PREFERENCES: TelemetryThemeColorPreferences = {
  light: {
    accent: "#2563EB",
    background: "#F6F8FC",
  },
  dark: {
    accent: "#60A5FA",
    background: "#0B1220",
  },
};

function toTelemetryMode(mode: Mode | TelemetryMode): TelemetryMode {
  return mode === "practice" ? "training" : mode;
}

function shouldCreateCanonicalPrediction(mode: Mode | TelemetryMode) {
  return toTelemetryMode(mode) === "challenge";
}

function normalizeStoreModes(store: TelemetryStore): TelemetryStore {
  let changed = false;
  const next = cloneStore(store);

  next.matchIds.forEach(id => {
    const match = next.matchesById[id];
    if (!match) return;
    const normalized = toTelemetryMode(match.mode as Mode | TelemetryMode);
    if (normalized !== match.mode) {
      next.matchesById[id] = { ...match, mode: normalized };
      changed = true;
    }
  });

  next.roundIds.forEach(id => {
    const round = next.roundsById[id];
    if (!round) return;
    const normalized = toTelemetryMode(round.mode as Mode | TelemetryMode);
    const canonicalPredictionId = shouldCreateCanonicalPrediction(normalized) ? round.predictionId : undefined;
    if (normalized !== round.mode || canonicalPredictionId !== round.predictionId) {
      next.roundsById[id] = { ...round, mode: normalized, predictionId: canonicalPredictionId };
      changed = true;
    }
  });

  next.predictionIds.forEach(id => {
    const prediction = next.predictionsById[id];
    if (!prediction) return;
    const normalized = toTelemetryMode(prediction.mode as Mode | TelemetryMode);
    if (!shouldCreateCanonicalPrediction(normalized)) {
      delete next.predictionsById[id];
      changed = true;
      return;
    }
    if (normalized !== prediction.mode) {
      next.predictionsById[id] = { ...prediction, mode: normalized };
      changed = true;
    }
  });

  if (changed) {
    next.predictionIds = next.predictionIds.filter(id => Boolean(next.predictionsById[id]));
  }

  return changed ? next : store;
}

function createEmptyStore(): TelemetryStore {
  return {
    version: 1,
    appPlayersById: {},
    playersById: {},
    sessionsById: {},
    matchesById: {},
    roundsById: {},
    predictionsById: {},
    uiEventsById: {},
    profilePreferencesById: {},
    modelStatesByProfileId: {},
    currentPlayerId: null,
    currentProfileId: null,
    appPlayerIds: [],
    playerIds: [],
    sessionIds: [],
    matchIds: [],
    roundIds: [],
    predictionIds: [],
    uiEventIds: [],
  };
}

function cloneStore(store: TelemetryStore): TelemetryStore {
  return {
    version: 1,
    appPlayersById: { ...store.appPlayersById },
    playersById: { ...store.playersById },
    sessionsById: { ...store.sessionsById },
    matchesById: { ...store.matchesById },
    roundsById: { ...store.roundsById },
    predictionsById: { ...store.predictionsById },
    uiEventsById: { ...store.uiEventsById },
    profilePreferencesById: { ...store.profilePreferencesById },
    modelStatesByProfileId: { ...store.modelStatesByProfileId },
    currentPlayerId: store.currentPlayerId ?? null,
    currentProfileId: store.currentProfileId ?? null,
    appPlayerIds: [...store.appPlayerIds],
    playerIds: [...store.playerIds],
    sessionIds: [...store.sessionIds],
    matchIds: [...store.matchIds],
    roundIds: [...store.roundIds],
    predictionIds: [...store.predictionIds],
    uiEventIds: [...store.uiEventIds],
  };
}

function getTelemetryProfileLineageIndex(baseName: string): number {
  const normalized = (baseName ?? "").trim();
  const match = normalized.match(/^primary(?:\s+(\d+))?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const parsed = match[1] ? Number.parseInt(match[1], 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function orderTelemetryProfilesForPlayer(profiles: PlayerProfile[], playerId: string): PlayerProfile[] {
  return profiles
    .filter(profile => profile.playerId === playerId)
    .slice()
    .sort((a, b) => {
      const indexDiff = getTelemetryProfileLineageIndex(a.baseName) - getTelemetryProfileLineageIndex(b.baseName);
      if (indexDiff !== 0) return indexDiff;
      const versionDiff = (b.version ?? 1) - (a.version ?? 1);
      if (versionDiff !== 0) return versionDiff;
      if (getTelemetryProfileLineageIndex(a.baseName) === Number.MAX_SAFE_INTEGER) {
        const baseCompare = a.baseName.localeCompare(b.baseName);
        if (baseCompare !== 0) return baseCompare;
      }
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
}

export function getActiveTelemetryProfileForPlayer(
  profiles: PlayerProfile[],
  playerId: string,
  preferredProfileId?: string | null,
): PlayerProfile | null {
  return resolveTelemetryProfileSelectionForPlayer(profiles, playerId, preferredProfileId).activeProfile;
}

export function resolveTelemetryProfileSelectionForPlayer(
  profiles: PlayerProfile[],
  playerId: string | null | undefined,
  preferredProfileId?: string | null,
): ResolvedTelemetryProfileSelection {
  if (!playerId) {
    return {
      orderedProfiles: [],
      activeProfile: null,
      activeProfileId: null,
      requestedProfileId: preferredProfileId ?? null,
      usedFallback: false,
    };
  }

  const orderedProfiles = orderTelemetryProfilesForPlayer(profiles, playerId);
  const preferred = preferredProfileId
    ? orderedProfiles.find(profile => profile.id === preferredProfileId) ?? null
    : null;
  const activeProfile = preferred ?? orderedProfiles[0] ?? null;

  return {
    orderedProfiles,
    activeProfile,
    activeProfileId: activeProfile?.id ?? null,
    requestedProfileId: preferredProfileId ?? null,
    usedFallback: Boolean(activeProfile && preferredProfileId && !preferred),
  };
}

export function getTelemetryProfilePreferences(
  profile: Pick<PlayerProfile, "preferences"> | null | undefined,
  storedPreferences: unknown,
): TelemetryProfilePreferences {
  return normalizeTelemetryProfilePreferences(
    storedPreferences ??
      (profile
        ? {
            gameplay: {
              aiDifficulty: profile.preferences.aiDifficulty,
              bestOf: profile.preferences.bestOf,
            },
          }
        : null),
  );
}

function csvCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function normalizeThemePreference(value: unknown): TelemetryThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function normalizeThemeModeColors(value: unknown, fallback: TelemetryThemeModeColors): TelemetryThemeModeColors {
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }
  const input = value as { accent?: unknown; background?: unknown };
  return {
    accent: typeof input.accent === "string" ? input.accent : fallback.accent,
    background: typeof input.background === "string" ? input.background : fallback.background,
  };
}

function normalizeTelemetryProfilePreferences(value: unknown): TelemetryProfilePreferences {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const gameplayInput =
    input.gameplay && typeof input.gameplay === "object"
      ? (input.gameplay as Partial<GameplayPreferenceSnapshot>)
      : (input as Partial<GameplayPreferenceSnapshot>);
  return {
    theme: normalizeThemePreference(input.theme),
    themeColors: {
      light: normalizeThemeModeColors(
        input.themeColors && typeof input.themeColors === "object" ? (input.themeColors as { light?: unknown }).light : null,
        DEFAULT_THEME_PREFERENCES.light,
      ),
      dark: normalizeThemeModeColors(
        input.themeColors && typeof input.themeColors === "object" ? (input.themeColors as { dark?: unknown }).dark : null,
        DEFAULT_THEME_PREFERENCES.dark,
      ),
    },
    gameplay: {
      aiDifficulty:
        gameplayInput.aiDifficulty === "fair" || gameplayInput.aiDifficulty === "normal" || gameplayInput.aiDifficulty === "ruthless"
          ? gameplayInput.aiDifficulty
          : "normal",
      bestOf: gameplayInput.bestOf === 3 || gameplayInput.bestOf === 5 || gameplayInput.bestOf === 7 ? gameplayInput.bestOf : 5,
    },
  };
}

function loadLegacyArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function loadLegacyValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function normalizeLegacyPlayer(raw: unknown): AppPlayerRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const id = typeof input.id === "string" ? input.id : null;
  if (!id) return null;
  const playerName =
    typeof input.playerName === "string"
      ? input.playerName.trim() || "Player"
      : typeof input.displayName === "string"
        ? input.displayName.trim() || "Player"
        : "Player";
  const consentInput = input.consent && typeof input.consent === "object" ? (input.consent as Record<string, unknown>) : null;
  return {
    id,
    playerName,
    grade: typeof input.grade === "string" ? input.grade : "Not applicable",
    school: typeof input.school === "string" ? input.school : undefined,
    priorExperience: typeof input.priorExperience === "string" ? input.priorExperience : undefined,
    consent: {
      agreed: consentInput?.agreed !== false,
      timestamp: typeof consentInput?.timestamp === "string" ? consentInput.timestamp : undefined,
      consentTextVersion: typeof consentInput?.consentTextVersion === "string" ? consentInput.consentTextVersion : "v1",
    },
    needsReview: Boolean(input.needsReview),
  };
}

function normalizeLegacyModelState(raw: unknown): PredictorModelStateRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const profileId = typeof input.profileId === "string" ? input.profileId : null;
  const modelVersion = Number.isFinite(input.modelVersion) ? Math.floor(Number(input.modelVersion)) : null;
  const updatedAt = typeof input.updatedAt === "string" ? input.updatedAt : null;
  const roundsSeen = Number.isFinite(input.roundsSeen) ? Number(input.roundsSeen) : 0;
  const state = input.state && typeof input.state === "object" ? (input.state as Record<string, unknown>) : null;
  if (!profileId || modelVersion == null || !updatedAt || !state) return null;
  return {
    profileId,
    modelVersion,
    updatedAt,
    roundsSeen,
    state: {
      eta: Number.isFinite(state.eta) ? Number(state.eta) : 1.6,
      weights: Array.isArray(state.weights) ? state.weights.map(value => (Number.isFinite(value) ? Number(value) : 1)) : [],
      experts: Array.isArray(state.experts) ? state.experts : [],
    },
  };
}

function bootstrapLegacyLocalState(store: TelemetryStore): TelemetryStore {
  if (typeof window === "undefined") return store;
  let changed = false;
  const next = cloneStore(store);

  const legacyPlayers = loadLegacyArray<unknown>(LEGACY_PLAYERS_KEY)
    .map(normalizeLegacyPlayer)
    .filter((player): player is AppPlayerRecord => player !== null);
  legacyPlayers.forEach(player => {
    if (!next.appPlayersById[player.id]) {
      next.appPlayersById[player.id] = player;
      upsertId(next.appPlayerIds, player.id);
      changed = true;
    }
  });

  const legacyProfiles = loadLegacyArray<LegacyStatsProfileInput>(LEGACY_PROFILE_KEY);
  legacyProfiles.forEach(profile => {
    if (!profile || typeof profile !== "object" || typeof profile.id !== "string") return;
    const player = next.appPlayersById[profile.playerId];
    if (!next.playersById[profile.id]) {
      next.playersById[profile.id] = toTelemetryProfile(player, profile, new Date().toISOString());
      upsertId(next.playerIds, profile.id);
      changed = true;
    }
    if (!next.profilePreferencesById[profile.id]) {
      next.profilePreferencesById[profile.id] = normalizeTelemetryProfilePreferences(profile.preferences);
      changed = true;
    }
  });

  const legacyModelStates = loadLegacyArray<unknown>(LEGACY_MODEL_STATE_KEY)
    .map(normalizeLegacyModelState)
    .filter((state): state is PredictorModelStateRecord => state !== null);
  legacyModelStates.forEach(state => {
    if (!next.modelStatesByProfileId[state.profileId]) {
      next.modelStatesByProfileId[state.profileId] = state;
      changed = true;
    }
  });

  if (!next.currentPlayerId) {
    const legacyCurrentPlayerId = loadLegacyValue(LEGACY_CURRENT_PLAYER_KEY);
    if (legacyCurrentPlayerId && next.appPlayersById[legacyCurrentPlayerId]) {
      next.currentPlayerId = legacyCurrentPlayerId;
      changed = true;
    }
  }

  if (!next.currentProfileId) {
    const legacyCurrentProfileId = loadLegacyValue(LEGACY_CURRENT_PROFILE_KEY);
    if (legacyCurrentProfileId && next.playersById[legacyCurrentProfileId]) {
      next.currentProfileId = legacyCurrentProfileId;
      changed = true;
    }
  }

  return changed ? next : store;
}

function loadStore(): TelemetryStore {
  if (typeof window === "undefined") return createEmptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Legacy import is bootstrap-only. Once a telemetry store exists, old local
    // keys are ignored so the live runtime does not continue to depend on them.
    if (!raw) return bootstrapLegacyLocalState(createEmptyStore());
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return bootstrapLegacyLocalState(createEmptyStore());
    const loaded = {
      ...createEmptyStore(),
      ...parsed,
    } satisfies TelemetryStore;
    return normalizeStoreModes(loaded);
  } catch {
    return bootstrapLegacyLocalState(createEmptyStore());
  }
}

function persistStore(store: TelemetryStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

let telemetryStore = loadStore();
if (typeof window !== "undefined") {
  persistStore(telemetryStore);
}
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

function upsertId(list: string[], id: string) {
  if (!list.includes(id)) {
    list.push(id);
  }
}

function updateStore(mutator: (draft: TelemetryStore) => void) {
  const draft = cloneStore(telemetryStore);
  mutator(draft);
  telemetryStore = draft;
  persistStore(telemetryStore);
  emit();
}

function deriveMatchWinner(score: { you: number; ai: number }): MatchWinner {
  if (score.you > score.ai) return "player";
  if (score.ai > score.you) return "ai";
  return "tie";
}

export interface LegacyPlayerInput {
  id: string;
  playerName: string;
  grade: string;
  school?: string;
  priorExperience?: string;
  consent?: {
    agreed?: boolean;
    timestamp?: string;
    consentTextVersion?: string;
  };
  needsReview?: boolean;
}

export interface LegacyStatsProfileInput {
  id: string;
  playerId: string;
  name: string;
  createdAt: string;
  trainingCount: number;
  trained: boolean;
  predictorDefault: boolean;
  seenPostTrainingCTA: boolean;
  baseName: string;
  version: number;
  previousProfileId?: string | null;
  nextProfileId?: string | null;
  preferences: {
    gameplay: GameplayPreferenceSnapshot;
  };
}

export interface LegacyRoundInput {
  id: string;
  sessionId: string;
  matchId?: string;
  playerId: string;
  profileId: string;
  t: string;
  mode: Mode;
  bestOf: BestOf;
  difficulty: AIMode;
  player: Move;
  ai: Move;
  outcome: Outcome;
  policy: "mixer" | "heuristic";
  confidence: number;
  confidenceBucket: ConfidenceBucket;
  reason: string;
  decisionTimeMs?: number;
  streakAI: number;
  streakYou: number;
  mixer?: RoundRecord["mixer"];
  heuristic?: RoundRecord["heuristic"];
}

export interface LegacyMatchInput {
  id: string;
  clientId?: string;
  sessionId: string;
  playerId: string;
  profileId: string;
  startedAt: string;
  endedAt: string;
  mode: Mode;
  bestOf: BestOf;
  difficulty: AIMode;
  score: { you: number; ai: number };
  rounds: number;
  aiWinRate: number;
  youSwitchedRate: number;
  notes?: string;
  leaderboardScore?: number;
  leaderboardMaxStreak?: number;
  leaderboardRoundCount?: number;
  leaderboardTimerBonus?: number;
  leaderboardBeatConfidenceBonus?: number;
  leaderboardType?: "Challenge" | "Practice Legacy";
}

function toTelemetryProfile(
  player: LegacyPlayerInput | AppPlayerRecord | undefined,
  profile: LegacyStatsProfileInput,
  updatedAt = new Date().toISOString(),
): PlayerProfile {
  const normalizedPreferences = normalizeTelemetryProfilePreferences(profile.preferences);
  return {
    id: profile.id,
    playerId: profile.playerId,
    sourcePlayerId: profile.playerId,
    name: profile.name,
    createdAt: profile.createdAt,
    updatedAt,
    playerName: player?.playerName ?? "Player",
    grade: player?.grade ?? "Not applicable",
    school: player?.school,
    priorExperience: player?.priorExperience,
    trainingCount: profile.trainingCount,
    trained: profile.trained,
    predictorDefault: profile.predictorDefault,
    seenPostTrainingCTA: profile.seenPostTrainingCTA,
    baseName: profile.baseName,
    version: profile.version,
    previousProfileId: profile.previousProfileId ?? null,
    nextProfileId: profile.nextProfileId ?? null,
    preferences: {
      aiDifficulty: normalizedPreferences.gameplay.aiDifficulty,
      bestOf: normalizedPreferences.gameplay.bestOf,
    },
    consentAgreed: player?.consent?.agreed,
    consentTimestamp: player?.consent?.timestamp,
    consentTextVersion: player?.consent?.consentTextVersion,
    needsReview: player?.needsReview,
  };
}

function toTelemetryPrediction(round: LegacyRoundInput): AIPredictionRecord | null {
  if (!shouldCreateCanonicalPrediction(round.mode)) return null;
  const predictionId = `pred-${round.id}`;
  return {
    id: predictionId,
    sessionId: round.sessionId,
    matchId: round.matchId,
    roundId: round.id,
    playerId: round.playerId,
    profileId: round.profileId,
    timestamp: round.t,
    mode: toTelemetryMode(round.mode),
    difficulty: round.difficulty,
    policy: round.policy,
    confidence: round.confidence,
    confidenceBucket: round.confidenceBucket,
    reason: round.reason,
    predictedPlayerMove: round.heuristic?.predicted ?? null,
    counterMoveChosen: round.mixer?.counter ?? null,
    chosenAiMove: round.ai,
    mixerDist: round.mixer?.dist,
    topExperts: round.mixer?.topExperts,
    realtimeWeight: round.mixer?.realtimeWeight,
    historyWeight: round.mixer?.historyWeight,
    realtimeRounds: round.mixer?.realtimeRounds,
    historyRounds: round.mixer?.historyRounds,
    conflict: round.mixer?.conflict,
    heuristicConfidence: round.heuristic?.conf ?? null,
  };
}

function toTelemetryRound(round: LegacyRoundInput): RoundRecord {
  const inferredRoundNumber =
    typeof round.matchId === "string" && round.matchId.trim()
      ? 0
      : 1;
  const predictionId = shouldCreateCanonicalPrediction(round.mode) ? `pred-${round.id}` : undefined;
  return {
    id: round.id,
    sessionId: round.sessionId,
    matchId: round.matchId,
    playerId: round.playerId,
    profileId: round.profileId,
    timestamp: round.t,
    roundNumber: inferredRoundNumber,
    mode: toTelemetryMode(round.mode),
    bestOf: round.bestOf,
    difficulty: round.difficulty,
    player: round.player,
    ai: round.ai,
    outcome: round.outcome,
    policy: round.policy,
    confidence: round.confidence,
    confidenceBucket: round.confidenceBucket,
    reason: round.reason,
    decisionTimeMs: round.decisionTimeMs,
    streakAI: round.streakAI,
    streakYou: round.streakYou,
    predictionId,
    mixer: round.mixer,
    heuristic: round.heuristic,
  };
}

function recomputeMatchRoundNumbers(store: TelemetryStore, matchId: string) {
  const ordered = store.roundIds
    .map(id => store.roundsById[id])
    .filter((round): round is RoundRecord => Boolean(round) && round.matchId === matchId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  ordered.forEach((round, index) => {
    store.roundsById[round.id] = { ...round, roundNumber: index + 1 };
  });
}

function cascadeDeleteProfile(store: TelemetryStore, profileId: string) {
  const profile = store.playersById[profileId];
  if (!profile) return;

  Object.values(store.playersById).forEach(existing => {
    if (!existing || existing.id === profileId) return;
    if (existing.previousProfileId === profileId || existing.nextProfileId === profileId) {
      store.playersById[existing.id] = {
        ...existing,
        previousProfileId: existing.previousProfileId === profileId ? null : existing.previousProfileId,
        nextProfileId: existing.nextProfileId === profileId ? null : existing.nextProfileId,
      };
    }
  });

  delete store.playersById[profileId];
  store.playerIds = store.playerIds.filter(id => id !== profileId);
  delete store.profilePreferencesById[profileId];
  delete store.modelStatesByProfileId[profileId];

  const matchIdsToDelete = store.matchIds.filter(id => store.matchesById[id]?.profileId === profileId);
  matchIdsToDelete.forEach(matchId => {
    delete store.matchesById[matchId];
  });
  store.matchIds = store.matchIds.filter(id => !matchIdsToDelete.includes(id));

  const roundIdsToDelete = store.roundIds.filter(id => store.roundsById[id]?.profileId === profileId);
  roundIdsToDelete.forEach(roundId => {
    const predictionId = store.roundsById[roundId]?.predictionId;
    delete store.roundsById[roundId];
    if (predictionId) {
      delete store.predictionsById[predictionId];
    }
  });
  store.roundIds = store.roundIds.filter(id => !roundIdsToDelete.includes(id));

  const predictionIdsToDelete = store.predictionIds.filter(id => store.predictionsById[id]?.profileId === profileId);
  predictionIdsToDelete.forEach(predictionId => {
    delete store.predictionsById[predictionId];
  });
  store.predictionIds = store.predictionIds.filter(id => !predictionIdsToDelete.includes(id));

  const sessionIdsToDelete = store.sessionIds.filter(id => (store.sessionsById[id]?.profileId ?? null) === profileId);
  sessionIdsToDelete.forEach(sessionId => {
    delete store.sessionsById[sessionId];
  });
  store.sessionIds = store.sessionIds.filter(id => !sessionIdsToDelete.includes(id));

  const uiEventIdsToDelete = store.uiEventIds.filter(id => {
    const event = store.uiEventsById[id];
    if (!event) return false;
    return (
      (event.profileId ?? null) === profileId ||
      (event.matchId ? matchIdsToDelete.includes(event.matchId) : false) ||
      (event.roundId ? roundIdsToDelete.includes(event.roundId) : false) ||
      sessionIdsToDelete.includes(event.sessionId)
    );
  });
  uiEventIdsToDelete.forEach(eventId => {
    delete store.uiEventsById[eventId];
  });
  store.uiEventIds = store.uiEventIds.filter(id => !uiEventIdsToDelete.includes(id));

  if (store.currentProfileId === profileId) {
    const fallbackProfile = store.playerIds
      .map(id => store.playersById[id])
      .find(candidate => candidate?.playerId === profile.playerId);
    store.currentProfileId = fallbackProfile?.id ?? null;
  }
}

function cascadeDeletePlayer(store: TelemetryStore, playerId: string) {
  const profileIds = store.playerIds.filter(id => store.playersById[id]?.playerId === playerId);
  profileIds.forEach(profileId => cascadeDeleteProfile(store, profileId));

  delete store.appPlayersById[playerId];
  store.appPlayerIds = store.appPlayerIds.filter(id => id !== playerId);

  const orphanSessionIds = store.sessionIds.filter(id => store.sessionsById[id]?.playerId === playerId);
  orphanSessionIds.forEach(sessionId => {
    delete store.sessionsById[sessionId];
  });
  store.sessionIds = store.sessionIds.filter(id => !orphanSessionIds.includes(id));

  const orphanEventIds = store.uiEventIds.filter(id => store.uiEventsById[id]?.playerId === playerId);
  orphanEventIds.forEach(eventId => {
    delete store.uiEventsById[eventId];
  });
  store.uiEventIds = store.uiEventIds.filter(id => !orphanEventIds.includes(id));

  if (store.currentPlayerId === playerId) {
    store.currentPlayerId = null;
    store.currentProfileId = null;
  }
}

export const telemetryService = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getStore(): TelemetryStore {
    return telemetryStore;
  },
  upsertAppPlayer(player: LegacyPlayerInput | AppPlayerRecord) {
    updateStore(draft => {
      const next: AppPlayerRecord = {
        id: player.id,
        playerName: player.playerName,
        grade: player.grade,
        school: player.school,
        priorExperience: player.priorExperience,
        consent: player.consent
          ? {
              agreed: player.consent.agreed !== false,
              timestamp: player.consent.timestamp,
              consentTextVersion: player.consent.consentTextVersion ?? "v1",
            }
          : undefined,
        needsReview: Boolean(player.needsReview),
      };
      draft.appPlayersById[next.id] = next;
      upsertId(draft.appPlayerIds, next.id);
    });
  },
  deleteAppPlayer(playerId: string) {
    updateStore(draft => {
      cascadeDeletePlayer(draft, playerId);
    });
  },
  setCurrentPlayer(playerId: string | null) {
    updateStore(draft => {
      draft.currentPlayerId = playerId;
      if (!playerId) {
        draft.currentProfileId = null;
      }
    });
  },
  setCurrentProfile(profileId: string | null) {
    updateStore(draft => {
      draft.currentProfileId = profileId;
    });
  },
  upsertPlayerProfile(player: LegacyPlayerInput | undefined, profile: LegacyStatsProfileInput) {
    updateStore(draft => {
      const next = toTelemetryProfile(player, profile);
      draft.playersById[next.id] = next;
      upsertId(draft.playerIds, next.id);
      draft.profilePreferencesById[next.id] = normalizeTelemetryProfilePreferences(profile.preferences);
    });
  },
  upsertPredictorModelState(state: PredictorModelStateRecord) {
    updateStore(draft => {
      draft.modelStatesByProfileId[state.profileId] = state;
    });
  },
  deletePredictorModelState(profileId: string) {
    updateStore(draft => {
      delete draft.modelStatesByProfileId[profileId];
    });
  },
  deleteProfile(profileId: string) {
    updateStore(draft => {
      cascadeDeleteProfile(draft, profileId);
    });
  },
  startSession(input: Omit<GameSession, "updatedAt" | "status" | "source"> & { source?: GameSession["source"] }) {
    updateStore(draft => {
      const next: GameSession = {
        ...input,
        updatedAt: new Date().toISOString(),
        status: "active",
        source: input.source ?? "play-app",
      };
      draft.sessionsById[next.id] = next;
      upsertId(draft.sessionIds, next.id);
    });
  },
  endSession(sessionId: string, endedAt = new Date().toISOString()) {
    updateStore(draft => {
      const current = draft.sessionsById[sessionId];
      if (!current) return;
      if (current.status === "ended" && current.endedAt) return;
      draft.sessionsById[sessionId] = {
        ...current,
        updatedAt: endedAt,
        endedAt,
        status: "ended",
      };
    });
  },
  logPrediction(prediction: AIPredictionRecord) {
    updateStore(draft => {
      draft.predictionsById[prediction.id] = prediction;
      upsertId(draft.predictionIds, prediction.id);
    });
  },
  logRound(round: LegacyRoundInput) {
    updateStore(draft => {
      const prediction = toTelemetryPrediction(round);
      if (prediction) {
        draft.predictionsById[prediction.id] = prediction;
        upsertId(draft.predictionIds, prediction.id);
      }

      const nextRound = toTelemetryRound(round);
      draft.roundsById[nextRound.id] = nextRound;
      upsertId(draft.roundIds, nextRound.id);
      if (nextRound.matchId) {
        recomputeMatchRoundNumbers(draft, nextRound.matchId);
      }
    });
  },
  upsertRound(round: UpsertableRoundRecord) {
    updateStore(draft => {
      const normalizedMode = toTelemetryMode(round.mode);
      draft.roundsById[round.id] = {
        ...round,
        mode: normalizedMode,
        predictionId: normalizedMode === "challenge" ? round.predictionId : undefined,
      };
      upsertId(draft.roundIds, round.id);
      if (normalizedMode !== "challenge") {
        const predictionId = round.predictionId;
        if (predictionId) {
          delete draft.predictionsById[predictionId];
          draft.predictionIds = draft.predictionIds.filter(id => id !== predictionId);
        }
      }
      if (round.matchId) {
        recomputeMatchRoundNumbers(draft, round.matchId);
      }
    });
  },
  deleteRound(roundId: string) {
    updateStore(draft => {
      const current = draft.roundsById[roundId];
      if (!current) return;
      delete draft.roundsById[roundId];
      draft.roundIds = draft.roundIds.filter(id => id !== roundId);
      if (current.predictionId) {
        delete draft.predictionsById[current.predictionId];
        draft.predictionIds = draft.predictionIds.filter(id => id !== current.predictionId);
      }
      if (current.matchId) {
        recomputeMatchRoundNumbers(draft, current.matchId);
      }
    });
  },
  logMatch(match: LegacyMatchInput) {
    updateStore(draft => {
      const telemetryMatchId = match.clientId ?? match.id;
      const next: MatchRecord = {
        ...match,
        id: telemetryMatchId,
        sourceMatchId: match.id,
        mode: toTelemetryMode(match.mode),
        roundsPlayed: match.rounds,
        winner: deriveMatchWinner(match.score),
        completed: true,
        status: "completed",
      };
      draft.matchesById[next.id] = next;
      upsertId(draft.matchIds, next.id);

      const session = draft.sessionsById[next.sessionId];
      if (session) {
        draft.sessionsById[next.sessionId] = {
          ...session,
          activeMatchId: null,
          updatedAt: next.endedAt,
        };
      }
      recomputeMatchRoundNumbers(draft, telemetryMatchId);
    });
  },
  upsertMatch(match: UpsertableMatchRecord) {
    updateStore(draft => {
      const normalizedMode = toTelemetryMode(match.mode);
      draft.matchesById[match.id] = {
        ...match,
        mode: normalizedMode,
      };
      upsertId(draft.matchIds, match.id);
      const session = draft.sessionsById[match.sessionId];
      if (session) {
        draft.sessionsById[match.sessionId] = {
          ...session,
          activeMatchId: match.status === "active" ? match.id : null,
          updatedAt: match.endedAt,
        };
      }
      recomputeMatchRoundNumbers(draft, match.id);
    });
  },
  deleteMatch(matchId: string) {
    updateStore(draft => {
      delete draft.matchesById[matchId];
      draft.matchIds = draft.matchIds.filter(id => id !== matchId);
      draft.roundIds.forEach(roundId => {
        const current = draft.roundsById[roundId];
        if (current?.matchId === matchId) {
          draft.roundsById[roundId] = { ...current, matchId: undefined, roundNumber: 1 };
        }
      });
    });
  },
  logUIEvent(event: Omit<UIEventRecord, "id"> & { id?: string }) {
    updateStore(draft => {
      const next: UIEventRecord = {
        ...event,
        id: event.id ?? `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      };
      draft.uiEventsById[next.id] = next;
      upsertId(draft.uiEventIds, next.id);
    });
  },
  buildLegacyRoundsCsv(input: { profileId?: string | null; playerId?: string | null }) {
    const headers = [
      "playerId",
      "playerName",
      "grade",
      "school",
      "priorExperience",
      "profileName",
      "timestamp",
      "mode",
      "bestOf",
      "difficulty",
      "player",
      "ai",
      "outcome",
      "policy",
      "confidence",
      "decisionTimeMs",
      "streakAI",
      "streakYou",
    ];
    const lines = [headers.join(",")];
    telemetryStore.roundIds
      .map(id => telemetryStore.roundsById[id])
      .filter((round): round is RoundRecord => Boolean(round))
      .filter(round => !input.playerId || round.playerId === input.playerId)
      .filter(round => !input.profileId || round.profileId === input.profileId)
      .forEach(round => {
        const profile = telemetryStore.playersById[round.profileId];
        lines.push([
          csvCell(round.playerId),
          csvCell(profile?.playerName ?? ""),
          csvCell(profile?.grade ?? ""),
          csvCell(profile?.school ?? ""),
          csvCell(profile?.priorExperience ?? ""),
          csvCell(profile?.name ?? ""),
          csvCell(round.timestamp),
          csvCell(round.mode),
          csvCell(round.bestOf),
          csvCell(round.difficulty),
          csvCell(round.player),
          csvCell(round.ai),
          csvCell(round.outcome),
          csvCell(round.policy),
          csvCell(round.confidence.toFixed(2)),
          csvCell(round.decisionTimeMs ?? ""),
          csvCell(round.streakAI),
          csvCell(round.streakYou),
        ].join(","));
      });
    return lines.join("\n");
  },
  buildProfilesCsv() {
    const headers = [
      "profileId", "playerId", "playerName", "profileName", "createdAt", "grade", "school",
      "priorExperience", "trainingCount", "trained", "predictorDefault", "baseName", "version",
      "preferredBestOf", "preferredDifficulty",
    ];
    const lines = [headers.join(",")];
    telemetryStore.playerIds.map(id => telemetryStore.playersById[id]).filter(Boolean).forEach(profile => {
      lines.push([
        csvCell(profile.id), csvCell(profile.playerId), csvCell(profile.playerName), csvCell(profile.name),
        csvCell(profile.createdAt), csvCell(profile.grade), csvCell(profile.school), csvCell(profile.priorExperience),
        csvCell(profile.trainingCount), csvCell(profile.trained), csvCell(profile.predictorDefault),
        csvCell(profile.baseName), csvCell(profile.version), csvCell(profile.preferences.bestOf),
        csvCell(profile.preferences.aiDifficulty),
      ].join(","));
    });
    return lines.join("\n");
  },
  buildSessionsCsv() {
    const headers = ["sessionId", "playerId", "profileId", "startedAt", "updatedAt", "endedAt", "status", "source", "initialRoute", "activeMatchId"];
    const lines = [headers.join(",")];
    telemetryStore.sessionIds.map(id => telemetryStore.sessionsById[id]).filter(Boolean).forEach(session => {
      lines.push([
        csvCell(session.id), csvCell(session.playerId), csvCell(session.profileId), csvCell(session.startedAt),
        csvCell(session.updatedAt), csvCell(session.endedAt), csvCell(session.status), csvCell(session.source),
        csvCell(session.initialRoute), csvCell(session.activeMatchId),
      ].join(","));
    });
    return lines.join("\n");
  },
  buildMatchesCsv() {
    const headers = [
      "matchId", "sourceMatchId", "sessionId", "playerId", "profileId", "mode", "bestOf", "difficulty",
      "startedAt", "endedAt", "status", "completed", "winner", "scoreYou", "scoreAI", "rounds", "roundsPlayed",
      "aiWinRate", "youSwitchedRate", "leaderboardScore",
    ];
    const lines = [headers.join(",")];
    telemetryStore.matchIds.map(id => telemetryStore.matchesById[id]).filter(Boolean).forEach(match => {
      lines.push([
        csvCell(match.id), csvCell(match.sourceMatchId), csvCell(match.sessionId), csvCell(match.playerId),
        csvCell(match.profileId), csvCell(match.mode), csvCell(match.bestOf), csvCell(match.difficulty),
        csvCell(match.startedAt), csvCell(match.endedAt), csvCell(match.status), csvCell(match.completed),
        csvCell(match.winner), csvCell(match.score.you), csvCell(match.score.ai), csvCell(match.rounds),
        csvCell(match.roundsPlayed), csvCell(match.aiWinRate), csvCell(match.youSwitchedRate), csvCell(match.leaderboardScore),
      ].join(","));
    });
    return lines.join("\n");
  },
  buildRoundsCsv() {
    const headers = [
      "roundId", "sessionId", "matchId", "predictionId", "playerId", "profileId", "timestamp", "roundNumber",
      "mode", "bestOf", "difficulty", "player", "ai", "outcome", "policy", "confidence",
      "confidenceBucket", "reason", "decisionTimeMs", "streakAI", "streakYou",
    ];
    const lines = [headers.join(",")];
    telemetryStore.roundIds.map(id => telemetryStore.roundsById[id]).filter(Boolean).forEach(round => {
      lines.push([
        csvCell(round.id), csvCell(round.sessionId), csvCell(round.matchId), csvCell(round.predictionId),
        csvCell(round.playerId), csvCell(round.profileId), csvCell(round.timestamp), csvCell(round.roundNumber),
        csvCell(round.mode), csvCell(round.bestOf), csvCell(round.difficulty), csvCell(round.player),
        csvCell(round.ai), csvCell(round.outcome), csvCell(round.policy), csvCell(round.confidence),
        csvCell(round.confidenceBucket), csvCell(round.reason), csvCell(round.decisionTimeMs), csvCell(round.streakAI),
        csvCell(round.streakYou),
      ].join(","));
    });
    return lines.join("\n");
  },
  buildPredictionsCsv() {
    const headers = [
      "predictionId", "sessionId", "matchId", "roundId", "playerId", "profileId", "timestamp", "mode", "difficulty",
      "policy", "confidence", "confidenceBucket", "reason", "predictedPlayerMove", "counterMoveChosen",
      "chosenAiMove", "realtimeWeight", "historyWeight", "realtimeRounds", "historyRounds",
    ];
    const lines = [headers.join(",")];
    telemetryStore.predictionIds.map(id => telemetryStore.predictionsById[id]).filter(Boolean).forEach(prediction => {
      lines.push([
        csvCell(prediction.id), csvCell(prediction.sessionId), csvCell(prediction.matchId), csvCell(prediction.roundId),
        csvCell(prediction.playerId), csvCell(prediction.profileId), csvCell(prediction.timestamp), csvCell(prediction.mode),
        csvCell(prediction.difficulty), csvCell(prediction.policy), csvCell(prediction.confidence),
        csvCell(prediction.confidenceBucket), csvCell(prediction.reason), csvCell(prediction.predictedPlayerMove),
        csvCell(prediction.counterMoveChosen), csvCell(prediction.chosenAiMove), csvCell(prediction.realtimeWeight),
        csvCell(prediction.historyWeight), csvCell(prediction.realtimeRounds), csvCell(prediction.historyRounds),
      ].join(","));
    });
    return lines.join("\n");
  },
  buildEventsCsv() {
    const headers = ["eventId", "sessionId", "timestamp", "playerId", "profileId", "matchId", "roundId", "surface", "action", "value", "detail", "meta"];
    const lines = [headers.join(",")];
    telemetryStore.uiEventIds.map(id => telemetryStore.uiEventsById[id]).filter(Boolean).forEach(event => {
      lines.push([
        csvCell(event.id), csvCell(event.sessionId), csvCell(event.timestamp), csvCell(event.playerId),
        csvCell(event.profileId), csvCell(event.matchId), csvCell(event.roundId), csvCell(event.surface),
        csvCell(event.action), csvCell(event.value), csvCell(event.detail), csvCell(event.meta ? JSON.stringify(event.meta) : ""),
      ].join(","));
    });
    return lines.join("\n");
  },
};

export function useTelemetryStore() {
  const store = useSyncExternalStore(telemetryService.subscribe, telemetryService.getStore, telemetryService.getStore);

  const appPlayers = store.appPlayerIds.map(id => store.appPlayersById[id]).filter(Boolean);
  const profiles = store.playerIds.map(id => store.playersById[id]).filter(Boolean);
  const sessions = store.sessionIds.map(id => store.sessionsById[id]).filter(Boolean);
  const matches = store.matchIds.map(id => store.matchesById[id]).filter(Boolean);
  const rounds = store.roundIds.map(id => store.roundsById[id]).filter(Boolean);
  const predictions = store.predictionIds.map(id => store.predictionsById[id]).filter(Boolean);
  const uiEvents = store.uiEventIds.map(id => store.uiEventsById[id]).filter(Boolean);
  const modelStates = Object.values(store.modelStatesByProfileId);

  return {
    store,
    appPlayers,
    profiles,
    sessions,
    matches,
    rounds,
    predictions,
    uiEvents,
    modelStates,
    currentPlayerId: store.currentPlayerId,
    currentProfileId: store.currentProfileId,
  };
}
