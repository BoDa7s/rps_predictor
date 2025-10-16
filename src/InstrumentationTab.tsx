import React, { useCallback, useEffect, useMemo, useState } from "react";

import type { DevInstrumentationSnapshot, InstrumentationScope } from "./devInstrumentation";
import { devInstrumentation } from "./devInstrumentation";
import type { AIMode, Mode } from "./gameTypes";
import {
  InstrumentationSnapshotRecord,
  SnapshotTrigger,
  downloadSnapshot,
  instrumentationSnapshots,
  useInstrumentationSnapshots,
} from "./instrumentationSnapshots";

const PAGE_SIZE = 8;

interface InstrumentationTabProps {
  snapshot: DevInstrumentationSnapshot | null;
  scope: InstrumentationScope | null;
  modeFilter: Mode | "";
  difficultyFilter: AIMode | "";
  dateRange: { start: string | null; end: string | null };
  playerName: string | null;
  profileName: string | null;
  selectedPlayerId: string | null;
  selectedProfileId: string | null;
  playerOptions: Array<{ value: string; label: string }>;
  profileOptions: Array<{ value: string; label: string }>;
  onPlayerChange: (playerId: string | null) => void;
  onProfileChange: (profileId: string | null) => void;
  onModeChange: (mode: Mode | "") => void;
  onDifficultyChange: (difficulty: AIMode | "") => void;
  onDateRangeChange: (field: "start" | "end", value: string) => void;
  onClearDateRange: () => void;
  source: "selected" | "active";
  onSourceChange: (source: "selected" | "active") => void;
  autoCaptureEnabled: boolean;
  onToggleAutoCapture: (next: boolean) => void;
  activeView: "live" | "history";
  onViewChange: (view: "live" | "history") => void;
  onLiveStatusChange?: (status: { running: boolean; label: string | null }) => void;
}

type RangedRound = DevInstrumentationSnapshot["recentRounds"][number];
type ClickEntry = DevInstrumentationSnapshot["clickHistory"][number];
type CurrentMatchSnapshot = NonNullable<DevInstrumentationSnapshot["currentMatch"]>;

type DerivedMetrics = {
  hasSnapshot: boolean;
  filteredRounds: RangedRound[];
  tableRounds: RangedRound[];
  response: {
    count: number;
    median: number | null;
    p90: number | null;
    latest: number | null;
    average: number | null;
    rollingValues: number[];
    rollingAverage: number | null;
  };
  engagement: {
    sessionAgeMs: number;
    activeMs: number;
    idleCount: number;
    idleDurationMs: number;
    focusEvents: number;
    currentView: string;
    match?: {
      mode: Mode;
      difficulty: AIMode;
      bestOf: number;
      roundsPlayed: number;
      activeMs: number;
      durationMs: number | null;
      idleCount: number;
      idleDurationMs: number;
      clickCount: number;
      interactions: number;
      streaks: CurrentMatchSnapshot["streaks"];
    };
  };
  click: {
    sessionTotalClicks: number;
    sessionTotalInteractions: number;
    filteredClicks: ClickEntry[];
    topViews: Array<{ key: string; count: number }>;
    topElements: Array<{ key: string; count: number }>;
  };
  clickSpeed: {
    average: number | null;
    median: number | null;
    last: number | null;
    peak10s: number;
    latest10s: number;
  };
};

function formatMs(value: number | null, options: { decimals?: number } = {}): string {
  if (value == null || Number.isNaN(value)) return "–";
  const decimals = options.decimals ?? (value < 10 ? 2 : value < 100 ? 1 : 0);
  return `${value.toFixed(decimals)} ms`;
}

function formatDuration(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "–";
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes || hours) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function formatCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "–";
  return value.toLocaleString();
}

function formatDateTime(value: string | number): string {
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

function computeStats(values: number[]): { count: number; median: number | null; p90: number | null; latest: number | null; average: number | null } {
  if (!values.length) {
    return { count: 0, median: null, p90: null, latest: null, average: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const latest = values[values.length - 1] ?? null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    count: values.length,
    median: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    latest,
    average: sum / values.length,
  };
}

function toEpoch(snapshot: DevInstrumentationSnapshot, relative: number | undefined | null): number | null {
  if (relative == null) return null;
  return snapshot.timeOrigin + relative;
}

function filterRounds(
  snapshot: DevInstrumentationSnapshot,
  scope: InstrumentationScope | null,
  modeFilter: Mode | "",
  difficultyFilter: AIMode | "",
  dateRange: { start: string | null; end: string | null },
): RangedRound[] {
  const startMs = dateRange.start ? Date.parse(dateRange.start) : null;
  const endMs = dateRange.end ? Date.parse(dateRange.end) : null;
  return (snapshot.recentRounds ?? []).filter(round => {
    if (scope?.playerId && round.playerId && round.playerId !== scope.playerId) return false;
    if (scope?.profileId && round.profileId && round.profileId !== scope.profileId) return false;
    if (modeFilter && round.mode !== modeFilter) return false;
    if (difficultyFilter && round.difficulty !== difficultyFilter) return false;
    if (startMs != null || endMs != null) {
      const relative = round.completedAt ?? round.moveSelectedAt ?? round.readyAt ?? null;
      if (relative != null) {
        const epoch = snapshot.timeOrigin + relative;
        if (startMs != null && epoch < startMs) return false;
        if (endMs != null && epoch > endMs) return false;
      }
    }
    return true;
  });
}

function filterClicks(
  snapshot: DevInstrumentationSnapshot,
  scope: InstrumentationScope | null,
  modeFilter: Mode | "",
  difficultyFilter: AIMode | "",
  dateRange: { start: string | null; end: string | null },
): ClickEntry[] {
  const startMs = dateRange.start ? Date.parse(dateRange.start) : null;
  const endMs = dateRange.end ? Date.parse(dateRange.end) : null;
  return (snapshot.clickHistory ?? []).filter(entry => {
    if (scope?.playerId && entry.playerId && entry.playerId !== scope.playerId) return false;
    if (scope?.profileId && entry.profileId && entry.profileId !== scope.profileId) return false;
    if (modeFilter && entry.mode && entry.mode !== modeFilter) return false;
    if (difficultyFilter && entry.difficulty && entry.difficulty !== difficultyFilter) return false;
    if (startMs != null || endMs != null) {
      const epoch = snapshot.timeOrigin + entry.timestamp;
      if (startMs != null && epoch < startMs) return false;
      if (endMs != null && epoch > endMs) return false;
    }
    return true;
  });
}

function computeHeatmap(records: ClickEntry[], resolution: "3x3" | "6x4") {
  const cols = resolution === "3x3" ? 3 : 6;
  const rows = resolution === "3x3" ? 3 : 4;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  let max = 0;
  records.forEach(record => {
    const width = record.viewportWidth && record.viewportWidth > 0 ? record.viewportWidth : typeof window !== "undefined" ? window.innerWidth : 1;
    const height = record.viewportHeight && record.viewportHeight > 0 ? record.viewportHeight : typeof window !== "undefined" ? window.innerHeight : 1;
    const xRatio = width > 0 ? Math.min(Math.max(record.x / width, 0), 1) : 0;
    const yRatio = height > 0 ? Math.min(Math.max(record.y / height, 0), 1) : 0;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(xRatio * cols)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(yRatio * rows)));
    matrix[row][col] += 1;
    if (matrix[row][col] > max) max = matrix[row][col];
  });
  return { rows, cols, matrix, max };
}

