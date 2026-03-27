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
      <div className="flex items-center justify-between gap-[clamp(0.35rem,0.2rem+0.35vw,0.55rem)]">
        <p className="play-shell-heading text-[clamp(0.72rem,0.62rem+0.2vw,0.9rem)] font-semibold uppercase tracking-[0.18em]">{title}</p>
        {footer && <div className="play-shell-text-muted text-[clamp(0.62rem,0.55rem+0.14vw,0.75rem)]">{footer}</div>}
      </div>

      <div className={`grid gap-[clamp(0.35rem,0.2rem+0.35vw,0.6rem)] sm:grid-cols-3 ${isChallenge ? "mt-[clamp(0.4rem,0.25rem+0.5vh,0.8rem)] items-start" : "mt-[clamp(0.45rem,0.28rem+0.55vh,0.9rem)]"}`}>
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
                isChallenge ? "min-h-[clamp(4.6rem,10.5vh,5.9rem)] self-start" : "h-full"
              }`}
              style={
                isChallenge
                  ? {
                      paddingTop: "clamp(0.55rem, 0.3rem + 0.75vh, 0.8rem)",
                      paddingBottom: "clamp(0.55rem, 0.3rem + 0.75vh, 0.8rem)",
                      paddingLeft: "clamp(0.7rem, 0.45rem + 0.6vw, 0.95rem)",
                      paddingRight: "clamp(0.7rem, 0.45rem + 0.6vw, 0.95rem)",
                    }
                  : {
                      paddingTop: "clamp(0.5rem, 0.3rem + 0.45vh, 0.625rem)",
                      paddingBottom: "clamp(0.5rem, 0.3rem + 0.45vh, 0.625rem)",
                    }
              }
            >
              <div className="flex items-center justify-between gap-[clamp(0.35rem,0.2rem+0.35vw,0.55rem)]">
                <div className="flex items-center gap-[clamp(0.45rem,0.25rem+0.45vw,0.75rem)]">
                  <div
                    className={`flex items-center justify-center rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface-card)] ${
                      isChallenge ? "h-[clamp(2.55rem,6.2vh,3.5rem)] w-[clamp(2.55rem,6.2vh,3.5rem)]" : "h-[clamp(2.2rem,4.5vh,2.75rem)] w-[clamp(2.2rem,4.5vh,2.75rem)]"
                    }`}
                  >
                    <MoveIcon move={option.move} size={isChallenge ? "clamp(1.45rem,3.5vh,2rem)" : "clamp(1.2rem,2.8vh,1.6rem)"} title={option.label} />
                  </div>
                  <div>
                    <div className={`${isChallenge ? "text-[clamp(0.95rem,0.72rem+0.55vw,1.15rem)]" : "text-[clamp(0.88rem,0.7rem+0.42vw,1rem)]"} font-semibold tracking-[-0.03em]`}>
                      {option.label}
                    </div>
                    <div className="play-shell-text-muted text-[clamp(0.54rem,0.48rem+0.16vw,0.68rem)] uppercase tracking-[0.16em]">
                      {option.hotkey ? `Key ${option.hotkey}` : "Tap"}
                    </div>
                  </div>
                </div>
                {isSelected && (
                  <span className="rounded-full border border-[color:var(--app-border-strong)] bg-[color:var(--app-surface-card)] px-[clamp(0.4rem,0.3rem+0.25vw,0.55rem)] py-[clamp(0.2rem,0.15rem+0.12vw,0.32rem)] text-[clamp(0.52rem,0.46rem+0.14vw,0.64rem)] font-semibold uppercase tracking-[0.16em]">
                    Locked
                  </span>
                )}
              </div>
              {option.hint && <p className="play-shell-text-muted mt-[clamp(0.3rem,0.18rem+0.3vh,0.45rem)] hidden text-[clamp(0.64rem,0.58rem+0.14vw,0.75rem)] min-[1100px]:block">{option.hint}</p>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
