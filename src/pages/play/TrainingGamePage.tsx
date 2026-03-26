import React from "react";
import { Link } from "react-router-dom";
import AiLivePanel, { type AiLiveSignal } from "../../components/play/AiLivePanel";
import GameArena from "../../components/play/GameArena";
import GameHudHeader, { type GameHudStat } from "../../components/play/GameHudHeader";
import MoveControls, { type MoveControlOption } from "../../components/play/MoveControls";
import RoundHistoryStrip, { type RoundHistoryEntry } from "../../components/play/RoundHistoryStrip";
import { usePlayers } from "../../players";

const headerStats: GameHudStat[] = [
  { label: "Round", value: "2 / 5", tone: "accent" },
  { label: "AI", value: "OFF", tone: "danger" },
  { label: "Random", value: "ON", tone: "success" },
  { label: "Unlock", value: "Challenge" },
];

const moveOptions: MoveControlOption[] = [
  { id: "rock", label: "Rock", move: "rock", hotkey: "1", hint: "Warm-up pick", disabled: true },
  { id: "paper", label: "Paper", move: "paper", hotkey: "2", hint: "Current pick", selected: true, disabled: true },
  { id: "scissors", label: "Scissors", move: "scissors", hotkey: "3", hint: "Switch option", disabled: true },
];

const trainingRailSignals: AiLiveSignal[] = [
  { label: "AI", value: "Off" },
  { label: "Mode", value: "Random" },
  { label: "Prediction", value: "Unavailable" },
  { label: "Counter", value: "Disabled" },
];

const historyRounds: RoundHistoryEntry[] = [
  { id: "t1", label: "R1", playerMove: "rock", aiMove: "paper", outcome: "lose" },
  { id: "t2", label: "R2", playerMove: "paper", aiMove: "paper", outcome: "tie" },
  { id: "t3", label: "R3", playerMove: "scissors", outcome: "pending" },
  { id: "t4", label: "R4", outcome: "pending" },
  { id: "t5", label: "R5", outcome: "pending" },
];

export default function TrainingGamePage() {
  const { currentPlayer } = usePlayers();
  const playerName = currentPlayer?.playerName?.trim() || "Player";

  return (
    <div
      className="h-full min-h-0 overflow-hidden bg-[color:var(--app-bg)]"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, color-mix(in srgb, var(--app-accent-soft) 30%, transparent), transparent 28%), radial-gradient(circle at right center, color-mix(in srgb, var(--app-accent-muted) 14%, transparent), transparent 22%)",
      }}
    >
      <section className="grid h-full min-h-0 overflow-hidden [grid-template-rows:minmax(0,1fr)_10.5rem] lg:[grid-template-rows:minmax(0,1fr)_11rem]">
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_13.5rem] sm:grid-cols-[minmax(0,1fr)_16rem] lg:grid-cols-[minmax(0,1fr)_clamp(18rem,24vw,22rem)]">
          <div className="grid min-h-0 [grid-template-rows:auto_minmax(0,1fr)] border-r border-[color:var(--app-border)]">
            <div className="border-b border-[color:var(--app-border)] px-3 py-2 sm:px-4">
              <GameHudHeader
                title="Training Match"
                subtitle={playerName}
                stats={headerStats}
                alignment="center"
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
                title="Round 2"
                leftSlot={{
                  label: "Player",
                  title: playerName,
                  detail: "Paper selected",
                  move: "paper",
                  tone: "player",
                  meta: "Live",
                }}
                rightSlot={{
                  label: "Random",
                  title: "Random hand",
                  detail: "No prediction",
                  move: "rock",
                  tone: "ai",
                  meta: "AI off",
                }}
                centerLabel="Warm-up"
                centerTitle="Random reveal"
                centerDetail="No AI counterplay"
                centerBadge="2 / 5"
                centerEmphasis="strong"
              />
            </div>
          </div>

          <div className="min-h-0 px-3 py-3 sm:px-4 sm:py-4">
            <AiLivePanel
              title="AI Live"
              summary="Unavailable during training"
              signals={trainingRailSignals}
              signalLayout="rows"
              notes={["AI off", "Random mode on"]}
              inactive
              inactiveMessage={
                <div className="rounded-[0.95rem] border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] px-3 py-3 text-sm text-[color:var(--app-text-muted)]">
                  AI Live is inactive during training. Random mode is active until warm-up rounds finish.
                </div>
              }
            />
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
