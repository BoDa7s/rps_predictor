import React, { useMemo, useState } from "react";
import type { Move } from "./gameTypes";
import type { DecisionPolicy, RoundLog } from "./stats";

export interface LiveInsightSnapshot {
  policy: DecisionPolicy;
  confidence: number;
  predictedMove: Move | null;
  counterMove: Move | null;
  distribution: Record<Move, number>;
  topExperts: Array<{ name: string; weight: number; topMove: Move | null; probability: number }>;
  reason?: string | null;
}

interface InsightPanelProps {
  snapshot: LiveInsightSnapshot | null;
  liveRounds: RoundLog[];
  historicalRounds: RoundLog[];
  titleRef: React.RefObject<HTMLHeadingElement>;
  onClose: () => void;
}

const MOVES: Move[] = ["rock", "paper", "scissors"];

type Distribution = Record<Move, number>;

type DerivedEntry = {
  round: RoundLog;
  dist: Distribution;
  topMove: Move;
  maxProb: number;
  actualProb: number;
  correct: boolean;
  index: number;
};

type CalibrationBin = {
  lower: number;
  upper: number;
  total: number;
  accuracy: number;
  avgConfidence: number;
};

type SurpriseEntry = {
  value: number;
  logValue: number;
  round: RoundLog;
  index: number;
};

type AdaptationWindow = {
  start: number;
  end: number;
  length: number;
};

type ConfidenceBand = {
  label: string;
  min: number;
  max: number;
  matrix: Record<Move, Record<Move, number>>;
};

const MAX_ENTRIES_FOR_TIMELINES = 32;