function computeBurst(records: ClickEntry[], windowMs: number): { peak: number; latest: number } {
  if (!records.length) return { peak: 0, latest: 0 };
  const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
  let peak = 0;
  let latest = 0;
  let startIndex = 0;
  sorted.forEach((entry, index) => {
    const windowStart = entry.timestamp - windowMs;
    while (sorted[startIndex]?.timestamp < windowStart) {
      startIndex += 1;
    }
    const windowCount = index - startIndex + 1;
    if (windowCount > peak) peak = windowCount;
  });
  const lastTimestamp = sorted[sorted.length - 1]?.timestamp ?? 0;
  const cutoff = lastTimestamp - windowMs;
  latest = sorted.filter(entry => entry.timestamp >= cutoff).length;
  return { peak, latest };
}

function computeClickSpeed(records: ClickEntry[]): { average: number | null; median: number | null; last: number | null; peak10s: number; latest10s: number } {
  if (records.length < 2) {
    const bursts = computeBurst(records, 10_000);
    return { average: null, median: null, last: null, peak10s: bursts.peak, latest10s: bursts.latest };
  }
  const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    intervals.push(sorted[i].timestamp - sorted[i - 1].timestamp);
  }
  const sum = intervals.reduce((acc, value) => acc + value, 0);
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const bursts = computeBurst(records, 10_000);
  return {
    average: intervals.length ? sum / intervals.length : null,
    median: percentile(sortedIntervals, 50),
    last: intervals[intervals.length - 1] ?? null,
    peak10s: bursts.peak,
    latest10s: bursts.latest,
  };
}

