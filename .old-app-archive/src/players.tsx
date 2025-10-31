import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth, type DemographicsProfile } from "./context/AuthContext";

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
  timestamp?: string;
  consentTextVersion: string;
}

export interface PlayerCloudLink {
  user_id: string;
  username: string;
}

export interface StoredDemographics {
  first_name: string;
  last_initial: string;
  grade: string;
  age?: Age | null;
  school?: string | null;
  prior_experience?: string | null;
}

export interface LocalProfileRecord {
  localProfileId: string;
  demographics: StoredDemographics;
  cloudLink?: PlayerCloudLink;
}

export interface PlayerProfile {
  id: string;
  playerName: string;
  grade: Grade;
  age: Age | null;
  school?: string;
  priorExperience?: string;
  consent: PlayerConsent;
  needsReview: boolean;
  localProfileId: string;
  cloudLink?: PlayerCloudLink;
  demographics: StoredDemographics;
}

const PLAYERS_KEY = "rps_players_v2";
const LEGACY_PLAYERS_KEY = "rps_players_v1";
const CURRENT_PLAYER_KEY = "rps_current_player_v2";
const LEGACY_CURRENT_PLAYER_KEY = "rps_current_player_v1";

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

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
    return `${prefix}-${(crypto as any).randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLastInitial(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed[0]?.toUpperCase() ?? "";
}

function normalizeStoredDemographics(raw: Partial<StoredDemographics>): StoredDemographics {
  const firstName = typeof raw.first_name === "string" ? raw.first_name.trim() : "";
  const lastInitial = normalizeLastInitial(raw.last_initial);
  const grade = typeof raw.grade === "string" && raw.grade.trim() ? raw.grade.trim() : "Not applicable";
  const ageValue = sanitizeAge(raw.age ?? null);
  const school = typeof raw.school === "string" && raw.school.trim() ? raw.school.trim() : null;
  const priorExperience =
    typeof raw.prior_experience === "string" && raw.prior_experience.trim()
      ? raw.prior_experience.trim()
      : null;

  return {
    first_name: firstName || "Player",
    last_initial: lastInitial,
    grade,
    age: ageValue,
    school,
    prior_experience: priorExperience,
  } satisfies StoredDemographics;
}

function buildPlayerName(demographics: StoredDemographics): string {
  const first = demographics.first_name.trim();
  const initial = normalizeLastInitial(demographics.last_initial);
  return [first || "Player", initial ? `${initial}.` : ""].filter(Boolean).join(" ") || "Player";
}

function deriveGrade(value: string): Grade {
  return isGrade(value) ? (value as Grade) : "Not applicable";
}

function toPlayerProfile(record: LocalProfileRecord): PlayerProfile {
  const demographics = normalizeStoredDemographics(record.demographics);
  const grade = deriveGrade(demographics.grade);
  const age = demographics.age ?? null;

  const needsReview = !isGrade(demographics.grade) || demographics.age == null;

  return {
    id: record.cloudLink?.user_id ?? record.localProfileId,
    playerName: buildPlayerName(demographics),
    grade,
    age,
    school: demographics.school ?? undefined,
    priorExperience: demographics.prior_experience ?? undefined,
    consent: {
      agreed: true,
      consentTextVersion: CONSENT_TEXT_VERSION,
      timestamp: undefined,
    },
    needsReview,
    localProfileId: record.localProfileId,
    cloudLink: record.cloudLink,
    demographics,
  } satisfies PlayerProfile;
}

function extractNameParts(name: string): { first: string; lastInitial: string } {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { first: "Player", lastInitial: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { first: parts[0], lastInitial: "" };
  }
  const lastSegment = parts[parts.length - 1];
  const initial = lastSegment.replace(/[^A-Za-z]/g, "").charAt(0) ?? "";
  const first = parts.slice(0, -1).join(" ") || parts[0];
  return { first, lastInitial: initial.toUpperCase() };
}

function convertLegacyPlayer(raw: any): LocalProfileRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id : makeId("plr");
  const name = typeof raw.playerName === "string" ? raw.playerName : typeof raw.displayName === "string" ? raw.displayName : "Player";
  const grade = typeof raw.grade === "string" ? raw.grade : "Not applicable";
  const age = sanitizeAge(raw.age);
  const school = typeof raw.school === "string" ? raw.school : null;
  const priorExperience = typeof raw.priorExperience === "string" ? raw.priorExperience : null;
  const { first, lastInitial } = extractNameParts(name);

  return {
    localProfileId: id,
    demographics: normalizeStoredDemographics({
      first_name: first,
      last_initial: lastInitial,
      grade,
      age,
      school,
      prior_experience: priorExperience,
    }),
  } satisfies LocalProfileRecord;
}

function parseLocalRecords(raw: unknown): LocalProfileRecord[] {
  if (!Array.isArray(raw)) return [];
  const next: LocalProfileRecord[] = [];
  raw.forEach(entry => {
    if (!entry || typeof entry !== "object") return;
    const localProfileId = typeof (entry as any).localProfileId === "string" ? (entry as any).localProfileId : makeId("plr");
    const demographics = normalizeStoredDemographics((entry as any).demographics ?? {});
    const cloudLinkRaw = (entry as any).cloudLink;
    let cloudLink: PlayerCloudLink | undefined;
    if (cloudLinkRaw && typeof cloudLinkRaw === "object") {
      const userId = typeof (cloudLinkRaw as any).user_id === "string" ? (cloudLinkRaw as any).user_id : null;
      const username = typeof (cloudLinkRaw as any).username === "string" ? (cloudLinkRaw as any).username : null;
      if (userId && username) {
        cloudLink = { user_id: userId, username };
      }
    }
    next.push({ localProfileId, demographics, cloudLink });
  });
  return next;
}

function loadLocalRecords(): LocalProfileRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PLAYERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parseLocalRecords(parsed);
    }
  } catch {
    // ignore parse errors and fall back
  }
  try {
    const legacyRaw = localStorage.getItem(LEGACY_PLAYERS_KEY);
    if (!legacyRaw) return [];
    const parsed = JSON.parse(legacyRaw);
    if (!Array.isArray(parsed)) return [];
    const records: LocalProfileRecord[] = [];
    parsed.forEach(item => {
      const converted = convertLegacyPlayer(item);
      if (converted) records.push(converted);
    });
    return records;
  } catch {
    return [];
  }
}

function saveLocalRecords(records: LocalProfileRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(records));
}

function loadCurrentId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(CURRENT_PLAYER_KEY);
    if (value) return value;
    return localStorage.getItem(LEGACY_CURRENT_PLAYER_KEY);
  } catch {
    return null;
  }
}

function saveCurrentId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(CURRENT_PLAYER_KEY, id);
  } else {
    localStorage.removeItem(CURRENT_PLAYER_KEY);
  }
}

interface PlayerContextValue {
  players: PlayerProfile[];
  currentPlayerId: string | null;
  currentPlayer: PlayerProfile | null;
  hasConsented: boolean;
  setCurrentPlayer: (id: string | null) => void;
  createPlayer: (input: StoredDemographics) => PlayerProfile;
  updatePlayer: (id: string, demographics: StoredDemographics) => PlayerProfile | null;
  deletePlayer: (id: string) => void;
  linkCloudProfile: (link: PlayerCloudLink, demographics: StoredDemographics) => PlayerProfile;
  findLocalByUsername: (username: string) => LocalProfileRecord | null;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function demographicsProfileToStored(profile: DemographicsProfile): StoredDemographics {
  return normalizeStoredDemographics({
    first_name: profile.first_name,
    last_initial: profile.last_initial,
    grade: profile.grade,
    age: sanitizeAge(profile.age),
    school: profile.school,
    prior_experience: profile.prior_experience,
  });
}

export function PlayersProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { profile: authProfile } = useAuth();
  const [records, setRecords] = useState<LocalProfileRecord[]>(() => loadLocalRecords());
  const [currentLocalId, setCurrentLocalId] = useState<string | null>(() => loadCurrentId());

  const commitRecords = useCallback((updater: (prev: LocalProfileRecord[]) => LocalProfileRecord[]) => {
    setRecords(prev => {
      const next = updater(prev);
      saveLocalRecords(next);
      return next;
    });
  }, []);

  const createPlayer = useCallback(
    (demographicsInput: StoredDemographics) => {
      const demographics = normalizeStoredDemographics(demographicsInput);
      const record: LocalProfileRecord = {
        localProfileId: makeId("plr"),
        demographics,
      };
      commitRecords(prev => prev.concat(record));
      setCurrentLocalId(record.localProfileId);
      saveCurrentId(record.localProfileId);
      return toPlayerProfile(record);
    },
    [commitRecords],
  );

  const updatePlayer = useCallback(
    (id: string, demographicsInput: StoredDemographics) => {
      let nextRecord: LocalProfileRecord | null = null;
      commitRecords(prev => {
        const demographics = normalizeStoredDemographics(demographicsInput);
        return prev.map(record => {
          if (record.localProfileId === id || record.cloudLink?.user_id === id) {
            nextRecord = { ...record, demographics };
            return nextRecord;
          }
          return record;
        });
      });
      if (nextRecord) {
        return toPlayerProfile(nextRecord);
      }
      return null;
    },
    [commitRecords],
  );

  const deletePlayer = useCallback(
    (id: string) => {
      commitRecords(prev => prev.filter(record => record.localProfileId !== id && record.cloudLink?.user_id !== id));
      setCurrentLocalId(prev => {
        if (prev === id) {
          saveCurrentId(null);
          return null;
        }
        return prev;
      });
    },
    [commitRecords],
  );

  const findLocalByUsername = useCallback(
    (username: string) => records.find(record => record.cloudLink?.username === username) ?? null,
    [records],
  );

  const linkCloudProfile = useCallback(
    (link: PlayerCloudLink, demographicsInput: StoredDemographics) => {
      const demographics = normalizeStoredDemographics(demographicsInput);
      let resultRecord: LocalProfileRecord | null = null;
      commitRecords(prev => {
        const next = prev.map(record => ({ ...record }));
        const byUserIdIndex = next.findIndex(record => record.cloudLink?.user_id === link.user_id);
        if (byUserIdIndex >= 0) {
          const updated = { ...next[byUserIdIndex], cloudLink: link, demographics };
          next[byUserIdIndex] = updated;
          resultRecord = updated;
          return next;
        }
        const byUsernameIndex = next.findIndex(record => record.cloudLink?.username === link.username);
        if (byUsernameIndex >= 0) {
          const updated = { ...next[byUsernameIndex], cloudLink: link, demographics };
          next[byUsernameIndex] = updated;
          resultRecord = updated;
          return next;
        }
        const created: LocalProfileRecord = {
          localProfileId: makeId("plr"),
          demographics,
          cloudLink: link,
        };
        next.push(created);
        resultRecord = created;
        return next;
      });
      const resolved = resultRecord ?? {
        localProfileId: makeId("plr"),
        demographics,
        cloudLink: link,
      };
      if (!resultRecord) {
        commitRecords(prev => prev.concat(resolved));
      }
      setCurrentLocalId(resolved.localProfileId);
      saveCurrentId(resolved.localProfileId);
      return toPlayerProfile(resolved);
    },
    [commitRecords],
  );

  const supabasePlayer = useMemo<PlayerProfile | null>(() => {
    if (!authProfile) return null;
    const demographics = demographicsProfileToStored(authProfile);
    const username = records.find(record => record.cloudLink?.user_id === authProfile.user_id)?.cloudLink?.username;
    const linked = {
      localProfileId: records.find(record => record.cloudLink?.user_id === authProfile.user_id)?.localProfileId ?? makeId("plr"),
      demographics,
      cloudLink: username ? { user_id: authProfile.user_id, username } : undefined,
    } satisfies LocalProfileRecord;
    return toPlayerProfile(linked);
  }, [authProfile, records]);

  useEffect(() => {
    if (!authProfile) return;
    const demographics = demographicsProfileToStored(authProfile);
    commitRecords(prev => {
      const existingIndex = prev.findIndex(record => record.cloudLink?.user_id === authProfile.user_id);
      if (existingIndex >= 0) {
        const next = [...prev];
        const existing = next[existingIndex];
        next[existingIndex] = { ...existing, demographics: normalizeStoredDemographics({ ...existing.demographics, ...demographics }) };
        return next;
      }
      return prev;
    });
  }, [authProfile, commitRecords]);

  useEffect(() => {
    saveCurrentId(currentLocalId);
  }, [currentLocalId]);

  const players = useMemo(() => records.map(toPlayerProfile), [records]);
  const currentPlayer = useMemo(() => {
    if (supabasePlayer) {
      return supabasePlayer;
    }
    if (!currentLocalId) return null;
    const record = records.find(item => item.localProfileId === currentLocalId);
    return record ? toPlayerProfile(record) : null;
  }, [currentLocalId, records, supabasePlayer]);

  const hasConsented = Boolean(supabasePlayer);
  const currentPlayerId = supabasePlayer ? supabasePlayer.id : currentLocalId;

  const setCurrentPlayer = useCallback(
    (id: string | null) => {
      if (supabasePlayer) return;
      setCurrentLocalId(id);
    },
    [supabasePlayer],
  );

  const value = useMemo<PlayerContextValue>(
    () => ({
      players: supabasePlayer ? [supabasePlayer] : players,
      currentPlayerId: currentPlayerId ?? null,
      currentPlayer,
      hasConsented,
      setCurrentPlayer,
      createPlayer,
      updatePlayer,
      deletePlayer,
      linkCloudProfile,
      findLocalByUsername,
    }),
    [
      createPlayer,
      currentPlayer,
      currentPlayerId,
      deletePlayer,
      findLocalByUsername,
      hasConsented,
      linkCloudProfile,
      players,
      setCurrentPlayer,
      supabasePlayer,
      updatePlayer,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayers(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayers must be used within PlayersProvider");
  return ctx;
}

