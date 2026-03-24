import React from "react";
import { Link, Outlet } from "react-router-dom";
import botHappy96 from "../assets/mascot/bot-happy-96.svg";
import { usePlayTheme } from "./PlayThemeProvider";

export default function PlayOnboardingLayout() {
  const { themePreference, resolvedThemeMode, themeVariables } = usePlayTheme();

  return (
    <div
      className="play-shell-theme app-theme landing-shell min-h-screen"
      data-theme={resolvedThemeMode}
      data-theme-preference={themePreference}
      style={themeVariables as React.CSSProperties}
    >
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="play-shell-brand flex h-12 w-12 items-center justify-center rounded-full shadow-[0_12px_30px_rgba(14,165,233,0.18)]">
              <img src={botHappy96} alt="" className="h-8 w-8" />
            </div>
            <div>
              <p className="play-shell-brand-title text-sm font-semibold uppercase tracking-[0.28em]">RPS Predictor</p>
              <p className="play-shell-muted text-xs">Onboarding and startup flow</p>
            </div>
          </div>
          <Link
            to="/"
            className="play-shell-button play-shell-button-muted inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold"
          >
            Back to site
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
