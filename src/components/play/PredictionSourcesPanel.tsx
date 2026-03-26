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
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="play-shell-heading text-sm font-semibold uppercase tracking-[0.16em]">{title}</p>
        {metaLabel && <span className="play-shell-text-muted text-[0.68rem] uppercase tracking-[0.16em]">{metaLabel}</span>}
      </div>

      <div className={layout === "rows" ? "divide-y divide-[color:var(--app-border)]" : "grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2"}>
        {sources.map(source => {
          const strength = clampPercent(source.strength);
          return (
            <div
              key={`${source.label}-${source.value}`}
              className={
                layout === "rows"
                  ? "px-1 py-2"
                  : "rounded-[0.9rem] border border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] px-3 py-2"
              }
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-[color:var(--app-text-primary)]">{source.label}</span>
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--app-accent-strong)]">
                  {source.value}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--app-surface-input)]">
                <div className="h-full rounded-full bg-[color:var(--app-accent)]" style={{ width: `${strength}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
