import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, Navigate } from "react-router-dom";
import AiLivePanel from "../../components/play/AiLivePanel";
import GameArena from "../../components/play/GameArena";
import GameHudHeader, { type GameHudStat } from "../../components/play/GameHudHeader";
import MoveControls, { type MoveControlOption } from "../../components/play/MoveControls";
import PredictionSourcesPanel from "../../components/play/PredictionSourcesPanel";
import RoundHistoryStrip from "../../components/play/RoundHistoryStrip";
import { useChallengeRuntime } from "../../hooks/useChallengeRuntime";
import {
  PLAY_DASHBOARD_PATH,
  buildTrainingStartPath,
  profileNeedsTraining,
} from "../../playEntry";
import { useStats } from "../../stats";

function formatMoveLabel(move?: "rock" | "paper" | "scissors") {
  return move ? `${move.charAt(0).toUpperCase() + move.slice(1)}` : "Pending";
}

export default function ChallengeGamePage() {
  const { currentProfile } = useStats();
  const runtime = useChallengeRuntime();

  if (profileNeedsTraining(currentProfile)) {
    return <Navigate to={buildTrainingStartPath()} replace />;
  }

  if (!currentProfile?.predictorDefault) {
    return <Navigate to={PLAY_DASHBOARD_PATH} replace />;
  }

  const headerStats: GameHudStat[] = [
    { label: "Best of", value: `${runtime.bestOf}`, tone: "accent" },
    { label: "Score", value: runtime.scoreLabel },
  ];

  const moveOptions: MoveControlOption[] = [
    {
      id: "rock",
      label: "Rock",
      move: "rock",
      hotkey: "1",
      hint: runtime.selectedMove === "rock" ? "Locked for reveal" : "Hard stop",
      selected: runtime.selectedMove === "rock",
      disabled: runtime.isInputLocked,
    },
    {
      id: "paper",
      label: "Paper",
      move: "paper",
      hotkey: "2",
      hint: runtime.selectedMove === "paper" ? "Locked for reveal" : "Cover route",
      selected: runtime.selectedMove === "paper",
      disabled: runtime.isInputLocked,
    },
    {
      id: "scissors",
      label: "Scissors",
      move: "scissors",
      hotkey: "3",
      hint: runtime.selectedMove === "scissors" ? "Locked for reveal" : "Punish tell",
      selected: runtime.selectedMove === "scissors",
      disabled: runtime.isInputLocked,
    },
  ];

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden bg-[color:var(--app-bg)]"
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
                subtitle={runtime.currentPlayerName}
                stats={headerStats}
                alignment="center"
                statColumns={2}
                compact
                actions={
                  <Link
                    to={PLAY_DASHBOARD_PATH}
                    className="play-shell-button play-shell-button-muted inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold"
                  >
                    Dashboard
                  </Link>
                }
              />
            </div>

            <div className="min-h-0 px-3 py-3 sm:px-4 sm:py-4">
              <motion.div
                key={`${runtime.phase}-${runtime.roundNumber}-${runtime.playerPick ?? "none"}-${runtime.aiPick ?? "none"}`}
                className="h-full"
                initial={{ opacity: 0.92, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <GameArena
                  title={`Round ${runtime.roundNumber}`}
                  leftSlot={{
                    label: "Player",
                    title: runtime.currentPlayerName,
                    detail:
                      runtime.phase === "idle"
                        ? "Select your hand"
                        : runtime.playerPick
                          ? `${formatMoveLabel(runtime.playerPick)} selected`
                          : "Waiting",
                    move: runtime.playerPick,
                    tone: "player",
                    meta: runtime.phase === "idle" ? "Ready" : "Live",
                  }}
                  rightSlot={{
                    label: "AI",
                    title: "Predictor",
                    detail:
                      runtime.phase === "idle"
                        ? runtime.liveSnapshot?.reason ?? "Watching your opener"
                        : runtime.aiPick
                          ? `${formatMoveLabel(runtime.aiPick)} queued`
                          : runtime.liveSnapshot?.counterMove
                            ? `${formatMoveLabel(runtime.liveSnapshot.counterMove)} route`
                            : "Counter route",
                    move: runtime.aiPick,
                    tone: "ai",
                    meta: runtime.liveSnapshot?.counterMove ? "Armed" : "Tracking",
                  }}
                  centerLabel={runtime.revealState.centerLabel}
                  centerTitle={runtime.revealState.centerTitle}
                  centerDetail={runtime.revealState.centerDetail}
                  centerBadge={`${Math.min(runtime.roundNumber, runtime.bestOf)} / ${runtime.bestOf}`}
                  centerEmphasis="strong"
                />
              </motion.div>
            </div>
          </div>

          <div className="min-h-0 px-3 py-3 sm:px-4 sm:py-4">
            <AiLivePanel
              title="AI Live"
              summary="Intent, counter plan, and source balance"
              signals={runtime.aiSignals}
              signalLayout="rows"
              notes={runtime.liveSnapshot?.topExperts.slice(0, 2).map(expert => expert.name) ?? ["Predictor active"]}
            >
              <PredictionSourcesPanel title="Source mix" sources={runtime.predictionSources} layout="rows" metaLabel={null} />
            </AiLivePanel>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] border-t border-[color:var(--app-border)] bg-[color:color-mix(in_srgb,var(--app-surface-subtle)_24%,transparent)] pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="min-h-0 border-r border-[color:var(--app-border)] px-3 py-3.5 sm:px-4 sm:py-4">
            <MoveControls
              title="Choose move"
              options={moveOptions}
              variant="challenge"
              footer={runtime.resultSummary ?? `Score ${runtime.scoreLabel}`}
              onSelect={option => runtime.selectMove(option.move)}
            />
          </div>

          <div className="min-h-0 px-3 py-3.5 sm:px-4 sm:py-4">
            <RoundHistoryStrip title="Recent" rounds={runtime.matchHistory} compact metaLabel={null} />
          </div>
        </div>
      </section>

      <AnimatePresence>
        {runtime.resultBanner && (
          <motion.div
            className="absolute inset-0 z-20 flex items-center justify-center bg-[color:color-mix(in_srgb,var(--app-overlay)_78%,transparent)] px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full max-w-xl rounded-[1.75rem] border border-[color:var(--app-border-strong)] bg-[color:var(--app-surface-card)] p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="challenge-results-title"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full border border-[color:var(--app-border-strong)] bg-[color:var(--app-accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--app-accent-strong)]">
                    {runtime.resultBanner}
                  </span>
                  <h2
                    id="challenge-results-title"
                    className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--app-text-strong)]"
                  >
                    {runtime.resultBanner === "Victory" ? "Challenge cleared" : "Challenge finished"}
                  </h2>
                  <p className="mt-2 text-sm text-[color:var(--app-text-secondary)]">
                    Final score {runtime.scoreLabel}. Match score {runtime.matchScoreTotal.toLocaleString()}.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="font-semibold text-[color:var(--app-text-primary)]">Best of</span>
                  <select
                    value={runtime.bestOf}
                    onChange={event => runtime.setBestOf(Number(event.target.value) as 3 | 5 | 7)}
                    className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface-input)] px-3 py-2 text-[color:var(--app-text-primary)]"
                  >
                    {runtime.bestOfOptions.map(option => (
                      <option key={option} value={option}>
                        Best of {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  <span className="font-semibold text-[color:var(--app-text-primary)]">Difficulty</span>
                  <select
                    value={runtime.aiMode}
                    onChange={event => runtime.setAiMode(event.target.value as "fair" | "normal" | "ruthless")}
                    className="rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface-input)] px-3 py-2 text-[color:var(--app-text-primary)]"
                  >
                    {runtime.difficultyOptions.map(option => (
                      <option key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={runtime.playAgain}
                  className="play-shell-button play-shell-button-accent inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold"
                >
                  Play Again
                </button>
                <button
                  type="button"
                  onClick={runtime.goToDashboard}
                  className="play-shell-button play-shell-button-muted inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold"
                >
                  Exit Match
                </button>
                <Link
                  to="/play/leaderboard"
                  className="play-shell-button play-shell-button-muted inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold"
                >
                  View Leaderboard
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
