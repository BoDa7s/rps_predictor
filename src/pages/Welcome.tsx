import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseClient, isSupabaseConfigured } from "../lib/supabaseClient";
import { getPostAuthPath, DEPLOY_ENV } from "../lib/env";
import { GRADE_OPTIONS } from "../players";

const AGE_OPTIONS = Array.from({ length: 96 }, (_, index) => String(5 + index));

type AuthSession = {
  user?: { id?: string | null } | null;
  [key: string]: unknown;
} | null;
type AuthChangeHandler = (_event: unknown, session: AuthSession) => void;
type GetSessionResult = { data?: { session?: AuthSession } | null; error?: unknown } | null;

function usePostAuthNavigation() {
  const postAuthPath = useMemo(() => getPostAuthPath(), []);

  return useCallback(() => {
    if (typeof window === "undefined") return;
    if (!postAuthPath) return;
    window.location.assign(postAuthPath);
  }, [postAuthPath]);
}

type AuthTab = "signIn" | "signUp";

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

export default function Welcome(): JSX.Element {
  const navigateToPostAuth = usePostAuthNavigation();
  const [activeTab, setActiveTab] = useState<AuthTab>("signIn");
  const [session, setSession] = useState<AuthSession>(null);
  const [initializing, setInitializing] = useState(true);

  const [signInUsername, setSignInUsername] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInPending, setSignInPending] = useState(false);

  const [signUpForm, setSignUpForm] = useState<SignUpFormState>(initialSignUpForm);
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [signUpPending, setSignUpPending] = useState(false);

  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signOutPending, setSignOutPending] = useState(false);

  const supabaseReady = isSupabaseConfigured && Boolean(supabaseClient);

  useEffect(() => {
    if (!supabaseClient) {
      setInitializing(false);
      return;
    }
    let cancelled = false;
    supabaseClient.auth.getSession().then((result: GetSessionResult) => {
      if (cancelled) return;
      const currentSession = result?.data?.session ?? null;
      setSession(currentSession);
      setInitializing(false);
      if (currentSession) {
        navigateToPostAuth();
      }
    });
    const handleAuthStateChange: AuthChangeHandler = (_event, nextSession) => {
      setSession(nextSession ?? null);
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

  const handleSignIn = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!supabaseClient) {
        setSignInError("Supabase is not configured.");
        return;
      }
      setSignInError(null);
      setSignInPending(true);
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: signInUsername.trim(),
          password: signInPassword,
        });
        if (error) {
          throw error;
        }
        if (!data.session) {
          setSignInError("Sign-in succeeded, but no session was returned.");
          return;
        }
        setSession(data.session);
        navigateToPostAuth();
      } catch (error) {
        setSignInError(error instanceof Error ? error.message : "Unable to sign in. Try again.");
      } finally {
        setSignInPending(false);
      }
    },
    [navigateToPostAuth, signInPassword, signInUsername],
  );

  const handleSignUpInputChange = useCallback(<K extends keyof SignUpFormState>(key: K, value: SignUpFormState[K]) => {
    setSignUpForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSignUp = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!supabaseClient) {
        setSignUpError("Supabase is not configured.");
        return;
      }
      const { firstName, lastInitial, grade, age, school, priorExperience, username, password } = signUpForm;
      if (!firstName.trim()) {
        setSignUpError("Enter a first name.");
        return;
      }
      if (!lastInitial.trim()) {
        setSignUpError("Enter a last initial.");
        return;
      }
      if (!grade) {
        setSignUpError("Select a grade.");
        return;
      }
      if (!age) {
        setSignUpError("Select an age.");
        return;
      }
      if (!username.trim()) {
        setSignUpError("Enter a username.");
        return;
      }
      if (!password) {
        setSignUpError("Create a password.");
        return;
      }
      setSignUpError(null);
      setSignUpPending(true);
      const trimmedUsername = username.trim();
      const payloadForProfile = {
        first_name: firstName.trim(),
        last_initial: lastInitial.trim().charAt(0).toUpperCase(),
        grade,
        age: Number.parseInt(age, 10) || null,
        school: school.trim() || null,
        prior_experience: priorExperience.trim() || null,
      };
      try {
        const { data, error } = await supabaseClient.auth.signUp({
          email: trimmedUsername,
          password,
          options: {
            data: payloadForProfile,
          },
        });
        if (error) {
          throw error;
        }
        const nextSession = data.session;
        const userId = data.user?.id;
        if (userId) {
          void supabaseClient
            .from("player_profiles")
            .upsert({ user_id: userId, ...payloadForProfile })
            .then(({ error }: { error: unknown }) => {
              if (error) {
                console.warn("player_profiles upsert failed", error);
              }
            })
            .catch((upsertError: unknown) => {
              console.warn("player_profiles upsert threw", upsertError);
            });
        }
        if (!nextSession) {
          setSignUpError("Sign-up succeeded. Check your email to confirm before continuing.");
          return;
        }
        setSession(nextSession);
        navigateToPostAuth();
      } catch (error) {
        setSignUpError(error instanceof Error ? error.message : "Unable to sign up. Try again.");
      } finally {
        setSignUpPending(false);
      }
    },
    [navigateToPostAuth, signUpForm],
  );

  const handleSignOut = useCallback(async () => {
    if (!supabaseClient) {
      setSignOutError("Supabase is not configured.");
      return;
    }
    setSignOutError(null);
    setSignOutPending(true);
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        throw error;
      }
      setSession(null);
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Unable to sign out right now.");
    } finally {
      setSignOutPending(false);
    }
  }, []);

  const statusMessage = useMemo(() => {
    if (!supabaseReady) {
      return "Supabase is not configured. Provide the environment variables to enable sign-in.";
    }
    if (initializing) {
      return "Checking session…";
    }
    if (session) {
      return "Signed in.";
    }
    return DEPLOY_ENV === "cloud" ? "Cloud mode ready." : "Local mode ready.";
  }, [initializing, session, supabaseReady]);

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
          <div className="flex w-full justify-between gap-1 rounded-3xl bg-slate-900/60 p-1">
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
          </div>
          <div className="grid gap-8 p-8 lg:grid-cols-[1.2fr_1fr]">
            <section className="rounded-2xl bg-white/5 p-6 shadow-inner">
              <h2 className="text-lg font-semibold text-white">{activeTab === "signIn" ? "Sign In" : "Create account"}</h2>
              <p className="mt-1 text-sm text-slate-300">
                {activeTab === "signIn"
                  ? "Use the username and password associated with your Supabase account."
                  : "Fill out the same information as the local profile setup so we can save your progress to the cloud."}
              </p>
              {activeTab === "signIn" ? (
                <form className="mt-6 space-y-4" onSubmit={handleSignIn}>
                  <div>
                    <label htmlFor="sign-in-username" className="text-sm font-medium text-slate-200">
                      Username
                    </label>
                    <input
                      id="sign-in-username"
                      type="text"
                      autoComplete="username"
                      value={signInUsername}
                      onChange={event => setSignInUsername(event.target.value)}
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
                      value={signInPassword}
                      onChange={event => setSignInPassword(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      placeholder="••••••••"
                    />
                  </div>
                  {signInError ? <p className="text-sm font-semibold text-rose-300">{signInError}</p> : null}
                  <button
                    type="submit"
                    disabled={!supabaseReady || signInPending}
                    className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      !supabaseReady || signInPending
                        ? "cursor-not-allowed bg-slate-600 text-slate-300"
                        : "bg-sky-500 text-white hover:bg-sky-400"
                    }`}
                  >
                    {signInPending ? "Signing in…" : "Sign In"}
                  </button>
                </form>
              ) : (
                <form className="mt-6 grid gap-4" onSubmit={handleSignUp}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="sign-up-first-name" className="text-sm font-medium text-slate-200">
                        First name
                      </label>
                      <input
                        id="sign-up-first-name"
                        type="text"
                        value={signUpForm.firstName}
                        onChange={event => handleSignUpInputChange("firstName", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        placeholder="e.g. Alex"
                      />
                    </div>
                    <div>
                      <label htmlFor="sign-up-last-initial" className="text-sm font-medium text-slate-200">
                        Last initial
                      </label>
                      <input
                        id="sign-up-last-initial"
                        type="text"
                        value={signUpForm.lastInitial}
                        onChange={event => handleSignUpInputChange("lastInitial", event.target.value)}
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
                        value={signUpForm.grade}
                        onChange={event => handleSignUpInputChange("grade", event.target.value)}
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
                        value={signUpForm.age}
                        onChange={event => handleSignUpInputChange("age", event.target.value)}
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
                      value={signUpForm.school}
                      onChange={event => handleSignUpInputChange("school", event.target.value)}
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
                      value={signUpForm.priorExperience}
                      onChange={event => handleSignUpInputChange("priorExperience", event.target.value)}
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
                        value={signUpForm.username}
                        onChange={event => handleSignUpInputChange("username", event.target.value)}
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
                        value={signUpForm.password}
                        onChange={event => handleSignUpInputChange("password", event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        placeholder="Create a password"
                      />
                    </div>
                  </div>
                  {signUpError ? <p className="text-sm font-semibold text-rose-300">{signUpError}</p> : null}
                  <button
                    type="submit"
                    disabled={!supabaseReady || signUpPending}
                    className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      !supabaseReady || signUpPending
                        ? "cursor-not-allowed bg-slate-600 text-slate-300"
                        : "bg-emerald-500 text-white hover:bg-emerald-400"
                    }`}
                  >
                    {signUpPending ? "Creating account…" : "Create account"}
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
                  onClick={handleSignOut}
                  disabled={!supabaseReady || signOutPending}
                  className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    !supabaseReady || signOutPending
                      ? "cursor-not-allowed bg-slate-700 text-slate-400"
                      : "bg-slate-200 text-slate-900 hover:bg-white"
                  }`}
                >
                  {signOutPending ? "Signing out…" : "Sign Out"}
                </button>
                <p className="text-xs text-slate-400">
                  Signing out clears the session locally and keeps you on this welcome screen.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
