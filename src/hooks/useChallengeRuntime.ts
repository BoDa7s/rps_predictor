import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LiveInsightSnapshot } from "../InsightPanel";
import { type AIMode, type BestOf, type Move, type Outcome } from "../gameTypes";
import { resolveOutcome } from "../gameRules";
import { computeMatchScore } from "../leaderboard";
import { loadMatchTimings } from "../matchTimings";
import { PLAY_DASHBOARD_PATH } from "../playEntry";
import { usePlayers } from "../players";
import {
  cloneProfilePreferences,
  type DecisionPolicy,
  DEFAULT_GAMEPLAY_PREFERENCES,
  GAMEPLAY_BEST_OF_OPTIONS,
  GAMEPLAY_DIFFICULTY_OPTIONS,
  type HeuristicTrace,
  type MixerTrace,
  type SerializedExpertState,
  type StoredPredictorModelState,
  type HedgeMixerSerializedState,
  useStats,
} from "../stats";

type Dist = Record<Move, number>;
type ChallengePhase = "idle" | "selected" | "countdown" | "reveal" | "resolve" | "feedback";
type ResultBanner = "Victory" | "Defeat" | "Tie";

type ChallengeSignalTone = "default" | "accent" | "success" | "warning" | "danger";

export interface ChallengeLiveSignal {
  label: string;
  value: string;
  detail?: string;
  tone?: ChallengeSignalTone;
}

export interface ChallengePredictionSource {
  label: string;
  value: string;
  strength: number;
}

export interface ChallengeHistoryEntry {
  id: string;
  label: string;
  playerMove?: Move;
  aiMove?: Move;
  outcome: Outcome | "pending";
}

interface PendingDecision {
  policy: DecisionPolicy;
  mixer?: {
    dist: Dist;
    experts: Array<{ name: string; weight: number; dist: Dist; source?: "realtime" | "history" }>;
    counter: Move;
    confidence: number;
    realtimeDist: Dist;
    historyDist: Dist;
    realtimeWeight?: number;
    historyWeight?: number;
    realtimeExperts: Array<{ name: string; weight: number; dist: Dist }>;
    historyExperts: Array<{ name: string; weight: number; dist: Dist }>;
    realtimeRounds?: number;
    historyRounds?: number;
    conflict?: { realtime: Move | null; history: Move | null } | null;
  };
  heuristic?: { predicted?: Move | null; conf?: number | null; reason?: string };
  confidence: number;
}

interface Ctx {
  playerMoves: Move[];
  aiMoves: Move[];
  outcomes: Outcome[];
  rng: () => number;
}

interface Expert {
  predict(ctx: Ctx): Dist;
  update(ctx: Ctx, actual: Move): void;
}

const MOVES: Move[] = ["rock", "paper", "scissors"];
const UNIFORM: Dist = { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 };
const MODEL_STATE_VERSION = 1;
const HISTORY_BASE_WEIGHT = 0.3;
const HISTORY_EARLY_WEIGHT = 0.6;
const HISTORY_SWITCH_ROUNDS = 4;
const HISTORY_DECAY_MS = 45 * 60 * 1000;
const EXPERT_LABELS = [
  "FrequencyExpert",
  "RecencyExpert",
  "MarkovExpert(k=1)",
  "MarkovExpert(k=2)",
  "OutcomeExpert",
  "WinStayLoseShiftExpert",
  "PeriodicExpert",
  "BaitResponseExpert",
];

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(dist: Dist): Dist {
  const total = dist.rock + dist.paper + dist.scissors;
  return total > 0
    ? { rock: dist.rock / total, paper: dist.paper / total, scissors: dist.scissors / total }
    : { ...UNIFORM };
}

function fromCounts(counts: Record<Move, number>, alpha = 1): Dist {
  return normalize({
    rock: (counts.rock || 0) + alpha,
    paper: (counts.paper || 0) + alpha,
    scissors: (counts.scissors || 0) + alpha,
  });
}

function counterMove(move: Move): Move {
  const mapping: Record<Move, Move> = { rock: "paper", paper: "scissors", scissors: "rock" };
  return mapping[move];
}

class FrequencyExpert implements Expert {
  constructor(private window = 20, private alpha = 1) {}

  predict(ctx: Ctx): Dist {
    const recent = ctx.playerMoves.slice(-this.window);
    const counts: Record<Move, number> = { rock: 0, paper: 0, scissors: 0 };
    recent.forEach(move => {
      counts[move] += 1;
    });
    return fromCounts(counts, this.alpha);
  }

  update() {}

  getState(): SerializedExpertState {
    return { type: "FrequencyExpert", window: this.window, alpha: this.alpha };
  }

  setState(state: Extract<SerializedExpertState, { type: "FrequencyExpert" }>) {
    if (Number.isFinite(state.window)) this.window = Math.max(1, Math.floor(state.window));
    if (Number.isFinite(state.alpha)) this.alpha = Math.max(0, state.alpha);
  }
}

class RecencyExpert implements Expert {
  constructor(private gamma = 0.85, private alpha = 1) {}

  predict(ctx: Ctx): Dist {
    const n = ctx.playerMoves.length;
    const weights: Record<Move, number> = { rock: 0, paper: 0, scissors: 0 };
    for (let index = 0; index < n; index += 1) {
      const move = ctx.playerMoves[index];
      const weight = Math.pow(this.gamma, n - 1 - index);
      weights[move] += weight;
    }
    return fromCounts(weights, this.alpha);
  }

  update() {}

  getState(): SerializedExpertState {
    return { type: "RecencyExpert", gamma: this.gamma, alpha: this.alpha };
  }

  setState(state: Extract<SerializedExpertState, { type: "RecencyExpert" }>) {
    if (Number.isFinite(state.gamma)) this.gamma = Math.min(0.995, Math.max(0.01, state.gamma));
    if (Number.isFinite(state.alpha)) this.alpha = Math.max(0, state.alpha);
  }
}

class MarkovExpert implements Expert {
  table = new Map<string, { rock: number; paper: number; scissors: number }>();

  constructor(private order = 1, private alpha = 1) {}

  private key(ctx: Ctx) {
    const n = ctx.playerMoves.length;
    if (n < this.order) return "";
    return ctx.playerMoves.slice(n - this.order).join("|");
  }

  predict(ctx: Ctx): Dist {
    let order = this.order;
    let counts: { rock: number; paper: number; scissors: number } | undefined;
    while (order >= 1) {
      const n = ctx.playerMoves.length;
      if (n < order) {
        order -= 1;
        continue;
      }
      const key = ctx.playerMoves.slice(n - order).join("|");
      counts = this.table.get(key);
      if (counts) break;
      order -= 1;
    }
    return counts ? fromCounts(counts, this.alpha) : { ...UNIFORM };
  }

  update(ctx: Ctx, actual: Move) {
    if (ctx.playerMoves.length < this.order) return;
    const key = this.key(ctx);
    const entry = this.table.get(key) || { rock: 0, paper: 0, scissors: 0 };
    entry[actual] += 1;
    this.table.set(key, entry);
  }

  getState(): SerializedExpertState {
    return {
      type: "MarkovExpert",
      order: this.order,
      alpha: this.alpha,
      table: Array.from(this.table.entries()).map(([key, counts]) => [key, { ...counts }]),
    };
  }

  setState(state: Extract<SerializedExpertState, { type: "MarkovExpert" }>) {
    if (Number.isFinite(state.order)) this.order = Math.max(1, Math.floor(state.order));
    if (Number.isFinite(state.alpha)) this.alpha = Math.max(0, state.alpha);
    if (!Array.isArray(state.table)) return;
    const next = new Map<string, { rock: number; paper: number; scissors: number }>();
    state.table.forEach(entry => {
      if (!Array.isArray(entry) || entry.length !== 2) return;
      const [key, counts] = entry as [string, { rock: number; paper: number; scissors: number }];
      next.set(key, {
        rock: Number.isFinite(counts.rock) ? Number(counts.rock) : 0,
        paper: Number.isFinite(counts.paper) ? Number(counts.paper) : 0,
        scissors: Number.isFinite(counts.scissors) ? Number(counts.scissors) : 0,
      });
    });
    this.table = next;
  }
}

