import React, { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import AiLivePanel, { type AiLiveSignal } from "../../components/play/AiLivePanel";
import GameArena from "../../components/play/GameArena";
import GameHudHeader, { type GameHudStat } from "../../components/play/GameHudHeader";
import MoveControls, { type MoveControlOption } from "../../components/play/MoveControls";
import RoundHistoryStrip from "../../components/play/RoundHistoryStrip";
import { useTrainingRuntime } from "../../hooks/useTrainingRuntime";

const trainingRailSignals: AiLiveSignal[] = [
  { label: "AI", value: "Off" },
  { label: "Mode", value: "Random" },
  { label: "Prediction", value: "Unavailable" },
  { label: "Counter", value: "Disabled" },
];

const phaseLabels: Record<ReturnType<typeof useTrainingRuntime>["phase"], string> = {
  idle: "Choose move",
  selected: "Move locked",
  countdown: "Countdown",
  reveal: "Reveal",
  resolve: "Resolve",
  feedback: "Next round",
};

function getPlayerDetail(phase: ReturnType<typeof useTrainingRuntime>["phase"], pickLabel: string | null) {
  if (phase === "feedback") return pickLabel ? `${pickLabel} recorded` : "Round logged";
  if (phase === "resolve" || phase === "reveal") return pickLabel ? `${pickLabel} revealed` : "Revealing";
  if (phase === "countdown") return pickLabel ? `${pickLabel} locked in` : "Locked in";
  if (phase === "selected") return pickLabel ? `${pickLabel} selected` : "Move selected";
  return "Awaiting selection";
}

function getOpponentDetail(
  phase: ReturnType<typeof useTrainingRuntime>["phase"],
  opponentLabel: string | null,
  isCompleting: boolean,
) {
  if (isCompleting) return "Routing to dashboard";
  if (phase === "feedback") return opponentLabel ? `${opponentLabel} shown` : "Round complete";
  if (phase === "resolve" || phase === "reveal") return opponentLabel ? `${opponentLabel} shown` : "Random reveal";
  if (phase === "countdown" || phase === "selected") return "Hidden until reveal";
  return "Random mode ready";
}

export default function TrainingGamePage() {
  const training = useTrainingRuntime();
  const playerMoveLabel = training.playerPick
    ? `${training.playerPick.charAt(0).toUpperCase() + training.playerPick.slice(1)}`
    : null;
  const aiMoveLabel = training.aiPick ? `${training.aiPick.charAt(0).toUpperCase() + training.aiPick.slice(1)}` : null;
  const headerStats: GameHudStat[] = [
    { label: "Round", value: `${Math.min(training.roundNumber, training.totalRounds)} / ${training.totalRounds}`, tone: "accent" },
    { label: "AI", value: "OFF", tone: "danger" },
    { label: "Random", value: "ON", tone: "success" },
    {
      label: "Progress",
      value: `${training.trainingCount}/${training.totalRounds}`,
    },
  ];

  const moveOptions = useMemo<MoveControlOption[]>(
    () => [
      {
        id: "rock",
        label: "Rock",
        move: "rock",
        hotkey: "1",
        hint: training.phase === "idle" ? "Warm-up pick" : "Await next round",
        selected: training.playerPick === "rock",
        disabled: training.isInputLocked,
      },
      {
        id: "paper",
        label: "Paper",
        move: "paper",
        hotkey: "2",
        hint: training.phase === "idle" ? "Current option" : "Await next round",
        selected: training.playerPick === "paper",
        disabled: training.isInputLocked,
      },
      {
        id: "scissors",
        label: "Scissors",
        move: "scissors",
        hotkey: "3",
        hint: training.phase === "idle" ? "Switch option" : "Await next round",
        selected: training.playerPick === "scissors",
        disabled: training.isInputLocked,
      },
    ],
    [training.isInputLocked, training.phase, training.playerPick],
  );

  const arenaKey = `${training.roundNumber}-${training.phase}-${training.playerPick ?? "none"}-${training.aiPick ?? "none"}-${training.outcome ?? "none"}`;
  const historyKey = training.recentRounds.map(round => `${round.label}:${round.outcome}:${round.playerMove ?? "-"}:${round.aiMove ?? "-"}`).join("|");

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
                subtitle={training.currentPlayerName}
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
              <AnimatePresence mode="wait">
                <motion.div
                  key={arenaKey}
                  initial={{ opacity: 0.72, y: 8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0.72, y: -6, scale: 1.01 }}
                  transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
                  className="h-full"
                >
                  <GameArena
                    title={`Round ${Math.min(training.roundNumber, training.totalRounds)}`}
                    subtitle={phaseLabels[training.phase]}
                    leftSlot={{
                      label: "Player",
                      title: training.currentPlayerName,
                      detail: getPlayerDetail(training.phase, playerMoveLabel),
                      move: training.playerPick,
                      placeholder: "Pick",
                      tone: "player",
                      meta: training.phase === "idle" ? "Ready" : training.phase === "feedback" ? "Logged" : "Live",
                    }}
                    rightSlot={{
                      label: "Random",
                      title: "Random hand",
                      detail: getOpponentDetail(training.phase, aiMoveLabel, training.isCompleting),
                      move:
                        training.phase === "reveal" ||
                        training.phase === "resolve" ||
                        training.phase === "feedback" ||
                        training.isCompleting
                          ? training.aiPick
                          : undefined,
                      placeholder: "Hidden",
                      tone: "ai",
                      meta: "AI off",
                    }}
                    centerLabel={training.revealState.centerLabel}
                    centerTitle={training.revealState.centerTitle}
                    centerDetail={training.revealState.centerDetail}
                    centerBadge={`${Math.min(training.roundNumber, training.totalRounds)} / ${training.totalRounds}`}
                    centerEmphasis="strong"
                  />
                </motion.div>
              </AnimatePresence>
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
                  Training uses random hands only. Prediction and counterplay stay disabled until challenge mode.
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
              onSelect={option => training.selectMove(option.move)}
              footer={
                training.phase === "countdown"
                  ? `Reveal in ${Math.max(training.countdown, 0)}`
                  : training.phase === "idle"
                    ? "Keys 1-3"
                    : training.phase === "feedback"
                      ? training.isCompleting
                        ? "Finishing"
                        : "Next round"
                      : phaseLabels[training.phase]
              }
            />
          </div>

          <div className="min-h-0 px-3 py-3.5 sm:px-4 sm:py-4">
            <motion.div
              key={historyKey}
              initial={{ opacity: 0.75, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
              className="h-full"
            >
              <RoundHistoryStrip title="Recent" rounds={training.recentRounds} compact metaLabel={null} />
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
