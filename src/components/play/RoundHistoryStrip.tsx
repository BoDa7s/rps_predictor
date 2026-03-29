import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import type { Move } from "../../gameTypes";
import { MoveLabel } from "../../moveIcons";
import { playOutcomeAccentHex, playOutcomeToneClasses } from "./playOutcomeTone";

export interface RoundHistoryEntry {
  id: string;
  label: string;
  playerMove?: Move;
  aiMove?: Move;
  outcome: "win" | "lose" | "tie" | "pending";
  note?: string;
}

interface RoundHistoryStripProps {
  title?: string;
  rounds: RoundHistoryEntry[];
  metaLabel?: string | null;
  compact?: boolean;
}

function formatOutcome(outcome: RoundHistoryEntry["outcome"]) {
  if (outcome === "pending") return "Queued";
  return outcome.charAt(0).toUpperCase() + outcome.slice(1);
}

function compactCardWidth(compact: boolean) {
  return compact ? "clamp(5.4rem, 8vw, 6.9rem)" : "clamp(9rem, 15vw, 12rem)";
}

function cardPadding(compact: boolean) {
  return compact
    ? "clamp(0.35rem, 0.18rem + 0.35vh, 0.6rem) clamp(0.4rem, 0.24rem + 0.4vw, 0.65rem)"
    : "clamp(0.55rem, 0.25rem + 0.55vh, 0.8rem) clamp(0.65rem, 0.35rem + 0.5vw, 0.9rem)";
}

function isRoundExpandable(round: RoundHistoryEntry) {
  return Boolean(round.playerMove || round.aiMove || round.note) && round.outcome !== "pending";
}

