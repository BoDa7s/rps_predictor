import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import botHappy96 from "../assets/mascot/bot-happy-96.svg";
import { persistWelcomePreference } from "../playEntry";
import { playNavItems } from "../playNavigation";
import { usePlayers } from "../players";
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

function getPlayerFirstName(playerName: string | null | undefined) {
  const trimmed = (playerName ?? "").trim();
  if (!trimmed) return "Current player";
  return trimmed.split(/\s+/)[0] || "Current player";
}

function PlayLayoutShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const isGameRoute = location.pathname === "/play";
  const pageMeta = playPageMeta[location.pathname];
  const { currentPlayer, setCurrentPlayer } = usePlayers();
  const { themePreference, resolvedThemeMode, themeVariables, themeOptions, applyThemePreference } = usePlayTheme();
  const [playerMenuOpen, setPlayerMenuOpen] = useState(false);
  const playerMenuRef = useRef<HTMLDivElement | null>(null);
  const dashboardItem = useMemo(() => playNavItems.find(item => item.surface === "game") ?? playNavItems[0], []);
  const playerMenuItems = useMemo(() => playNavItems.filter(item => item.surface !== "game"), []);
  const currentPlayerFirstName = getPlayerFirstName(currentPlayer?.playerName);
  const currentPlayerInitial = currentPlayerFirstName === "Current player" ? "?" : currentPlayerFirstName.charAt(0).toUpperCase();
  const playerMenuActive = playerMenuItems.some(item => item.to === location.pathname);
  const playerTriggerActive = playerMenuOpen || playerMenuActive;

  useEffect(() => {
    setPlayerMenuOpen(false);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!playerMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!playerMenuRef.current?.contains(event.target as Node)) {
        setPlayerMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlayerMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [playerMenuOpen]);

  const handleLogout = () => {
    setPlayerMenuOpen(false);
    setCurrentPlayer(null);
    persistWelcomePreference("show");
    navigate("/", { replace: true });
  };

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

          <nav className="relative pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative" ref={playerMenuRef}>
                <button
                  type="button"
                  className={`play-shell-nav-link inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-semibold transition ${
                    playerTriggerActive ? "is-active" : ""
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={playerMenuOpen}
                  aria-label="Open player menu"
                  onClick={() => setPlayerMenuOpen(open => !open)}
                >
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold ${
                      playerTriggerActive
                        ? "border-white/20 bg-white/15 text-[color:var(--app-on-accent)]"
                        : "border-[color:var(--app-border-strong)] bg-[color:var(--app-accent-soft)] text-[color:var(--app-accent-strong)]"
                    }`}
                  >
                    {currentPlayerInitial}
                  </span>
                  <span
                    className={`hidden sm:inline ${
                      playerTriggerActive ? "text-[color:var(--app-on-accent)]" : "text-[color:var(--app-text-secondary)]"
                    }`}
                  >
                    {currentPlayerFirstName}
                  </span>
                  <span
                    className={`text-xs ${
                      playerTriggerActive ? "text-[color:var(--app-on-accent)]" : "text-[color:var(--app-text-muted)]"
                    }`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </button>

                {playerMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Player navigation"
                    className="absolute left-0 top-full z-[110] mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-surface-card)] p-2 shadow-[var(--app-surface-shadow)]"
                  >
                    <div className="mb-2 rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--app-text-muted)]">Player</p>
                      <p className="mt-1 text-sm font-semibold text-[color:var(--app-text-strong)]">{currentPlayerFirstName}</p>
                    </div>

                    <div className="flex flex-col gap-1">
                      {playerMenuItems.map(item => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          role="menuitem"
                          className={({ isActive }) =>
                            `play-shell-dropdown-item inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                              isActive ? "is-active" : ""
                            }`
                          }
                          onClick={() => setPlayerMenuOpen(false)}
                        >
                          {item.label}
                        </NavLink>
                      ))}
                    </div>

                    <div className="mt-2 border-t border-[color:var(--app-border)] pt-2">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        className="play-shell-dropdown-item play-shell-dropdown-item-danger inline-flex w-full items-center rounded-xl px-4 py-2.5 text-left text-sm font-medium transition"
                      >
                        Log out
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {dashboardItem && (
                <NavLink
                  key={dashboardItem.to}
                  to={dashboardItem.to}
                  end={dashboardItem.to === "/play"}
                  className={({ isActive }) =>
                    `play-shell-nav-link inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                      isActive ? "is-active" : ""
                    }`
                  }
                >
                  {dashboardItem.label}
                </NavLink>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main className={isGameRoute ? "flex-1" : "flex-1 px-4 py-4 sm:px-6 sm:py-4 lg:px-8"}>
        <div className={isGameRoute ? "h-full" : "mx-auto flex w-full max-w-7xl flex-col gap-4"}>
          {!isGameRoute && pageMeta && (
            <section className="play-shell-surface rounded-[1.5rem] px-5 py-4 sm:px-6 sm:py-5">
              <h1 className="play-shell-heading text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                {pageMeta.title}
              </h1>
              <p className="play-shell-muted mt-1.5 max-w-3xl text-sm leading-6 sm:text-[0.95rem]">{pageMeta.description}</p>
            </section>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default PlayLayoutShell;
