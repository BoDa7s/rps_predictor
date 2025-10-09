import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type GradeBand = "K-2" | "3-5" | "6-8" | "9-12";
export type AgeBand = "<8" | "8-10" | "11-13" | "14-18" | "Prefer not to say";
export type Gender = "Male" | "Female" | "Non-binary" | "Prefer not to say";

export interface PlayerConsent {
  agreed: boolean;
  timestamp?: string; // ISO
  consentTextVersion: string; // e.g., "v1"
}

export interface PlayerProfile {
  id: string; // uuid-like
  displayName: string;
  gradeBand: GradeBand;
  ageBand?: AgeBand;
  gender?: Gender;
  priorExperience?: string; // free text or simple flag
  consent: PlayerConsent;
}

const PLAYERS_KEY = "rps_players_v1";
const CURRENT_PLAYER_KEY = "rps_current_player_v1";
export const CONSENT_TEXT_VERSION = "v1";

function loadPlayers(): PlayerProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PLAYERS_KEY);
    if (!raw) return [];
    const val = JSON.parse(raw);
    return Array.isArray(val) ? val : [];
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
  const hasConsented = !!(currentPlayer && currentPlayer.consent?.agreed);

  const setCurrentPlayer = useCallback((id: string | null) => {
    setCurrentPlayerId(id);
  }, []);

  const createPlayer = useCallback((input: Omit<PlayerProfile, "id">) => {
    const profile: PlayerProfile = { ...input, id: makeId("plr") };
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

