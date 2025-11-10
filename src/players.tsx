import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Grade =
  | "K"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12"
  | "Not applicable";

export interface PlayerConsent {
  agreed: boolean;
  timestamp?: string; // ISO
  consentTextVersion: string; // e.g., "v1"
}

export interface PlayerProfile {
  id: string; // uuid-like
  playerName: string;
  grade: Grade;
  school?: string;
  priorExperience?: string; // free text or simple flag
  consent: PlayerConsent;
  needsReview: boolean;
}

const PLAYERS_KEY = "rps_players_v1";
const CURRENT_PLAYER_KEY = "rps_current_player_v1";
export const CONSENT_TEXT_VERSION = "v1";

export const GRADE_OPTIONS: Grade[] = [
  "K",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "Not applicable",
];

function isGrade(value: unknown): value is Grade {
  return typeof value === "string" && GRADE_OPTIONS.includes(value as Grade);
}

function normalizeConsent(value: any): PlayerConsent {
  const timestamp = value && typeof value.timestamp === "string" ? value.timestamp : undefined;
  const version = value && typeof value.consentTextVersion === "string" ? value.consentTextVersion : CONSENT_TEXT_VERSION;
  return {
    agreed: true,
    timestamp,
    consentTextVersion: version,
  };
}

function normalizePlayer(raw: any): PlayerProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id : makeId("plr");
  const legacyName = typeof raw.displayName === "string" ? raw.displayName : undefined;
  const playerName = typeof raw.playerName === "string" ? raw.playerName : legacyName;
  const normalizedName = playerName && playerName.trim() ? playerName.trim() : "Player";

  const gradeFromValue = isGrade(raw.grade) ? raw.grade : undefined;
  const grade = gradeFromValue ?? "Not applicable";
  const school = typeof raw.school === "string" ? raw.school : undefined;
  const priorExperience = typeof raw.priorExperience === "string" ? raw.priorExperience : undefined;
  const consent = normalizeConsent(raw.consent);

  const hadLegacyBand = typeof raw.gradeBand === "string" || typeof raw.ageBand === "string";
  const needsReview = Boolean(raw.needsReview) || hadLegacyBand || !gradeFromValue;

  return {
    id,
    playerName: normalizedName,
    grade,
    school,
    priorExperience,
    consent,
    needsReview,
  };
}

function loadPlayers(): PlayerProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PLAYERS_KEY);
    if (!raw) return [];
    const val = JSON.parse(raw);
    if (!Array.isArray(val)) return [];
    const normalized: PlayerProfile[] = [];
    val.forEach(item => {
      const profile = normalizePlayer(item);
      if (profile) normalized.push(profile);
    });
    return normalized;
  } catch {
    return [];
  }
}

function savePlayers(players: PlayerProfile[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
}

function loadCurrentId(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(CURRENT_PLAYER_KEY); } catch { return null; }
}

function saveCurrentId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(CURRENT_PLAYER_KEY, id);
  else localStorage.removeItem(CURRENT_PLAYER_KEY);
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return prefix + "-" + (crypto as any).randomUUID();
  }
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

interface PlayerContextValue {
  players: PlayerProfile[];
  currentPlayerId: string | null;
  currentPlayer: PlayerProfile | null;
  hasConsented: boolean;
  setCurrentPlayer: (id: string | null) => void;
  createPlayer: (input: Omit<PlayerProfile, "id">) => PlayerProfile;
  updatePlayer: (id: string, patch: Partial<Omit<PlayerProfile, "id">>) => void;
  deletePlayer: (id: string) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayersProvider({ children }: { children: React.ReactNode }){
  const [players, setPlayers] = useState<PlayerProfile[]>(() => loadPlayers());
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(() => loadCurrentId());

  useEffect(() => { savePlayers(players); }, [players]);
  useEffect(() => { saveCurrentId(currentPlayerId); }, [currentPlayerId]);

  const currentPlayer = useMemo(() => players.find(p => p.id === currentPlayerId) || null, [players, currentPlayerId]);
  const hasConsented = currentPlayer != null;

  const setCurrentPlayer = useCallback((id: string | null) => {
    setCurrentPlayerId(id);
  }, []);

  const createPlayer = useCallback((input: Omit<PlayerProfile, "id">) => {
    const profile: PlayerProfile = { ...input, id: makeId("plr"), needsReview: input.needsReview ?? false };
    setPlayers(prev => prev.concat(profile));
    setCurrentPlayerId(profile.id);
    return profile;
  }, []);

  const updatePlayer = useCallback((id: string, patch: Partial<Omit<PlayerProfile, "id">>) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const deletePlayer = useCallback((id: string) => {
    setPlayers(prev => prev.filter(p => p.id !== id));
    setCurrentPlayerId(prev => (prev === id ? null : prev));
  }, []);

  const value = useMemo(() => ({
    players,
    currentPlayerId,
    currentPlayer,
    hasConsented,
    setCurrentPlayer,
    createPlayer,
    updatePlayer,
    deletePlayer,
  }), [players, currentPlayerId, currentPlayer, hasConsented, setCurrentPlayer, createPlayer, updatePlayer, deletePlayer]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayers(){
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayers must be used within PlayersProvider");
  return ctx;
}

