import React, { createContext, useCallback, useContext, useMemo } from "react";
import { telemetryService, useTelemetryStore } from "./telemetry";

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
  timestamp?: string;
  consentTextVersion: string;
}

export interface PlayerProfile {
  id: string;
  playerName: string;
  grade: Grade;
  school?: string;
  priorExperience?: string;
  consent: PlayerConsent;
  needsReview: boolean;
}

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

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && (crypto as { randomUUID?: () => string }).randomUUID) {
    return `${prefix}-${(crypto as { randomUUID: () => string }).randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePlayer(player: PlayerProfile): PlayerProfile {
  return {
    id: player.id,
    playerName: player.playerName.trim() || "Player",
    grade: GRADE_OPTIONS.includes(player.grade) ? player.grade : "Not applicable",
    school: player.school,
    priorExperience: player.priorExperience,
    consent: {
      agreed: player.consent.agreed !== false,
      timestamp: player.consent.timestamp,
      consentTextVersion: player.consent.consentTextVersion || CONSENT_TEXT_VERSION,
    },
    needsReview: Boolean(player.needsReview),
  };
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

export function PlayersProvider({ children }: { children: React.ReactNode }) {
  const telemetry = useTelemetryStore();
  const players = useMemo(
    () =>
      telemetry.appPlayers.map(player =>
        normalizePlayer({
          id: player.id,
          playerName: player.playerName,
          grade: (player.grade as Grade) ?? "Not applicable",
          school: player.school,
          priorExperience: player.priorExperience,
          consent: {
            agreed: player.consent?.agreed !== false,
            timestamp: player.consent?.timestamp,
            consentTextVersion: player.consent?.consentTextVersion ?? CONSENT_TEXT_VERSION,
          },
          needsReview: Boolean(player.needsReview),
        }),
      ),
    [telemetry.appPlayers],
  );

  const currentPlayerId = telemetry.currentPlayerId;
  const currentPlayer = useMemo(
    () => players.find(player => player.id === currentPlayerId) ?? null,
    [currentPlayerId, players],
  );
  const hasConsented = currentPlayer !== null;

  const setCurrentPlayer = useCallback((id: string | null) => {
    telemetryService.setCurrentPlayer(id);
  }, []);

  const createPlayer = useCallback((input: Omit<PlayerProfile, "id">) => {
    const profile = normalizePlayer({
      ...input,
      id: makeId("plr"),
      needsReview: input.needsReview ?? false,
    });
    telemetryService.upsertAppPlayer(profile);
    telemetryService.setCurrentPlayer(profile.id);
    return profile;
  }, []);

  const updatePlayer = useCallback(
    (id: string, patch: Partial<Omit<PlayerProfile, "id">>) => {
      const current = players.find(player => player.id === id);
      if (!current) return;
      const next = normalizePlayer({
        ...current,
        ...patch,
        consent: patch.consent ? { ...current.consent, ...patch.consent } : current.consent,
      });
      telemetryService.upsertAppPlayer(next);
    },
    [players],
  );

  const deletePlayer = useCallback((id: string) => {
    telemetryService.deleteAppPlayer(id);
  }, []);

  const value = useMemo(
    () => ({
      players,
      currentPlayerId,
      currentPlayer,
      hasConsented,
      setCurrentPlayer,
      createPlayer,
      updatePlayer,
      deletePlayer,
    }),
    [players, currentPlayerId, currentPlayer, hasConsented, setCurrentPlayer, createPlayer, updatePlayer, deletePlayer],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayers() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayers must be used within PlayersProvider");
  return ctx;
}