function clampProbability(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeDist(dist: Partial<Record<Move, number>>): Distribution {
  const safe: Record<Move, number> = {
    rock: clampProbability(dist.rock),
    paper: clampProbability(dist.paper),
    scissors: clampProbability(dist.scissors),
  };
  const total = safe.rock + safe.paper + safe.scissors;
  if (!total) {
    return { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 };
  }
  return {
    rock: safe.rock / total,
    paper: safe.paper / total,
    scissors: safe.scissors / total,
  };
}

function expectedPlayerMoveFromAi(aiMove: Move | null | undefined): Move | null {
  if (!aiMove) return null;
  const mapping: Record<Move, Move> = {
    rock: "scissors",
    paper: "rock",
    scissors: "paper",
  };
  return mapping[aiMove];
}

function buildDistribution(round: RoundLog): Distribution | null {
  if (round.mixer?.dist) {
    return normalizeDist(round.mixer.dist as Distribution);
  }
  if (round.heuristic?.predicted) {
    const predicted = round.heuristic.predicted;
    const conf = clampProbability(round.heuristic.conf ?? round.confidence ?? 0.34);
    const remainder = Math.max(0, 1 - conf);
    const others = MOVES.filter(move => move !== predicted);
    const share = others.length ? remainder / others.length : 0;
    const dist: Distribution = { rock: share, paper: share, scissors: share };
    dist[predicted] = conf;
    return normalizeDist(dist);
  }
  const fallbackPredicted = expectedPlayerMoveFromAi(round.ai);
  if (fallbackPredicted) {
    const conf = clampProbability(round.confidence ?? 0.34);
    const remainder = Math.max(0, 1 - conf);
    const others = MOVES.filter(move => move !== fallbackPredicted);
    const share = others.length ? remainder / others.length : 0;
    const dist: Distribution = { rock: share, paper: share, scissors: share };
    dist[fallbackPredicted] = conf;
    return normalizeDist(dist);
  }
  return null;
}

function sortRoundsChronologically(rounds: RoundLog[]): RoundLog[] {
  return [...rounds].sort((a, b) => {
    if (a.t === b.t) return 0;
    return a.t < b.t ? -1 : 1;
  });
}

function computeDerivedEntries(rounds: RoundLog[]): DerivedEntry[] {
  const sorted = sortRoundsChronologically(rounds);
  const derived: DerivedEntry[] = [];
  sorted.forEach((round, index) => {
    const dist = buildDistribution(round);
    if (!dist) return;
    let topMove: Move = MOVES[0];
    for (const move of MOVES) {
      if (dist[move] > dist[topMove]) {
        topMove = move;
      }
    }
    const maxProb = clampProbability(dist[topMove]);
    const actualProb = clampProbability(dist[round.player]);
    derived.push({
      round,
      dist,
      topMove,
      maxProb,
      actualProb,
      correct: topMove === round.player,
      index,
    });
  });
  return derived;
}

function computeCalibrationBins(entries: DerivedEntry[]): CalibrationBin[] {
  const bins: CalibrationBin[] = Array.from({ length: 10 }, (_, idx) => ({
    lower: idx / 10,
    upper: (idx + 1) / 10,
    total: 0,
    accuracy: 0,
    avgConfidence: 0,
  }));
  entries.forEach(entry => {
    const binIndex = Math.min(9, Math.floor(entry.maxProb * 10));
    const target = bins[binIndex];
    target.total += 1;
    target.accuracy += entry.correct ? 1 : 0;
    target.avgConfidence += entry.maxProb;
  });
  bins.forEach(bin => {
    if (!bin.total) return;
    bin.accuracy /= bin.total;
    bin.avgConfidence /= bin.total;
  });
  return bins;
}

function computeECE(entries: DerivedEntry[], bins: CalibrationBin[]): number | null {
  if (!entries.length) return null;
  let total = 0;
  bins.forEach(bin => {
    if (!bin.total) return;
    const gap = Math.abs(bin.accuracy - bin.avgConfidence);
    total += gap * (bin.total / entries.length);
  });
  return total;
}

function computeBrierValues(entries: DerivedEntry[]): number[] {
  return entries.map(entry => {
    return MOVES.reduce((acc, move) => {
      const forecast = clampProbability(entry.dist[move]);
      const outcome = entry.round.player === move ? 1 : 0;
      const delta = forecast - outcome;
      return acc + delta * delta;
    }, 0);
  });
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function entropy(dist: Distribution): number {
  let result = 0;
  MOVES.forEach(move => {
    const value = clampProbability(dist[move]);
    if (value > 0) {
      result -= value * Math.log(value);
    }
  });
  return result;
}

function computeSharpnessValues(entries: DerivedEntry[]): number[] {
  const maxEntropy = Math.log(MOVES.length);
  return entries.map(entry => {
    const ent = entropy(entry.dist);
    if (maxEntropy === 0) return 0;
    return 1 - ent / maxEntropy;
  });
}

function computeStdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function buildSparklinePoints(values: number[], width: number, height: number): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const safeMax = max === min ? max + 1 : max;
  const step = values.length === 1 ? width : width / (values.length - 1);
  return values
    .map((value, index) => {
      const normalized = (value - min) / (safeMax - min);
      const x = index * step;
      const y = height - normalized * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function computeSurpriseValues(entries: DerivedEntry[]): SurpriseEntry[] {
  return entries.map((entry, index) => {
    const pTrue = clampProbability(entry.dist[entry.round.player]);
    return {
      value: 1 - pTrue,
      logValue: pTrue > 0 ? -Math.log(pTrue) : Number.POSITIVE_INFINITY,
      round: entry.round,
      index,
    };
  });
}

function computeAdaptationWindows(entries: DerivedEntry[]): AdaptationWindow[] {
  const epsilon = 0.02;
  const windowSize = 4;
  const result: AdaptationWindow[] = [];
  let start: number | null = null;
  for (let index = 1; index < entries.length; index++) {
    const current = entries[index];
    const previous = entries[index - 1];
    const flip = current.topMove !== previous.topMove;
    const wrong = !current.correct;
    if (flip && wrong && start === null) {
      start = index - 1;
    }
    if (start !== null) {
      const slice = entries.slice(Math.max(start, index - windowSize + 1), index + 1);
      const maxProbs = slice.map(item => item.maxProb);
      const variance = computeStdDev(maxProbs);
      const regained = slice.slice(-2).every(item => item.correct);
      if ((variance ?? 0) < Math.sqrt(epsilon) && regained) {
        result.push({ start, end: index, length: index - start + 1 });
        start = null;
      }
    }
  }
  return result;
}

function createEmptyMatrix(): Record<Move, Record<Move, number>> {
  const base: Record<Move, number> = { rock: 0, paper: 0, scissors: 0 };
  return {
    rock: { ...base },
    paper: { ...base },
    scissors: { ...base },
  };
}

function computeConfidenceBands(entries: DerivedEntry[]): ConfidenceBand[] {
  const bands: ConfidenceBand[] = [
    { label: "0–40%", min: 0, max: 0.4, matrix: createEmptyMatrix() },
    { label: "40–70%", min: 0.4, max: 0.7, matrix: createEmptyMatrix() },
    { label: "70–100%", min: 0.7, max: 1.001, matrix: createEmptyMatrix() },
  ];
  entries.forEach(entry => {
    const band = bands.find(item => entry.maxProb >= item.min && entry.maxProb < item.max);
    if (!band) return;
    band.matrix[entry.topMove][entry.round.player] += 1;
  });
  return bands;
}

function formatPercent(value: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatNumber(value: number | null, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function formatMove(move: Move | null): string {
  if (!move) return "—";
  return move.charAt(0).toUpperCase() + move.slice(1);
}

function renderSparkline(values: number[], width: number, height: number, className?: string) {
  const points = buildSparklinePoints(values, width, height);
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <polyline fill="none" stroke="#0ea5e9" strokeWidth={2} points={points} />
    </svg>
  );
}

const InsightPanel: React.FC<InsightPanelProps> = ({ snapshot, liveRounds, historicalRounds, titleRef, onClose }) => {
  const [threshold, setThreshold] = useState(0.7);

  const derived = useMemo(() => {
    const entries = computeDerivedEntries(historicalRounds);
    const bins = computeCalibrationBins(entries);
    const ece = computeECE(entries, bins);
    const brierValues = computeBrierValues(entries);
    const sharpnessValues = computeSharpnessValues(entries);
    const surpriseValues = computeSurpriseValues(entries);
    const bands = computeConfidenceBands(entries);
    const maxProbSeries = entries.map(entry => entry.maxProb);
    const volatilityDiffs: number[] = [];
    for (let index = 1; index < maxProbSeries.length; index++) {
      volatilityDiffs.push(maxProbSeries[index] - maxProbSeries[index - 1]);
    }
    const volatilityStd = computeStdDev(volatilityDiffs);
    const predictedSeries = entries.map(entry => entry.topMove);
    const flipIndices: number[] = [];
    for (let index = 1; index < predictedSeries.length; index++) {
      if (predictedSeries[index] !== predictedSeries[index - 1]) {
        flipIndices.push(index);
      }
    }
    const flipRate = predictedSeries.length > 1 ? flipIndices.length / (predictedSeries.length - 1) : null;
    const adaptationWindows = computeAdaptationWindows(entries);

    return {
      entries,
      bins,
      ece,
      brierValues,
      sharpnessValues,
      surpriseValues,
      bands,
      maxProbSeries,
      volatilityDiffs,
      volatilityStd,
      flipIndices,
      flipRate,
      adaptationWindows,
    };
  }, [historicalRounds]);

  const coverage = useMemo(() => {
    const { entries } = derived;
    if (!entries.length) {
      return {
        coverageRate: null,
        accuracy: null,
        mistakeRate: null,
        coveredCount: 0,
      };
    }
    const filtered = entries.filter(entry => entry.maxProb >= threshold);
    const coverageRate = filtered.length / entries.length;
    const correctCount = filtered.filter(entry => entry.correct).length;
    const accuracy = filtered.length ? correctCount / filtered.length : null;
    const mistakeRate = accuracy == null ? null : 1 - accuracy;
    return {
      coverageRate,
      accuracy,
      mistakeRate,
      coveredCount: filtered.length,
    };
  }, [derived, threshold]);

  const averageBrier = useMemo(() => average(derived.brierValues), [derived.brierValues]);
  const averageSharpness = useMemo(() => average(derived.sharpnessValues), [derived.sharpnessValues]);
  const averageSurprise = useMemo(() => average(derived.surpriseValues.map(item => item.value)), [derived.surpriseValues]);
  const topSurprises = useMemo(() => {
    return [...derived.surpriseValues]
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
  }, [derived.surpriseValues]);

  const recentLiveRounds = useMemo(() => {
    const sorted = sortRoundsChronologically(liveRounds);
    return sorted.slice(-12);
  }, [liveRounds]);

  const reliabilityPoints = useMemo(() => {
    const points = derived.bins
      .filter(bin => bin.total)
      .map(bin => ({ x: bin.avgConfidence, y: bin.accuracy }));
    return points;
  }, [derived.bins]);

  const maxBandCount = useMemo(() => {
    return derived.bands.reduce((acc, band) => {
      const values = MOVES.flatMap(pred => MOVES.map(actual => band.matrix[pred][actual]));
      const bandMax = values.length ? Math.max(...values) : 0;
      return Math.max(acc, bandMax);
    }, 0);
  }, [derived.bands]);

  const decileRows = derived.bins.map((bin, index) => ({
    label: `${index * 10}–${index === 9 ? 100 : (index + 1) * 10}%`,
    avgConfidence: bin.total ? bin.avgConfidence : null,
    accuracy: bin.total ? bin.accuracy : null,
    rounds: bin.total,
    gap: bin.total ? Math.abs(bin.accuracy - bin.avgConfidence) : null,
  }));

  const recentBrier = derived.brierValues.slice(-MAX_ENTRIES_FOR_TIMELINES);
  const recentVolatility = derived.maxProbSeries.slice(-MAX_ENTRIES_FOR_TIMELINES);
  const recentSurprise = derived.surpriseValues.slice(-MAX_ENTRIES_FOR_TIMELINES).map(item => item.value);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="text-lg font-semibold text-slate-900 focus:outline-none"
          >
            Live AI Insight panel
          </h2>
          <p className="text-xs text-slate-500">Overlays the game with real-time confidence analytics.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
        >
          Close ✕
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-6 pb-8 pt-4">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Live AI Insight</h3>
                <p className="text-xs text-slate-500">Confidence, probabilities, and expert blend for the next move.</p>
              </div>
              <div className="text-right text-sm text-slate-600">
                <div className="font-semibold text-slate-900">{formatPercent(snapshot?.confidence ?? null, 0)} confidence</div>
                <div>{snapshot?.policy === "mixer" ? "Mixer" : "Heuristic"} policy</div>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Predicted move</div>
                <div className="text-2xl font-semibold text-slate-900">{formatMove(snapshot?.predictedMove ?? null)}</div>
                <p className="text-xs text-slate-500">AI plans to counter with {formatMove(snapshot?.counterMove ?? null)}.</p>
                <div className="mt-3 space-y-2">
                  {MOVES.map(move => {
                    const value = snapshot?.distribution?.[move] ?? 0;
                    return (
                      <div key={move} className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>{formatMove(move)}</span>
                          <span>{formatPercent(value, 0)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-sky-500"
                            style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why</div>
                  <p className="mt-1 text-sm text-slate-700">{snapshot?.reason || "Not enough signal yet."}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top experts</div>
                  <ul className="mt-1 space-y-1 text-sm text-slate-700">
                    {snapshot?.topExperts.length ? (
                      snapshot.topExperts.map(expert => (
                        <li key={expert.name} className="rounded-lg bg-slate-50 px-3 py-2 shadow-inner">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{expert.name}</span>
                            <span>{formatPercent(expert.weight, 0)} weight</span>
                          </div>
                          <div className="text-sm text-slate-700">
                            Favours {formatMove(expert.topMove)} ({formatPercent(expert.probability, 0)})
                          </div>
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-slate-500">No expert signal yet.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent rounds</div>
              <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                {recentLiveRounds.length ? (
                  recentLiveRounds.map((round, index) => (
                    <div key={round.id} className="rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Round {recentLiveRounds.length - index}</span>
                        <span>{formatPercent(round.confidence ?? 0, 0)}</span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">
                        You {formatMove(round.player)} vs AI {formatMove(round.ai)}
                      </div>
                      <div className="text-[11px] text-slate-500">{round.reason}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
                    Play a few rounds to populate the live timeline.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Confidence diagnostics</h3>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Calibration (ECE)</div>
                    <p className="text-xs text-slate-500">Lower is better. Perfect calibration sits on the diagonal.</p>
                  </div>
                  <div className="text-lg font-semibold text-slate-900">{formatNumber(derived.ece, 3)}</div>
                </div>
                <div className="mt-3">
                  <svg width={220} height={140} className="w-full" role="img" aria-label="Reliability diagram">
                    <line x1={0} y1={140} x2={220} y2={0} stroke="#cbd5f5" strokeWidth={1} />
                    <polyline
                      fill="none"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      points={reliabilityPoints
                        .map(point => {
                          const x = point.x * 220;
                          const y = 140 - point.y * 140;
                          return `${x.toFixed(2)},${y.toFixed(2)}`;
                        })
                        .join(" ")}
                    />
                  </svg>
                  <div className="mt-2 grid grid-cols-5 gap-1 text-[11px] text-slate-500">
                    {derived.bins.map((bin, index) => (
                      <div key={index} className="rounded bg-slate-100 px-1 py-0.5 text-center">
                        {(bin.lower * 100).toFixed(0)}%
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Brier score (multi-class)</div>
                    <p className="text-xs text-slate-500">Overall forecast quality. Lower is better.</p>
                  </div>
                  <div className="text-lg font-semibold text-slate-900">{formatNumber(averageBrier, 3)}</div>
                </div>
                <div className="mt-3">
                  {recentBrier.length ? (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">Recent rounds</div>
                      {renderSparkline(recentBrier, 220, 60, "mt-1")}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Not enough rounds to compute the trend.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Sharpness</div>
                    <p className="text-xs text-slate-500">Measures how peaked the predictions are.</p>
                  </div>
                  <div className="text-lg font-semibold text-slate-900">{formatNumber(averageSharpness, 3)}</div>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <div
                    className="relative h-20 w-20 rounded-full"
                    style={{
                      background: `conic-gradient(#0ea5e9 ${Math.max(0, (averageSharpness ?? 0) * 100)}%, rgba(14,165,233,0.15) ${
                        Math.max(0, (averageSharpness ?? 0) * 100
                      )}%)`,
                    }}
                    aria-hidden
                  >
                    <div className="absolute inset-2 grid place-items-center rounded-full bg-white text-sm font-semibold text-slate-800">
                      {formatPercent(averageSharpness, 0)}
                    </div>
                  </div>
                  <div className="flex-1 text-xs text-slate-500">
                    Sharpness ignores correctness—only how concentrated the probabilities are. The inner number shows the average.
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">High-confidence coverage</div>
                    <p className="text-xs text-slate-500">How often and how accurate the AI is above the chosen threshold.</p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div className="text-lg font-semibold text-slate-900">τ = {formatPercent(threshold, 0)}</div>
                    <button
                      type="button"
                      className="mt-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                      onClick={() => setThreshold(prev => (prev >= 0.9 ? 0.7 : parseFloat((prev + 0.1).toFixed(1))))}
                    >
                      Adjust +0.1
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="flex items-center gap-3 text-xs text-slate-600">
                    <span>Threshold</span>
                    <input
                      type="range"
                      min={0.5}
                      max={0.95}
                      step={0.05}
                      value={threshold}
                      onChange={event => setThreshold(parseFloat(event.target.value))}
                      className="flex-1 accent-sky-600"
                    />
                  </label>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
                    <div className="rounded-lg bg-sky-50 px-3 py-2">
                      <div className="text-[11px] uppercase text-slate-500">Coverage</div>
                      <div className="text-sm font-semibold text-slate-800">{formatPercent(coverage.coverageRate, 0)}</div>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-3 py-2">
                      <div className="text-[11px] uppercase text-slate-500">Accuracy@τ</div>
                      <div className="text-sm font-semibold text-emerald-700">{formatPercent(coverage.accuracy, 0)}</div>
                    </div>
                    <div className="rounded-lg bg-rose-50 px-3 py-2">
                      <div className="text-[11px] uppercase text-slate-500">Mistake rate</div>
                      <div className="text-sm font-semibold text-rose-600">{formatPercent(coverage.mistakeRate, 0)}</div>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {coverage.coveredCount} rounds met the threshold out of {derived.entries.length} analysed.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Stability & behaviour</h3>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Confidence volatility</div>
                    <p className="text-xs text-slate-500">Std. dev. of change in max probability between rounds.</p>
                  </div>
                  <div className="text-lg font-semibold text-slate-900">{formatNumber(derived.volatilityStd, 3)}</div>
                </div>
                <div className="mt-3">
                  {recentVolatility.length ? (
                    <div>
                      <div className="text-[11px] uppercase text-slate-400">Max probability trace</div>
                      {renderSparkline(recentVolatility, 220, 60, "mt-1")}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Need more rounds to chart volatility.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Prediction flip rate</div>
                    <p className="text-xs text-slate-500">How often the top predicted move changes round-to-round.</p>
                  </div>
                  <div className="text-lg font-semibold text-slate-900">{formatPercent(derived.flipRate, 0)}</div>
                </div>
                <div className="mt-3">
                  <div className="text-[11px] uppercase text-slate-400">Flip markers</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {derived.flipIndices.length ? (
                      derived.flipIndices.slice(-MAX_ENTRIES_FOR_TIMELINES).map(index => (
                        <span key={index} className="rounded-full bg-slate-900/10 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          #{index + 1}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">No flips detected yet.</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Surprise index</div>
                    <p className="text-xs text-slate-500">1 − p(actual). Higher means the AI was more surprised.</p>
                  </div>
                  <div className="text-lg font-semibold text-slate-900">{formatPercent(averageSurprise, 0)}</div>
                </div>
                <div className="mt-3 space-y-2">
                  {topSurprises.length ? (
                    topSurprises.map(entry => (
                      <div key={entry.round.id} className="rounded-lg bg-amber-50 px-3 py-2">
                        <div className="flex items-center justify-between text-xs text-amber-700">
                          <span>Round #{entry.index + 1}</span>
                          <span>{formatPercent(entry.value, 0)}</span>
                        </div>
                        <div className="text-sm text-amber-800">AI expected {formatMove(derived.entries[entry.index]?.topMove ?? null)}</div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No surprises yet—keep playing!</p>
                  )}
                  {recentSurprise.length ? (
                    <div>
                      <div className="text-[11px] uppercase text-slate-400">Trend</div>
                      {renderSparkline(recentSurprise, 220, 60, "mt-1")}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Time-to-adapt</div>
                    <p className="text-xs text-slate-500">Rounds needed to stabilise after a detected change.</p>
                  </div>
                  <div className="text-lg font-semibold text-slate-900">
                    {derived.adaptationWindows.length
                      ? `${derived.adaptationWindows[derived.adaptationWindows.length - 1].length} rounds`
                      : "—"}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {derived.adaptationWindows.length ? (
                    derived.adaptationWindows.slice(-5).map((window, idx) => (
                      <div key={`${window.start}-${idx}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>Change #{derived.adaptationWindows.length - window.start}</span>
                          <span>{window.length} rounds</span>
                        </div>
                        <div>Stabilised from round {window.start + 1} to {window.end + 1}</div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No adaptation windows detected yet.</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Confidence-stratified confusion</h3>
            <div className="grid gap-4 lg:grid-cols-3">
              {derived.bands.map(band => (
                <div key={band.label} className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                  <div className="text-sm font-semibold text-slate-800">{band.label}</div>
                  <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[11px] text-slate-500">
                    <div className="flex items-center justify-center rounded bg-slate-100 px-1 py-0.5">Pred →</div>
                    {MOVES.map(move => (
                      <div key={move} className="rounded bg-slate-100 px-1 py-0.5">{formatMove(move)}</div>
                    ))}
                    {MOVES.map(predicted => (
                      <React.Fragment key={predicted}>
                        <div className="flex items-center justify-center rounded bg-slate-100 px-1 py-0.5">
                          {formatMove(predicted)}
                        </div>
                        {MOVES.map(actual => {
                          const count = band.matrix[predicted][actual];
                          const intensity = maxBandCount ? count / maxBandCount : 0;
                          return (
                            <div
                              key={`${predicted}-${actual}`}
                              className="rounded px-1 py-2 text-xs font-semibold text-slate-700"
                              style={{
                                backgroundColor: `rgba(14, 165, 233, ${intensity * 0.6})`,
                              }}
                            >
                              {count}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Decile accuracy table</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Decile</th>
                    <th className="py-2 pr-3">Avg confidence</th>
                    <th className="py-2 pr-3">Accuracy</th>
                    <th className="py-2 pr-3">Rounds</th>
                    <th className="py-2">Gap |acc − conf|</th>
                  </tr>
                </thead>
                <tbody>
                  {decileRows.map(row => (
                    <tr key={row.label} className="border-b border-slate-100 last:border-none">
                      <td className="py-2 pr-3">{row.label}</td>
                      <td className="py-2 pr-3">{formatPercent(row.avgConfidence, 0)}</td>
                      <td className="py-2 pr-3">{formatPercent(row.accuracy, 0)}</td>
                      <td className="py-2 pr-3">{row.rounds}</td>
                      <td className="py-2">
                        <div
                          className="h-2 rounded-full bg-slate-200"
                          aria-hidden
                        >
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${Math.min(1, row.gap ?? 0) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default InsightPanel;
