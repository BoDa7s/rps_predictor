import React from "react";

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
  statColumns?: 2 | 4;
  compact?: boolean;
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
}: GameHudHeaderProps) {
  const centered = alignment === "center";

  return (
    <header className={`flex min-w-0 flex-col ${compact ? "gap-1.5" : "gap-2"}`}>
      <div
        className={`flex min-w-0 flex-col ${compact ? "gap-1.5" : "gap-2"} ${
          centered ? "xl:grid xl:grid-cols-[1fr_auto_1fr] xl:items-center" : "xl:flex-row xl:items-center xl:justify-between"
        }`}
      >
        <div className={`min-w-0 ${centered ? "text-center xl:col-start-2" : ""}`}>
          <div className={`flex flex-wrap items-center gap-2 ${centered ? "justify-center" : ""}`}>
            {eyebrow && (
              <p className="play-shell-eyebrow text-[0.68rem] font-semibold uppercase tracking-[0.24em]">
                {eyebrow}
              </p>
            )}
            {badge && (
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${toneClasses[badgeTone]}`}
              >
                {badge}
              </span>
            )}
          </div>
          <div className={`mt-0.5 flex flex-wrap items-end gap-x-3 gap-y-1 ${centered ? "justify-center" : ""}`}>
            <h1 className={`play-shell-heading font-semibold tracking-[-0.05em] ${compact ? "text-[1.6rem] sm:text-[1.75rem]" : "text-2xl sm:text-[1.75rem]"}`}>
              {title}
            </h1>
            {subtitle && <p className="play-shell-text-muted text-sm">{subtitle}</p>}
          </div>
        </div>

        {actions && (
          <div className={`flex shrink-0 flex-wrap items-center gap-2 ${centered ? "xl:col-start-3 xl:justify-self-end" : ""}`}>
            {actions}
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <div
          className={`grid gap-px overflow-hidden rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-border)] ${
            statColumns === 2 ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"
          }`}
        >
          {stats.map(stat => (
            <div
              key={`${stat.label}-${stat.value}`}
              className={`flex items-center justify-between gap-3 bg-[color:var(--app-surface-card)] px-3 ${compact ? "py-2" : "py-2.5"} text-sm ${toneClasses[stat.tone ?? "default"]}`}
            >
              <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] opacity-80">
                {stat.label}
              </span>
              <span className="font-semibold tracking-[-0.02em]">{stat.value}</span>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
