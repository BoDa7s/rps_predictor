import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BestOf, Move, Outcome } from "../gameTypes";
import { resolveOutcome } from "../gameRules";
import { loadMatchTimings } from "../matchTimings";
import { PLAY_DASHBOARD_PATH, TRAINING_ROUNDS_REQUIRED } from "../playEntry";
import { usePlayers } from "../players";
import { useStats } from "../stats";

export type TrainingPhase = "idle" | "selected" | "countdown" | "reveal" | "resolve" | "feedback";

export interface TrainingHistoryEntry {
  id: string;
  label: string;
  playerMove?: Move;
  aiMove?: Move;
  outcome: Outcome | "pending";
}

const MOVES: Move[] = ["rock", "paper", "scissors"];
const TRAINING_BEST_OF: BestOf = 5;
const TRAINING_CONFIDENCE = 0.33;
const TRAINING_REASON = "Training random mode";

function randomMove(): Move {
  return MOVES[Math.floor(Math.random() * MOVES.length)] as Move;
}

function confidenceBucket(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.45) return "medium";
  return "low";
}

export function useTrainingRuntime() {
  const navigate = useNavigate();
  const { currentPlayer } = usePlayers();
  const { currentProfile, rounds, logRound, updateProfile } = useStats();
  const timings = useMemo(() => loadMatchTimings().practice, []);
  const [phase, setPhase] = useState<TrainingPhase>("idle");
  const [count, setCount] = useState(3);
  const [roundNumber, setRoundNumber] = useState(1);
  const [playerPick, setPlayerPick] = useState<Move | undefined>();
  const [aiPick, setAiPick] = useState<Move | undefined>();
  const [outcome, setOutcome] = useState<Outcome | undefined>();
  const [isCompleting, setIsCompleting] = useState(false);
  const countdownRef = useRef<number | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);
  const roundStartRef = useRef<number | null>(typeof performance !== "undefined" ? performance.now() : Date.now());
  const playerPickRef = useRef<Move | undefined>();
  const aiStreakRef = useRef(0);
  const playerStreakRef = useRef(0);
  const pendingCompletionRef = useRef(false);
  const profileTrainingCount = currentProfile?.trainingCount ?? 0;
  const completedRounds = Math.min(profileTrainingCount, TRAINING_ROUNDS_REQUIRED);
  const currentPlayerName = currentPlayer?.playerName?.trim() || "Player";

  const clearCountdown = useCallback(() => {
    if (countdownRef.current !== null) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const clearTimeouts = useCallback(() => {
    timeoutIdsRef.current.forEach(id => window.clearTimeout(id));
    timeoutIdsRef.current = [];
  }, []);

  const scheduleTimeout = useCallback((callback: () => void, delayMs: number) => {
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter(id => id !== timeoutId);
      callback();
    }, delayMs);
    timeoutIdsRef.current = [...timeoutIdsRef.current, timeoutId];
    return timeoutId;
  }, []);

  const resetRound = useCallback(
    (nextRoundNumber?: number) => {
      clearCountdown();
      clearTimeouts();
      setCount(3);
      setPhase("idle");
      setPlayerPick(undefined);
      playerPickRef.current = undefined;
      setAiPick(undefined);
      setOutcome(undefined);
      setIsCompleting(false);
      pendingCompletionRef.current = false;
      roundStartRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (typeof nextRoundNumber === "number") {
        setRoundNumber(Math.max(1, Math.min(nextRoundNumber, TRAINING_ROUNDS_REQUIRED)));
      }
    },
    [clearCountdown, clearTimeouts],
  );

  useEffect(() => {
    resetRound(Math.min(TRAINING_ROUNDS_REQUIRED, completedRounds + 1));
    aiStreakRef.current = 0;
    playerStreakRef.current = 0;
  }, [currentProfile?.id, resetRound]);

  useEffect(() => {
    if (phase !== "idle") return;
    setRoundNumber(Math.min(TRAINING_ROUNDS_REQUIRED, completedRounds + 1));
  }, [completedRounds, phase]);

  useEffect(() => {
    return () => {
      clearCountdown();
      clearTimeouts();
    };
  }, [clearCountdown, clearTimeouts]);

  const finishTraining = useCallback(() => {
    setIsCompleting(true);
    scheduleTimeout(() => {
      navigate(PLAY_DASHBOARD_PATH, { replace: true });
    }, 260);
  }, [navigate, scheduleTimeout]);

  const advanceRound = useCallback(() => {
    if (pendingCompletionRef.current) {
      finishTraining();
      return;
    }

    const nextRoundNumber = Math.min(TRAINING_ROUNDS_REQUIRED, completedRounds + 1);
    resetRound(nextRoundNumber);
  }, [completedRounds, finishTraining, resetRound]);

  const commitRound = useCallback(
    (playerMove: Move, aiMove: Move, roundOutcome: Outcome) => {
      const now = new Date().toISOString();
      const decisionStart = roundStartRef.current;
      const decisionTimeMs =
        typeof decisionStart === "number"
          ? Math.max(0, Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - decisionStart))
          : undefined;
      const aiStreak = roundOutcome === "lose" ? aiStreakRef.current + 1 : 0;
      const playerStreak = roundOutcome === "win" ? playerStreakRef.current + 1 : 0;
      aiStreakRef.current = aiStreak;
      playerStreakRef.current = playerStreak;

      logRound({
        t: now,
        mode: "practice",
        bestOf: TRAINING_BEST_OF,
        difficulty: "fair",
        player: playerMove,
        ai: aiMove,
        outcome: roundOutcome,
        policy: "heuristic",
        heuristic: {
          predicted: null,
          conf: TRAINING_CONFIDENCE,
          reason: TRAINING_REASON,
        },
        streakAI: aiStreak,
        streakYou: playerStreak,
        reason: TRAINING_REASON,
        confidence: TRAINING_CONFIDENCE,
        confidenceBucket: confidenceBucket(TRAINING_CONFIDENCE),
        decisionTimeMs,
      });

      if (!currentProfile) return;

      const nextCount = Math.min(TRAINING_ROUNDS_REQUIRED, profileTrainingCount + 1);
      const completedTraining = nextCount >= TRAINING_ROUNDS_REQUIRED;
      pendingCompletionRef.current = completedTraining;

      updateProfile(currentProfile.id, {
        trainingCount: nextCount,
        trained: completedTraining ? true : currentProfile.trained,
        predictorDefault: completedTraining ? true : currentProfile.predictorDefault,
        seenPostTrainingCTA: completedTraining ? true : currentProfile.seenPostTrainingCTA,
      });
    },
    [currentProfile, logRound, profileTrainingCount, updateProfile],
  );

  const reveal = useCallback(() => {
    const playerMove = playerPickRef.current;
    if (!playerMove) return;

    const opponentMove = randomMove();
    setAiPick(opponentMove);
    setPhase("reveal");

    scheduleTimeout(() => {
      const roundOutcome = resolveOutcome(playerMove, opponentMove);
      setOutcome(roundOutcome);
      setPhase("resolve");

      scheduleTimeout(() => {
        commitRound(playerMove, opponentMove, roundOutcome);
        setPhase("feedback");
      }, 150);
    }, timings.revealHoldMs);
  }, [commitRound, scheduleTimeout, timings.revealHoldMs]);

  const startCountdown = useCallback(() => {
    clearCountdown();
    setPhase("countdown");
    setCount(3);
    countdownRef.current = window.setInterval(() => {
      setCount(prev => {
        const next = prev - 1;
        if (next <= 0) {
          clearCountdown();
          reveal();
          return 0;
        }
        return next;
      });
    }, timings.countdownTickMs);
  }, [clearCountdown, reveal, timings.countdownTickMs]);

  const selectMove = useCallback(
    (move: Move) => {
      if (phase !== "idle" || isCompleting) return;
      setPlayerPick(move);
      playerPickRef.current = move;
      setPhase("selected");
      roundStartRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
      scheduleTimeout(startCountdown, 140);
    },
    [isCompleting, phase, scheduleTimeout, startCountdown],
  );

  useEffect(() => {
    if (phase !== "selected") return;
    const timeoutId = scheduleTimeout(() => {
      if (playerPickRef.current) {
        startCountdown();
      }
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [phase, scheduleTimeout, startCountdown]);

  useEffect(() => {
    if (phase !== "feedback") return;
    const timeoutId = scheduleTimeout(advanceRound, Math.min(timings.resultBannerMs, 600));
    return () => window.clearTimeout(timeoutId);
  }, [advanceRound, phase, scheduleTimeout, timings.resultBannerMs]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === "1") selectMove("rock");
      if (event.key === "2") selectMove("paper");
      if (event.key === "3") selectMove("scissors");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectMove]);

  const practiceRounds = useMemo(
    () => rounds.filter(round => round.mode === "practice").slice(-TRAINING_ROUNDS_REQUIRED),
    [rounds],
  );

  const recentRounds = useMemo<TrainingHistoryEntry[]>(() => {
    return Array.from({ length: TRAINING_ROUNDS_REQUIRED }, (_, index) => {
      const loggedRound = practiceRounds[index];
      if (loggedRound) {
        return {
          id: loggedRound.id,
          label: `R${index + 1}`,
          playerMove: loggedRound.player,
          aiMove: loggedRound.ai,
          outcome: loggedRound.outcome,
        };
      }

      return {
        id: `pending-${index + 1}`,
        label: `R${index + 1}`,
        outcome: "pending",
      };
    });
  }, [practiceRounds]);

  const revealState = useMemo(() => {
    const completionMessage = completedRounds >= TRAINING_ROUNDS_REQUIRED || isCompleting;
    if (completionMessage && phase === "feedback") {
      return {
        centerLabel: "Training complete",
        centerTitle: "Warm-up finished",
        centerDetail: "Redirecting to dashboard",
      };
    }
    if (phase === "feedback") {
      return {
        centerLabel: outcome === "win" ? "Round won" : outcome === "lose" ? "Round lost" : "Round tied",
        centerTitle:
          outcome === "win" ? "Nice read" : outcome === "lose" ? "Random catch" : "Dead even",
        centerDetail: "Preparing next round",
      };
    }
    if (phase === "resolve" || phase === "reveal") {
      return {
        centerLabel: "Reveal",
        centerTitle: "Hands shown",
        centerDetail:
          playerPick && aiPick
            ? `${playerPick.charAt(0).toUpperCase() + playerPick.slice(1)} vs ${aiPick.charAt(0).toUpperCase() + aiPick.slice(1)}`
            : "Resolving round",
      };
    }
    if (phase === "countdown") {
      return {
        centerLabel: "Lock in",
        centerTitle: count > 0 ? `${count}` : "Reveal",
        centerDetail: "Random hand is about to show",
      };
    }
    if (phase === "selected") {
      return {
        centerLabel: "Locked",
        centerTitle: "Move selected",
        centerDetail: "Countdown starting",
      };
    }
    return {
      centerLabel: "Warm-up",
      centerTitle: "Choose a move",
      centerDetail: "AI off. Random mode on.",
    };
  }, [aiPick, completedRounds, count, isCompleting, outcome, phase, playerPick]);

  return {
    currentPlayerName,
    trainingCount: completedRounds,
    totalRounds: TRAINING_ROUNDS_REQUIRED,
    roundNumber,
    phase,
    countdown: count,
    playerPick,
    aiPick,
    outcome,
    isInputLocked: phase !== "idle" || isCompleting,
    isCompleting,
    revealState,
    recentRounds,
    selectMove,
  };
}
