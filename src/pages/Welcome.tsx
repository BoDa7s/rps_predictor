import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseClient, isSupabaseConfigured } from "../lib/supabaseClient";
import { getPostAuthPath, DEPLOY_ENV } from "../lib/env";
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

const AGE_OPTIONS = Array.from({ length: 96 }, (_, index) => String(5 + index));

const LOCAL_ACCOUNTS_KEY = "rps_local_accounts_v1";
const LOCAL_ACTIVE_ACCOUNT_KEY = "rps_local_active_account_v1";
const PLAYERS_STORAGE_KEY = "rps_players_v1";
const CURRENT_PLAYER_STORAGE_KEY = "rps_current_player_v1";

type AuthTab = "signIn" | "signUp";
type AuthMode = "local" | "cloud";

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

interface LocalAccountRecord {
  profile: PlayerProfile;
  createdAt: string;
}

interface LocalSession {
  profile: PlayerProfile;
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

function loadStoredPlayers(): PlayerProfile[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(PLAYERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStoredProfile);
  } catch {
    return [];
  }
}

function saveStoredPlayers(players: PlayerProfile[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));
}

function ensurePlayerStored(profile: PlayerProfile) {
  if (!isBrowser()) return;
  const players = loadStoredPlayers();
  const existingIndex = players.findIndex(player => player.id === profile.id);
  const nextPlayers = existingIndex >= 0 ? [...players] : players.concat(profile);
  if (existingIndex >= 0) {
    nextPlayers[existingIndex] = { ...nextPlayers[existingIndex], ...profile };
  }
  saveStoredPlayers(nextPlayers);
  window.localStorage.setItem(CURRENT_PLAYER_STORAGE_KEY, profile.id);
}

function loadLocalAccounts(): LocalAccountRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(item => {
        if (!item || typeof item !== "object") return null;
        const profile = normalizeStoredProfile((item as any).profile);
        return {
          profile,
          createdAt:
            typeof (item as any).createdAt === "string"
              ? (item as any).createdAt
              : new Date().toISOString(),
        } as LocalAccountRecord;
      })
      .filter((account): account is LocalAccountRecord => account !== null);
  } catch {
    return [];
  }
}

function saveLocalAccounts(accounts: LocalAccountRecord[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function setActiveLocalAccount(account: LocalAccountRecord) {
  if (!isBrowser()) return;
  ensurePlayerStored(account.profile);
  window.localStorage.setItem(LOCAL_ACTIVE_ACCOUNT_KEY, account.profile.id);
}

function loadActiveLocalSession(): LocalSession | null {
  if (!isBrowser()) return null;
  const profileId = window.localStorage.getItem(LOCAL_ACTIVE_ACCOUNT_KEY);
  if (!profileId) return null;
  const accounts = loadLocalAccounts();
  const account = accounts.find(candidate => candidate.profile.id === profileId);
  if (account) {
    ensurePlayerStored(account.profile);
    return { profile: account.profile };
  }
  const storedPlayers = loadStoredPlayers();
  const fallbackProfile = storedPlayers.find(player => player.id === profileId);
  if (!fallbackProfile) return null;
  ensurePlayerStored(fallbackProfile);
  return { profile: fallbackProfile };
}

function clearActiveLocalSession(profileId?: string) {
  if (!isBrowser()) return;
  window.localStorage.removeItem(LOCAL_ACTIVE_ACCOUNT_KEY);
  if (!profileId) return;
  const currentId = window.localStorage.getItem(CURRENT_PLAYER_STORAGE_KEY);
  if (currentId === profileId) {
    window.localStorage.removeItem(CURRENT_PLAYER_STORAGE_KEY);
  }
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
  const postAuthPath = useMemo(() => getPostAuthPath(), []);

  return useCallback(() => {
    if (!postAuthPath) return;
    navigate(postAuthPath, { replace: true });
  }, [navigate, postAuthPath]);
}

export default function Welcome(): JSX.Element {
  const navigateToPostAuth = usePostAuthNavigation();
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

  const [localSignUpForm, setLocalSignUpForm] = useState<SignUpFormState>(initialSignUpForm);
  const [localSignUpError, setLocalSignUpError] = useState<string | null>(null);
  const [localSignUpPending, setLocalSignUpPending] = useState(false);

  const [localSignOutError, setLocalSignOutError] = useState<string | null>(null);
  const [localSignOutPending, setLocalSignOutPending] = useState(false);

  const supabaseReady = isSupabaseConfigured && Boolean(supabaseClient);

  useEffect(() => {
    if (!supabaseClient) {
      setInitializing(false);
      return;
    }
    let cancelled = false;
    supabaseClient.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const currentSession = data?.session ?? null;
      setSession(currentSession);
      setInitializing(false);
      if (currentSession) {
        navigateToPostAuth();
      }
    });
    const handleAuthStateChange = (_event: unknown, nextSession: Session | null) => {
      setSession(nextSession);
      if (nextSession) {
        navigateToPostAuth();
      }
    };
    const { data: listener } = supabaseClient.auth.onAuthStateChange(handleAuthStateChange);
    return () => {
      cancelled = true;
      listener?.subscription.unsubscribe();
    };
  }, [navigateToPostAuth]);

  useEffect(() => {
    const existing = loadActiveLocalSession();
    if (existing) {
      setLocalSession(existing);
    }
  }, []);

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
        navigateToPostAuth();
      } catch (error) {
        setCloudSignInError(error instanceof Error ? error.message : "Unable to sign in. Try again.");
      } finally {
        setCloudSignInPending(false);
      }
    },
    [cloudSignInPassword, cloudSignInUsername, navigateToPostAuth],
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
        if (userId) {
          try {
            const { error: profileError } = await supabaseClient
              .from("demographics_profiles")
              .upsert({
                user_id: userId,
                username: trimmedUsername,
                first_name: profileMetadata.first_name,
                last_initial: profileMetadata.last_initial,
                grade,
                age,
                school: profileMetadata.school,
                prior_experience: profileMetadata.prior_experience,
                storage_mode: "cloud",
                consent_version: CONSENT_TEXT_VERSION,
                consent_granted_at: new Date().toISOString(),
              });
            if (profileError) {
              console.warn("demographics_profiles upsert failed", profileError);
            }
          } catch (upsertError) {
            console.warn("demographics_profiles upsert threw", upsertError);
          }
        }
        setSession(nextSession);
        navigateToPostAuth();
      } catch (error) {
        setCloudSignUpError(error instanceof Error ? error.message : "Unable to sign up. Try again.");
      } finally {
        setCloudSignUpPending(false);
      }
    },
    [cloudSignUpForm, navigateToPostAuth],
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
    } catch (error) {
      setCloudSignOutError(error instanceof Error ? error.message : "Unable to sign out right now.");
    } finally {
      setCloudSignOutPending(false);
    }
  }, []);

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
        };
        const existingWithoutProfile = accounts.filter(candidate => candidate.profile.id !== profile.id);
        saveLocalAccounts(existingWithoutProfile.concat(nextAccount));
        setActiveLocalAccount(nextAccount);
        setLocalSession({ profile: nextAccount.profile });
        setLocalSignUpForm(initialSignUpForm);
        navigateToPostAuth();
      } catch (error) {
        setLocalSignUpError(error instanceof Error ? error.message : "Unable to sign up. Try again.");
      } finally {
        setLocalSignUpPending(false);
      }
    },
    [localSignUpForm, navigateToPostAuth],
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
    } catch (error) {
      setLocalSignOutError(error instanceof Error ? error.message : "Unable to sign out right now.");
    } finally {
      setLocalSignOutPending(false);
    }
  }, [localSession]);

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
