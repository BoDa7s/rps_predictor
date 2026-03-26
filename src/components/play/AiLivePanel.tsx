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
      <div className="border-b border-[color:var(--app-border)] pb-3">
        <p className="play-shell-heading text-base font-semibold tracking-[-0.03em]">{title}</p>
        {summary && <p className="play-shell-text-muted mt-1 text-sm">{summary}</p>}
      </div>

      {signalLayout === "rows" ? (
        <div className="divide-y divide-[color:var(--app-border)] py-2">
          {signals.map(signal => (
            <article
              key={`${signal.label}-${signal.value}`}
              className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 px-1 py-2"
            >
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--app-text-muted)]">
                {signal.label}
              </p>
              <div className="text-right">
                <p className={`text-sm font-semibold tracking-[-0.02em] ${toneTextClasses[signal.tone ?? "default"]}`}>
                  {signal.value}
                </p>
                {signal.detail && <p className="mt-0.5 text-[0.72rem] text-[color:var(--app-text-muted)]">{signal.detail}</p>}
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
        <div className="min-h-0 flex-1 border-t border-[color:var(--app-border)] py-3">
          {notes.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {notes.map(note => (
                <span
                  key={note}
                  className="rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] px-2 py-0.5 text-[0.62rem] font-medium text-[color:var(--app-text-secondary)]"
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
        <div className="border-t border-[color:var(--app-border)] pt-3">
          {inactiveMessage}
        </div>
      )}
    </aside>
  );
}
