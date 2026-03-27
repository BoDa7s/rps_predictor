import type { CSSProperties } from "react";

export const cockpitViewportStyle: CSSProperties = {
  "--play-cockpit-pad-x": "clamp(0.7rem, 0.45rem + 0.7vw, 1rem)",
  "--play-cockpit-pad-y": "clamp(0.6rem, 0.3rem + 0.85vh, 1rem)",
  "--play-cockpit-gap": "clamp(0.5rem, 0.35rem + 0.5vw, 0.9rem)",
  "--play-cockpit-header-pad-y": "clamp(0.4rem, 0.2rem + 0.65vh, 0.75rem)",
  "--play-cockpit-header-pad-x": "clamp(0.7rem, 0.45rem + 0.7vw, 1rem)",
  "--play-cockpit-dock-height": "clamp(7.75rem, 17.5vh, 11rem)",
  "--play-cockpit-rail-width": "clamp(11rem, 18vw, 22rem)",
  "--play-cockpit-dock-main": "minmax(0, 1.8fr)",
  "--play-cockpit-dock-side": "minmax(0, 1fr)",
  "--play-cockpit-bottom-safe": "max(1rem, env(safe-area-inset-bottom))",
} as CSSProperties;

export const cockpitGridTemplates = {
  rows: "minmax(0, 1fr) var(--play-cockpit-dock-height)",
  topColumns: "minmax(0, 1fr) var(--play-cockpit-rail-width)",
  dockColumns: "var(--play-cockpit-dock-main) var(--play-cockpit-dock-side)",
} as const;
