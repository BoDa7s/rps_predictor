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

function scaleValue(value: string, variant: CockpitViewportVariant) {
  return variant === "challenge" ? `calc(${value} * var(--play-cockpit-game-scale))` : value;
}

function getCockpitScale(width: number, height: number, variant: CockpitViewportVariant) {
  if (variant === "challenge") {
    const referenceWidth = 1510;
    const referenceHeight = 845;
    const widthFit = width / referenceWidth;
    const heightFit = height / referenceHeight;
    const limitingFit = Math.min(widthFit, heightFit);
    const areaFit = Math.sqrt((width * height) / (referenceWidth * referenceHeight));
    const blendedFit = limitingFit * 0.82 + areaFit * 0.18;
    return clampNumber(blendedFit, 0.78, 1.08);
  }

  const referenceWidth = 1440;
  const referenceHeight = 840;
  const widthFit = width / referenceWidth;
  const heightFit = height / referenceHeight;
  return clampNumber(Math.min(widthFit, heightFit), 0.86, 1.05);
}

function getCockpitDensity(scale: number, variant: CockpitViewportVariant): CockpitDensity {
  if (variant === "challenge") {
    if (scale >= 1.025) return "expanded";
    if (scale >= 0.92) return "normal";
    if (scale >= 0.84) return "compact";
    return "tight";
  }

  if (scale >= 1.01) return "expanded";
  if (scale >= 0.94) return "normal";
  if (scale >= 0.88) return "compact";
  return "tight";
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
        ? scaleValue("clamp(0.76rem,0.68rem+0.18vw,0.86rem)", variant)
        : density === "compact"
          ? scaleValue("clamp(0.82rem,0.74rem+0.2vw,0.94rem)", variant)
          : density === "expanded"
            ? scaleValue("clamp(1rem,0.84rem+0.34vw,1.18rem)", variant)
            : scaleValue("clamp(0.9rem,0.78rem+0.26vw,1.02rem)", variant),
    "--play-cockpit-ai-label-size":
      density === "tight"
        ? scaleValue("clamp(0.48rem,0.44rem+0.1vw,0.56rem)", variant)
        : scaleValue("clamp(0.54rem,0.48rem+0.12vw,0.66rem)", variant),
    "--play-cockpit-ai-detail-size":
      density === "tight"
        ? scaleValue("clamp(0.58rem,0.54rem+0.1vw,0.66rem)", variant)
        : density === "compact"
          ? scaleValue("clamp(0.64rem,0.58rem+0.14vw,0.76rem)", variant)
          : density === "expanded"
            ? scaleValue("clamp(0.76rem,0.68rem+0.2vw,0.9rem)", variant)
            : scaleValue("clamp(0.68rem,0.62rem+0.16vw,0.82rem)", variant),
    "--play-cockpit-arena-slot-icon-box":
      density === "tight"
        ? scaleValue("clamp(2.2rem,4vh,2.9rem)", variant)
        : density === "compact"
          ? scaleValue("clamp(2.55rem,5vh,3.45rem)", variant)
          : density === "expanded"
            ? scaleValue("clamp(3.5rem,8vh,5.25rem)", variant)
            : scaleValue("clamp(3.15rem,7.2vh,4.6rem)", variant),
    "--play-cockpit-arena-slot-icon-size":
      density === "tight"
        ? scaleValue("clamp(1rem,2.2vh,1.35rem)", variant)
        : density === "compact"
          ? scaleValue("clamp(1.15rem,2.8vh,1.7rem)", variant)
          : density === "expanded"
            ? scaleValue("clamp(1.95rem,4.4vh,3.2rem)", variant)
            : scaleValue("clamp(1.7rem,4vw,3rem)", variant),
    "--play-cockpit-arena-center-ring":
      density === "tight"
        ? scaleValue("clamp(3rem,5.4vh,3.9rem)", variant)
        : density === "compact"
          ? scaleValue("clamp(3.8rem,6.8vh,5rem)", variant)
          : density === "expanded"
            ? scaleValue("clamp(5.4rem,10.5vh,7.8rem)", variant)
            : scaleValue("clamp(4.8rem,9vh,6.6rem)", variant),
    "--play-cockpit-arena-center-ring-text":
      density === "tight"
        ? scaleValue("clamp(0.76rem,0.64rem+0.2vw,0.92rem)", variant)
        : density === "compact"
          ? scaleValue("clamp(0.9rem,0.76rem+0.3vw,1.24rem)", variant)
          : density === "expanded"
            ? scaleValue("clamp(1.24rem,0.92rem+1vw,2.1rem)", variant)
            : scaleValue("clamp(1.08rem,0.82rem+0.86vw,1.72rem)", variant),
    "--play-cockpit-arena-center-title":
      density === "tight"
        ? scaleValue("clamp(1rem,0.82rem+0.42vw,1.32rem)", variant)
        : density === "compact"
          ? scaleValue("clamp(1.15rem,0.92rem+0.52vw,1.6rem)", variant)
          : density === "expanded"
            ? scaleValue("clamp(1.45rem,1rem+1.25vw,2.4rem)", variant)
            : scaleValue("clamp(1.28rem,0.9rem+1vw,2rem)", variant),
    "--play-cockpit-arena-center-detail":
      density === "tight"
        ? scaleValue("clamp(0.68rem,0.62rem+0.16vw,0.8rem)", variant)
        : density === "compact"
          ? scaleValue("clamp(0.78rem,0.7rem+0.22vw,0.94rem)", variant)
          : density === "expanded"
            ? scaleValue("clamp(0.9rem,0.74rem+0.46vw,1.12rem)", variant)
            : scaleValue("clamp(0.84rem,0.7rem+0.34vw,1rem)", variant),
  } as CSSProperties;

  if (density === "tight") {
    return {
      ...styleBase,
      "--play-cockpit-pad-x": scaleValue("clamp(0.45rem, 0.26rem + 0.4vw, 0.72rem)", variant),
      "--play-cockpit-pad-y": scaleValue("clamp(0.34rem, 0.16rem + 0.34vh, 0.56rem)", variant),
      "--play-cockpit-gap": scaleValue("clamp(0.3rem, 0.18rem + 0.22vw, 0.48rem)", variant),
      "--play-cockpit-header-pad-y": scaleValue("clamp(0.26rem, 0.12rem + 0.25vh, 0.42rem)", variant),
      "--play-cockpit-header-pad-x": scaleValue("clamp(0.45rem, 0.26rem + 0.42vw, 0.72rem)", variant),
      "--play-cockpit-dock-height":
        variant === "challenge"
          ? scaleValue("clamp(8.75rem, 17.4vh, 9.8rem)", variant)
          : "clamp(6.35rem, 13.5vh, 7.6rem)",
      "--play-cockpit-rail-width":
        variant === "challenge"
          ? `max(13.75rem, ${scaleValue("clamp(13.5rem, 21vw, 16.2rem)", variant)})`
          : "clamp(13rem, 21vw, 16.5rem)",
      "--play-cockpit-dock-main": "minmax(0, 1.95fr)",
      "--play-cockpit-dock-side": "minmax(0, 0.9fr)",
      "--play-cockpit-bottom-safe": "max(0.85rem, env(safe-area-inset-bottom))",
      "--play-cockpit-control-min-h":
        variant === "challenge"
          ? scaleValue("clamp(4.6rem, 7.2vh, 5.3rem)", variant)
          : "clamp(3.6rem, 6vh, 4.45rem)",
      "--play-cockpit-control-icon-box":
        variant === "challenge"
          ? scaleValue("clamp(1.9rem, 3.6vh, 2.35rem)", variant)
          : "clamp(2rem, 3.9vh, 2.55rem)",
      "--play-cockpit-control-icon-size":
        variant === "challenge"
          ? scaleValue("clamp(1rem, 1.9vh, 1.28rem)", variant)
          : "clamp(1.05rem, 2.1vh, 1.42rem)",
      "--play-cockpit-control-title":
        variant === "challenge"
          ? scaleValue("clamp(1rem, 0.88rem + 0.2vw, 1.08rem)", variant)
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
      "--play-cockpit-pad-x": scaleValue("clamp(0.56rem, 0.32rem + 0.5vw, 0.84rem)", variant),
      "--play-cockpit-pad-y": scaleValue("clamp(0.44rem, 0.22rem + 0.48vh, 0.72rem)", variant),
      "--play-cockpit-gap": scaleValue("clamp(0.38rem, 0.24rem + 0.3vw, 0.62rem)", variant),
      "--play-cockpit-header-pad-y": scaleValue("clamp(0.3rem, 0.15rem + 0.34vh, 0.5rem)", variant),
      "--play-cockpit-header-pad-x": scaleValue("clamp(0.56rem, 0.34rem + 0.52vw, 0.84rem)", variant),
      "--play-cockpit-dock-height":
        variant === "challenge"
          ? scaleValue("clamp(9.2rem, 18.2vh, 10.4rem)", variant)
          : "clamp(6.85rem, 14.8vh, 8.5rem)",
      "--play-cockpit-rail-width":
        variant === "challenge"
          ? `max(13.75rem, ${scaleValue("clamp(14.5rem, 22.5vw, 18.5rem)", variant)})`
          : "clamp(14.5rem, 22vw, 18.5rem)",
      "--play-cockpit-dock-main": "minmax(0, 1.9fr)",
      "--play-cockpit-dock-side": "minmax(0, 0.95fr)",
      "--play-cockpit-bottom-safe": "max(0.95rem, env(safe-area-inset-bottom))",
      "--play-cockpit-control-min-h":
        variant === "challenge"
          ? scaleValue("clamp(4.7rem, 7.5vh, 5.45rem)", variant)
          : "clamp(3.9rem, 6.8vh, 4.9rem)",
      "--play-cockpit-control-icon-box":
        variant === "challenge"
          ? scaleValue("clamp(2.05rem, 4.1vh, 2.75rem)", variant)
          : "clamp(2.2rem, 4.5vh, 2.95rem)",
      "--play-cockpit-control-icon-size":
        variant === "challenge"
          ? scaleValue("clamp(1.1rem, 2.2vh, 1.5rem)", variant)
          : "clamp(1.16rem, 2.35vh, 1.6rem)",
      "--play-cockpit-control-title":
        variant === "challenge"
          ? scaleValue("clamp(1.02rem, 0.9rem + 0.22vw, 1.14rem)", variant)
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
      "--play-cockpit-pad-x": scaleValue("clamp(0.82rem, 0.52rem + 0.85vw, 1.2rem)", variant),
      "--play-cockpit-pad-y": scaleValue("clamp(0.66rem, 0.36rem + 0.95vh, 1.05rem)", variant),
      "--play-cockpit-gap": scaleValue("clamp(0.56rem, 0.38rem + 0.55vw, 0.95rem)", variant),
      "--play-cockpit-header-pad-y": scaleValue("clamp(0.44rem, 0.24rem + 0.7vh, 0.8rem)", variant),
      "--play-cockpit-header-pad-x": scaleValue("clamp(0.82rem, 0.52rem + 0.8vw, 1.18rem)", variant),
      "--play-cockpit-dock-height": scaleValue("clamp(9.4rem, 19.6vh, 12.8rem)", variant),
      "--play-cockpit-rail-width": scaleValue("clamp(16.5rem, 18.5vw, 22.5rem)", variant),
      "--play-cockpit-dock-main": "minmax(0, 1.82fr)",
      "--play-cockpit-dock-side": "minmax(0, 1fr)",
      "--play-cockpit-bottom-safe": "max(1rem, env(safe-area-inset-bottom))",
      "--play-cockpit-control-min-h": scaleValue("clamp(4.6rem, 8.8vh, 6rem)", variant),
      "--play-cockpit-control-icon-box": scaleValue("clamp(2.5rem, 5.6vh, 3.4rem)", variant),
      "--play-cockpit-control-icon-size": scaleValue("clamp(1.35rem, 2.85vh, 1.95rem)", variant),
      "--play-cockpit-control-title": scaleValue("clamp(1rem, 0.82rem + 0.4vw, 1.16rem)", variant),
      "--play-cockpit-control-hint-display": "block",
      "--play-cockpit-ai-note-display": "inline-flex",
      "--play-cockpit-ai-summary-display": "block",
      "--play-cockpit-ai-detail-display": "block",
    } as CSSProperties;
  }

  return {
    ...styleBase,
    "--play-cockpit-pad-x": scaleValue("clamp(0.7rem, 0.45rem + 0.7vw, 1rem)", variant),
    "--play-cockpit-pad-y": scaleValue("clamp(0.6rem, 0.3rem + 0.85vh, 1rem)", variant),
    "--play-cockpit-gap": scaleValue("clamp(0.5rem, 0.35rem + 0.5vw, 0.9rem)", variant),
    "--play-cockpit-header-pad-y": scaleValue("clamp(0.4rem, 0.2rem + 0.65vh, 0.75rem)", variant),
    "--play-cockpit-header-pad-x": scaleValue("clamp(0.7rem, 0.45rem + 0.7vw, 1rem)", variant),
    "--play-cockpit-dock-height":
      variant === "challenge"
        ? scaleValue("clamp(9rem, 18.8vh, 11.8rem)", variant)
        : "clamp(7.75rem, 17.5vh, 11rem)",
    "--play-cockpit-rail-width":
      variant === "challenge"
        ? `max(13.75rem, ${scaleValue("clamp(15rem, 18vw, 20rem)", variant)})`
        : "clamp(16rem, 18vw, 22rem)",
    "--play-cockpit-dock-main": "minmax(0, 1.8fr)",
    "--play-cockpit-dock-side": "minmax(0, 1fr)",
    "--play-cockpit-bottom-safe": "max(1rem, env(safe-area-inset-bottom))",
    "--play-cockpit-control-min-h":
      variant === "challenge"
        ? scaleValue("clamp(4.55rem, 8.4vh, 5.55rem)", variant)
        : "clamp(4.6rem, 10.5vh, 5.9rem)",
    "--play-cockpit-control-icon-box":
      variant === "challenge"
        ? scaleValue("clamp(2.3rem, 5.2vh, 3.05rem)", variant)
        : "clamp(2.55rem, 6.2vh, 3.5rem)",
    "--play-cockpit-control-icon-size":
      variant === "challenge"
        ? scaleValue("clamp(1.28rem, 2.8vh, 1.8rem)", variant)
        : "clamp(1.45rem, 3.5vh, 2rem)",
    "--play-cockpit-control-title":
      variant === "challenge"
        ? scaleValue("clamp(1.04rem, 0.9rem + 0.24vw, 1.18rem)", variant)
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
      const nextRect = node.getBoundingClientRect();
      const nextWidth = Math.round(nextRect.width);
      const nextHeight = Math.round(nextRect.height);
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

  const scale = useMemo(() => getCockpitScale(size.width, size.height, variant), [size.height, size.width, variant]);
  const density = useMemo(() => getCockpitDensity(scale, variant), [scale, variant]);
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
      const nextRect = node.getBoundingClientRect();
      const nextWidth = Math.round(nextRect.width);
      const nextHeight = Math.round(nextRect.height);
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
