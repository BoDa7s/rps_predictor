import React, { useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { resetPassword } from "../lib/edgeFunctions";
import { GRADE_OPTIONS } from "../players";

function formatInitial(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed[0].toUpperCase();
}

export function ResetPasswordPage(): JSX.Element {
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [grade, setGrade] = useState("");
  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const trimmedFirst = firstName.trim();
    const trimmedLast = formatInitial(lastInitial);
    const normalizedUsername = username.trim().toLowerCase();

    if (!trimmedFirst || !trimmedLast || !grade || !normalizedUsername || newPassword.length < 8) {
      setError("Fill in every field and use a password with at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await resetPassword({
        firstName: trimmedFirst,
        lastInitial: trimmedLast,
        grade,
        username: normalizedUsername,
        newPassword,
      });
      if (result.error || !result.data?.success) {
        setError(result.error ?? "We couldn’t reset that password. Double-check your details.");
        return;
      }
      setSuccess(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reset the password right now.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset password"
      description="Match the details from your account to choose a new password."
      footerLinks={[
        { to: "/auth/login", label: "Back to log in" },
        { to: "/recover-username", label: "Forgot username" },
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
          Username
          <input
            type="text"
            value={username}
            onChange={event => setUsername(event.target.value.toLowerCase())}
            className="rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="yourname"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          New password
          <input
            type="password"
            value={newPassword}
            onChange={event => setNewPassword(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-base shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="Create a new password"
          />
          <span className="text-xs font-normal text-slate-500">At least 8 characters.</span>
        </label>
        {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-700">
            <p className="font-semibold">Password updated!</p>
            <p className="mt-2">
              You can now <Link to="/auth/login" className="font-semibold text-emerald-800 underline">log in</Link> with your new
              password.
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
          {submitting ? "Updating password…" : "Reset password"}
        </button>
      </form>
    </AuthLayout>
  );
}
