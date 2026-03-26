import type { Move, Outcome } from "./gameTypes";

export function resolveOutcome(player: Move, ai: Move): Outcome {
  if (player === ai) return "tie";
  if (
    (player === "rock" && ai === "scissors") ||
    (player === "paper" && ai === "rock") ||
    (player === "scissors" && ai === "paper")
  ) {
    return "win";
  }
  return "lose";
}