function buildTopList(records: ClickEntry[], keySelector: (entry: ClickEntry) => string): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  records.forEach(entry => {
    const key = keySelector(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => ({ key, count }));
}

function deriveMetrics(
  snapshot: DevInstrumentationSnapshot | null,
  scope: InstrumentationScope | null,
  modeFilter: Mode | "",
  difficultyFilter: AIMode | "",
  dateRange: { start: string | null; end: string | null },
): DerivedMetrics {
  if (!snapshot || !scope) {
    return {
      hasSnapshot: Boolean(snapshot),
      filteredRounds: [],
      tableRounds: [],
      response: { count: 0, median: null, p90: null, latest: null, average: null, rollingValues: [], rollingAverage: null },
      engagement: {
        sessionAgeMs: 0,
        activeMs: 0,
        idleCount: 0,
        idleDurationMs: 0,
        focusEvents: 0,
        currentView: "–",
      },
      click: {
        sessionTotalClicks: snapshot?.session.totalClicks ?? 0,
        sessionTotalInteractions: snapshot?.session.totalInteractions ?? 0,
        filteredClicks: [],
        topViews: [],
        topElements: [],
      },
      clickSpeed: { average: null, median: null, last: null, peak10s: 0, latest10s: 0 },
    };
  }

  const filteredRounds = filterRounds(snapshot, scope, modeFilter, difficultyFilter, dateRange);
  const roundsAsc = [...filteredRounds].sort((a, b) => (a.readyAt ?? a.completedAt ?? 0) - (b.readyAt ?? b.completedAt ?? 0));
  const roundsDesc = [...filteredRounds].sort((a, b) => (b.completedAt ?? b.readyAt ?? 0) - (a.completedAt ?? a.readyAt ?? 0));
  const responseValues = roundsAsc.map(round => round.responseTimeMs).filter((value): value is number => value != null);
  const responseStats = computeStats(responseValues);
  const rollingValues = responseValues.slice(-20);
  const rollingAverage = rollingValues.length
    ? rollingValues.reduce((acc, value) => acc + value, 0) / rollingValues.length
    : null;
  const relativeNow = snapshot.capturedAt - snapshot.timeOrigin;
  const idleDuration = snapshot.session.idleGaps.reduce((total, gap) => {
    const end = gap.end ?? relativeNow;
    return total + Math.max(0, end - gap.start);
  }, 0);

  const match = snapshot.currentMatch;
  let matchSummary: DerivedMetrics["engagement"]["match"] | undefined;
  if (
    match &&
    (!scope.playerId || match.playerId === scope.playerId) &&
    (!scope.profileId || match.profileId === scope.profileId) &&
    (!modeFilter || match.mode === modeFilter) &&
    (!difficultyFilter || match.difficulty === difficultyFilter)
  ) {
    const matchDuration = (match.endedAt ?? relativeNow) - match.startedAt;
    const matchIdleDuration = match.idleGaps.reduce((total, gap) => {
      const end = gap.end ?? relativeNow;
      return total + Math.max(0, end - gap.start);
    }, 0);
    matchSummary = {
      mode: match.mode,
      difficulty: match.difficulty,
      bestOf: match.bestOf,
      roundsPlayed: match.roundsPlayed,
      activeMs: match.activeMs,
      durationMs: matchDuration > 0 ? matchDuration : null,
      idleCount: match.idleGaps.length,
      idleDurationMs: matchIdleDuration,
      clickCount: match.clickCount,
      interactions: match.interactions,
      streaks: match.streaks,
    };
  }

  const filteredClicks = filterClicks(snapshot, scope, modeFilter, difficultyFilter, dateRange);
  const topViews = buildTopList(filteredClicks, entry => entry.view || "unknown");
  const topElements = buildTopList(filteredClicks, entry => (entry.elementId ? `${entry.target}#${entry.elementId}` : entry.target));
  const clickSpeed = computeClickSpeed(filteredClicks);

  return {
    hasSnapshot: true,
    filteredRounds,
    tableRounds: roundsDesc,
    response: {
      count: responseStats.count,
      median: responseStats.median,
      p90: responseStats.p90,
      latest: responseStats.latest,
      average: responseStats.average,
      rollingValues,
      rollingAverage,
    },
    engagement: {
      sessionAgeMs: Math.max(0, relativeNow - snapshot.session.startedAt),
      activeMs: snapshot.session.activeMs,
      idleCount: snapshot.session.idleGaps.length,
      idleDurationMs: idleDuration,
      focusEvents: snapshot.session.focusEvents.length,
      currentView: snapshot.session.currentView,
      match: matchSummary,
    },
    click: {
      sessionTotalClicks: snapshot.session.totalClicks,
      sessionTotalInteractions: snapshot.session.totalInteractions,
      filteredClicks,
      topViews,
      topElements,
    },
    clickSpeed,
  };
}

function Heatmap({ records, resolution }: { records: ClickEntry[]; resolution: "3x3" | "6x4" }) {
  const { matrix, max, rows, cols } = useMemo(() => computeHeatmap(records, resolution), [records, resolution]);
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "4px" }}>
        {matrix.map((row, rowIndex) =>
          row.map((value, colIndex) => {
            const intensity = max ? value / max : 0;
            const background = `rgba(59,130,246,${0.1 + intensity * 0.7})`;
            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                title={`Row ${rowIndex + 1}, Column ${colIndex + 1}: ${value} clicks`}
                style={{
                  background,
                  borderRadius: "6px",
                  minHeight: "38px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  color: "rgba(15,23,42,0.8)",
                  fontWeight: 600,
                }}
              >
                {value}
              </div>
            );
          }),
        )}
      </div>
      {!records.length && <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.7 }}>No click data for this scope yet.</p>}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) {
    return <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.7 }}>No recent rounds.</p>;
  }
  const width = 160;
  const height = 42;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });
  const areaPoints = [`0,${height}`, ...points, `${width},${height}`].join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label="Rolling response time trend">
      <polyline points={points.join(" ")} fill="none" stroke="#60a5fa" strokeWidth={2} strokeLinecap="round" />
      <polyline points={areaPoints} fill="rgba(96,165,250,0.2)" stroke="none" />
    </svg>
  );
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value == null || Number.isNaN(value)) {
    return <span style={{ color: "rgba(226,232,240,0.7)" }}>–</span>;
  }
  const sign = value === 0 ? "" : value > 0 ? "+" : "";
  const color = value === 0 ? "rgba(226,232,240,0.9)" : value > 0 ? "#f87171" : "#34d399";
  return <span style={{ color, fontWeight: 600 }}>{`${sign}${value.toFixed(0)}`}</span>;
}

const MODE_CHOICES: Mode[] = ["practice", "challenge"];
const DIFFICULTY_CHOICES: AIMode[] = ["fair", "normal", "ruthless"];

function titleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRelativeTime(ms: number | null): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1_000) return "just now";
  const seconds = Math.floor(ms / 1_000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainder = seconds % 60;
    return `${minutes}m${remainder ? ` ${remainder}s` : ""} ago`;
  }
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return `${hours}h${remainderMinutes ? ` ${remainderMinutes}m` : ""} ago`;
}

function formatTriggerLabel(trigger: SnapshotTrigger): string {
  switch (trigger) {
    case "manual":
      return "Manual";
    case "match-ended":
      return "Match end";
    case "round-interval":
      return "10 rounds";
    case "time-interval":
      return "2 minutes";
    default:
      return trigger;
  }
}

function resolveScopeLabels(
  scope: InstrumentationScope | null,
  fallbackPlayer: string | null,
  fallbackProfile: string | null,
): { player: string; profile: string } {
  let player = scope?.playerName ?? fallbackPlayer ?? "";
  if (!player) {
    player = scope?.playerId ? "Player" : "All players";
  }
  let profile = scope?.profileName ?? fallbackProfile ?? "";
  if (!profile) {
    if (scope?.profileId) {
      profile = "Profile";
    } else if (scope?.playerId) {
      profile = "Default profile";
    } else {
      profile = "All profiles";
    }
  }
  return { player, profile };
}

