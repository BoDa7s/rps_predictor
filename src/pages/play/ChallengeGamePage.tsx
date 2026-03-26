import React from "react";
import { Link } from "react-router-dom";
import AiLivePanel, { type AiLiveSignal } from "../../components/play/AiLivePanel";
import GameArena from "../../components/play/GameArena";
import GameHudHeader, { type GameHudStat } from "../../components/play/GameHudHeader";
import MoveControls, { type MoveControlOption } from "../../components/play/MoveControls";
import PredictionSourcesPanel, { type PredictionSourceItem } from "../../components/play/PredictionSourcesPanel";
import RoundHistoryStrip, { type RoundHistoryEntry } from "../../components/play/RoundHistoryStrip";
import { usePlayers } from "../../players";

const headerStats: GameHudStat[] = [
  { label: "Best of", value: "5", tone: "accent" },
  { label: "Score", value: "1 - 2" },
];

const moveOptions: MoveControlOption[] = [
  { id: "rock", label: "Rock", move: "rock", hotkey: "1", hint: "Break streak", disabled: true },
  { id: "paper", label: "Paper", move: "paper", hotkey: "2", hint: "Current pick", selected: true, disabled: true },
  { id: "scissors", label: "Scissors", move: "scissors", hotkey: "3", hint: "Counter route", disabled: true },
];

const aiSignals: AiLiveSignal[] = [
  { label: "Intent", value: "Counter paper", tone: "accent" },
  { label: "Confidence", value: "74%", tone: "warning" },
  { label: "Counter", value: "Scissors queued" },
  { label: "Tempo", value: "Aggressive" },
  { label: "Risk", value: "Pattern lock", tone: "danger" },
];

const predictionSources: PredictionSourceItem[] = [
  { label: "Last-two", value: "Strong", strength: 78 },
  { label: "Recovery", value: "Medium", strength: 61 },
  { label: "Long window", value: "Support", strength: 42 },
  { label: "Bluff check", value: "Light", strength: 31 },
];

const historyRounds: RoundHistoryEntry[] = [
  { id: "c1", label: "R1", playerMove: "rock", aiMove: "paper", outcome: "lose", note: "AI read" },
  { id: "c2", label: "R2", playerMove: "paper", aiMove: "rock", outcome: "win", note: "Punished" },
  { id: "c3", label: "R3", playerMove: "paper", aiMove: "paper", outcome: "tie", note: "Deadlock" },
  { id: "c4", label: "R4", playerMove: "paper", outcome: "pending", note: "Locked" },
  { id: "c5", label: "R5", outcome: "pending", note: "Queued" },
];

export default function ChallengeGamePage() {
  const { currentPlayer } = usePlayers();
  const playerName = currentPlayer?.playerName?.trim() || "Player";

  return (
    <div
      className="h-full min-h-0 overflow-hidden bg-[color:var(--app-bg)]"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, color-mix(in srgb, var(--app-accent-soft) 32%, transparent), transparent 28%), radial-gradient(circle at right center, color-mix(in srgb, var(--app-accent-muted) 18%, transparent), transparent 22%)",
      }}
    >
      <section className="grid h-full min-h-0 overflow-hidden [grid-template-rows:minmax(0,1fr)_10.5rem] lg:[grid-template-rows:minmax(0,1fr)_11rem]">
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_13.5rem] sm:grid-cols-[minmax(0,1fr)_16rem] lg:grid-cols-[minmax(0,1fr)_clamp(18rem,24vw,22rem)]">
          <div className="grid min-h-0 [grid-template-rows:auto_minmax(0,1fr)] border-r border-[color:var(--app-border)]">
            <div className="border-b border-[color:var(--app-border)] px-3 py-2 sm:px-4">
              <GameHudHeader
                title="Challenge Match"
                subtitle={playerName}
                stats={headerStats}
                alignment="center"
                statColumns={2}
                compact
                actions={
                  <Link
                    to="/play/dashboard"
                    className="play-shell-button play-shell-button-muted inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold"
                  >
                    Dashboard
                  </Link>
                }
              />
            </div>

            <div className="min-h-0 px-3 py-3 sm:px-4 sm:py-4">
              <GameArena
                title="Round 4"
                leftSlot={{
                  label: "Player",
                  title: playerName,
                  detail: "Paper selected",
                  move: "paper",
                  tone: "player",
                  meta: "Live",
                }}
                rightSlot={{
                  label: "AI",
                  title: "Counter engine",
                  detail: "Scissors route",
                  move: "scissors",
                  tone: "ai",
                  meta: "Ready",
                }}
                centerLabel="Locked in"
                centerTitle="Reveal next"
                centerDetail="Paper vs Scissors"
                centerBadge="4 / 5"
                centerEmphasis="strong"
              />
            </div>
          </div>

          <div className="min-h-0 px-3 py-3 sm:px-4 sm:py-4">
            <AiLivePanel
              title="AI Live"
              summary="Intent, counter plan, and read quality"
              signals={aiSignals}
              signalLayout="rows"
              notes={["Read stable", "Tempo high"]}
            >
              <PredictionSourcesPanel title="Source mix" sources={predictionSources} layout="rows" metaLabel={null} />
            </AiLivePanel>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] border-t border-[color:var(--app-border)] bg-[color:color-mix(in_srgb,var(--app-surface-subtle)_24%,transparent)] pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="min-h-0 border-r border-[color:var(--app-border)] px-3 py-3.5 sm:px-4 sm:py-4">
            <MoveControls
              title="Choose move"
              options={moveOptions}
              variant="challenge"
            />
          </div>

          <div className="min-h-0 px-3 py-3.5 sm:px-4 sm:py-4">
            <RoundHistoryStrip title="Recent" rounds={historyRounds} compact metaLabel={null} />
          </div>
        </div>
      </section>
    </div>
  );
}
