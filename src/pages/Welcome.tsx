import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseClient, isSupabaseConfigured } from "../lib/supabaseClient";
import {
  cloudDataService,
  type DemographicsProfileRecord,
} from "../lib/cloudData";
import { getPostAuthPath, DEPLOY_ENV } from "../lib/env";
import { BOOT_ROUTE, MODES_ROUTE, TRAINING_ROUTE } from "../lib/routes";
import {
  CONSENT_TEXT_VERSION,
  GRADE_OPTIONS,
  sanitizeAge,
  type Grade,
  type PlayerProfile,
} from "../players";
import { useNavigate } from "react-router-dom";
import {
  login as loginThroughEdge,
  signup as signupThroughEdge,
  setEdgeSession,
} from "../lib/edgeFunctions";
import {
  CURRENT_PLAYER_STORAGE_KEY,
  LOCAL_ACCOUNTS_KEY,
  LOCAL_ACTIVE_ACCOUNT_KEY,
  PLAYERS_STORAGE_KEY,
  STATS_PROFILES_KEY,
  STATS_CURRENT_PROFILE_KEY,
  STATS_ROUNDS_KEY,
  STATS_MATCHES_KEY,
  STATS_MODEL_STATE_KEY,
  updateActiveLocalPointers,
} from "../lib/localSession";
import { isProfileMigrated } from "../lib/localBackup";
import { usePlayMode, type PlayMode } from "../lib/playMode";
import type { MatchSummary, RoundLog, StatsProfile, StoredPredictorModelState } from "../stats";
import { makeProfileDisplayName } from "../stats";

const AGE_OPTIONS = Array.from({ length: 96 }, (_, index) => String(5 + index));

const TRAINING_ROUNDS_REQUIRED = 10;

type AuthTab = "signIn" | "signUp";
type AuthMode = "local" | "cloud";
type WelcomeOverlay = "chooser" | "local" | "cloud";
type StorageScope = "local" | "session";

type SignUpFormState = {
  firstName: string;
  lastInitial: string;
  grade: string;
  age: string;
  school: string;
  priorExperience: string;
  username: string;
  password: string;
};

type CloudProfileSeed = Partial<
  Pick<SignUpFormState, "firstName" | "lastInitial" | "grade" | "age" | "school" | "priorExperience" | "username">
>;

interface CloudHydrationResult {
  playerId: string;
  profile: PlayerProfile;
  statsProfiles: StatsProfile[];
}

interface LocalAccountRecord {
  profile: PlayerProfile;
  createdAt: string;
  storageMode: AuthMode;
}

interface LocalSession {
  profile: PlayerProfile;
}

interface StoredStatsProfileSnapshot {
  id: string;
  playerId: string;
  trainingCount?: number;
  trained?: boolean;
}

