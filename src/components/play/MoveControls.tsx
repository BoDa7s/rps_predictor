import React from "react";
import type { Move } from "../../gameTypes";
import { MoveIcon } from "../../moveIcons";

export interface MoveControlOption {
  id: string;
  label: string;
  move: Move;
  hint?: string;
  hotkey?: string;
  selected?: boolean;
  disabled?: boolean;
}

interface MoveControlsProps {
  title?: string;
  options: MoveControlOption[];
  footer?: React.ReactNode;
  onSelect?: (option: MoveControlOption) => void;
  variant?: "default" | "challenge";
}

export default function MoveControls({
  title = "Moves",
  options,
  footer,
  onSelect,
  variant = "default",
}: MoveControlsProps) {
  const isChallenge = variant === "challenge";

  return (
    <section className="flex h-full flex-col justify-start">
      <div className="flex items-center justify-between gap-2">
        <p className="play-shell-heading text-sm font-semibold uppercase tracking-[0.18em]">{title}</p>
        {footer && <div className="play-shell-text-muted text-xs">{footer}</div>}
      </div>

      <div className={`grid gap-2 sm:grid-cols-3 ${isChallenge ? "mt-2.5 items-start" : "mt-3"}`}>
        {options.map(option => {
          const isSelected = Boolean(option.selected);

          return (
            <button
              key={option.id}
              type="button"
              disabled={option.disabled}
              aria-pressed={isSelected}
              onClick={() => onSelect?.(option)}
              className={`rounded-[1rem] border px-3 text-left transition ${
                isSelected
                  ? isChallenge
                    ? "border-[color:var(--app-accent-strong)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--app-accent-soft)_88%,var(--app-surface-card)),color-mix(in_srgb,var(--app-accent-muted)_52%,var(--app-surface-card)))] text-[color:var(--app-accent-strong)] shadow-[0_10px_30px_color-mix(in_srgb,var(--app-accent)_18%,transparent)]"
                    : "border-[color:var(--app-accent-strong)] bg-[color:var(--app-accent-soft)] text-[color:var(--app-accent-strong)]"
                  : isChallenge
                    ? "border-[color:var(--app-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--app-surface-card)_96%,transparent),color-mix(in_srgb,var(--app-surface-subtle)_72%,transparent))] text-[color:var(--app-text-primary)] hover:border-[color:var(--app-border-strong)] hover:bg-[color:var(--app-surface-hover)]"
                    : "border-[color:var(--app-border)] bg-[color:var(--app-surface-card)] text-[color:var(--app-text-primary)] hover:border-[color:var(--app-border-strong)] hover:bg-[color:var(--app-surface-hover)]"
              } disabled:cursor-not-allowed disabled:opacity-65 ${
                isChallenge ? "min-h-[5.9rem] self-start" : "h-full"
              }`}
              style={isChallenge ? { paddingTop: "0.8rem", paddingBottom: "0.8rem" } : { paddingTop: "0.625rem", paddingBottom: "0.625rem" }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex items-center justify-center rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface-card)] ${
                      isChallenge ? "h-14 w-14" : "h-11 w-11"
                    }`}
                  >
                    <MoveIcon move={option.move} size={isChallenge ? 32 : 26} title={option.label} />
                  </div>
                  <div>
                    <div className={`${isChallenge ? "text-lg" : "text-base"} font-semibold tracking-[-0.03em]`}>
                      {option.label}
                    </div>
                    <div className="play-shell-text-muted text-[0.68rem] uppercase tracking-[0.16em]">
                      {option.hotkey ? `Key ${option.hotkey}` : "Tap"}
                    </div>
                  </div>
                </div>
                {isSelected && (
                  <span className="rounded-full border border-[color:var(--app-border-strong)] bg-[color:var(--app-surface-card)] px-2 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.16em]">
                    Locked
                  </span>
                )}
              </div>
              {option.hint && <p className="play-shell-text-muted mt-2 hidden text-xs sm:block">{option.hint}</p>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
