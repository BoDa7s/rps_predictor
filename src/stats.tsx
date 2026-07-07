import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AIMode, BestOf, Mode, Move, Outcome } from "./gameTypes";
import { normalizeHexColor } from "./colorUtils";
import { usePlayers } from "./players";
import type { MatchRecord, RoundRecord, PlayerProfile as TelemetryProfileRecord } from "./telemetry";
import {
  getTelemetryProfilePreferences,
  resolveTelemetryProfileSelectionForPlayer,
  telemetryService,
  useTelemetryStore,
} from "./telemetry";

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

export interface GameplayPreferences {
  aiDifficulty: AIMode;
  bestOf: BestOf;
}

export const DEFAULT_GAMEPLAY_PREFERENCES: GameplayPreferences = {
  aiDifficulty: "normal",
  bestOf: 5,
} as const;

export const GAMEPLAY_DIFFICULTY_OPTIONS: AIMode[] = ["fair", "normal", "ruthless"];
export const GAMEPLAY_BEST_OF_OPTIONS: BestOf[] = [3, 5, 7];

export interface ProfilePreferences {
  theme: ThemePreference;
  themeColors: ThemeColorPreferences;
  gameplay: GameplayPreferences;
}

export const DEFAULT_THEME_COLOR_PREFERENCES: ThemeColorPreferences = {
  light: {
    accent: "#2563EB",
    background: "#F6F8FC",
  },
  dark: {
    accent: "#60A5FA",
    background: "#0B1220",
  },
} as const;

export const LEGACY_DEFAULT_THEME_COLOR_PREFERENCES: ThemeColorPreferences = {
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
  gameplay: { ...DEFAULT_GAMEPLAY_PREFERENCES },
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
    gameplay: {
      aiDifficulty: preferences.gameplay.aiDifficulty,
      bestOf: preferences.gameplay.bestOf,
    },
  };
}

function normalizeGameplayPreferences(value: unknown): GameplayPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_GAMEPLAY_PREFERENCES };
  }
  const input = value as { aiDifficulty?: unknown; bestOf?: unknown };
  const aiDifficulty =
    input.aiDifficulty === "fair" || input.aiDifficulty === "normal" || input.aiDifficulty === "ruthless"
      ? input.aiDifficulty
      : DEFAULT_GAMEPLAY_PREFERENCES.aiDifficulty;
  const bestOf =
    input.bestOf === 3 || input.bestOf === 5 || input.bestOf === 7 ? input.bestOf : DEFAULT_GAMEPLAY_PREFERENCES.bestOf;
  return { aiDifficulty, bestOf };
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

function themeModeColorsEqual(a: ThemeModeColors, b: ThemeModeColors): boolean {
  return a.accent === b.accent && a.background === b.background;
}

export function migrateLegacyThemeColorPreferences(themeColors: ThemeColorPreferences): ThemeColorPreferences {
  const migrated: ThemeColorPreferences = {
    light: cloneThemeModeColors(themeColors.light),
    dark: cloneThemeModeColors(themeColors.dark),
  };

  (Object.keys(migrated) as ThemeMode[]).forEach(mode => {
    if (themeModeColorsEqual(migrated[mode], LEGACY_DEFAULT_THEME_COLOR_PREFERENCES[mode])) {
      migrated[mode] = cloneThemeModeColors(DEFAULT_THEME_COLOR_PREFERENCES[mode]);
    }
  });

  return migrated;
}

function normalizeThemeColors(value: unknown): ThemeColorPreferences {
  if (!value || typeof value !== "object") {
    return {
      light: cloneThemeModeColors(DEFAULT_THEME_COLOR_PREFERENCES.light),
      dark: cloneThemeModeColors(DEFAULT_THEME_COLOR_PREFERENCES.dark),
    };
  }
  const input = value as { light?: unknown; dark?: unknown };
  return migrateLegacyThemeColorPreferences({
    light: normalizeThemeModeColors(input.light, DEFAULT_THEME_COLOR_PREFERENCES.light),
    dark: normalizeThemeModeColors(input.dark, DEFAULT_THEME_COLOR_PREFERENCES.dark),
  });
}