class OutcomeExpert implements Expert {
  byOutcome = {
    win: { rock: 0, paper: 0, scissors: 0 },
    lose: { rock: 0, paper: 0, scissors: 0 },
    tie: { rock: 0, paper: 0, scissors: 0 },
  };

  constructor(private alpha = 1) {}

  predict(ctx: Ctx): Dist {
    const last = ctx.outcomes[ctx.outcomes.length - 1];
    return last ? fromCounts(this.byOutcome[last], this.alpha) : { ...UNIFORM };
  }

  update(ctx: Ctx, actual: Move) {
    const last = ctx.outcomes[ctx.outcomes.length - 1];
    if (!last) return;
    this.byOutcome[last][actual] += 1;
  }

  getState(): SerializedExpertState {
    return {
      type: "OutcomeExpert",
      alpha: this.alpha,
      byOutcome: {
        win: { ...this.byOutcome.win },
        lose: { ...this.byOutcome.lose },
        tie: { ...this.byOutcome.tie },
      },
    };
  }

  setState(state: Extract<SerializedExpertState, { type: "OutcomeExpert" }>) {
    if (Number.isFinite(state.alpha)) this.alpha = Math.max(0, state.alpha);
    (["win", "lose", "tie"] as Outcome[]).forEach(outcome => {
      const source = state.byOutcome?.[outcome];
      if (!source) return;
      this.byOutcome[outcome] = {
        rock: Number.isFinite(source.rock) ? Number(source.rock) : 0,
        paper: Number.isFinite(source.paper) ? Number(source.paper) : 0,
        scissors: Number.isFinite(source.scissors) ? Number(source.scissors) : 0,
      };
    });
  }
}

class WinStayLoseShiftExpert implements Expert {
  table = new Map<string, { rock: number; paper: number; scissors: number }>();

  constructor(private alpha = 1) {}

  predict(ctx: Ctx): Dist {
    const lastMove = ctx.playerMoves[ctx.playerMoves.length - 1];
    const lastOutcome = ctx.outcomes[ctx.outcomes.length - 1];
    if (!lastMove || !lastOutcome) return { ...UNIFORM };
    const counts = this.table.get(`${lastOutcome}|${lastMove}`);
    return counts ? fromCounts(counts, this.alpha) : { ...UNIFORM };
  }

  update(ctx: Ctx, actual: Move) {
    const lastMove = ctx.playerMoves[ctx.playerMoves.length - 1];
    const lastOutcome = ctx.outcomes[ctx.outcomes.length - 1];
    if (!lastMove || !lastOutcome) return;
    const key = `${lastOutcome}|${lastMove}`;
    const counts = this.table.get(key) || { rock: 0, paper: 0, scissors: 0 };
    counts[actual] += 1;
    this.table.set(key, counts);
  }

  getState(): SerializedExpertState {
    return {
      type: "WinStayLoseShiftExpert",
      alpha: this.alpha,
      table: Array.from(this.table.entries()).map(([key, counts]) => [key, { ...counts }]),
    };
  }

  setState(state: Extract<SerializedExpertState, { type: "WinStayLoseShiftExpert" }>) {
    if (Number.isFinite(state.alpha)) this.alpha = Math.max(0, state.alpha);
    if (!Array.isArray(state.table)) return;
    const next = new Map<string, { rock: number; paper: number; scissors: number }>();
    state.table.forEach(entry => {
      if (!Array.isArray(entry) || entry.length !== 2) return;
      const [key, counts] = entry as [string, { rock: number; paper: number; scissors: number }];
      next.set(key, {
        rock: Number.isFinite(counts.rock) ? Number(counts.rock) : 0,
        paper: Number.isFinite(counts.paper) ? Number(counts.paper) : 0,
        scissors: Number.isFinite(counts.scissors) ? Number(counts.scissors) : 0,
      });
    });
    this.table = next;
  }
}

class PeriodicExpert implements Expert {
  constructor(private maxPeriod = 5, private minPeriod = 2, private window = 18, private confident = 0.65) {}

  predict(ctx: Ctx): Dist {
    const moves = ctx.playerMoves.slice(-this.window);
    const n = moves.length;
    if (n < this.minPeriod + 1) return { ...UNIFORM };
    let bestPeriod = -1;
    let bestScore = 0;
    for (let period = this.minPeriod; period <= this.maxPeriod; period += 1) {
      let matches = 0;
      let total = 0;
      for (let index = period; index < n; index += 1) {
        total += 1;
        if (moves[index] === moves[index - period]) matches += 1;
      }
      const score = total ? matches / total : 0;
      if (score > bestScore) {
        bestScore = score;
        bestPeriod = period;
      }
    }
    if (bestPeriod < 0 || bestScore < this.confident) return { ...UNIFORM };
    const guess = moves[n - bestPeriod];
    const dist: Dist = { rock: 0, paper: 0, scissors: 0 };
    dist[guess] = 0.9;
    return normalize({ rock: dist.rock + 0.05, paper: dist.paper + 0.05, scissors: dist.scissors + 0.05 });
  }

  update() {}

  getState(): SerializedExpertState {
    return {
      type: "PeriodicExpert",
      maxPeriod: this.maxPeriod,
      minPeriod: this.minPeriod,
      window: this.window,
      confident: this.confident,
    };
  }

  setState(state: Extract<SerializedExpertState, { type: "PeriodicExpert" }>) {
    if (Number.isFinite(state.maxPeriod)) this.maxPeriod = Math.max(2, Math.floor(state.maxPeriod));
    if (Number.isFinite(state.minPeriod)) this.minPeriod = Math.max(1, Math.floor(state.minPeriod));
    if (Number.isFinite(state.window)) this.window = Math.max(3, Math.floor(state.window));
    if (Number.isFinite(state.confident)) this.confident = Math.max(0, Math.min(1, state.confident));
  }
}

class BaitResponseExpert implements Expert {
  table = {
    rock: { rock: 0, paper: 0, scissors: 0 },
    paper: { rock: 0, paper: 0, scissors: 0 },
    scissors: { rock: 0, paper: 0, scissors: 0 },
  };

  constructor(private alpha = 1) {}

  predict(ctx: Ctx): Dist {
    const lastAi = ctx.aiMoves[ctx.aiMoves.length - 1];
    return lastAi ? fromCounts(this.table[lastAi], this.alpha) : { ...UNIFORM };
  }

  update(ctx: Ctx, actual: Move) {
    const lastAi = ctx.aiMoves[ctx.aiMoves.length - 1];
    if (!lastAi) return;
    this.table[lastAi][actual] += 1;
  }

  getState(): SerializedExpertState {
    return {
      type: "BaitResponseExpert",
      alpha: this.alpha,
      table: {
        rock: { ...this.table.rock },
        paper: { ...this.table.paper },
        scissors: { ...this.table.scissors },
      },
    };
  }

  setState(state: Extract<SerializedExpertState, { type: "BaitResponseExpert" }>) {
    if (Number.isFinite(state.alpha)) this.alpha = Math.max(0, state.alpha);
    (["rock", "paper", "scissors"] as Move[]).forEach(move => {
      const source = state.table?.[move];
      if (!source) return;
      this.table[move] = {
        rock: Number.isFinite(source.rock) ? Number(source.rock) : 0,
        paper: Number.isFinite(source.paper) ? Number(source.paper) : 0,
        scissors: Number.isFinite(source.scissors) ? Number(source.scissors) : 0,
      };
    });
  }
}

class HedgeMixer {
  weights: number[];
  experts: Expert[];
  eta: number;
  labels: string[];
  private lastPredictions: Dist[] = [];
  private lastMix: Dist = { ...UNIFORM };

