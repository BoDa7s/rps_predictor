import React from "react";
import type { CockpitDensity } from "./cockpitViewport";

export type GameplayTone = "default" | "accent" | "success" | "warning" | "danger";

export interface GameHudStat {
  label: string;
  value: string;
  tone?: GameplayTone;
}

interface GameHudHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: GameplayTone;
  stats?: GameHudStat[];
  actions?: React.ReactNode;
  alignment?: "start" | "center";
  statColumns?: 2 | 3 | 4;
  compact?: boolean;
  density?: CockpitDensity;
}

const toneClasses: Record<GameplayTone, string> = {
  default:
    "border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] text-[color:var(--app-text-secondary)]",
  accent:
    "border-[color:var(--app-border-strong)] bg-[color:var(--app-accent-soft)] text-[color:var(--app-accent-strong)]",
  success: "border-emerald-300/60 bg-emerald-400/10 text-emerald-500",
  warning: "border-amber-300/60 bg-amber-400/10 text-amber-500",
  danger: "border-rose-300/60 bg-rose-400/10 text-rose-500",
};

export default function GameHudHeader({
  eyebrow,
  title,
  subtitle,
  badge,
  badgeTone = "accent",
  stats = [],
  actions,
  alignment = "start",
  statColumns = 4,
  compact = false,
  density = "normal",
}: GameHudHeaderProps) {
  const centered = alignment === "center";
  const isCompactDensity = density !== "normal";
  const isTightDensity = density === "tight";
  const headerGapClass = isTightDensity
    ? "gap-[clamp(0.22rem,0.12rem+0.2vh,0.36rem)]"
    : compact || isCompactDensity
      ? "gap-[clamp(0.32rem,0.18rem+0.32vh,0.52rem)]"
      : "gap-[clamp(0.55rem,0.3rem+0.55vh,0.85rem)]";

  return (
    <header className={`flex min-w-0 flex-col ${headerGapClass}`}>
      <div
        className={`flex min-w-0 flex-col ${headerGapClass} ${
          centered ? "xl:grid xl:grid-cols-[1fr_auto_1fr] xl:items-center" : "xl:flex-row xl:items-center xl:justify-between"
        }`}
      >
        <div className={`min-w-0 ${centered ? "text-center xl:col-start-2" : ""}`}>
          <div className={`flex flex-wrap items-center gap-[clamp(0.35rem,0.25rem+0.35vw,0.5rem)] ${centered ? "justify-center" : ""}`}>
            {eyebrow && (
              <p className={`play-shell-eyebrow font-semibold uppercase tracking-[0.24em] ${isTightDensity ? "text-[clamp(0.5rem,0.44rem+0.14vw,0.58rem)]" : "text-[clamp(0.58rem,0.5rem+0.18vw,0.68rem)]"}`}>
                {eyebrow}
              </p>
            )}
            {badge && (
              <span
                className={`inline-flex items-center rounded-full border font-semibold uppercase tracking-[0.18em] ${isTightDensity ? "px-[clamp(0.42rem,0.3rem+0.25vw,0.55rem)] py-[clamp(0.18rem,0.12rem+0.12vw,0.28rem)] text-[clamp(0.5rem,0.44rem+0.14vw,0.58rem)]" : "px-[clamp(0.55rem,0.4rem+0.35vw,0.7rem)] py-[clamp(0.3rem,0.22rem+0.18vw,0.45rem)] text-[clamp(0.58rem,0.5rem+0.18vw,0.68rem)]"} ${toneClasses[badgeTone]}`}
              >
                {badge}
              </span>
            )}
          </div>
          <div className={`mt-[clamp(0.15rem,0.05rem+0.2vh,0.35rem)] flex flex-wrap items-end gap-x-[clamp(0.45rem,0.3rem+0.45vw,0.75rem)] gap-y-[clamp(0.15rem,0.05rem+0.2vh,0.3rem)] ${centered ? "justify-center" : ""}`}>
            <h1 className={`play-shell-heading font-semibold tracking-[-0.05em] ${isTightDensity ? "text-[clamp(1rem,0.82rem+0.7vw,1.35rem)]" : compact || isCompactDensity ? "text-[clamp(1.08rem,0.86rem+0.82vw,1.55rem)]" : "text-[clamp(1.35rem,1rem+1.1vw,2rem)]"}`}>
              {title}
            </h1>
            {subtitle && <p className={`play-shell-text-muted ${isTightDensity ? "text-[clamp(0.62rem,0.56rem+0.16vw,0.74rem)]" : "text-[clamp(0.72rem,0.65rem+0.2vw,0.875rem)]"}`}>{subtitle}</p>}
          </div>
        </div>

        {actions && (
          <div className={`flex shrink-0 flex-wrap items-center gap-[clamp(0.35rem,0.25rem+0.35vw,0.5rem)] ${centered ? "xl:col-start-3 xl:justify-self-end" : ""}`}>
            {actions}
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <div
          className={`grid gap-px overflow-hidden rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-border)] ${
            statColumns === 2 ? "grid-cols-2" : statColumns === 3 ? "grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4"
          }`}
        >
          {stats.map(stat => (
            <div
              key={`${stat.label}-${stat.value}`}
              className={`flex items-center justify-between gap-[clamp(0.35rem,0.2rem+0.25vw,0.75rem)] bg-[color:var(--app-surface-card)] ${isTightDensity ? "px-[clamp(0.42rem,0.3rem+0.28vw,0.56rem)] py-[clamp(0.28rem,0.16rem+0.22vh,0.38rem)] text-[clamp(0.64rem,0.58rem+0.18vw,0.76rem)]" : compact || isCompactDensity ? "px-[clamp(0.48rem,0.34rem+0.34vw,0.65rem)] py-[clamp(0.34rem,0.18rem+0.28vh,0.48rem)] text-[clamp(0.68rem,0.61rem+0.18vw,0.82rem)]" : "px-[clamp(0.55rem,0.4rem+0.5vw,0.75rem)] py-[clamp(0.55rem,0.28rem+0.55vh,0.8rem)] text-[clamp(0.72rem,0.65rem+0.22vw,0.9rem)]"} ${toneClasses[stat.tone ?? "default"]}`}
            >
              <span className={`font-semibold uppercase tracking-[0.18em] opacity-80 ${isTightDensity ? "text-[clamp(0.48rem,0.44rem+0.12vw,0.56rem)]" : "text-[clamp(0.55rem,0.48rem+0.18vw,0.64rem)]"}`}>
                {stat.label}
              </span>
              <span className={`font-semibold tracking-[-0.02em] ${isTightDensity ? "text-[clamp(0.7rem,0.62rem+0.18vw,0.82rem)]" : "text-[clamp(0.78rem,0.68rem+0.25vw,0.95rem)]"}`}>{stat.value}</span>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
