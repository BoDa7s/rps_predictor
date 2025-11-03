import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  clearActiveLocalSession,
  CURRENT_PLAYER_STORAGE_KEY,
  LOCAL_ACCOUNTS_KEY,
  LOCAL_ACTIVE_ACCOUNT_KEY,
  PLAYERS_STORAGE_KEY,
} from "../lib/localSession";
import { usePlayMode, type PlayMode } from "../lib/playMode";
import type { StatsProfile } from "../stats";

const AGE_OPTIONS = Array.from({ length: 96 }, (_, index) => String(5 + index));

const STATS_PROFILES_KEY = "rps_stats_profiles_v1";
const STATS_CURRENT_PROFILE_KEY = "rps_current_stats_profile_v1";
const STATS_ROUNDS_KEY = "rps_stats_rounds_v1";
const STATS_MATCHES_KEY = "rps_stats_matches_v1";
const STATS_MODEL_STATE_KEY = "rps_predictor_models_v1";
const TRAINING_ROUNDS_REQUIRED = 10;

type AuthTab = "signIn" | "signUp";
type AuthMode = "local" | "cloud";
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
    return parsed.map(normalizeStoredProfile);
  } catch {
    return [];
  }
}

function saveStoredPlayers(scope: StorageScope, players: PlayerProfile[]) {
  const storage = getScopedStorage(scope);
  if (!storage) return;
  storage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));
}

function ensurePlayerStored(profile: PlayerProfile, scope: StorageScope) {
  const storage = getScopedStorage(scope);
  if (!storage) return;
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
      .map(item => {
        if (!item || typeof item !== "object") return null;
        const profile = normalizeStoredProfile((item as any).profile);
        const storageMode = (item as any).storageMode === "cloud" ? "cloud" : "local";
        if (storageMode !== "local") {
          return null;
        }
        const createdAtValue =
          typeof (item as any).createdAt === "string"
            ? (item as any).createdAt
            : new Date().toISOString();
        return {
          profile,
          createdAt: createdAtValue,
          storageMode: "local",
        } as LocalAccountRecord;
      })
      .filter((account): account is LocalAccountRecord => account !== null);
  } catch {
    return [];
  }
}