function normalizePreferences(value: unknown): ProfilePreferences {
  if (!value || typeof value !== "object") {
    return cloneProfilePreferences();
  }
  const input = value as { theme?: unknown; themeColors?: unknown; gameplay?: unknown };
  const theme =
    input.theme === "dark" || input.theme === "light" || input.theme === "system"
      ? input.theme
      : DEFAULT_PROFILE_PREFERENCES.theme;
  const themeColors = normalizeThemeColors(input.themeColors);
  const gameplay = normalizeGameplayPreferences(input.gameplay);
  return { theme, themeColors, gameplay };
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
  deleteProfile: (id: string) => void;
  forkProfileVersion: (id: string) => StatsProfile | null;
  exportRoundsCsv: () => string;
  buildProfilesCsv: () => string;
  buildSessionsCsv: () => string;
  buildMatchesCsv: () => string;
  buildTelemetryRoundsCsv: () => string;
  buildPredictionsCsv: () => string;
  buildEventsCsv: () => string;
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

const MAX_ROUNDS = 1000;
const PRIMARY_BASE = "primary";

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

export function getOrderedStatsProfilesForPlayer(profiles: StatsProfile[], playerId: string): StatsProfile[] {
  const filtered = profiles.filter(profile => profile.playerId === playerId);
  const normalized = filtered.map(profile => {
    const baseName = normalizeBaseName(profile.baseName ?? profile.name);
    const rawVersion = profile.version;
    const version =
      typeof rawVersion === "number" && Number.isFinite(rawVersion) ? Math.max(1, Math.floor(rawVersion)) : 1;
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
}

export function getActiveStatsProfileForPlayer(profiles: StatsProfile[], playerId: string): StatsProfile | null {
  return getOrderedStatsProfilesForPlayer(profiles, playerId)[0] ?? null;
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return prefix + "-" + (crypto as any).randomUUID();
  }
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function telemetryRoundToRoundLog(round: RoundRecord): RoundLog {
  return {
    id: round.id,
    sessionId: round.sessionId,
    matchId: round.matchId,
    playerId: round.playerId,
    profileId: round.profileId,
    t: round.timestamp,
    mode: round.mode as Mode,
    bestOf: round.bestOf,
    difficulty: round.difficulty,
    player: round.player,
    ai: round.ai,
    outcome: round.outcome,
    policy: round.policy,
    mixer: round.mixer,
    heuristic: round.heuristic,
    streakAI: round.streakAI,
    streakYou: round.streakYou,
    reason: round.reason,
    confidence: round.confidence,
    confidenceBucket: round.confidenceBucket,
    decisionTimeMs: round.decisionTimeMs,
  };
}

function telemetryMatchToMatchSummary(match: MatchRecord): MatchSummary {
  return {
    id: match.id,
    clientId: match.sourceMatchId ? match.id : undefined,
    sessionId: match.sessionId,
    playerId: match.playerId,
    profileId: match.profileId,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    mode: match.mode as Mode,
    bestOf: match.bestOf,
    difficulty: match.difficulty,
    score: match.score,
    rounds: match.roundsPlayed || match.rounds,
    aiWinRate: match.aiWinRate,
    youSwitchedRate: match.youSwitchedRate,
    notes: match.notes,
    leaderboardScore: match.leaderboardScore,
    leaderboardMaxStreak: match.leaderboardMaxStreak,
    leaderboardRoundCount: match.leaderboardRoundCount,
    leaderboardTimerBonus: match.leaderboardTimerBonus,
    leaderboardBeatConfidenceBonus: match.leaderboardBeatConfidenceBonus,
    leaderboardType: match.leaderboardType,
  };
}

function telemetryProfileToStatsProfile(
  profile: TelemetryProfileRecord,
  storedPreferences: unknown,
): StatsProfile {
  const preferences = normalizePreferences(getTelemetryProfilePreferences(profile, storedPreferences));
  const baseName = normalizeBaseName(profile.baseName ?? profile.name);
  const version =
    typeof profile.version === "number" && Number.isFinite(profile.version) ? Math.max(1, Math.floor(profile.version)) : 1;
  return {
    id: profile.id,
    playerId: profile.playerId,
    name: makeProfileDisplayName(baseName, version),
    createdAt: profile.createdAt,
    trainingCount: profile.trainingCount,
    trained: profile.trained,
    predictorDefault: profile.predictorDefault,
    seenPostTrainingCTA: profile.seenPostTrainingCTA,
    baseName,
    version,
    previousProfileId: profile.previousProfileId ?? null,
    nextProfileId: profile.nextProfileId ?? null,
    preferences,
  };
}

export function StatsProvider({ children }: { children: React.ReactNode }) {
  const telemetry = useTelemetryStore();
  const [sessionRuntime, setSessionRuntime] = useState(() => ({
    id: makeId("sess"),
    startedAt: new Date().toISOString(),
  }));
  const sessionIdRef = useRef<string>(sessionRuntime.id);
  const sessionStartedAtRef = useRef<string>(sessionRuntime.startedAt);
  const sessionEventLoggedRef = useRef(false);
  const sessionStartedRef = useRef(false);
  const sessionEndedRef = useRef(false);
  const sessionPlayerIdRef = useRef<string | null>(null);
  const sessionProfileIdRef = useRef<string | null>(null);
  const sessionScopeRef = useRef<string | null>(null);
  const knownPlayerIdsRef = useRef<Set<string>>(new Set());
  const knownPlayerIdsInitializedRef = useRef(false);
  const { players, currentPlayerId } = usePlayers();
  const profiles = useMemo(
    () =>
      telemetry.profiles.map(profile =>
        telemetryProfileToStatsProfile(profile, telemetry.store.profilePreferencesById[profile.id]),
      ),
    [telemetry.profiles, telemetry.store.profilePreferencesById],
  );
  const currentProfileId = telemetry.currentProfileId;
  const currentTelemetryProfileSelection = useMemo(
    () => resolveTelemetryProfileSelectionForPlayer(telemetry.profiles, currentPlayerId, currentProfileId),
    [currentPlayerId, currentProfileId, telemetry.profiles],
  );
  const modelStates = useMemo<StoredPredictorModelState[]>(
    () =>
      telemetry.modelStates.map(state => ({
        profileId: state.profileId,
        modelVersion: state.modelVersion,
        updatedAt: state.updatedAt,
        roundsSeen: state.roundsSeen,
        state: {
          eta: state.state.eta,
          weights: [...state.state.weights],
          experts: state.state.experts as SerializedExpertState[],
        },
      })),
    [telemetry.modelStates],
  );

  useEffect(() => {
    sessionIdRef.current = sessionRuntime.id;
    sessionStartedAtRef.current = sessionRuntime.startedAt;
  }, [sessionRuntime.id, sessionRuntime.startedAt]);

  const sessionId = sessionRuntime.id;
  const playerProfiles = useMemo(() => {
    return currentTelemetryProfileSelection.orderedProfiles.map(profile =>
      telemetryProfileToStatsProfile(profile, telemetry.store.profilePreferencesById[profile.id]),
    );
  }, [currentTelemetryProfileSelection.orderedProfiles, telemetry.store.profilePreferencesById]);

  useEffect(() => {
    if (!currentPlayerId) {
      if (currentProfileId) {
        telemetryService.setCurrentProfile(null);
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
      telemetryService.upsertPlayerProfile(
        players.find(player => player.id === currentPlayerId),
        defaultProfile,
      );
      telemetryService.setCurrentProfile(defaultProfile.id);
      telemetryService.logUIEvent({
        sessionId,
        timestamp: new Date().toISOString(),
        playerId: currentPlayerId,
        profileId: defaultProfile.id,
        surface: "play-shell",
        action: "profile-created",
        detail: "default-profile",
      });
      return;
    }
    if (currentTelemetryProfileSelection.activeProfileId !== currentProfileId) {
      telemetryService.setCurrentProfile(currentTelemetryProfileSelection.activeProfileId);
    }
  }, [currentPlayerId, currentProfileId, currentTelemetryProfileSelection.activeProfileId, playerProfiles.length, players, sessionId]);

  const currentProfile = useMemo(() => {
    const activeProfile = currentTelemetryProfileSelection.activeProfile;
    if (!activeProfile) return null;
    return telemetryProfileToStatsProfile(activeProfile, telemetry.store.profilePreferencesById[activeProfile.id]);
  }, [currentTelemetryProfileSelection.activeProfile, telemetry.store.profilePreferencesById]);

  const endCurrentSession = useCallback((detail: string) => {
    if (!sessionEventLoggedRef.current) return;
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    const endedAt = new Date().toISOString();
    telemetryService.logUIEvent({
      sessionId: sessionIdRef.current,
      timestamp: endedAt,
      playerId: sessionPlayerIdRef.current ?? undefined,
      profileId: sessionProfileIdRef.current ?? null,
      surface: "play-shell",
      action: "session-ended",
      detail,
    });
    telemetryService.endSession(sessionIdRef.current, endedAt);
  }, []);

  useEffect(() => {
    const nextScope = currentPlayerId && currentProfile?.id ? `${currentPlayerId}:${currentProfile.id}` : null;
    if (sessionScopeRef.current === nextScope) {
      sessionPlayerIdRef.current = currentPlayerId ?? null;
      sessionProfileIdRef.current = currentProfile?.id ?? null;
      return;
    }

    if (sessionScopeRef.current) {
      endCurrentSession("scope-changed");
    }

    sessionScopeRef.current = nextScope;
    sessionPlayerIdRef.current = currentPlayerId ?? null;
    sessionProfileIdRef.current = currentProfile?.id ?? null;
    sessionEventLoggedRef.current = false;
    sessionStartedRef.current = false;
    sessionEndedRef.current = false;
    setSessionRuntime({
      id: makeId("sess"),
      startedAt: new Date().toISOString(),
    });
  }, [currentPlayerId, currentProfile?.id, endCurrentSession]);

  useEffect(() => {
    if (!knownPlayerIdsInitializedRef.current) {
      knownPlayerIdsRef.current = new Set(players.map(player => player.id));
      knownPlayerIdsInitializedRef.current = true;
      return;
    }

    const nextPlayerIds = new Set(players.map(player => player.id));
    players.forEach(player => {
      if (knownPlayerIdsRef.current.has(player.id)) return;
      telemetryService.logUIEvent({
        sessionId,
        timestamp: new Date().toISOString(),
        playerId: player.id,
        profileId: null,
        surface: "player-setup",
        action: "player-created",
        value: player.playerName,
        meta: {
          grade: player.grade,
          hasSchool: Boolean(player.school),
          hasPriorExperience: Boolean(player.priorExperience),
        },
      });
    });
    knownPlayerIdsRef.current = nextPlayerIds;
  }, [players, sessionId]);

  useEffect(() => {
    if (!currentPlayerId || !currentProfile) return;
    if (sessionId !== sessionIdRef.current) return;
    if (sessionEndedRef.current || sessionStartedRef.current) return;
    telemetryService.startSession({
      id: sessionId,
      playerId: currentPlayerId,
      profileId: currentProfile.id,
      startedAt: sessionStartedAtRef.current,
      initialRoute: "/play",
      activeMatchId: null,
    });
    sessionPlayerIdRef.current = currentPlayerId;
    sessionProfileIdRef.current = currentProfile.id;
    sessionStartedRef.current = true;
    if (!sessionEventLoggedRef.current) {
      telemetryService.logUIEvent({
        sessionId,
        timestamp: sessionStartedAtRef.current,
        playerId: currentPlayerId,
        profileId: currentProfile.id,
        surface: "play-shell",
        action: "session-started",
      });
      sessionEventLoggedRef.current = true;
    }
  }, [currentPlayerId, currentProfile?.id, sessionId]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        endCurrentSession("visibility-hidden");
      }
    };
    const handleBeforeUnload = () => endCurrentSession("beforeunload");
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      endCurrentSession("provider-unmount");
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [endCurrentSession]);

  const selectProfile = useCallback((id: string) => {
    if (!playerProfiles.some(p => p.id === id)) return;
    telemetryService.setCurrentProfile(id);
    telemetryService.logUIEvent({
      sessionId,
      timestamp: new Date().toISOString(),
      playerId: currentPlayerId ?? undefined,
      profileId: id,
      surface: "play-shell",
      action: "profile-selected",
    });
  }, [currentPlayerId, playerProfiles, sessionId]);

  const getModelStateForProfile = useCallback(
    (profileId: string): StoredPredictorModelState | null => {
      return modelStates.find(state => state.profileId === profileId) ?? null;
    },
    [modelStates],
  );

  const saveModelStateForProfile = useCallback(
    (profileId: string, state: StoredPredictorModelState) => {
      telemetryService.upsertPredictorModelState({
        profileId,
        modelVersion: state.modelVersion,
        updatedAt: state.updatedAt,
        roundsSeen: state.roundsSeen,
        state: {
          eta: state.state.eta,
          weights: [...state.state.weights],
          experts: state.state.experts,
        },
      });
    },
    [],
  );

  const clearModelStateForProfile = useCallback((profileId: string) => {
    telemetryService.deletePredictorModelState(profileId);
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
      telemetryService.upsertPlayerProfile(
        players.find(player => player.id === targetPlayerId),
        profile,
      );
      telemetryService.logUIEvent({
        sessionId,
        timestamp: new Date().toISOString(),
        playerId: targetPlayerId,
        profileId: profile.id,
        surface: "play-shell",
        action: "profile-created",
      });
      if (!playerIdOverride || playerIdOverride === currentPlayerId) {
        telemetryService.setCurrentProfile(profile.id);
      }
      return profile;
    },
    [currentPlayerId, profiles, players, sessionId]
  );

  const updateProfile = useCallback((id: string, patch: StatsProfileUpdate) => {
    const current = profiles.find(profile => profile.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
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
    telemetryService.upsertPlayerProfile(
      players.find(player => player.id === next.playerId),
      next,
    );
  }, [players, profiles]);

  const deleteProfile = useCallback((id: string) => {
    telemetryService.deleteProfile(id);
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
    const updatedSource: StatsProfile = {
      ...source,
      baseName,
      version: sourceVersion,
      name: makeProfileDisplayName(baseName, sourceVersion),
      nextProfileId: newProfile.id,
    };
    telemetryService.upsertPlayerProfile(
      players.find(player => player.id === currentPlayerId),
      updatedSource,
    );
    telemetryService.upsertPlayerProfile(
      players.find(player => player.id === currentPlayerId),
      newProfile,
    );
    telemetryService.logUIEvent({
      sessionId,
      timestamp: new Date().toISOString(),
      playerId: currentPlayerId,
      profileId: newProfile.id,
      surface: "play-shell",
      action: "profile-forked",
      detail: source.id,
    });
    telemetryService.setCurrentProfile(newProfile.id);
    return newProfile;
  }, [currentPlayerId, profiles, players, sessionId]);

  const logRound = useCallback((round: Omit<RoundLog, "id" | "sessionId" | "playerId" | "profileId">) => {
    if (!currentPlayerId || !currentProfile) return null;
    const entry: RoundLog = {
      ...round,
      id: makeId("r"),
      sessionId,
      playerId: currentPlayerId,
      profileId: currentProfile.id,
    };
    telemetryService.logRound(entry);
    return entry;
  }, [sessionId, currentPlayerId, currentProfile]);

  const logMatch = useCallback((match: Omit<MatchSummary, "id" | "sessionId" | "playerId" | "profileId">) => {
    if (!currentPlayerId || !currentProfile) return null;
    const canonicalMatchId = match.clientId ?? makeId("m");
    const entry: MatchSummary = {
      ...match,
      id: canonicalMatchId,
      sessionId,
      playerId: currentPlayerId,
      profileId: currentProfile.id,
    };
    telemetryService.logMatch(entry);
    return entry;
  }, [sessionId, currentPlayerId, currentProfile]);

  const telemetryRoundLogs = useMemo(() => telemetry.rounds.map(telemetryRoundToRoundLog), [telemetry.rounds]);
  const telemetryMatchSummaries = useMemo(() => telemetry.matches.map(telemetryMatchToMatchSummary), [telemetry.matches]);

  const rounds = useMemo(() => {
    if (!currentPlayerId || !currentProfile) return [] as RoundLog[];
    return telemetryRoundLogs.filter(r => r.playerId === currentPlayerId && (r.profileId ?? currentProfile.id) === currentProfile.id);
  }, [currentPlayerId, currentProfile, telemetryRoundLogs]);

  const matches = useMemo(() => {
    if (!currentPlayerId || !currentProfile) return [] as MatchSummary[];
    return telemetryMatchSummaries.filter(m => m.playerId === currentPlayerId && (m.profileId ?? currentProfile.id) === currentProfile.id);
  }, [currentPlayerId, currentProfile, telemetryMatchSummaries]);

  const adminUpdateRound = useCallback((id: string, patch: Partial<RoundLog>) => {
    const current = telemetryService.getStore().roundsById[id];
    if (!current) return;
    const next = {
      ...current,
      timestamp: patch.t ?? current.timestamp,
      matchId: patch.matchId ?? current.matchId,
      playerId: patch.playerId ?? current.playerId,
      profileId: patch.profileId ?? current.profileId,
      mode: (patch.mode ?? current.mode) as Mode,
      bestOf: patch.bestOf ?? current.bestOf,
      difficulty: patch.difficulty ?? current.difficulty,
      player: patch.player ?? current.player,
      ai: patch.ai ?? current.ai,
      outcome: patch.outcome ?? current.outcome,
      policy: patch.policy ?? current.policy,
      confidence: patch.confidence ?? current.confidence,
      confidenceBucket: patch.confidenceBucket ?? current.confidenceBucket,
      reason: patch.reason ?? current.reason,
      decisionTimeMs: patch.decisionTimeMs ?? current.decisionTimeMs,
      streakAI: patch.streakAI ?? current.streakAI,
      streakYou: patch.streakYou ?? current.streakYou,
      mixer: patch.mixer ?? current.mixer,
      heuristic: patch.heuristic ?? current.heuristic,
      predictionId: (patch.mode ?? current.mode) === "challenge" ? current.predictionId : undefined,
    };
    telemetryService.upsertRound(next);
    telemetryService.logUIEvent({
      sessionId,
      timestamp: new Date().toISOString(),
      surface: "developer-console",
      action: "admin-round-updated",
      roundId: id,
    });
  }, [sessionId]);

  const adminDeleteRound = useCallback((id: string) => {
    telemetryService.deleteRound(id);
    telemetryService.logUIEvent({
      sessionId,
      timestamp: new Date().toISOString(),
      surface: "developer-console",
      action: "admin-round-deleted",
      roundId: id,
    });
  }, [sessionId]);

  const adminUpdateMatch = useCallback((id: string, patch: Partial<MatchSummary>) => {
    const current = telemetryService.getStore().matchesById[id];
    if (!current) return;
    const nextScore = patch.score ?? current.score;
    const nextEndedAt = patch.endedAt ?? current.endedAt;
    const nextWinner: MatchRecord["winner"] =
      nextScore.you > nextScore.ai ? "player" : nextScore.ai > nextScore.you ? "ai" : "tie";
    const nextStatus: MatchRecord["status"] = nextEndedAt ? "completed" : "active";
    const next = {
      ...current,
      startedAt: patch.startedAt ?? current.startedAt,
      endedAt: nextEndedAt,
      mode: ((patch.mode ?? current.mode) as Mode),
      bestOf: patch.bestOf ?? current.bestOf,
      difficulty: patch.difficulty ?? current.difficulty,
      score: nextScore,
      rounds: patch.rounds ?? current.rounds,
      roundsPlayed: patch.rounds ?? current.roundsPlayed,
      aiWinRate: patch.aiWinRate ?? current.aiWinRate,
      youSwitchedRate: patch.youSwitchedRate ?? current.youSwitchedRate,
      notes: patch.notes ?? current.notes,
      leaderboardScore: patch.leaderboardScore ?? current.leaderboardScore,
      leaderboardMaxStreak: patch.leaderboardMaxStreak ?? current.leaderboardMaxStreak,
      leaderboardRoundCount: patch.leaderboardRoundCount ?? current.leaderboardRoundCount,
      leaderboardTimerBonus: patch.leaderboardTimerBonus ?? current.leaderboardTimerBonus,
      leaderboardBeatConfidenceBonus: patch.leaderboardBeatConfidenceBonus ?? current.leaderboardBeatConfidenceBonus,
      leaderboardType: patch.leaderboardType ?? current.leaderboardType,
      winner: nextWinner,
      completed: Boolean(nextEndedAt),
      status: nextStatus,
    };
    telemetryService.upsertMatch(next);
    telemetryService.logUIEvent({
      sessionId,
      timestamp: new Date().toISOString(),
      surface: "developer-console",
      action: "admin-match-updated",
      matchId: id,
    });
  }, [sessionId]);

  const adminDeleteMatch = useCallback((id: string) => {
    telemetryService.deleteMatch(id);
    telemetryService.logUIEvent({
      sessionId,
      timestamp: new Date().toISOString(),
      surface: "developer-console",
      action: "admin-match-deleted",
      matchId: id,
    });
  }, [sessionId]);

  const exportRoundsCsv = useCallback(() => {
    return telemetryService.buildLegacyRoundsCsv({
      playerId: currentPlayerId,
      profileId: currentProfile?.id ?? null,
    });
  }, [currentPlayerId, currentProfile]);
  const buildProfilesCsv = useCallback(() => telemetryService.buildProfilesCsv(), []);
  const buildSessionsCsv = useCallback(() => telemetryService.buildSessionsCsv(), []);
  const buildMatchesCsv = useCallback(() => telemetryService.buildMatchesCsv(), []);
  const buildTelemetryRoundsCsv = useCallback(() => telemetryService.buildRoundsCsv(), []);
  const buildPredictionsCsv = useCallback(() => telemetryService.buildPredictionsCsv(), []);
  const buildEventsCsv = useCallback(() => telemetryService.buildEventsCsv(), []);

  const value = useMemo<StatsContextValue>(() => ({
    rounds,
    matches,
    sessionId,
    currentProfileId,
    currentProfile: currentProfile ?? null,
    profiles: playerProfiles,
    logRound,
    logMatch,
    selectProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    forkProfileVersion,
    exportRoundsCsv,
    buildProfilesCsv,
    buildSessionsCsv,
    buildMatchesCsv,
    buildTelemetryRoundsCsv,
    buildPredictionsCsv,
    buildEventsCsv,
    getModelStateForProfile,
    saveModelStateForProfile,
    clearModelStateForProfile,
    adminRounds: telemetryRoundLogs,
    adminMatches: telemetryMatchSummaries,
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
    deleteProfile,
    forkProfileVersion,
    exportRoundsCsv,
    buildProfilesCsv,
    buildSessionsCsv,
    buildMatchesCsv,
    buildTelemetryRoundsCsv,
    buildPredictionsCsv,
    buildEventsCsv,
    getModelStateForProfile,
    saveModelStateForProfile,
    clearModelStateForProfile,
    telemetryRoundLogs,
    telemetryMatchSummaries,
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

