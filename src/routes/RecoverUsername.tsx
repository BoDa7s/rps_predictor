import React, { useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { recoverUsername } from "../lib/edgeFunctions";
import { GRADE_OPTIONS } from "../players";

function formatInitial(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed[0].toUpperCase();
}

export function RecoverUsernamePage(): JSX.Element {
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [grade, setGrade] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setUsername(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = formatInitial(lastInitial);

    if (!trimmedFirst || !trimmedLast || !grade || !password) {
      setError("Complete every field to recover your username.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await recoverUsername({
        firstName: trimmedFirst,
        lastInitial: trimmedLast,
        grade,
        password,
      });
      if (result.error || !result.data?.username) {
        setError(result.error ?? "Those details don’t match our records.");
        return;
      }
      setUsername(result.data.username);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to recover username right now.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Recover username"
      description="Enter the same details you used to sign up."
      footerLinks={[
        { to: "/auth/login", label: "Back to log in" },
        { to: "/auth/signup", label: "Need an account? Sign up" },
      ]}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            First name
            <input
              type="text"
              value={firstName}
              onChange={event => setFirstName(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="Alex"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Last initial
            <input
              type="text"
              value={lastInitial}
              onChange={event => setLastInitial(formatInitial(event.target.value))}
              maxLength={1}
              className="rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="W"
            />
          </label>
        </div>
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
          Password
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="Account password"
          />
        </label>
        {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
        {username ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-700">
            <p className="font-semibold">We found your username!</p>
            <p className="mt-1 text-base font-bold text-emerald-800">{username}</p>
            <p className="mt-2">
              Ready to play? <Link to="/auth/login" className="font-semibold text-emerald-800 underline">Log in</Link> with it
              now.
            </p>
          </div>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className={`w-full rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow transition ${
            submitting ? "bg-slate-400" : "bg-sky-600 hover:bg-sky-700"
          }`}
        >
          {submitting ? "Searching…" : "Show my username"}
        </button>
      </form>
    </AuthLayout>
  );
}
