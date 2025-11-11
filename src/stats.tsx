import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AIMode, BestOf, Mode, Move, Outcome } from "./gameTypes";
import { normalizeHexColor } from "./colorUtils";
import { usePlayers } from "./players";

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

export type ThemePreference = "system" | "light" | "dark";

export type ThemeMode = "light" | "dark";

export interface ThemeModeColors {
  accent: string;
  background: string;
}

export type ThemeColorPreferences = Record<ThemeMode, ThemeModeColors>;

export interface ProfilePreferences {
  theme: ThemePreference;
  themeColors: ThemeColorPreferences;
}

export const DEFAULT_THEME_COLOR_PREFERENCES: ThemeColorPreferences = {
  light: {
    accent: "#0EA5E9",
    background: "#F8FAFC",
  },
  dark: {
    accent: "#A4796A",
    background: "#1F1F1F",
  },
} as const;

export const DEFAULT_PROFILE_PREFERENCES: ProfilePreferences = {
  theme: "system",
  themeColors: {
    light: { ...DEFAULT_THEME_COLOR_PREFERENCES.light },
    dark: { ...DEFAULT_THEME_COLOR_PREFERENCES.dark },
  },
} as const;

function cloneThemeModeColors(value: ThemeModeColors): ThemeModeColors {
  return { accent: value.accent, background: value.background };
}

export function cloneProfilePreferences(
  preferences: ProfilePreferences = DEFAULT_PROFILE_PREFERENCES,
): ProfilePreferences {
  return {
    theme: preferences.theme,
    themeColors: {
      light: cloneThemeModeColors(preferences.themeColors.light),
      dark: cloneThemeModeColors(preferences.themeColors.dark),
    },
  };
}

function normalizeThemeModeColors(value: unknown, fallback: ThemeModeColors): ThemeModeColors {
  if (!value || typeof value !== "object") {
    return cloneThemeModeColors(fallback);
  }
  const input = value as { accent?: unknown; background?: unknown };
  return {
    accent: normalizeHexColor(input.accent, fallback.accent),
    background: normalizeHexColor(input.background, fallback.background),
  };
}

function normalizeThemeColors(value: unknown): ThemeColorPreferences {
  if (!value || typeof value !== "object") {
    return {
      light: cloneThemeModeColors(DEFAULT_THEME_COLOR_PREFERENCES.light),
      dark: cloneThemeModeColors(DEFAULT_THEME_COLOR_PREFERENCES.dark),
    };
  }
  const input = value as { light?: unknown; dark?: unknown };
  return {
    light: normalizeThemeModeColors(input.light, DEFAULT_THEME_COLOR_PREFERENCES.light),
    dark: normalizeThemeModeColors(input.dark, DEFAULT_THEME_COLOR_PREFERENCES.dark),
  };
}

function normalizePreferences(value: unknown): ProfilePreferences {
  if (!value || typeof value !== "object") {
    return cloneProfilePreferences();
  }
  const input = value as { theme?: unknown; themeColors?: unknown };
  const theme =
    input.theme === "dark" || input.theme === "light" || input.theme === "system"
      ? input.theme
      : DEFAULT_PROFILE_PREFERENCES.theme;
  const themeColors = normalizeThemeColors(input.themeColors);
  return { theme, themeColors };
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
  preferences: ProfilePreferences;
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
    | "preferences"
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

function loadFromStorage<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to read stats", err);
    return [];
  }
}

function saveToStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("Failed to persist stats", err);
  }
}

function loadModelStates(): StoredPredictorModelState[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MODEL_STATE_KEY);
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

function saveModelStates(states: StoredPredictorModelState[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MODEL_STATE_KEY, JSON.stringify(states));
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

function loadProfiles(): StatsProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
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
        preferences: normalizePreferences(item?.preferences),
      } satisfies StatsProfile;
    });
  } catch (err) {
    console.warn("Failed to read stats profiles", err);
    return [];
  }
}

function saveProfiles(profiles: StatsProfile[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
  } catch (err) {
    console.warn("Failed to persist stats profiles", err);
  }
}

function loadCurrentProfileId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(CURRENT_PROFILE_KEY);
  } catch (err) {
    console.warn("Failed to read current stats profile", err);
    return null;
  }
}