  constructor(experts: Expert[], labels: string[], eta = 1.6) {
    this.experts = experts;
    this.labels = labels;
    this.eta = eta;
    this.weights = experts.map(() => 1);
  }

  predict(ctx: Ctx): Dist {
    this.lastPredictions = this.experts.map(expert => expert.predict(ctx));
    const totalWeight = this.weights.reduce((sum, value) => sum + value, 0) || 1;
    const mix: Dist = { rock: 0, paper: 0, scissors: 0 };
    this.lastPredictions.forEach((prediction, index) => {
      (Object.keys(mix) as Move[]).forEach(move => {
        mix[move] += (this.weights[index] / totalWeight) * prediction[move];
      });
    });
    this.lastMix = normalize(mix);
    return this.lastMix;
  }

  update(ctx: Ctx, actual: Move) {
    const predictions = this.lastPredictions.length ? this.lastPredictions : this.experts.map(expert => expert.predict(ctx));
    const losses = predictions.map(prediction => 1 - Math.max(1e-6, prediction[actual] || 0));
    this.weights = this.weights.map((weight, index) => weight * Math.exp(-this.eta * losses[index]));
    this.experts.forEach(expert => expert.update(ctx, actual));
  }

  snapshot() {
    const totalWeight = this.weights.reduce((sum, value) => sum + value, 0) || 1;
    return {
      dist: { ...this.lastMix },
      experts: this.experts.map((_, index) => ({
        name: index < this.labels.length ? this.labels[index] : `Expert ${index + 1}`,
        weight: this.weights[index] / totalWeight,
        dist: this.lastPredictions[index] ?? { ...UNIFORM },
      })),
    };
  }

  getWeights() {
    return [...this.weights];
  }

  setWeights(weights: number[]) {
    if (!Array.isArray(weights)) return;
    this.weights = this.experts.map((_, index) => {
      const value = weights[index];
      return Number.isFinite(value) && value > 0 ? Number(value) : 1;
    });
  }
}

function createDefaultExperts(): Expert[] {
  return [
    new FrequencyExpert(20, 1),
    new RecencyExpert(0.85, 1),
    new MarkovExpert(1, 1),
    new MarkovExpert(2, 1),
    new OutcomeExpert(1),
    new WinStayLoseShiftExpert(1),
    new PeriodicExpert(5, 2, 18, 0.65),
    new BaitResponseExpert(1),
  ];
}

function serializeExpertInstance(expert: Expert): SerializedExpertState {
  if (expert instanceof FrequencyExpert) return expert.getState();
  if (expert instanceof RecencyExpert) return expert.getState();
  if (expert instanceof MarkovExpert) return expert.getState();
  if (expert instanceof OutcomeExpert) return expert.getState();
  if (expert instanceof WinStayLoseShiftExpert) return expert.getState();
  if (expert instanceof PeriodicExpert) return expert.getState();
  if (expert instanceof BaitResponseExpert) return expert.getState();
  return { type: "FrequencyExpert", window: 20, alpha: 1 };
}

function instantiateExpertFromState(state: SerializedExpertState | null | undefined): Expert {
  if (!state) return createDefaultExperts()[0];
  switch (state.type) {
    case "FrequencyExpert": {
      const expert = new FrequencyExpert(state.window ?? 20, state.alpha ?? 1);
      expert.setState(state);
      return expert;
    }
    case "RecencyExpert": {
      const expert = new RecencyExpert(state.gamma ?? 0.85, state.alpha ?? 1);
      expert.setState(state);
      return expert;
    }
    case "MarkovExpert": {
      const expert = new MarkovExpert(state.order ?? 1, state.alpha ?? 1);
      expert.setState(state);
      return expert;
    }
    case "OutcomeExpert": {
      const expert = new OutcomeExpert(state.alpha ?? 1);
      expert.setState(state);
      return expert;
    }
    case "WinStayLoseShiftExpert": {
      const expert = new WinStayLoseShiftExpert(state.alpha ?? 1);
      expert.setState(state);
      return expert;
    }
    case "PeriodicExpert": {
      const expert = new PeriodicExpert(
        state.maxPeriod ?? 5,
        state.minPeriod ?? 2,
        state.window ?? 18,
        state.confident ?? 0.65,
      );
      expert.setState(state);
      return expert;
    }
    case "BaitResponseExpert": {
      const expert = new BaitResponseExpert(state.alpha ?? 1);
      expert.setState(state);
      return expert;
    }
    default:
      return new FrequencyExpert(20, 1);
  }
}

function serializeMixerInstance(mixer: HedgeMixer): HedgeMixerSerializedState {
  return {
    eta: mixer.eta,
    weights: mixer.getWeights(),
    experts: mixer.experts.map(serializeExpertInstance),
  };
}

function instantiateMixerFromState(state: HedgeMixerSerializedState | null | undefined): HedgeMixer {
  if (state && Array.isArray(state.experts) && state.experts.length) {
    const experts = state.experts.map(instantiateExpertFromState);
    const mixer = new HedgeMixer(experts, EXPERT_LABELS, Number.isFinite(state.eta) ? Number(state.eta) : 1.6);
    if (Array.isArray(state.weights) && state.weights.length) mixer.setWeights(state.weights);
    return mixer;
  }
  return new HedgeMixer(createDefaultExperts(), EXPERT_LABELS, 1.6);
}

function blendDistributions(realtime: Dist, history: Dist, weights: { realtimeWeight: number; historyWeight: number }): Dist {
  const combined: Dist = {
    rock: realtime.rock * weights.realtimeWeight + history.rock * weights.historyWeight,
    paper: realtime.paper * weights.realtimeWeight + history.paper * weights.historyWeight,
    scissors: realtime.scissors * weights.realtimeWeight + history.scissors * weights.historyWeight,
  };
  return combined.rock === 0 && combined.paper === 0 && combined.scissors === 0 ? { ...UNIFORM } : normalize(combined);
}

function computeBlendWeights(sessionRounds: number, persisted: StoredPredictorModelState | null, mode: AIMode) {
  const hasHistory = Boolean(
    persisted &&
      persisted.roundsSeen > 0 &&
      persisted.state &&
      Array.isArray(persisted.state.experts) &&
      persisted.state.experts.length,
  );
  if (!hasHistory) return { realtimeWeight: 1, historyWeight: 0 };
  const progress = Math.max(0, Math.min(1, sessionRounds / HISTORY_SWITCH_ROUNDS));
  let historyWeight = Math.max(HISTORY_BASE_WEIGHT, HISTORY_EARLY_WEIGHT) + (HISTORY_BASE_WEIGHT - HISTORY_EARLY_WEIGHT) * progress;
  const updatedAt = persisted?.updatedAt ? Date.parse(persisted.updatedAt) : Number.NaN;
  if (Number.isFinite(updatedAt)) {
    const ageMs = Math.max(0, Date.now() - updatedAt);
    const decay = Math.exp(-ageMs / HISTORY_DECAY_MS);
    historyWeight *= Number.isFinite(decay) ? decay : 1;
  }
  if (mode === "fair") {
    historyWeight *= 0.55;
  } else if (mode === "ruthless") {
    historyWeight *= 1.18;
  }
  historyWeight = Math.max(0, Math.min(0.8, historyWeight));
  const realtimeWeight = Math.max(0, 1 - historyWeight);
  const total = historyWeight + realtimeWeight;
  if (total <= 0) return { realtimeWeight: 1, historyWeight: 0 };
  return { realtimeWeight: realtimeWeight / total, historyWeight: historyWeight / total };
}

function prettyMove(move: Move) {
  return move.charAt(0).toUpperCase() + move.slice(1);
}

function confidenceBucket(value: number): "low" | "medium" | "high" {
  if (value >= 0.7) return "high";
  if (value >= 0.45) return "medium";
  return "low";
}

