import React, { useEffect, useMemo, useState } from "react";

import type { DevInstrumentationSnapshot, InstrumentationScope } from "./devInstrumentation";
import { devInstrumentation } from "./devInstrumentation";
import type { AIMode, Mode } from "./gameTypes";
import {
  InstrumentationSnapshotRecord,
  downloadSnapshot,
  downloadSnapshotRange,
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

const InstrumentationTab: React.FC<InstrumentationTabProps> = ({
  snapshot,
  scope,
  modeFilter,
  difficultyFilter,
  dateRange,
  playerName,
  profileName,
}) => {
  const [heatmapResolution, setHeatmapResolution] = useState<"3x3" | "6x4">("3x3");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const records = useInstrumentationSnapshots(scope);
  useEffect(() => {
    setPage(0);
    setCompareSelection([]);
  }, [scope?.playerId, scope?.profileId]);

  const metrics = useMemo(
    () => deriveMetrics(snapshot, scope, modeFilter, difficultyFilter, dateRange),
    [snapshot, scope, modeFilter, difficultyFilter, dateRange],
  );

  const heatmapData = useMemo(() => computeHeatmap(metrics.click.filteredClicks, heatmapResolution), [metrics, heatmapResolution]);

  const liveRecords = records.slice(0, 6);
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
    if (selectedRecords.length < 2 || !scope) return null;
    return selectedRecords.map(record => ({ record, metrics: deriveMetrics(record.data, scope, modeFilter, difficultyFilter, dateRange) }));
  }, [selectedRecords, scope, modeFilter, difficultyFilter, dateRange]);

  useEffect(() => {
    if (!statusMessage) return;
    const handle = window.setTimeout(() => setStatusMessage(null), 3000);
    return () => window.clearTimeout(handle);
  }, [statusMessage]);

  const handleCapture = () => {
    if (!scope) return;
    devInstrumentation.captureSnapshot("manual");
    setStatusMessage("Manual snapshot captured");
  };

  const handleToggleCompare = (id: string) => {
    setCompareSelection(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const scopeLabel = scope
    ? `${playerName ?? "Unknown player"} • ${profileName ?? "All profiles"}`
    : "Select a player to view instrumentation";

  if (!scope) {
    return (
      <div
        style={{
          background: "rgba(15,25,45,0.8)",
          borderRadius: "12px",
          padding: "24px",
          color: "rgba(226,232,240,0.85)",
        }}
      >
        <h3 style={{ margin: "0 0 8px" }}>Instrumentation</h3>
        <p style={{ margin: 0, fontSize: "0.9rem", maxWidth: "520px" }}>
          Choose a player and profile from the filter bar to review live instrumentation metrics, auto-saved snapshots, and
          history comparisons.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div
        style={{
          background: "rgba(15,25,45,0.75)",
          borderRadius: "12px",
          padding: "16px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <div>
          <h3 style={{ margin: "0 0 6px" }}>Instrumentation</h3>
          <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.7 }}>
            Scope: {scopeLabel}
            {modeFilter ? ` • Mode: ${modeFilter}` : ""}
            {difficultyFilter ? ` • Difficulty: ${difficultyFilter}` : ""}
            {dateRange.start || dateRange.end ? ` • Date: ${dateRange.start ?? "…"} → ${dateRange.end ?? "…"}` : ""}
          </p>
          {statusMessage && (
            <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "#93c5fd" }}>{statusMessage}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleCapture}
            style={{
              background: "#2563eb",
              border: "none",
              color: "white",
              borderRadius: "8px",
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            Capture snapshot
          </button>
          <button
            type="button"
            onClick={() => setHeatmapResolution(resolution => (resolution === "3x3" ? "6x4" : "3x3"))}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              borderRadius: "8px",
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            Heatmap: {heatmapResolution === "3x3" ? "3×3" : "6×4"}
          </button>
        </div>
      </div>

      {!metrics.hasSnapshot && (
        <div
          style={{
            background: "rgba(15,25,45,0.8)",
            borderRadius: "12px",
            padding: "18px",
            color: "rgba(226,232,240,0.8)",
          }}
        >
          <p style={{ margin: 0 }}>Instrumentation data will appear once the session produces metrics.</p>
        </div>
      )}

      {metrics.hasSnapshot && (
        <div style={{ display: "grid", gap: "16px" }}>
          <div
            style={{
              display: "grid",
              gap: "16px",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              alignItems: "stretch",
            }}
          >
            <div style={cardStyle}>
              <h4 style={cardTitleStyle}>Response time</h4>
              <div style={{ display: "grid", gap: "6px", fontSize: "0.9rem" }}>
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
                  <span>Rolling avg (20)</span>
                  <strong>{formatMs(metrics.response.rollingAverage)}</strong>
                </div>
              </div>
              <div style={{ marginTop: "12px" }}>
                <Sparkline values={metrics.response.rollingValues} />
              </div>
            </div>

            <div style={cardStyle}>
              <h4 style={cardTitleStyle}>Engagement</h4>
              <div style={{ display: "grid", gap: "6px", fontSize: "0.9rem" }}>
                <div style={statRowStyle}>
                  <span>Session age</span>
                  <strong>{formatDuration(metrics.engagement.sessionAgeMs)}</strong>
                </div>
                <div style={statRowStyle}>
                  <span>Active (focused)</span>
                  <strong>{formatDuration(metrics.engagement.activeMs)}</strong>
                </div>
                <div style={statRowStyle}>
                  <span>Idle gaps</span>
                  <strong>
                    {formatCount(metrics.engagement.idleCount)} · {formatDuration(metrics.engagement.idleDurationMs)}
                  </strong>
                </div>
                <div style={statRowStyle}>
                  <span>Focus events</span>
                  <strong>{formatCount(metrics.engagement.focusEvents)}</strong>
                </div>
                <div style={statRowStyle}>
                  <span>Current view</span>
                  <strong>{metrics.engagement.currentView}</strong>
                </div>
              </div>
              {metrics.engagement.match && (
                <div style={{ marginTop: "12px", padding: "12px", background: "rgba(30,41,59,0.55)", borderRadius: "10px" }}>
                  <p style={{ margin: "0 0 4px", fontSize: "0.8rem", opacity: 0.7 }}>Current match</p>
                  <p style={{ margin: "0 0 4px", fontSize: "0.85rem" }}>
                    {metrics.engagement.match.mode} · {metrics.engagement.match.difficulty} · Best of {metrics.engagement.match.bestOf}
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

          <div style={{ background: "rgba(15,25,45,0.72)", borderRadius: "12px", padding: "16px", display: "grid", gap: "12px" }}>
            <h4 style={{ margin: 0 }}>Click heatmap ({metrics.click.filteredClicks.length} clicks)</h4>
            <Heatmap records={metrics.click.filteredClicks} resolution={heatmapResolution} />
          </div>

          <div style={{ background: "rgba(15,25,45,0.72)", borderRadius: "12px", padding: "16px" }}>
            <h4 style={{ margin: "0 0 12px" }}>Recent rounds</h4>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Mode</th>
                    <th>Difficulty</th>
                    <th>Round time</th>
                    <th>Response time</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.tableRounds.slice(0, 12).map(round => {
                    const roundDuration = round.completedAt != null && round.readyAt != null ? round.completedAt - round.readyAt : null;
                    return (
                      <tr key={`${round.matchId}-${round.roundNumber}`}>
                        <td>{round.roundNumber}</td>
                        <td>{round.mode}</td>
                        <td>{round.difficulty}</td>
                        <td>{formatDuration(roundDuration)}</td>
                        <td>{formatMs(round.responseTimeMs ?? null)}</td>
                        <td style={{ textTransform: "capitalize" }}>{round.outcome ?? "–"}</td>
                      </tr>
                    );
                  })}
                  {!metrics.tableRounds.length && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", opacity: 0.7 }}>
                        No rounds match the current filters yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: "16px", background: "rgba(15,25,45,0.72)", borderRadius: "12px", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <h4 style={{ margin: 0 }}>Live snapshots</h4>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => downloadSnapshotRange(records.slice(0, 10), "json", `${scope.playerId ?? "all"}_latest`)}
              disabled={!records.length}
              style={smallButtonStyle}
            >
              Export latest (JSON)
            </button>
            <button
              type="button"
              onClick={() => downloadSnapshotRange(records.slice(0, 10), "csv", `${scope.playerId ?? "all"}_latest`)}
              disabled={!records.length}
              style={smallButtonStyle}
            >
              Export latest (CSV)
            </button>
          </div>
        </div>
        {liveRecords.length ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {liveRecords.map(record => (
              <SnapshotCard
                key={record.id}
                record={record}
                scope={scope}
                selected={compareSelection.includes(record.id)}
                onToggleCompare={() => handleToggleCompare(record.id)}
              />
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, opacity: 0.7 }}>No snapshots captured yet for this scope.</p>
        )}
      </div>

      <div style={{ background: "rgba(15,25,45,0.72)", borderRadius: "12px", padding: "16px", display: "grid", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <h4 style={{ margin: 0 }}>Snapshot history</h4>
          <input
            type="search"
            placeholder="Search snapshots"
            value={search}
            onChange={event => {
              setSearch(event.target.value);
              setPage(0);
            }}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(15,23,42,0.85)",
              color: "white",
              minWidth: "200px",
            }}
          />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ width: "24px" }}>Compare</th>
                <th>Name</th>
                <th>Captured</th>
                <th>Trigger</th>
                <th>Notes</th>
                <th>Pin</th>
                <th>Export</th>
              </tr>
            </thead>
            <tbody>
              {paginatedHistory.map(record => (
                <HistoryRow
                  key={record.id}
                  record={record}
                  scope={scope}
                  selected={compareSelection.includes(record.id)}
                  onToggleCompare={() => handleToggleCompare(record.id)}
                />
              ))}
              {!paginatedHistory.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", opacity: 0.7 }}>
                    No snapshots match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
            Page {currentPage + 1} of {pageCount}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setPage(prev => Math.max(0, prev - 1))}
              disabled={currentPage === 0}
              style={smallButtonStyle}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage(prev => Math.min(pageCount - 1, prev + 1))}
              disabled={currentPage >= pageCount - 1}
              style={smallButtonStyle}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {comparisonMetrics && comparisonMetrics.length === 2 && (
        <div style={{ background: "rgba(15,25,45,0.8)", borderRadius: "12px", padding: "16px", display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>Comparison</h4>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => downloadSnapshotRange(selectedRecords, "json", `${scope.playerId ?? "all"}_compare`)}
                style={smallButtonStyle}
              >
                Export selected (JSON)
              </button>
              <button
                type="button"
                onClick={() => downloadSnapshotRange(selectedRecords, "csv", `${scope.playerId ?? "all"}_compare`)}
                style={smallButtonStyle}
              >
                Export selected (CSV)
              </button>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.75 }}>
            Base: {comparisonMetrics[0].record.name} · Compare: {comparisonMetrics[1].record.name}
          </p>
          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
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
    </div>
  );
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
  background: "rgba(30,41,59,0.65)",
  borderRadius: "12px",
  padding: "16px",
  display: "grid",
  gap: "6px",
};

const compareTitleStyle: React.CSSProperties = { margin: 0, fontSize: "0.8rem", opacity: 0.7 };
const compareValueStyle: React.CSSProperties = { margin: 0, fontSize: "1.1rem", fontWeight: 600 };
const compareDeltaStyle: React.CSSProperties = { margin: 0, fontSize: "0.85rem", opacity: 0.8 };

interface SnapshotCardProps {
  record: InstrumentationSnapshotRecord;
  scope: InstrumentationScope;
  selected: boolean;
  onToggleCompare: () => void;
}

function SnapshotCard({ record, scope, selected, onToggleCompare }: SnapshotCardProps) {
  const handlePin = () => {
    instrumentationSnapshots.togglePin(scope, record.id);
  };
  return (
    <div style={{ background: "rgba(15,23,42,0.82)", borderRadius: "12px", padding: "14px", display: "grid", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
        <div>
          <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{record.name}</p>
          <p style={{ margin: 0, fontSize: "0.75rem", opacity: 0.65 }}>
            {formatDateTime(record.createdAt)} · {record.trigger}
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem" }}>
          <input type="checkbox" checked={selected} onChange={onToggleCompare} /> Compare
        </label>
      </div>
      <textarea
        placeholder="Add notes"
        value={record.notes}
        onChange={event => instrumentationSnapshots.updateNotes(scope, record.id, event.target.value)}
        style={{
          minHeight: "60px",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(15,23,42,0.9)",
          color: "white",
          padding: "8px",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" onClick={() => downloadSnapshot(record, "json")} style={smallButtonStyle}>
          JSON
        </button>
        <button type="button" onClick={() => downloadSnapshot(record, "csv")} style={smallButtonStyle}>
          CSV
        </button>
        <button
          type="button"
          onClick={handlePin}
          style={{
            ...smallButtonStyle,
            background: record.pinned ? "rgba(234,179,8,0.25)" : smallButtonStyle.background,
            border: record.pinned ? "1px solid rgba(234,179,8,0.6)" : smallButtonStyle.border,
            color: record.pinned ? "#facc15" : smallButtonStyle.color,
          }}
        >
          {record.pinned ? "Pinned" : "Pin"}
        </button>
      </div>
    </div>
  );
}

interface HistoryRowProps {
  record: InstrumentationSnapshotRecord;
  scope: InstrumentationScope;
  selected: boolean;
  onToggleCompare: () => void;
}

function HistoryRow({ record, scope, selected, onToggleCompare }: HistoryRowProps) {
  const handlePin = () => instrumentationSnapshots.togglePin(scope, record.id);
  return (
    <tr style={{ background: record.pinned ? "rgba(253,224,71,0.08)" : "transparent" }}>
      <td style={{ textAlign: "center" }}>
        <input type="checkbox" checked={selected} onChange={onToggleCompare} />
      </td>
      <td>{record.name}</td>
      <td>{formatDateTime(record.createdAt)}</td>
      <td>{record.trigger}</td>
      <td style={{ minWidth: "160px" }}>
        <textarea
          value={record.notes}
          onChange={event => instrumentationSnapshots.updateNotes(scope, record.id, event.target.value)}
          placeholder="Notes"
          style={{
            width: "100%",
            minHeight: "48px",
            borderRadius: "8px",
            border: "1px solid rgba(148,163,184,0.2)",
            background: "rgba(15,23,42,0.85)",
            color: "white",
            padding: "6px 8px",
            resize: "vertical",
          }}
        />
      </td>
      <td style={{ textAlign: "center" }}>
        <button type="button" onClick={handlePin} style={smallButtonStyle}>
          {record.pinned ? "Unpin" : "Pin"}
        </button>
      </td>
      <td style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
        <button type="button" onClick={() => downloadSnapshot(record, "json")} style={smallButtonStyle}>
          JSON
        </button>
        <button type="button" onClick={() => downloadSnapshot(record, "csv")} style={smallButtonStyle}>
          CSV
        </button>
      </td>
    </tr>
  );
}

export default InstrumentationTab;
