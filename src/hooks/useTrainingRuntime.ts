import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BestOf, Move, Outcome } from "../gameTypes";
import { resolveOutcome } from "../gameRules";
import { loadMatchTimings } from "../matchTimings";
import { clearPersistedMatchSnapshot, loadPersistedMatchSnapshot, savePersistedMatchSnapshot } from "../matchProgress";
import { PLAY_DASHBOARD_PATH, TRAINING_ROUNDS_REQUIRED } from "../playEntry";
import { usePlayers } from "../players";
import { telemetryService } from "../telemetry";
import type { RoundLog } from "../stats";
import { useStats } from "../stats";

export type TrainingPhase = "idle" | "selected" | "countdown" | "reveal" | "resolve" | "feedback";

export interface TrainingHistoryEntry {
  id: string;
  label: string;
  playerMove?: Move;
  aiMove?: Move;
  outcome: Outcome | "pending";
}

interface PersistedTrainingMatchState {
  version: 1;
  matchId: string;
  matchStartedAt: string;
  phase: TrainingPhase;
  countdown: number;
  playerPick?: Move;
  aiPick?: Move;
  outcome?: Outcome;
  isCompleting: boolean;
  baseTrainingCount: number;
  trainingScore: { you: number; ai: number };
  loggedRounds: RoundLog[];
  aiStreak: number;
  playerStreak: number;
  pendingCompletion: boolean;
}

const MOVES: Move[] = ["rock", "paper", "scissors"];
const TRAINING_BEST_OF: BestOf = 5;
const TRAINING_CONFIDENCE = 0.33;
const TRAINING_REASON = "Training random mode";

