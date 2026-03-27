import React from "react";
import type { Move } from "../../gameTypes";
import { MoveIcon } from "../../moveIcons";

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
}

const slotToneClasses: Record<NonNullable<GameArenaSlot["tone"]>, string> = {
  player: "bg-[color:color-mix(in_srgb,var(--app-surface-card)_88%,transparent)]",
  ai: "bg-[color:color-mix(in_srgb,var(--app-surface-subtle)_82%,transparent)]",
};

function ArenaEdgeSlot({ slot }: { slot: GameArenaSlot }) {
  const tone = slot.tone ?? "player";
  const placeholder = slot.placeholder ?? "Pending";

  return (
    <div
      className={`flex min-h-0 flex-col justify-between px-[clamp(0.55rem,0.35rem+0.55vw,0.95rem)] py-[clamp(0.55rem,0.3rem+0.8vh,0.95rem)] ${slotToneClasses[tone]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="play-shell-eyebrow text-[clamp(0.54rem,0.46rem+0.16vw,0.64rem)] font-semibold uppercase tracking-[0.18em]">
          {slot.label}
        </span>
        {slot.meta && (
          <span className="play-shell-text-muted text-[clamp(0.52rem,0.44rem+0.16vw,0.64rem)] font-semibold uppercase tracking-[0.16em]">
            {slot.meta}
          </span>
        )}
      </div>

      <div className="mt-[clamp(0.45rem,0.25rem+0.55vh,0.85rem)] flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.45rem,0.22rem+0.7vh,0.85rem)] text-center">
        <div className="flex h-[clamp(3rem,7.5vh,5rem)] w-[clamp(3rem,7.5vh,5rem)] items-center justify-center rounded-[clamp(0.9rem,0.7rem+0.55vw,1.25rem)] border border-[color:var(--app-border)] bg-[color:var(--app-surface-input)]">
          {slot.move ? (
            <MoveIcon move={slot.move} size="clamp(1.7rem,4vw,3rem)" title={slot.title} />
          ) : (
            <span className="play-shell-text-muted text-[clamp(0.52rem,0.45rem+0.14vw,0.62rem)] font-semibold uppercase tracking-[0.18em]">
              {placeholder}
            </span>
          )}
        </div>
        <div>
          <p className="play-shell-heading text-[clamp(0.9rem,0.72rem+0.45vw,1.1rem)] font-semibold tracking-[-0.03em]">{slot.title}</p>
          {slot.detail && <p className="play-shell-text-muted mt-[clamp(0.15rem,0.05rem+0.18vh,0.3rem)] text-[clamp(0.68rem,0.6rem+0.18vw,0.82rem)] md:text-[clamp(0.7rem,0.62rem+0.22vw,0.9rem)]">{slot.detail}</p>}
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
}: GameArenaProps) {
  const isStrongCenter = centerEmphasis === "strong";

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:color-mix(in_srgb,var(--app-surface-card)_74%,transparent)]">
      <div className="flex flex-wrap items-center justify-between gap-[clamp(0.35rem,0.25rem+0.35vw,0.6rem)] border-b border-[color:var(--app-border)] px-[clamp(0.2rem,0.15rem+0.18vw,0.4rem)] pb-[clamp(0.45rem,0.25rem+0.55vh,0.8rem)]">
        <div>
          <p className="play-shell-heading text-[clamp(0.95rem,0.75rem+0.42vw,1.15rem)] font-semibold tracking-[-0.04em]">{title}</p>
          {subtitle && <p className="play-shell-text-muted mt-[clamp(0.12rem,0.06rem+0.12vh,0.25rem)] text-[clamp(0.66rem,0.58rem+0.16vw,0.86rem)]">{subtitle}</p>}
        </div>
        {centerBadge && (
          <span className="rounded-full border border-[color:var(--app-border-strong)] bg-[color:var(--app-accent-soft)] px-[clamp(0.55rem,0.42rem+0.35vw,0.75rem)] py-[clamp(0.25rem,0.18rem+0.15vw,0.38rem)] text-[clamp(0.54rem,0.48rem+0.16vw,0.68rem)] font-semibold uppercase tracking-[0.18em] text-[color:var(--app-accent-strong)]">
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
          <ArenaEdgeSlot slot={leftSlot} />
        </div>

        <div className="relative flex min-h-0 flex-col items-center justify-center overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--app-accent-soft)_52%,transparent),color-mix(in_srgb,var(--app-surface-card)_88%,transparent))] px-[clamp(0.7rem,0.4rem+0.85vw,1rem)] py-[clamp(0.7rem,0.3rem+1vh,1rem)] text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              backgroundImage:
                "radial-gradient(circle at center, color-mix(in srgb, var(--app-accent-muted) 52%, transparent), transparent 42%)",
            }}
          />

          <div className="relative flex flex-col items-center gap-[clamp(0.45rem,0.22rem+0.7vh,0.9rem)]">
            <span className="text-[clamp(0.56rem,0.48rem+0.18vw,0.68rem)] font-semibold uppercase tracking-[0.2em] text-[color:var(--app-accent-strong)]">
              {centerLabel}
            </span>
            <div className="max-w-[min(18rem,100%)] flex flex-col items-center gap-[clamp(0.45rem,0.22rem+0.7vh,0.9rem)]">
              <div
                className={`flex items-center justify-center rounded-full border border-[color:var(--app-border-strong)] bg-[color:color-mix(in_srgb,var(--app-surface-card)_92%,transparent)] text-[color:var(--app-accent-strong)] ${
                  isStrongCenter
                    ? "h-[clamp(4.8rem,10vh,7rem)] w-[clamp(4.8rem,10vh,7rem)] text-[clamp(1.1rem,0.8rem+1vw,2rem)] shadow-[0_0_0_clamp(0.25rem,1.2vw,0.65rem)_color-mix(in_srgb,var(--app-accent-soft)_40%,transparent)]"
                    : "h-[clamp(4.1rem,8.6vh,6rem)] w-[clamp(4.1rem,8.6vh,6rem)] text-[clamp(0.95rem,0.72rem+0.8vw,1.6rem)] shadow-[0_0_0_clamp(0.16rem,0.7vw,0.32rem)_color-mix(in_srgb,var(--app-accent-soft)_34%,transparent)]"
                }`}
              >
                VS
              </div>
              <p className={`play-shell-heading font-semibold tracking-[-0.04em] ${isStrongCenter ? "text-[clamp(1.2rem,0.8rem+1.15vw,2.1rem)]" : "text-[clamp(1rem,0.76rem+0.9vw,1.6rem)]"}`}>
                {centerTitle}
              </p>
              {centerDetail && (
                <p className={`play-shell-text-muted max-[900px]:line-clamp-2 ${isStrongCenter ? "mt-[clamp(0.12rem,0.06rem+0.18vh,0.28rem)] text-[clamp(0.82rem,0.68rem+0.42vw,1.05rem)]" : "mt-[clamp(0.18rem,0.1rem+0.22vh,0.35rem)] text-[clamp(0.76rem,0.64rem+0.3vw,0.95rem)]"}`}>
                  {centerDetail}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="border-l border-[color:var(--app-border)]">
          <ArenaEdgeSlot slot={rightSlot} />
        </div>
      </div>

      {footer && <div className="px-1 pt-2 text-sm">{footer}</div>}
    </section>
  );
}
