import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AIMode, BestOf, Mode, Move, Outcome } from "./gameTypes";
import { usePlayers } from "./players";
import { usePlayMode, type PlayMode } from "./lib/playMode";
import { cloudDataService } from "./lib/cloudData";

export type SerializedExpertState =
  | { type: "FrequencyExpert"; window: number; alpha: number }
  | { type: "RecencyExpert"; gamma: number; alpha: number }
  | {
      type: "MarkovExpert";
      order: number;
      alpha: number;
      table: Array<[string, { rock: number; paper: number; scissors: number }]>;
    }
  | {
      type: "OutcomeExpert";
      alpha: number;
      byOutcome: {
        win: { rock: number; paper: number; scissors: number };
        lose: { rock: number; paper: number; scissors: number };
        tie: { rock: number; paper: number; scissors: number };
      };
    }
  | {
      type: "WinStayLoseShiftExpert";
      alpha: number;
      table: Array<[string, { rock: number; paper: number; scissors: number }]>;
    }
  | {
      type: "PeriodicExpert";
      maxPeriod: number;
      minPeriod: number;
      window: number;
      confident: number;
    }
  | {
      type: "BaitResponseExpert";
      alpha: number;
      table: {
        rock: { rock: number; paper: number; scissors: number };
        paper: { rock: number; paper: number; scissors: number };
        scissors: { rock: number; paper: number; scissors: number };
      };
    };

export interface HedgeMixerSerializedState {
  eta: number;
  weights: number[];
  experts: SerializedExpertState[];
}

export interface StoredPredictorModelState {
  profileId: string;
  modelVersion: number;
  updatedAt: string;
  roundsSeen: number;
  state: HedgeMixerSerializedState;
}

export type DecisionPolicy = "mixer" | "heuristic";

export interface ExpertSample {
  name: string;
  weight: number;
  pActual?: number;
}

export interface MixerTrace {
  dist: Record<Move, number>;
  counter: Move;
  topExperts: ExpertSample[];
  confidence: number;
  realtimeWeight?: number;
  historyWeight?: number;
  realtimeTopExperts?: ExpertSample[];
  historyTopExperts?: ExpertSample[];
  realtimeRounds?: number;
  historyRounds?: number;
  conflict?: { realtime: Move | null; history: Move | null } | null;
}

export interface HeuristicTrace {
  predicted?: Move | null;
  conf?: number | null;
  reason?: string;
}

export interface RoundLog {
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
  policy: DecisionPolicy;
  mixer?: MixerTrace;
  heuristic?: HeuristicTrace;
  streakAI: number;
  streakYou: number;
  reason: string;
  confidence: number;
  confidenceBucket: "low" | "medium" | "high";
  decisionTimeMs?: number;
}