function makeTrainingMatchId() {
  return `match-${Math.random().toString(36).slice(2, 10)}`;
}

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
  const { currentProfile, sessionId, logRound, updateProfile } = useStats();
  const timings = useMemo(() => loadMatchTimings().practice, []);
  const [phase, setPhase] = useState<TrainingPhase>("idle");
  const [count, setCount] = useState(3);
  const [roundNumber, setRoundNumber] = useState(0);
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
  const currentMatchIdRef = useRef(makeTrainingMatchId());
  const matchStartRef = useRef(new Date().toISOString());
  const currentMatchRoundsRef = useRef<RoundLog[]>([]);
  const trainingScoreRef = useRef<{ you: number; ai: number }>({ you: 0, ai: 0 });
  const completedMatchIdRef = useRef<string | null>(null);
  const completionStartedRef = useRef(false);
  const baseTrainingCountRef = useRef(0);
  const currentPlayerRef = useRef(currentPlayer);
  const currentProfileRef = useRef(currentProfile);
  const resumePhaseRef = useRef<TrainingPhase | null>(null);
  const persistEnabledRef = useRef(true);
  const initializedScopeRef = useRef<string | null>(null);
  const profileTrainingCount = currentProfile?.trainingCount ?? 0;
  const completedRounds = Math.min(profileTrainingCount, TRAINING_ROUNDS_REQUIRED);
  const currentPlayerName = currentPlayer?.playerName?.trim() || "Player";

  useEffect(() => {
    currentPlayerRef.current = currentPlayer;
  }, [currentPlayer]);

  useEffect(() => {
    currentProfileRef.current = currentProfile;
  }, [currentProfile]);

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

  const clearPersistedState = useCallback(() => {
    const activePlayer = currentPlayerRef.current;
    const activeProfile = currentProfileRef.current;
    if (!activePlayer || !activeProfile) return;
    clearPersistedMatchSnapshot("training", activePlayer.id, activeProfile.id);
  }, []);

  const upsertTelemetryTrainingMatch = useCallback(
    (status: "active" | "completed" | "abandoned", options?: { notes?: string }) => {
      const activeProfile = currentProfileRef.current;
      const activePlayer = currentPlayerRef.current;
      if (!activeProfile || !activePlayer) return;
      const roundsPlayed = currentMatchRoundsRef.current.length;
      const aiWins = currentMatchRoundsRef.current.filter(round => round.outcome === "lose").length;
      telemetryService.upsertMatch({
        id: currentMatchIdRef.current,
        sourceMatchId: currentMatchIdRef.current,
        sessionId,
        playerId: activePlayer.id,
        profileId: activeProfile.id,
        startedAt: matchStartRef.current,
        endedAt: new Date().toISOString(),
        mode: "training",
        bestOf: TRAINING_BEST_OF,
        difficulty: "fair",
        score: { ...trainingScoreRef.current },
        rounds: roundsPlayed,
        roundsPlayed,
        winner:
          trainingScoreRef.current.you > trainingScoreRef.current.ai
            ? "player"
            : trainingScoreRef.current.you < trainingScoreRef.current.ai
              ? "ai"
              : "tie",
        completed: status === "completed",
        status,
        notes: options?.notes,
        aiWinRate: roundsPlayed ? aiWins / roundsPlayed : 0,
        youSwitchedRate: 0,
      });
    },
    [sessionId],
  );

  const startNewMatch = useCallback(
    (options?: { logStartedEvent?: boolean }) => {
      const logStartedEvent = options?.logStartedEvent ?? true;
      clearCountdown();
      clearTimeouts();
      persistEnabledRef.current = true;
      resumePhaseRef.current = null;
      setCount(3);
      setPhase("idle");
      setRoundNumber(0);
      setPlayerPick(undefined);
      playerPickRef.current = undefined;
      setAiPick(undefined);
      setOutcome(undefined);
      setIsCompleting(false);
      pendingCompletionRef.current = false;
      completionStartedRef.current = false;
      aiStreakRef.current = 0;
      playerStreakRef.current = 0;
      trainingScoreRef.current = { you: 0, ai: 0 };
      currentMatchRoundsRef.current = [];
      currentMatchIdRef.current = makeTrainingMatchId();
      matchStartRef.current = new Date().toISOString();
      completedMatchIdRef.current = null;
      baseTrainingCountRef.current = currentProfileRef.current?.trainingCount ?? 0;
      roundStartRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();

      const activeProfile = currentProfileRef.current;
      const activePlayer = currentPlayerRef.current;
      if (activeProfile && activePlayer) {
        telemetryService.upsertMatch({
          id: currentMatchIdRef.current,
          sourceMatchId: currentMatchIdRef.current,
          sessionId,
          playerId: activePlayer.id,
          profileId: activeProfile.id,
          startedAt: matchStartRef.current,
          endedAt: matchStartRef.current,
          mode: "training",
          bestOf: TRAINING_BEST_OF,
          difficulty: "fair",
          score: { you: 0, ai: 0 },
          rounds: 0,
          roundsPlayed: 0,
          winner: "tie",
          completed: false,
          status: "active",
          aiWinRate: 0,
          youSwitchedRate: 0,
        });
        if (logStartedEvent) {
          telemetryService.logUIEvent({
            sessionId,
            timestamp: matchStartRef.current,
            playerId: activePlayer.id,
            profileId: activeProfile.id,
            matchId: currentMatchIdRef.current,
            surface: "training",
            action: "match-started",
          });
        }
      }
    },
    [clearCountdown, clearTimeouts, sessionId],
  );

  const restorePersistedMatch = useCallback(
    (snapshot: PersistedTrainingMatchState) => {
      clearCountdown();
      clearTimeouts();
      persistEnabledRef.current = true;
      currentMatchIdRef.current = snapshot.matchId;
      matchStartRef.current = snapshot.matchStartedAt;
      currentMatchRoundsRef.current = snapshot.loggedRounds;
      trainingScoreRef.current = snapshot.trainingScore;
      aiStreakRef.current = snapshot.aiStreak;
      playerStreakRef.current = snapshot.playerStreak;
      pendingCompletionRef.current = snapshot.pendingCompletion;
      completionStartedRef.current = false;
      completedMatchIdRef.current = null;
      baseTrainingCountRef.current = snapshot.baseTrainingCount;
      roundStartRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
      setRoundNumber(snapshot.loggedRounds.length);
      setCount(snapshot.countdown);
      setPlayerPick(snapshot.playerPick);
      playerPickRef.current = snapshot.playerPick;
      setAiPick(snapshot.aiPick);
      setOutcome(snapshot.outcome);
      setIsCompleting(snapshot.isCompleting);
      setPhase(snapshot.phase);
      resumePhaseRef.current =
        snapshot.phase === "countdown" || snapshot.phase === "reveal" || snapshot.phase === "resolve"
          ? snapshot.phase
          : null;
      upsertTelemetryTrainingMatch("active");
      telemetryService.logUIEvent({
        sessionId,
        timestamp: new Date().toISOString(),
        playerId: currentPlayerRef.current?.id,
        profileId: currentProfileRef.current?.id ?? null,
        matchId: currentMatchIdRef.current,
        surface: "training",
        action: "match-resumed",
      });
    },
    [clearCountdown, clearTimeouts, sessionId, upsertTelemetryTrainingMatch],
  );

  const resetRound = useCallback(
    () => {
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
      completionStartedRef.current = false;
      roundStartRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
      resumePhaseRef.current = null;
    },
    [clearCountdown, clearTimeouts],
  );

  useEffect(() => {
    if (!currentPlayer?.id || !currentProfile?.id) {
      initializedScopeRef.current = null;
      return;
    }
    const scopeKey = `${currentPlayer.id}:${currentProfile.id}`;
    if (initializedScopeRef.current === scopeKey) return;
    initializedScopeRef.current = scopeKey;
    const persisted = loadPersistedMatchSnapshot<PersistedTrainingMatchState>("training", currentPlayer.id, currentProfile.id);
    if (persisted?.version === 1 && persisted.matchId) {
      restorePersistedMatch(persisted);
      return;
    }
    startNewMatch();
  }, [currentPlayer?.id, currentProfile?.id, restorePersistedMatch, startNewMatch]);

  const persistSnapshot = useCallback(() => {
    const activePlayer = currentPlayerRef.current;
    const activeProfile = currentProfileRef.current;
    if (!persistEnabledRef.current || !activePlayer || !activeProfile) return;
    savePersistedMatchSnapshot("training", activePlayer.id, activeProfile.id, {
      version: 1,
      matchId: currentMatchIdRef.current,
      matchStartedAt: matchStartRef.current,
      phase,
      countdown: count,
      playerPick,
      aiPick,
      outcome,
      isCompleting,
      baseTrainingCount: baseTrainingCountRef.current,
      trainingScore: trainingScoreRef.current,
      loggedRounds: currentMatchRoundsRef.current,
      aiStreak: aiStreakRef.current,
      playerStreak: playerStreakRef.current,
      pendingCompletion: pendingCompletionRef.current,
    } satisfies PersistedTrainingMatchState);
  }, [aiPick, count, isCompleting, outcome, phase, playerPick, roundNumber]);

  useEffect(() => {
    if (completedMatchIdRef.current === currentMatchIdRef.current || isCompleting) return;
    persistSnapshot();
  }, [count, aiPick, isCompleting, outcome, persistSnapshot, phase, playerPick, roundNumber]);

  useEffect(() => {
    return () => {
      clearCountdown();
      clearTimeouts();
    };
  }, [clearCountdown, clearTimeouts]);

  const finishTraining = useCallback(() => {
    if (completionStartedRef.current) return;
    completionStartedRef.current = true;
    setIsCompleting(true);
    persistEnabledRef.current = false;
    clearPersistedState();
    telemetryService.logUIEvent({
      sessionId,
      timestamp: new Date().toISOString(),
      playerId: currentPlayerRef.current?.id,
      profileId: currentProfileRef.current?.id ?? null,
      matchId: currentMatchIdRef.current,
      surface: "training",
      action: "training-finished",
    });
    scheduleTimeout(() => {
      navigate(PLAY_DASHBOARD_PATH, { replace: true });
    }, 260);
  }, [clearPersistedState, navigate, scheduleTimeout, sessionId]);

  const advanceRound = useCallback(() => {
    const totalCompleted = baseTrainingCountRef.current + currentMatchRoundsRef.current.length;
    if (pendingCompletionRef.current || totalCompleted >= TRAINING_ROUNDS_REQUIRED) {
      finishTraining();
      return;
    }

    resetRound();
  }, [finishTraining, resetRound]);

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

      const loggedRound = logRound({
        t: now,
        matchId: currentMatchIdRef.current,
        mode: "training",
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
      if (loggedRound) {
        currentMatchRoundsRef.current = [...currentMatchRoundsRef.current, loggedRound];
        setRoundNumber(currentMatchRoundsRef.current.length);
      }
      if (roundOutcome === "win") trainingScoreRef.current = { ...trainingScoreRef.current, you: trainingScoreRef.current.you + 1 };
      if (roundOutcome === "lose") trainingScoreRef.current = { ...trainingScoreRef.current, ai: trainingScoreRef.current.ai + 1 };

      const activeProfile = currentProfileRef.current;
      if (!activeProfile) return;

      const nextCount = Math.min(
        TRAINING_ROUNDS_REQUIRED,
        baseTrainingCountRef.current + currentMatchRoundsRef.current.length,
      );
      const completedTraining = nextCount >= TRAINING_ROUNDS_REQUIRED;
      pendingCompletionRef.current = completedTraining;
      if (completedTraining) {
        completedMatchIdRef.current = currentMatchIdRef.current;
        persistEnabledRef.current = false;
        clearPersistedState();
        upsertTelemetryTrainingMatch("completed");
        telemetryService.logUIEvent({
          sessionId,
          timestamp: now,
          playerId: currentPlayerRef.current?.id,
          profileId: activeProfile.id,
          matchId: currentMatchIdRef.current,
          surface: "training",
          action: "match-completed",
        });
      } else {
        upsertTelemetryTrainingMatch("active");
      }

      updateProfile(activeProfile.id, {
        trainingCount: nextCount,
        trained: completedTraining ? true : activeProfile.trained,
        predictorDefault: completedTraining ? true : activeProfile.predictorDefault,
        seenPostTrainingCTA: completedTraining ? true : activeProfile.seenPostTrainingCTA,
      });
    },
    [clearPersistedState, logRound, sessionId, updateProfile, upsertTelemetryTrainingMatch],
  );

  const resumeCountdown = useCallback(() => {
    clearCountdown();
    countdownRef.current = window.setInterval(() => {
      setCount(prev => {
        const next = prev - 1;
        if (next <= 0) {
          clearCountdown();
          setCount(0);
          setAiPick(randomMove());
          setPhase("reveal");
          resumePhaseRef.current = "reveal";
          return 0;
        }
        return next;
      });
    }, timings.countdownTickMs);
  }, [clearCountdown, timings.countdownTickMs]);

  const reveal = useCallback(() => {
    const selectedPlayerMove = playerPickRef.current;
    if (!selectedPlayerMove) return;

    const opponentMove = randomMove();
    setAiPick(opponentMove);
    setPhase("reveal");

    scheduleTimeout(() => {
      const roundOutcome = resolveOutcome(selectedPlayerMove, opponentMove);
      setOutcome(roundOutcome);
      setPhase("resolve");

      scheduleTimeout(() => {
        commitRound(selectedPlayerMove, opponentMove, roundOutcome);
        setPhase("feedback");
      }, 150);
    }, timings.revealHoldMs);
  }, [commitRound, scheduleTimeout, timings.revealHoldMs]);

  useEffect(() => {
    if (resumePhaseRef.current !== "countdown" || phase !== "countdown") return;
    resumePhaseRef.current = null;
    resumeCountdown();
  }, [phase, resumeCountdown]);

  useEffect(() => {
    if (resumePhaseRef.current !== "reveal" || phase !== "reveal" || !playerPickRef.current || !aiPick) return;
    resumePhaseRef.current = null;
    const selectedPlayerMove = playerPickRef.current;
    const opponentMove = aiPick;
    scheduleTimeout(() => {
      const roundOutcome = resolveOutcome(selectedPlayerMove, opponentMove);
      setOutcome(roundOutcome);
      setPhase("resolve");
      resumePhaseRef.current = "resolve";
    }, timings.revealHoldMs);
  }, [aiPick, phase, scheduleTimeout, timings.revealHoldMs]);

  useEffect(() => {
    if (resumePhaseRef.current !== "resolve" || phase !== "resolve" || !playerPickRef.current || !aiPick || !outcome) return;
    resumePhaseRef.current = null;
    const selectedPlayerMove = playerPickRef.current;
    const opponentMove = aiPick;
    const roundOutcome = outcome;
    scheduleTimeout(() => {
      commitRound(selectedPlayerMove, opponentMove, roundOutcome);
      setPhase("feedback");
    }, 150);
  }, [aiPick, commitRound, outcome, phase, scheduleTimeout]);

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
      if (phase !== "idle" || isCompleting || pendingCompletionRef.current) return;
      if (baseTrainingCountRef.current + currentMatchRoundsRef.current.length >= TRAINING_ROUNDS_REQUIRED) return;
      setPlayerPick(move);
      playerPickRef.current = move;
      setPhase("selected");
      roundStartRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
      scheduleTimeout(startCountdown, 140);
    },
    [isCompleting, phase, scheduleTimeout, startCountdown],
  );

  const exitMatch = useCallback(() => {
    const activeProfile = currentProfileRef.current;
    if (!activeProfile) {
      navigate(PLAY_DASHBOARD_PATH);
      return;
    }
    upsertTelemetryTrainingMatch("abandoned", { notes: JSON.stringify({ exitReason: "explicit-exit" }) });
    telemetryService.logUIEvent({
      sessionId,
      timestamp: new Date().toISOString(),
      playerId: currentPlayerRef.current?.id,
      profileId: activeProfile.id,
      matchId: currentMatchIdRef.current,
      surface: "training",
      action: "match-exited",
      detail: "explicit-exit",
    });
    persistEnabledRef.current = false;
    clearPersistedState();
    navigate(PLAY_DASHBOARD_PATH);
  }, [clearPersistedState, navigate, sessionId, upsertTelemetryTrainingMatch]);

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

  const recentRounds = useMemo<TrainingHistoryEntry[]>(() => {
    const trainingRounds = currentMatchRoundsRef.current.slice(-TRAINING_ROUNDS_REQUIRED);
    return Array.from({ length: TRAINING_ROUNDS_REQUIRED }, (_, index) => {
      const loggedRound = trainingRounds[index];
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
  }, [roundNumber]);

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
    exitMatch,
  };
}
