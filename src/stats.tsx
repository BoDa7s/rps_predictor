import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AIMode, BestOf, Mode, Move, Outcome } from "./gameTypes";
import { usePlayers } from "./players";
import { usePlayMode, type PlayMode } from "./lib/playMode";
import { cloudDataService, isSupabaseUuid, type MatchRecord, type RoundRecord } from "./lib/cloudData";
import { isProfileMigrated } from "./lib/localBackup";
import type { StatsProfileRow } from "./lib/database.types";
import { computeMatchScore } from "./leaderboard";

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

export type StatsProfile = StatsProfileRow;

type StatsProfileUpdate = Partial<
  Pick<
    StatsProfile,
    | "display_name"
    | "training_count"
    | "training_completed"
    | "predictor_default"
    | "seen_post_training_cta"
    | "base_name"
    | "profile_version"
    | "previous_profile_id"
    | "next_profile_id"
    | "archived"
    | "metadata"
    | "updated_at"
  >
>;

interface StatsContextValue {
  rounds: RoundLog[];
  matches: MatchSummary[];
  sessionId: string;
  currentProfileId: string | null;
  currentProfile: StatsProfile | null;
  statsReady: boolean;
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

function shouldPreventLocalWrite(
  storage: Storage | null,
  profileIds?: Iterable<string | null | undefined>,
): boolean {
  if (typeof window === "undefined") return false;
  if (!storage) return false;
  if (storage !== window.localStorage) return false;
  if (!profileIds) return false;
  for (const id of profileIds) {
    if (typeof id === "string" && isProfileMigrated(id)) {
      return true;
    }
  }
  return false;
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

export function makeProfileDisplayName(baseName: string, version: number): string {
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

function saveToStorage(
  storage: Storage | null,
  key: string,
  value: unknown,
  profileIds?: Iterable<string | null | undefined>,
) {
  if (!storage) return;
  if (shouldPreventLocalWrite(storage, profileIds)) return;
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

function saveModelStates(
  storage: Storage | null,
  states: StoredPredictorModelState[],
  profileIds?: Iterable<string | null | undefined>,
) {
  if (!storage) return;
  if (shouldPreventLocalWrite(storage, profileIds)) return;
  try {
    storage.setItem(MODEL_STATE_KEY, JSON.stringify(states));
  } catch (err) {
    console.warn("Failed to persist predictor model state", err);
  }
}

function migrateMatchRecords(matches: MatchSummary[]): { matches: MatchSummary[]; changed: boolean } {
  let changed = false;
  const migrated = matches.map(match => {
    if (match.mode === "practice" || match.mode === "training") {
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
      const base_name = normalizeBaseName(typeof item?.baseName === "string" ? item.baseName : fallbackName);
      const profile_version = (() => {
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
      const created_at =
        typeof item?.createdAt === "string" ? item.createdAt : new Date().toISOString();
      const updated_at = typeof item?.updated_at === "string" ? item.updated_at : created_at;
      const metadata =
        item && typeof item.metadata === "object" && item.metadata !== null ? item.metadata : {};
      const archived = item?.archived === true;
      const trainingCount = (() => {
        if (typeof item?.training_count === "number" && Number.isFinite(item.training_count)) {
          return item.training_count;
        }
        if (typeof item?.trainingCount === "number" && Number.isFinite(item.trainingCount)) {
          return item.trainingCount;
        }
        return 0;
      })();
      const trainingCompleted = (() => {
        if (item?.training_completed === true) return true;
        if (item?.training_completed === false) return false;
        if (item?.trained === true) return true;
        if (item?.trained === false) return false;
        return false;
      })();
      return {
        id: typeof item?.id === "string" ? item.id : makeId("profile"),
        user_id:
          typeof item?.user_id === "string"
            ? item.user_id
            : typeof item?.playerId === "string"
              ? item.playerId
              : "",
        demographics_profile_id:
          typeof item?.demographics_profile_id === "string" ? item.demographics_profile_id : null,
        base_name,
        profile_version,
        display_name: makeProfileDisplayName(base_name, profile_version),
        training_count: trainingCount,
        training_completed: trainingCompleted,
        predictor_default:
          item?.predictorDefault !== undefined ? Boolean(item.predictorDefault) : false,
        seen_post_training_cta:
          item?.seenPostTrainingCTA !== undefined ? Boolean(item.seenPostTrainingCTA) : false,
        previous_profile_id:
          typeof item?.previousProfileId === "string" ? item.previousProfileId : null,
        next_profile_id: typeof item?.nextProfileId === "string" ? item.nextProfileId : null,
        archived,
        metadata,
        created_at,
        updated_at,
        version:
          typeof item?.version === "number" && Number.isFinite(item.version)
            ? Math.max(1, Math.floor(item.version))
            : 1,
      } satisfies StatsProfile;
    });
  } catch (err) {
    console.warn("Failed to read stats profiles", err);
    return [];
  }
}

function saveProfiles(
  storage: Storage | null,
  profiles: StatsProfile[],
  profileIds?: Iterable<string | null | undefined>,
) {
  if (!storage) return;
  if (shouldPreventLocalWrite(storage, profileIds)) return;
  try {
    storage.setItem(PROFILE_KEY, JSON.stringify(profiles));
  } catch (err) {
    console.warn("Failed to persist stats profiles", err);
  }
}

function loadCurrentProfileId(storage: Storage | null, profiles?: StatsProfile[]): string | null {
  if (!storage) return null;
  try {
    const id = storage.getItem(CURRENT_PROFILE_KEY);
    if (!id) return null;
    if (profiles && profiles.length > 0 && !profiles.some(profile => profile.id === id)) {
      return null;
    }
    return id;
  } catch (err) {
    console.warn("Failed to read current stats profile", err);
    return null;
  }
}

function saveCurrentProfileId(
  storage: Storage | null,
  id: string | null,
  profileIds?: Iterable<string | null | undefined>,
) {
  if (!storage) return;
  if (shouldPreventLocalWrite(storage, profileIds)) return;
  try {
    if (id) storage.setItem(CURRENT_PROFILE_KEY, id);
    else storage.removeItem(CURRENT_PROFILE_KEY);
  } catch (err) {
    console.warn("Failed to persist current stats profile", err);
  }
}

function makeUuid() {
  const globalCrypto =
    typeof globalThis !== "undefined" && "crypto" in globalThis
      ? (globalThis.crypto as { randomUUID?: () => string } | undefined)
      : undefined;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  const random = () => Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  const variant = () => (Math.floor(Math.random() * 0x3fff) | 0x8000)
    .toString(16)
    .padStart(4, "0");
  const version = () => (Math.floor(Math.random() * 0x0fff) | 0x4000)
    .toString(16)
    .padStart(4, "0");
  return `${random()}${random()}-${random()}-${version()}-${variant()}-${random()}${random()}${random()}`;
}

function makeId(prefix: string) {
  return `${prefix}-${makeUuid()}`;
}

function makeStatsProfileId(isCloudMode: boolean | undefined) {
  return isCloudMode ? makeUuid() : makeId("profile");
}

function mapRoundPatchToCloudUpdate(patch: Partial<RoundLog>): Partial<RoundRecord> {
  const update: Partial<RoundRecord> = {};
  if ("sessionId" in patch) {
    update.session_id = patch.sessionId ?? undefined;
  }
  if ("matchId" in patch) {
    update.match_id = patch.matchId ?? null;
  }
  if ("playerId" in patch) {
    update.user_id = patch.playerId ?? undefined;
  }
  if ("profileId" in patch) {
    update.stats_profile_id = patch.profileId ?? undefined;
  }
  if ("t" in patch) {
    update.played_at = patch.t ?? undefined;
  }
  if ("mode" in patch) {
    update.mode = patch.mode as RoundRecord["mode"];
  }
  if ("bestOf" in patch) {
    update.best_of = patch.bestOf as RoundRecord["best_of"];
  }
  if ("difficulty" in patch) {
    update.difficulty = patch.difficulty as RoundRecord["difficulty"];
  }
  if ("player" in patch) {
    update.player_move = patch.player as RoundRecord["player_move"];
  }
  if ("ai" in patch) {
    update.ai_move = patch.ai as RoundRecord["ai_move"];
  }
  if ("outcome" in patch) {
    update.outcome = patch.outcome as RoundRecord["outcome"];
  }
  if ("policy" in patch) {
    update.decision_policy = patch.policy as RoundRecord["decision_policy"];
  }
  if ("reason" in patch) {
    update.reason = patch.reason ?? null;
  }
  if ("confidence" in patch) {
    update.ai_confidence = patch.confidence ?? null;
  }
  if ("confidenceBucket" in patch) {
    update.confidence_bucket = patch.confidenceBucket ?? null;
  }
  if ("decisionTimeMs" in patch) {
    update.decision_time_ms = patch.decisionTimeMs ?? null;
  }
  if ("streakAI" in patch) {
    update.streak_ai = patch.streakAI ?? null;
  }
  if ("streakYou" in patch) {
    update.streak_you = patch.streakYou ?? null;
  }
  if ("mixer" in patch) {
    update.mixer_trace = (patch.mixer ?? null) as RoundRecord["mixer_trace"];
  }
  if ("heuristic" in patch) {
    update.heuristic_trace = (patch.heuristic ?? null) as RoundRecord["heuristic_trace"];
  }
  return update;
}

function mapMatchPatchToCloudUpdate(patch: Partial<MatchSummary>): Partial<MatchRecord> {
  const update: Partial<MatchRecord> = {};
  if ("sessionId" in patch) {
    update.session_id = patch.sessionId ?? undefined;
  }
  if ("playerId" in patch) {
    update.user_id = patch.playerId ?? undefined;
  }
  if ("profileId" in patch) {
    update.stats_profile_id = patch.profileId ?? undefined;
  }
  if ("clientId" in patch) {
    update.client_match_id = patch.clientId ?? null;
  }
  if ("startedAt" in patch) {
    update.started_at = patch.startedAt ?? undefined;
  }
  if ("endedAt" in patch) {
    update.ended_at = patch.endedAt ?? null;
  }
  if ("mode" in patch) {
    update.mode = patch.mode as MatchRecord["mode"];
  }
  if ("bestOf" in patch) {
    update.best_of = patch.bestOf as MatchRecord["best_of"];
  }
  if ("difficulty" in patch) {
    update.difficulty = patch.difficulty as MatchRecord["difficulty"];
  }
  if ("rounds" in patch) {
    update.rounds_played = patch.rounds ?? undefined;
  }
  if ("score" in patch && patch.score) {
    if (typeof patch.score.you === "number") {
      update.score_you = patch.score.you;
    }
    if (typeof patch.score.ai === "number") {
      update.score_ai = patch.score.ai;
    }
  }
  if ("aiWinRate" in patch) {
    update.ai_win_rate = patch.aiWinRate ?? null;
  }
  if ("youSwitchedRate" in patch) {
    update.you_switched_rate = patch.youSwitchedRate ?? null;
  }
  if ("notes" in patch) {
    update.notes = patch.notes ?? null;
  }
  if ("leaderboardScore" in patch) {
    update.leaderboard_score = patch.leaderboardScore ?? null;
  }
  if ("leaderboardMaxStreak" in patch) {
    update.leaderboard_max_streak = patch.leaderboardMaxStreak ?? null;
  }
  if ("leaderboardRoundCount" in patch) {
    update.leaderboard_round_count = patch.leaderboardRoundCount ?? null;
  }
  if ("leaderboardTimerBonus" in patch) {
    update.leaderboard_timer_bonus = patch.leaderboardTimerBonus ?? null;
  }
  if ("leaderboardBeatConfidenceBonus" in patch) {
    update.leaderboard_beat_confidence_bonus = patch.leaderboardBeatConfidenceBonus ?? null;
  }
  if ("leaderboardType" in patch) {
    update.leaderboard_type = patch.leaderboardType ?? null;
  }
  return update;
}

export function StatsProvider({ children }: { children: React.ReactNode }) {
  const { mode } = usePlayMode();
  const isCloudMode = mode === "cloud";
  const storageScope = useMemo<StorageScope | null>(() => (isCloudMode ? null : resolveScopeFromMode(mode)), [isCloudMode, mode]);
  const storage = useMemo(() => (storageScope ? getScopedStorage(storageScope) : null), [storageScope]);

  const [allRounds, setAllRounds] = useState<RoundLog[]>([]);
  const allRoundsRef = useRef<RoundLog[]>([]);
  const [allMatches, setAllMatches] = useState<MatchSummary[]>([]);
  const [profiles, setProfiles] = useState<StatsProfile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [roundsDirty, setRoundsDirty] = useState(false);
  const [matchesDirty, setMatchesDirty] = useState(false);
  const [profilesDirty, setProfilesDirty] = useState(false);
  const [modelStates, setModelStates] = useState<StoredPredictorModelState[]>([]);
  const [modelStatesDirty, setModelStatesDirty] = useState(false);
  const [cloudProfilesHydrated, setCloudProfilesHydrated] = useState(!isCloudMode);
  const sessionIdRef = useRef<string>("");
  const sessionStartedAtRef = useRef<string>("");
  const sessionOwnerRef = useRef<string | null>(null);
  const clientSessionIdRef = useRef<string>("");
  const seededMatchIdsRef = useRef<Set<string>>(new Set());
  const missingCloudUserWarnedRef = useRef(false);
  const { currentPlayerId: rawCurrentPlayerId, currentPlayer } = usePlayers();
  const currentPlayerId = useMemo(() => {
    if (!isCloudMode) {
      missingCloudUserWarnedRef.current = false;
      return rawCurrentPlayerId;
    }
    if (isSupabaseUuid(rawCurrentPlayerId)) {
      missingCloudUserWarnedRef.current = false;
      return rawCurrentPlayerId;
    }
    if (rawCurrentPlayerId && !missingCloudUserWarnedRef.current) {
      console.warn("Cloud stats unavailable: Supabase user ID is not ready yet");
      missingCloudUserWarnedRef.current = true;
    }
    return null;
  }, [isCloudMode, rawCurrentPlayerId]);

  useEffect(() => {
    allRoundsRef.current = allRounds;
  }, [allRounds]);

  const ensureSession = useCallback((): string | null => {
    if (!clientSessionIdRef.current) {
      clientSessionIdRef.current = makeId("sess");
    }

    if (!isCloudMode) {
      sessionOwnerRef.current = null;
      if (!sessionStartedAtRef.current) {
        sessionStartedAtRef.current = new Date().toISOString();
      }
      if (!sessionIdRef.current) {
        sessionIdRef.current = makeId("sess");
      }
      return sessionIdRef.current;
    }

    const service = cloudDataService;
    const userId = currentPlayerId;
    if (!service || !userId) {
      return null;
    }

    if (sessionOwnerRef.current && sessionOwnerRef.current !== userId) {
      sessionIdRef.current = "";
      sessionStartedAtRef.current = "";
    }

    if (!sessionStartedAtRef.current) {
      sessionStartedAtRef.current = new Date().toISOString();
    }

    if (!sessionIdRef.current) {
      const newSessionId = makeUuid();
      sessionIdRef.current = newSessionId;
      sessionOwnerRef.current = userId;
      const startedAt = sessionStartedAtRef.current;
      void service
        .upsertSession({
          id: newSessionId,
          userId,
          startedAt,
          clientSessionId: clientSessionIdRef.current,
          storageMode: "cloud",
          lastEventAt: startedAt,
        })
        .catch(err => {
          console.error("Failed to create cloud session", err);
        });
    }

    return sessionIdRef.current;
  }, [cloudDataService, currentPlayerId, isCloudMode]);

  useEffect(() => {
    ensureSession();
  }, [ensureSession]);

  useEffect(() => {
    seededMatchIdsRef.current.clear();
  }, [isCloudMode, currentPlayerId]);

  useEffect(() => {
    if (isCloudMode) {
      setCloudProfilesHydrated(false);
    } else {
      setCloudProfilesHydrated(true);
    }
  }, [isCloudMode]);

  useEffect(() => {
    if (isCloudMode) return;

    const loadedProfiles = loadProfiles(storage);
    const filteredProfiles = loadedProfiles.filter(profile => !isProfileMigrated(profile.user_id));
    if (filteredProfiles.length !== loadedProfiles.length) {
      saveProfiles(
        storage,
        filteredProfiles,
        filteredProfiles.map(profile => profile.user_id),
      );
    }

    const allowedStatsProfileIds = new Set(filteredProfiles.map(profile => profile.id));

    const loadedRounds = loadFromStorage<RoundLog>(storage, ROUND_KEY);
    const filteredRounds = loadedRounds.filter(round => {
      if (isProfileMigrated(round.playerId)) {
        return false;
      }
      if (round.profileId && !allowedStatsProfileIds.has(round.profileId)) {
        return false;
      }
      return true;
    });
    if (filteredRounds.length !== loadedRounds.length) {
      saveToStorage(
        storage,
        ROUND_KEY,
        filteredRounds,
        filteredRounds.map(round => round.playerId),
      );
    }

    const loadedMatches = loadFromStorage<MatchSummary>(storage, MATCH_KEY);
    const migrated = migrateMatchRecords(loadedMatches);
    const filteredMatches = migrated.matches.filter(match => {
      if (isProfileMigrated(match.playerId)) {
        return false;
      }
      if (match.profileId && !allowedStatsProfileIds.has(match.profileId)) {
        return false;
      }
      return true;
    });
    if (migrated.changed || filteredMatches.length !== migrated.matches.length) {
      saveToStorage(
        storage,
        MATCH_KEY,
        filteredMatches,
        filteredMatches.map(match => match.playerId),
      );
    }

    const loadedModelStates = loadModelStates(storage);
    const filteredModelStates = loadedModelStates.filter(state => allowedStatsProfileIds.has(state.profileId));
    if (filteredModelStates.length !== loadedModelStates.length) {
      saveModelStates(storage, filteredModelStates, [currentPlayerId]);
    }

    setAllRounds(filteredRounds);
    setAllMatches(filteredMatches);
    setProfiles(filteredProfiles);
    setCurrentProfileId(loadCurrentProfileId(storage, filteredProfiles));
    setModelStates(filteredModelStates);
    setRoundsDirty(false);
    setMatchesDirty(false);
    setProfilesDirty(false);
    setModelStatesDirty(false);
  }, [currentPlayerId, isCloudMode, storage]);

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
      setCloudProfilesHydrated(true);
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
      setCloudProfilesHydrated(true);
      return;
    }
    let cancelled = false;
    setCloudProfilesHydrated(false);
    (async () => {
      try {
        const rawProfiles = await service.loadStatsProfiles(userId);
        let normalizedProfiles = rawProfiles.map(profile => {
          const base_name = normalizeBaseName(profile.base_name ?? profile.display_name);
          const profile_version = Math.max(
            1,
            Math.floor(
              typeof profile.profile_version === "number" && Number.isFinite(profile.profile_version)
                ? profile.profile_version
                : 1,
            ),
          );
          const display_name = makeProfileDisplayName(base_name, profile_version);
          const metadata: StatsProfile["metadata"] =
            profile.metadata !== null && profile.metadata !== undefined
              ? (profile.metadata as StatsProfile["metadata"])
              : ({} as StatsProfile["metadata"]);
          return {
            ...profile,
            base_name,
            profile_version,
            display_name,
            training_count:
              typeof profile.training_count === "number" ? profile.training_count : 0,
            training_completed: profile.training_completed === true,
            predictor_default: profile.predictor_default === true,
            seen_post_training_cta: profile.seen_post_training_cta === true,
            previous_profile_id: profile.previous_profile_id ?? null,
            next_profile_id: profile.next_profile_id ?? null,
            archived: profile.archived === true,
            metadata,
            updated_at: profile.updated_at ?? profile.created_at,
            version:
              typeof profile.version === "number" && Number.isFinite(profile.version)
                ? Math.max(1, Math.floor(profile.version))
                : 1,
          } satisfies StatsProfile;
        });
        if (normalizedProfiles.length === 0) {
          const baseName = formatLineageBaseName(1);
          const createdAt = new Date().toISOString();
          const defaultProfile: StatsProfile = {
            id: makeStatsProfileId(true),
            user_id: userId,
            demographics_profile_id: null,
            base_name: baseName,
            profile_version: 1,
            display_name: makeProfileDisplayName(baseName, 1),
            training_count: 0,
            training_completed: false,
            predictor_default: true,
            seen_post_training_cta: false,
            previous_profile_id: null,
            next_profile_id: null,
            archived: false,
            metadata: {} as StatsProfile["metadata"],
            created_at: createdAt,
            updated_at: createdAt,
            version: 1,
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

        const aggregatedRounds = roundGroups
          .flat()
          .sort((a, b) => a.t.localeCompare(b.t));
        const rawMatches = matchGroups
          .flat()
          .sort((a, b) => {
            const startDiff = a.startedAt.localeCompare(b.startedAt);
            if (startDiff !== 0) return startDiff;
            const endA = a.endedAt ?? "";
            const endB = b.endedAt ?? "";
            const endDiff = endA.localeCompare(endB);
            if (endDiff !== 0) return endDiff;
            return a.id.localeCompare(b.id);
          });
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
        setCloudProfilesHydrated(true);

        setCurrentProfileId(prev => {
          if (prev && normalizedProfiles.some(profile => profile.id === prev)) {
            return prev;
          }
          const preferred =
            normalizedProfiles.find(profile => profile.predictor_default) ?? normalizedProfiles[0] ?? null;
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
          setCloudProfilesHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPlayerId, isCloudMode]);

  const sessionId = sessionIdRef.current;
  const playerProfiles = useMemo(() => {
    if (!currentPlayerId) return [] as StatsProfile[];
    const filtered = profiles.filter(p => p.user_id === currentPlayerId);
    const normalized = filtered.map(profile => {
      const base_name = normalizeBaseName(profile.base_name ?? profile.display_name);
      const profile_version = Math.max(
        1,
        Math.floor(
          typeof profile.profile_version === "number" && Number.isFinite(profile.profile_version)
            ? profile.profile_version
            : 1,
        ),
      );
      const display_name = makeProfileDisplayName(base_name, profile_version);
      return {
        ...profile,
        base_name,
        profile_version,
        display_name,
        training_count: typeof profile.training_count === "number" ? profile.training_count : 0,
        training_completed: profile.training_completed === true,
        predictor_default: profile.predictor_default === true,
        seen_post_training_cta: profile.seen_post_training_cta === true,
        previous_profile_id: profile.previous_profile_id ?? null,
        next_profile_id: profile.next_profile_id ?? null,
        archived: profile.archived === true,
        updated_at: profile.updated_at ?? profile.created_at,
      } satisfies StatsProfile;
    });
    normalized.sort((a, b) => {
      const indexDiff = getLineageIndex(a.base_name) - getLineageIndex(b.base_name);
      if (indexDiff !== 0) return indexDiff;
      const versionDiff = (b.profile_version ?? 1) - (a.profile_version ?? 1);
      if (versionDiff !== 0) return versionDiff;
      if (getLineageIndex(a.base_name) === Number.MAX_SAFE_INTEGER) {
        const baseCompare = a.base_name.localeCompare(b.base_name);
        if (baseCompare !== 0) return baseCompare;
      }
      return (a.created_at || "").localeCompare(b.created_at || "");
    });
    return normalized;
  }, [profiles, currentPlayerId]);

  useEffect(() => {
    if (!currentPlayerId) {
      if (currentProfileId) {
        setCurrentProfileId(null);
        if (!isCloudMode) {
        saveCurrentProfileId(storage, null, [currentPlayerId]);
        }
      }
      return;
    }
    if (playerProfiles.length === 0) {
      if (isCloudMode && !cloudProfilesHydrated) {
        return;
      }
      const baseName = formatLineageBaseName(1);
      const timestamp = new Date().toISOString();
      const defaultProfile: StatsProfile = {
        id: makeStatsProfileId(isCloudMode),
        user_id: currentPlayerId,
        demographics_profile_id: null,
        base_name: baseName,
        profile_version: 1,
        display_name: makeProfileDisplayName(baseName, 1),
        training_count: 0,
        training_completed: false,
        predictor_default: Boolean(isCloudMode),
        seen_post_training_cta: false,
        previous_profile_id: null,
        next_profile_id: null,
        archived: false,
        metadata: {} as StatsProfile["metadata"],
        created_at: timestamp,
        updated_at: timestamp,
        version: 1,
      };
      setProfiles(prev => prev.concat(defaultProfile));
      if (isCloudMode) {
        void cloudDataService?.upsertStatsProfile(defaultProfile).catch(err => {
          console.error("Failed to persist default profile in cloud mode", err);
        });
      } else {
        setProfilesDirty(true);
        saveCurrentProfileId(storage, defaultProfile.id, [currentPlayerId]);
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
          saveCurrentProfileId(storage, fallback.id, [currentPlayerId]);
        }
      }
    }
  }, [cloudProfilesHydrated, currentPlayerId, currentProfileId, isCloudMode, playerProfiles, storage]);

  const currentProfile = useMemo(() => {
    if (!currentProfileId) return playerProfiles[0] ?? null;
    return playerProfiles.find(p => p.id === currentProfileId) ?? playerProfiles[0] ?? null;
  }, [currentProfileId, playerProfiles]);

  useEffect(() => {
    if (isCloudMode || !roundsDirty) return;
    const timer = window.setTimeout(() => {
      saveToStorage(
        storage,
        ROUND_KEY,
        allRounds,
        allRounds.map(round => round.playerId),
      );
      setRoundsDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [allRounds, isCloudMode, roundsDirty, storage]);

  useEffect(() => {
    if (isCloudMode || !matchesDirty) return;
    const timer = window.setTimeout(() => {
      saveToStorage(
        storage,
        MATCH_KEY,
        allMatches,
        allMatches.map(match => match.playerId),
      );
      setMatchesDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [allMatches, isCloudMode, matchesDirty, storage]);

  useEffect(() => {
    if (isCloudMode || !profilesDirty) return;
    const timer = window.setTimeout(() => {
      saveProfiles(
        storage,
        profiles,
        profiles.map(profile => profile.user_id),
      );
      setProfilesDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isCloudMode, profiles, profilesDirty, storage]);

  useEffect(() => {
    if (isCloudMode || !modelStatesDirty) return;
    const timer = window.setTimeout(() => {
      saveModelStates(storage, modelStates, [currentPlayerId]);
      setModelStatesDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [currentPlayerId, isCloudMode, modelStates, modelStatesDirty, storage]);

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
      saveCurrentProfileId(storage, id, [currentPlayerId]);
    }
  }, [currentPlayerId, isCloudMode, playerProfiles, storage]);

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

  const clearModelStateForProfile = useCallback(
    (profileId: string) => {
      setModelStates(prev => {
        const next = prev.filter(entry => entry.profileId !== profileId);
        if (next.length !== prev.length && !isCloudMode) {
          setModelStatesDirty(true);
        }
        return next;
      });
      if (isCloudMode) {
        const userId = currentPlayerId;
        if (userId) {
          void cloudDataService
            ?.deleteAiState(userId, profileId)
            .catch(err => console.error("Failed to delete cloud AI state", err));
        }
      }
    },
    [currentPlayerId, isCloudMode],
  );

  const createProfile = useCallback(
    (playerIdOverride?: string) => {
      const targetPlayerId = playerIdOverride ?? currentPlayerId;
      if (!targetPlayerId) return null;
      if (isCloudMode && !isSupabaseUuid(targetPlayerId)) {
        console.warn("Cannot create cloud stats profile until Supabase user ID is available");
        return null;
      }
      const targetProfiles = profiles.filter(profile => profile.user_id === targetPlayerId);
      const highestVersion = targetProfiles.reduce(
        (max, profile) => Math.max(max, typeof profile.profile_version === "number" ? profile.profile_version : 1),
        1
      );
      const existingBaseNames = new Set(
        targetProfiles.map(profile => normalizeBaseName(profile.base_name ?? profile.display_name))
      );
      let index = 1;
      while (existingBaseNames.has(formatLineageBaseName(index))) {
        index += 1;
      }
      const baseName = formatLineageBaseName(index);
      const version = highestVersion > 1 ? highestVersion : 1;
      const timestamp = new Date().toISOString();
      const profile: StatsProfile = {
        id: makeStatsProfileId(isCloudMode),
        user_id: targetPlayerId,
        demographics_profile_id: null,
        base_name: baseName,
        profile_version: version,
        display_name: makeProfileDisplayName(baseName, version),
        training_count: 0,
        training_completed: false,
        predictor_default: false,
        seen_post_training_cta: false,
        previous_profile_id: null,
        next_profile_id: null,
        archived: false,
        metadata: {} as StatsProfile["metadata"],
        created_at: timestamp,
        updated_at: timestamp,
        version: 1,
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
          saveCurrentProfileId(storage, profile.id, [currentPlayerId]);
        }
      }
      return profile;
    },
    [currentPlayerId, isCloudMode, profiles, storage]
  );

  const updateProfile = useCallback(
    (id: string, patch: StatsProfileUpdate) => {
      let updatedProfile: StatsProfile | null = null;
      const timestamp = new Date().toISOString();
      setProfiles(prev =>
        prev.map(p => {
          if (p.id !== id) return p;
          const next: StatsProfile = {
            ...p,
            ...patch,
          };
          const baseNameInput = patch.base_name ?? next.base_name;
          const normalizedBase = normalizeBaseName(baseNameInput);
          const rawVersion =
            typeof (patch.profile_version ?? next.profile_version) === "number"
              ? Number(patch.profile_version ?? next.profile_version)
              : 1;
          const profileVersion = Math.max(
            1,
            Math.floor(Number.isFinite(rawVersion) ? rawVersion : 1),
          );
          next.base_name = normalizedBase;
          next.profile_version = profileVersion;
          next.display_name = makeProfileDisplayName(normalizedBase, profileVersion);
          next.training_count =
            typeof next.training_count === "number" && Number.isFinite(next.training_count)
              ? next.training_count
              : 0;
          next.training_completed = next.training_completed === true;
          next.predictor_default = next.predictor_default === true;
          next.seen_post_training_cta = next.seen_post_training_cta === true;
          next.previous_profile_id = next.previous_profile_id ?? null;
          next.next_profile_id = next.next_profile_id ?? null;
          next.archived = next.archived === true;
          if (!next.metadata || typeof next.metadata !== "object") {
            next.metadata = {} as StatsProfile["metadata"];
          }
          next.updated_at = patch.updated_at ?? timestamp;
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
      const source = profiles.find(p => p.id === id && p.user_id === currentPlayerId);
      if (!source) return null;
      const sourceVersionRaw = source.profile_version;
      const sourceVersion =
        typeof sourceVersionRaw === "number" && Number.isFinite(sourceVersionRaw)
          ? Math.max(1, Math.floor(sourceVersionRaw))
          : 1;
      const baseName = normalizeBaseName(source.base_name ?? source.display_name);
      const nextVersion = sourceVersion + 1;
      const newProfileDefault = Boolean(source.predictor_default);
      const timestamp = new Date().toISOString();
      const newProfile: StatsProfile = {
        id: makeStatsProfileId(isCloudMode),
        user_id: currentPlayerId,
        demographics_profile_id: source.demographics_profile_id ?? null,
        base_name: baseName,
        profile_version: nextVersion,
        display_name: makeProfileDisplayName(baseName, nextVersion),
        training_count: 0,
        training_completed: false,
        predictor_default: newProfileDefault,
        seen_post_training_cta: false,
        previous_profile_id: source.id,
        next_profile_id: null,
        archived: false,
        metadata: {} as StatsProfile["metadata"],
        created_at: timestamp,
        updated_at: timestamp,
        version: 1,
      };
      const pendingUpdates: StatsProfile[] = [];
      setProfiles(prev => {
        const updated = prev.map(p => {
          if (p.id === source.id) {
            const next: StatsProfile = {
              ...p,
              base_name: baseName,
              profile_version: sourceVersion,
              display_name: makeProfileDisplayName(baseName, sourceVersion),
              predictor_default: newProfileDefault ? false : p.predictor_default,
              next_profile_id: newProfile.id,
              updated_at: timestamp,
            };
            pendingUpdates.push(next);
            return next;
          }
          if (newProfileDefault && p.predictor_default) {
            const next: StatsProfile = {
              ...p,
              predictor_default: false,
              updated_at: timestamp,
            };
            pendingUpdates.push(next);
            return next;
          }
          return p;
        });
        return updated.concat(newProfile);
      });
      setCurrentProfileId(newProfile.id);
      if (isCloudMode) {
        void (async () => {
          const service = cloudDataService;
          if (!service) return;
          try {
            await service.upsertStatsProfile(newProfile);
          } catch (err) {
            console.error("Failed to fork cloud stats profile", err);
            return;
          }
          for (const entry of pendingUpdates) {
            try {
              await service.upsertStatsProfile(entry);
            } catch (err) {
              console.error("Failed to update related profile during cloud fork", err);
            }
          }
        })();
      } else {
        setProfilesDirty(true);
        saveCurrentProfileId(storage, newProfile.id, [currentPlayerId]);
      }
      return newProfile;
    },
    [currentPlayerId, isCloudMode, profiles, storage],
  );

  const logRound = useCallback(
    (round: Omit<RoundLog, "id" | "sessionId" | "playerId" | "profileId">) => {
      if (!currentPlayerId || !currentProfile) return null;
      const sessionId = ensureSession();
      if (!sessionId) {
        console.warn("Unable to log round: missing cloud session");
        return null;
      }
      const entryId = isCloudMode ? makeUuid() : makeId("r");
      const entry: RoundLog = {
        ...round,
        id: entryId,
        sessionId,
        playerId: currentPlayerId,
        profileId: currentProfile.id,
      };
      const roundsForProfile = allRounds.filter(
        r => r.playerId === currentPlayerId && (r.profileId ?? currentProfile.id) === currentProfile.id,
      );
      const entryMatchId = entry.matchId ?? null;
      const existingCount = roundsForProfile.filter(r => (r.matchId ?? null) === entryMatchId).length;
      setAllRounds(prev => {
        const next = prev.concat(entry);
        let finalNext = next;
        if (!isCloudMode) {
          const trimStart = Math.max(0, next.length - MAX_ROUNDS);
          finalNext = trimStart ? next.slice(trimStart) : next;
        }
        allRoundsRef.current = finalNext;
        return finalNext;
      });
      if (isCloudMode) {
        const service = cloudDataService;
        const roundNumber = existingCount + 1;
        const now = new Date().toISOString();
        const startedAt = sessionStartedAtRef.current || now;
        void (async () => {
          if (!service) return;
          try {
            await service.upsertSession({
              id: sessionId,
              userId: currentPlayerId,
              startedAt,
              clientSessionId: clientSessionIdRef.current,
              storageMode: "cloud",
              lastEventAt: now,
            });
            if (entry.matchId && currentProfile) {
              const matchId = entry.matchId;
              if (!seededMatchIdsRef.current.has(matchId)) {
                seededMatchIdsRef.current.add(matchId);
                const placeholderMatch: MatchSummary = {
                  id: matchId,
                  sessionId,
                  clientId: matchId,
                  playerId: currentPlayerId,
                  profileId: currentProfile.id,
                  startedAt: entry.t,
                  endedAt: entry.t,
                  mode: entry.mode,
                  bestOf: entry.bestOf,
                  difficulty: entry.difficulty,
                  score: { you: 0, ai: 0 },
                  rounds: 0,
                  aiWinRate: 0,
                  youSwitchedRate: 0,
                };
                try {
                  await service.insertMatches([placeholderMatch]);
                } catch (seedErr) {
                  seededMatchIdsRef.current.delete(matchId);
                  throw seedErr;
                }
              }
            }
            await service.insertRounds([{ round: entry, roundNumber }]);
          } catch (err) {
            console.error("Failed to log cloud round", err);
          }
        })();
      } else {
        setRoundsDirty(true);
      }
      return entry;
    },
    [allRounds, currentPlayerId, currentProfile, ensureSession, isCloudMode],
  );

  const logMatch = useCallback(
    (match: Omit<MatchSummary, "id" | "sessionId" | "playerId" | "profileId">) => {
      if (!currentPlayerId || !currentProfile) return null;
      const sessionId = ensureSession();
      if (!sessionId) {
        console.warn("Unable to log match: missing cloud session");
        return null;
      }
      const providedClientId = match.clientId?.trim();
      const entryId = providedClientId && providedClientId.length > 0 ? providedClientId : makeId("m");
      const entry: MatchSummary = {
        ...match,
        clientId: providedClientId ?? entryId,
        id: entryId,
        sessionId,
        playerId: currentPlayerId,
        profileId: currentProfile.id,
      };
      const asFiniteNumber = (value: unknown): number | null =>
        typeof value === "number" && Number.isFinite(value) ? value : null;
      let leaderboardPatch: Partial<MatchSummary> | null = null;
      if (entry.mode === "challenge") {
        const matchKey = entry.clientId ?? entry.id;
        const matchRounds = matchKey
          ? allRoundsRef.current.filter(round => {
              if (round.playerId !== entry.playerId) return false;
              if (round.profileId !== entry.profileId) return false;
              const roundMatchId = round.matchId;
              if (!roundMatchId) return false;
              return roundMatchId === matchKey || roundMatchId === entry.id;
            })
          : [];
        const breakdown = computeMatchScore(matchRounds);
        const entryRoundCount = asFiniteNumber(entry.leaderboardRoundCount);
        const fallbackRoundCount =
          breakdown?.rounds ?? (matchRounds.length > 0 ? matchRounds.length : entry.rounds ?? 0);
        const normalizedRoundCount = entryRoundCount ?? Math.max(0, Math.round(fallbackRoundCount));
        leaderboardPatch = {
          leaderboardScore: breakdown?.total ?? asFiniteNumber(entry.leaderboardScore) ?? 0,
          leaderboardMaxStreak: breakdown?.maxStreak ?? asFiniteNumber(entry.leaderboardMaxStreak) ?? 0,
          leaderboardRoundCount: normalizedRoundCount,
          leaderboardTimerBonus: breakdown?.timerBonus ?? asFiniteNumber(entry.leaderboardTimerBonus) ?? 0,
          leaderboardBeatConfidenceBonus:
            breakdown?.beatConfidenceBonus ?? asFiniteNumber(entry.leaderboardBeatConfidenceBonus) ?? 0,
          leaderboardType: "Challenge",
        };
      }
      const enrichedEntry = leaderboardPatch ? { ...entry, ...leaderboardPatch } : entry;
      setAllMatches(prev => prev.concat(enrichedEntry));
      if (isCloudMode) {
        const service = cloudDataService;
        const now = new Date().toISOString();
        const startedAt = sessionStartedAtRef.current || now;
        void (async () => {
          if (!service) return;
          try {
            await service.upsertSession({
              id: sessionId,
              userId: currentPlayerId,
              startedAt,
              clientSessionId: clientSessionIdRef.current,
              storageMode: "cloud",
              lastEventAt: now,
            });
            await service.insertMatches([enrichedEntry]);
            if (leaderboardPatch) {
              // Supabase's matches table expects challenge rows to persist leaderboard aggregates.
              const update = mapMatchPatchToCloudUpdate(leaderboardPatch);
              if (Object.keys(update).length > 0) {
                await service.updateMatchFields(currentPlayerId, enrichedEntry.id, update);
              }
            }
          } catch (err) {
            console.error("Failed to log cloud match", err);
          }
        })();
      } else {
        setMatchesDirty(true);
      }
      return enrichedEntry;
    },
    [currentPlayerId, currentProfile, ensureSession, isCloudMode],
  );

  const rounds = useMemo(() => {
    if (!currentPlayerId || !currentProfile) return [] as RoundLog[];
    return allRounds.filter(r => r.playerId === currentPlayerId && (r.profileId ?? currentProfile.id) === currentProfile.id);
  }, [allRounds, currentPlayerId, currentProfile]);

  const matches = useMemo(() => {
    if (!currentPlayerId || !currentProfile) return [] as MatchSummary[];
    return allMatches.filter(m => m.playerId === currentPlayerId && (m.profileId ?? currentProfile.id) === currentProfile.id);
  }, [allMatches, currentPlayerId, currentProfile]);

  const statsReady = useMemo(() => {
    if (!currentPlayerId || !currentProfile) return false;
    if (isCloudMode && !cloudProfilesHydrated) return false;
    return true;
  }, [cloudProfilesHydrated, currentPlayerId, currentProfile, isCloudMode]);

  const adminUpdateRound = useCallback(
    (id: string, patch: Partial<RoundLog>) => {
      setAllRounds(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
      if (isCloudMode) {
        const userId = currentPlayerId;
        if (userId) {
          const update = mapRoundPatchToCloudUpdate(patch);
          if (Object.keys(update).length > 0) {
            void cloudDataService
              ?.updateRoundFields(userId, id, update)
              .catch(err => console.error("Failed to update cloud round", err));
          }
        }
      } else {
        setRoundsDirty(true);
      }
    },
    [currentPlayerId, isCloudMode],
  );

  const adminDeleteRound = useCallback(
    (id: string) => {
      setAllRounds(prev => prev.filter(r => r.id !== id));
      if (isCloudMode) {
        const userId = currentPlayerId;
        if (userId) {
          void cloudDataService
            ?.deleteRound(userId, id)
            .catch(err => console.error("Failed to delete cloud round", err));
        }
      } else {
        setRoundsDirty(true);
      }
    },
    [currentPlayerId, isCloudMode],
  );

  const adminUpdateMatch = useCallback(
    (id: string, patch: Partial<MatchSummary>) => {
      setAllMatches(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
      if (isCloudMode) {
        const userId = currentPlayerId;
        if (userId) {
          const update = mapMatchPatchToCloudUpdate(patch);
          if (Object.keys(update).length > 0) {
            void cloudDataService
              ?.updateMatchFields(userId, id, update)
              .catch(err => console.error("Failed to update cloud match", err));
          }
        }
      } else {
        setMatchesDirty(true);
      }
    },
    [currentPlayerId, isCloudMode],
  );

  const adminDeleteMatch = useCallback(
    (id: string) => {
      setAllMatches(prev => prev.filter(m => m.id !== id));
      if (isCloudMode) {
        const userId = currentPlayerId;
        if (userId) {
          void cloudDataService
            ?.deleteMatch(userId, id)
            .catch(err => console.error("Failed to delete cloud match", err));
        }
      } else {
        setMatchesDirty(true);
      }
    },
    [currentPlayerId, isCloudMode],
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
    const profileName = currentProfile?.display_name ?? "";
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
    statsReady,
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
    statsReady,
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