function saveLocalAccounts(accounts: LocalAccountRecord[]) {
  const storage = getScopedStorage("local");
  if (!storage) return;
  storage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function setActiveLocalAccount(account: LocalAccountRecord) {
  const storage = getScopedStorage("local");
  if (!storage) return;
  ensurePlayerStored(account.profile, "local");
  storage.setItem(LOCAL_ACTIVE_ACCOUNT_KEY, account.profile.id);
}

function loadActiveLocalSession(): LocalSession | null {
  const storage = getScopedStorage("local");
  if (!storage) return null;
  const profileId = storage.getItem(LOCAL_ACTIVE_ACCOUNT_KEY);
  if (!profileId) return null;
  const accounts = loadLocalAccounts();
  const account = accounts.find(candidate => candidate.profile.id === profileId);
  if (account) {
    ensurePlayerStored(account.profile, "local");
    return { profile: account.profile };
  }
  const storedPlayers = loadStoredPlayers("local");
  const fallbackProfile = storedPlayers.find(player => player.id === profileId);
  if (!fallbackProfile) return null;
  ensurePlayerStored(fallbackProfile, "local");
  return { profile: fallbackProfile };
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
      const snapshot = item as StoredStatsProfileSnapshot & { id?: unknown; playerId?: unknown };
      const id = typeof snapshot.id === "string" ? snapshot.id : null;
      const playerId = typeof snapshot.playerId === "string" ? snapshot.playerId : null;
      if (!id || !playerId) {
        return;
      }
      const trainingCount =
        typeof snapshot.trainingCount === "number" && Number.isFinite(snapshot.trainingCount)
          ? snapshot.trainingCount
          : undefined;
      const trained = snapshot.trained === true ? true : snapshot.trained === false ? false : undefined;
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
        const playerIdValue = typeof profileEntry.playerId === "string" ? profileEntry.playerId : null;
        if (!id || !playerIdValue) {
          return;
        }
        const baseNameValue =
          typeof profileEntry.baseName === "string" && profileEntry.baseName.trim()
            ? profileEntry.baseName
            : "primary";
        const versionValue = Number.isFinite(profileEntry.version)
          ? Math.max(1, Math.floor(Number(profileEntry.version)))
          : 1;
        const sanitizedEntry: StatsProfile = {
          id,
          playerId: playerIdValue,
          name:
            typeof profileEntry.name === "string" && profileEntry.name.trim()
              ? profileEntry.name
              : baseNameValue,
          createdAt:
            typeof profileEntry.createdAt === "string"
              ? profileEntry.createdAt
              : new Date().toISOString(),
          trainingCount: Number.isFinite(profileEntry.trainingCount)
            ? Number(profileEntry.trainingCount)
            : 0,
          trained: profileEntry.trained === true,
          predictorDefault: profileEntry.predictorDefault === true,
          seenPostTrainingCTA: profileEntry.seenPostTrainingCTA === true,
          baseName: baseNameValue,
          version: versionValue,
          previousProfileId:
            typeof profileEntry.previousProfileId === "string" ? profileEntry.previousProfileId : null,
          nextProfileId: typeof profileEntry.nextProfileId === "string" ? profileEntry.nextProfileId : null,
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
    return [
      {
        id: fallbackId,
        playerId: userId,
        name: "Primary",
        createdAt: new Date().toISOString(),
        trainingCount: fallbackTrainingCount,
        trained: fallbackTrained,
        predictorDefault: true,
        seenPostTrainingCTA: false,
        baseName: "primary",
        version: 1,
        previousProfileId: null,
        nextProfileId: null,
      },
    ];
  })();

  const filteredStats = normalizedStats.filter(entry => entry.playerId === userId);

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
  const candidates = profiles.filter(profile => profile.playerId === playerIdHint);
  if (candidates.length === 0) {
    return true;
  }
  const preferred = candidates.find(profile => profile.predictorDefault) ?? candidates[0];
  if (preferred.trained === true) {
    return false;
  }
  if (preferred.trained === false) {
    return true;
  }
  const trainingCount = Number.isFinite(preferred.trainingCount) ? Number(preferred.trainingCount) : 0;
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

function resolvePostAuthDestination(
  mode: PlayMode,
  options?: { playerId?: string | null; statsProfiles?: StatsProfile[] },
): string {
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
    (mode: PlayMode, options?: { playerId?: string | null; statsProfiles?: StatsProfile[] }) => {
      const destination = resolvePostAuthDestination(mode, options);
      navigate(destination, { replace: true });
    },
    [navigate],
  );
}

