import React from "react";
import type { Move } from "../../gameTypes";
import { MoveIcon } from "../../moveIcons";
import type { CockpitDensity } from "./cockpitViewport";

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
  density?: CockpitDensity;
  testIdPrefix?: string;
}

export default function MoveControls({
  title = "Moves",
  options,
  footer,
  onSelect,
  variant = "default",
  density = "normal",
  testIdPrefix,
}: MoveControlsProps) {
  const isChallenge = variant === "challenge";
  const isCompactDensity = density !== "normal" && density !== "expanded";
  const isTightDensity = density === "tight";
  const showFooter = footer && (!isChallenge || density === "normal" || density === "expanded");

  return (
    <section className="flex h-full flex-col justify-start">
      <div className="flex items-center justify-between gap-[clamp(0.28rem,0.16rem+0.28vw,0.44rem)]">
        <p className={`play-shell-heading font-semibold uppercase tracking-[0.18em] ${isTightDensity ? "text-[clamp(0.64rem,0.58rem+0.14vw,0.78rem)]" : "text-[clamp(0.72rem,0.62rem+0.2vw,0.9rem)]"}`}>{title}</p>
        {showFooter && <div className={`play-shell-text-muted ${isTightDensity ? "text-[clamp(0.56rem,0.52rem+0.1vw,0.66rem)]" : "text-[clamp(0.62rem,0.55rem+0.14vw,0.75rem)]"}`}>{footer}</div>}
      </div>

      <div className={`grid ${isChallenge ? "gap-[clamp(0.18rem,0.12rem+0.18vw,0.34rem)]" : "gap-[clamp(0.28rem,0.16rem+0.24vw,0.5rem)]"} sm:grid-cols-3 ${isChallenge ? (isTightDensity ? "mt-[clamp(0.16rem,0.1rem+0.1vh,0.26rem)] items-start" : isCompactDensity ? "mt-[clamp(0.2rem,0.12rem+0.14vh,0.32rem)] items-start" : "mt-[clamp(0.28rem,0.16rem+0.24vh,0.46rem)] items-start") : "mt-[clamp(0.45rem,0.28rem+0.55vh,0.9rem)]"}`}>
        {options.map(option => {
          const isSelected = Boolean(option.selected);

          return (
            <button
              key={option.id}
              data-testid={testIdPrefix ? `${testIdPrefix}-option-${option.id}` : undefined}
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
                isChallenge ? "min-h-[var(--play-cockpit-control-min-h)] self-start" : "h-full"
              }`}
              style={
                isChallenge
                  ? {
                      paddingTop: isTightDensity
                        ? "clamp(0.32rem, 0.18rem + 0.2vh, 0.46rem)"
                        : isCompactDensity
                          ? "clamp(0.4rem, 0.22rem + 0.24vh, 0.56rem)"
                          : "clamp(0.48rem, 0.26rem + 0.52vh, 0.72rem)",
                      paddingBottom: isTightDensity
                        ? "clamp(0.32rem, 0.18rem + 0.2vh, 0.46rem)"
                        : isCompactDensity
                          ? "clamp(0.4rem, 0.22rem + 0.24vh, 0.56rem)"
                          : "clamp(0.48rem, 0.26rem + 0.52vh, 0.72rem)",
                      paddingLeft: isTightDensity
                        ? "clamp(0.5rem, 0.32rem + 0.28vw, 0.65rem)"
                        : isCompactDensity
                          ? "clamp(0.6rem, 0.4rem + 0.34vw, 0.78rem)"
                          : "clamp(0.7rem, 0.45rem + 0.6vw, 0.95rem)",
                      paddingRight: isTightDensity
                        ? "clamp(0.5rem, 0.32rem + 0.28vw, 0.65rem)"
                        : isCompactDensity
                          ? "clamp(0.6rem, 0.4rem + 0.34vw, 0.78rem)"
                          : "clamp(0.7rem, 0.45rem + 0.6vw, 0.95rem)",
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
                      isChallenge ? "h-[var(--play-cockpit-control-icon-box)] w-[var(--play-cockpit-control-icon-box)]" : "h-[clamp(2.2rem,4.5vh,2.75rem)] w-[clamp(2.2rem,4.5vh,2.75rem)]"
                    }`}
                  >
                    <MoveIcon move={option.move} size={isChallenge ? "var(--play-cockpit-control-icon-size)" : "clamp(1.2rem,2.8vh,1.6rem)"} title={option.label} />
                  </div>
                  <div>
                    <div
                      data-testid={testIdPrefix ? `${testIdPrefix}-option-${option.id}-label` : undefined}
                      className={`${isChallenge ? "text-[var(--play-cockpit-control-title)]" : "text-[clamp(0.88rem,0.7rem+0.42vw,1rem)]"} font-semibold tracking-[-0.03em]`}
                      style={isChallenge ? { fontSize: "var(--play-cockpit-control-title)" } : undefined}
                    >
                      {option.label}
                    </div>
                    <div className={`play-shell-text-muted uppercase tracking-[0.16em] ${isTightDensity ? "text-[clamp(0.46rem,0.42rem+0.1vw,0.56rem)]" : "text-[clamp(0.54rem,0.48rem+0.16vw,0.68rem)]"}`}>
                      {option.hotkey ? `Key ${option.hotkey}` : "Tap"}
                    </div>
                  </div>
                </div>
                {isSelected && (
                  <span className={`rounded-full border border-[color:var(--app-border-strong)] bg-[color:var(--app-surface-card)] font-semibold uppercase tracking-[0.16em] ${isTightDensity ? "px-[clamp(0.3rem,0.22rem+0.14vw,0.42rem)] py-[clamp(0.12rem,0.08rem+0.06vw,0.18rem)] text-[clamp(0.46rem,0.42rem+0.1vw,0.56rem)]" : "px-[clamp(0.4rem,0.3rem+0.25vw,0.55rem)] py-[clamp(0.2rem,0.15rem+0.12vw,0.32rem)] text-[clamp(0.52rem,0.46rem+0.14vw,0.64rem)]"}`}>
                    Locked
                  </span>
                )}
              </div>
              {option.hint && (
                <p
                  className={`play-shell-text-muted mt-[clamp(0.18rem,0.12rem+0.12vh,0.28rem)] text-[clamp(0.58rem,0.54rem+0.12vw,0.68rem)] ${isCompactDensity ? "hidden min-[1320px]:block" : "hidden min-[1100px]:block"}`}
                >
                  {option.hint}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
