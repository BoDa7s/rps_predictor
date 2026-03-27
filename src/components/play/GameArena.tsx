import React from "react";
import type { Move } from "../../gameTypes";
import { MoveIcon } from "../../moveIcons";
import type { CockpitDensity } from "./cockpitViewport";

export interface GameArenaSlot {
  label: string;
  title: string;
  detail?: string;
  move?: Move;
  placeholder?: string;
  tone?: "player" | "ai";
  meta?: string;
}

interface GameArenaProps {
  title: string;
  subtitle?: string;
  leftSlot: GameArenaSlot;
  rightSlot: GameArenaSlot;
  centerLabel: string;
  centerTitle: string;
  centerDetail?: string;
  centerBadge?: string;
  footer?: React.ReactNode;
  centerEmphasis?: "default" | "strong";
  density?: CockpitDensity;
  scale?: number;
  testIdPrefix?: string;
}

const slotToneClasses: Record<NonNullable<GameArenaSlot["tone"]>, string> = {
  player: "bg-[color:color-mix(in_srgb,var(--app-surface-card)_88%,transparent)]",
  ai: "bg-[color:color-mix(in_srgb,var(--app-surface-subtle)_82%,transparent)]",
};

function getArenaSizing(density: CockpitDensity, scale: number) {
  const resolvedScale = density === "tight" ? Math.max(scale, 0.95) : scale;

  if (density === "tight") {
    return { slotIconBoxRem: 2.35 * resolvedScale, centerRingRem: 4.25 * resolvedScale, centerRingTextRem: 0.98 * resolvedScale, centerTitleRem: 1.38 * resolvedScale, centerDetailRem: 0.82 * resolvedScale };
  }

  if (density === "compact") {
    return { slotIconBoxRem: 2.75 * resolvedScale, centerRingRem: 5.35 * resolvedScale, centerRingTextRem: 1.22 * resolvedScale, centerTitleRem: 1.68 * resolvedScale, centerDetailRem: 0.96 * resolvedScale };
  }

  if (density === "expanded") {
    return { slotIconBoxRem: 3.7 * resolvedScale, centerRingRem: 6.8 * resolvedScale, centerRingTextRem: 1.92 * resolvedScale, centerTitleRem: 2.35 * resolvedScale, centerDetailRem: 1.08 * resolvedScale };
  }

  return { slotIconBoxRem: 3.2 * resolvedScale, centerRingRem: 5.65 * resolvedScale, centerRingTextRem: 1.54 * resolvedScale, centerTitleRem: 1.92 * resolvedScale, centerDetailRem: 1 * resolvedScale };
}

