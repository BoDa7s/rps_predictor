import React from "react";

export interface PredictionSourceItem {
  label: string;
  value: string;
  strength: number;
}

interface PredictionSourcesPanelProps {
  title?: string;
  sources: PredictionSourceItem[];
  layout?: "grid" | "rows";
  metaLabel?: string | null;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export default function PredictionSourcesPanel({
  title = "Source mix",
  sources,
  layout = "grid",
  metaLabel = "Live blend",
}: PredictionSourcesPanelProps) {
  return (
    <section className="min-h-0">
      <div className="mb-[clamp(0.25rem,0.16rem+0.25vh,0.5rem)] flex items-center justify-between gap-[clamp(0.25rem,0.16rem+0.2vw,0.45rem)]">
        <p className="play-shell-heading text-[clamp(0.68rem,0.58rem+0.2vw,0.85rem)] font-semibold uppercase tracking-[0.16em]">{title}</p>
        {metaLabel && <span className="play-shell-text-muted text-[clamp(0.54rem,0.48rem+0.12vw,0.68rem)] uppercase tracking-[0.16em] max-[900px]:hidden">{metaLabel}</span>}
      </div>

      <div className={layout === "rows" ? "divide-y divide-[color:var(--app-border)]" : "grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2"}>
        {sources.map(source => {
          const strength = clampPercent(source.strength);
          return (
            <div
              key={`${source.label}-${source.value}`}
              className={
                layout === "rows"
                  ? "px-[clamp(0.08rem,0.05rem+0.1vw,0.24rem)] py-[clamp(0.28rem,0.16rem+0.35vh,0.5rem)]"
                  : "rounded-[0.9rem] border border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] px-[clamp(0.55rem,0.4rem+0.4vw,0.75rem)] py-[clamp(0.4rem,0.22rem+0.35vh,0.55rem)]"
              }
            >
              <div className="flex items-center justify-between gap-[clamp(0.25rem,0.16rem+0.2vw,0.45rem)] text-[clamp(0.72rem,0.64rem+0.2vw,0.85rem)]">
                <span className="font-medium text-[color:var(--app-text-primary)]">{source.label}</span>
                <span className="text-[clamp(0.54rem,0.48rem+0.12vw,0.68rem)] font-semibold uppercase tracking-[0.14em] text-[color:var(--app-accent-strong)]">
                  {source.value}
                </span>
              </div>
              <div className="mt-[clamp(0.22rem,0.12rem+0.2vh,0.38rem)] h-[clamp(0.22rem,0.18rem+0.16vh,0.38rem)] overflow-hidden rounded-full bg-[color:var(--app-surface-input)]">
                <div className="h-full rounded-full bg-[color:var(--app-accent)]" style={{ width: `${strength}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
