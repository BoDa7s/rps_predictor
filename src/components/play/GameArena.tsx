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
      className={`flex min-h-0 flex-col justify-between px-3 py-3 sm:px-4 ${slotToneClasses[tone]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="play-shell-eyebrow text-[0.64rem] font-semibold uppercase tracking-[0.18em]">
          {slot.label}
        </span>
        {slot.meta && (
          <span className="play-shell-text-muted text-[0.64rem] font-semibold uppercase tracking-[0.16em]">
            {slot.meta}
          </span>
        )}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-[1.25rem] border border-[color:var(--app-border)] bg-[color:var(--app-surface-input)] sm:h-20 sm:w-20">
          {slot.move ? (
            <MoveIcon move={slot.move} size="clamp(2.25rem,5vw,3.5rem)" title={slot.title} />
          ) : (
            <span className="play-shell-text-muted text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
              {placeholder}
            </span>
          )}
        </div>
        <div>
          <p className="play-shell-heading text-base font-semibold tracking-[-0.03em] sm:text-lg">{slot.title}</p>
          {slot.detail && <p className="play-shell-text-muted mt-1 text-xs sm:text-sm">{slot.detail}</p>}
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--app-border)] px-1 pb-3">
        <div>
          <p className="play-shell-heading text-base font-semibold tracking-[-0.04em] sm:text-lg">{title}</p>
          {subtitle && <p className="play-shell-text-muted mt-0.5 text-xs sm:text-sm">{subtitle}</p>}
        </div>
        {centerBadge && (
          <span className="rounded-full border border-[color:var(--app-border-strong)] bg-[color:var(--app-accent-soft)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--app-accent-strong)]">
            {centerBadge}
          </span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-0 border-y border-[color:var(--app-border)] [grid-template-columns:minmax(5.5rem,0.72fr)_minmax(0,1.2fr)_minmax(5.5rem,0.72fr)] sm:[grid-template-columns:minmax(7rem,0.8fr)_minmax(0,1.25fr)_minmax(7rem,0.8fr)]">
        <div className="border-r border-[color:var(--app-border)]">
          <ArenaEdgeSlot slot={leftSlot} />
        </div>

        <div className="relative flex min-h-0 flex-col items-center justify-center overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--app-accent-soft)_52%,transparent),color-mix(in_srgb,var(--app-surface-card)_88%,transparent))] px-4 py-4 text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              backgroundImage:
                "radial-gradient(circle at center, color-mix(in srgb, var(--app-accent-muted) 52%, transparent), transparent 42%)",
            }}
          />

          <div className="relative flex flex-col items-center gap-3">
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--app-accent-strong)]">
              {centerLabel}
            </span>
            <div className="max-w-[18rem] flex flex-col items-center gap-3">
              <div
                className={`flex items-center justify-center rounded-full border border-[color:var(--app-border-strong)] bg-[color:color-mix(in_srgb,var(--app-surface-card)_92%,transparent)] text-[color:var(--app-accent-strong)] ${
                  isStrongCenter
                    ? "h-24 w-24 text-2xl shadow-[0_0_0_10px_color-mix(in_srgb,var(--app-accent-soft)_40%,transparent)] sm:h-28 sm:w-28 sm:text-[2rem]"
                    : "h-20 w-20 text-xl shadow-[0_0_0_4px_color-mix(in_srgb,var(--app-accent-soft)_34%,transparent)] sm:h-24 sm:w-24 sm:text-2xl"
                }`}
              >
                VS
              </div>
              <p className={`play-shell-heading font-semibold tracking-[-0.04em] ${isStrongCenter ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"}`}>
                {centerTitle}
              </p>
              {centerDetail && (
                <p className={`play-shell-text-muted ${isStrongCenter ? "mt-1 text-base sm:text-lg" : "mt-2 text-sm sm:text-base"}`}>
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
