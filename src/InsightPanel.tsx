import React, { useMemo, useState } from "react";
import type { Move } from "./gameTypes";
import type { DecisionPolicy, RoundLog } from "./stats";
import { MoveIcon, MoveLabel } from "./moveIcons";

export interface LiveInsightSnapshot {
  policy: DecisionPolicy;
  confidence: number;
  predictedMove: Move | null;
  counterMove: Move | null;
  distribution: Record<Move, number>;
  topExperts: Array<{ name: string; weight: number; topMove: Move | null; probability: number }>;
  reason?: string | null;
  realtimeDistribution: Record<Move, number>;
  historyDistribution: Record<Move, number>;
  realtimeWeight: number;
  historyWeight: number;
  realtimeExperts: Array<{ name: string; weight: number; topMove: Move | null; probability: number }>;
  historyExperts: Array<{ name: string; weight: number; topMove: Move | null; probability: number }>;
  realtimeRounds: number;
  historyRounds: number;
  historyUpdatedAt: string | null;
  conflict: { realtime: Move | null; history: Move | null } | null;
  realtimeMove: Move | null;
  historyMove: Move | null;
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
const HIGH_CONFIDENCE_THRESHOLD = 0.7;

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

function formatRelativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return null;
  const diff = Date.now() - timestamp;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) {
    return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatNumber(value: number | null, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function formatMove(move: Move | null): string {
  if (!move) return "—";
  return move.charAt(0).toUpperCase() + move.slice(1);
}

function renderMoveGlyph(move: Move | null, size = 16): React.ReactNode {
  if (!move) {
    return <span className="text-xs text-slate-400">•</span>;
  }
  return <MoveIcon move={move} size={size} />;
}

function renderMoveLabel(move: Move | null, options?: { iconSize?: number | string; textClassName?: string }) {
  if (!move) return <span className="text-slate-400">—</span>;
  return (
    <MoveLabel
      move={move}
      iconSize={options?.iconSize ?? 16}
      textClassName={options?.textClassName}
      className="gap-1"
    />
  );
}

function renderSparkline(values: number[], width: number, height: number, className?: string) {
  const points = buildSparklinePoints(values, width, height);
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <polyline fill="none" stroke="var(--app-accent-strong)" strokeWidth={2} points={points} />
    </svg>
  );
}

const InfoChip: React.FC<{ description: string; label?: string }> = ({ description, label = "i" }) => (
  <span
    className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-slate-100 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
    title={description}
    aria-label={description}
  >
    {label}
  </span>
);

const LegendSwatch: React.FC<{ colorClass?: string; color?: string; label: string }> = ({ colorClass, color, label }) => (
  <span className="inline-flex items-center gap-2 text-xs text-slate-600">
    <span
      className={`h-2.5 w-2.5 rounded ${colorClass ?? ""}`.trim()}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    />
    <span>{label}</span>
  </span>
);

const BlendMeter: React.FC<{ snapshot: LiveInsightSnapshot | null }> = ({ snapshot }) => {
  const realtimeWeightRaw = clampProbability(snapshot?.realtimeWeight ?? 0);
  const historyWeightRaw = clampProbability(snapshot?.historyWeight ?? 0);
  const totalWeight = realtimeWeightRaw + historyWeightRaw;
  const realtimeShare = totalWeight > 0 ? realtimeWeightRaw / totalWeight : 0;
  const historyShare = totalWeight > 0 ? historyWeightRaw / totalWeight : 0;

  return (
    <div className="rounded-xl bg-slate-50/90 px-4 py-3 shadow-inner">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-slate-800">Blend</div>
          <InfoChip description="Mix between rules and learned behavior." />
        </div>
        <div className="text-sm font-semibold text-slate-900">
          {formatPercent(realtimeShare, 0)} realtime / {formatPercent(historyShare, 0)} history
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">Realtime mix uses what you just played; history leans on past rounds.</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-200" aria-hidden>
          <div
            className="absolute inset-y-0 left-0 app-accent-fill"
            style={{ width: `${Math.min(100, Math.max(0, realtimeShare * 100))}%` }}
          />
        </div>
        <div className="flex items-center gap-4">
          <LegendSwatch color="var(--app-accent-strong)" label="Realtime" />
          <LegendSwatch colorClass="bg-slate-500" label="History" />
        </div>
      </div>
    </div>
  );
};

const SessionTimeline: React.FC<{ rounds: RoundLog[] }> = ({ rounds }) => {
  const limited = rounds.slice(-MAX_ENTRIES_FOR_TIMELINES);
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Tiny timeline · Realtime</span>
        <span className="normal-case text-[11px] text-slate-400">
          {rounds.length ? `${rounds.length} round${rounds.length === 1 ? "" : "s"}` : "No rounds yet"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {limited.length ? (
          limited.map((round, index) => (
            <span
              key={round.id}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/80 text-[11px] font-semibold text-white"
              title={`Round ${rounds.length - limited.length + index + 1}: You played ${formatMove(round.player)}; AI played ${formatMove(round.ai)}.`}
            >
              {renderMoveGlyph(round.player, 18)}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-500">Play a round to populate the timeline.</span>
        )}
      </div>
    </div>
  );
};

interface PredictionSourcesProps {
  snapshot: LiveInsightSnapshot | null;
  realtimeRounds: number;
}

const PredictionSources: React.FC<PredictionSourcesProps> = ({ snapshot, realtimeRounds }) => {
  const realtimeWeight = clampProbability(snapshot?.realtimeWeight ?? 0);
  const historyWeight = clampProbability(snapshot?.historyWeight ?? 0);
  const total = realtimeWeight + historyWeight;
  const realtimeShare = total > 0 ? realtimeWeight / total : 0;
  const historyShare = total > 0 ? historyWeight / total : 0;

  const realtimeDistribution = normalizeDist(
    (snapshot?.realtimeDistribution ?? {}) as Partial<Record<Move, number>>,
  );
  const historyDistribution = normalizeDist(
    (snapshot?.historyDistribution ?? {}) as Partial<Record<Move, number>>,
  );
  const historyRounds = snapshot?.historyRounds ?? 0;

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prediction sources</div>
      <div className="space-y-3">
        <PredictionSourceCard
          title="Realtime (this match)"
          subtitle="Dominant"
          rounds={realtimeRounds}
          weight={realtimeShare}
          distribution={realtimeDistribution}
          variant="realtime"
        />
        <PredictionSourceCard
          title="Previous matches"
          subtitle="Supporting"
          rounds={historyRounds}
          weight={historyShare}
          distribution={historyDistribution}
          variant="history"
        />
      </div>
    </div>
  );
};

type PredictionVariant = "realtime" | "history";

interface PredictionSourceCardProps {
  title: string;
  subtitle: string;
  rounds: number;
  weight: number;
  distribution: Distribution;
  variant: PredictionVariant;
}

const PredictionSourceCard: React.FC<PredictionSourceCardProps> = ({
  title,
  subtitle,
  rounds,
  weight,
  distribution,
  variant,
}) => {
  const isRealtime = variant === "realtime";
  const variantStyles = isRealtime
    ? "app-accent-border text-slate-900"
    : "border-slate-200 bg-white/80 text-slate-900";
  const cardStyle = isRealtime ? { backgroundColor: "var(--app-accent-soft)" } : undefined;
  const barColor = isRealtime ? "app-accent-fill" : "bg-slate-500";
  const roundsLabel = rounds
    ? `${rounds} round${rounds === 1 ? "" : "s"}`
    : variant === "realtime"
    ? "Play now"
    : "Stored history";

  return (
    <div className={`rounded-xl border ${variantStyles} p-3`} style={cardStyle}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div className="font-semibold text-slate-700">{roundsLabel}</div>
          <div>{formatPercent(weight, 0)} weight</div>
        </div>
      </div>
      <DistributionList distribution={distribution} barColor={barColor} />
    </div>
  );
};

const DistributionList: React.FC<{ distribution: Distribution; barColor: string }> = ({
  distribution,
  barColor,
}) => {
  return (
    <div className="mt-3 space-y-1">
      {MOVES.map(move => {
        const value = distribution[move] ?? 0;
        return (
          <div key={move} className="space-y-0.5">
            <div className="flex justify-between text-xs text-slate-500">
              <span>{formatMove(move)}</span>
              <span>{formatPercent(value, 0)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200/70">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface SignalsDrawerProps {
  snapshot: LiveInsightSnapshot | null;
  open: boolean;
  onToggle: () => void;
}

const SignalsDrawer: React.FC<SignalsDrawerProps> = ({ snapshot, open, onToggle }) => {
  const realtimeExperts = snapshot?.realtimeExperts ?? [];
  const historyExperts = snapshot?.historyExperts ?? [];
  const hasSignals = realtimeExperts.length + historyExperts.length > 0;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left text-sm font-medium text-slate-700"
      >
        <span>Signals</span>
        <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-xs text-slate-600">
          {hasSignals ? (
            <>
              {realtimeExperts.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">From this session</div>
                  <div className="flex flex-wrap gap-2">
                    {realtimeExperts.map(expert => (
                      <ExpertChip key={`realtime-${expert.name}`} expert={expert} variant="realtime" />
                    ))}
                  </div>
                </div>
              )}
              {historyExperts.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">From previous sessions</div>
                  <div className="flex flex-wrap gap-2">
                    {historyExperts.map(expert => (
                      <ExpertChip key={`history-${expert.name}`} expert={expert} variant="history" />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-500">Play a few rounds to surface expert signals.</span>
          )}
        </div>
      )}
    </div>
  );
};

type ExpertVariant = "realtime" | "history";

interface ExpertChipProps {
  expert: { name: string; weight: number; topMove: Move | null; probability: number };
  variant: ExpertVariant;
}

const ExpertChip: React.FC<ExpertChipProps> = ({ expert, variant }) => {
  const moveLabel = expert.topMove ? (
    <MoveLabel
      move={expert.topMove}
      iconSize={16}
      textClassName="text-xs font-semibold text-slate-700"
      className="gap-1"
    />
  ) : (
    <span className="text-slate-400">No move yet</span>
  );
  const label = variant === "realtime" ? "Realtime" : "Previous";
  const chipClass = variant === "realtime" ? "app-accent-soft" : "bg-slate-100 text-slate-700";
  const badgeClass =
    variant === "realtime"
      ? "app-accent-pill px-2 py-0.5 text-[10px]"
      : "bg-slate-200 text-slate-600 px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${chipClass}`}
      title={`${expert.name} suggests ${formatMove(expert.topMove)} at ${formatPercent(expert.probability, 0)}.`}
    >
      <span>{expert.name}:</span>
      <span className="inline-flex items-center gap-1">{moveLabel}</span>
      <span className="text-[11px] font-normal text-slate-600">{formatPercent(expert.probability, 0)}</span>
      <span className={`rounded-full font-semibold uppercase tracking-wide ${badgeClass}`}>
        {label}
      </span>
    </span>
  );
};

interface HistoryPeekProps {
  open: boolean;
  onToggle: () => void;
  favoriteMove: { move: Move; pct: number } | null;
  topTransition: { from: Move; to: Move; pct: number } | null;
  confidenceBand: { band: string; pct: number } | null;
  updatedAt: string | null;
  rounds: number;
}

const HistoryPeek: React.FC<HistoryPeekProps> = ({
  open,
  onToggle,
  favoriteMove,
  topTransition,
  confidenceBand,
  updatedAt,
  rounds,
}) => {
  const updatedLabel = formatRelativeTime(updatedAt);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left text-sm font-medium text-slate-700"
      >
        <span>History peek</span>
        <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
            <span>From older games</span>
            <span>
              {rounds ? `${rounds} round${rounds === 1 ? "" : "s"}` : "No saved rounds"}
            </span>
            {updatedLabel && <span>updated {updatedLabel}</span>}
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <HistoryStat
              label="Favorite move"
              value={favoriteMove ? renderMoveLabel(favoriteMove.move, { iconSize: 18 }) : "No history yet"}
              detail={favoriteMove ? formatPercent(favoriteMove.pct, 0) : undefined}
            />
            <HistoryStat
              label="Top transition"
              value={
                topTransition
                  ? (
                      <span className="inline-flex items-center gap-2">
                        {renderMoveLabel(topTransition.from, { iconSize: 16 })}
                        <span className="text-slate-400">→</span>
                        {renderMoveLabel(topTransition.to, { iconSize: 16 })}
                      </span>
                    )
                  : "No transition yet"
              }
              detail={topTransition ? formatPercent(topTransition.pct, 0) : undefined}
            />
            <HistoryStat
              label="Avg. confidence this round"
              value={confidenceBand ? formatConfidenceBucket(confidenceBand.band) : "No band yet"}
              detail={confidenceBand ? formatPercent(confidenceBand.pct, 0) : undefined}
            />
          </dl>
        </div>
      )}
    </div>
  );
};

const HistoryStat: React.FC<{ label: string; value: React.ReactNode; detail?: React.ReactNode }> = ({ label, value, detail }) => (
  <div className="rounded-lg border border-slate-200/70 bg-slate-50/70 px-3 py-2">
    <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 flex flex-wrap items-center gap-1 text-sm font-medium text-slate-800">
      <span className="inline-flex items-center gap-1 whitespace-nowrap">{value}</span>
      {detail ? <span className="text-xs font-normal text-slate-500">{detail}</span> : null}
    </dd>
  </div>
);

function formatConfidenceBucket(bucket: string): string {
  switch (bucket) {
    case "low":
      return "Low confidence";
    case "medium":
      return "Medium confidence";
    case "high":
      return "High confidence";
    case "unknown":
      return "Mixed confidence";
    default:
      return bucket.charAt(0).toUpperCase() + bucket.slice(1);
  }
}

const InsightPanel: React.FC<InsightPanelProps> = ({ snapshot, liveRounds, historicalRounds, titleRef, onClose }) => {
  const [simplifiedMode, setSimplifiedMode] = useState(true);
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [historyPeekOpen, setHistoryPeekOpen] = useState(false);

  const timelineRounds = useMemo(() => sortRoundsChronologically(liveRounds), [liveRounds]);
  const historyOnlyRounds = useMemo(() => {
    if (!historicalRounds.length) return [] as RoundLog[];
    const liveIds = new Set(liveRounds.map(round => round.id));
    return historicalRounds.filter(round => !liveIds.has(round.id));
  }, [historicalRounds, liveRounds]);

  const historyFavoriteMove = useMemo(() => {
    if (!historyOnlyRounds.length) return null;
    const counts: Record<Move, number> = { rock: 0, paper: 0, scissors: 0 };
    historyOnlyRounds.forEach(round => {
      counts[round.player] = (counts[round.player] ?? 0) + 1;
    });
    const total = historyOnlyRounds.length;
    const move = MOVES.reduce((best, candidate) => (counts[candidate] > counts[best] ? candidate : best), MOVES[0]);
    return { move, pct: total ? counts[move] / total : 0 };
  }, [historyOnlyRounds]);

  const historyTopTransition = useMemo(() => {
    if (historyOnlyRounds.length < 2) return null;
    const sorted = sortRoundsChronologically(historyOnlyRounds);
    const counts = new Map<string, { from: Move; to: Move; count: number }>();
    for (let index = 1; index < sorted.length; index++) {
      const prev = sorted[index - 1];
      const current = sorted[index];
      if (!prev || !current) continue;
      const key = `${prev.player}->${current.player}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { from: prev.player, to: current.player, count: 1 });
      }
    }
    let best: { from: Move; to: Move; count: number } | null = null;
    for (const value of counts.values()) {
      if (!best || value.count > best.count) {
        best = value;
      }
    }
    if (!best) return null;
    const totalTransitions = Math.max(1, sorted.length - 1);
    const bestTransition = best;
    return {
      from: bestTransition.from,
      to: bestTransition.to,
      count: bestTransition.count,
      pct: bestTransition.count / totalTransitions,
    };
  }, [historyOnlyRounds]);

  const historyConfidenceBand = useMemo(() => {
    if (!historyOnlyRounds.length) return null;
    const bandCounts = new Map<string, number>();
    historyOnlyRounds.forEach(round => {
      const key = round.confidenceBucket ?? "unknown";
      bandCounts.set(key, (bandCounts.get(key) ?? 0) + 1);
    });
    let best: { band: string; count: number } | null = null;
    for (const [band, count] of bandCounts.entries()) {
      if (!best || count > best.count) {
        best = { band, count };
      }
    }
    if (!best) return null;
    const bestBand = best;
    return { band: bestBand.band, pct: bestBand.count / historyOnlyRounds.length };
  }, [historyOnlyRounds]);

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
    const filtered = entries.filter(entry => entry.maxProb >= HIGH_CONFIDENCE_THRESHOLD);
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
  }, [derived]);

  const averageBrier = useMemo(() => average(derived.brierValues), [derived.brierValues]);
  const averageSharpness = useMemo(() => average(derived.sharpnessValues), [derived.sharpnessValues]);
  const averageSurprise = useMemo(() => average(derived.surpriseValues.map(item => item.value)), [derived.surpriseValues]);
  const topSurprises = useMemo(() => {
    return [...derived.surpriseValues]
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
  }, [derived.surpriseValues]);

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

  const decileRows = derived.bins.map((bin, index) => {
    const avgConfidence = bin.total ? bin.avgConfidence : null;
    const accuracy = bin.total ? bin.accuracy : null;
    const difference = avgConfidence != null && accuracy != null ? accuracy - avgConfidence : null;
    const gap = difference != null ? Math.abs(difference) : null;
    return {
      label: `${index * 10}–${index === 9 ? 100 : (index + 1) * 10}%`,
      avgConfidence,
      accuracy,
      rounds: bin.total,
      difference,
      gap,
    };
  });

  const formatGapDifference = (value: number | null): string => {
    if (value == null || Number.isNaN(value)) return "—";
    const pct = (value * 100).toFixed(0);
    const sign = value > 0 ? "+" : "";
    return `${sign}${pct}%`;
  };

  const getGapBarColor = (value: number | null): string => {
    if (value == null || Number.isNaN(value)) return "bg-slate-300";
    const magnitude = Math.abs(value);
    if (magnitude < 0.05) return "bg-emerald-500";
    if (magnitude < 0.15) return "bg-amber-500";
    return "bg-rose-500";
  };

  const recentBrier = derived.brierValues.slice(-MAX_ENTRIES_FOR_TIMELINES);
  const recentVolatility = derived.maxProbSeries.slice(-MAX_ENTRIES_FOR_TIMELINES);
  const recentSurprise = derived.surpriseValues.slice(-MAX_ENTRIES_FOR_TIMELINES).map(item => item.value);

  const realtimeWeight = clampProbability(snapshot?.realtimeWeight ?? 0);
  const historyWeight = clampProbability(snapshot?.historyWeight ?? 0);
  const totalBlendWeight = realtimeWeight + historyWeight;
  const realtimeShare = totalBlendWeight > 0 ? realtimeWeight / totalBlendWeight : 0;
  const historyShare = totalBlendWeight > 0 ? historyWeight / totalBlendWeight : 0;
  const isLowConfidence = snapshot?.confidence != null && snapshot.confidence < 0.4;
  const topPanelReason = snapshot?.reason ?? "Not enough rounds yet—play a few more.";
  const nextMovePlanLabel = simplifiedMode ? "My next move plan was" : "Next move plan";

  const rightPanelAnalyticsSection = (
    <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-800">Right panel analytics</h3>
            <InfoChip description="Confidence, policy, and blend at a glance." />
          </div>
          <p className="text-sm text-slate-600">
            {simplifiedMode
              ? "Here’s how sure the AI feels about the next round and which strategy it leans on."
              : "Live view of the AI’s confidence, heuristic safety net, and realtime-versus-history blend."}
          </p>
          <div className="grid gap-1 text-xs text-slate-600">
            <div>
              <span className="font-semibold text-slate-700">Confidence:</span> How sure the AI is (0–100%).
            </div>
            <div>
              <span className="font-semibold text-slate-700">Heuristic policy:</span> Simple rules the AI uses before it learns you.
            </div>
            <div>
              <span className="font-semibold text-slate-700">Blend:</span> Mix between rules and learned behavior.
            </div>
          </div>
          <p className="text-xs text-slate-500">{topPanelReason}</p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-3 text-sm text-slate-600">
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-right shadow-inner">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Confidence</span>
              {isLowConfidence && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700"
                  title="Predictions are closer to guessing."
                >
                  Low confidence
                </span>
              )}
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{formatPercent(snapshot?.confidence ?? null, 0)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-right shadow-inner">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Heuristic policy</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {snapshot ? (snapshot.policy === "mixer" ? "Learning blend" : "Rules first") : "—"}
            </div>
            <div className="text-[11px] text-slate-500">
              {snapshot
                ? snapshot.policy === "mixer"
                  ? "Mixing learned play with heuristics."
                  : "Relying on starter rules until it learns more."
                : "Will show once rounds are played."}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-right shadow-inner">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Blend</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {formatPercent(realtimeShare, 0)} realtime / {formatPercent(historyShare, 0)} history
            </div>
          </div>
          {snapshot?.conflict &&
            snapshot.conflict.realtime &&
            snapshot.conflict.history &&
            snapshot.conflict.realtime !== snapshot.conflict.history && (
              <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                <span>Pattern shift</span>
                <span>
                  {formatMove(snapshot.conflict.realtime)} ≠ {formatMove(snapshot.conflict.history)}
                </span>
              </div>
            )}
        </div>
      </div>
    </section>
  );

  const blendAndPlanSection = (
    <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
      <BlendMeter snapshot={snapshot} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{nextMovePlanLabel}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {formatMove(snapshot?.predictedMove ?? null)}
            </div>
            <p className="text-xs text-slate-500">
              AI counters with {formatMove(snapshot?.counterMove ?? null)}.
            </p>
          </div>
          <SessionTimeline rounds={timelineRounds} />
        </div>
        <PredictionSources snapshot={snapshot} realtimeRounds={timelineRounds.length} />
      </div>
      {!simplifiedMode && (
        <>
          <SignalsDrawer
            snapshot={snapshot}
            open={signalsOpen}
            onToggle={() => setSignalsOpen(prev => !prev)}
          />
          <HistoryPeek
            open={historyPeekOpen}
            onToggle={() => setHistoryPeekOpen(prev => !prev)}
            favoriteMove={historyFavoriteMove}
            topTransition={historyTopTransition}
            confidenceBand={historyConfidenceBand}
            updatedAt={snapshot?.historyUpdatedAt ?? null}
            rounds={snapshot?.historyRounds ?? historyOnlyRounds.length}
          />
        </>
      )}
    </section>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="relative flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 pr-20 sm:pr-24">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2
              ref={titleRef}
              tabIndex={-1}
              className="text-lg font-semibold text-slate-900 focus:outline-none"
            >
              Live AI insight panel
            </h2>
            <InfoChip description="Quick view of the AI’s confidence and blend." />
          </div>
          <p className="text-xs text-slate-500">
            {simplifiedMode
              ? "Plain-language analytics on how the AI is feeling right now."
              : "Detailed telemetry for power users watching the AI adapt."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-3 text-sm text-slate-600">
            <span className="font-semibold text-slate-700">Simplified mode</span>
            <button
              type="button"
              onClick={() => setSimplifiedMode(prev => !prev)}
              className={`relative flex h-6 w-11 items-center rounded-full transition ${
                simplifiedMode ? "bg-sky-600" : "bg-slate-300"
              }`}
              aria-pressed={simplifiedMode}
              aria-label="Toggle simplified analytics mode"
            >
              <span
                className={`h-5 w-5 transform rounded-full bg-white shadow transition ${
                  simplifiedMode ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </label>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-4 inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
        >
          <span>Close</span>
          <span aria-hidden>×</span>
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-8 pt-4">
        <div className="space-y-6">
          {simplifiedMode ? (
            <>
              {blendAndPlanSection}
              {rightPanelAnalyticsSection}
            </>
          ) : (
            <>
              {rightPanelAnalyticsSection}
              {blendAndPlanSection}

          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Confidence checks</h3>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-slate-800">Calibration (Are our confidences honest?)</div>
                      <InfoChip description="Checks if confidence matches actual accuracy." />
                    </div>
                    <p className="text-xs text-slate-500">Perfect line = confidence equals accuracy.</p>
                    <p className="text-[11px] text-slate-500">ECE: Average gap between confidence and accuracy.</p>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">ECE</div>
                    <div className="text-lg font-semibold text-slate-900">{formatNumber(derived.ece, 3)}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {reliabilityPoints.length ? (
                    <>
                      <div className="rounded-lg insight-chart-surface p-3">
                        <svg
                          className="h-36 w-full"
                          role="img"
                          aria-label="Reliability diagram"
                          viewBox="0 0 220 140"
                          preserveAspectRatio="none"
                        >
                          <rect x={0} y={0} width={220} height={140} fill="none" stroke="transparent" />
                          <line
                            x1={0}
                            y1={140}
                            x2={220}
                            y2={0}
                            stroke="var(--app-accent-soft)"
                            strokeWidth={1.5}
                          />
                          <polyline
                            fill="none"
                            stroke="var(--app-accent-strong)"
                            strokeWidth={2.5}
                            strokeLinejoin="round"
                            points={reliabilityPoints
                              .map(point => {
                                const x = point.x * 220;
                                const y = 140 - point.y * 140;
                                return `${x.toFixed(2)},${y.toFixed(2)}`;
                              })
                              .join(" ")}
                          />
                        </svg>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        <div className="flex items-center gap-3">
                          <LegendSwatch color="var(--app-accent-soft)" label="Perfect line" />
                          <LegendSwatch color="var(--app-accent-strong)" label="Confidence vs accuracy" />
                        </div>
                        <span>Deciles show average confidence buckets.</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">We need more rounds to plot this metric.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-slate-800">Brier (multi-class)</div>
                      <InfoChip description="Smaller is better; measures overall probabilistic error." />
                    </div>
                    <p className="text-xs text-slate-500">Smaller is better; measures overall probabilistic error.</p>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Brier</div>
                    <div className="text-lg font-semibold text-slate-900">{formatNumber(averageBrier, 3)}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {recentBrier.length ? (
                    <div className="rounded-lg insight-chart-surface p-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Recent rounds</div>
                      {renderSparkline(recentBrier, 220, 60, "mt-2")}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">We need more rounds to plot this metric.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-slate-800">Sharpness</div>
                      <InfoChip description="How peaked the AI’s probabilities are." />
                    </div>
                    <p className="text-xs text-slate-500">Higher sharpness means the AI leans harder on one move.</p>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sharpness</div>
                    <div className="text-lg font-semibold text-slate-900">{formatPercent(averageSharpness, 0)}</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <div
                    className="relative h-20 w-20 rounded-full"
                    style={{
                      background: `conic-gradient(var(--app-accent-strong) ${Math.max(0, (averageSharpness ?? 0) * 100)}%, var(--app-accent-soft) ${
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
                    Sharpness ignores correctness—only how concentrated the probabilities are.
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-slate-800">High-confidence coverage</div>
                      <InfoChip description="Shows how often confident predictions appear and how they perform." />
                    </div>
                    <p className="text-xs text-slate-500">High confidence = ≥ {formatPercent(HIGH_CONFIDENCE_THRESHOLD, 0)}</p>
                    <p className="text-[11px] text-slate-500">Coverage, Accuracy, and Mistake Rate stay centered for easy scanning.</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
                      HC
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{formatPercent(HIGH_CONFIDENCE_THRESHOLD, 0)}</span>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
                    <div className="flex flex-col items-center rounded-lg bg-sky-50 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Coverage</div>
                      <div className="mt-1 text-lg font-semibold text-slate-800">{formatPercent(coverage.coverageRate, 0)}</div>
                    </div>
                    <div className="flex flex-col items-center rounded-lg bg-emerald-50 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Accuracy</div>
                      <div className="mt-1 text-lg font-semibold text-emerald-700">{formatPercent(coverage.accuracy, 0)}</div>
                    </div>
                    <div className="flex flex-col items-center rounded-lg bg-rose-50 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mistake Rate</div>
                      <div className="mt-1 text-lg font-semibold text-rose-600">{formatPercent(coverage.mistakeRate, 0)}</div>
                    </div>
                  </div>
                  <p className="mt-2 text-center text-[11px] text-slate-500">
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
                      <div key={`${window.start}-${idx}`} className="rounded-lg insight-chart-surface px-3 py-2 text-xs text-slate-600">
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

          <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Confidence-stratified confusion</h3>
                <InfoChip description="How predictions did at different confidence levels." />
              </div>
              <div className="text-[11px] text-slate-500">Rows = What you played · Columns = What AI predicted</div>
            </div>
            <div className="text-xs text-slate-500">How predictions did at different confidence levels.</div>
            <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">Legend:</span>
              <span>Cell number = count of rounds</span>
              <span>Color intensity = more rounds</span>
              <span>Bands: 0–40%, 40–70%, 70–100% confidence</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {derived.bands.map(band => {
                const totalRounds = MOVES.reduce(
                  (total, predicted) =>
                    total + MOVES.reduce((sum, actual) => sum + band.matrix[predicted][actual], 0),
                  0,
                );
                const correctRounds = MOVES.reduce((sum, move) => sum + band.matrix[move][move], 0);
                const accuracy = totalRounds ? correctRounds / totalRounds : null;
                const mistakeRate = accuracy == null ? null : 1 - accuracy;
                return (
                  <div key={band.label} className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                      <span>{band.label}</span>
                      <span>{totalRounds} rounds</span>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[11px] text-slate-600">
                      <div className="flex items-center justify-center rounded bg-slate-100 px-1 py-0.5">You ↓</div>
                      {MOVES.map(move => (
                        <div key={move} className="rounded bg-slate-100 px-1 py-0.5 font-semibold text-slate-700">
                          {formatMove(move)}
                        </div>
                      ))}
                      {MOVES.map(actual => (
                        <React.Fragment key={actual}>
                          <div className="flex items-center justify-center rounded bg-slate-100 px-1 py-0.5 font-semibold text-slate-700">
                            {formatMove(actual)}
                          </div>
                          {MOVES.map(predicted => {
                            const count = band.matrix[predicted][actual];
                            const intensity = maxBandCount ? count / maxBandCount : 0;
                            return (
                              <div
                                key={`${band.label}-${actual}-${predicted}`}
                                className="rounded px-1 py-2 text-xs font-semibold text-slate-700"
                                style={{
                                  backgroundColor: `rgba(2, 132, 199, ${Math.min(0.65, intensity * 0.6)})`,
                                }}
                              >
                                {count}
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg insight-chart-surface px-3 py-2 text-[11px] text-slate-600">
                      <span>Rounds: {totalRounds}</span>
                      <span>Accuracy: {formatPercent(accuracy, 0)}</span>
                      <span>Mistake Rate: {formatPercent(mistakeRate, 0)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Decile accuracy table</h3>
              <InfoChip description="Bar shows the size of the gap; right = over-confident, left = under-confident." />
            </div>
            <div className="text-xs text-slate-500">Decile (conf.) | Avg Conf | Accuracy | Rounds | Gap (Acc − Conf)</div>
            <div className="text-[11px] text-slate-500">Bar shows the size of the gap; right = over-confident, left = under-confident.</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Decile (conf.)</th>
                    <th className="py-2 pr-3">Avg Conf</th>
                    <th className="py-2 pr-3">Accuracy</th>
                    <th className="py-2 pr-3">Rounds</th>
                    <th className="py-2">Gap (Acc − Conf)</th>
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
                        <div className="flex flex-col gap-1">
                          <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
                            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/70" />
                            {row.difference != null && !Number.isNaN(row.difference) && (
                              <div
                                className={`absolute top-0 h-full ${getGapBarColor(row.difference)}`}
                                style={
                                  row.difference >= 0
                                    ? {
                                        right: "50%",
                                        width: `${Math.min(100, Math.abs(row.difference) * 100)}%`,
                                      }
                                    : {
                                        left: "50%",
                                        width: `${Math.min(100, Math.abs(row.difference) * 100)}%`,
                                      }
                                }
                              />
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500">{formatGapDifference(row.difference)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default InsightPanel;
