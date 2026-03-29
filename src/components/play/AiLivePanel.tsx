import React, { useEffect, useMemo, useRef, useState } from "react";
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
  testIdPrefix?: string;
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

const densityOrder: CockpitDensity[] = ["expanded", "normal", "compact", "tight"];

function clampDensityIndex(index: number) {
  return Math.max(0, Math.min(densityOrder.length - 1, index));
}

function getBottomSafetyBuffer(density: CockpitDensity) {
  switch (density) {
    case "expanded":
      return 18;
    case "normal":
      return 16;
    case "compact":
      return 14;
    case "tight":
      return 12;
    default:
      return 14;
  }
}

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
  testIdPrefix,
}: AiLivePanelProps) {
  const rootRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const requestedDensityIndex = useMemo(() => densityOrder.indexOf(density), [density]);
  const [effectiveDensity, setEffectiveDensity] = useState<CockpitDensity>(density);
  const [isCramped, setIsCramped] = useState(false);
  const [isUltraCramped, setIsUltraCramped] = useState(false);
  useEffect(() => {
    setEffectiveDensity(density);
    setIsCramped(false);
    setIsUltraCramped(false);
  }, [density]);

  useEffect(() => {
    const rootNode = rootRef.current;
    const contentNode = contentRef.current;
    if (!rootNode || !contentNode || typeof ResizeObserver === "undefined") return;

    const reconcile = () => {
      const activeIndex = densityOrder.indexOf(effectiveDensity);
      const availableHeight = Math.max(0, rootNode.clientHeight - getBottomSafetyBuffer(effectiveDensity));
      const neededHeight = contentNode.scrollHeight;
      const overflow = neededHeight > availableHeight + 1;
      const slack = availableHeight - neededHeight;

      if (overflow && activeIndex < densityOrder.length - 1) {
        setEffectiveDensity(densityOrder[clampDensityIndex(activeIndex + 1)]);
        return;
      }

      if (overflow && activeIndex === densityOrder.length - 1) {
        setIsCramped(true);
        setIsUltraCramped(rootNode.clientHeight < 420 || rootNode.clientWidth < 220);
        return;
      }

      if (!overflow && isCramped && slack > 10) {
        setIsCramped(false);
        setIsUltraCramped(false);
      }

      if (!overflow && activeIndex > requestedDensityIndex && slack > 20) {
        setEffectiveDensity(densityOrder[clampDensityIndex(activeIndex - 1)]);
        return;
      }

    };

    reconcile();

    const observer = new ResizeObserver(() => reconcile());
    observer.observe(rootNode);
    observer.observe(contentNode);
    window.addEventListener("resize", reconcile);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reconcile);
    };
  }, [children, effectiveDensity, isCramped, notes, requestedDensityIndex, signals]);

  const isCompactDensity = effectiveDensity !== "normal" && effectiveDensity !== "expanded";
  const isTightDensity = effectiveDensity === "tight";
  const panelChildren = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ cramped?: boolean; ultraCramped?: boolean }>, {
        cramped: isTightDensity || isCramped,
        ultraCramped: isUltraCramped,
      })
    : children;
  const visibleNotes = notes;
  const visibleSignals = signals;
  const buildSignalTestId = (label: string) =>
    testIdPrefix ? `${testIdPrefix}-signal-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined;

  return (
    <aside
      ref={rootRef}
      data-ai-density={effectiveDensity}
      className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${inactive ? "opacity-75" : ""}`}
    >
      <div ref={contentRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className={`border-b border-[color:var(--app-border)] ${isTightDensity ? "pb-[clamp(0.24rem,0.12rem+0.18vh,0.36rem)]" : isCompactDensity ? "pb-[clamp(0.3rem,0.16rem+0.26vh,0.48rem)]" : "pb-[clamp(0.45rem,0.22rem+0.65vh,0.8rem)]"}`}>
        <p className={`play-shell-heading font-semibold tracking-[-0.03em] ${isTightDensity ? "text-[clamp(0.82rem,0.74rem+0.24vw,0.92rem)]" : isCompactDensity ? "text-[clamp(0.88rem,0.78rem+0.28vw,1rem)]" : "text-[clamp(0.95rem,0.78rem+0.42vw,1.1rem)]"}`}>{title}</p>
        {summary && (
          <p
            className={`play-shell-text-muted mt-[clamp(0.12rem,0.06rem+0.12vh,0.22rem)] break-words ${
              isUltraCramped
                ? "text-[0.52rem] line-clamp-2"
                : isCramped
                  ? "text-[clamp(0.54rem,0.48rem+0.1vw,0.64rem)] line-clamp-2"
                : isTightDensity
                  ? "text-[clamp(0.68rem,0.6rem+0.14vw,0.78rem)] line-clamp-3"
                : "text-[clamp(0.74rem,0.64rem+0.18vw,0.9rem)] line-clamp-2"
            }`}
          >
            {summary}
          </p>
        )}
      </div>

      {signalLayout === "rows" ? (
        <div className={`min-h-0 min-w-0 divide-y divide-[color:var(--app-border)] ${isTightDensity ? "py-[clamp(0.1rem,0.06rem+0.08vh,0.16rem)]" : isCompactDensity ? "py-[clamp(0.16rem,0.1rem+0.12vh,0.26rem)]" : "py-[clamp(0.3rem,0.16rem+0.35vh,0.5rem)]"}`}>
          {visibleSignals.map((signal, index) => (
            <article
              key={`${signal.label}-${signal.value}`}
              data-testid={buildSignalTestId(signal.label)}
              className={`grid min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-start ${
                isTightDensity
                  ? isCramped
                    ? isUltraCramped
                      ? "gap-x-[0.12rem] gap-y-[0.01rem] px-[0.01rem] py-[0.06rem]"
                      : "gap-x-[clamp(0.16rem,0.1rem+0.1vw,0.24rem)] gap-y-[clamp(0.02rem,0.01rem+0.02vh,0.04rem)] px-[0.02rem] py-[clamp(0.12rem,0.08rem+0.08vh,0.18rem)]"
                    : "gap-x-[clamp(0.22rem,0.12rem+0.14vw,0.34rem)] gap-y-[clamp(0.03rem,0.02rem+0.02vh,0.06rem)] px-[clamp(0.04rem,0.02rem+0.04vw,0.08rem)] py-[clamp(0.18rem,0.1rem+0.14vh,0.28rem)]"
                  : isCompactDensity
                    ? "gap-x-[clamp(0.26rem,0.16rem+0.18vw,0.42rem)] gap-y-[clamp(0.04rem,0.02rem+0.04vh,0.08rem)] px-[clamp(0.05rem,0.03rem+0.06vw,0.12rem)] py-[clamp(0.22rem,0.12rem+0.16vh,0.34rem)]"
                    : "gap-x-[clamp(0.4rem,0.22rem+0.35vw,0.75rem)] gap-y-[clamp(0.1rem,0.04rem+0.1vh,0.2rem)] px-[clamp(0.1rem,0.05rem+0.12vw,0.3rem)] py-[clamp(0.38rem,0.2rem+0.45vh,0.65rem)]"
              }`}
            >
              <p
                className="min-w-0 font-semibold uppercase tracking-[0.18em] text-[color:var(--app-text-muted)] text-[var(--play-cockpit-ai-label-size)]"
                style={{ fontSize: "var(--play-cockpit-ai-label-size)" }}
              >
                {signal.label}
              </p>
              <div className="min-w-0 text-right">
                <p
                  data-testid={buildSignalTestId(`${signal.label}-value`)}
                  className={`min-w-0 break-words font-semibold tracking-[-0.02em] text-[var(--play-cockpit-ai-value-size)] ${toneTextClasses[signal.tone ?? "default"]}`}
                  style={{
                    fontSize: isUltraCramped ? "0.75rem" : "var(--play-cockpit-ai-value-size)",
                    lineHeight: isUltraCramped ? "1.05" : undefined,
                  }}
                >
                  {signal.value}
                </p>
                {signal.detail && (
                  <p
                    className={`mt-[clamp(0.04rem,0.02rem+0.04vh,0.1rem)] break-words text-[color:var(--app-text-muted)] ${
                      isCramped ? "line-clamp-2" : isTightDensity ? "line-clamp-2" : "max-[900px]:line-clamp-1"
                    }`}
                    style={{
                      fontSize: isUltraCramped
                        ? "0.5rem"
                        : isCramped
                          ? "clamp(0.54rem, 0.48rem + 0.1vw, 0.64rem)"
                        : isTightDensity
                          ? "clamp(0.66rem, 0.58rem + 0.12vw, 0.76rem)"
                          : "var(--play-cockpit-ai-detail-size)",
                      lineHeight: isUltraCramped ? "1.1" : undefined,
                    }}
                  >
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
        <div
          className={`min-h-0 min-w-0 flex-1 overflow-hidden border-t border-[color:var(--app-border)] ${
            isTightDensity
              ? isCramped
                ? isUltraCramped
                  ? "py-[0.02rem] pb-[0.12rem]"
                  : "py-[0.04rem] pb-[clamp(0.18rem,0.1rem+0.14vh,0.28rem)]"
                : "py-[clamp(0.12rem,0.06rem+0.1vh,0.2rem)] pb-[clamp(0.4rem,0.18rem+0.3vh,0.56rem)]"
              : isCompactDensity
                ? "py-[clamp(0.18rem,0.1rem+0.16vh,0.28rem)] pb-[clamp(0.5rem,0.24rem+0.38vh,0.72rem)]"
                : "py-[clamp(0.36rem,0.18rem+0.55vh,0.62rem)] pb-[clamp(0.68rem,0.3rem+0.78vh,0.98rem)]"
          }`}
        >
          {visibleNotes.length > 0 && (
            <div
              className={`mb-[clamp(0.24rem,0.12rem+0.18vh,0.38rem)] flex flex-wrap gap-[clamp(0.2rem,0.14rem+0.16vw,0.32rem)] ${isCramped ? "mb-[0.08rem] gap-[0.08rem]" : ""}`}
              style={{ display: isUltraCramped ? "none" : undefined }}
            >
              {visibleNotes.map(note => (
                <span
                  key={note}
                  className={`rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] font-medium text-[color:var(--app-text-secondary)] ${
                    isCramped
                      ? "px-[0.12rem] py-[0.03rem] text-[0.32rem]"
                      : isTightDensity
                        ? "px-[clamp(0.22rem,0.16rem+0.1vw,0.3rem)] py-[clamp(0.08rem,0.06rem+0.04vw,0.12rem)] text-[clamp(0.42rem,0.4rem+0.08vw,0.5rem)]"
                      : "px-[clamp(0.3rem,0.22rem+0.16vw,0.42rem)] py-[clamp(0.12rem,0.08rem+0.06vw,0.18rem)] text-[clamp(0.48rem,0.44rem+0.1vw,0.58rem)]"
                  }`}
                >
                  {note}
                </span>
              ))}
            </div>
          )}
          {panelChildren}
        </div>
      )}

      {inactiveMessage && (
        <div className="border-t border-[color:var(--app-border)] pt-[clamp(0.45rem,0.22rem+0.65vh,0.8rem)]">
          {inactiveMessage}
        </div>
      )}
      </div>
    </aside>
  );
}
