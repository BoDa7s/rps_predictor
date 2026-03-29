import { DEV_MODE_ENABLED } from "./devMode";

export type PlaySurface = "game" | "stats" | "leaderboard" | "settings" | "help" | "about" | "developer";

const basePlayNavItems: { to: string; label: string; surface: PlaySurface }[] = [
  { to: "/play/dashboard", label: "Dashboard", surface: "game" },
  { to: "/play/stats", label: "Statistics", surface: "stats" },
  { to: "/play/leaderboard", label: "Leaderboard", surface: "leaderboard" },
  { to: "/play/settings", label: "Settings", surface: "settings" },
  { to: "/play/help", label: "Help", surface: "help" },
  { to: "/play/about", label: "About", surface: "about" },
];

export const playNavItems: { to: string; label: string; surface: PlaySurface }[] = DEV_MODE_ENABLED
  ? [...basePlayNavItems, { to: "/play/developer", label: "Developer Mode", surface: "developer" }]
  : basePlayNavItems;
