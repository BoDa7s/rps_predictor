import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePlayMode, type PlayMode } from "./lib/playMode";
import { cloudDataService } from "./lib/cloudData";
import { supabaseClient } from "./lib/supabaseClient";

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

export type Age = number;
export interface PlayerConsent {
  agreed: boolean;
  timestamp?: string; // ISO
  consentTextVersion: string; // e.g., "v1"
}

export interface PlayerProfile {
  id: string; // uuid-like
  playerName: string;
  grade: Grade;
  age: Age | null;
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

export function sanitizeAge(value: unknown): Age | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded >= 5 && rounded <= 100) return rounded;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 5 && parsed <= 100) return parsed;
  }
  return null;
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

  const age = sanitizeAge(raw.age);
  const school = typeof raw.school === "string" ? raw.school : undefined;
  const priorExperience = typeof raw.priorExperience === "string" ? raw.priorExperience : undefined;
  const consent = normalizeConsent(raw.consent);

  const hadLegacyBand = typeof raw.gradeBand === "string" || typeof raw.ageBand === "string";
  const needsReview = Boolean(raw.needsReview) || hadLegacyBand || !gradeFromValue || age === null;

  return {
    id,
    playerName: normalizedName,
    grade,
    age,
    school,
    priorExperience,
    consent,
    needsReview,
  };
}

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

function loadPlayersFromStorage(storage: Storage | null): PlayerProfile[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(PLAYERS_KEY);
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

function savePlayersToStorage(storage: Storage | null, players: PlayerProfile[]) {
  if (!storage) return;
  try {
    storage.setItem(PLAYERS_KEY, JSON.stringify(players));
  } catch {
    // ignore persistence failures (storage may be unavailable)
  }
}

function loadCurrentIdFromStorage(storage: Storage | null): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(CURRENT_PLAYER_KEY);
  } catch {
    return null;
  }
}

function saveCurrentIdToStorage(storage: Storage | null, id: string | null) {
  if (!storage) return;
  try {
    if (id) storage.setItem(CURRENT_PLAYER_KEY, id);
    else storage.removeItem(CURRENT_PLAYER_KEY);
  } catch {
    // ignore persistence failures (storage may be unavailable)
  }
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
  const { mode } = usePlayMode();
  const isCloudMode = mode === "cloud";
  const storageScope = useMemo<StorageScope | null>(() => (isCloudMode ? null : resolveScopeFromMode(mode)), [isCloudMode, mode]);
  const storage = useMemo(() => (storageScope ? getScopedStorage(storageScope) : null), [storageScope]);

  const [players, setPlayers] = useState<PlayerProfile[]>(() => (isCloudMode ? [] : loadPlayersFromStorage(storage)));
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(() =>
    isCloudMode ? null : loadCurrentIdFromStorage(storage),
  );
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);

  useEffect(() => {
    if (isCloudMode) {
      return;
    }
    setPlayers(loadPlayersFromStorage(storage));
    setCurrentPlayerId(loadCurrentIdFromStorage(storage));
    setCloudUserId(null);
  }, [isCloudMode, storage]);

  useEffect(() => {
    if (!isCloudMode) {
      return;
    }

    const sessionStorage = getScopedStorage("session");
    const fallbackPlayers = loadPlayersFromStorage(sessionStorage);
    const fallbackCurrentId = loadCurrentIdFromStorage(sessionStorage);

    setPlayers(fallbackPlayers);
    setCurrentPlayerId(fallbackCurrentId);

    const service = cloudDataService;
    const client = supabaseClient;

    if (!service || !client) {
      setCloudUserId(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (cancelled) return;

        const session = data?.session ?? null;
        const userId = session?.user?.id ?? null;
        setCloudUserId(userId);

        if (!userId) {
          return;
        }

        try {
          const profile = await service.loadPlayerProfile(userId);
          if (cancelled) return;
          if (profile) {
            const others = fallbackPlayers.filter(player => player.id !== userId);
            setPlayers([profile, ...others]);
          }
        } catch (err) {
          if (!cancelled) {
            console.error("Failed to load cloud player profile", err);
          }
        }

        setCurrentPlayerId(userId);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to resolve Supabase session", err);
          setCloudUserId(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCloudMode, supabaseClient, cloudDataService]);

  useEffect(() => {
    if (isCloudMode) {
      const sessionStorage = getScopedStorage("session");
      savePlayersToStorage(sessionStorage, players);
      saveCurrentIdToStorage(sessionStorage, currentPlayerId);
      return;
    }
    savePlayersToStorage(storage, players);
  }, [isCloudMode, players, storage, currentPlayerId]);

  useEffect(() => {
    if (!isCloudMode) {
      saveCurrentIdToStorage(storage, currentPlayerId);
    }
  }, [isCloudMode, storage, currentPlayerId]);

  const currentPlayer = useMemo(() => players.find(p => p.id === currentPlayerId) || null, [players, currentPlayerId]);
  const hasConsented = currentPlayer != null;

  const setCurrentPlayer = useCallback(
    (id: string | null) => {
      setCurrentPlayerId(id);
    },
    [],
  );

  const createPlayer = useCallback(
    (input: Omit<PlayerProfile, "id">) => {
      if (isCloudMode) {
        const targetId = cloudUserId ?? makeId("plr");
        const profile: PlayerProfile = { ...input, id: targetId, needsReview: input.needsReview ?? false };
        setPlayers(prev => {
          const others = prev.filter(player => player.id !== targetId);
          return [profile, ...others];
        });
        setCurrentPlayerId(targetId);
        if (cloudUserId && cloudDataService) {
          void cloudDataService.upsertPlayerProfile(profile).catch(err => {
            console.error("Failed to persist cloud player profile", err);
          });
        }
        return profile;
      }

      const profile: PlayerProfile = { ...input, id: makeId("plr"), needsReview: input.needsReview ?? false };
      setPlayers(prev => prev.concat(profile));
      setCurrentPlayerId(profile.id);
      return profile;
    },
    [cloudUserId, isCloudMode],
  );

  const updatePlayer = useCallback(
    (id: string, patch: Partial<Omit<PlayerProfile, "id">>) => {
      let updatedProfile: PlayerProfile | null = null;
      setPlayers(prev =>
        prev.map(player => {
          if (player.id !== id) return player;
          const merged: PlayerProfile = {
            ...player,
            ...patch,
            needsReview: patch.needsReview ?? player.needsReview ?? false,
          };
          updatedProfile = merged;
          return merged;
        }),
      );

      if (isCloudMode && cloudUserId && id === cloudUserId && updatedProfile && cloudDataService) {
        void cloudDataService.upsertPlayerProfile(updatedProfile).catch(err => {
          console.error("Failed to persist cloud player profile", err);
        });
      }
    },
    [cloudUserId, isCloudMode],
  );

  const deletePlayer = useCallback(
    (id: string) => {
      if (isCloudMode) {
        if (cloudUserId && id === cloudUserId) {
          console.warn("Cannot delete the active cloud player profile.");
          return;
        }
        setPlayers(prev => prev.filter(player => player.id !== id));
        setCurrentPlayerId(prev => (prev === id ? null : prev));
        return;
      }

      setPlayers(prev => prev.filter(p => p.id !== id));
      setCurrentPlayerId(prev => (prev === id ? null : prev));
    },
    [cloudUserId, isCloudMode],
  );

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

