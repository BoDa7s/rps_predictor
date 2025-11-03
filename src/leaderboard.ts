import { AIMode } from "./gameTypes";
import type { RoundLog } from "./stats";

export interface MatchScoreBreakdown {
  total: number;
  rounds: number;
  maxStreak: number;
  timerBonus: number;
  beatConfidenceBonus: number;
}

const DIFFICULTY_MULTIPLIER: Record<AIMode, number> = {
  fair: 1,
  normal: 1.3,
  ruthless: 1.6,
};

function clampDecisionTime(decisionTimeMs?: number): number {
  if (typeof decisionTimeMs !== "number" || Number.isNaN(decisionTimeMs)) {
    return 2000;
  }
  return Math.max(0, decisionTimeMs);
}

export function computeMatchScore(rounds: RoundLog[]): MatchScoreBreakdown | null {
  let total = 0;
  let countedRounds = 0;
  let maxStreak = 0;
  let timerBonusTotal = 0;
  let beatConfidenceTotal = 0;

  for (const round of rounds) {
    if (round.mode !== "challenge" && round.mode !== "practice") continue;
    countedRounds += 1;
    const base = round.outcome === "win" ? 100 : round.outcome === "tie" ? 25 : 0;
    const multiplier = DIFFICULTY_MULTIPLIER[round.difficulty] ?? 1;
    const weightedBase = Math.round(base * multiplier);
    const decisionTime = clampDecisionTime(round.decisionTimeMs);
    const timerBonus = round.mode === "challenge" ? Math.max(0, Math.floor((2000 - decisionTime) / 100)) : 0;
    const aiConfidence = typeof round.confidence === "number" ? round.confidence : 0;
    const beatConfidenceBonus = round.outcome === "win" && aiConfidence >= 0.5 ? Math.round((aiConfidence - 0.5) * 200) : 0;

    total += weightedBase + timerBonus + beatConfidenceBonus;
    timerBonusTotal += timerBonus;
    beatConfidenceTotal += beatConfidenceBonus;
    if ((round.streakYou ?? 0) > maxStreak) {
      maxStreak = round.streakYou ?? 0;
    }
  }

  if (countedRounds === 0) return null;

  return {
    total,
    rounds: countedRounds,
    maxStreak,
    timerBonus: timerBonusTotal,
    beatConfidenceBonus: beatConfidenceTotal,
  };
}
