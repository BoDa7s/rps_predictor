import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

export type CockpitDensity = "expanded" | "normal" | "compact" | "tight";
export type CockpitViewportVariant = "default" | "challenge";

interface CockpitViewportState {
  rootRef: RefObject<HTMLDivElement>;
  density: CockpitDensity;
  scale: number;
  style: CSSProperties;
}

interface CockpitViewportOptions {
  variant?: CockpitViewportVariant;
}

interface PaneDensityState {
  paneRef: RefObject<HTMLDivElement>;
  density: CockpitDensity;
}

interface PaneDensityOptions {
  minNormalHeight: number;
  minCompactHeight: number;
  minNormalWidth?: number;
  minCompactWidth?: number;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatScale(value: number) {
  return value.toFixed(3);
}

function getCockpitDensity(width: number, height: number, variant: CockpitViewportVariant): CockpitDensity {
  if (variant === "challenge" && height >= 940 && width >= 1600) {
    return "expanded";
  }

  if (height <= 720 || (height <= 780 && width <= 1366)) {
    return "tight";
  }

  if (height <= 840 || (height <= 900 && width <= 1440)) {
    return "compact";
  }

  return "normal";
}

function getCockpitScale(width: number, height: number, density: CockpitDensity, variant: CockpitViewportVariant) {
  const widthFactor = clampNumber((width - 1280) / 640, 0, 1);
  const heightFactor = clampNumber((height - 720) / 360, 0, 1);
  const sizeFactor = Math.min(widthFactor, heightFactor);
  const densityOffset =
    density === "tight" ? -0.02 : density === "compact" ? 0 : density === "expanded" ? 0.06 : 0.03;

  if (variant === "challenge") {
    return clampNumber(0.9 + sizeFactor * 0.16 + densityOffset, 0.88, 1.1);
  }

  return clampNumber(density === "tight" ? 0.92 : density === "compact" ? 0.96 : density === "expanded" ? 1.05 : 1, 0.9, 1.06);
}

function buildCockpitViewportStyle(
  density: CockpitDensity,
  scale: number,
  variant: CockpitViewportVariant,
): CSSProperties {
  const styleBase = {
    "--play-cockpit-game-scale": formatScale(scale),
    "--play-cockpit-ai-value-size":
      density === "tight"
        ? "clamp(0.76rem,0.68rem+0.18vw,0.86rem)"
        : density === "compact"
          ? "clamp(0.82rem,0.74rem+0.2vw,0.94rem)"
          : density === "expanded"
            ? "clamp(1rem,0.84rem+0.34vw,1.18rem)"
            : "clamp(0.9rem,0.78rem+0.26vw,1.02rem)",
    "--play-cockpit-ai-label-size":
      density === "tight"
        ? "clamp(0.48rem,0.44rem+0.1vw,0.56rem)"
        : "clamp(0.54rem,0.48rem+0.12vw,0.66rem)",
    "--play-cockpit-ai-detail-size":
      density === "tight"
        ? "clamp(0.58rem,0.54rem+0.1vw,0.66rem)"
        : density === "compact"
          ? "clamp(0.64rem,0.58rem+0.14vw,0.76rem)"
          : density === "expanded"
            ? "clamp(0.76rem,0.68rem+0.2vw,0.9rem)"
            : "clamp(0.68rem,0.62rem+0.16vw,0.82rem)",
    "--play-cockpit-arena-slot-icon-box":
      density === "tight"
        ? "clamp(2.2rem,4vh,2.9rem)"
        : density === "compact"
          ? "clamp(2.55rem,5vh,3.45rem)"
          : density === "expanded"
            ? "clamp(3.5rem,8vh,5.25rem)"
            : "clamp(3.15rem,7.2vh,4.6rem)",
    "--play-cockpit-arena-slot-icon-size":
      density === "tight"
        ? "clamp(1rem,2.2vh,1.35rem)"
        : density === "compact"
          ? "clamp(1.15rem,2.8vh,1.7rem)"
          : density === "expanded"
            ? "clamp(1.95rem,4.4vh,3.2rem)"
            : "clamp(1.7rem,4vw,3rem)",
    "--play-cockpit-arena-center-ring":
      density === "tight"
        ? "clamp(3rem,5.4vh,3.9rem)"
        : density === "compact"
          ? "clamp(3.8rem,6.8vh,5rem)"
          : density === "expanded"
            ? "clamp(5.4rem,10.5vh,7.8rem)"
            : "clamp(4.8rem,9vh,6.6rem)",
    "--play-cockpit-arena-center-ring-text":
      density === "tight"
        ? "clamp(0.76rem,0.64rem+0.2vw,0.92rem)"
        : density === "compact"
          ? "clamp(0.9rem,0.76rem+0.3vw,1.24rem)"
          : density === "expanded"
            ? "clamp(1.24rem,0.92rem+1vw,2.1rem)"
            : "clamp(1.08rem,0.82rem+0.86vw,1.72rem)",
    "--play-cockpit-arena-center-title":
      density === "tight"
        ? "clamp(1rem,0.82rem+0.42vw,1.32rem)"
        : density === "compact"
          ? "clamp(1.15rem,0.92rem+0.52vw,1.6rem)"
          : density === "expanded"
            ? "clamp(1.45rem,1rem+1.25vw,2.4rem)"
            : "clamp(1.28rem,0.9rem+1vw,2rem)",
    "--play-cockpit-arena-center-detail":
      density === "tight"
        ? "clamp(0.68rem,0.62rem+0.16vw,0.8rem)"
        : density === "compact"
          ? "clamp(0.78rem,0.7rem+0.22vw,0.94rem)"
          : density === "expanded"
            ? "clamp(0.9rem,0.74rem+0.46vw,1.12rem)"
            : "clamp(0.84rem,0.7rem+0.34vw,1rem)",
  } as CSSProperties;

  if (density === "tight") {
    return {
      ...styleBase,
      "--play-cockpit-pad-x": "clamp(0.45rem, 0.26rem + 0.4vw, 0.72rem)",
      "--play-cockpit-pad-y": "clamp(0.34rem, 0.16rem + 0.34vh, 0.56rem)",
      "--play-cockpit-gap": "clamp(0.3rem, 0.18rem + 0.22vw, 0.48rem)",
      "--play-cockpit-header-pad-y": "clamp(0.26rem, 0.12rem + 0.25vh, 0.42rem)",
      "--play-cockpit-header-pad-x": "clamp(0.45rem, 0.26rem + 0.42vw, 0.72rem)",
      "--play-cockpit-dock-height":
        variant === "challenge"
          ? "calc(clamp(8rem, 16.2vh, 9.1rem) * var(--play-cockpit-game-scale))"
          : "clamp(6.35rem, 13.5vh, 7.6rem)",
      "--play-cockpit-rail-width":
        variant === "challenge"
          ? "calc(clamp(13.5rem, 21vw, 16.2rem) * max(0.96, var(--play-cockpit-game-scale)))"
          : "clamp(13rem, 21vw, 16.5rem)",
      "--play-cockpit-dock-main": "minmax(0, 1.95fr)",
      "--play-cockpit-dock-side": "minmax(0, 0.9fr)",
      "--play-cockpit-bottom-safe": "max(0.85rem, env(safe-area-inset-bottom))",
      "--play-cockpit-control-min-h":
        variant === "challenge"
          ? "calc(clamp(4.15rem, 6.6vh, 4.9rem) * var(--play-cockpit-game-scale))"
          : "clamp(3.6rem, 6vh, 4.45rem)",
      "--play-cockpit-control-icon-box":
        variant === "challenge"
          ? "calc(clamp(1.9rem, 3.6vh, 2.35rem) * var(--play-cockpit-game-scale))"
          : "clamp(2rem, 3.9vh, 2.55rem)",
      "--play-cockpit-control-icon-size":
        variant === "challenge"
          ? "calc(clamp(1rem, 1.9vh, 1.28rem) * var(--play-cockpit-game-scale))"
          : "clamp(1.05rem, 2.1vh, 1.42rem)",
      "--play-cockpit-control-title":
        variant === "challenge"
          ? "clamp(0.84rem, 0.74rem + 0.24vw, 0.98rem)"
          : "clamp(0.82rem, 0.72rem + 0.28vw, 0.96rem)",
      "--play-cockpit-control-hint-display": "none",
      "--play-cockpit-ai-note-display": "none",
      "--play-cockpit-ai-summary-display": "none",
      "--play-cockpit-ai-detail-display": "none",
    } as CSSProperties;
  }

  if (density === "compact") {
    return {
      ...styleBase,
      "--play-cockpit-pad-x": "clamp(0.56rem, 0.32rem + 0.5vw, 0.84rem)",
      "--play-cockpit-pad-y": "clamp(0.44rem, 0.22rem + 0.48vh, 0.72rem)",
      "--play-cockpit-gap": "clamp(0.38rem, 0.24rem + 0.3vw, 0.62rem)",
      "--play-cockpit-header-pad-y": "clamp(0.3rem, 0.15rem + 0.34vh, 0.5rem)",
      "--play-cockpit-header-pad-x": "clamp(0.56rem, 0.34rem + 0.52vw, 0.84rem)",
      "--play-cockpit-dock-height":
        variant === "challenge"
          ? "calc(clamp(8.5rem, 17vh, 10rem) * var(--play-cockpit-game-scale))"
          : "clamp(6.85rem, 14.8vh, 8.5rem)",
      "--play-cockpit-rail-width":
        variant === "challenge"
          ? "calc(clamp(14.5rem, 22.5vw, 18.5rem) * max(0.98, var(--play-cockpit-game-scale)))"
          : "clamp(14.5rem, 22vw, 18.5rem)",
      "--play-cockpit-dock-main": "minmax(0, 1.9fr)",
      "--play-cockpit-dock-side": "minmax(0, 0.95fr)",
      "--play-cockpit-bottom-safe": "max(0.95rem, env(safe-area-inset-bottom))",
      "--play-cockpit-control-min-h":
        variant === "challenge"
          ? "calc(clamp(4.25rem, 7vh, 5.1rem) * var(--play-cockpit-game-scale))"
          : "clamp(3.9rem, 6.8vh, 4.9rem)",
      "--play-cockpit-control-icon-box":
        variant === "challenge"
          ? "calc(clamp(2.05rem, 4.1vh, 2.75rem) * var(--play-cockpit-game-scale))"
          : "clamp(2.2rem, 4.5vh, 2.95rem)",
      "--play-cockpit-control-icon-size":
        variant === "challenge"
          ? "calc(clamp(1.1rem, 2.2vh, 1.5rem) * var(--play-cockpit-game-scale))"
          : "clamp(1.16rem, 2.35vh, 1.6rem)",
      "--play-cockpit-control-title":
        variant === "challenge"
          ? "clamp(0.9rem, 0.8rem + 0.3vw, 1.06rem)"
          : "clamp(0.86rem, 0.76rem + 0.34vw, 1.02rem)",
      "--play-cockpit-control-hint-display": "none",
      "--play-cockpit-ai-note-display": "inline-flex",
      "--play-cockpit-ai-summary-display": "block",
      "--play-cockpit-ai-detail-display": "block",
    } as CSSProperties;
  }

  if (density === "expanded") {
    return {
      ...styleBase,
      "--play-cockpit-pad-x": "clamp(0.82rem, 0.52rem + 0.85vw, 1.2rem)",
      "--play-cockpit-pad-y": "clamp(0.66rem, 0.36rem + 0.95vh, 1.05rem)",
      "--play-cockpit-gap": "clamp(0.56rem, 0.38rem + 0.55vw, 0.95rem)",
      "--play-cockpit-header-pad-y": "clamp(0.44rem, 0.24rem + 0.7vh, 0.8rem)",
      "--play-cockpit-header-pad-x": "clamp(0.82rem, 0.52rem + 0.8vw, 1.18rem)",
      "--play-cockpit-dock-height": "calc(clamp(9.4rem, 19.6vh, 12.8rem) * var(--play-cockpit-game-scale))",
      "--play-cockpit-rail-width": "calc(clamp(16.5rem, 18.5vw, 22.5rem) * var(--play-cockpit-game-scale))",
      "--play-cockpit-dock-main": "minmax(0, 1.82fr)",
      "--play-cockpit-dock-side": "minmax(0, 1fr)",
      "--play-cockpit-bottom-safe": "max(1rem, env(safe-area-inset-bottom))",
      "--play-cockpit-control-min-h": "calc(clamp(4.6rem, 8.8vh, 6rem) * var(--play-cockpit-game-scale))",
      "--play-cockpit-control-icon-box": "calc(clamp(2.5rem, 5.6vh, 3.4rem) * var(--play-cockpit-game-scale))",
      "--play-cockpit-control-icon-size": "calc(clamp(1.35rem, 2.85vh, 1.95rem) * var(--play-cockpit-game-scale))",
      "--play-cockpit-control-title": "clamp(1rem, 0.82rem + 0.4vw, 1.16rem)",
      "--play-cockpit-control-hint-display": "block",
      "--play-cockpit-ai-note-display": "inline-flex",
      "--play-cockpit-ai-summary-display": "block",
      "--play-cockpit-ai-detail-display": "block",
    } as CSSProperties;
  }

  return {
    ...styleBase,
    "--play-cockpit-pad-x": "clamp(0.7rem, 0.45rem + 0.7vw, 1rem)",
    "--play-cockpit-pad-y": "clamp(0.6rem, 0.3rem + 0.85vh, 1rem)",
    "--play-cockpit-gap": "clamp(0.5rem, 0.35rem + 0.5vw, 0.9rem)",
    "--play-cockpit-header-pad-y": "clamp(0.4rem, 0.2rem + 0.65vh, 0.75rem)",
    "--play-cockpit-header-pad-x": "clamp(0.7rem, 0.45rem + 0.7vw, 1rem)",
    "--play-cockpit-dock-height":
      variant === "challenge"
        ? "calc(clamp(8.65rem, 18.4vh, 11.6rem) * var(--play-cockpit-game-scale))"
        : "clamp(7.75rem, 17.5vh, 11rem)",
    "--play-cockpit-rail-width":
      variant === "challenge"
        ? "calc(clamp(15rem, 18vw, 20rem) * var(--play-cockpit-game-scale))"
        : "clamp(16rem, 18vw, 22rem)",
    "--play-cockpit-dock-main": "minmax(0, 1.8fr)",
    "--play-cockpit-dock-side": "minmax(0, 1fr)",
    "--play-cockpit-bottom-safe": "max(1rem, env(safe-area-inset-bottom))",
    "--play-cockpit-control-min-h":
      variant === "challenge"
        ? "calc(clamp(4.2rem, 8.1vh, 5.35rem) * var(--play-cockpit-game-scale))"
        : "clamp(4.6rem, 10.5vh, 5.9rem)",
    "--play-cockpit-control-icon-box":
      variant === "challenge"
        ? "calc(clamp(2.3rem, 5.2vh, 3.05rem) * var(--play-cockpit-game-scale))"
        : "clamp(2.55rem, 6.2vh, 3.5rem)",
    "--play-cockpit-control-icon-size":
      variant === "challenge"
        ? "calc(clamp(1.28rem, 2.8vh, 1.8rem) * var(--play-cockpit-game-scale))"
        : "clamp(1.45rem, 3.5vh, 2rem)",
    "--play-cockpit-control-title":
      variant === "challenge"
        ? "clamp(0.96rem, 0.78rem + 0.42vw, 1.12rem)"
        : "clamp(0.95rem, 0.72rem + 0.55vw, 1.15rem)",
    "--play-cockpit-control-hint-display": "block",
    "--play-cockpit-ai-note-display": "inline-flex",
    "--play-cockpit-ai-summary-display": "block",
    "--play-cockpit-ai-detail-display": "block",
  } as CSSProperties;
}

export function useCockpitViewport(options: CockpitViewportOptions = {}): CockpitViewportState {
  const variant = options.variant ?? "default";
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

  const density = useMemo(() => getCockpitDensity(size.width, size.height, variant), [size.height, size.width, variant]);
  const scale = useMemo(() => getCockpitScale(size.width, size.height, density, variant), [density, size.height, size.width, variant]);
  const style = useMemo(() => buildCockpitViewportStyle(density, scale, variant), [density, scale, variant]);

  return { rootRef, density, scale, style };
}

export function usePaneDensity(baseDensity: CockpitDensity, options: PaneDensityOptions): PaneDensityState {
  const paneRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = paneRef.current;
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

  const density = useMemo(() => {
    const compactWidth = options.minCompactWidth ?? 0;
    const normalWidth = options.minNormalWidth ?? compactWidth;

    if (size.height >= options.minNormalHeight && size.width >= normalWidth) {
      return baseDensity === "expanded" ? "expanded" : "normal";
    }

    if (size.height >= options.minCompactHeight && size.width >= compactWidth) {
      return baseDensity === "tight" ? "compact" : baseDensity === "expanded" ? "normal" : "compact";
    }

    return "tight";
  }, [baseDensity, options.minCompactHeight, options.minCompactWidth, options.minNormalHeight, options.minNormalWidth, size.height, size.width]);

  return { paneRef, density };
}

export const cockpitGridTemplates = {
  rows: "minmax(0, 1fr) var(--play-cockpit-dock-height)",
  topColumns: "minmax(0, 1fr) var(--play-cockpit-rail-width)",
  dockColumns: "var(--play-cockpit-dock-main) var(--play-cockpit-dock-side)",
} as const;