function saveCurrentProfileId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(CURRENT_PROFILE_KEY, id);
    else localStorage.removeItem(CURRENT_PROFILE_KEY);
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
  const [allRounds, setAllRounds] = useState<RoundLog[]>(() => loadFromStorage<RoundLog>(ROUND_KEY));
  const [allMatches, setAllMatches] = useState<MatchSummary[]>(() => {
    const loaded = loadFromStorage<MatchSummary>(MATCH_KEY);
    const { matches, changed } = migrateMatchRecords(loaded);
    if (changed) {
      saveToStorage(MATCH_KEY, matches);
    }
    return matches;
  });
  const [profiles, setProfiles] = useState<StatsProfile[]>(() => loadProfiles());
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(() => loadCurrentProfileId());
  const [roundsDirty, setRoundsDirty] = useState(false);
  const [matchesDirty, setMatchesDirty] = useState(false);
  const [profilesDirty, setProfilesDirty] = useState(false);
  const [modelStates, setModelStates] = useState<StoredPredictorModelState[]>(() => loadModelStates());
  const [modelStatesDirty, setModelStatesDirty] = useState(false);
  const sessionIdRef = useRef<string>("");
  const { currentPlayerId, currentPlayer } = usePlayers();

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
        saveCurrentProfileId(null);
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
        predictorDefault: false,
        seenPostTrainingCTA: false,
        previousProfileId: null,
        nextProfileId: null,
        preferences: cloneProfilePreferences(),
      };
      setProfiles(prev => prev.concat(defaultProfile));
      setProfilesDirty(true);
      setCurrentProfileId(defaultProfile.id);
      saveCurrentProfileId(defaultProfile.id);
      return;
    }
    const belongs = currentProfileId && playerProfiles.some(p => p.id === currentProfileId);
    if (!belongs) {
      const fallback = playerProfiles[0];
      if (fallback && fallback.id !== currentProfileId) {
        setCurrentProfileId(fallback.id);
        saveCurrentProfileId(fallback.id);
      }
    }
  }, [currentPlayerId, currentProfileId, playerProfiles]);

  const currentProfile = useMemo(() => {
    if (!currentProfileId) return playerProfiles[0] ?? null;
    return playerProfiles.find(p => p.id === currentProfileId) ?? playerProfiles[0] ?? null;
  }, [currentProfileId, playerProfiles]);

  useEffect(() => {
    if (!roundsDirty) return;
    const timer = window.setTimeout(() => {
      saveToStorage(ROUND_KEY, allRounds);
      setRoundsDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [roundsDirty, allRounds]);

  useEffect(() => {
    if (!matchesDirty) return;
    const timer = window.setTimeout(() => {
      saveToStorage(MATCH_KEY, allMatches);
      setMatchesDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [matchesDirty, allMatches]);

  useEffect(() => {
    if (!profilesDirty) return;
    const timer = window.setTimeout(() => {
      saveProfiles(profiles);
      setProfilesDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [profilesDirty, profiles]);

  useEffect(() => {
    if (!modelStatesDirty) return;
    const timer = window.setTimeout(() => {
      saveModelStates(modelStates);
      setModelStatesDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [modelStatesDirty, modelStates]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const flush = () => {
      if (!modelStatesDirty) return;
      saveModelStates(modelStates);
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
  }, [modelStatesDirty, modelStates]);

  useEffect(() => {
    if (!currentPlayerId) return;
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
  }, [currentPlayerId, playerProfiles, allRounds, allMatches]);

  const selectProfile = useCallback((id: string) => {
    if (!playerProfiles.some(p => p.id === id)) return;
    setCurrentProfileId(id);
    saveCurrentProfileId(id);
  }, [playerProfiles]);

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
      setModelStatesDirty(true);
    },
    [],
  );

  const clearModelStateForProfile = useCallback((profileId: string) => {
    setModelStates(prev => {
      const next = prev.filter(entry => entry.profileId !== profileId);
      if (next.length !== prev.length) {
        setModelStatesDirty(true);
      }
      return next;
    });
  }, []);

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
        preferences: cloneProfilePreferences(),
      };
      setProfiles(prev => prev.concat(profile));
      setProfilesDirty(true);
      if (!playerIdOverride || playerIdOverride === currentPlayerId) {
        setCurrentProfileId(profile.id);
        saveCurrentProfileId(profile.id);
      }
      return profile;
    },
    [currentPlayerId, profiles]
  );

  const updateProfile = useCallback((id: string, patch: StatsProfileUpdate) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== id) return p;
      const next = { ...p, ...patch };
      if (patch.preferences) {
        next.preferences = cloneProfilePreferences(patch.preferences);
      }
      if (patch.baseName || patch.version) {
        const baseName = normalizeBaseName(patch.baseName ?? next.baseName);
        const rawVersion = patch.version ?? next.version ?? 1;
        const version =
          typeof rawVersion === "number" && Number.isFinite(rawVersion) ? Math.max(1, Math.floor(rawVersion)) : 1;
        next.baseName = baseName;
        next.version = version;
        next.name = makeProfileDisplayName(baseName, version);
      }
      return next;
    }));
    setProfilesDirty(true);
  }, []);

  const forkProfileVersion = useCallback((id: string) => {
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
      preferences: cloneProfilePreferences(source.preferences),
    };
    setProfiles(prev => {
      const updated = prev.map(p => {
        if (p.id !== source.id) return p;
        return {
          ...p,
          baseName,
          version: sourceVersion,
          name: makeProfileDisplayName(baseName, sourceVersion),
          nextProfileId: newProfile.id,
        };
      });
      return updated.concat(newProfile);
    });
    setProfilesDirty(true);
    setCurrentProfileId(newProfile.id);
    saveCurrentProfileId(newProfile.id);
    return newProfile;
  }, [currentPlayerId, profiles]);

  const logRound = useCallback((round: Omit<RoundLog, "id" | "sessionId" | "playerId" | "profileId">) => {
    if (!currentPlayerId || !currentProfile) return null;
    const entry: RoundLog = {
      ...round,
      id: makeId("r"),
      sessionId,
      playerId: currentPlayerId,
      profileId: currentProfile.id,
    };
    setAllRounds(prev => {
      const next = prev.concat(entry);
      const trimStart = Math.max(0, next.length - MAX_ROUNDS);
      return trimStart ? next.slice(trimStart) : next;
    });
    setRoundsDirty(true);
    return entry;
  }, [sessionId, currentPlayerId, currentProfile]);

  const logMatch = useCallback((match: Omit<MatchSummary, "id" | "sessionId" | "playerId" | "profileId">) => {
    if (!currentPlayerId || !currentProfile) return null;
    const entry: MatchSummary = {
      ...match,
      id: makeId("m"),
      sessionId,
      playerId: currentPlayerId,
      profileId: currentProfile.id,
    };
    setAllMatches(prev => prev.concat(entry));
    setMatchesDirty(true);
    return entry;
  }, [sessionId, currentPlayerId, currentProfile]);

  const rounds = useMemo(() => {
    if (!currentPlayerId || !currentProfile) return [] as RoundLog[];
    return allRounds.filter(r => r.playerId === currentPlayerId && (r.profileId ?? currentProfile.id) === currentProfile.id);
  }, [allRounds, currentPlayerId, currentProfile]);

  const matches = useMemo(() => {
    if (!currentPlayerId || !currentProfile) return [] as MatchSummary[];
    return allMatches.filter(m => m.playerId === currentPlayerId && (m.profileId ?? currentProfile.id) === currentProfile.id);
  }, [allMatches, currentPlayerId, currentProfile]);

  const adminUpdateRound = useCallback((id: string, patch: Partial<RoundLog>) => {
    setAllRounds(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
    setRoundsDirty(true);
  }, []);

  const adminDeleteRound = useCallback((id: string) => {
    setAllRounds(prev => prev.filter(r => r.id !== id));
    setRoundsDirty(true);
  }, []);

  const adminUpdateMatch = useCallback((id: string, patch: Partial<MatchSummary>) => {
    setAllMatches(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
    setMatchesDirty(true);
  }, []);

  const adminDeleteMatch = useCallback((id: string) => {
    setAllMatches(prev => prev.filter(m => m.id !== id));
    setMatchesDirty(true);
  }, []);

  const exportRoundsCsv = useCallback(() => {
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
    const playerName = currentPlayer?.playerName ?? "";
    const grade = currentPlayer?.grade ?? "";
    const school = currentPlayer?.school ?? "";
    const prior = currentPlayer?.priorExperience ?? "";
    const profileName = currentProfile?.name ?? "";
    rounds.forEach(r => {
      lines.push([
        r.playerId,
        JSON.stringify(playerName),
        grade,
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

