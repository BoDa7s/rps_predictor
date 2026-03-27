import React from "react";
import type { GameplayTone } from "./GameHudHeader";
import type { CockpitDensity } from "./cockpitViewport";

export interface AiLiveSignal {
  label: string;
  value: string;
  detail?: string;
  tone?: GameplayTone;
}

interface AiLivePanelProps {
  title: string;
  summary?: string;
  signals: AiLiveSignal[];
  notes?: string[];
  children?: React.ReactNode;
  signalLayout?: "cards" | "rows";
  inactive?: boolean;
  inactiveMessage?: React.ReactNode;
  density?: CockpitDensity;
}

const toneClasses: Record<GameplayTone, string> = {
  default:
    "border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] text-[color:var(--app-text-primary)]",
  accent:
    "border-[color:var(--app-border-strong)] bg-[color:var(--app-accent-soft)] text-[color:var(--app-accent-strong)]",
  success: "border-emerald-300/60 bg-emerald-400/10 text-emerald-500",
  warning: "border-amber-300/60 bg-amber-400/10 text-amber-500",
  danger: "border-rose-300/60 bg-rose-400/10 text-rose-500",
};

const toneTextClasses: Record<GameplayTone, string> = {
  default: "text-[color:var(--app-text-primary)]",
  accent: "text-[color:var(--app-accent-strong)]",
  success: "text-emerald-500",
  warning: "text-amber-500",
  danger: "text-rose-500",
};