export interface MatchSummary {
  id: string;
  sessionId: string;
  clientId?: string;
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

export interface StatsProfile {
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
}

type StatsProfileUpdate = Partial<
  Pick<
    StatsProfile,
    | "name"
    | "trainingCount"
    | "trained"
    | "predictorDefault"
    | "seenPostTrainingCTA"
    | "baseName"
    | "version"
    | "previousProfileId"
    | "nextProfileId"
  >
>;

interface StatsContextValue {
  rounds: RoundLog[];
  matches: MatchSummary[];
  sessionId: string;
  currentProfileId: string | null;
  currentProfile: StatsProfile | null;
  profiles: StatsProfile[];
  logRound: (round: Omit<RoundLog, "id" | "sessionId" | "playerId" | "profileId">) => RoundLog | null;
  logMatch: (match: Omit<MatchSummary, "id" | "sessionId" | "playerId" | "profileId">) => MatchSummary | null;
  selectProfile: (id: string) => void;
  createProfile: (playerIdOverride?: string) => StatsProfile | null;
  updateProfile: (id: string, patch: StatsProfileUpdate) => void;
  forkProfileVersion: (id: string) => StatsProfile | null;
  exportRoundsCsv: () => string;
  getModelStateForProfile: (profileId: string) => StoredPredictorModelState | null;
  saveModelStateForProfile: (profileId: string, state: StoredPredictorModelState) => void;
  clearModelStateForProfile: (profileId: string) => void;
  adminRounds: RoundLog[];
  adminMatches: MatchSummary[];
  adminProfiles: StatsProfile[];
  adminUpdateRound: (id: string, patch: Partial<RoundLog>) => void;
  adminDeleteRound: (id: string) => void;
  adminUpdateMatch: (id: string, patch: Partial<MatchSummary>) => void;
  adminDeleteMatch: (id: string) => void;
}

const StatsContext = createContext<StatsContextValue | null>(null);

const ROUND_KEY = "rps_stats_rounds_v1";
const MATCH_KEY = "rps_stats_matches_v1";
const PROFILE_KEY = "rps_stats_profiles_v1";
const CURRENT_PROFILE_KEY = "rps_current_stats_profile_v1";
const MODEL_STATE_KEY = "rps_predictor_models_v1";
const MAX_ROUNDS = 1000;
const PRIMARY_BASE = "primary";
const PRACTICE_LEGACY_TYPE = "Practice Legacy" as const;

type StorageScope = "local" | "session";

function getScopedStorage(scope: StorageScope): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return scope === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function resolveScopeFromMode(mode: PlayMode): StorageScope {
  return mode === "cloud" ? "session" : "local";
}

function formatLineageBaseName(index: number): string {
  const normalizedIndex = Number.isFinite(index) ? Math.max(1, Math.floor(index)) : 1;
  return normalizedIndex <= 1 ? PRIMARY_BASE : `${PRIMARY_BASE} ${normalizedIndex}`;
}

function normalizeBaseName(name: string): string {
  const trimmed = (name ?? "").replace(/\s+v\d+$/i, "").trim();
  if (!trimmed) return PRIMARY_BASE;
  const primaryMatch = trimmed.match(/^primary(?:\s+(\d+))?$/i);
  if (primaryMatch) {
    const parsed = primaryMatch[1] ? Number.parseInt(primaryMatch[1], 10) : 1;
    return formatLineageBaseName(parsed || 1);
  }
  return trimmed;
}

function makeProfileDisplayName(baseName: string, version: number): string {
  const normalizedBase = normalizeBaseName(baseName);
  if (version <= 1) return normalizedBase;
  return `${normalizedBase} v${version}`;
}

function getLineageIndex(baseName: string): number {
  const match = normalizeBaseName(baseName).match(/^primary(?:\s+(\d+))?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const parsed = match[1] ? Number.parseInt(match[1], 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function loadFromStorage<T>(storage: Storage | null, key: string): T[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to read stats", err);
    return [];
  }
}

function saveToStorage(storage: Storage | null, key: string, value: unknown) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("Failed to persist stats", err);
  }
}

function loadModelStates(storage: Storage | null): StoredPredictorModelState[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(MODEL_STATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: StoredPredictorModelState | any): StoredPredictorModelState | null => {
        if (!item || typeof item !== "object") return null;
        const profileId = typeof item.profileId === "string" ? item.profileId : null;
        const modelVersion = Number.isFinite(item.modelVersion) ? Math.floor(item.modelVersion) : null;
        const updatedAt = typeof item.updatedAt === "string" ? item.updatedAt : null;
        const roundsSeen = Number.isFinite(item.roundsSeen) ? Number(item.roundsSeen) : 0;
        const state = item.state && typeof item.state === "object" ? item.state : null;
        if (!profileId || modelVersion == null || !state) return null;
        const eta = Number.isFinite(state.eta) ? Number(state.eta) : 1.6;
        const weights = Array.isArray(state.weights)
          ? state.weights.map((value: unknown) => (Number.isFinite(value) ? Number(value) : 1))
          : [];
        const experts = Array.isArray(state.experts) ? state.experts : [];
        return {
          profileId,
          modelVersion,
          updatedAt: updatedAt ?? new Date(0).toISOString(),
          roundsSeen,
          state: {
            eta,
            weights,
            experts: experts as SerializedExpertState[],
          },
        } satisfies StoredPredictorModelState;
      })
      .filter((entry): entry is StoredPredictorModelState => entry !== null);
  } catch (err) {
    console.warn("Failed to read predictor model state", err);
    return [];
  }
}

function saveModelStates(storage: Storage | null, states: StoredPredictorModelState[]) {
  if (!storage) return;
  try {
    storage.setItem(MODEL_STATE_KEY, JSON.stringify(states));
  } catch (err) {
    console.warn("Failed to persist predictor model state", err);
  }
}

