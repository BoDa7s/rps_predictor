import React from "react";
import type { GameplayTone } from "./GameHudHeader";

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
}: AiLivePanelProps) {
  return (
    <aside className={`flex h-full min-h-0 flex-col overflow-hidden ${inactive ? "opacity-75" : ""}`}>
      <div className="border-b border-[color:var(--app-border)] pb-[clamp(0.45rem,0.22rem+0.65vh,0.8rem)]">
        <p className="play-shell-heading text-[clamp(0.95rem,0.78rem+0.42vw,1.1rem)] font-semibold tracking-[-0.03em]">{title}</p>
        {summary && <p className="play-shell-text-muted mt-[clamp(0.15rem,0.06rem+0.18vh,0.28rem)] text-[clamp(0.7rem,0.62rem+0.2vw,0.88rem)] max-[900px]:hidden">{summary}</p>}
      </div>

      {signalLayout === "rows" ? (
        <div className="divide-y divide-[color:var(--app-border)] py-[clamp(0.3rem,0.16rem+0.35vh,0.5rem)]">
          {signals.map(signal => (
            <article
              key={`${signal.label}-${signal.value}`}
              className="grid grid-cols-[auto_1fr] items-start gap-x-[clamp(0.4rem,0.22rem+0.35vw,0.75rem)] gap-y-[clamp(0.1rem,0.04rem+0.1vh,0.2rem)] px-[clamp(0.1rem,0.05rem+0.12vw,0.3rem)] py-[clamp(0.38rem,0.2rem+0.45vh,0.65rem)]"
            >
              <p className="text-[clamp(0.52rem,0.46rem+0.12vw,0.62rem)] font-semibold uppercase tracking-[0.18em] text-[color:var(--app-text-muted)]">
                {signal.label}
              </p>
              <div className="text-right">
                <p className={`text-[clamp(0.78rem,0.68rem+0.24vw,0.92rem)] font-semibold tracking-[-0.02em] ${toneTextClasses[signal.tone ?? "default"]}`}>
                  {signal.value}
                </p>
                {signal.detail && <p className="mt-[clamp(0.08rem,0.04rem+0.08vh,0.18rem)] text-[clamp(0.62rem,0.56rem+0.14vw,0.72rem)] text-[color:var(--app-text-muted)] max-[900px]:line-clamp-1">{signal.detail}</p>}
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
        <div className="min-h-0 flex-1 border-t border-[color:var(--app-border)] py-[clamp(0.45rem,0.22rem+0.65vh,0.8rem)]">
          {notes.length > 0 && (
            <div className="mb-[clamp(0.35rem,0.18rem+0.45vh,0.65rem)] flex flex-wrap gap-[clamp(0.25rem,0.16rem+0.2vw,0.45rem)]">
              {notes.map(note => (
                <span
                  key={note}
                  className="rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] px-[clamp(0.35rem,0.25rem+0.2vw,0.5rem)] py-[clamp(0.14rem,0.08rem+0.08vw,0.22rem)] text-[clamp(0.52rem,0.46rem+0.12vw,0.62rem)] font-medium text-[color:var(--app-text-secondary)]"
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
