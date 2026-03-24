import React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import botHappy96 from "../assets/mascot/bot-happy-96.svg";
import { playNavItems } from "../playNavigation";
import { usePlayTheme } from "./PlayThemeProvider";

const playPageMeta: Record<string, { title: string; description: string }> = {
  "/play/stats": {
    title: "Statistics",
    description: "Review match history, behavior trends, confidence signals, and exportable profile data.",
  },
  "/play/leaderboard": {
    title: "Leaderboard",
    description: "See the strongest match scores recorded on this device across challenge sessions.",
  },
  "/play/settings": {
    title: "Settings",
    description: "Manage player data, training controls, gameplay preferences, and display options.",
  },
  "/play/help": {
    title: "Help",
    description: "Browse gameplay, AI, and interface questions without leaving the play workspace.",
  },
  "/play/about": {
    title: "About",
    description: "Project context, credits, educational framing, and links for RPS Predictor.",
  },
};

function PlayLayoutShell() {
  const location = useLocation();
  const isGameRoute = location.pathname === "/play";
  const pageMeta = playPageMeta[location.pathname];
  const { themePreference, resolvedThemeMode, themeVariables, themeOptions, applyThemePreference } = usePlayTheme();

  return (
    <div
      className="play-shell-theme app-theme landing-shell flex min-h-screen flex-col"
      data-theme={resolvedThemeMode}
      data-theme-preference={themePreference}
      style={themeVariables as React.CSSProperties}
    >
      <header className="play-shell-header sticky top-0 z-[95] border-b backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="play-shell-brand flex h-11 w-11 items-center justify-center rounded-full shadow-[0_12px_30px_rgba(14,165,233,0.18)]">
                <img src={botHappy96} alt="" className="h-8 w-8" />
              </div>
              <div>
                <p className="play-shell-brand-title text-sm font-semibold uppercase tracking-[0.28em]">RPS Predictor</p>
                <p className="play-shell-muted text-xs">Play area with routed tools, stats, settings, and theme controls</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="play-shell-toggle inline-flex items-center overflow-hidden rounded-full border">
                {themeOptions.map(option => {
                  const active = option.value === themePreference;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => applyThemePreference(option.value)}
                      className={`play-shell-toggle-button px-3 py-2 text-xs font-semibold transition ${
                        active ? "is-active" : ""
                      }`}
                      aria-pressed={active}
                      title={option.label}
                    >
                      {option.value === "system" ? "System" : option.value === "dark" ? "Dark" : "Light"}
                    </button>
                  );
                })}
              </div>

              <Link to="/" className="play-shell-button play-shell-button-muted inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold">
                Back to site
              </Link>
            </div>
          </div>

          <nav className="overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2">
              {playNavItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/play"}
                  className={({ isActive }) =>
                    `play-shell-nav-link inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                      isActive ? "is-active" : ""
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </header>

      <main className={isGameRoute ? "flex-1" : "flex-1 px-4 py-6 sm:px-6 lg:px-8"}>
        <div className={isGameRoute ? "h-full" : "mx-auto flex w-full max-w-7xl flex-col gap-6"}>
          {!isGameRoute && pageMeta && (
            <section className="play-shell-surface rounded-[2rem] px-6 py-6 sm:px-8">
              <p className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.24em]">Play App</p>
              <h1 className="play-shell-heading mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                {pageMeta.title}
              </h1>
              <p className="play-shell-muted mt-3 max-w-3xl text-sm leading-7 sm:text-base">{pageMeta.description}</p>
            </section>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default PlayLayoutShell;
