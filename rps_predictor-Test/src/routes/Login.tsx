import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { login } from "../lib/edgeFunctions";
import { useAuth } from "../context/AuthContext";
import { usePlayers, type StoredDemographics } from "../players";
import { useLocalMode } from "../context/LocalModeContext";
import { usePostAuthFlow } from "../hooks/usePostAuthFlow";

const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9_.-]{2,19})$/;

export function LoginPage(): JSX.Element {
  const { user, loading } = useAuth();
  const { findLocalByUsername } = usePlayers();
  const { localModeEnabled } = useLocalMode();
  const runPostAuthFlow = usePostAuthFlow("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const usernameHint = "Use 3-20 lowercase letters, numbers, dots, hyphens, or underscores.";

  if (!loading && user) {
    return <Navigate to="/modes" replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (localModeEnabled) {
      setError("Local-only mode is ON. Turn it OFF to log in.");
      return;
    }
    const normalizedUsername = username.trim().toLowerCase();
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      setError("Usernames must be 3-20 characters using lowercase letters, numbers, dots, hyphens, or underscores.");
      return;
    }
    if (!password) {
      setError("Enter your password to continue.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await login({ username: normalizedUsername, password });
      if (result.status === 401) {
        setError("Invalid username or password.");
        return;
      }
      if (result.error || !result.data?.session) {
        setError(result.error ?? "Server error. Try again.");
        return;
      }
      const fallbackDemographics =
        findLocalByUsername(normalizedUsername)?.demographics ??
        ({
          first_name: normalizedUsername,
          last_initial: "",
          grade: "Not applicable",
          age: null,
          school: null,
          prior_experience: null,
        } satisfies StoredDemographics);
      await runPostAuthFlow({
        username: normalizedUsername,
        session: result.data.session,
        supabaseUser: result.data.user,
        fallbackDemographics,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unexpected error while signing in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Log in"
      description="Use your Supabase username to resume progress on any device."
      footerLinks={[
        { to: "/auth/signup", label: "Need an account? Sign up" },
        { to: "/recover-username", label: "Forgot username" },
        { to: "/reset-password", label: "Reset password" },
      ]}
    >
      {localModeEnabled && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          Local-only mode is ON. Turn it OFF to use cloud accounts.
        </div>
      )}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <fieldset className="space-y-4" disabled={localModeEnabled}>
          <div className="space-y-1">
            <label htmlFor="login-username" className="text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              value={username}
              onChange={event => setUsername(event.target.value.toLowerCase())}
              placeholder="yourname"
              aria-describedby="login-username-help"
            />
            <p id="login-username-help" className="text-xs text-slate-500">
              {usernameHint}
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="login-password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
          <button
            type="submit"
            disabled={submitting || localModeEnabled}
            className={`w-full rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow transition ${
              submitting || localModeEnabled ? "bg-slate-400" : "bg-sky-600 hover:bg-sky-700"
            }`}
          >
            {submitting ? "Signing in…" : "Log in"}
          </button>
        </fieldset>
      </form>
      <div className="text-sm text-slate-600">
        Need help? <Link to="/recover-username" className="font-semibold text-sky-600 hover:text-sky-700">Recover your username</Link> or <Link to="/reset-password" className="font-semibold text-sky-600 hover:text-sky-700">reset your password</Link>.
      </div>
    </AuthLayout>
  );
}