function clamp01(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function expectedPlayerMoveFromAi(aiMove: Move | null | undefined): Move | null {
  if (!aiMove) return null;
  const mapping: Record<Move, Move> = { rock: "scissors", paper: "rock", scissors: "paper" };
  return mapping[aiMove];
}

function expertReasonText(name: string, move: Move, percent: number) {
  const pretty = prettyMove(move);
  const pct = Math.round(percent * 100);
  switch (name) {
    case "FrequencyExpert":
      return `Frequency expert estimated ${pct}% chance you play ${pretty}.`;
    case "RecencyExpert":
      return `Recency expert weighted ${pct}% toward ${pretty} from your latest moves.`;
    case "MarkovExpert(k=1)":
      return `Markov order-1 expert projected ${pretty} (${pct}%).`;
    case "MarkovExpert(k=2)":
      return `Markov order-2 expert leaned ${pct}% toward ${pretty}.`;
    case "OutcomeExpert":
      return `Outcome expert saw ${pct}% likelihood after that result for ${pretty}.`;
    case "WinStayLoseShiftExpert":
      return `Win/Stay-Lose/Switch expert assigned ${pct}% to ${pretty}.`;
    case "PeriodicExpert":
      return `Periodic expert detected a loop pointing ${pct}% to ${pretty}.`;
    case "BaitResponseExpert":
      return `Bait response expert predicted ${pretty} with ${pct}% weight.`;
    default:
      return `${name} estimated ${pct}% on ${pretty}.`;
  }
}

function describeDecision(
  policy: DecisionPolicy,
  mixer: MixerTrace | undefined,
  heuristic: HeuristicTrace | undefined,
  player: Move,
  ai: Move,
) {
  const playerPretty = prettyMove(player);
  const aiPretty = prettyMove(ai);
  if (policy === "mixer" && mixer) {
    const top = mixer.topExperts[0];
    if (top) return `${expertReasonText(top.name, player, top.pActual ?? 0)} AI played ${aiPretty} to counter.`;
    return `Mixer blended experts and countered ${playerPretty} with ${aiPretty}.`;
  }
  if (heuristic) {
    const parts: string[] = [];
    if (heuristic.reason) parts.push(heuristic.reason);
    if (heuristic.predicted) {
      const pct = heuristic.conf ? Math.round((heuristic.conf || 0) * 100) : null;
      let detail = `Predicted ${prettyMove(heuristic.predicted)}`;
      if (pct !== null) detail += ` (${pct}%)`;
      detail += ".";
      parts.push(detail);
    }
    parts.push(`Countered with ${aiPretty}.`);
    return parts.join(" ");
  }
  return `AI played ${aiPretty} against ${playerPretty}.`;
}

function computeSwitchRate(moves: Move[]): number {
  if (moves.length <= 1) return 0;
  let switches = 0;
  for (let index = 1; index < moves.length; index += 1) {
    if (moves[index] !== moves[index - 1]) switches += 1;
  }
  return switches / moves.length;
}

function makeLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function markovNext(moves: Move[]): { move: Move | null; conf: number } {
  if (moves.length < 2) return { move: null, conf: 0 };
  const transitions: Record<Move, Record<Move, number>> = {
    rock: { rock: 0, paper: 0, scissors: 0 },
    paper: { rock: 0, paper: 0, scissors: 0 },
    scissors: { rock: 0, paper: 0, scissors: 0 },
  };
  for (let index = 1; index < moves.length; index += 1) {
    const prev = moves[index - 1];
    const next = moves[index];
    transitions[prev][next] += 1;
  }
  const row = transitions[moves[moves.length - 1]];
  const sum = row.rock + row.paper + row.scissors;
  if (!sum) return { move: null, conf: 0 };
  let best: Move = "rock";
  let max = -1;
  (Object.keys(row) as Move[]).forEach(move => {
    if (row[move] > max) {
      best = move;
      max = row[move];
    }
  });
  return { move: best, conf: max / sum };
}

function detectPatternNext(moves: Move[]): { move: Move | null; reason?: string } {
  const n = moves.length;
  if (n >= 3 && moves[n - 1] === moves[n - 2] && moves[n - 2] === moves[n - 3]) {
    return { move: moves[n - 1], reason: "Recent triple repeat detected" };
  }
  if (n >= 6) {
    const a = moves.slice(n - 6, n - 3).join("-");
    const b = moves.slice(n - 3).join("-");
    if (a === b) return { move: moves[n - 3], reason: "Repeating three-beat pattern spotted" };
  }
  if (n >= 4) {
    const a = moves[n - 4];
    const b = moves[n - 3];
    const c = moves[n - 2];
    const d = moves[n - 1];
    if (a === c && b === d && a !== b) return { move: a, reason: "Alternating two-step pattern detected" };
  }
  return { move: null };
}

function predictNext(moves: Move[], rng: () => number): { move: Move | null; conf: number; reason?: string } {
  const markov = markovNext(moves);
  const pattern = detectPatternNext(moves);
  if (markov.move && pattern.move && markov.move === pattern.move) {
    return { move: markov.move, conf: Math.max(0.8, markov.conf), reason: "Markov and pattern consensus" };
  }
  if (pattern.move && (!markov.move || markov.conf < 0.6)) {
    return { move: pattern.move, conf: 0.75, reason: pattern.reason || "Pattern repetition heuristic" };
  }
  if (markov.move && pattern.move && markov.conf >= 0.6) {
    const choice = rng() < 0.6 ? pattern.move : markov.move;
    const reason = choice === pattern.move ? pattern.reason || "Pattern repetition heuristic" : "Markov transition preference";
    return { move: choice, conf: 0.7, reason };
  }
  if (markov.move) return { move: markov.move, conf: markov.conf * 0.65, reason: "Markov transition heuristic" };
  if (pattern.move) return { move: pattern.move, conf: 0.6, reason: pattern.reason || "Pattern repetition heuristic" };
  return { move: null, conf: 0, reason: "Insufficient signal" };
}

function policyCounterFromDist(dist: Dist, mode: AIMode, rng: () => number) {
  const lambda = mode === "fair" ? 1.15 : mode === "ruthless" ? 4 : 2;
  const logits = MOVES.map(move => Math.log(Math.max(1e-6, dist[move])) * lambda);
  const max = Math.max(...logits);
  const exps = logits.map(value => Math.exp(value - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map(value => value / sum);
  const idx = probs[0] > probs[1] ? (probs[0] > probs[2] ? 0 : 2) : probs[1] > probs[2] ? 1 : 2;
  let move = counterMove(MOVES[idx]);
  const epsilon = mode === "fair" ? 0.3 : mode === "normal" ? 0.05 : 0;
  if (rng() < epsilon) move = MOVES[Math.floor(rng() * 3)] as Move;
  return move;
}

function selectChallengeGameplayPreferences(currentProfile: ReturnType<typeof useStats>["currentProfile"]) {
  return currentProfile?.preferences.gameplay ?? DEFAULT_GAMEPLAY_PREFERENCES;
}

function buildLiveSnapshot(
  trace: PendingDecision,
  aiMove: Move,
  options: { realtimeRounds: number; historyRounds: number; historyUpdatedAt: string | null },
): LiveInsightSnapshot {
  if (trace.policy === "mixer" && trace.mixer) {
    const distribution = normalize(trace.mixer.dist);
    const predicted = MOVES.reduce((best, move) => (distribution[move] > distribution[best] ? move : best), MOVES[0]);
    const realtimeDist = normalize(trace.mixer.realtimeDist);
    const historyDist = normalize(trace.mixer.historyDist);
    const realtimeWeight = clamp01(trace.mixer.realtimeWeight ?? 0);
    const historyWeight = clamp01(trace.mixer.historyWeight ?? 0);
    const realtimeMove = MOVES.reduce((best, move) => (realtimeDist[move] > realtimeDist[best] ? move : best), MOVES[0]);
    const historyMove = trace.mixer.historyExperts.length
      ? MOVES.reduce((best, move) => (historyDist[move] > historyDist[best] ? move : best), MOVES[0])
      : null;
    const topExperts = [...trace.mixer.experts]
      .map(expert => {
        const expertDist = normalize(expert.dist ?? { ...UNIFORM });
        const topMove = MOVES.reduce((best, move) => (expertDist[move] > expertDist[best] ? move : best), MOVES[0]);
        return {
          name: expert.name,
          weight: clamp01(expert.weight),
          topMove,
          probability: clamp01(expertDist[topMove]),
        };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);
    const realtimeExperts = trace.mixer.realtimeExperts.map(expert => {
      const expertDist = normalize(expert.dist);
      const topMove = MOVES.reduce((best, move) => (expertDist[move] > expertDist[best] ? move : best), MOVES[0]);
      return {
        name: expert.name,
        weight: clamp01(expert.weight),
        topMove,
        probability: clamp01(expertDist[topMove]),
      };
    });
    const historyExperts = trace.mixer.historyExperts.map(expert => {
      const expertDist = normalize(expert.dist);
      const topMove = MOVES.reduce((best, move) => (expertDist[move] > expertDist[best] ? move : best), MOVES[0]);
      return {
        name: expert.name,
        weight: clamp01(expert.weight),
        topMove,
        probability: clamp01(expertDist[topMove]),
      };
    });
    const reason = topExperts[0]
      ? expertReasonText(topExperts[0].name, predicted, topExperts[0].probability)
      : `Mixer consensus leans ${prettyMove(predicted)}.`;
    return {
      policy: trace.policy,
      confidence: trace.confidence,
      predictedMove: predicted,
      counterMove: trace.mixer.counter,
      distribution,
      topExperts,
      reason,
      realtimeDistribution: realtimeDist,
      historyDistribution: historyDist,
      realtimeWeight,
      historyWeight,
      realtimeExperts,
      historyExperts,
      realtimeRounds: trace.mixer.realtimeRounds ?? options.realtimeRounds,
      historyRounds: trace.mixer.historyRounds ?? options.historyRounds,
      historyUpdatedAt: options.historyUpdatedAt,
      conflict: trace.mixer.conflict ?? null,
      realtimeMove,
      historyMove,
    };
  }

  const predicted = trace.heuristic?.predicted ?? expectedPlayerMoveFromAi(aiMove);
  const confidence = clamp01(trace.heuristic?.conf ?? trace.confidence ?? 0.34);
  let distribution: Dist;
  if (predicted) {
    const remainder = Math.max(0, 1 - confidence);
    const others = MOVES.filter(move => move !== predicted);
    const share = others.length ? remainder / others.length : 0;
    distribution = { rock: share, paper: share, scissors: share };
    distribution[predicted] = confidence;
    distribution = normalize(distribution);
  } else {
    distribution = { ...UNIFORM };
  }
  return {
    policy: trace.policy,
    confidence: trace.confidence,
    predictedMove: predicted,
    counterMove: aiMove,
    distribution,
    topExperts: [],
    reason: trace.heuristic?.reason || (predicted ? `Heuristic leans toward ${prettyMove(predicted)}.` : "Low confidence, probing for new patterns."),
    realtimeDistribution: distribution,
    historyDistribution: { ...UNIFORM },
    realtimeWeight: 1,
    historyWeight: 0,
    realtimeExperts: [],
    historyExperts: [],
    realtimeRounds: options.realtimeRounds,
    historyRounds: options.historyRounds,
    historyUpdatedAt: options.historyUpdatedAt,
    conflict: null,
    realtimeMove: predicted,
    historyMove: null,
  };
}

function formatPercent(value: number) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function formatSourceLabel(weight: number) {
  if (weight >= 0.68) return "Strong";
  if (weight >= 0.45) return "Medium";
  if (weight >= 0.25) return "Support";
  return "Light";
}

function buildAiSignals(snapshot: LiveInsightSnapshot | null): ChallengeLiveSignal[] {
  if (!snapshot) {
    return [
      { label: "Intent", value: "Reading opener", tone: "accent" },
      { label: "Confidence", value: "33%", tone: "warning" },
      { label: "Counter", value: "Calibrating" },
      { label: "Source", value: "Realtime only" },
      { label: "Risk", value: "Low signal", tone: "danger" },
    ];
  }
  const confidenceTone = snapshot.confidence >= 0.7 ? "success" : snapshot.confidence >= 0.45 ? "warning" : "danger";
  return [
    {
      label: "Intent",
      value: snapshot.predictedMove ? prettyMove(snapshot.predictedMove) : "Unclear",
      detail: snapshot.reason ?? undefined,
      tone: "accent",
    },
    {
      label: "Confidence",
      value: formatPercent(snapshot.confidence),
      detail: snapshot.policy === "mixer" ? "Predictor live" : "Fallback heuristic",
      tone: confidenceTone,
    },
    {
      label: "Counter",
      value: snapshot.counterMove ? prettyMove(snapshot.counterMove) : "Pending",
      detail: "Queued answer",
    },
    {
      label: "Source",
      value: `${Math.round(snapshot.realtimeWeight * 100)} / ${Math.round(snapshot.historyWeight * 100)}`,
      detail: "Realtime / history",
    },
    {
      label: "Risk",
      value: snapshot.conflict ? "Model split" : "Stable read",
      detail: snapshot.conflict ? "Realtime and history disagree" : "No major conflict",
      tone: snapshot.conflict ? "danger" : "default",
    },
  ];
}

function buildPredictionSources(snapshot: LiveInsightSnapshot | null): ChallengePredictionSource[] {
  if (!snapshot) {
    return [
      { label: "Realtime", value: "Strong", strength: 100 },
      { label: "History", value: "Light", strength: 0 },
    ];
  }
  const sources: ChallengePredictionSource[] = [
    {
      label: "Realtime",
      value: formatSourceLabel(snapshot.realtimeWeight),
      strength: Math.round(snapshot.realtimeWeight * 100),
    },
    {
      label: "History",
      value: formatSourceLabel(snapshot.historyWeight),
      strength: Math.round(snapshot.historyWeight * 100),
    },
  ];
  snapshot.topExperts.slice(0, 2).forEach(expert => {
    sources.push({
      label: expert.name.replace("Expert", "").replace(/\(k=\d\)/g, "").trim(),
      value: expert.topMove ? prettyMove(expert.topMove) : "Mixed",
      strength: Math.round(expert.weight * 100),
    });
  });
  return sources;
}

export function useChallengeRuntime() {
  const navigate = useNavigate();
  const { currentPlayer } = usePlayers();
  const {
    currentProfile,
    logMatch,
    logRound,
    getModelStateForProfile,
    saveModelStateForProfile,
    updateProfile,
  } = useStats();
  const timings = useMemo(() => loadMatchTimings().challenge, []);
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const rng = useMemo(() => mulberry32(seed), [seed]);
  const gameplayPreferences = selectChallengeGameplayPreferences(currentProfile);
  const [bestOf, setBestOfState] = useState<BestOf>(gameplayPreferences.bestOf);
  const [aiMode, setAiModeState] = useState<AIMode>(gameplayPreferences.aiDifficulty);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [roundNumber, setRoundNumber] = useState(1);
  const [phase, setPhase] = useState<ChallengePhase>("idle");
  const [countdown, setCountdown] = useState(3);
  const [playerPick, setPlayerPick] = useState<Move | undefined>();
  const [aiPick, setAiPick] = useState<Move | undefined>();
  const [outcome, setOutcome] = useState<Outcome | undefined>();
  const [resultBanner, setResultBanner] = useState<ResultBanner | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<LiveInsightSnapshot | null>(null);
  const [matchScoreTotal, setMatchScoreTotal] = useState<number>(0);
  const [aiHistory, setAiHistory] = useState<Move[]>([]);
  const [playerHistory, setPlayerHistory] = useState<Move[]>([]);
  const [outcomeHistory, setOutcomeHistory] = useState<Outcome[]>([]);
  const [matchHistory, setMatchHistory] = useState<ChallengeHistoryEntry[]>([]);
  const [selectedMove, setSelectedMove] = useState<Move | undefined>();

  const countdownRef = useRef<number | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);
  const roundStartRef = useRef<number | null>(typeof performance !== "undefined" ? performance.now() : Date.now());
  const playerPickRef = useRef<Move | undefined>();
  const lastDecisionMsRef = useRef<number | null>(null);
  const currentMatchIdRef = useRef<string>(makeLocalId("match"));
  const currentMatchRoundsRef = useRef<NonNullable<ReturnType<typeof logRound>>[]>([]);
  const matchStartRef = useRef<string>(new Date().toISOString());
  const decisionTraceRef = useRef<PendingDecision | null>(null);
  const persistedModelRef = useRef<StoredPredictorModelState | null>(null);
  const historyMixerRef = useRef<HedgeMixer | null>(null);
  const sessionMixerRef = useRef<HedgeMixer | null>(null);
  const historyDisplayMixerRef = useRef<HedgeMixer | null>(null);
  const roundsSeenRef = useRef(0);
  const modelPersistTimeoutRef = useRef<number | null>(null);
  const modelPersistPendingRef = useRef(false);
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

  const resetSessionMixer = useCallback(() => {
    sessionMixerRef.current = instantiateMixerFromState(null);
  }, []);

  const loadPersistedModel = useCallback((state: StoredPredictorModelState | null) => {
    persistedModelRef.current = state;
    historyMixerRef.current = instantiateMixerFromState(state?.state);
    historyDisplayMixerRef.current = state ? instantiateMixerFromState(state.state) : null;
    roundsSeenRef.current = state?.roundsSeen ?? 0;
  }, []);

  const ensureHistoryMixer = useCallback(() => {
    if (!historyMixerRef.current) {
      historyMixerRef.current = instantiateMixerFromState(persistedModelRef.current?.state);
    }
    return historyMixerRef.current;
  }, []);

  const ensureSessionMixer = useCallback(() => {
    if (!sessionMixerRef.current) {
      resetSessionMixer();
    }
    return sessionMixerRef.current!;
  }, [resetSessionMixer]);

  const ensureHistoryDisplayMixer = useCallback(() => {
    if (!persistedModelRef.current) return null;
    if (!historyDisplayMixerRef.current) {
      historyDisplayMixerRef.current = instantiateMixerFromState(persistedModelRef.current.state);
    }
    return historyDisplayMixerRef.current;
  }, []);

  const buildPersistedModelSnapshot = useCallback((): StoredPredictorModelState | null => {
    if (!currentProfile?.id || !historyMixerRef.current) return null;
    return {
      profileId: currentProfile.id,
      modelVersion: MODEL_STATE_VERSION,
      updatedAt: new Date().toISOString(),
      roundsSeen: roundsSeenRef.current,
      state: serializeMixerInstance(historyMixerRef.current),
    };
  }, [currentProfile?.id]);

  const persistModelStateNow = useCallback(() => {
    if (!currentProfile?.id) return;
    const snapshot = buildPersistedModelSnapshot();
    if (!snapshot) return;
    saveModelStateForProfile(currentProfile.id, snapshot);
    persistedModelRef.current = snapshot;
    modelPersistPendingRef.current = false;
  }, [buildPersistedModelSnapshot, currentProfile?.id, saveModelStateForProfile]);

  const scheduleModelPersist = useCallback(() => {
    if (!currentProfile?.id) return;
    if (modelPersistTimeoutRef.current !== null) {
      window.clearTimeout(modelPersistTimeoutRef.current);
    }
    modelPersistPendingRef.current = true;
    modelPersistTimeoutRef.current = window.setTimeout(() => {
      modelPersistTimeoutRef.current = null;
      persistModelStateNow();
    }, 250);
  }, [currentProfile?.id, persistModelStateNow]);

  useEffect(() => {
    modelPersistPendingRef.current = false;
    if (!currentProfile?.id) {
      loadPersistedModel(null);
      resetSessionMixer();
      return;
    }
    loadPersistedModel(getModelStateForProfile(currentProfile.id));
    resetSessionMixer();
  }, [currentProfile?.id, getModelStateForProfile, loadPersistedModel, resetSessionMixer]);

  useEffect(() => {
    setBestOfState(gameplayPreferences.bestOf);
    setAiModeState(gameplayPreferences.aiDifficulty);
  }, [currentProfile?.id, gameplayPreferences.aiDifficulty, gameplayPreferences.bestOf]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const flush = () => {
      if (modelPersistTimeoutRef.current !== null) {
        window.clearTimeout(modelPersistTimeoutRef.current);
        modelPersistTimeoutRef.current = null;
      }
      if (modelPersistPendingRef.current) {
        persistModelStateNow();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const handleBeforeUnload = () => flush();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [persistModelStateNow]);

  useEffect(() => {
    return () => {
      clearCountdown();
      clearTimeouts();
      if (modelPersistTimeoutRef.current !== null) {
        window.clearTimeout(modelPersistTimeoutRef.current);
        modelPersistTimeoutRef.current = null;
      }
      if (modelPersistPendingRef.current) {
        persistModelStateNow();
      }
    };
  }, [clearCountdown, clearTimeouts, persistModelStateNow]);

  const resetMatch = useCallback(() => {
    clearCountdown();
    clearTimeouts();
    setPlayerScore(0);
    setAiScore(0);
    setRoundNumber(1);
    setPhase("idle");
    setCountdown(3);
    setPlayerPick(undefined);
    playerPickRef.current = undefined;
    setAiPick(undefined);
    setOutcome(undefined);
    setResultBanner(null);
    setLiveSnapshot(null);
    setMatchScoreTotal(0);
    setAiHistory([]);
    setPlayerHistory([]);
    setOutcomeHistory([]);
    setMatchHistory([]);
    setSelectedMove(undefined);
    decisionTraceRef.current = null;
    currentMatchRoundsRef.current = [];
    currentMatchIdRef.current = makeLocalId("match");
    matchStartRef.current = new Date().toISOString();
    roundStartRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    lastDecisionMsRef.current = null;
    resetSessionMixer();
  }, [clearCountdown, clearTimeouts, resetSessionMixer]);

  useEffect(() => {
    resetMatch();
  }, [currentProfile?.id, resetMatch]);

  const setBestOf = useCallback(
    (value: BestOf) => {
      setBestOfState(value);
      if (!currentProfile) return;
      const nextPreferences = cloneProfilePreferences(currentProfile.preferences);
      nextPreferences.gameplay.bestOf = value;
      updateProfile(currentProfile.id, { preferences: nextPreferences });
    },
    [currentProfile, updateProfile],
  );

  const setAiMode = useCallback(
    (value: AIMode) => {
      setAiModeState(value);
      if (!currentProfile) return;
      const nextPreferences = cloneProfilePreferences(currentProfile.preferences);
      nextPreferences.gameplay.aiDifficulty = value;
      updateProfile(currentProfile.id, { preferences: nextPreferences });
    },
    [currentProfile, updateProfile],
  );

  const recordRound = useCallback(
    (playerMove: Move, aiMove: Move, outcomeForPlayer: Outcome) => {
      const trace = decisionTraceRef.current;
      const policy: DecisionPolicy = trace?.policy ?? "heuristic";
      const mixer = trace?.mixer;
      let mixerTrace: MixerTrace | undefined;
      if (mixer) {
        const realtimeWeight = mixer.realtimeWeight ?? 1;
        const historyWeight = mixer.historyWeight ?? 1;
        mixerTrace = {
          dist: mixer.dist,
          counter: mixer.counter,
          topExperts: mixer.experts
            .map(expert => ({ name: expert.name, weight: expert.weight, pActual: expert.dist[playerMove] ?? 0 }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3),
          confidence: mixer.confidence,
          realtimeWeight: mixer.realtimeWeight,
          historyWeight: mixer.historyWeight,
          realtimeTopExperts: (mixer.realtimeExperts ?? [])
            .map(expert => ({
              name: expert.name,
              weight: expert.weight * realtimeWeight,
              pActual: expert.dist[playerMove] ?? 0,
            }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3),
          historyTopExperts: (mixer.historyExperts ?? [])
            .map(expert => ({
              name: expert.name,
              weight: expert.weight * historyWeight,
              pActual: expert.dist[playerMove] ?? 0,
            }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3),
          realtimeRounds: mixer.realtimeRounds,
          historyRounds: mixer.historyRounds,
          conflict: mixer.conflict ?? null,
        };
      }
      const heuristicTrace = trace?.heuristic;
      const confidence = trace?.confidence ?? mixerTrace?.confidence ?? heuristicTrace?.conf ?? 0;
      const reason = describeDecision(policy, mixerTrace, heuristicTrace, playerMove, aiMove);
      const logged = logRound({
        t: new Date().toISOString(),
        mode: "challenge",
        matchId: currentMatchIdRef.current,
        bestOf,
        difficulty: aiMode,
        player: playerMove,
        ai: aiMove,
        outcome: outcomeForPlayer,
        policy,
        mixer: mixerTrace,
        heuristic: heuristicTrace,
        streakAI: outcomeForPlayer === "lose" ? 1 : 0,
        streakYou: outcomeForPlayer === "win" ? 1 : 0,
        reason,
        confidence,
        confidenceBucket: confidenceBucket(confidence),
        decisionTimeMs: typeof lastDecisionMsRef.current === "number" ? lastDecisionMsRef.current : undefined,
      });
      if (logged) {
        currentMatchRoundsRef.current = [...currentMatchRoundsRef.current, logged];
        const breakdown = computeMatchScore(currentMatchRoundsRef.current);
        setMatchScoreTotal(breakdown?.total ?? 0);
        setMatchHistory(prev => [
          ...prev,
          {
            id: logged.id,
            label: `R${currentMatchRoundsRef.current.length}`,
            playerMove,
            aiMove,
            outcome: outcomeForPlayer,
          },
        ]);
      }
      decisionTraceRef.current = null;
      lastDecisionMsRef.current = null;
    },
    [aiMode, bestOf, logRound],
  );

  const aiChoose = useCallback((): Move => {
    decisionTraceRef.current = null;
    const ctx: Ctx = { playerMoves: playerHistory, aiMoves: aiHistory, outcomes: outcomeHistory, rng };
    const sessionMixer = ensureSessionMixer();
    const realtimeDist = sessionMixer.predict(ctx);
    const realtimeSnapshot = sessionMixer.snapshot();
    const realtimeExperts = realtimeSnapshot.experts.map(expert => ({
      name: expert.name,
      weight: clamp01(expert.weight),
      dist: normalize(expert.dist),
    }));
    const historyDisplay = ensureHistoryDisplayMixer();
    let historyDist: Dist = { ...UNIFORM };
    let historySnapshot: ReturnType<HedgeMixer["snapshot"]> | null = null;
    if (historyDisplay) {
      historyDist = historyDisplay.predict(ctx);
      historySnapshot = historyDisplay.snapshot();
    }
    const historyExperts = historySnapshot
      ? historySnapshot.experts.map(expert => ({
          name: expert.name,
          weight: clamp01(expert.weight),
          dist: normalize(expert.dist),
        }))
      : [];
    const useMixer = Boolean(currentProfile?.predictorDefault);
    if (!useMixer) {
      const heuristic = predictNext(playerHistory, rng);
      if (!heuristic.move || (heuristic.conf ?? 0) < 0.34) {
        const fallbackMove = MOVES[Math.floor(rng() * 3)] as Move;
        const trace: PendingDecision = {
          policy: "heuristic",
          heuristic: { predicted: heuristic.move, conf: heuristic.conf, reason: heuristic.reason || "Low confidence - random choice" },
          confidence: heuristic.conf ?? 0.33,
        };
        decisionTraceRef.current = trace;
        setLiveSnapshot(
          buildLiveSnapshot(trace, fallbackMove, {
            realtimeRounds: playerHistory.length,
            historyRounds: persistedModelRef.current?.roundsSeen ?? 0,
            historyUpdatedAt: persistedModelRef.current?.updatedAt ?? null,
          }),
        );
        return fallbackMove;
      }
      const heuristicDist: Dist = { rock: 0, paper: 0, scissors: 0 };
      heuristicDist[heuristic.move] = 1;
      const move = policyCounterFromDist(heuristicDist, aiMode, rng);
      const trace: PendingDecision = {
        policy: "heuristic",
        heuristic: { predicted: heuristic.move, conf: heuristic.conf, reason: heuristic.reason },
        confidence: heuristic.conf ?? 0.5,
      };
      decisionTraceRef.current = trace;
      setLiveSnapshot(
        buildLiveSnapshot(trace, move, {
          realtimeRounds: playerHistory.length,
          historyRounds: persistedModelRef.current?.roundsSeen ?? 0,
          historyUpdatedAt: persistedModelRef.current?.updatedAt ?? null,
        }),
      );
      return move;
    }
    const blendWeights = computeBlendWeights(playerHistory.length, persistedModelRef.current, aiMode);
    const blendedDist = blendDistributions(realtimeDist, historyDist, blendWeights);
    const move = policyCounterFromDist(blendedDist, aiMode, rng);
    const confidence = Math.max(blendedDist.rock, blendedDist.paper, blendedDist.scissors);
    const realtimeTop = MOVES.reduce((best, candidate) => (realtimeDist[candidate] > realtimeDist[best] ? candidate : best), MOVES[0]);
    const historyTop = historyExperts.length
      ? MOVES.reduce((best, candidate) => (historyDist[candidate] > historyDist[best] ? candidate : best), MOVES[0])
      : null;
    const blendedTop = MOVES.reduce((best, candidate) => (blendedDist[candidate] > blendedDist[best] ? candidate : best), MOVES[0]);
    const trace: PendingDecision = {
      policy: "mixer",
      mixer: {
        dist: blendedDist,
        experts: [
          ...realtimeExperts.map(expert => ({
            name: expert.name,
            weight: expert.weight * blendWeights.realtimeWeight,
            dist: expert.dist,
            source: "realtime" as const,
          })),
          ...historyExperts.map(expert => ({
            name: expert.name,
            weight: expert.weight * blendWeights.historyWeight,
            dist: expert.dist,
            source: "history" as const,
          })),
        ],
        counter: move,
        confidence,
        realtimeDist,
        historyDist,
        realtimeWeight: blendWeights.realtimeWeight,
        historyWeight: blendWeights.historyWeight,
        realtimeExperts,
        historyExperts,
        realtimeRounds: playerHistory.length,
        historyRounds: persistedModelRef.current?.roundsSeen ?? 0,
        conflict:
          historyTop && blendedTop && historyTop !== blendedTop
            ? { realtime: realtimeTop, history: historyTop }
            : null,
      },
      confidence,
    };
    decisionTraceRef.current = trace;
    setLiveSnapshot(
      buildLiveSnapshot(trace, move, {
        realtimeRounds: playerHistory.length,
        historyRounds: persistedModelRef.current?.roundsSeen ?? 0,
        historyUpdatedAt: persistedModelRef.current?.updatedAt ?? null,
      }),
    );
    return move;
  }, [aiHistory, aiMode, currentProfile?.predictorDefault, ensureHistoryDisplayMixer, ensureSessionMixer, outcomeHistory, playerHistory, rng]);

  const reveal = useCallback(() => {
    const currentPlayerPick = playerPickRef.current;
    if (!currentPlayerPick) return;
    const aiMove = aiChoose();
    setAiPick(aiMove);
    setPhase("reveal");
    scheduleTimeout(() => {
      const roundOutcome = resolveOutcome(currentPlayerPick, aiMove);
      setOutcome(roundOutcome);
      setPhase("resolve");
      const ctx: Ctx = { playerMoves: playerHistory, aiMoves: aiHistory, outcomes: outcomeHistory, rng };
      if (currentProfile?.predictorDefault) {
        ensureHistoryMixer().update(ctx, currentPlayerPick);
        roundsSeenRef.current += 1;
        scheduleModelPersist();
        ensureSessionMixer().update(ctx, currentPlayerPick);
      }
      scheduleTimeout(() => {
        recordRound(currentPlayerPick, aiMove, roundOutcome);
        setOutcomeHistory(prev => [...prev, roundOutcome]);
        setPlayerHistory(prev => [...prev, currentPlayerPick]);
        setAiHistory(prev => [...prev, aiMove]);
        setPhase("feedback");
      }, 150);
    }, timings.revealHoldMs);
  }, [
    aiChoose,
    aiHistory,
    aiMode,
    currentProfile?.predictorDefault,
    ensureHistoryMixer,
    ensureSessionMixer,
    outcomeHistory,
    playerHistory,
    recordRound,
    rng,
    scheduleModelPersist,
    scheduleTimeout,
    timings.revealHoldMs,
  ]);

  const startCountdown = useCallback(() => {
    clearCountdown();
    setPhase("countdown");
    setCountdown(3);
    countdownRef.current = window.setInterval(() => {
      setCountdown(prev => {
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
      if (phase !== "idle" || resultBanner) return;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (roundStartRef.current !== null) {
        lastDecisionMsRef.current = Math.max(0, Math.round(now - roundStartRef.current));
      } else {
        lastDecisionMsRef.current = null;
      }
      setPlayerPick(move);
      playerPickRef.current = move;
      setSelectedMove(move);
      setPhase("selected");
      scheduleTimeout(startCountdown, 140);
    },
    [phase, resultBanner, scheduleTimeout, startCountdown],
  );

  useEffect(() => {
    if (phase !== "feedback" || !outcome) return;
    if (outcome === "win") setPlayerScore(prev => prev + 1);
    if (outcome === "lose") setAiScore(prev => prev + 1);
  }, [outcome, phase]);

  useEffect(() => {
    if (phase !== "selected") return;
    const timeoutId = scheduleTimeout(() => {
      if (playerPickRef.current) startCountdown();
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [phase, scheduleTimeout, startCountdown]);

  useEffect(() => {
    if (phase !== "feedback") return;
    const timeoutId = scheduleTimeout(() => {
      const totalNeeded = Math.ceil(bestOf / 2);
      const someoneWon = playerScore >= totalNeeded || aiScore >= totalNeeded;
      if (someoneWon) {
        const banner: ResultBanner = playerScore > aiScore ? "Victory" : playerScore < aiScore ? "Defeat" : "Tie";
        const endedAt = new Date().toISOString();
        const totalRounds = outcomeHistory.length + 1;
        const aiWins = [...outcomeHistory, outcome].filter(value => value === "lose").length;
        const matchScore = computeMatchScore(currentMatchRoundsRef.current);
        logMatch({
          clientId: currentMatchIdRef.current,
          startedAt: matchStartRef.current,
          endedAt,
          mode: "challenge",
          bestOf,
          difficulty: aiMode,
          score: { you: playerScore, ai: aiScore },
          rounds: totalRounds,
          aiWinRate: totalRounds ? aiWins / totalRounds : 0,
          youSwitchedRate: computeSwitchRate([...playerHistory, playerPick].filter(Boolean) as Move[]),
          notes: undefined,
          leaderboardScore: matchScore?.total,
          leaderboardMaxStreak: matchScore?.maxStreak,
          leaderboardRoundCount: matchScore?.rounds,
          leaderboardTimerBonus: matchScore?.timerBonus,
          leaderboardBeatConfidenceBonus: matchScore?.beatConfidenceBonus,
          leaderboardType: "Challenge",
        });
        currentMatchRoundsRef.current = [];
        setResultBanner(banner);
        return;
      }
      setRoundNumber(prev => prev + 1);
      setPlayerPick(undefined);
      playerPickRef.current = undefined;
      setAiPick(undefined);
      setOutcome(undefined);
      setSelectedMove(undefined);
      setCountdown(3);
      setPhase("idle");
      roundStartRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    }, timings.resultBannerMs);
    return () => window.clearTimeout(timeoutId);
  }, [
    aiMode,
    aiScore,
    bestOf,
    logMatch,
    outcome,
    outcomeHistory,
    phase,
    playerHistory,
    playerPick,
    playerScore,
    scheduleTimeout,
    timings.resultBannerMs,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === "1") selectMove("rock");
      if (event.key === "2") selectMove("paper");
      if (event.key === "3") selectMove("scissors");
      if (event.key.toLowerCase() === "d") navigate(PLAY_DASHBOARD_PATH);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, selectMove]);

  const historySlots = useMemo<ChallengeHistoryEntry[]>(() => {
    const totalSlots = Math.max(bestOf, matchHistory.length || bestOf);
    return Array.from({ length: totalSlots }, (_, index) => {
      const round = matchHistory[index];
      if (round) return round;
      return {
        id: `pending-${index + 1}`,
        label: `R${index + 1}`,
        outcome: "pending",
      };
    });
  }, [bestOf, matchHistory]);

  const revealState = useMemo(() => {
    if (resultBanner) {
      return {
        centerLabel: resultBanner,
        centerTitle: resultBanner === "Victory" ? "Match secured" : resultBanner === "Defeat" ? "AI took the set" : "Match tied",
        centerDetail: `${playerScore} - ${aiScore}`,
      };
    }
    if (phase === "feedback") {
      return {
        centerLabel: outcome === "win" ? "Round won" : outcome === "lose" ? "Round lost" : "Round tied",
        centerTitle: outcome === "win" ? "Point taken" : outcome === "lose" ? "Counter landed" : "No point scored",
        centerDetail: "Resetting next hand",
      };
    }
    if (phase === "resolve" || phase === "reveal") {
      return {
        centerLabel: "Reveal",
        centerTitle: "Hands shown",
        centerDetail: playerPick && aiPick ? `${prettyMove(playerPick)} vs ${prettyMove(aiPick)}` : "Resolving round",
      };
    }
    if (phase === "countdown") {
      return {
        centerLabel: "Locked in",
        centerTitle: countdown > 0 ? `${countdown}` : "Reveal",
        centerDetail: "Counterplay incoming",
      };
    }
    if (phase === "selected") {
      return {
        centerLabel: "Queued",
        centerTitle: "Move selected",
        centerDetail: "Countdown starting",
      };
    }
    return {
      centerLabel: "Live match",
      centerTitle: "Choose your move",
      centerDetail: "Predictor active",
    };
  }, [aiPick, aiScore, countdown, outcome, phase, playerPick, playerScore, resultBanner]);

  const aiSignals = useMemo(() => buildAiSignals(liveSnapshot), [liveSnapshot]);
  const predictionSources = useMemo(() => buildPredictionSources(liveSnapshot), [liveSnapshot]);

  return {
    aiMode,
    aiPick,
    aiScore,
    aiSignals,
    bestOf,
    bestOfOptions: GAMEPLAY_BEST_OF_OPTIONS,
    currentPlayerName,
    countdown,
    difficultyOptions: GAMEPLAY_DIFFICULTY_OPTIONS,
    goToDashboard: () => navigate(PLAY_DASHBOARD_PATH),
    isInputLocked: phase !== "idle" || Boolean(resultBanner),
    liveSnapshot,
    matchHistory: historySlots,
    matchScoreTotal,
    outcome,
    phase,
    playAgain: resetMatch,
    playerPick,
    playerScore,
    predictionSources,
    resultBanner,
    resultSummary: resultBanner ? `${resultBanner} • ${playerScore} - ${aiScore}` : null,
    revealState,
    roundNumber,
    scoreLabel: `${playerScore} - ${aiScore}`,
    selectMove,
    selectedMove,
    setAiMode,
    setBestOf,
  };
}