export default function Welcome(): JSX.Element {
  const navigateToPostAuth = usePostAuthNavigation();
  const { setMode } = usePlayMode();
  const [authMode, setAuthMode] = useState<AuthMode>(defaultAuthMode);
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

  const [localSession, setLocalSession] = useState<LocalSession | null>(null);
  const [localAccounts, setLocalAccounts] = useState<LocalAccountRecord[]>(() => loadLocalAccounts());

  const [localSignUpForm, setLocalSignUpForm] = useState<SignUpFormState>(initialSignUpForm);
  const [localSignUpError, setLocalSignUpError] = useState<string | null>(null);
  const [localSignUpPending, setLocalSignUpPending] = useState(false);

  const [localSignOutError, setLocalSignOutError] = useState<string | null>(null);
  const [localSignOutPending, setLocalSignOutPending] = useState(false);

  const supabaseReady = isSupabaseConfigured && Boolean(supabaseClient);

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
          hydration
            ? { playerId: hydration.playerId, statsProfiles: hydration.statsProfiles }
            : undefined,
        );
      }
    };
    runInitial();
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      if (nextSession) {
        hydrateCloudPlayerState(nextSession).then(hydration => {
          if (cancelled) return;
          setMode("cloud");
          navigateToPostAuth(
            "cloud",
            hydration
              ? { playerId: hydration.playerId, statsProfiles: hydration.statsProfiles }
              : undefined,
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
    setLocalAccounts(loadLocalAccounts());
    const existing = loadActiveLocalSession();
    if (existing) {
      setLocalSession(existing);
      setMode("local");
    }
  }, [setMode]);

  useEffect(() => {
    if (authMode === "local") {
      setActiveTab("signUp");
    }
  }, [authMode]);

  const handleAuthModeChange = useCallback((mode: AuthMode) => {
    setAuthMode(mode);
    setActiveTab(mode === "cloud" ? "signIn" : "signUp");
    if (mode === "cloud") {
      setCloudSignInError(null);
    } else {
      setLocalAccounts(loadLocalAccounts());
    }
  }, []);

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

  const handleCloudSignUpInputChange = useCallback(<K extends keyof SignUpFormState>(key: K, value: SignUpFormState[K]) => {
    setCloudSignUpForm(prev => ({ ...prev, [key]: value }));
  }, []);

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
        setCloudSignUpError("Enter a username.");
        return;
      }
      if (!password) {
        setCloudSignUpError("Create a password.");
        return;
      }
      setCloudSignUpError(null);
      setCloudSignUpPending(true);
      const trimmedUsername = username.trim();
      const profileMetadata = {
        first_name: firstName.trim(),
        last_initial: lastInitial.trim().charAt(0).toUpperCase(),
        grade,
        age: Number.parseInt(age, 10) || null,
        school: school.trim() || null,
        prior_experience: priorExperience.trim() || null,
      };
      try {
        const result = await signupThroughEdge({
          firstName: profileMetadata.first_name,
          lastInitial: profileMetadata.last_initial,
          grade,
          age,
          username: trimmedUsername,
          password,
          school: profileMetadata.school ?? undefined,
          priorExperience: profileMetadata.prior_experience ?? undefined,
        });
        if (result.error || !result.data) {
          setCloudSignUpError(result.error ?? result.data?.message ?? "Unable to sign up. Try again.");
          return;
        }
        if (!result.data.session) {
          setCloudSignUpError(
            result.data.message ?? "Sign-up succeeded. Check your email to confirm before continuing.",
          );
          return;
        }
        const nextSession = await setEdgeSession(result.data.session);
        if (!nextSession) {
          setCloudSignUpError("Sign-up succeeded, but we could not establish a session. Try again.");
          return;
        }
        const userId = nextSession.user?.id ?? result.data.user?.id;
        if (userId && cloudDataService) {
          try {
            const consentTimestamp = new Date().toISOString();
            const normalizedAge = sanitizeAge(age);
            const playerNameForCloud = profileMetadata.first_name
              ? `${profileMetadata.first_name}${profileMetadata.last_initial ? ` ${profileMetadata.last_initial}.` : ""}`.trim()
              : trimmedUsername || "Player";
            await cloudDataService.upsertPlayerProfile({
              id: userId,
              playerName: playerNameForCloud,
              grade: isGradeValue(grade) ? grade : "Not applicable",
              age: normalizedAge,
              school: profileMetadata.school ?? undefined,
              priorExperience: profileMetadata.prior_experience ?? undefined,
              consent: {
                agreed: true,
                consentTextVersion: CONSENT_TEXT_VERSION,
                timestamp: consentTimestamp,
              },
              needsReview: !isGradeValue(grade) || normalizedAge === null,
            });
          } catch (upsertError) {
            console.warn("demographics_profiles upsert failed", upsertError);
          }
        }
        setSession(nextSession);
        const hydration = await hydrateCloudPlayerState(nextSession, {
          firstName: profileMetadata.first_name ?? undefined,
          lastInitial: profileMetadata.last_initial ?? undefined,
          grade,
          age,
          school: profileMetadata.school ?? undefined,
          priorExperience: profileMetadata.prior_experience ?? undefined,
          username: trimmedUsername,
        });
        setMode("cloud");
        navigateToPostAuth(
          "cloud",
          hydration
            ? { playerId: hydration.playerId, statsProfiles: hydration.statsProfiles }
            : undefined,
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

  const handleLocalSignUpInputChange = useCallback(<K extends keyof SignUpFormState>(key: K, value: SignUpFormState[K]) => {
    setLocalSignUpForm(prev => ({ ...prev, [key]: value }));
  }, []);

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
        const existingWithoutProfile = accounts.filter(candidate => candidate.profile.id !== profile.id);
        const nextAccounts = existingWithoutProfile.concat(nextAccount);
        saveLocalAccounts(nextAccounts);
        setActiveLocalAccount(nextAccount);
        setLocalSession({ profile: nextAccount.profile });
        setLocalAccounts(nextAccounts);
        setLocalSignUpForm(initialSignUpForm);
        setMode("local");
        navigateToPostAuth("local", { playerId: nextAccount.profile.id });
      } catch (error) {
        setLocalSignUpError(error instanceof Error ? error.message : "Unable to sign up. Try again.");
      } finally {
        setLocalSignUpPending(false);
      }
    },
    [localSignUpForm, navigateToPostAuth, setLocalAccounts, setMode],
  );

  const handleLocalSignOut = useCallback(async () => {
    if (!isBrowser()) {
      setLocalSignOutError("Local storage is not available.");
      return;
    }
    setLocalSignOutError(null);
    setLocalSignOutPending(true);
    try {
      clearActiveLocalSession(localSession?.profile.id);
      setLocalSession(null);
      setMode("local");
    } catch (error) {
      setLocalSignOutError(error instanceof Error ? error.message : "Unable to sign out right now.");
    } finally {
      setLocalSignOutPending(false);
    }
  }, [localSession, setMode]);

  const handleSelectLocalAccount = useCallback(
    (profileId: string) => {
      const accounts = loadLocalAccounts();
      const account = accounts.find(candidate => candidate.profile.id === profileId);
      if (!account) return;
      setActiveLocalAccount(account);
      setLocalSession({ profile: account.profile });
      setLocalAccounts(accounts);
      setMode("local");
      navigateToPostAuth("local", { playerId: account.profile.id });
    },
    [navigateToPostAuth, setLocalAccounts, setMode],
  );

  const statusMessage = useMemo(() => {
    if (authMode === "cloud") {
      if (!supabaseReady) {
        return "Supabase is not configured. Provide the environment variables to enable sign-in.";
      }
      if (initializing) {
        return "Checking session…";
      }
      if (session) {
        return `Signed in as ${session.user?.email ?? "cloud user"}.`;
      }
      return "Cloud mode ready.";
    }
    if (localSession) {
      return `Signed in as ${localSession.profile.playerName}.`;
    }
    return "Local mode ready.";
  }, [authMode, initializing, localSession, session, supabaseReady]);

  const signOutError = authMode === "cloud" ? cloudSignOutError : localSignOutError;
  const signOutPending = authMode === "cloud" ? cloudSignOutPending : localSignOutPending;
  const signOutDisabled = authMode === "cloud"
    ? !supabaseReady || signOutPending || !session
    : !localSession || signOutPending;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-50">
      <header className="px-6 pt-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">RPS Predictor</h1>
        <p className="mt-3 text-base text-slate-300">
          Welcome! Sign in to continue or create a new account to begin training against the AI.
        </p>
      </header>
      <main className="mx-auto mt-10 w-full max-w-4xl flex-1 px-4 pb-16">
        <div className="rounded-3xl bg-white/10 p-1 shadow-2xl backdrop-blur">
          <div className="space-y-2 rounded-3xl bg-slate-900/60 p-1">
            <div className="flex w-full justify-between gap-1 rounded-3xl bg-slate-900/60 p-1">
              <button
                type="button"
                onClick={() => handleAuthModeChange("local")}
                className={`flex-1 rounded-3xl px-5 py-3 text-sm font-semibold transition ${
                  authMode === "local" ? "bg-white text-slate-900 shadow" : "text-slate-300 hover:text-white"
                }`}
              >
                Local (this device)
              </button>
              <button
                type="button"
                onClick={() => handleAuthModeChange("cloud")}
                className={`flex-1 rounded-3xl px-5 py-3 text-sm font-semibold transition ${
                  authMode === "cloud" ? "bg-white text-slate-900 shadow" : "text-slate-300 hover:text-white"
                }`}
              >
                Cloud (sync across devices)
              </button>
            </div>
            <div className="flex w-full justify-between gap-1 rounded-3xl bg-slate-900/60 p-1">
              {authMode === "cloud" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveTab("signIn")}
                    className={`flex-1 rounded-3xl px-5 py-3 text-sm font-semibold transition ${
                      activeTab === "signIn" ? "bg-white text-slate-900 shadow" : "text-slate-300 hover:text-white"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("signUp")}
                    className={`flex-1 rounded-3xl px-5 py-3 text-sm font-semibold transition ${
                      activeTab === "signUp" ? "bg-white text-slate-900 shadow" : "text-slate-300 hover:text-white"
                    }`}
                  >
                    Sign Up
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="flex-1 rounded-3xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow"
                  onClick={() => setActiveTab("signUp")}
                >
                  Sign Up
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-8 p-8 lg:grid-cols-[1.2fr_1fr]">
            <section className="rounded-2xl bg-white/5 p-6 shadow-inner">
              <h2 className="text-lg font-semibold text-white">
                {activeTab === "signIn" ? "Sign In" : "Create account"}
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                {authMode === "cloud"
                  ? activeTab === "signIn"
                    ? "Use the username and password associated with your Supabase account."
                    : "Fill out the same information as the local profile setup so we can save your progress to the cloud."
                  : "Create a local-only profile. Everything stays on this browser unless you export it."}
              </p>
              {activeTab === "signIn" ? (
                authMode === "cloud" ? (
                  <form className="mt-6 space-y-4" onSubmit={handleCloudSignIn}>
                    <div>
                      <label htmlFor="sign-in-username" className="text-sm font-medium text-slate-200">
                        Username
                      </label>
                      <input
                        id="sign-in-username"
                        type="text"
                        autoComplete="username"
                        value={cloudSignInUsername}
                        onChange={event => setCloudSignInUsername(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        placeholder="yourname"
                      />
                    </div>
                    <div>
                      <label htmlFor="sign-in-password" className="text-sm font-medium text-slate-200">
                        Password
                      </label>
                      <input
                        id="sign-in-password"
                        type="password"
                        autoComplete="current-password"
                        value={cloudSignInPassword}
                        onChange={event => setCloudSignInPassword(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        placeholder="••••••••"
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
                          ? "cursor-not-allowed bg-slate-600 text-slate-300"
                          : "bg-sky-500 text-white hover:bg-sky-400"
                      }`}
                    >
                      {cloudSignInPending ? "Signing in…" : "Sign In"}
                    </button>
                  </form>
                ) : null
              ) : authMode === "cloud" ? (
                <form className="mt-6 grid gap-4" onSubmit={handleCloudSignUp}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="sign-up-first-name" className="text-sm font-medium text-slate-200">
                        First name
                      </label>
                      <input
                        id="sign-up-first-name"
                        type="text"
                        value={cloudSignUpForm.firstName}
                        onChange={event => handleCloudSignUpInputChange("firstName", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        placeholder="e.g. Alex"
                      />
                    </div>
                    <div>
                      <label htmlFor="sign-up-last-initial" className="text-sm font-medium text-slate-200">
                        Last name initial
                      </label>
                      <input
                        id="sign-up-last-initial"
                        type="text"
                        value={cloudSignUpForm.lastInitial}
                        onChange={event => handleCloudSignUpInputChange("lastInitial", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        placeholder="e.g. W"
                        maxLength={3}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="sign-up-grade" className="text-sm font-medium text-slate-200">
                        Grade
                      </label>
                      <select
                        id="sign-up-grade"
                        value={cloudSignUpForm.grade}
                        onChange={event => handleCloudSignUpInputChange("grade", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      >
                        <option value="">Select grade</option>
                        {GRADE_OPTIONS.map(option => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="sign-up-age" className="text-sm font-medium text-slate-200">
                        Age
                      </label>
                      <select
                        id="sign-up-age"
                        value={cloudSignUpForm.age}
                        onChange={event => handleCloudSignUpInputChange("age", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      >
                        <option value="">Select age</option>
                        {AGE_OPTIONS.map(option => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="sign-up-school" className="text-sm font-medium text-slate-200">
                      School (optional)
                    </label>
                    <input
                      id="sign-up-school"
                      type="text"
                      value={cloudSignUpForm.school}
                      onChange={event => handleCloudSignUpInputChange("school", event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      placeholder="e.g. Roosevelt Elementary"
                    />
                  </div>
                  <div>
                    <label htmlFor="sign-up-prior" className="text-sm font-medium text-slate-200">
                      Prior experience (optional)
                    </label>
                    <textarea
                      id="sign-up-prior"
                      value={cloudSignUpForm.priorExperience}
                      onChange={event => handleCloudSignUpInputChange("priorExperience", event.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      placeholder="Tell us about your RPS or AI experience"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="sign-up-username" className="text-sm font-medium text-slate-200">
                        Username
                      </label>
                      <input
                        id="sign-up-username"
                        type="text"
                        autoComplete="username"
                        value={cloudSignUpForm.username}
                        onChange={event => handleCloudSignUpInputChange("username", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        placeholder="yourname"
                      />
                    </div>
                    <div>
                      <label htmlFor="sign-up-password" className="text-sm font-medium text-slate-200">
                        Password
                      </label>
                      <input
                        id="sign-up-password"
                        type="password"
                        autoComplete="new-password"
                        value={cloudSignUpForm.password}
                        onChange={event => handleCloudSignUpInputChange("password", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        placeholder="Create a password"
                      />
                    </div>
                  </div>
                  {cloudSignUpError ? <p className="text-sm font-semibold text-rose-300">{cloudSignUpError}</p> : null}
                  <button
                    type="submit"
                    disabled={!supabaseReady || cloudSignUpPending}
                    className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      !supabaseReady || cloudSignUpPending
                        ? "cursor-not-allowed bg-slate-600 text-slate-300"
                        : "bg-emerald-500 text-white hover:bg-emerald-400"
                    }`}
                  >
                    {cloudSignUpPending ? "Creating account…" : "Create account"}
                  </button>
                </form>
              ) : (
                <form className="mt-6 grid gap-4" onSubmit={handleLocalSignUp}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="local-sign-up-first-name" className="text-sm font-medium text-slate-200">
                        First name
                      </label>
                      <input
                        id="local-sign-up-first-name"
                        type="text"
                        value={localSignUpForm.firstName}
                        onChange={event => handleLocalSignUpInputChange("firstName", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        placeholder="e.g. Alex"
                      />
                    </div>
                    <div>
                      <label htmlFor="local-sign-up-last-initial" className="text-sm font-medium text-slate-200">
                        Last name initial
                      </label>
                      <input
                        id="local-sign-up-last-initial"
                        type="text"
                        value={localSignUpForm.lastInitial}
                        onChange={event => handleLocalSignUpInputChange("lastInitial", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        placeholder="e.g. W"
                        maxLength={3}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="local-sign-up-grade" className="text-sm font-medium text-slate-200">
                        Grade
                      </label>
                      <select
                        id="local-sign-up-grade"
                        value={localSignUpForm.grade}
                        onChange={event => handleLocalSignUpInputChange("grade", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      >
                        <option value="">Select grade</option>
                        {GRADE_OPTIONS.map(option => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="local-sign-up-age" className="text-sm font-medium text-slate-200">
                        Age
                      </label>
                      <select
                        id="local-sign-up-age"
                        value={localSignUpForm.age}
                        onChange={event => handleLocalSignUpInputChange("age", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      >
                        <option value="">Select age</option>
                        {AGE_OPTIONS.map(option => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="local-sign-up-school" className="text-sm font-medium text-slate-200">
                      School (optional)
                    </label>
                    <input
                      id="local-sign-up-school"
                      type="text"
                      value={localSignUpForm.school}
                      onChange={event => handleLocalSignUpInputChange("school", event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      placeholder="e.g. Roosevelt Elementary"
                    />
                  </div>
                  <div>
                    <label htmlFor="local-sign-up-prior" className="text-sm font-medium text-slate-200">
                      Prior experience (optional)
                    </label>
                    <textarea
                      id="local-sign-up-prior"
                      value={localSignUpForm.priorExperience}
                      onChange={event => handleLocalSignUpInputChange("priorExperience", event.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      placeholder="Tell us about your RPS or AI experience"
                    />
                  </div>
                  {localSignUpError ? <p className="text-sm font-semibold text-rose-300">{localSignUpError}</p> : null}
                  <button
                    type="submit"
                    disabled={localSignUpPending}
                    className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      localSignUpPending
                        ? "cursor-not-allowed bg-slate-600 text-slate-300"
                        : "bg-emerald-500 text-white hover:bg-emerald-400"
                    }`}
                  >
                    {localSignUpPending ? "Creating account…" : "Create account"}
                  </button>
                </form>
              )}
            </section>
            <aside className="flex flex-col justify-between gap-6 rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-sm text-slate-200">
              <div>
                <h3 className="text-base font-semibold text-white">Status</h3>
                <p className="mt-1 text-sm text-slate-300">{statusMessage}</p>
                {signOutError ? <p className="mt-2 text-sm font-semibold text-rose-300">{signOutError}</p> : null}
                {authMode === "local" ? (
                  <div className="mt-4 space-y-2">
                    <h4 className="text-sm font-semibold text-white">Local profiles</h4>
                    {localAccounts.length === 0 ? (
                      <p className="text-xs text-slate-400">No local profiles yet. Create one to get started.</p>
                    ) : (
                      <ul className="space-y-2">
                        {localAccounts.map(account => {
                          const isActive = localSession?.profile.id === account.profile.id;
                          const needsReviewLabel = account.profile.needsReview ? "Needs review" : "Ready";
                          return (
                            <li key={account.profile.id}>
                              <button
                                type="button"
                                onClick={() => handleSelectLocalAccount(account.profile.id)}
                                className={`w-full rounded-xl border px-4 py-2 text-left transition ${
                                  isActive
                                    ? "border-sky-400 bg-sky-500/20 text-white"
                                    : "border-slate-700/70 bg-slate-800/60 text-slate-200 hover:border-sky-400 hover:text-white"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold">{account.profile.playerName}</span>
                                  {isActive ? <span className="text-xs font-semibold text-sky-300">Active</span> : null}
                                </div>
                                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                                  <span>{account.profile.grade}</span>
                                  <span>{needsReviewLabel}</span>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={authMode === "cloud" ? handleCloudSignOut : handleLocalSignOut}
                  disabled={signOutDisabled}
                  className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    signOutDisabled ? "cursor-not-allowed bg-slate-700 text-slate-400" : "bg-slate-200 text-slate-900 hover:bg-white"
                  }`}
                >
                  {signOutPending ? "Signing out…" : "Sign Out"}
                </button>
                <p className="text-xs text-slate-400">
                  {authMode === "cloud"
                    ? "Signing out clears the session locally and keeps you on this welcome screen."
                    : "Signing out clears the local session and keeps you on this welcome screen."}
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