function migrateMatchRecords(matches: MatchSummary[]): { matches: MatchSummary[]; changed: boolean } {
  let changed = false;
  const migrated = matches.map(match => {
    if (match.mode === "practice") {
      if (match.leaderboardType !== PRACTICE_LEGACY_TYPE) {
        changed = true;
        return { ...match, leaderboardType: PRACTICE_LEGACY_TYPE } satisfies MatchSummary;
      }
      return match;
    }
    if (match.mode === "challenge" && match.leaderboardType && match.leaderboardType !== "Challenge") {
      changed = true;
      return { ...match, leaderboardType: "Challenge" } satisfies MatchSummary;
    }
    return match;
  });
  return { matches: migrated, changed };
}

function loadProfiles(storage: Storage | null): StatsProfile[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(PROFILE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: StatsProfile | any) => {
      const fallbackName = typeof item?.name === "string" ? item.name : PRIMARY_BASE;
      const baseName = normalizeBaseName(typeof item?.baseName === "string" ? item.baseName : fallbackName);
      const version = (() => {
        if (typeof item?.version === "number" && Number.isFinite(item.version)) {
          return Math.max(1, Math.floor(item.version));
        }
        const match = fallbackName.match(/ v(\d+)$/i);
        if (match) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        return 1;
      })();
      return {
        id: typeof item?.id === "string" ? item.id : makeId("profile"),
        playerId: typeof item?.playerId === "string" ? item.playerId : "",
        baseName,
        version,
        name: makeProfileDisplayName(baseName, version),
        createdAt: typeof item?.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        trainingCount: typeof item?.trainingCount === "number" ? item.trainingCount : 0,
        trained: Boolean(item?.trained),
        predictorDefault: item?.predictorDefault !== undefined ? Boolean(item.predictorDefault) : false,
        seenPostTrainingCTA: item?.seenPostTrainingCTA !== undefined ? Boolean(item.seenPostTrainingCTA) : false,
        previousProfileId: typeof item?.previousProfileId === "string" ? item.previousProfileId : null,
        nextProfileId: typeof item?.nextProfileId === "string" ? item.nextProfileId : null,
      } satisfies StatsProfile;
    });
  } catch (err) {
    console.warn("Failed to read stats profiles", err);
    return [];
  }
}

function saveProfiles(storage: Storage | null, profiles: StatsProfile[]) {
  if (!storage) return;
  try {
    storage.setItem(PROFILE_KEY, JSON.stringify(profiles));
  } catch (err) {
    console.warn("Failed to persist stats profiles", err);
  }
}

function loadCurrentProfileId(storage: Storage | null): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(CURRENT_PROFILE_KEY);
  } catch (err) {
    console.warn("Failed to read current stats profile", err);
    return null;
  }
}