function ArenaEdgeSlot({
  slot,
  density,
  scale,
  testId,
}: {
  slot: GameArenaSlot;
  density: CockpitDensity;
  scale: number;
  testId?: string;
}) {
  const tone = slot.tone ?? "player";
  const placeholder = slot.placeholder ?? "Pending";
  const isCompactDensity = density !== "normal" && density !== "expanded";
  const isTightDensity = density === "tight";
  const sizing = getArenaSizing(density, scale);

  return (
    <div
      data-testid={testId}
      className={`flex h-full min-h-0 flex-col justify-between ${isTightDensity ? "px-[clamp(0.38rem,0.24rem+0.2vw,0.52rem)] py-[clamp(0.32rem,0.18rem+0.2vh,0.45rem)]" : isCompactDensity ? "px-[clamp(0.45rem,0.28rem+0.26vw,0.62rem)] py-[clamp(0.38rem,0.22rem+0.24vh,0.56rem)]" : "px-[clamp(0.55rem,0.35rem+0.55vw,0.95rem)] py-[clamp(0.55rem,0.3rem+0.8vh,0.95rem)]"} ${slotToneClasses[tone]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`play-shell-eyebrow font-semibold uppercase tracking-[0.18em] ${isTightDensity ? "text-[clamp(0.46rem,0.42rem+0.1vw,0.54rem)]" : "text-[clamp(0.54rem,0.46rem+0.16vw,0.64rem)]"}`}>
          {slot.label}
        </span>
        {slot.meta && (
          <span className={`play-shell-text-muted font-semibold uppercase tracking-[0.16em] ${isTightDensity ? "text-[clamp(0.44rem,0.4rem+0.1vw,0.52rem)]" : "text-[clamp(0.52rem,0.44rem+0.16vw,0.64rem)]"}`}>
            {slot.meta}
          </span>
        )}
      </div>

      <div className={`mt-[clamp(0.28rem,0.16rem+0.18vh,0.5rem)] flex min-h-0 flex-1 flex-col items-center justify-center text-center ${isTightDensity ? "gap-[clamp(0.24rem,0.14rem+0.14vh,0.36rem)]" : isCompactDensity ? "gap-[clamp(0.3rem,0.16rem+0.18vh,0.46rem)]" : "gap-[clamp(0.45rem,0.22rem+0.7vh,0.85rem)]"}`}>
        <div
          className="flex h-[var(--play-cockpit-arena-slot-icon-box)] w-[var(--play-cockpit-arena-slot-icon-box)] items-center justify-center rounded-[clamp(0.9rem,0.7rem+0.55vw,1.25rem)] border border-[color:var(--app-border)] bg-[color:var(--app-surface-input)]"
          style={{ height: `${sizing.slotIconBoxRem}rem`, width: `${sizing.slotIconBoxRem}rem` }}
        >
          {slot.move ? (
            <MoveIcon move={slot.move} size="var(--play-cockpit-arena-slot-icon-size)" title={slot.title} />
          ) : (
            <span className={`play-shell-text-muted font-semibold uppercase tracking-[0.18em] ${isTightDensity ? "text-[clamp(0.42rem,0.4rem+0.08vw,0.5rem)]" : "text-[clamp(0.52rem,0.45rem+0.14vw,0.62rem)]"}`}>
              {placeholder}
            </span>
          )}
        </div>
        <div>
          <p className={`play-shell-heading font-semibold tracking-[-0.03em] ${isTightDensity ? "text-[clamp(0.74rem,0.66rem+0.18vw,0.84rem)]" : isCompactDensity ? "text-[clamp(0.82rem,0.72rem+0.22vw,0.94rem)]" : "text-[clamp(0.9rem,0.72rem+0.45vw,1.1rem)]"}`}>{slot.title}</p>
          {slot.detail && <p className={`play-shell-text-muted mt-[clamp(0.12rem,0.06rem+0.08vh,0.18rem)] ${isTightDensity ? "text-[clamp(0.56rem,0.52rem+0.1vw,0.64rem)] line-clamp-2" : isCompactDensity ? "text-[clamp(0.62rem,0.56rem+0.14vw,0.74rem)] line-clamp-2" : "text-[clamp(0.68rem,0.6rem+0.18vw,0.82rem)] md:text-[clamp(0.7rem,0.62rem+0.22vw,0.9rem)]"}`}>{slot.detail}</p>}
        </div>
      </div>
    </div>
  );
}

export default function GameArena({
  title,
  subtitle,
  leftSlot,
  rightSlot,
  centerLabel,
  centerTitle,
  centerDetail,
  centerBadge,
  footer,
  centerEmphasis = "default",
  density = "normal",
  scale = 1,
  testIdPrefix,
}: GameArenaProps) {
  const isStrongCenter = centerEmphasis === "strong";
  const isCompactDensity = density !== "normal" && density !== "expanded";
  const isTightDensity = density === "tight";
  const sizing = getArenaSizing(density, scale);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:color-mix(in_srgb,var(--app-surface-card)_74%,transparent)]">
      <div className={`flex flex-wrap items-center justify-between gap-[clamp(0.35rem,0.25rem+0.35vw,0.6rem)] border-b border-[color:var(--app-border)] px-[clamp(0.2rem,0.15rem+0.18vw,0.4rem)] ${isTightDensity ? "pb-[clamp(0.22rem,0.14rem+0.16vh,0.32rem)]" : isCompactDensity ? "pb-[clamp(0.28rem,0.16rem+0.2vh,0.42rem)]" : "pb-[clamp(0.45rem,0.25rem+0.55vh,0.8rem)]"}`}>
        <div>
          <p className={`play-shell-heading font-semibold tracking-[-0.04em] ${isTightDensity ? "text-[clamp(0.82rem,0.72rem+0.22vw,0.94rem)]" : isCompactDensity ? "text-[clamp(0.9rem,0.78rem+0.26vw,1.02rem)]" : "text-[clamp(0.95rem,0.75rem+0.42vw,1.15rem)]"}`}>{title}</p>
          {subtitle && <p className={`play-shell-text-muted mt-[clamp(0.08rem,0.04rem+0.06vh,0.14rem)] ${isTightDensity ? "text-[clamp(0.56rem,0.52rem+0.1vw,0.66rem)]" : "text-[clamp(0.66rem,0.58rem+0.16vw,0.86rem)]"}`}>{subtitle}</p>}
        </div>
        {centerBadge && (
          <span className={`rounded-full border border-[color:var(--app-border-strong)] bg-[color:var(--app-accent-soft)] font-semibold uppercase tracking-[0.18em] text-[color:var(--app-accent-strong)] ${isTightDensity ? "px-[clamp(0.4rem,0.28rem+0.2vw,0.52rem)] py-[clamp(0.16rem,0.1rem+0.08vw,0.24rem)] text-[clamp(0.46rem,0.42rem+0.1vw,0.56rem)]" : "px-[clamp(0.55rem,0.42rem+0.35vw,0.75rem)] py-[clamp(0.25rem,0.18rem+0.15vw,0.38rem)] text-[clamp(0.54rem,0.48rem+0.16vw,0.68rem)]"}`}>
            {centerBadge}
          </span>
        )}
      </div>

      <div
        className="grid min-h-0 flex-1 gap-0 border-y border-[color:var(--app-border)]"
        style={{
          gridTemplateColumns:
            "minmax(clamp(4.75rem, 10vw, 7rem), 0.72fr) minmax(0, 1.2fr) minmax(clamp(4.75rem, 10vw, 7rem), 0.72fr)",
        }}
      >
        <div className="border-r border-[color:var(--app-border)]">
          <ArenaEdgeSlot slot={leftSlot} density={density} scale={scale} testId={testIdPrefix ? `${testIdPrefix}-left-pane` : undefined} />
        </div>

        <div
          data-testid={testIdPrefix ? `${testIdPrefix}-center-pane` : undefined}
          className={`relative flex min-h-0 flex-col items-center justify-center overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--app-accent-soft)_52%,transparent),color-mix(in_srgb,var(--app-surface-card)_88%,transparent))] text-center ${isTightDensity ? "px-[clamp(0.4rem,0.26rem+0.24vw,0.56rem)] py-[clamp(0.38rem,0.22rem+0.22vh,0.54rem)]" : isCompactDensity ? "px-[clamp(0.5rem,0.32rem+0.32vw,0.72rem)] py-[clamp(0.46rem,0.24rem+0.26vh,0.68rem)]" : "px-[clamp(0.7rem,0.4rem+0.85vw,1rem)] py-[clamp(0.7rem,0.3rem+1vh,1rem)]"}`}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              backgroundImage:
                "radial-gradient(circle at center, color-mix(in srgb, var(--app-accent-muted) 52%, transparent), transparent 42%)",
            }}
          />

          <div className={`relative flex flex-col items-center ${isTightDensity ? "gap-[clamp(0.18rem,0.1rem+0.12vh,0.28rem)]" : isCompactDensity ? "gap-[clamp(0.26rem,0.14rem+0.18vh,0.42rem)]" : "gap-[clamp(0.45rem,0.22rem+0.7vh,0.9rem)]"}`}>
            <span className={`font-semibold uppercase tracking-[0.2em] text-[color:var(--app-accent-strong)] ${isTightDensity ? "text-[clamp(0.46rem,0.42rem+0.1vw,0.54rem)]" : "text-[clamp(0.56rem,0.48rem+0.18vw,0.68rem)]"}`}>
              {centerLabel}
            </span>
            <div className={`max-w-[min(18rem,100%)] flex flex-col items-center ${isTightDensity ? "gap-[clamp(0.18rem,0.1rem+0.12vh,0.28rem)]" : isCompactDensity ? "gap-[clamp(0.26rem,0.14rem+0.18vh,0.42rem)]" : "gap-[clamp(0.45rem,0.22rem+0.7vh,0.9rem)]"}`}>
              <div
                data-testid={testIdPrefix ? `${testIdPrefix}-center-ring` : undefined}
                style={{
                  height: `${sizing.centerRingRem}rem`,
                  width: `${sizing.centerRingRem}rem`,
                  fontSize: `${sizing.centerRingTextRem}rem`,
                }}
                className={`flex items-center justify-center rounded-full border border-[color:var(--app-border-strong)] bg-[color:color-mix(in_srgb,var(--app-surface-card)_92%,transparent)] text-[color:var(--app-accent-strong)] ${
                  isStrongCenter
                    ? isTightDensity
                      ? "h-[var(--play-cockpit-arena-center-ring)] w-[var(--play-cockpit-arena-center-ring)] text-[var(--play-cockpit-arena-center-ring-text)] shadow-[0_0_0_clamp(0.08rem,0.32vw,0.16rem)_color-mix(in_srgb,var(--app-accent-soft)_40%,transparent)]"
                      : isCompactDensity
                        ? "h-[var(--play-cockpit-arena-center-ring)] w-[var(--play-cockpit-arena-center-ring)] text-[var(--play-cockpit-arena-center-ring-text)] shadow-[0_0_0_clamp(0.12rem,0.5vw,0.26rem)_color-mix(in_srgb,var(--app-accent-soft)_40%,transparent)]"
                        : "h-[var(--play-cockpit-arena-center-ring)] w-[var(--play-cockpit-arena-center-ring)] text-[var(--play-cockpit-arena-center-ring-text)] shadow-[0_0_0_clamp(0.25rem,1.2vw,0.65rem)_color-mix(in_srgb,var(--app-accent-soft)_40%,transparent)]"
                    : isTightDensity
                      ? "h-[var(--play-cockpit-arena-center-ring)] w-[var(--play-cockpit-arena-center-ring)] text-[var(--play-cockpit-arena-center-ring-text)] shadow-[0_0_0_clamp(0.08rem,0.28vw,0.14rem)_color-mix(in_srgb,var(--app-accent-soft)_34%,transparent)]"
                      : isCompactDensity
                        ? "h-[var(--play-cockpit-arena-center-ring)] w-[var(--play-cockpit-arena-center-ring)] text-[var(--play-cockpit-arena-center-ring-text)] shadow-[0_0_0_clamp(0.1rem,0.4vw,0.2rem)_color-mix(in_srgb,var(--app-accent-soft)_34%,transparent)]"
                        : "h-[var(--play-cockpit-arena-center-ring)] w-[var(--play-cockpit-arena-center-ring)] text-[var(--play-cockpit-arena-center-ring-text)] shadow-[0_0_0_clamp(0.16rem,0.7vw,0.32rem)_color-mix(in_srgb,var(--app-accent-soft)_34%,transparent)]"
                }`}
              >
                VS
              </div>
              <p
                data-testid={testIdPrefix ? `${testIdPrefix}-center-title` : undefined}
                className="play-shell-heading font-semibold tracking-[-0.04em] text-[var(--play-cockpit-arena-center-title)]"
                style={{ fontSize: `${sizing.centerTitleRem}rem` }}
              >
                {centerTitle}
              </p>
              {centerDetail && (
                <p
                  className="play-shell-text-muted mt-[clamp(0.08rem,0.04rem+0.08vh,0.18rem)] max-[900px]:line-clamp-2 text-[var(--play-cockpit-arena-center-detail)]"
                  style={{ fontSize: `${sizing.centerDetailRem}rem` }}
                >
                  {centerDetail}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="border-l border-[color:var(--app-border)]">
          <ArenaEdgeSlot slot={rightSlot} density={density} scale={scale} testId={testIdPrefix ? `${testIdPrefix}-right-pane` : undefined} />
        </div>
      </div>

      {footer && <div className="px-1 pt-2 text-sm">{footer}</div>}
    </section>
  );
}