function expandedPopupStyle(outcome: RoundHistoryEntry["outcome"]): React.CSSProperties {
  const accent = playOutcomeAccentHex[outcome];
  return {
    borderColor: `color-mix(in srgb, ${accent} 34%, var(--app-border-strong))`,
    background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 8%, var(--app-surface-card)), var(--app-surface-card))`,
    boxShadow: `0 16px 36px color-mix(in srgb, ${accent} 12%, transparent), 0 8px 20px color-mix(in srgb, var(--app-overlay) 22%, transparent)`,
  };
}

export default function RoundHistoryStrip({
  title = "Recent rounds",
  rounds,
  metaLabel = "Utility strip",
  compact = false,
}: RoundHistoryStripProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedRect, setExpandedRect] = useState<DOMRect | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const cardButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const orderedRounds = useMemo(() => rounds, [rounds]);

  const expandedRound = useMemo(
    () => orderedRounds.find(round => round.id === expandedId) ?? null,
    [expandedId, orderedRounds],
  );

  useEffect(() => {
    if (!rootRef.current || typeof document === "undefined") return;
    const themedHost =
      rootRef.current.closest<HTMLElement>(".play-shell-theme, .app-theme") ?? document.body;
    setPortalTarget(themedHost);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setExpandedId(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!rounds.some(round => round.id === expandedId)) {
      setExpandedId(null);
      setExpandedRect(null);
    }
  }, [expandedId, rounds]);

  useEffect(() => {
    if (!expandedId) {
      setExpandedRect(null);
      return;
    }

    const updateRect = () => {
      const node = cardButtonRefs.current[expandedId];
      if (!node) {
        setExpandedRect(null);
        return;
      }
      setExpandedRect(node.getBoundingClientRect());
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [expandedId]);

  return (
    <section ref={rootRef} className="relative flex h-full min-h-0 flex-col overflow-visible">
      <div className="mb-[clamp(0.2rem,0.12rem+0.18vh,0.38rem)] flex items-center justify-between gap-[clamp(0.25rem,0.16rem+0.2vw,0.45rem)]">
        <p className="play-shell-heading text-[clamp(0.7rem,0.6rem+0.2vw,0.88rem)] font-semibold uppercase tracking-[0.18em]">{title}</p>
        {metaLabel && <span className="play-shell-text-muted text-[clamp(0.54rem,0.48rem+0.12vw,0.68rem)] uppercase tracking-[0.16em] max-[900px]:hidden">{metaLabel}</span>}
      </div>

      <div className="min-h-0 overflow-x-auto overflow-y-visible pb-[clamp(0.18rem,0.1rem+0.18vh,0.35rem)] pt-1">
        <div className={`flex h-full items-start ${compact ? "min-w-0 gap-[clamp(0.25rem,0.15rem+0.2vw,0.45rem)]" : "min-w-max gap-[clamp(0.35rem,0.2rem+0.25vw,0.6rem)]"}`}>
          {orderedRounds.map(round => {
            const isExpanded = expandedId === round.id;
            const isExpandable = isRoundExpandable(round);

            return (
              <div
                key={round.id}
                className="relative shrink-0"
                style={{ width: compactCardWidth(compact) }}
              >
                <button
                  type="button"
                  ref={node => {
                    cardButtonRefs.current[round.id] = node;
                  }}
                  onClick={() => {
                    if (!isExpandable) return;
                    setExpandedId(current => (current === round.id ? null : round.id));
                  }}
                  aria-expanded={isExpandable ? isExpanded : false}
                  className={`flex w-full flex-col justify-between rounded-[0.9rem] border border-[color:var(--app-border)] bg-[color:var(--app-surface-card)] text-left transition duration-150 ${
                    isExpandable ? "cursor-pointer hover:border-[color:var(--app-border-strong)]" : "cursor-default"
                  } ${isExpanded ? "scale-[1.015] shadow-[0_10px_30px_color-mix(in_srgb,var(--app-accent)_12%,transparent)]" : ""}`}
                  title={isExpandable ? "View round details" : undefined}
                  style={{ padding: cardPadding(compact) }}
                >
                  <div className="flex items-center justify-between gap-[clamp(0.2rem,0.14rem+0.16vw,0.4rem)]">
                    <p className="play-shell-heading text-[clamp(0.62rem,0.54rem+0.16vw,0.76rem)] font-semibold uppercase tracking-[0.16em]">
                      {round.label}
                    </p>
                    <span
                      className={`inline-flex items-center rounded-full border px-[clamp(0.3rem,0.22rem+0.14vw,0.5rem)] py-[clamp(0.08rem,0.05rem+0.08vw,0.16rem)] text-[clamp(0.48rem,0.42rem+0.12vw,0.6rem)] font-semibold uppercase tracking-[0.16em] ${playOutcomeToneClasses[round.outcome]}`}
                    >
                      {formatOutcome(round.outcome)}
                    </span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {portalTarget &&
        createPortal(
          <AnimatePresence>
            {expandedRound && expandedRect && isRoundExpandable(expandedRound) && (
              <motion.div
                ref={popupRef}
                key={expandedRound.id}
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                className="fixed z-[140] w-[min(10.5rem,calc(100vw-2rem))] rounded-[0.95rem] border px-3 py-2.5"
                style={(() => {
                  const popupWidth = Math.min(168, Math.max(132, window.innerWidth - 24));
                  const left = Math.min(
                    Math.max(12, expandedRect.left + expandedRect.width / 2 - popupWidth / 2),
                    Math.max(12, window.innerWidth - popupWidth - 12),
                  );
                  const top = Math.max(12, expandedRect.top - 96);
                  return { left, top, ...expandedPopupStyle(expandedRound.outcome) };
                })()}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="play-shell-heading text-[0.8rem] font-semibold tracking-[-0.02em] text-[color:var(--app-text-strong)]">
                    {expandedRound.label}
                  </p>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.16em] ${playOutcomeToneClasses[expandedRound.outcome]}`}
                  >
                    {formatOutcome(expandedRound.outcome)}
                  </span>
                </div>

                {(expandedRound.playerMove || expandedRound.aiMove) && (
                  <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[0.72rem]">
                    {expandedRound.playerMove ? <MoveLabel move={expandedRound.playerMove} iconSize={13} /> : <span className="play-shell-text-muted">-</span>}
                    <span className="play-shell-text-muted text-[0.54rem] uppercase tracking-[0.12em]">vs</span>
                    {expandedRound.aiMove ? <MoveLabel move={expandedRound.aiMove} iconSize={13} /> : <span className="play-shell-text-muted">-</span>}
                  </div>
                )}

                {expandedRound.note && (
                  <p className="play-shell-text-muted mt-2 border-t border-[color:var(--app-border)] pt-2 text-[0.62rem] leading-4">
                    {expandedRound.note}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          portalTarget,
        )}
    </section>
  );
}
