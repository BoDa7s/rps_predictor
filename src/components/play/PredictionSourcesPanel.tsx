import React from "react";
import type { CockpitDensity } from "./cockpitViewport";

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
  density?: CockpitDensity;
  cramped?: boolean;
  ultraCramped?: boolean;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export default function PredictionSourcesPanel({
  title = "Source mix",
  sources,
  layout = "grid",
  metaLabel = "Live blend",
  density = "normal",
  cramped = false,
  ultraCramped = false,
}: PredictionSourcesPanelProps) {
  const isCompactDensity = density !== "normal" && density !== "expanded";
  const isTightDensity = density === "tight";
  const visibleSources = sources;

  return (
    <section className="min-h-0 min-w-0">
      <div
        className={`mb-[clamp(0.16rem,0.1rem+0.14vh,0.28rem)] flex items-center justify-between gap-[clamp(0.25rem,0.16rem+0.2vw,0.45rem)] ${cramped ? "mb-[0.12rem]" : ""}`}
      >
        <p className={`play-shell-heading font-semibold uppercase tracking-[0.16em] ${
          cramped
            ? "text-[0.48rem]"
            : isTightDensity
            ? "text-[clamp(0.56rem,0.52rem+0.08vw,0.64rem)]"
            : isCompactDensity
              ? "text-[clamp(0.62rem,0.56rem+0.14vw,0.74rem)]"
              : "text-[clamp(0.68rem,0.58rem+0.2vw,0.85rem)]"
        }`}>{title}</p>
        {metaLabel && (
          <span
            className={`play-shell-text-muted uppercase tracking-[0.16em] ${
              cramped
                ? "text-[0.36rem]"
                : isTightDensity
                ? "text-[clamp(0.44rem,0.4rem+0.06vw,0.5rem)]"
                : "text-[clamp(0.54rem,0.48rem+0.12vw,0.68rem)] max-[900px]:hidden"
            }`}
          >
            {metaLabel}
          </span>
        )}
      </div>

      <div className={layout === "rows" ? "min-w-0 divide-y divide-[color:var(--app-border)]" : "grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2"}>
        {visibleSources.map(source => {
          const strength = clampPercent(source.strength);
          return (
            <div
              key={`${source.label}-${source.value}`}
              className={
                layout === "rows"
                  ? isTightDensity
                    ? cramped
                      ? "min-w-0 px-[0.01rem] py-[0.08rem]"
                      : "min-w-0 px-[clamp(0.03rem,0.02rem+0.04vw,0.08rem)] py-[clamp(0.14rem,0.08rem+0.1vh,0.22rem)]"
                    : isCompactDensity
                      ? "min-w-0 px-[clamp(0.05rem,0.03rem+0.06vw,0.12rem)] py-[clamp(0.18rem,0.1rem+0.12vh,0.28rem)]"
                      : "min-w-0 px-[clamp(0.08rem,0.05rem+0.1vw,0.24rem)] py-[clamp(0.28rem,0.16rem+0.35vh,0.5rem)]"
                  : "rounded-[0.9rem] border border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] px-[clamp(0.55rem,0.4rem+0.4vw,0.75rem)] py-[clamp(0.4rem,0.22rem+0.35vh,0.55rem)]"
              }
            >
              <div
                data-testid={`challenge-ai-source-row-${source.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={`flex min-w-0 items-center justify-between gap-[clamp(0.2rem,0.14rem+0.14vw,0.34rem)] ${isTightDensity ? cramped ? "text-[0.56rem]" : "text-[clamp(0.62rem,0.56rem+0.14vw,0.72rem)]" : "text-[clamp(0.72rem,0.64rem+0.2vw,0.85rem)]"}`}
              >
                <span className="min-w-0 break-words font-medium text-[color:var(--app-text-primary)]">{source.label}</span>
                <span className={`min-w-0 break-words text-right font-semibold uppercase tracking-[0.14em] text-[color:var(--app-accent-strong)] ${isTightDensity ? cramped ? "text-[0.44rem]" : "text-[clamp(0.46rem,0.42rem+0.1vw,0.56rem)]" : "text-[clamp(0.54rem,0.48rem+0.12vw,0.68rem)]"}`}>
                  {source.value}
                </span>
              </div>
              <div className={`mt-[clamp(0.12rem,0.06rem+0.08vh,0.2rem)] overflow-hidden rounded-full bg-[color:var(--app-surface-input)] ${isTightDensity ? cramped ? "mt-[0.08rem] h-[0.1rem]" : "h-[0.18rem]" : isCompactDensity ? "h-[0.22rem]" : "h-[clamp(0.22rem,0.18rem+0.16vh,0.38rem)]"}`}>
                <div className="h-full rounded-full bg-[color:var(--app-accent)]" style={{ width: `${strength}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
