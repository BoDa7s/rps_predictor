import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

export type CockpitDensity = "normal" | "compact" | "tight";

interface CockpitViewportState {
  rootRef: RefObject<HTMLDivElement>;
  density: CockpitDensity;
  style: CSSProperties;
}

function getCockpitDensity(width: number, height: number): CockpitDensity {
  if (height <= 720 || (height <= 780 && width <= 1366)) {
    return "tight";
  }

  if (height <= 840 || (height <= 900 && width <= 1440)) {
    return "compact";
  }

  return "normal";
}

function buildCockpitViewportStyle(density: CockpitDensity): CSSProperties {
  if (density === "tight") {
    return {
      "--play-cockpit-pad-x": "clamp(0.45rem, 0.26rem + 0.4vw, 0.72rem)",
      "--play-cockpit-pad-y": "clamp(0.34rem, 0.16rem + 0.34vh, 0.56rem)",
      "--play-cockpit-gap": "clamp(0.3rem, 0.18rem + 0.22vw, 0.48rem)",
      "--play-cockpit-header-pad-y": "clamp(0.26rem, 0.12rem + 0.25vh, 0.42rem)",
      "--play-cockpit-header-pad-x": "clamp(0.45rem, 0.26rem + 0.42vw, 0.72rem)",
      "--play-cockpit-dock-height": "clamp(6.35rem, 13.5vh, 7.6rem)",
      "--play-cockpit-rail-width": "clamp(13rem, 21vw, 16.5rem)",
      "--play-cockpit-dock-main": "minmax(0, 1.95fr)",
      "--play-cockpit-dock-side": "minmax(0, 0.9fr)",
      "--play-cockpit-bottom-safe": "max(0.85rem, env(safe-area-inset-bottom))",
      "--play-cockpit-control-min-h": "clamp(3.6rem, 6vh, 4.45rem)",
      "--play-cockpit-control-icon-box": "clamp(2rem, 3.9vh, 2.55rem)",
      "--play-cockpit-control-icon-size": "clamp(1.05rem, 2.1vh, 1.42rem)",
      "--play-cockpit-control-title": "clamp(0.82rem, 0.72rem + 0.28vw, 0.96rem)",
      "--play-cockpit-control-hint-display": "none",
      "--play-cockpit-ai-note-display": "none",
      "--play-cockpit-ai-summary-display": "none",
      "--play-cockpit-ai-detail-display": "none",
    } as CSSProperties;
  }

  if (density === "compact") {
    return {
      "--play-cockpit-pad-x": "clamp(0.56rem, 0.32rem + 0.5vw, 0.84rem)",
      "--play-cockpit-pad-y": "clamp(0.44rem, 0.22rem + 0.48vh, 0.72rem)",
      "--play-cockpit-gap": "clamp(0.38rem, 0.24rem + 0.3vw, 0.62rem)",
      "--play-cockpit-header-pad-y": "clamp(0.3rem, 0.15rem + 0.34vh, 0.5rem)",
      "--play-cockpit-header-pad-x": "clamp(0.56rem, 0.34rem + 0.52vw, 0.84rem)",
      "--play-cockpit-dock-height": "clamp(6.85rem, 14.8vh, 8.5rem)",
      "--play-cockpit-rail-width": "clamp(14.5rem, 22vw, 18.5rem)",
      "--play-cockpit-dock-main": "minmax(0, 1.9fr)",
      "--play-cockpit-dock-side": "minmax(0, 0.95fr)",
      "--play-cockpit-bottom-safe": "max(0.95rem, env(safe-area-inset-bottom))",
      "--play-cockpit-control-min-h": "clamp(3.9rem, 6.8vh, 4.9rem)",
      "--play-cockpit-control-icon-box": "clamp(2.2rem, 4.5vh, 2.95rem)",
      "--play-cockpit-control-icon-size": "clamp(1.16rem, 2.35vh, 1.6rem)",
      "--play-cockpit-control-title": "clamp(0.86rem, 0.76rem + 0.34vw, 1.02rem)",
      "--play-cockpit-control-hint-display": "none",
      "--play-cockpit-ai-note-display": "inline-flex",
      "--play-cockpit-ai-summary-display": "block",
      "--play-cockpit-ai-detail-display": "block",
    } as CSSProperties;
  }

  return {
    "--play-cockpit-pad-x": "clamp(0.7rem, 0.45rem + 0.7vw, 1rem)",
    "--play-cockpit-pad-y": "clamp(0.6rem, 0.3rem + 0.85vh, 1rem)",
    "--play-cockpit-gap": "clamp(0.5rem, 0.35rem + 0.5vw, 0.9rem)",
    "--play-cockpit-header-pad-y": "clamp(0.4rem, 0.2rem + 0.65vh, 0.75rem)",
    "--play-cockpit-header-pad-x": "clamp(0.7rem, 0.45rem + 0.7vw, 1rem)",
    "--play-cockpit-dock-height": "clamp(7.75rem, 17.5vh, 11rem)",
    "--play-cockpit-rail-width": "clamp(16rem, 18vw, 22rem)",
    "--play-cockpit-dock-main": "minmax(0, 1.8fr)",
    "--play-cockpit-dock-side": "minmax(0, 1fr)",
    "--play-cockpit-bottom-safe": "max(1rem, env(safe-area-inset-bottom))",
    "--play-cockpit-control-min-h": "clamp(4.6rem, 10.5vh, 5.9rem)",
    "--play-cockpit-control-icon-box": "clamp(2.55rem, 6.2vh, 3.5rem)",
    "--play-cockpit-control-icon-size": "clamp(1.45rem, 3.5vh, 2rem)",
    "--play-cockpit-control-title": "clamp(0.95rem, 0.72rem + 0.55vw, 1.15rem)",
    "--play-cockpit-control-hint-display": "block",
    "--play-cockpit-ai-note-display": "inline-flex",
    "--play-cockpit-ai-summary-display": "block",
    "--play-cockpit-ai-detail-display": "block",
  } as CSSProperties;
}

export function useCockpitViewport(): CockpitViewportState {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1600, height: 900 });

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const updateSize = () => {
      const nextWidth = Math.round(node.clientWidth);
      const nextHeight = Math.round(node.clientHeight);
      setSize(current => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  const density = useMemo(() => getCockpitDensity(size.width, size.height), [size.height, size.width]);
  const style = useMemo(() => buildCockpitViewportStyle(density), [density]);

  return { rootRef, density, style };
}

export const cockpitGridTemplates = {
  rows: "minmax(0, 1fr) var(--play-cockpit-dock-height)",
  topColumns: "minmax(0, 1fr) var(--play-cockpit-rail-width)",
  dockColumns: "var(--play-cockpit-dock-main) var(--play-cockpit-dock-side)",
} as const;