function saveCurrentProfileId(storage: Storage | null, id: string | null) {
  if (!storage) return;
  try {
    if (id) storage.setItem(CURRENT_PROFILE_KEY, id);
    else storage.removeItem(CURRENT_PROFILE_KEY);
  } catch (err) {
    console.warn("Failed to persist current stats profile", err);
  }
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return prefix + "-" + (crypto as any).randomUUID();
  }
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export function StatsProvider({ children }: { children: React.ReactNode }) {
  const { mode } = usePlayMode();
  const isCloudMode = mode === "cloud";
  const storageScope = useMemo<StorageScope | null>(() => (isCloudMode ? null : resolveScopeFromMode(mode)), [isCloudMode, mode]);
  const storage = useMemo(() => (storageScope ? getScopedStorage(storageScope) : null), [storageScope]);

  const [allRounds, setAllRounds] = useState<RoundLog[]>([]);
  const [allMatches, setAllMatches] = useState<MatchSummary[]>([]);
  const [profiles, setProfiles] = useState<StatsProfile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [roundsDirty, setRoundsDirty] = useState(false);
  const [matchesDirty, setMatchesDirty] = useState(false);
  const [profilesDirty, setProfilesDirty] = useState(false);
  const [modelStates, setModelStates] = useState<StoredPredictorModelState[]>([]);
  const [modelStatesDirty, setModelStatesDirty] = useState(false);
  const sessionIdRef = useRef<string>("");
  const { currentPlayerId, currentPlayer } = usePlayers();

  useEffect(() => {
    if (isCloudMode) return;
    setAllRounds(loadFromStorage<RoundLog>(storage, ROUND_KEY));
    const loadedMatches = loadFromStorage<MatchSummary>(storage, MATCH_KEY);
    const migrated = migrateMatchRecords(loadedMatches);
    if (migrated.changed) {
      saveToStorage(storage, MATCH_KEY, migrated.matches);
    }
    setAllMatches(migrated.matches);
    setProfiles(loadProfiles(storage));
    setCurrentProfileId(loadCurrentProfileId(storage));
    setModelStates(loadModelStates(storage));
    setRoundsDirty(false);
    setMatchesDirty(false);
    setProfilesDirty(false);
    setModelStatesDirty(false);
  }, [isCloudMode, storage]);

  useEffect(() => {
    if (!isCloudMode) return;
    const service = cloudDataService;
    if (!service) {
      console.warn("Cloud mode active but cloud data service is unavailable");
      setAllRounds([]);
      setAllMatches([]);
      setProfiles([]);
      setCurrentProfileId(null);
      setModelStates([]);
      setRoundsDirty(false);
      setMatchesDirty(false);
      setProfilesDirty(false);
      setModelStatesDirty(false);
      return;
    }
    const userId = currentPlayerId;
    if (!userId) {
      setAllRounds([]);
      setAllMatches([]);
      setProfiles([]);
      setCurrentProfileId(null);
      setModelStates([]);
      setRoundsDirty(false);
      setMatchesDirty(false);
      setProfilesDirty(false);
      setModelStatesDirty(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rawProfiles = await service.loadStatsProfiles(userId);
        let normalizedProfiles = rawProfiles.map(profile => {
          const baseName = normalizeBaseName(profile.baseName ?? profile.name);
          const rawVersion = profile.version ?? 1;
          const version =
            typeof rawVersion === "number" && Number.isFinite(rawVersion) ? Math.max(1, Math.floor(rawVersion)) : 1;
          return {
            ...profile,
            baseName,
            version,
            name: makeProfileDisplayName(baseName, version),
          } satisfies StatsProfile;
        });
        if (normalizedProfiles.length === 0) {
          const baseName = formatLineageBaseName(1);
          const createdAt = new Date().toISOString();
          const defaultProfile: StatsProfile = {
            id: makeId("profile"),
            playerId: userId,
            baseName,
            version: 1,
            name: makeProfileDisplayName(baseName, 1),
            createdAt,
            trainingCount: 0,
            trained: false,
            predictorDefault: true,
            seenPostTrainingCTA: false,
            previousProfileId: null,
            nextProfileId: null,
          };
          try {
            await service.upsertStatsProfile(defaultProfile);
          } catch (err) {
            console.error("Failed to seed default stats profile in cloud mode", err);
          }
          normalizedProfiles = [defaultProfile];
        }

        const roundsPromises = normalizedProfiles.map(profile => service.loadRounds(userId, profile.id));
        const matchesPromises = normalizedProfiles.map(profile => service.loadMatches(userId, profile.id));
        const modelPromises = normalizedProfiles.map(profile => service.loadAiState(userId, profile.id));
        const [roundGroups, matchGroups, modelGroup] = await Promise.all([
          Promise.all(roundsPromises),
          Promise.all(matchesPromises),
          Promise.all(modelPromises),
        ]);
        if (cancelled) return;

        const aggregatedRounds = roundGroups.flat();
        const rawMatches = matchGroups.flat();
        const migratedMatches = migrateMatchRecords(rawMatches);
        const aggregatedModelStates = modelGroup
          .filter((entry): entry is StoredPredictorModelState => Boolean(entry))
          .map(entry => ({ ...entry }));

        setProfiles(normalizedProfiles);
        setAllRounds(aggregatedRounds);
        setAllMatches(migratedMatches.matches);
        setModelStates(aggregatedModelStates);
        setRoundsDirty(false);
        setMatchesDirty(false);
        setProfilesDirty(false);
        setModelStatesDirty(false);

        setCurrentProfileId(prev => {
          if (prev && normalizedProfiles.some(profile => profile.id === prev)) {
            return prev;
          }
          const preferred = normalizedProfiles.find(profile => profile.predictorDefault) ?? normalizedProfiles[0] ?? null;
          return preferred?.id ?? null;
        });
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load cloud stats data", err);
          setAllRounds([]);
          setAllMatches([]);
          setProfiles([]);
          setModelStates([]);
          setCurrentProfileId(null);
          setRoundsDirty(false);
          setMatchesDirty(false);
          setProfilesDirty(false);
          setModelStatesDirty(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPlayerId, isCloudMode]);

  if (!sessionIdRef.current) {
    sessionIdRef.current = makeId("sess");
  }

  const sessionId = sessionIdRef.current;
  const playerProfiles = useMemo(() => {
    if (!currentPlayerId) return [] as StatsProfile[];
    const filtered = profiles.filter(p => p.playerId === currentPlayerId);
    const normalized = filtered.map(profile => {
      const baseName = normalizeBaseName(profile.baseName ?? profile.name);
      const rawVersion = profile.version;
      const version = typeof rawVersion === "number" && Number.isFinite(rawVersion) ? Math.max(1, Math.floor(rawVersion)) : 1;
      return {
        ...profile,
        baseName,
        version,
        name: makeProfileDisplayName(baseName, version),
      } satisfies StatsProfile;
    });
    normalized.sort((a, b) => {
      const indexDiff = getLineageIndex(a.baseName) - getLineageIndex(b.baseName);
      if (indexDiff !== 0) return indexDiff;
      const versionDiff = (b.version ?? 1) - (a.version ?? 1);
      if (versionDiff !== 0) return versionDiff;
      if (getLineageIndex(a.baseName) === Number.MAX_SAFE_INTEGER) {
        const baseCompare = a.baseName.localeCompare(b.baseName);
        if (baseCompare !== 0) return baseCompare;
      }
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
    return normalized;
  }, [profiles, currentPlayerId]);

  useEffect(() => {
    if (!currentPlayerId) {
      if (currentProfileId) {
        setCurrentProfileId(null);
        if (!isCloudMode) {
          saveCurrentProfileId(storage, null);
        }
      }
      return;
    }
    if (playerProfiles.length === 0) {
      const baseName = formatLineageBaseName(1);
      const defaultProfile: StatsProfile = {
        id: makeId("profile"),
        playerId: currentPlayerId,
        baseName,
        version: 1,
        name: makeProfileDisplayName(baseName, 1),
        createdAt: new Date().toISOString(),
        trainingCount: 0,
        trained: false,
        predictorDefault: isCloudMode,
        seenPostTrainingCTA: false,
        previousProfileId: null,
        nextProfileId: null,
      };
      setProfiles(prev => prev.concat(defaultProfile));
      if (isCloudMode) {
        void cloudDataService?.upsertStatsProfile(defaultProfile).catch(err => {
          console.error("Failed to persist default profile in cloud mode", err);
        });
      } else {
        setProfilesDirty(true);
        saveCurrentProfileId(storage, defaultProfile.id);
      }
      setCurrentProfileId(defaultProfile.id);
      return;
    }
    const belongs = currentProfileId && playerProfiles.some(p => p.id === currentProfileId);
    if (!belongs) {
      const fallback = playerProfiles[0];
      if (fallback && fallback.id !== currentProfileId) {
        setCurrentProfileId(fallback.id);
        if (!isCloudMode) {
          saveCurrentProfileId(storage, fallback.id);
        }
      }
    }
  }, [currentPlayerId, currentProfileId, isCloudMode, playerProfiles, storage]);

  const currentProfile = useMemo(() => {
    if (!currentProfileId) return playerProfiles[0] ?? null;
    return playerProfiles.find(p => p.id === currentProfileId) ?? playerProfiles[0] ?? null;
  }, [currentProfileId, playerProfiles]);

  useEffect(() => {
    if (isCloudMode || !roundsDirty) return;
    const timer = window.setTimeout(() => {
      saveToStorage(storage, ROUND_KEY, allRounds);
      setRoundsDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [allRounds, isCloudMode, roundsDirty, storage]);

  useEffect(() => {
    if (isCloudMode || !matchesDirty) return;
    const timer = window.setTimeout(() => {
      saveToStorage(storage, MATCH_KEY, allMatches);
      setMatchesDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [allMatches, isCloudMode, matchesDirty, storage]);

  useEffect(() => {
    if (isCloudMode || !profilesDirty) return;
    const timer = window.setTimeout(() => {
      saveProfiles(storage, profiles);
      setProfilesDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isCloudMode, profiles, profilesDirty, storage]);

  useEffect(() => {
    if (isCloudMode || !modelStatesDirty) return;
    const timer = window.setTimeout(() => {
      saveModelStates(storage, modelStates);
      setModelStatesDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isCloudMode, modelStates, modelStatesDirty, storage]);

  useEffect(() => {
    if (isCloudMode || typeof document === "undefined") return;
    const flush = () => {
      if (!modelStatesDirty) return;
      saveModelStates(storage, modelStates);
      setModelStatesDirty(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    const handleBeforeUnload = () => {
      flush();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isCloudMode, modelStates, modelStatesDirty, storage]);

  useEffect(() => {
    if (isCloudMode || !currentPlayerId) return;
    const fallbackProfile = playerProfiles[0];
    if (!fallbackProfile) return;
    if (allRounds.some(r => r.playerId === currentPlayerId && !r.profileId)) {
      setAllRounds(prev => prev.map(r => {
        if (r.playerId === currentPlayerId && !r.profileId) {
          return { ...r, profileId: fallbackProfile.id };
        }
        return r;
      }));
      setRoundsDirty(true);
    }
    if (allMatches.some(m => m.playerId === currentPlayerId && !m.profileId)) {
      setAllMatches(prev => prev.map(m => {
        if (m.playerId === currentPlayerId && !m.profileId) {
          return { ...m, profileId: fallbackProfile.id };
        }
        return m;
      }));
      setMatchesDirty(true);
    }
  }, [allMatches, allRounds, currentPlayerId, isCloudMode, playerProfiles]);

  const selectProfile = useCallback((id: string) => {
    if (!playerProfiles.some(p => p.id === id)) return;
    setCurrentProfileId(id);
    if (!isCloudMode) {
      saveCurrentProfileId(storage, id);
    }
  }, [isCloudMode, playerProfiles, storage]);

  const getModelStateForProfile = useCallback(
    (profileId: string): StoredPredictorModelState | null => {
      return modelStates.find(state => state.profileId === profileId) ?? null;
    },
    [modelStates],
  );

  const saveModelStateForProfile = useCallback(
    (profileId: string, state: StoredPredictorModelState) => {
      setModelStates(prev => {
        const filtered = prev.filter(entry => entry.profileId !== profileId);
        return filtered.concat({ ...state, profileId });
      });
      if (isCloudMode) {
        const userId = currentPlayerId;
        if (userId) {
          const payload: StoredPredictorModelState = {
            ...state,
            profileId,
            updatedAt: state.updatedAt ?? new Date().toISOString(),
          };
          void cloudDataService
            ?.upsertAiState({ ...payload, userId })
            .catch(err => console.error("Failed to persist cloud AI state", err));
        }
      } else {
        setModelStatesDirty(true);
      }
    },
    [currentPlayerId, isCloudMode],
  );

  const clearModelStateForProfile = useCallback((profileId: string) => {
    setModelStates(prev => {
      const next = prev.filter(entry => entry.profileId !== profileId);
      if (next.length !== prev.length && !isCloudMode) {
        setModelStatesDirty(true);
      }
      return next;
    });
  }, [isCloudMode]);

  const createProfile = useCallback(
    (playerIdOverride?: string) => {
      const targetPlayerId = playerIdOverride ?? currentPlayerId;
      if (!targetPlayerId) return null;
      const targetProfiles = profiles.filter(profile => profile.playerId === targetPlayerId);
      const highestVersion = targetProfiles.reduce(
        (max, profile) => Math.max(max, typeof profile.version === "number" ? profile.version : 1),
        1
      );
      const existingBaseNames = new Set(
        targetProfiles.map(profile => normalizeBaseName(profile.baseName ?? profile.name))
      );
      let index = 1;
      while (existingBaseNames.has(formatLineageBaseName(index))) {
        index += 1;
      }
      const baseName = formatLineageBaseName(index);
      const version = highestVersion > 1 ? highestVersion : 1;
      const profile: StatsProfile = {
        id: makeId("profile"),
        playerId: targetPlayerId,
        baseName,
        version,
        name: makeProfileDisplayName(baseName, version),
        createdAt: new Date().toISOString(),
        trainingCount: 0,
        trained: false,
        predictorDefault: false,
        seenPostTrainingCTA: false,
        previousProfileId: null,
        nextProfileId: null,
      };
      setProfiles(prev => prev.concat(profile));
      if (isCloudMode) {
        void cloudDataService?.upsertStatsProfile(profile).catch(err => {
          console.error("Failed to create cloud stats profile", err);
        });
      } else {
        setProfilesDirty(true);
      }
      if (!playerIdOverride || playerIdOverride === currentPlayerId) {
        setCurrentProfileId(profile.id);
        if (!isCloudMode) {
          saveCurrentProfileId(storage, profile.id);
        }
      }
      return profile;
    },
    [currentPlayerId, isCloudMode, profiles, storage]
  );

  const updateProfile = useCallback(
    (id: string, patch: StatsProfileUpdate) => {
      let updatedProfile: StatsProfile | null = null;
      setProfiles(prev =>
        prev.map(p => {
          if (p.id !== id) return p;
          const next = { ...p, ...patch } as StatsProfile;
          if (patch.baseName || patch.version) {
            const baseName = normalizeBaseName(patch.baseName ?? next.baseName);
            const rawVersion = patch.version ?? next.version ?? 1;
            const version =
              typeof rawVersion === "number" && Number.isFinite(rawVersion) ? Math.max(1, Math.floor(rawVersion)) : 1;
            next.baseName = baseName;
            next.version = version;
            next.name = makeProfileDisplayName(baseName, version);
          }
          updatedProfile = next;
          return next;
        }),
      );
      if (isCloudMode) {
        if (updatedProfile) {
          void cloudDataService?.upsertStatsProfile(updatedProfile).catch(err => {
            console.error("Failed to update cloud stats profile", err);
          });
        }
      } else {
        setProfilesDirty(true);
      }
    },
    [isCloudMode],
  );

  const forkProfileVersion = useCallback(
    (id: string) => {
      if (!currentPlayerId) return null;
      const source = profiles.find(p => p.id === id && p.playerId === currentPlayerId);
      if (!source) return null;
      const sourceVersionRaw = source.version;
      const sourceVersion =
        typeof sourceVersionRaw === "number" && Number.isFinite(sourceVersionRaw)
          ? Math.max(1, Math.floor(sourceVersionRaw))
          : 1;
      const baseName = normalizeBaseName(source.baseName ?? source.name);
      const nextVersion = sourceVersion + 1;
      const newProfile: StatsProfile = {
        id: makeId("profile"),
        playerId: currentPlayerId,
        baseName,
        version: nextVersion,
        name: makeProfileDisplayName(baseName, nextVersion),
        createdAt: new Date().toISOString(),
        trainingCount: 0,
        trained: false,
        predictorDefault: source.predictorDefault,
        seenPostTrainingCTA: false,
        previousProfileId: source.id,
        nextProfileId: null,
      };
      let updatedSource: StatsProfile | null = null;
      setProfiles(prev => {
        const updated = prev.map(p => {
          if (p.id !== source.id) return p;
          const next: StatsProfile = {
            ...p,
            baseName,
            version: sourceVersion,
            name: makeProfileDisplayName(baseName, sourceVersion),
            nextProfileId: newProfile.id,
          };
          updatedSource = next;
          return next;
        });
        return updated.concat(newProfile);
      });
      setCurrentProfileId(newProfile.id);
      if (isCloudMode) {
        void cloudDataService?.upsertStatsProfile(newProfile).catch(err => {
          console.error("Failed to fork cloud stats profile", err);
        });
        if (updatedSource) {
          void cloudDataService?.upsertStatsProfile(updatedSource).catch(err => {
            console.error("Failed to update source profile during cloud fork", err);
          });
        }
      } else {
        setProfilesDirty(true);
        saveCurrentProfileId(storage, newProfile.id);
      }
      return newProfile;
    },
    [currentPlayerId, isCloudMode, profiles, storage],
  );

  const logRound = useCallback(
    (round: Omit<RoundLog, "id" | "sessionId" | "playerId" | "profileId">) => {
      if (!currentPlayerId || !currentProfile) return null;
      const entry: RoundLog = {
        ...round,
        id: makeId("r"),
        sessionId,
        playerId: currentPlayerId,
        profileId: currentProfile.id,
      };
      const existingCount = allRounds.filter(
        r => r.playerId === currentPlayerId && (r.profileId ?? currentProfile.id) === currentProfile.id,
      ).length;
      setAllRounds(prev => {
        const next = prev.concat(entry);
        if (isCloudMode) {
          return next;
        }
        const trimStart = Math.max(0, next.length - MAX_ROUNDS);
        return trimStart ? next.slice(trimStart) : next;
      });
      if (isCloudMode) {
        void cloudDataService
          ?.insertRounds([{ round: entry, roundNumber: existingCount + 1 }])
          .catch(err => console.error("Failed to log cloud round", err));
      } else {
        setRoundsDirty(true);
      }
      return entry;
    },
    [allRounds, currentPlayerId, currentProfile, isCloudMode, sessionId],
  );

  const logMatch = useCallback(
    (match: Omit<MatchSummary, "id" | "sessionId" | "playerId" | "profileId">) => {
      if (!currentPlayerId || !currentProfile) return null;
      const entry: MatchSummary = {
        ...match,
        id: makeId("m"),
        sessionId,
        playerId: currentPlayerId,
        profileId: currentProfile.id,
      };
      setAllMatches(prev => prev.concat(entry));
      if (isCloudMode) {
        void cloudDataService?.insertMatches([entry]).catch(err => {
          console.error("Failed to log cloud match", err);
        });
      } else {
        setMatchesDirty(true);
      }
      return entry;
    },
    [currentPlayerId, currentProfile, isCloudMode, sessionId],
  );

  const rounds = useMemo(() => {
    if (!currentPlayerId || !currentProfile) return [] as RoundLog[];
    return allRounds.filter(r => r.playerId === currentPlayerId && (r.profileId ?? currentProfile.id) === currentProfile.id);
  }, [allRounds, currentPlayerId, currentProfile]);

  const matches = useMemo(() => {
    if (!currentPlayerId || !currentProfile) return [] as MatchSummary[];
    return allMatches.filter(m => m.playerId === currentPlayerId && (m.profileId ?? currentProfile.id) === currentProfile.id);
  }, [allMatches, currentPlayerId, currentProfile]);

  const adminUpdateRound = useCallback(
    (id: string, patch: Partial<RoundLog>) => {
      setAllRounds(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
      if (!isCloudMode) {
        setRoundsDirty(true);
      }
    },
    [isCloudMode],
  );

  const adminDeleteRound = useCallback(
    (id: string) => {
      setAllRounds(prev => prev.filter(r => r.id !== id));
      if (!isCloudMode) {
        setRoundsDirty(true);
      }
    },
    [isCloudMode],
  );

  const adminUpdateMatch = useCallback(
    (id: string, patch: Partial<MatchSummary>) => {
      setAllMatches(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
      if (!isCloudMode) {
        setMatchesDirty(true);
      }
    },
    [isCloudMode],
  );

  const adminDeleteMatch = useCallback(
    (id: string) => {
      setAllMatches(prev => prev.filter(m => m.id !== id));
      if (!isCloudMode) {
        setMatchesDirty(true);
      }
    },
    [isCloudMode],
  );

  const exportRoundsCsv = useCallback(() => {
    const headers = [
      "playerId",
      "playerName",
      "grade",
      "age",
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
    const playerName = currentPlayer?.playerName ?? "";
    const grade = currentPlayer?.grade ?? "";
    const age = currentPlayer?.age != null ? currentPlayer.age : "";
    const school = currentPlayer?.school ?? "";
    const prior = currentPlayer?.priorExperience ?? "";
    const profileName = currentProfile?.name ?? "";
    rounds.forEach(r => {
      lines.push([
        r.playerId,
        JSON.stringify(playerName),
        grade,
        age,
        JSON.stringify(school ?? ""),
        JSON.stringify(prior ?? ""),
        JSON.stringify(profileName),
        r.t,
        r.mode,
        r.bestOf,
        r.difficulty,
        r.player,
        r.ai,
        r.outcome,
        r.policy,
        r.confidence.toFixed(2),
        r.decisionTimeMs ?? "",
        r.streakAI,
        r.streakYou,
      ].join(","));
    });
    return lines.join("\n");
  }, [rounds, currentPlayer, currentProfile]);

  const value = useMemo<StatsContextValue>(() => ({
    rounds,
    matches,
    sessionId,
    currentProfileId: currentProfile?.id ?? null,
    currentProfile: currentProfile ?? null,
    profiles: playerProfiles,
    logRound,
    logMatch,
    selectProfile,
    createProfile,
    updateProfile,
    forkProfileVersion,
    exportRoundsCsv,
    getModelStateForProfile,
    saveModelStateForProfile,
    clearModelStateForProfile,
    adminRounds: allRounds,
    adminMatches: allMatches,
    adminProfiles: profiles,
    adminUpdateRound,
    adminDeleteRound,
    adminUpdateMatch,
    adminDeleteMatch,
  }), [
    rounds,
    matches,
    sessionId,
    currentProfile,
    playerProfiles,
    logRound,
    logMatch,
    selectProfile,
    createProfile,
    updateProfile,
    forkProfileVersion,
    exportRoundsCsv,
    getModelStateForProfile,
    saveModelStateForProfile,
    clearModelStateForProfile,
    allRounds,
    allMatches,
    profiles,
    adminUpdateRound,
    adminDeleteRound,
    adminUpdateMatch,
    adminDeleteMatch,
  ]);

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}

export function useStats(){
  const ctx = useContext(StatsContext);
  if (!ctx) throw new Error("useStats must be used within StatsProvider");
  return ctx;
}

