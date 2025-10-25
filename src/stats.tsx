import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AIMode, BestOf, Mode, Move, Outcome } from "./gameTypes";
import { usePlayers } from "./players";

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
}

export interface StatsProfile {
  id: string;
  playerId: string;
  name: string;
  createdAt: string;
  trainingCount: number;
  trained: boolean;
  predictorDefault: boolean;
  baseName: string;
  version: number;
  previousProfileId?: string | null;
  nextProfileId?: string | null;
}

type StatsProfileUpdate = Partial<
  Pick<
    StatsProfile,
    "name" | "trainingCount" | "trained" | "predictorDefault" | "baseName" | "version" | "previousProfileId" | "nextProfileId"
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
        predictorDefault: item?.predictorDefault !== undefined ? Boolean(item.predictorDefault) : true,
        previousProfileId: typeof item?.previousProfileId === "string" ? item.previousProfileId : null,
        nextProfileId: typeof item?.nextProfileId === "string" ? item.nextProfileId : null,
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
  const [allMatches, setAllMatches] = useState<MatchSummary[]>(() => loadFromStorage<MatchSummary>(MATCH_KEY));
  const [profiles, setProfiles] = useState<StatsProfile[]>(() => loadProfiles());
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(() => loadCurrentProfileId());
  const [roundsDirty, setRoundsDirty] = useState(false);
  const [matchesDirty, setMatchesDirty] = useState(false);
  const [profilesDirty, setProfilesDirty] = useState(false);
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
        predictorDefault: true,
        previousProfileId: null,
        nextProfileId: null,
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
        predictorDefault: true,
        previousProfileId: null,
        nextProfileId: null,
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
      previousProfileId: source.id,
      nextProfileId: null,
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

