import React from "react";
import { Link } from "react-router-dom";
import { useSafeBackNavigation } from "../lib/navigation";

interface AuthLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footerLinks?: Array<{ to: string; label: string }>;
}

export function AuthLayout({ title, description, children, footerLinks }: AuthLayoutProps): JSX.Element {
  const handleBack = useSafeBackNavigation("/welcome");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 px-4 py-10">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
        <div className="w-full max-w-lg self-start">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1.5 text-sm font-semibold text-sky-700 shadow-sm ring-1 ring-sky-100 transition hover:bg-white"
          >
            <span aria-hidden="true">←</span>
            Back
          </button>
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-sky-700">RPS Predictor Portal</h1>
          <p className="mt-2 text-sm text-slate-600">
            Access the Edge Functions-backed authentication flow to keep your progress synced.
          </p>
        </div>
        <div className="w-full max-w-lg rounded-3xl bg-white/90 p-8 shadow-2xl ring-1 ring-slate-100">
          <div className="space-y-2 border-b border-slate-200 pb-6">
            <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
            {description ? <p className="text-sm text-slate-600">{description}</p> : null}
          </div>
          <div className="mt-6 space-y-6">{children}</div>
        </div>
        {footerLinks && footerLinks.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-600">
            {footerLinks.map(link => (
              <Link key={link.to} to={link.to} className="font-semibold text-sky-600 hover:text-sky-700">
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
