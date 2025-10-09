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
}

export interface MatchSummary {
  id: string;
  sessionId: string;
  clientId?: string;
  playerId: string;
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
}

interface StatsContextValue {
  rounds: RoundLog[];
  matches: MatchSummary[];
  sessionId: string;
  logRound: (round: Omit<RoundLog, "id" | "sessionId" | "playerId">) => RoundLog | null;
  logMatch: (match: Omit<MatchSummary, "id" | "sessionId" | "playerId">) => MatchSummary | null;
  resetAll: () => void;
  eraseLastSession: () => void;
  exportJson: () => string;
  exportRoundsCsv: () => string;
  eraseDataForPlayer: (playerId: string) => void;
  exportJsonForPlayer: (playerId: string) => string;
  exportRoundsCsvForPlayer: (playerId: string) => string;
}

const StatsContext = createContext<StatsContextValue | null>(null);

const ROUND_KEY = "rps_stats_rounds_v1";
const MATCH_KEY = "rps_stats_matches_v1";
const MAX_ROUNDS = 1000;

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

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return prefix + "-" + (crypto as any).randomUUID();
  }
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export function StatsProvider({ children }: { children: React.ReactNode }) {
  const [rounds, setRounds] = useState<RoundLog[]>(() => loadFromStorage<RoundLog>(ROUND_KEY));
  const [matches, setMatches] = useState<MatchSummary[]>(() => loadFromStorage<MatchSummary>(MATCH_KEY));
  const [roundsDirty, setRoundsDirty] = useState(false);
  const [matchesDirty, setMatchesDirty] = useState(false);
  const sessionIdRef = useRef<string>("");
  const { currentPlayerId, players } = usePlayers();

  if (!sessionIdRef.current) {
    sessionIdRef.current = makeId("sess");
  }

  const sessionId = sessionIdRef.current;

  const logRound = useCallback((round: Omit<RoundLog, "id" | "sessionId" | "playerId">) => {
    if (!currentPlayerId) return null;
    const entry: RoundLog = {
      ...round,
      id: makeId("r"),
      sessionId,
      playerId: currentPlayerId,
    };
    setRounds(prev => {
      const next = prev.concat(entry);
      const trimStart = Math.max(0, next.length - MAX_ROUNDS);
      return trimStart ? next.slice(trimStart) : next;
    });
    setRoundsDirty(true);
    return entry;
  }, [sessionId, currentPlayerId]);

  const logMatch = useCallback((match: Omit<MatchSummary, "id" | "sessionId" | "playerId">) => {
    if (!currentPlayerId) return null;
    const entry: MatchSummary = {
      ...match,
      id: makeId("m"),
      sessionId,
      playerId: currentPlayerId,
    };
    setMatches(prev => prev.concat(entry));
    setMatchesDirty(true);
    return entry;
  }, [sessionId, currentPlayerId]);

  useEffect(() => {
    if (!roundsDirty) return;
    const timer = window.setTimeout(() => {
      saveToStorage(ROUND_KEY, rounds);
      setRoundsDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [roundsDirty, rounds]);

  useEffect(() => {
    if (!matchesDirty) return;
    const timer = window.setTimeout(() => {
      saveToStorage(MATCH_KEY, matches);
      setMatchesDirty(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [matchesDirty, matches]);

  const resetAll = useCallback(() => {
    setRounds([]);
    setMatches([]);
    setRoundsDirty(true);
    setMatchesDirty(true);
    if (typeof window !== "undefined") {
      localStorage.removeItem(ROUND_KEY);
      localStorage.removeItem(MATCH_KEY);
    }
  }, []);

  const eraseLastSession = useCallback(() => {
    if (!rounds.length && !matches.length) return;
    const idsInOrder: string[] = [];
    rounds.forEach(r => {
      if (!idsInOrder.includes(r.sessionId)) idsInOrder.push(r.sessionId);
    });
    matches.forEach(m => {
      if (!idsInOrder.includes(m.sessionId)) idsInOrder.push(m.sessionId);
    });
    const target = idsInOrder[idsInOrder.length - 1];
    if (!target) return;
    setRounds(prev => prev.filter(r => r.sessionId !== target));
    setMatches(prev => prev.filter(m => m.sessionId !== target));
    setRoundsDirty(true);
    setMatchesDirty(true);
  }, [rounds, matches]);

  const exportJson = useCallback(() => {
    const payload = { rounds, matches };
    return JSON.stringify(payload, null, 2);
  }, [rounds, matches]);

  const exportRoundsCsv = useCallback(() => {
    const headers = ["playerId","playerName","gradeBand","timestamp","mode","bestOf","difficulty","player","ai","outcome","policy","confidence","streakAI","streakYou"];
    const lines = [headers.join(",")];
    rounds.forEach(r => {
      const prof = players.find(p => p.id === r.playerId) || null;
      const playerName = prof?.displayName ?? "";
      const grade = prof?.gradeBand ?? "";
      lines.push([
        r.playerId,
        JSON.stringify(playerName),
        grade,
        r.t,
        r.mode,
        r.bestOf,
        r.difficulty,
        r.player,
        r.ai,
        r.outcome,
        r.policy,
        r.confidence.toFixed(2),
        r.streakAI,
        r.streakYou
      ].join(","));
    });
    return lines.join('\n');

  }, [rounds, players]);

  const eraseDataForPlayer = useCallback((playerId: string) => {
    setRounds(prev => prev.filter(r => r.playerId !== playerId));
    setMatches(prev => prev.filter(m => m.playerId !== playerId));
    setRoundsDirty(true);
    setMatchesDirty(true);
  }, []);

  const exportJsonForPlayer = useCallback((playerId: string) => {
    const r = rounds.filter(x => x.playerId === playerId);
    const m = matches.filter(x => x.playerId === playerId);
    const prof = players.find(p => p.id === playerId) || null;
    const payload = { profile: prof, rounds: r, matches: m };
    return JSON.stringify(payload, null, 2);
  }, [rounds, matches, players]);

  const exportRoundsCsvForPlayer = useCallback((playerId: string) => {
    const headers = ["playerId","playerName","gradeBand","timestamp","mode","bestOf","difficulty","player","ai","outcome","policy","confidence","streakAI","streakYou"];
    const lines = [headers.join(",")];
    const prof = players.find(p => p.id === playerId) || null;
    const playerName = prof?.displayName ?? "";
    const grade = prof?.gradeBand ?? "";
    rounds.filter(r => r.playerId === playerId).forEach(r => {
      lines.push([
        r.playerId,
        JSON.stringify(playerName),
        grade,
        r.t,
        r.mode,
        r.bestOf,
        r.difficulty,
        r.player,
        r.ai,
        r.outcome,
        r.policy,
        r.confidence.toFixed(2),
        r.streakAI,
        r.streakYou
      ].join(","));
    });
    return lines.join('\n');
  }, [rounds, players]);

  const value = useMemo<StatsContextValue>(() => ({
    rounds,
    matches,
    sessionId,
    logRound,
    logMatch,
    resetAll,
    eraseLastSession,
    exportJson,
    exportRoundsCsv,
    eraseDataForPlayer,
    exportJsonForPlayer,
    exportRoundsCsvForPlayer,
  }), [rounds, matches, sessionId, logRound, logMatch, resetAll, eraseLastSession, exportJson, exportRoundsCsv, eraseDataForPlayer, exportJsonForPlayer, exportRoundsCsvForPlayer]);

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}

export function useStats(){
  const ctx = useContext(StatsContext);
  if (!ctx) throw new Error("useStats must be used within StatsProvider");
  return ctx;
}