export default function AiLivePanel({
  title,
  summary,
  signals,
  notes = [],
  children,
  signalLayout = "cards",
  inactive = false,
  inactiveMessage,
  density = "normal",
}: AiLivePanelProps) {
  const isCompactDensity = density !== "normal";
  const isTightDensity = density === "tight";
  const visibleNotes = isTightDensity ? [] : isCompactDensity ? notes.slice(0, 1) : notes;

  return (
    <aside className={`flex h-full min-h-0 flex-col overflow-hidden ${inactive ? "opacity-75" : ""}`}>
      <div className={`border-b border-[color:var(--app-border)] ${isTightDensity ? "pb-[clamp(0.24rem,0.12rem+0.18vh,0.36rem)]" : isCompactDensity ? "pb-[clamp(0.3rem,0.16rem+0.26vh,0.48rem)]" : "pb-[clamp(0.45rem,0.22rem+0.65vh,0.8rem)]"}`}>
        <p className={`play-shell-heading font-semibold tracking-[-0.03em] ${isTightDensity ? "text-[clamp(0.82rem,0.74rem+0.24vw,0.92rem)]" : isCompactDensity ? "text-[clamp(0.88rem,0.78rem+0.28vw,1rem)]" : "text-[clamp(0.95rem,0.78rem+0.42vw,1.1rem)]"}`}>{title}</p>
        {summary && (
          <p
            className={`play-shell-text-muted mt-[clamp(0.12rem,0.06rem+0.12vh,0.22rem)] text-[clamp(0.62rem,0.56rem+0.14vw,0.76rem)] ${
              isTightDensity ? "hidden" : "line-clamp-2"
            }`}
          >
            {summary}
          </p>
        )}
      </div>

      {signalLayout === "rows" ? (
        <div className={`divide-y divide-[color:var(--app-border)] ${isTightDensity ? "py-[clamp(0.14rem,0.08rem+0.14vh,0.24rem)]" : isCompactDensity ? "py-[clamp(0.2rem,0.12rem+0.18vh,0.34rem)]" : "py-[clamp(0.3rem,0.16rem+0.35vh,0.5rem)]"}`}>
          {signals.map((signal, index) => (
            <article
              key={`${signal.label}-${signal.value}`}
              className={`grid grid-cols-[auto_1fr] items-start ${
                isTightDensity
                  ? "gap-x-[clamp(0.26rem,0.14rem+0.18vw,0.42rem)] gap-y-[clamp(0.04rem,0.02rem+0.04vh,0.08rem)] px-[clamp(0.04rem,0.02rem+0.06vw,0.1rem)] py-[clamp(0.22rem,0.12rem+0.18vh,0.34rem)]"
                  : isCompactDensity
                    ? "gap-x-[clamp(0.32rem,0.18rem+0.22vw,0.5rem)] gap-y-[clamp(0.06rem,0.03rem+0.06vh,0.12rem)] px-[clamp(0.06rem,0.03rem+0.08vw,0.16rem)] py-[clamp(0.28rem,0.15rem+0.22vh,0.42rem)]"
                    : "gap-x-[clamp(0.4rem,0.22rem+0.35vw,0.75rem)] gap-y-[clamp(0.1rem,0.04rem+0.1vh,0.2rem)] px-[clamp(0.1rem,0.05rem+0.12vw,0.3rem)] py-[clamp(0.38rem,0.2rem+0.45vh,0.65rem)]"
              }`}
            >
              <p className={`font-semibold uppercase tracking-[0.18em] text-[color:var(--app-text-muted)] ${isTightDensity ? "text-[clamp(0.46rem,0.42rem+0.1vw,0.54rem)]" : "text-[clamp(0.52rem,0.46rem+0.12vw,0.62rem)]"}`}>
                {signal.label}
              </p>
              <div className="text-right">
                <p className={`font-semibold tracking-[-0.02em] ${isTightDensity ? "text-[clamp(0.72rem,0.66rem+0.18vw,0.82rem)]" : isCompactDensity ? "text-[clamp(0.75rem,0.68rem+0.2vw,0.86rem)]" : "text-[clamp(0.78rem,0.68rem+0.24vw,0.92rem)]"} ${toneTextClasses[signal.tone ?? "default"]}`}>
                  {signal.value}
                </p>
                {signal.detail && !(isTightDensity && index >= 3) && (
                  <p className={`mt-[clamp(0.04rem,0.02rem+0.04vh,0.1rem)] text-[color:var(--app-text-muted)] max-[900px]:line-clamp-1 ${isTightDensity ? "text-[clamp(0.56rem,0.52rem+0.1vw,0.64rem)]" : "text-[clamp(0.62rem,0.56rem+0.14vw,0.72rem)]"}`}>
                    {signal.detail}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="grid gap-2 py-3 sm:grid-cols-2 lg:grid-cols-2">
          {signals.map(signal => (
            <article
              key={`${signal.label}-${signal.value}`}
              className={`rounded-[0.9rem] border px-3 py-2 ${toneClasses[signal.tone ?? "default"]}`}
            >
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] opacity-80">{signal.label}</p>
              <p className="mt-1 text-sm font-semibold tracking-[-0.02em]">{signal.value}</p>
              {signal.detail && <p className="mt-1 text-[0.72rem] opacity-80">{signal.detail}</p>}
            </article>
          ))}
        </div>
      )}

      {(notes.length > 0 || children) && (
        <div className={`min-h-0 flex-1 border-t border-[color:var(--app-border)] ${isTightDensity ? "py-[clamp(0.22rem,0.12rem+0.18vh,0.34rem)]" : isCompactDensity ? "py-[clamp(0.28rem,0.16rem+0.22vh,0.44rem)]" : "py-[clamp(0.45rem,0.22rem+0.65vh,0.8rem)]"}`}>
          {visibleNotes.length > 0 && (
            <div className={`mb-[clamp(0.24rem,0.12rem+0.18vh,0.38rem)] flex flex-wrap gap-[clamp(0.2rem,0.14rem+0.16vw,0.32rem)] ${isTightDensity ? "hidden" : ""}`}>
              {visibleNotes.map(note => (
                <span
                  key={note}
                  className="rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] px-[clamp(0.3rem,0.22rem+0.16vw,0.42rem)] py-[clamp(0.12rem,0.08rem+0.06vw,0.18rem)] text-[clamp(0.48rem,0.44rem+0.1vw,0.58rem)] font-medium text-[color:var(--app-text-secondary)]"
                >
                  {note}
                </span>
              ))}
            </div>
          )}
          {children}
        </div>
      )}

      {inactiveMessage && (
        <div className="border-t border-[color:var(--app-border)] pt-[clamp(0.45rem,0.22rem+0.65vh,0.8rem)]">
          {inactiveMessage}
        </div>
      )}
    </aside>
  );
}
