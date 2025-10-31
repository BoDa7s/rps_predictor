import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { signup } from "../lib/edgeFunctions";
import { useAuth } from "../context/AuthContext";
import { GRADE_OPTIONS, usePlayers, type StoredDemographics, sanitizeAge } from "../players";
import { useLocalMode } from "../context/LocalModeContext";
import { usePostAuthFlow } from "../hooks/usePostAuthFlow";

const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9_.-]{2,19})$/;
const AGE_OPTIONS = Array.from({ length: 96 }, (_, index) => String(5 + index));

function formatLastInitial(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed[0].toUpperCase();
}

export function SignupPage(): JSX.Element {
  const { user, loading, profile } = useAuth();
  const { findLocalByUsername } = usePlayers();
  const { localModeEnabled } = useLocalMode();
  const runPostAuthFlow = usePostAuthFlow("signup");
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [grade, setGrade] = useState("");
  const [age, setAge] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [school, setSchool] = useState("");
  const [priorExperience, setPriorExperience] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    const nextRoute = profile?.training_completed ? "/modes" : "/training";
    return <Navigate to={nextRoute} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (localModeEnabled) {
      setError("Local-only mode is ON. Turn it OFF to sign up.");
      return;
    }
    const trimmedFirst = firstName.trim();
    const trimmedLast = formatLastInitial(lastInitial);
    const normalizedUsername = username.trim().toLowerCase();

    if (!trimmedFirst) {
      setError("Enter a first name to continue.");
      return;
    }
    if (!trimmedLast) {
      setError("Add a single-letter last initial.");
      return;
    }
    if (!grade) {
      setError("Select your grade.");
      return;
    }
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      setError("Usernames must be 3-20 characters using lowercase letters, numbers, dots, hyphens, or underscores.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const gradeValue = grade;
      const ageNumber = sanitizeAge(age);
      const fallbackDemographics: StoredDemographics = {
        first_name: trimmedFirst,
        last_initial: trimmedLast,
        grade: gradeValue,
        age: ageNumber,
        school: school.trim() || null,
        prior_experience: priorExperience.trim() || null,
      };
      const result = await signup({
        firstName: trimmedFirst,
        lastInitial: trimmedLast,
        grade: gradeValue,
        age: age || "",
        username: normalizedUsername,
        password,
        school: school.trim() || undefined,
        priorExperience: priorExperience.trim() || undefined,
      });
      if (result.error || !result.data?.session) {
        setError(result.error ?? "We couldn’t create your account. Try again.");
        return;
      }
      await runPostAuthFlow({
        username: normalizedUsername,
        session: result.data.session,
        supabaseUser: result.data.user,
        fallbackDemographics,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unexpected error while creating your account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign up"
      description="Create your player profile so your progress follows you."
      footerLinks={[
        { to: "/auth/login", label: "Already have an account? Log in" },
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              First name
              <input
                type="text"
                value={firstName}
                onChange={event => setFirstName(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="Alex"
                autoComplete="given-name"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Last initial
              <input
                type="text"
                value={lastInitial}
                onChange={event => setLastInitial(formatLastInitial(event.target.value))}
                maxLength={1}
                className="rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="W"
                autoComplete="family-name"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Grade
              <select
                value={grade}
                onChange={event => setGrade(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                <option value="" disabled>
                  Choose grade
                </option>
                {GRADE_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Age (optional)
              <select
                value={age}
                onChange={event => setAge(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                <option value="">
                  Prefer not to share
                </option>
                {AGE_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Username
              <input
                type="text"
                value={username}
                onChange={event => setUsername(event.target.value.toLowerCase())}
                className="rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="yourname"
                autoComplete="username"
              />
              <span className="text-xs font-normal text-slate-500">
                Lowercase letters, numbers, dots, hyphens, or underscores (3-20 characters).
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Password
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="Create a password"
                autoComplete="new-password"
              />
              <span className="text-xs font-normal text-slate-500">
                At least 8 characters. No email—this is a game-only account.
              </span>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            School (optional)
            <input
              type="text"
              value={school}
              onChange={event => setSchool(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="Roosevelt Elementary"
              autoComplete="organization"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Prior experience (optional)
            <textarea
              value={priorExperience}
              onChange={event => setPriorExperience(event.target.value)}
              className="min-h-[96px] rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="Share any Rock-Paper-Scissors or AI experience."
            />
          </label>
          {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
          <button
            type="submit"
            disabled={submitting || localModeEnabled}
            className={`w-full rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow transition ${
              submitting || localModeEnabled ? "bg-slate-400" : "bg-sky-600 hover:bg-sky-700"
            }`}
          >
            {submitting ? "Creating account…" : "Sign up"}
          </button>
        </fieldset>
      </form>
      <div className="text-sm text-slate-600">
        Already registered? <Link to="/auth/login" className="font-semibold text-sky-600 hover:text-sky-700">Log in</Link> instead.
      </div>
    </AuthLayout>
  );
}
