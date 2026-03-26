import React from "react";
import type { Move } from "../../gameTypes";
import { MoveLabel } from "../../moveIcons";

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

const outcomeClasses: Record<RoundHistoryEntry["outcome"], string> = {
  win: "border-emerald-300/60 bg-emerald-400/10 text-emerald-500",
  lose: "border-rose-300/60 bg-rose-400/10 text-rose-500",
  tie: "border-amber-300/60 bg-amber-400/10 text-amber-500",
  pending:
    "border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] text-[color:var(--app-text-secondary)]",
};

function formatOutcome(outcome: RoundHistoryEntry["outcome"]) {
  if (outcome === "pending") return "Queued";
  return outcome.charAt(0).toUpperCase() + outcome.slice(1);
}

export default function RoundHistoryStrip({
  title = "Recent rounds",
  rounds,
  metaLabel = "Utility strip",
  compact = false,
}: RoundHistoryStripProps) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="play-shell-heading text-sm font-semibold uppercase tracking-[0.18em]">{title}</p>
        {metaLabel && <span className="play-shell-text-muted text-[0.68rem] uppercase tracking-[0.16em]">{metaLabel}</span>}
      </div>

      <div className="min-h-0 overflow-x-auto overflow-y-hidden pb-1">
        <div className={`flex h-full ${compact ? "min-w-0 gap-1.5" : "min-w-max gap-2"}`}>
          {rounds.map(round => (
            <article
              key={round.id}
              className={`flex shrink-0 flex-col justify-between rounded-[0.9rem] border border-[color:var(--app-border)] bg-[color:var(--app-surface-card)] ${
                compact ? "w-[6.9rem] px-2 py-1.5" : "w-[12rem] px-3 py-2"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="play-shell-heading text-[0.76rem] font-semibold uppercase tracking-[0.16em]">
                  {round.label}
                </p>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${outcomeClasses[round.outcome]}`}
                >
                  {formatOutcome(round.outcome)}
                </span>
              </div>

              {compact ? (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-[0.72rem]">
                  {round.playerMove ? <MoveLabel move={round.playerMove} iconSize={14} /> : <span className="play-shell-text-muted">-</span>}
                  <span className="play-shell-text-muted text-[0.56rem] uppercase tracking-[0.12em]">vs</span>
                  {round.aiMove ? <MoveLabel move={round.aiMove} iconSize={14} /> : <span className="play-shell-text-muted">-</span>}
                </div>
              ) : (
                <div className="mt-2 space-y-1 text-[0.78rem]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="play-shell-text-muted">You</span>
                    {round.playerMove ? <MoveLabel move={round.playerMove} iconSize={16} /> : <span className="play-shell-text-muted">-</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="play-shell-text-muted">AI</span>
                    {round.aiMove ? <MoveLabel move={round.aiMove} iconSize={16} /> : <span className="play-shell-text-muted">-</span>}
                  </div>
                </div>
              )}

              {!compact && round.note && <p className="play-shell-text-muted mt-2 hidden text-[0.68rem] md:block">{round.note}</p>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
