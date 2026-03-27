import React, { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AiLivePanel, { type AiLiveSignal } from "../../components/play/AiLivePanel";
import GameArena from "../../components/play/GameArena";
import GameHudHeader, { type GameHudStat } from "../../components/play/GameHudHeader";
import MoveControls, { type MoveControlOption } from "../../components/play/MoveControls";
import RoundHistoryStrip from "../../components/play/RoundHistoryStrip";
import { cockpitGridTemplates, useCockpitViewport } from "../../components/play/cockpitViewport";
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
  const viewport = useCockpitViewport();
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
      ref={viewport.rootRef}
      data-testid="training-workspace"
      className="h-full min-h-0 overflow-hidden bg-[color:var(--app-bg)]"
      style={{
        ...viewport.style,
        backgroundImage:
          "radial-gradient(circle at top left, color-mix(in srgb, var(--app-accent-soft) 30%, transparent), transparent 28%), radial-gradient(circle at right center, color-mix(in srgb, var(--app-accent-muted) 14%, transparent), transparent 22%)",
      }}
    >
      <section className="grid h-full min-h-0 overflow-hidden" style={{ gridTemplateRows: cockpitGridTemplates.rows }}>
        <div className="grid min-h-0" style={{ gridTemplateColumns: cockpitGridTemplates.topColumns }}>
          <div className="grid min-h-0 [grid-template-rows:auto_minmax(0,1fr)] border-r border-[color:var(--app-border)]">
            <div
              data-testid="training-header"
              className="border-b border-[color:var(--app-border)] px-[var(--play-cockpit-header-pad-x)] py-[var(--play-cockpit-header-pad-y)]"
            >
              <GameHudHeader
                title="Training Match"
                subtitle={training.currentPlayerName}
                stats={headerStats}
                alignment="center"
                compact
                density={viewport.density}
              />
            </div>

            <div data-testid="training-arena" className="min-h-0 px-[var(--play-cockpit-pad-x)] py-[var(--play-cockpit-pad-y)]">
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
                    density={viewport.density}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div data-testid="training-ai-rail" className="min-h-0 px-[var(--play-cockpit-pad-x)] py-[var(--play-cockpit-pad-y)]">
            <AiLivePanel
              title="AI Live"
              summary="Unavailable during training"
              signals={trainingRailSignals}
              signalLayout="rows"
              notes={["AI off", "Random mode on"]}
              inactive
              density={viewport.density}
              inactiveMessage={
                <div className={`rounded-[0.95rem] border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] text-[color:var(--app-text-muted)] ${
                  viewport.density === "tight"
                    ? "px-2.5 py-2 text-[0.68rem] leading-4"
                    : viewport.density === "compact"
                      ? "px-3 py-2.5 text-[0.74rem] leading-5"
                      : "px-3 py-3 text-sm"
                }`}>
                  Training uses random hands only. Prediction and counterplay stay disabled until challenge mode.
                </div>
              }
            />
          </div>
        </div>

        <div
          className={`grid min-h-0 border-t border-[color:var(--app-border)] bg-[color:color-mix(in_srgb,var(--app-surface-subtle)_24%,transparent)] ${
            viewport.density === "tight"
              ? "pt-[clamp(0.24rem,0.12rem+0.18vh,0.34rem)] pb-[calc(var(--play-cockpit-bottom-safe)+clamp(0.12rem,0.06rem+0.12vh,0.2rem))]"
              : viewport.density === "compact"
                ? "pt-[clamp(0.3rem,0.16rem+0.22vh,0.44rem)] pb-[calc(var(--play-cockpit-bottom-safe)+clamp(0.16rem,0.08rem+0.16vh,0.26rem))]"
                : "pt-[clamp(0.45rem,0.18rem+0.9vh,0.9rem)] pb-[calc(var(--play-cockpit-bottom-safe)+clamp(0.25rem,0.1rem+0.45vh,0.55rem))]"
          }`}
          style={{ gridTemplateColumns: cockpitGridTemplates.dockColumns }}
        >
          <div
            data-testid="training-move-controls"
            className="min-h-0 border-r border-[color:var(--app-border)] px-[var(--play-cockpit-pad-x)] py-[var(--play-cockpit-pad-y)]"
          >
            <MoveControls
              title="Choose move"
              options={moveOptions}
              variant="challenge"
              density={viewport.density}
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

          <div data-testid="training-recent-strip" className="min-h-0 px-[var(--play-cockpit-pad-x)] py-[var(--play-cockpit-pad-y)]">
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