const initialSignUpForm: SignUpFormState = {
  firstName: "",
  lastInitial: "",
  grade: "",
  age: "",
  school: "",
  priorExperience: "",
  username: "",
  password: "",
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function getScopedStorage(scope: StorageScope): Storage | null {
  if (!isBrowser()) return null;
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
  if (!isBrowser()) return false;
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

function scopeFromMode(mode: PlayMode | AuthMode): StorageScope {
  return mode === "cloud" ? "session" : "local";
}

function createProfileId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `plr-${crypto.randomUUID()}`;
  }
  return `plr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isGradeValue(value: unknown): value is Grade {
  return typeof value === "string" && GRADE_OPTIONS.includes(value as Grade);
}

function normalizeStoredProfile(raw: any): PlayerProfile {
  const id = typeof raw?.id === "string" ? raw.id : createProfileId();
  const playerNameValue = typeof raw?.playerName === "string" ? raw.playerName.trim() : "";
  const playerName = playerNameValue || "Player";
  const grade = isGradeValue(raw?.grade) ? raw.grade : "Not applicable";
  const age = sanitizeAge(raw?.age);
  const school = typeof raw?.school === "string" && raw.school.trim() ? raw.school.trim() : undefined;
  const priorExperience =
    typeof raw?.priorExperience === "string" && raw.priorExperience.trim()
      ? raw.priorExperience.trim()
      : undefined;
  const consent = raw?.consent && typeof raw.consent === "object"
    ? {
        agreed: true,
        consentTextVersion:
          typeof raw.consent.consentTextVersion === "string"
            ? raw.consent.consentTextVersion
            : CONSENT_TEXT_VERSION,
        timestamp:
          typeof raw.consent.timestamp === "string"
            ? raw.consent.timestamp
            : new Date().toISOString(),
      }
    : {
        agreed: true,
        consentTextVersion: CONSENT_TEXT_VERSION,
        timestamp: new Date().toISOString(),
      };

  return {
    id,
    playerName,
    grade,
    age,
    school,
    priorExperience,
    consent,
    needsReview: Boolean(raw?.needsReview),
  };
}

function loadStoredPlayers(scope: StorageScope): PlayerProfile[] {
  const storage = getScopedStorage(scope);
  if (!storage) return [];
  try {
    const raw = storage.getItem(PLAYERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeStoredProfile)
      .filter(profile => !isProfileMigrated(profile.id));
  } catch {
    return [];
  }
}

function saveStoredPlayers(scope: StorageScope, players: PlayerProfile[]) {
  const storage = getScopedStorage(scope);
  if (!storage) return;
  if (shouldPreventLocalWrite(storage, players.map(player => player.id))) return;
  storage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));
}

const LOCAL_ACCOUNTS_CACHE_NAME = "rps-predictor-local-profiles-v1";
const LOCAL_ACCOUNTS_CACHE_URL = "/rps-local-profiles";

function hasCacheStorage(): boolean {
  return isBrowser() && typeof window.caches !== "undefined";
}

function sanitizeLocalAccountRecord(raw: any): LocalAccountRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const profile = normalizeStoredProfile((raw as any).profile);
  if (isProfileMigrated(profile.id)) {
    return null;
  }
  const storageMode = (raw as any).storageMode === "cloud" ? "cloud" : "local";
  if (storageMode !== "local") {
    return null;
  }
  const createdAtValue =
    typeof (raw as any).createdAt === "string" && (raw as any).createdAt.trim()
      ? (raw as any).createdAt
      : new Date().toISOString();
  return {
    profile,
    createdAt: createdAtValue,
    storageMode: "local",
  };
}

async function persistLocalAccountsToCache(accounts: LocalAccountRecord[]): Promise<void> {
  if (!hasCacheStorage()) return;
  try {
    const cache = await window.caches.open(LOCAL_ACCOUNTS_CACHE_NAME);
    const response = new Response(JSON.stringify(accounts), {
      headers: { "Content-Type": "application/json" },
    });
    await cache.put(LOCAL_ACCOUNTS_CACHE_URL, response);
  } catch {
    // Ignore cache persistence failures.
  }
}

async function loadLocalAccountsFromCache(): Promise<LocalAccountRecord[] | null> {
  if (!hasCacheStorage()) return null;
  try {
    const cache = await window.caches.open(LOCAL_ACCOUNTS_CACHE_NAME);
    const match = await cache.match(LOCAL_ACCOUNTS_CACHE_URL);
    if (!match) return null;
    const parsed = await match.json();
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map(item => sanitizeLocalAccountRecord(item))
      .filter((account): account is LocalAccountRecord => account !== null);
  } catch {
    return null;
  }
}

function ensurePlayerStored(profile: PlayerProfile, scope: StorageScope) {
  const storage = getScopedStorage(scope);
  if (!storage) return;
  if (shouldPreventLocalWrite(storage, [profile.id])) return;
  const players = loadStoredPlayers(scope);
  const existingIndex = players.findIndex(player => player.id === profile.id);
  const nextPlayers = existingIndex >= 0 ? [...players] : players.concat(profile);
  if (existingIndex >= 0) {
    nextPlayers[existingIndex] = { ...nextPlayers[existingIndex], ...profile };
  }
  saveStoredPlayers(scope, nextPlayers);
  storage.setItem(CURRENT_PLAYER_STORAGE_KEY, profile.id);
}

function loadLocalAccounts(): LocalAccountRecord[] {
  const storage = getScopedStorage("local");
  if (!storage) return [];
  try {
    const raw = storage.getItem(LOCAL_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(item => sanitizeLocalAccountRecord(item))
      .filter((account): account is LocalAccountRecord => account !== null);
  } catch {
    return [];
  }
}

function saveLocalAccounts(accounts: LocalAccountRecord[]) {
  const storage = getScopedStorage("local");
  if (!storage) return;
  if (shouldPreventLocalWrite(storage, accounts.map(account => account.profile.id))) return;
  storage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  void persistLocalAccountsToCache(accounts);
}

function setActiveLocalAccount(account: LocalAccountRecord, statsProfileId?: string | null) {
  const storage = getScopedStorage("local");
  if (!storage) return;
  if (shouldPreventLocalWrite(storage, [account.profile.id])) return;
  ensurePlayerStored(account.profile, "local");
  updateActiveLocalPointers(account.profile.id, { statsProfileId });
}

function loadActiveLocalSession(): LocalSession | null {
  const storage = getScopedStorage("local");
  if (!storage) return null;
  const profileId = storage.getItem(LOCAL_ACTIVE_ACCOUNT_KEY);
  if (!profileId) return null;
  const accounts = loadLocalAccounts();
  const account = accounts.find(candidate => candidate.profile.id === profileId);
  if (account) {
    if (isProfileMigrated(account.profile.id)) {
      updateActiveLocalPointers(null);
      return null;
    }
    ensurePlayerStored(account.profile, "local");
    return { profile: account.profile };
  }
  const storedPlayers = loadStoredPlayers("local");
  const fallbackProfile = storedPlayers.find(player => player.id === profileId);
  if (!fallbackProfile || isProfileMigrated(fallbackProfile.id)) {
    updateActiveLocalPointers(null);
    return null;
  }
  ensurePlayerStored(fallbackProfile, "local");
  updateActiveLocalPointers(fallbackProfile.id);
  return { profile: fallbackProfile };
}

type RawStoredStatsProfileSnapshot = {
  id?: unknown;
  playerId?: unknown;
  user_id?: unknown;
  trainingCount?: unknown;
  training_count?: unknown;
  trained?: unknown;
  training_completed?: unknown;
};

function coerceTrainingCount(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value)) return undefined;
  return value;
}

function coerceTrained(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
}

function loadStoredStatsProfiles(scope: StorageScope): StoredStatsProfileSnapshot[] {
  const storage = getScopedStorage(scope);
  if (!storage) return [];
  try {
    const raw = storage.getItem(STATS_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const sanitized: StoredStatsProfileSnapshot[] = [];
    parsed.forEach(item => {
      if (!item || typeof item !== "object") {
        return;
      }
      const snapshot = item as RawStoredStatsProfileSnapshot;
      const id = typeof snapshot.id === "string" ? snapshot.id : null;
      const playerId =
        typeof snapshot.playerId === "string"
          ? snapshot.playerId
          : typeof snapshot.user_id === "string"
            ? snapshot.user_id
            : null;
      if (!id || !playerId) {
        return;
      }
      if (isProfileMigrated(playerId)) {
        return;
      }
      const trainingCount =
        coerceTrainingCount(snapshot.trainingCount) ?? coerceTrainingCount(snapshot.training_count);
      const trained =
        coerceTrained(snapshot.trained) ?? coerceTrained(snapshot.training_completed);
      sanitized.push({ id, playerId, trainingCount, trained });
    });
    return sanitized;
  } catch {
    return [];
  }
}

function getStoredCurrentStatsProfileId(scope: StorageScope): string | null {
  const storage = getScopedStorage(scope);
  if (!storage) return null;
  try {
    return storage.getItem(STATS_CURRENT_PROFILE_KEY);
  } catch {
    return null;
  }
}

async function hydrateCloudPlayerState(session: Session, seed?: CloudProfileSeed): Promise<CloudHydrationResult | null> {
  if (!cloudDataService) {
    return null;
  }
  const userId = session.user?.id;
  if (!userId) {
    return null;
  }

  let demographics: DemographicsProfileRecord | null = null;
  let statsProfiles: StatsProfile[] = [];

  try {
    const [demographicsResult, statsResult] = await Promise.allSettled([
      cloudDataService.selectDemographicsProfileRow(userId),
      cloudDataService.loadStatsProfiles(userId),
    ]);

    if (demographicsResult.status === "fulfilled") {
      demographics = demographicsResult.value;
    } else {
      console.warn("Failed to load demographics profile", demographicsResult.reason);
    }

    if (statsResult.status === "fulfilled") {
      statsProfiles = statsResult.value ?? [];
    } else {
      console.warn("Failed to load stats profiles", statsResult.reason);
    }
  } catch (error) {
    console.warn("Unexpected error loading cloud profile state", error);
  }

  const metadata = (session.user?.user_metadata ?? {}) as Record<string, unknown>;

  const pickString = (...values: Array<unknown>): string => {
    for (const value of values) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return "";
  };

  const firstName = pickString(
    demographics?.first_name,
    seed?.firstName,
    metadata.first_name,
    metadata.firstName,
  );
  const lastInitialRaw = pickString(
    demographics?.last_initial,
    seed?.lastInitial,
    metadata.last_initial,
    metadata.lastInitial,
  );
  const lastInitial = lastInitialRaw ? lastInitialRaw.charAt(0).toUpperCase() : "";
  const usernameFallback = pickString(
    demographics?.username,
    seed?.username,
    metadata.username,
    metadata.user_name,
    session.user?.email,
  );
  const playerName = (() => {
    if (firstName && lastInitial) return `${firstName} ${lastInitial}.`;
    if (firstName) return firstName;
    if (usernameFallback) return usernameFallback;
    return "Player";
  })();

  const gradeCandidate = pickString(
    demographics?.grade,
    seed?.grade,
    metadata.grade,
  );
  const grade = isGradeValue(gradeCandidate) ? gradeCandidate : "Not applicable";
  const ageCandidate =
    demographics?.age ?? seed?.age ?? (typeof metadata.age === "string" || typeof metadata.age === "number" ? metadata.age : null);
  const age = sanitizeAge(ageCandidate);
  const school = pickString(demographics?.school, seed?.school, metadata.school);
  const priorExperience = pickString(
    demographics?.prior_experience,
    seed?.priorExperience,
    metadata.prior_experience,
    metadata.priorExperience,
  );

  const consentVersion = pickString(demographics?.consent_version) || CONSENT_TEXT_VERSION;
  const consentTimestamp = pickString(demographics?.consent_granted_at) || new Date().toISOString();

  const profile: PlayerProfile = {
    id: userId,
    playerName,
    grade,
    age,
    school: school || undefined,
    priorExperience: priorExperience || undefined,
    consent: {
      agreed: true,
      consentTextVersion: consentVersion,
      timestamp: consentTimestamp,
    },
    needsReview: !isGradeValue(gradeCandidate) || age === null,
  };

  const normalizedStats: StatsProfile[] = (() => {
    if (Array.isArray(statsProfiles) && statsProfiles.length > 0) {
      const sanitized: StatsProfile[] = [];
      statsProfiles.forEach(profileEntry => {
        if (!profileEntry || typeof profileEntry !== "object") {
          return;
        }
        const id = typeof profileEntry.id === "string" ? profileEntry.id : null;
        const playerIdValue =
          typeof (profileEntry as StatsProfile).user_id === "string"
            ? (profileEntry as StatsProfile).user_id
            : typeof (profileEntry as any).playerId === "string"
              ? (profileEntry as any).playerId
              : null;
        if (!id || !playerIdValue) {
          return;
        }
        const baseNameValue =
          typeof (profileEntry as StatsProfile).base_name === "string" && (profileEntry as StatsProfile).base_name.trim()
            ? (profileEntry as StatsProfile).base_name
            : typeof (profileEntry as any).baseName === "string" && (profileEntry as any).baseName.trim()
              ? (profileEntry as any).baseName
              : "primary";
        const versionValue = Number.isFinite((profileEntry as StatsProfile).profile_version)
          ? Math.max(1, Math.floor(Number((profileEntry as StatsProfile).profile_version)))
          : Number.isFinite((profileEntry as any).version)
            ? Math.max(1, Math.floor(Number((profileEntry as any).version)))
            : 1;
        const createdAtValue =
          typeof (profileEntry as StatsProfile).created_at === "string"
            ? (profileEntry as StatsProfile).created_at
            : typeof (profileEntry as any).createdAt === "string"
              ? (profileEntry as any).createdAt
              : new Date().toISOString();
        const updatedAtValue =
          typeof (profileEntry as StatsProfile).updated_at === "string"
            ? (profileEntry as StatsProfile).updated_at
            : createdAtValue;
        const sanitizedEntry: StatsProfile = {
          id,
          user_id: playerIdValue,
          demographics_profile_id:
            typeof (profileEntry as StatsProfile).demographics_profile_id === "string"
              ? (profileEntry as StatsProfile).demographics_profile_id
              : null,
          base_name: baseNameValue,
          profile_version: versionValue,
          display_name:
            typeof (profileEntry as StatsProfile).display_name === "string" && (profileEntry as StatsProfile).display_name.trim()
              ? (profileEntry as StatsProfile).display_name
              : makeProfileDisplayName(baseNameValue, versionValue),
          training_count: Number.isFinite((profileEntry as StatsProfile).training_count)
            ? Number((profileEntry as StatsProfile).training_count)
            : Number.isFinite((profileEntry as any).trainingCount)
              ? Number((profileEntry as any).trainingCount)
              : 0,
          training_completed:
            (profileEntry as StatsProfile).training_completed === true || (profileEntry as any).trained === true,
          predictor_default:
            (profileEntry as StatsProfile).predictor_default === true || (profileEntry as any).predictorDefault === true,
          seen_post_training_cta:
            (profileEntry as StatsProfile).seen_post_training_cta === true ||
            (profileEntry as any).seenPostTrainingCTA === true,
          previous_profile_id:
            typeof (profileEntry as StatsProfile).previous_profile_id === "string"
              ? (profileEntry as StatsProfile).previous_profile_id
              : typeof (profileEntry as any).previousProfileId === "string"
                ? (profileEntry as any).previousProfileId
                : null,
          next_profile_id:
            typeof (profileEntry as StatsProfile).next_profile_id === "string"
              ? (profileEntry as StatsProfile).next_profile_id
              : typeof (profileEntry as any).nextProfileId === "string"
                ? (profileEntry as any).nextProfileId
                : null,
          archived: (profileEntry as StatsProfile).archived === true,
          metadata:
            (profileEntry as StatsProfile).metadata && typeof (profileEntry as StatsProfile).metadata === "object"
              ? (profileEntry as StatsProfile).metadata
              : {} as StatsProfile["metadata"],
          created_at: createdAtValue,
          updated_at: updatedAtValue,
          version: Number.isFinite((profileEntry as StatsProfile).version)
            ? Math.max(1, Math.floor(Number((profileEntry as StatsProfile).version)))
            : 1,
        };
        sanitized.push(sanitizedEntry);
      });
      if (sanitized.length > 0) {
        return sanitized;
      }
    }

    const fallbackTrainingCount = Number.isFinite(demographics?.training_count)
      ? Number(demographics?.training_count)
      : 0;
    const fallbackTrained = demographics?.training_completed === true;
    const fallbackId = `${userId}-primary-profile`;
    const timestamp = new Date().toISOString();
    return [
      {
        id: fallbackId,
        user_id: userId,
        demographics_profile_id: null,
        base_name: "primary",
        profile_version: 1,
        display_name: "Primary",
        training_count: fallbackTrainingCount,
        training_completed: fallbackTrained,
        predictor_default: true,
        seen_post_training_cta: false,
        previous_profile_id: null,
        next_profile_id: null,
        archived: false,
        metadata: {} as StatsProfile["metadata"],
        created_at: timestamp,
        updated_at: timestamp,
        version: 1,
      },
    ];
  })();

  const filteredStats = normalizedStats.filter(entry => entry.user_id === userId);

  return {
    playerId: userId,
    profile,
    statsProfiles: filteredStats,
  };
}

function resolveStatsProfileForPlayer(
  playerId: string | null | undefined,
  scope: StorageScope,
): StoredStatsProfileSnapshot | null {
  if (!playerId) return null;
  const profiles = loadStoredStatsProfiles(scope);
  if (profiles.length === 0) return null;
  const candidates = profiles.filter(profile => profile.playerId === playerId);
  if (candidates.length === 0) return null;
  const currentProfileId = getStoredCurrentStatsProfileId(scope);
  if (currentProfileId) {
    const preferred = candidates.find(profile => profile.id === currentProfileId);
    if (preferred) {
      return preferred;
    }
  }
  return candidates[0] ?? null;
}

interface LocalTimestampEntry {
  playerId: string;
  timestamp: string;
}

function readScopedStorageArray<T>(scope: StorageScope, key: string): T[] {
  const storage = getScopedStorage(scope);
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function loadRoundTimestamps(scope: StorageScope): LocalTimestampEntry[] {
  const entries = readScopedStorageArray<Partial<RoundLog>>(scope, STATS_ROUNDS_KEY) ?? [];
  const summaries: LocalTimestampEntry[] = [];
  entries.forEach(entry => {
    const playerId = typeof entry?.playerId === "string" ? entry.playerId : null;
    const timestamp = typeof entry?.t === "string" ? entry.t : null;
    if (playerId && timestamp) {
      summaries.push({ playerId, timestamp });
    }
  });
  return summaries;
}

function loadMatchTimestamps(scope: StorageScope): LocalTimestampEntry[] {
  const entries = readScopedStorageArray<Partial<MatchSummary>>(scope, STATS_MATCHES_KEY) ?? [];
  const summaries: LocalTimestampEntry[] = [];
  entries.forEach(entry => {
    const playerId = typeof entry?.playerId === "string" ? entry.playerId : null;
    if (!playerId) return;
    const endedAt = typeof entry?.endedAt === "string" ? entry.endedAt : null;
    const startedAt = typeof entry?.startedAt === "string" ? entry.startedAt : null;
    const timestamp = endedAt || startedAt;
    if (timestamp) {
      summaries.push({ playerId, timestamp });
    }
  });
  return summaries;
}

function loadStoredModelStates(scope: StorageScope): StoredPredictorModelState[] {
  const entries = readScopedStorageArray<StoredPredictorModelState>(scope, STATS_MODEL_STATE_KEY) ?? [];
  const sanitized: StoredPredictorModelState[] = [];
  entries.forEach(entry => {
    if (!entry || typeof entry !== "object") return;
    const profileId = typeof entry.profileId === "string" ? entry.profileId : null;
    if (!profileId) return;
    sanitized.push(entry);
  });
  return sanitized;
}

function computeLatestTimestamp(
  playerId: string,
  rounds: LocalTimestampEntry[],
  matches: LocalTimestampEntry[],
): string | null {
  const relevant = rounds
    .concat(matches)
    .filter(entry => entry.playerId === playerId)
    .map(entry => entry.timestamp)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (relevant.length === 0) {
    return null;
  }
  return relevant.reduce((latest, current) => (current > latest ? current : latest));
}

interface LocalProfileSummary {
  account: LocalAccountRecord;
  trainingCount: number;
  trainingComplete: boolean;
  lastPlayedAt: string | null;
}

function buildLocalProfileSummaries(accounts: LocalAccountRecord[]): LocalProfileSummary[] {
  if (accounts.length === 0) return [];
  const scope: StorageScope = "local";
  const statsProfiles = loadStoredStatsProfiles(scope);
  const roundTimestamps = loadRoundTimestamps(scope);
  const matchTimestamps = loadMatchTimestamps(scope);

  return accounts.map(account => {
    const profileId = account.profile.id;
    const statsSnapshot = resolveStatsProfileForPlayer(profileId, scope);
    const trainingCount = statsSnapshot?.trainingCount ?? 0;
    const trainingComplete = statsSnapshot?.trained === true || trainingCount >= TRAINING_ROUNDS_REQUIRED;
    const lastPlayedAt = computeLatestTimestamp(profileId, roundTimestamps, matchTimestamps);
    return {
      account,
      trainingCount,
      trainingComplete,
      lastPlayedAt,
    };
  });
}

function formatLastPlayed(timestamp: string | null): string {
  if (!timestamp) return "No matches yet";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Last played: unknown";
  }
  try {
    return `Last played: ${new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date)}`;
  } catch {
    return `Last played: ${date.toISOString()}`;
  }
}

interface LocalHydrationResult {
  trainingComplete: boolean;
  statsProfileId: string | null;
}

async function hydrateLocalProfileArtifacts(profileId: string): Promise<LocalHydrationResult> {
  if (!isBrowser()) {
    return { trainingComplete: false, statsProfileId: null };
  }
  const scope: StorageScope = "local";
  const storage = getScopedStorage(scope);
  if (!storage) {
    return { trainingComplete: false, statsProfileId: null };
  }

  // Yield to the event loop so loading indicators have a chance to render.
  await new Promise(resolve => setTimeout(resolve, 0));

  const statsProfiles = loadStoredStatsProfiles(scope);
  const rounds = readScopedStorageArray<RoundLog>(scope, STATS_ROUNDS_KEY);
  const matches = readScopedStorageArray<MatchSummary>(scope, STATS_MATCHES_KEY);
  const modelStates = loadStoredModelStates(scope);

  // Touch the collections by filtering for the selected profile. We intentionally
  // avoid mutating storage to honor the non-destructive requirement.
  void statsProfiles.filter(profile => profile.playerId === profileId);
  void rounds.filter(round => round?.playerId === profileId);
  void matches.filter(match => match?.playerId === profileId);
  void modelStates.filter(state => state.profileId === profileId);

  const preferredStatsProfile = resolveStatsProfileForPlayer(profileId, scope);
  if (preferredStatsProfile) {
    try {
      storage.setItem(STATS_CURRENT_PROFILE_KEY, preferredStatsProfile.id);
    } catch {
      // Ignore persistence failures – hydration should continue.
    }
  }
  const resolvedTrainingCount = Number.isFinite(preferredStatsProfile?.trainingCount)
    ? Number(preferredStatsProfile?.trainingCount)
    : 0;
  const trainingComplete = (() => {
    if (!preferredStatsProfile) return false;
    if (preferredStatsProfile.trained === true) return true;
    if (preferredStatsProfile.trained === false) return false;
    return resolvedTrainingCount >= TRAINING_ROUNDS_REQUIRED;
  })();

  return { trainingComplete, statsProfileId: preferredStatsProfile?.id ?? null };
}

function shouldStartTrainingFromStorage(playerIdHint: string | null, scope: StorageScope): boolean {
  const storage = getScopedStorage(scope);
  if (!storage) return false;
  const activePlayerId = playerIdHint ?? storage.getItem(CURRENT_PLAYER_STORAGE_KEY);
  if (!activePlayerId) {
    return false;
  }
  const profile = resolveStatsProfileForPlayer(activePlayerId, scope);
  if (!profile) {
    return true;
  }
  if (profile.trained === true) {
    return false;
  }
  if (profile.trained === false) {
    return true;
  }
  const trainingCount =
    typeof profile.trainingCount === "number" && Number.isFinite(profile.trainingCount)
      ? profile.trainingCount
      : 0;
  return trainingCount < TRAINING_ROUNDS_REQUIRED;
}

function shouldStartTrainingFromProfiles(playerIdHint: string | null, profiles: StatsProfile[]): boolean {
  if (!playerIdHint) {
    return false;
  }
  const candidates = profiles.filter(profile => profile.user_id === playerIdHint);
  if (candidates.length === 0) {
    return true;
  }
  const preferred = candidates.find(profile => profile.predictor_default) ?? candidates[0];
  if (preferred.training_completed === true) {
    return false;
  }
  if (preferred.training_completed === false) {
    return true;
  }
  const trainingCount = Number.isFinite(preferred.training_count) ? Number(preferred.training_count) : 0;
  return trainingCount < TRAINING_ROUNDS_REQUIRED;
}

function shouldStartTrainingAfterAuth(
  mode: PlayMode,
  playerIdHint: string | null,
  statsProfiles?: StatsProfile[],
): boolean {
  if (mode === "cloud") {
    return shouldStartTrainingFromProfiles(playerIdHint, statsProfiles ?? []);
  }
  const scope = scopeFromMode(mode);
  return shouldStartTrainingFromStorage(playerIdHint, scope);
}

interface PostAuthOptions {
  playerId?: string | null;
  statsProfiles?: StatsProfile[];
  trainingComplete?: boolean;
}

function resolvePostAuthDestination(mode: PlayMode, options?: PostAuthOptions): string {
  if (mode === "local") {
    if (options?.trainingComplete === true) {
      return MODES_ROUTE;
    }
    if (options?.trainingComplete === false) {
      return TRAINING_ROUTE;
    }
    const requireTraining = shouldStartTrainingAfterAuth(mode, options?.playerId ?? null, options?.statsProfiles);
    return requireTraining ? TRAINING_ROUTE : MODES_ROUTE;
  }

  const defaultPath = getPostAuthPath();
  const requireTraining = shouldStartTrainingAfterAuth(mode, options?.playerId ?? null, options?.statsProfiles);
  if (requireTraining) {
    return TRAINING_ROUTE;
  }
  if (defaultPath === BOOT_ROUTE) {
    return MODES_ROUTE;
  }
  return defaultPath;
}

function buildPlayerProfileFromForm(form: SignUpFormState): PlayerProfile {
  const first = form.firstName.trim();
  const initial = form.lastInitial.trim().charAt(0).toUpperCase();
  const playerName = initial ? `${first} ${initial}.` : first || "Player";
  return {
    id: createProfileId(),
    playerName,
    grade: isGradeValue(form.grade) ? form.grade : "Not applicable",
    age: sanitizeAge(form.age),
    school: form.school.trim() || undefined,
    priorExperience: form.priorExperience.trim() || undefined,
    consent: {
      agreed: true,
      consentTextVersion: CONSENT_TEXT_VERSION,
      timestamp: new Date().toISOString(),
    },
    needsReview: false,
  };
}

const defaultAuthMode: AuthMode = isSupabaseConfigured && DEPLOY_ENV === "cloud" ? "cloud" : "local";

function usePostAuthNavigation() {
  const navigate = useNavigate();
  return useCallback(
    (mode: PlayMode, options?: PostAuthOptions) => {
      const destination = resolvePostAuthDestination(mode, options);
      navigate(destination, { replace: true });
    },
    [navigate],
  );
}

export default function Welcome(): JSX.Element {
  const navigateToPostAuth = usePostAuthNavigation();
  const { setMode } = usePlayMode();
  const [overlay, setOverlay] = useState<WelcomeOverlay>("chooser");
  const [activeTab, setActiveTab] = useState<AuthTab>("signIn");

  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  const [cloudSignInUsername, setCloudSignInUsername] = useState("");
  const [cloudSignInPassword, setCloudSignInPassword] = useState("");
  const [cloudSignInError, setCloudSignInError] = useState<string | null>(null);
  const [cloudSignInPending, setCloudSignInPending] = useState(false);

  const [cloudSignUpForm, setCloudSignUpForm] = useState<SignUpFormState>(initialSignUpForm);
  const [cloudSignUpError, setCloudSignUpError] = useState<string | null>(null);
  const [cloudSignUpPending, setCloudSignUpPending] = useState(false);

  const [cloudSignOutError, setCloudSignOutError] = useState<string | null>(null);
  const [cloudSignOutPending, setCloudSignOutPending] = useState(false);

  const [localSession, setLocalSession] = useState<LocalSession | null>(() => loadActiveLocalSession());
  const [localAccounts, setLocalAccounts] = useState<LocalAccountRecord[]>(() => loadLocalAccounts());
  const [selectedLocalProfileId, setSelectedLocalProfileId] = useState<string | null>(() => {
    const existing = loadActiveLocalSession();
    return existing?.profile.id ?? null;
  });
  const [showLocalCreateForm, setShowLocalCreateForm] = useState(() => loadLocalAccounts().length === 0);
  const [localSignUpForm, setLocalSignUpForm] = useState<SignUpFormState>(initialSignUpForm);
  const [localSignUpError, setLocalSignUpError] = useState<string | null>(null);
  const [localSignUpPending, setLocalSignUpPending] = useState(false);
  const [localHydrating, setLocalHydrating] = useState(false);
  const [localHydrationError, setLocalHydrationError] = useState<string | null>(null);
  const localHydrationAbortRef = useRef(false);

  const supabaseReady = isSupabaseConfigured && Boolean(supabaseClient);

  const refreshLocalAccounts = useCallback(() => {
    const accounts = loadLocalAccounts();
    setLocalAccounts(accounts);
    return accounts;
  }, []);

  useEffect(() => {
    const client = supabaseClient;
    if (!client) {
      setInitializing(false);
      return;
    }
    let cancelled = false;
    const runInitial = async () => {
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      const currentSession = data?.session ?? null;
      setSession(currentSession);
      setInitializing(false);
      if (currentSession) {
        const hydration = await hydrateCloudPlayerState(currentSession);
        if (cancelled) return;
        setMode("cloud");
        navigateToPostAuth(
          "cloud",
          hydration ? { playerId: hydration.playerId, statsProfiles: hydration.statsProfiles } : undefined,
        );
      }
    };
    void runInitial();
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      if (nextSession) {
        hydrateCloudPlayerState(nextSession).then(hydration => {
          if (cancelled) return;
          setMode("cloud");
          navigateToPostAuth(
            "cloud",
            hydration ? { playerId: hydration.playerId, statsProfiles: hydration.statsProfiles } : undefined,
          );
        });
      }
    });
    return () => {
      cancelled = true;
      listener?.subscription.unsubscribe();
    };
  }, [navigateToPostAuth, setMode]);

  useEffect(() => {
    const accounts = refreshLocalAccounts();
    const existing = loadActiveLocalSession();
    setLocalSession(existing);
    if (existing) {
      setSelectedLocalProfileId(existing.profile.id);
    } else if (accounts.length === 1) {
      setSelectedLocalProfileId(accounts[0].profile.id);
    }
    setShowLocalCreateForm(accounts.length === 0);
  }, [refreshLocalAccounts]);

  useEffect(() => {
    if (localAccounts.length > 0) {
      return;
    }
    let cancelled = false;
    const restoreFromCache = async () => {
      const cachedAccounts = await loadLocalAccountsFromCache();
      if (cancelled || !cachedAccounts || cachedAccounts.length === 0) {
        return;
      }
      saveLocalAccounts(cachedAccounts);
      if (cancelled) {
        return;
      }
      setLocalAccounts(cachedAccounts);
      setShowLocalCreateForm(false);
      const existing = loadActiveLocalSession();
      setLocalSession(existing);
      if (existing) {
        setSelectedLocalProfileId(existing.profile.id);
      } else if (!selectedLocalProfileId) {
        setSelectedLocalProfileId(cachedAccounts[0].profile.id);
      }
    };
    void restoreFromCache();
    return () => {
      cancelled = true;
    };
  }, [localAccounts.length, selectedLocalProfileId]);

  useEffect(() => {
    if (overlay !== "local") {
      return;
    }
    const accounts = refreshLocalAccounts();
    const existing = loadActiveLocalSession();
    setLocalSession(existing);
    if (accounts.length === 1) {
      const sole = accounts[0];
      setSelectedLocalProfileId(sole.profile.id);
    } else if (existing) {
      setSelectedLocalProfileId(existing.profile.id);
    }
    setShowLocalCreateForm(accounts.length === 0);
    localHydrationAbortRef.current = false;
  }, [overlay, refreshLocalAccounts]);

  useEffect(() => {
    if (overlay === "cloud") {
      setActiveTab("signIn");
    }
  }, [overlay]);

  const localSummaries = useMemo(() => buildLocalProfileSummaries(localAccounts), [localAccounts]);
  const autoSelectedHint =
    localSummaries.length === 1 && selectedLocalProfileId === (localSummaries[0]?.account.profile.id ?? null);


  const handleCloudSignIn = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!supabaseClient) {
        setCloudSignInError("Supabase is not configured.");
        return;
      }
      setCloudSignInError(null);
      setCloudSignInPending(true);
      try {
        const trimmedUsername = cloudSignInUsername.trim();
        const result = await loginThroughEdge({
          username: trimmedUsername,
          password: cloudSignInPassword,
        });
        if (result.error || !result.data) {
          setCloudSignInError(result.error ?? result.data?.message ?? "Unable to sign in. Try again.");
          return;
        }
        if (!result.data.session) {
          setCloudSignInError(
            result.data.message ?? "Sign-in succeeded, but no session was returned. Check your email to continue.",
          );
          return;
        }
        const nextSession = await setEdgeSession(result.data.session);
        if (!nextSession) {
          setCloudSignInError("Sign-in succeeded, but we could not establish a session. Try again.");
          return;
        }
        setSession(nextSession);
        const hydration = await hydrateCloudPlayerState(nextSession, { username: trimmedUsername });
        setMode("cloud");
        navigateToPostAuth(
          "cloud",
          hydration ? { playerId: hydration.playerId, statsProfiles: hydration.statsProfiles } : undefined,
        );
      } catch (error) {
        setCloudSignInError(error instanceof Error ? error.message : "Unable to sign in. Try again.");
      } finally {
        setCloudSignInPending(false);
      }
    },
    [cloudSignInPassword, cloudSignInUsername, navigateToPostAuth, setMode],
  );

  const handleCloudSignUpInputChange = useCallback(
    <K extends keyof SignUpFormState>(key: K, value: SignUpFormState[K]) => {
      setCloudSignUpForm(prev => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleCloudSignUp = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!supabaseClient) {
        setCloudSignUpError("Supabase is not configured.");
        return;
      }
      const { firstName, lastInitial, grade, age, school, priorExperience, username, password } = cloudSignUpForm;
      if (!firstName.trim()) {
        setCloudSignUpError("Enter a first name.");
        return;
      }
      if (!lastInitial.trim()) {
        setCloudSignUpError("Enter a last initial.");
        return;
      }
      if (!grade) {
        setCloudSignUpError("Select a grade.");
        return;
      }
      if (!age) {
        setCloudSignUpError("Select an age.");
        return;
      }
      if (!username.trim()) {
        setCloudSignUpError("Choose a username.");
        return;
      }
      if (!password.trim()) {
        setCloudSignUpError("Enter a password.");
        return;
      }
      setCloudSignUpError(null);
      setCloudSignUpPending(true);
      try {
        const result = await signupThroughEdge({
          firstName: firstName.trim(),
          lastInitial: lastInitial.trim(),
          grade,
          age,
          school,
          priorExperience,
          username: username.trim(),
          password,
        });
        if (result.error || !result.data) {
          setCloudSignUpError(result.error ?? result.data?.message ?? "Unable to sign up. Try again.");
          return;
        }
        if (!result.data.session) {
          setCloudSignUpError(result.data.message ?? "Sign-up succeeded, but no session was returned.");
          return;
        }
        const nextSession = await setEdgeSession(result.data.session);
        if (!nextSession) {
          setCloudSignUpError("Sign-up succeeded, but we could not establish a session. Try again.");
          return;
        }
        setSession(nextSession);
        const hydration = await hydrateCloudPlayerState(nextSession, {
          firstName: firstName.trim(),
          lastInitial: lastInitial.trim(),
          grade,
          age,
          school,
          priorExperience,
          username: username.trim(),
        });
        setMode("cloud");
        navigateToPostAuth(
          "cloud",
          hydration ? { playerId: hydration.playerId, statsProfiles: hydration.statsProfiles } : undefined,
        );
      } catch (error) {
        setCloudSignUpError(error instanceof Error ? error.message : "Unable to sign up. Try again.");
      } finally {
        setCloudSignUpPending(false);
      }
    },
    [cloudSignUpForm, navigateToPostAuth, setMode],
  );

  const handleCloudSignOut = useCallback(async () => {
    if (!supabaseClient) {
      setCloudSignOutError("Supabase is not configured.");
      return;
    }
    setCloudSignOutError(null);
    setCloudSignOutPending(true);
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        throw error;
      }
      setSession(null);
      setMode("local");
      setOverlay("chooser");
      setActiveTab("signIn");
      setCloudSignInUsername("");
      setCloudSignInPassword("");
      const sessionScopedStorage = getScopedStorage("session");
      if (sessionScopedStorage) {
        [
          PLAYERS_STORAGE_KEY,
          CURRENT_PLAYER_STORAGE_KEY,
          STATS_PROFILES_KEY,
          STATS_CURRENT_PROFILE_KEY,
          STATS_ROUNDS_KEY,
          STATS_MATCHES_KEY,
          STATS_MODEL_STATE_KEY,
        ].forEach(key => {
          sessionScopedStorage.removeItem(key);
        });
      }
    } catch (error) {
      setCloudSignOutError(error instanceof Error ? error.message : "Unable to sign out right now.");
    } finally {
      setCloudSignOutPending(false);
    }
  }, [setMode]);

  const handleLocalSignUpInputChange = useCallback(
    <K extends keyof SignUpFormState>(key: K, value: SignUpFormState[K]) => {
      setLocalSignUpForm(prev => ({ ...prev, [key]: value }));
    },
    [],
  );

  const completeLocalSelection = useCallback(
    async (profileId: string) => {
      localHydrationAbortRef.current = false;
      setLocalHydrating(true);
      setLocalHydrationError(null);
      try {
        const accounts = refreshLocalAccounts();
        const account = accounts.find(candidate => candidate.profile.id === profileId);
        if (!account) {
          throw new Error("We couldn't find that profile on this device.");
        }
        const hydration = await hydrateLocalProfileArtifacts(account.profile.id);
        if (localHydrationAbortRef.current) {
          return;
        }
        setLocalSession({ profile: account.profile });
        setSelectedLocalProfileId(account.profile.id);
        setMode("local");
        setActiveLocalAccount(account, hydration.statsProfileId);
        navigateToPostAuth("local", {
          playerId: account.profile.id,
          trainingComplete: hydration.trainingComplete,
        });
      } catch (error) {
        if (!localHydrationAbortRef.current) {
          setLocalHydrationError(error instanceof Error ? error.message : "Unable to load local data.");
        }
      } finally {
        if (!localHydrationAbortRef.current) {
          setLocalHydrating(false);
        }
      }
    },
    [navigateToPostAuth, refreshLocalAccounts, setMode],
  );

  const handleLocalSignUp = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isBrowser()) {
        setLocalSignUpError("Local storage is not available.");
        return;
      }
      const { firstName, lastInitial, grade, age, school, priorExperience } = localSignUpForm;
      if (!firstName.trim()) {
        setLocalSignUpError("Enter a first name.");
        return;
      }
      if (!lastInitial.trim()) {
        setLocalSignUpError("Enter a last initial.");
        return;
      }
      if (!grade) {
        setLocalSignUpError("Select a grade.");
        return;
      }
      if (!age) {
        setLocalSignUpError("Select an age.");
        return;
      }
      setLocalSignUpError(null);
      setLocalSignUpPending(true);
      try {
        const accounts = loadLocalAccounts();
        const profile = buildPlayerProfileFromForm(localSignUpForm);
        const nextAccount: LocalAccountRecord = {
          profile,
          createdAt: new Date().toISOString(),
          storageMode: "local",
        };
        const deduped = accounts.filter(candidate => candidate.profile.id !== profile.id).concat(nextAccount);
        saveLocalAccounts(deduped);
        setLocalAccounts(deduped);
        setShowLocalCreateForm(false);
        setLocalSignUpForm(initialSignUpForm);
        setSelectedLocalProfileId(nextAccount.profile.id);
        await completeLocalSelection(nextAccount.profile.id);
      } catch (error) {
        setLocalSignUpError(error instanceof Error ? error.message : "Unable to sign up. Try again.");
      } finally {
        setLocalSignUpPending(false);
      }
    },
    [completeLocalSelection, localSignUpForm],
  );

  const handleSelectLocalProfile = useCallback((profileId: string) => {
    setSelectedLocalProfileId(profileId);
    setLocalHydrationError(null);
  }, []);

  const handleLocalContinue = useCallback(async () => {
    if (!selectedLocalProfileId || localHydrating) {
      return;
    }
    await completeLocalSelection(selectedLocalProfileId);
  }, [completeLocalSelection, localHydrating, selectedLocalProfileId]);

  const handleOpenLocalOverlay = useCallback(() => {
    localHydrationAbortRef.current = false;
    setOverlay("local");
    setMode("local");
  }, [setMode]);

  const handleOpenCloudOverlay = useCallback(() => {
    setOverlay("cloud");
    setMode("cloud");
    setCloudSignInError(null);
  }, [setMode]);

  const handleBackToChooser = useCallback(() => {
    localHydrationAbortRef.current = true;
    setLocalHydrating(false);
    setOverlay("chooser");
    setLocalHydrationError(null);
    setCloudSignInError(null);
    setCloudSignUpError(null);
    if (!session) {
      setMode("local");
    }
  }, [session, setMode]);

  const localContinueDisabled = !selectedLocalProfileId || localHydrating;
  const localProfilesEmpty = localSummaries.length === 0;
  const cloudStatusMessage = useMemo(() => {
    if (!supabaseReady) {
      return "Supabase is not configured. Provide the environment variables to enable cloud sign-in.";
    }
    if (initializing) {
      return "Checking for an existing session…";
    }
    if (session) {
      return `Signed in as ${session.user?.email ?? "cloud user"}.`;
    }
    return "Cloud mode ready.";
  }, [initializing, session, supabaseReady]);
  const cloudSignOutDisabled = !supabaseReady || cloudSignOutPending || !session;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-50">
      <header className="px-6 pt-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">RPS Predictor</h1>
        <p className="mt-3 text-base text-slate-300">Choose how you want to play and jump back into your matches.</p>
      </header>
      <main className="mx-auto mt-10 w-full max-w-5xl flex-1 px-4 pb-16">
        {overlay === "chooser" ? (
          <section className="rounded-3xl bg-white/10 p-10 text-center shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-semibold text-white">Choose how you want to play today.</h2>
            <p className="mt-2 text-sm text-slate-200">
              Use a profile saved on this device or sync your progress through the cloud.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleOpenLocalOverlay}
                className="rounded-3xl bg-white px-6 py-5 text-lg font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Use Local
              </button>
              <button
                type="button"
                onClick={handleOpenCloudOverlay}
                className="rounded-3xl bg-sky-500/90 px-6 py-5 text-lg font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
              >
                Use Cloud
              </button>
            </div>
          </section>
        ) : overlay === "local" ? (
          <section className="rounded-3xl bg-white/10 p-8 shadow-2xl backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">Local Profiles</h2>
                <p className="mt-1 text-sm text-slate-200">
                  Pick a saved profile or create a new one. Your progress and matches are saved on this device.
                </p>
              </div>
              <button
                type="button"
                onClick={handleBackToChooser}
                className="rounded-full border border-slate-500/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Back
              </button>
            </div>
            <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
              <div className="space-y-4">
                {localProfilesEmpty ? (
                  <div className="rounded-2xl border border-dashed border-slate-500/60 p-8 text-center text-sm text-slate-200">
                    <p>No profiles yet. Create a local profile to get started.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {localSummaries.map(summary => {
                      const profileId = summary.account.profile.id;
                      const selected = profileId === selectedLocalProfileId;
                      const isActive = localSession?.profile.id === profileId;
                      const trainingLabel = summary.trainingComplete
                        ? "Training complete"
                        : `Training: ${summary.trainingCount}/${TRAINING_ROUNDS_REQUIRED}`;
                      return (
                        <button
                          key={profileId}
                          type="button"
                          onClick={() => handleSelectLocalProfile(profileId)}
                          disabled={localHydrating}
                          className={`rounded-2xl border px-5 py-4 text-left transition ${
                            selected
                              ? "border-sky-400 bg-sky-500/20 text-white shadow-lg"
                              : "border-slate-600/70 bg-slate-900/40 text-slate-200 hover:border-sky-400 hover:bg-slate-900/60"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-lg font-semibold">{summary.account.profile.playerName}</h3>
                            {selected ? <span className="text-xs font-semibold text-sky-200">Selected</span> : null}
                          </div>
                          <p className="mt-2 text-xs uppercase tracking-wide text-slate-300">{trainingLabel}</p>
                          <p className="mt-3 text-xs text-slate-400">{formatLastPlayed(summary.lastPlayedAt)}</p>
                          {isActive ? <p className="mt-3 text-xs font-semibold text-emerald-300">Active previously</p> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
                {autoSelectedHint ? (
                  <p className="text-xs font-medium text-slate-200">
                    Preselected: {localSummaries[0].account.profile.playerName}. Confirm below to continue.
                  </p>
                ) : null}
              </div>
              <aside className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-white">Create Local Profile</h3>
                  <button
                    type="button"
                    onClick={() => setShowLocalCreateForm(prev => !prev)}
                    className="rounded-full border border-slate-500/60 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-white/70 hover:text-white"
                  >
                    {showLocalCreateForm ? 'Hide' : 'New profile'}
                  </button>
                </div>
                {showLocalCreateForm ? (
                  <form className="mt-6 space-y-4" onSubmit={handleLocalSignUp}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="local-first-name" className="text-xs font-medium uppercase tracking-wide text-slate-300">First name</label>
                        <input
                          id="local-first-name"
                          type="text"
                          value={localSignUpForm.firstName}
                          onChange={event => handleLocalSignUpInputChange('firstName', event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                      </div>
                      <div>
                        <label htmlFor="local-last-initial" className="text-xs font-medium uppercase tracking-wide text-slate-300">Last initial</label>
                        <input
                          id="local-last-initial"
                          type="text"
                          value={localSignUpForm.lastInitial}
                          onChange={event => handleLocalSignUpInputChange('lastInitial', event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                          maxLength={1}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="local-grade" className="text-xs font-medium uppercase tracking-wide text-slate-300">Grade</label>
                        <select
                          id="local-grade"
                          value={localSignUpForm.grade}
                          onChange={event => handleLocalSignUpInputChange('grade', event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        >
                          <option value="" disabled>Choose</option>
                          {GRADE_OPTIONS.map(option => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="local-age" className="text-xs font-medium uppercase tracking-wide text-slate-300">Age</label>
                        <select
                          id="local-age"
                          value={localSignUpForm.age}
                          onChange={event => handleLocalSignUpInputChange('age', event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        >
                          <option value="" disabled>Choose</option>
                          {AGE_OPTIONS.map(option => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="local-school" className="text-xs font-medium uppercase tracking-wide text-slate-300">School (optional)</label>
                      <input
                        id="local-school"
                        type="text"
                        value={localSignUpForm.school}
                        onChange={event => handleLocalSignUpInputChange('school', event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    </div>
                    <div>
                      <label htmlFor="local-prior-experience" className="text-xs font-medium uppercase tracking-wide text-slate-300">Prior experience (optional)</label>
                      <textarea
                        id="local-prior-experience"
                        value={localSignUpForm.priorExperience}
                        onChange={event => handleLocalSignUpInputChange('priorExperience', event.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    </div>
                    {localSignUpError ? (
                      <p className="text-sm font-semibold text-rose-300">{localSignUpError}</p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={localSignUpPending || localHydrating}
                      className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        localSignUpPending || localHydrating
                          ? "cursor-not-allowed bg-slate-700 text-slate-400"
                          : "bg-sky-500 text-white hover:bg-sky-400"
                      }`}
                    >
                      {localSignUpPending ? 'Creating…' : 'Create profile'}
                    </button>
                  </form>
                ) : (
                  <p className="mt-4 text-xs text-slate-400">Use the button above to create another local-only profile.</p>
                )}
              </aside>
            </div>
            {localHydrationError ? (
              <p className="mt-6 text-sm font-semibold text-rose-300">{localHydrationError}</p>
            ) : null}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              <button
                type="button"
                onClick={handleBackToChooser}
                className="rounded-full border border-slate-500/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Back to mode chooser
              </button>
              <div className="flex items-center gap-3">
                {localHydrating ? <span className="text-sm text-slate-200">Loading local data…</span> : null}
                <button
                  type="button"
                  onClick={handleLocalContinue}
                  disabled={localContinueDisabled}
                  className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
                    localContinueDisabled
                      ? "cursor-not-allowed bg-slate-600 text-slate-400"
                      : "bg-sky-500 text-white hover:bg-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
                  }`}
                >
                  {localHydrating ? 'Loading…' : 'Continue'}
                </button>
              </div>
            </div>
            <p className="mt-4 text-right text-xs text-slate-400">Manage detailed profile settings from Settings → Manage Profiles.</p>
          </section>
        ) : (
          <section className="rounded-3xl bg-white/10 p-8 shadow-2xl backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">Cloud Sign-In</h2>
                <p className="mt-1 text-sm text-slate-200">
                  Sign in with your cloud account or create one to sync progress across devices.
                </p>
              </div>
              <button
                type="button"
                onClick={handleBackToChooser}
                className="rounded-full border border-slate-500/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Back
              </button>
            </div>
            <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="flex w-full gap-2 rounded-3xl bg-slate-900/60 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('signIn')}
                    className={`flex-1 rounded-3xl px-5 py-3 text-sm font-semibold transition ${
                      activeTab === 'signIn' ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('signUp')}
                    className={`flex-1 rounded-3xl px-5 py-3 text-sm font-semibold transition ${
                      activeTab === 'signUp' ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Sign Up
                  </button>
                </div>
                {activeTab === 'signIn' ? (
                  <form className="mt-6 space-y-4" onSubmit={handleCloudSignIn}>
                    <div>
                      <label htmlFor="cloud-sign-in-username" className="text-xs font-medium uppercase tracking-wide text-slate-300">Username</label>
                      <input
                        id="cloud-sign-in-username"
                        type="text"
                        autoComplete="username"
                        value={cloudSignInUsername}
                        onChange={event => setCloudSignInUsername(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    </div>
                    <div>
                      <label htmlFor="cloud-sign-in-password" className="text-xs font-medium uppercase tracking-wide text-slate-300">Password</label>
                      <input
                        id="cloud-sign-in-password"
                        type="password"
                        autoComplete="current-password"
                        value={cloudSignInPassword}
                        onChange={event => setCloudSignInPassword(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    </div>
                    {cloudSignInError ? (
                      <p className="text-sm font-semibold text-rose-300">{cloudSignInError}</p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={!supabaseReady || cloudSignInPending}
                      className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        !supabaseReady || cloudSignInPending
                          ? "cursor-not-allowed bg-slate-700 text-slate-400"
                          : "bg-sky-500 text-white hover:bg-sky-400"
                      }`}
                    >
                      {cloudSignInPending ? 'Signing in…' : 'Sign In'}
                    </button>
                  </form>
                ) : (
                  <form className="mt-6 grid gap-4" onSubmit={handleCloudSignUp}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="cloud-sign-up-first-name" className="text-xs font-medium uppercase tracking-wide text-slate-300">First name</label>
                        <input
                          id="cloud-sign-up-first-name"
                          type="text"
                          value={cloudSignUpForm.firstName}
                          onChange={event => handleCloudSignUpInputChange('firstName', event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                      </div>
                      <div>
                        <label htmlFor="cloud-sign-up-last-initial" className="text-xs font-medium uppercase tracking-wide text-slate-300">Last initial</label>
                        <input
                          id="cloud-sign-up-last-initial"
                          type="text"
                          value={cloudSignUpForm.lastInitial}
                          onChange={event => handleCloudSignUpInputChange('lastInitial', event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                          maxLength={1}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="cloud-sign-up-grade" className="text-xs font-medium uppercase tracking-wide text-slate-300">Grade</label>
                        <select
                          id="cloud-sign-up-grade"
                          value={cloudSignUpForm.grade}
                          onChange={event => handleCloudSignUpInputChange('grade', event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        >
                          <option value="" disabled>Choose</option>
                          {GRADE_OPTIONS.map(option => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="cloud-sign-up-age" className="text-xs font-medium uppercase tracking-wide text-slate-300">Age</label>
                        <select
                          id="cloud-sign-up-age"
                          value={cloudSignUpForm.age}
                          onChange={event => handleCloudSignUpInputChange('age', event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        >
                          <option value="" disabled>Choose</option>
                          {AGE_OPTIONS.map(option => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="cloud-sign-up-school" className="text-xs font-medium uppercase tracking-wide text-slate-300">School (optional)</label>
                      <input
                        id="cloud-sign-up-school"
                        type="text"
                        value={cloudSignUpForm.school}
                        onChange={event => handleCloudSignUpInputChange('school', event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    </div>
                    <div>
                      <label htmlFor="cloud-sign-up-prior-experience" className="text-xs font-medium uppercase tracking-wide text-slate-300">Prior experience (optional)</label>
                      <textarea
                        id="cloud-sign-up-prior-experience"
                        value={cloudSignUpForm.priorExperience}
                        onChange={event => handleCloudSignUpInputChange('priorExperience', event.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="cloud-sign-up-username" className="text-xs font-medium uppercase tracking-wide text-slate-300">Username</label>
                        <input
                          id="cloud-sign-up-username"
                          type="text"
                          autoComplete="username"
                          value={cloudSignUpForm.username}
                          onChange={event => handleCloudSignUpInputChange('username', event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                      </div>
                      <div>
                        <label htmlFor="cloud-sign-up-password" className="text-xs font-medium uppercase tracking-wide text-slate-300">Password</label>
                        <input
                          id="cloud-sign-up-password"
                          type="password"
                          autoComplete="new-password"
                          value={cloudSignUpForm.password}
                          onChange={event => handleCloudSignUpInputChange('password', event.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                      </div>
                    </div>
                    {cloudSignUpError ? (
                      <p className="text-sm font-semibold text-rose-300">{cloudSignUpError}</p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={!supabaseReady || cloudSignUpPending}
                      className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        !supabaseReady || cloudSignUpPending
                          ? "cursor-not-allowed bg-slate-700 text-slate-400"
                          : "bg-sky-500 text-white hover:bg-sky-400"
                      }`}
                    >
                      {cloudSignUpPending ? 'Creating account…' : 'Create account'}
                    </button>
                  </form>
                )}
              </div>
              <aside className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-sm text-slate-200">
                <h3 className="text-base font-semibold text-white">Status</h3>
                <p className="mt-2 text-sm text-slate-300">{cloudStatusMessage}</p>
                {cloudSignOutError ? (
                  <p className="mt-3 text-sm font-semibold text-rose-300">{cloudSignOutError}</p>
                ) : null}
                <button
                  type="button"
                  onClick={handleCloudSignOut}
                  disabled={cloudSignOutDisabled}
                  className={`mt-6 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    cloudSignOutDisabled
                      ? "cursor-not-allowed bg-slate-700 text-slate-400"
                      : "bg-slate-100 text-slate-900 hover:bg-white"
                  }`}
                >
                  {cloudSignOutPending ? 'Signing out…' : 'Sign Out'}
                </button>
                <p className="mt-3 text-xs text-slate-400">Signing out keeps your cloud data but clears this browser's session.</p>
              </aside>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
