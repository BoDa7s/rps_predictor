import React from "react";
import type { GameplayTone } from "./GameHudHeader";

export interface MatchStatusItem {
  label: string;
  value: string;
  hint?: string;
  tone?: GameplayTone;
}

interface MatchStatusBarProps {
  items: MatchStatusItem[];
}

const toneClasses: Record<GameplayTone, string> = {
  default:
    "border-[color:var(--app-border)] bg-[color:var(--app-surface-card)] text-[color:var(--app-text-primary)]",
  accent:
    "border-[color:var(--app-border-strong)] bg-[color:var(--app-accent-soft)] text-[color:var(--app-accent-strong)]",
  success: "border-emerald-300/60 bg-emerald-400/10 text-emerald-500",
  warning: "border-amber-300/60 bg-amber-400/10 text-amber-500",
  danger: "border-rose-300/60 bg-rose-400/10 text-rose-500",
};

export default function MatchStatusBar({ items }: MatchStatusBarProps) {
  return (
    <section className="grid gap-px overflow-hidden rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-border)] sm:grid-cols-2 xl:grid-cols-4">
      <div className="contents">
        {items.map(item => (
          <article
            key={`${item.label}-${item.value}`}
            className={`px-3 py-2.5 ${toneClasses[item.tone ?? "default"]}`}
          >
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] opacity-80">{item.label}</p>
            <p className="mt-1 text-base font-semibold tracking-[-0.03em]">{item.value}</p>
            {item.hint && <p className="mt-1 hidden text-[0.72rem] opacity-80 sm:block">{item.hint}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