function MetricCards({ metrics, showTrend = false }: { metrics: DerivedMetrics; showTrend?: boolean }) {
  return (
    <div style={metricsGridStyle}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4 style={cardTitleStyle}>Response time</h4>
          <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
            {metrics.response.count ? `${metrics.response.count} rounds` : "No rounds"}
          </span>
        </div>
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={statRowStyle}>
            <span>Median</span>
            <strong>{formatMs(metrics.response.median)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>P90</span>
            <strong>{formatMs(metrics.response.p90)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>Latest</span>
            <strong>{formatMs(metrics.response.latest)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>Average</span>
            <strong>{formatMs(metrics.response.average)}</strong>
          </div>
        </div>
        {showTrend && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Recent trend</span>
            <Sparkline values={metrics.response.rollingValues} />
            <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
              Rolling average: {formatMs(metrics.response.rollingAverage)}
            </span>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h4 style={cardTitleStyle}>Engagement</h4>
        <div style={{ display: "grid", gap: "6px", fontSize: "0.9rem" }}>
          <div style={statRowStyle}>
            <span>Session active</span>
            <strong>{formatDuration(metrics.engagement.activeMs)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>Idle gaps</span>
            <strong>{formatCount(metrics.engagement.idleCount)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>Idle duration</span>
            <strong>{formatDuration(metrics.engagement.idleDurationMs)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>Focus events</span>
            <strong>{formatCount(metrics.engagement.focusEvents)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>Current view</span>
            <strong>{metrics.engagement.currentView || "–"}</strong>
          </div>
        </div>
        {metrics.engagement.match && (
          <div style={{ marginTop: "12px", padding: "12px", background: "rgba(30,41,59,0.55)", borderRadius: "10px" }}>
            <p style={{ margin: "0 0 4px", fontSize: "0.8rem", opacity: 0.7 }}>Current match</p>
            <p style={{ margin: "0 0 4px", fontSize: "0.85rem" }}>
              {titleCase(metrics.engagement.match.mode)} · {titleCase(metrics.engagement.match.difficulty)} · Best of {metrics.engagement.match.bestOf}
            </p>
            <p style={matchStatStyle}>
              Active {formatDuration(metrics.engagement.match.activeMs)} · Total {formatDuration(metrics.engagement.match.durationMs)}
            </p>
            <p style={matchStatStyle}>
              Rounds {formatCount(metrics.engagement.match.roundsPlayed)} · Clicks {formatCount(metrics.engagement.match.clickCount)}
            </p>
            <p style={matchStatStyle}>
              Idle {formatCount(metrics.engagement.match.idleCount)} · {formatDuration(metrics.engagement.match.idleDurationMs)}
            </p>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h4 style={cardTitleStyle}>Click activity</h4>
        <div style={{ display: "grid", gap: "6px", fontSize: "0.9rem" }}>
          <div style={statRowStyle}>
            <span>Scoped clicks</span>
            <strong>{formatCount(metrics.click.filteredClicks.length)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>Session clicks</span>
            <strong>{formatCount(metrics.click.sessionTotalClicks)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>Session interactions</span>
            <strong>{formatCount(metrics.click.sessionTotalInteractions)}</strong>
          </div>
        </div>
        <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: "0.8rem", opacity: 0.75 }}>Top views</p>
            {metrics.click.topViews.length ? (
              <ul style={listStyle}>
                {metrics.click.topViews.map(item => (
                  <li key={item.key}>
                    <strong>{item.key}</strong> · {formatCount(item.count)}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={emptyListStyle}>No view clicks yet.</p>
            )}
          </div>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: "0.8rem", opacity: 0.75 }}>Top elements</p>
            {metrics.click.topElements.length ? (
              <ul style={listStyle}>
                {metrics.click.topElements.map(item => (
                  <li key={item.key}>
                    <strong>{item.key}</strong> · {formatCount(item.count)}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={emptyListStyle}>No element interactions yet.</p>
            )}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h4 style={cardTitleStyle}>Click speed</h4>
        <div style={{ display: "grid", gap: "6px", fontSize: "0.9rem" }}>
          <div style={statRowStyle}>
            <span>Average interval</span>
            <strong>{formatMs(metrics.clickSpeed.average)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>Median interval</span>
            <strong>{formatMs(metrics.clickSpeed.median)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>Last interval</span>
            <strong>{formatMs(metrics.clickSpeed.last)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>Peak burst (10s)</span>
            <strong>{formatCount(metrics.clickSpeed.peak10s)}</strong>
          </div>
          <div style={statRowStyle}>
            <span>Latest burst</span>
            <strong>{formatCount(metrics.clickSpeed.latest10s)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

const InstrumentationTab: React.FC<InstrumentationTabProps> = ({
  snapshot,
  scope,
  modeFilter,
  difficultyFilter,
  dateRange,
  playerName,
  profileName,
  selectedPlayerId,
  selectedProfileId,
  playerOptions,
  profileOptions,
  onPlayerChange,
  onProfileChange,
  onModeChange,
  onDifficultyChange,
  onDateRangeChange,
  onClearDateRange,
  source,
  onSourceChange,
  autoCaptureEnabled,
  onToggleAutoCapture,
  activeView,
  onViewChange,
  onLiveStatusChange,
}) => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  const records = useInstrumentationSnapshots(scope);

  useEffect(() => {
    setPage(0);
    setCompareSelection([]);
    setSelectedSnapshotId(null);
  }, [scope?.playerId, scope?.profileId]);

  useEffect(() => {
    if (!records.length) {
      setSelectedSnapshotId(null);
      return;
    }
    if (!selectedSnapshotId || !records.some(record => record.id === selectedSnapshotId)) {
      setSelectedSnapshotId(records[0].id);
    }
  }, [records, selectedSnapshotId]);

  useEffect(() => {
    if (!statusMessage) return;
    const handle = window.setTimeout(() => setStatusMessage(null), 3200);
    return () => window.clearTimeout(handle);
  }, [statusMessage]);

  const filteredHistory = useMemo(() => {
    if (!search.trim()) return records;
    const keyword = search.trim().toLowerCase();
    return records.filter(record =>
      record.name.toLowerCase().includes(keyword) ||
      record.notes.toLowerCase().includes(keyword) ||
      record.trigger.toLowerCase().includes(keyword),
    );
  }, [records, search]);

  const pageCount = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const paginatedHistory = filteredHistory.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const selectedRecords = useMemo(
    () =>
      compareSelection
        .map(id => records.find(record => record.id === id))
        .filter((record): record is InstrumentationSnapshotRecord => Boolean(record)),
    [compareSelection, records],
  );

  const comparisonMetrics = useMemo(() => {
    if (selectedRecords.length !== 2) return null;
    return selectedRecords.map(record => {
      const targetScope = scope ?? record.scope ?? null;
      return {
        record,
        metrics: deriveMetrics(record.data, targetScope, modeFilter, difficultyFilter, dateRange),
      };
    });
  }, [selectedRecords, scope, modeFilter, difficultyFilter, dateRange]);

  const activeDetailRecord = useMemo(() => {
    if (!records.length) return null;
    if (selectedSnapshotId) {
      const match = records.find(record => record.id === selectedSnapshotId);
      if (match) return match;
    }
    return records[0];
  }, [records, selectedSnapshotId]);

  const detailMetrics = useMemo(() => {
    if (!activeDetailRecord) return null;
    const targetScope = scope ?? activeDetailRecord.scope ?? null;
    return deriveMetrics(activeDetailRecord.data, targetScope, modeFilter, difficultyFilter, dateRange);
  }, [activeDetailRecord, scope, modeFilter, difficultyFilter, dateRange]);

  const liveSnapshot = useMemo(() => {
    if (!snapshot) return null;
    if (source === "active") return snapshot;
    if (!scope) return null;
    const samePlayer = snapshot.scope.playerId === scope.playerId;
    const sameProfile = (snapshot.scope.profileId ?? null) === (scope.profileId ?? null);
    return samePlayer && sameProfile ? snapshot : null;
  }, [snapshot, scope, source]);

  const liveScope = useMemo(() => {
    if (source === "active") {
      return snapshot?.scope ?? null;
    }
    return scope;
  }, [scope, snapshot, source]);

  const liveMetrics = useMemo(
    () => deriveMetrics(liveSnapshot, liveScope, modeFilter, difficultyFilter, dateRange),
    [liveSnapshot, liveScope, modeFilter, difficultyFilter, dateRange],
  );

  const lastEventEpoch = useMemo(() => {
    if (!liveSnapshot) return null;
    const timestamps: number[] = [];
    const latestRound = liveMetrics.tableRounds[0];
    if (latestRound) {
      const roundEpoch = toEpoch(
        liveSnapshot,
        latestRound.completedAt ?? latestRound.moveSelectedAt ?? latestRound.readyAt ?? null,
      );
      if (roundEpoch != null) timestamps.push(roundEpoch);
    }
    if (liveMetrics.click.filteredClicks.length) {
      const latestClick = liveMetrics.click.filteredClicks.reduce((max, entry) => {
        const epoch = liveSnapshot.timeOrigin + entry.timestamp;
        return Math.max(max, epoch);
      }, 0);
      if (latestClick) timestamps.push(latestClick);
    }
    const lastInteraction = liveSnapshot.session.lastInteractionAt;
    if (lastInteraction != null) {
      const sessionEpoch = toEpoch(liveSnapshot, lastInteraction);
      if (sessionEpoch != null) timestamps.push(sessionEpoch);
    }
    if (!timestamps.length) return null;
    return Math.max(...timestamps);
  }, [liveSnapshot, liveMetrics]);

  const liveLabels = resolveScopeLabels(
    liveScope,
    source === "active" ? snapshot?.scope.playerName ?? null : playerName,
    source === "active" ? snapshot?.scope.profileName ?? null : profileName,
  );

  const liveStatus = useMemo(() => {
    const hasData = Boolean(
      liveSnapshot && (liveMetrics.filteredRounds.length || liveMetrics.click.filteredClicks.length || liveMetrics.hasSnapshot),
    );
    if (!hasData) {
      return { state: "empty" as const, label: `${liveLabels.player} • ${liveLabels.profile}`, lastEventMs: null };
    }
    const age = lastEventEpoch != null ? Date.now() - lastEventEpoch : null;
    if (age != null && age <= 30_000) {
      return { state: "receiving" as const, label: `${liveLabels.player} • ${liveLabels.profile}`, lastEventMs: age };
    }
    return { state: "paused" as const, label: `${liveLabels.player} • ${liveLabels.profile}`, lastEventMs: age };
  }, [liveSnapshot, liveMetrics, liveLabels, lastEventEpoch]);

  useEffect(() => {
    if (!onLiveStatusChange) return;
    onLiveStatusChange({
      running: liveStatus.state === "receiving",
      label: liveStatus.state === "empty" ? null : liveStatus.label,
    });
  }, [liveStatus, onLiveStatusChange]);

  const handleCapture = useCallback(() => {
    devInstrumentation.captureSnapshot("manual");
    setStatusMessage("Manual snapshot captured");
  }, []);

  const handleAutoCaptureClick = useCallback(() => {
    if (!scope?.playerId) {
      setStatusMessage("Select a player to enable auto-capture.");
      return;
    }
    onToggleAutoCapture(!autoCaptureEnabled);
    setStatusMessage(`Auto-capture ${!autoCaptureEnabled ? "enabled" : "disabled"}`);
  }, [scope?.playerId, autoCaptureEnabled, onToggleAutoCapture]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(0);
  }, []);

  const handleCompareToggle = useCallback((id: string) => {
    setCompareSelection(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      }
      if (prev.length >= 2) {
        return prev;
      }
      return [...prev, id];
    });
  }, []);

  const handleRowClick = useCallback((record: InstrumentationSnapshotRecord) => {
    setSelectedSnapshotId(record.id);
  }, []);

  const handlePageChange = useCallback(
    (direction: "prev" | "next") => {
      setPage(current => {
        if (direction === "prev") {
          return Math.max(0, current - 1);
        }
        return Math.min(pageCount - 1, current + 1);
      });
    },
    [pageCount],
  );

  const handleSourceToggle = useCallback(
    (next: "selected" | "active") => {
      if (next === source) return;
      onSourceChange(next);
    },
    [onSourceChange, source],
  );

  const autoCaptureDisabled = !scope?.playerId;
  const historyEmpty = !records.length;
  const liveEmpty = liveStatus.state === "empty";

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div style={scopeBarStyle}>
        <div style={scopeControlsStyle}>
          <label style={scopeLabelStyle}>
            <span>Player</span>
            <select
              value={selectedPlayerId ?? ""}
              onChange={event => onPlayerChange(event.target.value ? event.target.value : null)}
              style={scopeSelectStyle}
            >
              <option value="">All players</option>
              {playerOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={scopeLabelStyle}>
            <span>Profile</span>
            <select
              value={selectedProfileId ?? ""}
              onChange={event => onProfileChange(event.target.value ? event.target.value : null)}
              style={scopeSelectStyle}
            >
              <option value="">All profiles</option>
              {profileOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={scopeLabelStyle}>
            <span>Mode</span>
            <select
              value={modeFilter}
              onChange={event => onModeChange(event.target.value as Mode | "")}
              style={scopeSelectStyle}
            >
              <option value="">Any mode</option>
              {MODE_CHOICES.map(option => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={scopeLabelStyle}>
            <span>Difficulty</span>
            <select
              value={difficultyFilter}
              onChange={event => onDifficultyChange(event.target.value as AIMode | "")}
              style={scopeSelectStyle}
            >
              <option value="">All difficulties</option>
              {DIFFICULTY_CHOICES.map(option => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </select>
          </label>
          <div style={dateRangeStyle}>
            <span>Date range 📅</span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="date"
                value={dateRange.start ?? ""}
                onChange={event => onDateRangeChange("start", event.target.value)}
                style={scopeSelectStyle}
              />
              <input
                type="date"
                value={dateRange.end ?? ""}
                onChange={event => onDateRangeChange("end", event.target.value)}
                style={scopeSelectStyle}
              />
              <button type="button" onClick={onClearDateRange} style={clearButtonStyle}>
                Clear
              </button>
            </div>
          </div>
        </div>
        <div style={sourceSwitchStyle}>
          <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>Observe:</span>
          <button
            type="button"
            onClick={() => handleSourceToggle("selected")}
            style={sourceButtonStyle(source === "selected")}
          >
            Selected scope
          </button>
          <button
            type="button"
            onClick={() => handleSourceToggle("active")}
            style={sourceButtonStyle(source === "active")}
          >
            Active game
          </button>
        </div>
      </div>

      {statusMessage && (
        <div role="status" style={toastStyle}>
          {statusMessage}
        </div>
      )}

      <div style={tabSwitchStyle}>
        <button
          type="button"
          onClick={() => onViewChange("live")}
          style={tabButtonStyle(activeView === "live")}
        >
          Live
        </button>
        <button
          type="button"
          onClick={() => onViewChange("history")}
          style={tabButtonStyle(activeView === "history")}
        >
          History
        </button>
      </div>

      {activeView === "live" ? (
        <div style={panelStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.15rem" }}>
                  Live stream • {liveLabels.player} • {liveLabels.profile}
                </h2>
                <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.7 }}>
                  Source: {source === "active" ? "Active game" : "Selected scope"}
                </p>
              </div>
              <div style={statusPillStyle(liveStatus.state)}>
                <span style={statusDotStyle(liveStatus.state)} />
                <span>
                  {liveStatus.state === "receiving" ? "Receiving" : liveStatus.state === "paused" ? "Paused" : "No events"}
                </span>
                <span style={{ opacity: 0.75 }}>
                  {liveStatus.state === "empty"
                    ? "Waiting for activity"
                    : `last event: ${formatRelativeTime(liveStatus.lastEventMs)}`}
                </span>
              </div>
            </div>
            <div style={controlRowStyle}>
              <button type="button" onClick={handleCapture} style={primaryButtonStyle}>
                Capture snapshot
              </button>
              <button
                type="button"
                onClick={handleAutoCaptureClick}
                disabled={autoCaptureDisabled}
                style={autoCaptureButtonStyle(autoCaptureEnabled, autoCaptureDisabled)}
              >
                Auto-capture: {autoCaptureEnabled ? "On" : "Off"}
              </button>
            </div>
          </div>

          {liveEmpty ? (
            <div style={emptyStateStyle}>
              <p style={{ margin: 0, fontSize: "0.9rem" }}>
                No events for this scope. Choose Active game as source or play a few rounds. Auto-capture is available once data appears.
              </p>
            </div>
          ) : (
            <MetricCards metrics={liveMetrics} showTrend />
          )}
        </div>
      ) : (
        <div style={panelStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.15rem" }}>
                  Snapshot history • {liveLabels.player} • {liveLabels.profile}
                </h2>
                <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.7 }}>
                  Stored snapshots for this scope.
                </p>
              </div>
            </div>

            {historyEmpty ? (
              <div style={emptyStateStyle}>
                <p style={{ margin: 0, fontSize: "0.9rem" }}>
                  No snapshots saved for this scope. Use Capture snapshot or enable Auto-capture. Snapshots also save on match end.
                </p>
              </div>
            ) : (
              <>
                {comparisonMetrics && (
                  <div style={comparisonContainerStyle}>
                    <p style={{ margin: "0 0 8px", fontSize: "0.85rem", opacity: 0.8 }}>
                      Comparing {comparisonMetrics[0].record.name} ↔ {comparisonMetrics[1].record.name}
                    </p>
                    <div style={comparisonGridStyle}>
                      <div style={compareCardStyle}>
                        <p style={compareTitleStyle}>Median response time</p>
                        <p style={compareValueStyle}>{formatMs(comparisonMetrics[0].metrics.response.median)}</p>
                        <p style={compareDeltaStyle}>
                          Δ <DeltaBadge value={(comparisonMetrics[1].metrics.response.median ?? 0) - (comparisonMetrics[0].metrics.response.median ?? 0)} /> ms
                        </p>
                      </div>
                      <div style={compareCardStyle}>
                        <p style={compareTitleStyle}>Active time</p>
                        <p style={compareValueStyle}>{formatDuration(comparisonMetrics[0].metrics.engagement.activeMs)}</p>
                        <p style={compareDeltaStyle}>
                          Δ <DeltaBadge value={((comparisonMetrics[1].metrics.engagement.activeMs ?? 0) - (comparisonMetrics[0].metrics.engagement.activeMs ?? 0)) / 1000} /> s
                        </p>
                      </div>
                      <div style={compareCardStyle}>
                        <p style={compareTitleStyle}>Scoped clicks</p>
                        <p style={compareValueStyle}>{formatCount(comparisonMetrics[0].metrics.click.filteredClicks.length)}</p>
                        <p style={compareDeltaStyle}>
                          Δ <DeltaBadge value={comparisonMetrics[1].metrics.click.filteredClicks.length - comparisonMetrics[0].metrics.click.filteredClicks.length} />
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div style={historyControlsStyle}>
                  <input
                    type="search"
                    placeholder="Search snapshots"
                    value={search}
                    onChange={event => handleSearchChange(event.target.value)}
                    style={searchInputStyle}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                      Page {currentPage + 1} of {pageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePageChange("prev")}
                      disabled={currentPage === 0}
                      style={smallButtonStyle}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePageChange("next")}
                      disabled={currentPage >= pageCount - 1}
                      style={smallButtonStyle}
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Captured</th>
                        <th>Trigger</th>
                        <th>Notes</th>
                        <th>Pin</th>
                        <th>Export</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedHistory.map(record => {
                        const isSelected = record.id === selectedSnapshotId;
                        return (
                          <tr
                            key={record.id}
                            onClick={() => handleRowClick(record)}
                            style={{
                              cursor: "pointer",
                              background: isSelected ? "rgba(59,130,246,0.2)" : record.pinned ? "rgba(253,224,71,0.08)" : "transparent",
                            }}
                          >
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <input
                                  type="checkbox"
                                  checked={compareSelection.includes(record.id)}
                                  onChange={() => handleCompareToggle(record.id)}
                                  onClick={event => event.stopPropagation()}
                                />
                                <span>{record.name}</span>
                              </div>
                            </td>
                            <td>{formatDateTime(record.createdAt)}</td>
                            <td>{formatTriggerLabel(record.trigger)}</td>
                            <td style={{ minWidth: "160px" }}>
                              <textarea
                                value={record.notes}
                                placeholder="Notes"
                                onChange={event => instrumentationSnapshots.updateNotes(record.scope, record.id, event.target.value)}
                                onClick={event => event.stopPropagation()}
                                style={notesInputStyle}
                              />
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation();
                                  instrumentationSnapshots.togglePin(record.scope, record.id);
                                }}
                                style={smallButtonStyle}
                              >
                                {record.pinned ? "Unpin" : "Pin"}
                              </button>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                                <button
                                  type="button"
                                  onClick={event => {
                                    event.stopPropagation();
                                    downloadSnapshot(record, "json");
                                  }}
                                  style={smallButtonStyle}
                                >
                                  JSON
                                </button>
                                <button
                                  type="button"
                                  onClick={event => {
                                    event.stopPropagation();
                                    downloadSnapshot(record, "csv");
                                  }}
                                  style={smallButtonStyle}
                                >
                                  CSV
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!paginatedHistory.length && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", opacity: 0.7 }}>
                            No snapshots match this search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {activeDetailRecord && detailMetrics && (
                  <div style={detailPanelStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                      <div>
                        <h3 style={{ margin: "0 0 4px" }}>{activeDetailRecord.name}</h3>
                        <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.7 }}>
                          Captured {formatDateTime(activeDetailRecord.createdAt)} · {formatTriggerLabel(activeDetailRecord.trigger)}
                        </p>
                      </div>
                    </div>
                    <MetricCards metrics={detailMetrics} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const scopeBarStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 6,
  background: "rgba(11,18,32,0.94)",
  backdropFilter: "blur(10px)",
  borderRadius: "12px",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const scopeControlsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
};

const scopeLabelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  fontSize: "0.75rem",
};

const scopeSelectStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "8px",
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(9,14,26,0.85)",
  color: "inherit",
  minWidth: "140px",
};

const dateRangeStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  fontSize: "0.75rem",
};

const clearButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(148,163,184,0.4)",
  color: "#e2e8f0",
  borderRadius: "999px",
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: "0.75rem",
};

const sourceSwitchStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
};

function sourceButtonStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.08)",
    border: active ? "1px solid rgba(59,130,246,0.6)" : "1px solid rgba(148,163,184,0.3)",
    color: "#e2e8f0",
    borderRadius: "999px",
    padding: "6px 14px",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: active ? 600 : 500,
  };
}

const toastStyle: React.CSSProperties = {
  background: "rgba(37,99,235,0.2)",
  border: "1px solid rgba(37,99,235,0.5)",
  color: "#bfdbfe",
  padding: "10px 14px",
  borderRadius: "10px",
  fontSize: "0.85rem",
};

const tabSwitchStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "#2563eb" : "rgba(148,163,184,0.2)",
    border: "none",
    color: "white",
    padding: "8px 16px",
    borderRadius: "999px",
    cursor: "pointer",
    fontWeight: active ? 600 : 500,
  };
}

const panelStyle: React.CSSProperties = {
  background: "rgba(15,25,45,0.8)",
  borderRadius: "12px",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

function statusPillStyle(state: "receiving" | "paused" | "empty"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    borderRadius: "999px",
    padding: "6px 12px",
    fontSize: "0.75rem",
    fontWeight: 600,
  };
  if (state === "receiving") {
    return { ...base, background: "rgba(34,197,94,0.18)", color: "#bbf7d0", border: "1px solid rgba(34,197,94,0.45)" };
  }
  if (state === "paused") {
    return { ...base, background: "rgba(148,163,184,0.18)", color: "#e2e8f0", border: "1px solid rgba(148,163,184,0.4)" };
  }
  return { ...base, background: "rgba(251,191,36,0.18)", color: "#fde68a", border: "1px solid rgba(251,191,36,0.4)" };
}

function statusDotStyle(state: "receiving" | "paused" | "empty"): React.CSSProperties {
  const color = state === "receiving" ? "#22c55e" : state === "paused" ? "#94a3b8" : "#facc15";
  return { width: "8px", height: "8px", borderRadius: "999px", background: color };
}

const controlRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
};

const primaryButtonStyle: React.CSSProperties = {
  background: "#2563eb",
  border: "none",
  color: "white",
  padding: "8px 16px",
  borderRadius: "8px",
  cursor: "pointer",
  fontWeight: 600,
};

function autoCaptureButtonStyle(enabled: boolean, disabled: boolean): React.CSSProperties {
  return {
    background: enabled ? "rgba(34,197,94,0.2)" : "rgba(148,163,184,0.18)",
    border: enabled ? "1px solid rgba(34,197,94,0.45)" : "1px solid rgba(148,163,184,0.35)",
    color: enabled ? "#bbf7d0" : "#e2e8f0",
    padding: "8px 16px",
    borderRadius: "8px",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontWeight: 600,
  };
}

const emptyStateStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.75)",
  borderRadius: "12px",
  padding: "20px",
  border: "1px dashed rgba(148,163,184,0.4)",
};

const metricsGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
};

const comparisonContainerStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.85)",
  borderRadius: "12px",
  padding: "16px",
  display: "grid",
  gap: "12px",
};

const comparisonGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const historyControlsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const searchInputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(9,14,26,0.85)",
  color: "inherit",
  minWidth: "220px",
};

const notesInputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "48px",
  borderRadius: "8px",
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(9,14,26,0.9)",
  color: "inherit",
  padding: "6px 8px",
  resize: "vertical",
};

const detailPanelStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.85)",
  borderRadius: "12px",
  padding: "16px",
  display: "grid",
  gap: "12px",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(15,25,45,0.72)",
  borderRadius: "12px",
  padding: "16px",
  display: "grid",
  gap: "12px",
};

const cardTitleStyle: React.CSSProperties = { margin: 0, fontSize: "0.95rem", fontWeight: 600 };
const statRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px" };
const matchStatStyle: React.CSSProperties = { margin: "4px 0", fontSize: "0.8rem", opacity: 0.8 };
const listStyle: React.CSSProperties = { margin: 0, paddingLeft: "18px", display: "grid", gap: "4px", fontSize: "0.85rem" };
const emptyListStyle: React.CSSProperties = { margin: 0, fontSize: "0.8rem", opacity: 0.7 };
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.85rem",
};

const smallButtonStyle: React.CSSProperties = {
  background: "rgba(59,130,246,0.18)",
  border: "1px solid rgba(59,130,246,0.4)",
  color: "#bfdbfe",
  borderRadius: "8px",
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "0.8rem",
};

const compareCardStyle: React.CSSProperties = {
  background: "rgba(15,25,45,0.72)",
  borderRadius: "12px",
  padding: "16px",
  display: "grid",
  gap: "6px",
};

const compareTitleStyle: React.CSSProperties = { margin: 0, fontSize: "0.8rem", opacity: 0.7 };
const compareValueStyle: React.CSSProperties = { margin: 0, fontSize: "1.1rem", fontWeight: 600 };
const compareDeltaStyle: React.CSSProperties = { margin: 0, fontSize: "0.85rem", opacity: 0.8 };

export default InstrumentationTab;
