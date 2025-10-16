import { useEffect, useState } from "react";

import { DEV_MODE_ENABLED } from "./devMode";
import type { AIMode, Mode, Outcome, BestOf } from "./gameTypes";
import { instrumentationSnapshots } from "./instrumentationSnapshots";
import type { SnapshotTrigger } from "./instrumentationSnapshots";

const IDLE_THRESHOLD_MS = 45_000;
const BURST_WINDOW_MS = 10_000;
const MAX_ROUND_HISTORY = 200;
const MAX_CLICK_HISTORY = 400;
const MAX_INTERVAL_HISTORY = 200;
const AUTO_SNAPSHOT_ROUND_INTERVAL = 10;
const AUTO_SNAPSHOT_INTERVAL_MS = 2 * 60_000;

export type InstrumentationScope = {
  playerId: string | null;
  profileId: string | null;
  playerName: string | null;
  profileName: string | null;
};

type FocusEventEntry = { type: "focus" | "blur"; at: number };

type RoundMetrics = {
  matchId: string;
  roundNumber: number;
  mode: Mode;
  difficulty: AIMode;
  bestOf: BestOf;
  playerId: string | null;
  profileId: string | null;
  readyAt: number;
  firstInteractionAt?: number;
  moveSelectedAt?: number;
  completedAt?: number;
  responseSpeedMs?: number;
  responseTimeMs?: number;
  interRoundDelayMs?: number;
  outcome?: Outcome;
  aiStreak?: number;
  youStreak?: number;
  interactions: number;
  clicks: number;
};

type MatchMetrics = {
  id: string;
  mode: Mode;
  difficulty: AIMode;
  bestOf: BestOf;
  playerId: string | null;
  profileId: string | null;
  playerName: string | null;
  profileName: string | null;
  startedAt: number;
  endedAt?: number;
  responseSpeed: number[];
  responseTime: number[];
  rounds: RoundMetrics[];
  clickCount: number;
  interactions: number;
  activeMs: number;
  idleGaps: { start: number; end?: number }[];
  idleSince?: number | null;
};

type ClickRecord = {
  timestamp: number;
  view: string;
  matchId?: string;
  roundNumber?: number;
  mode?: Mode;
  difficulty?: AIMode;
  target: string;
  elementId?: string;
  grid: string;
  x: number;
  y: number;
  playerId?: string | null;
  profileId?: string | null;
  viewportWidth?: number;
  viewportHeight?: number;
};

type PromptEntry = {
  name: string;
  openedAt: number;
  closedAt?: number;
  durationMs?: number;
};

type StatSummary = {
  count: number;
  average: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  latest: number | null;
};

type StreakBreakdown = {
  winStreakAvgMs: number | null;
  lossStreakAvgMs: number | null;
  neutralAvgMs: number | null;
};

export type DevInstrumentationSnapshot = {
  scope: InstrumentationScope;
  timeOrigin: number;
  capturedAt: number;
  session: {
    startedAt: number;
    activeMs: number;
    focused: boolean;
    idleThresholdMs: number;
    lastInteractionAt: number | null;
    totalInteractions: number;
    totalClicks: number;
    currentView: string;
    viewClickCounts: Record<string, number>;
    focusEvents: FocusEventEntry[];
    idleGaps: { start: number; end?: number }[];
    responseSpeed: StatSummary;
    responseTime: StatSummary;
    interRoundDelay: StatSummary;
  };
  currentMatch?: {
    id: string;
    mode: Mode;
    difficulty: AIMode;
    bestOf: BestOf;
    playerId: string | null;
    profileId: string | null;
    playerName: string | null;
    profileName: string | null;
    startedAt: number;
    endedAt?: number;
    roundsPlayed: number;
    responseSpeed: StatSummary;
    responseTime: StatSummary;
    clickCount: number;
    interactions: number;
    activeMs: number;
    streaks: StreakBreakdown;
    idleGaps: { start: number; end?: number }[];
  };
  recentRounds: RoundMetrics[];
  rollingResponseTime: StatSummary;
  clickHeatmap: {
    total: number;
    grid: Record<string, number>;
    topElements: { key: string; count: number }[];
  };
  clickHistory: ClickRecord[];
  clickSpeed: {
    averageIntervalMs: number | null;
    medianIntervalMs: number | null;
    lastIntervalMs: number | null;
    peakBurstPer10s: number;
    latestBurstPer10s: number;
  };
  promptHistory: PromptEntry[];
};

type SnapshotListener = (snapshot: DevInstrumentationSnapshot | null) => void;

interface MatchStartPayload {
  matchId: string;
  mode: Mode;
  difficulty: AIMode;
  bestOf: BestOf;
  startedAt?: number;
  playerId?: string | null;
  profileId?: string | null;
  playerName?: string | null;
  profileName?: string | null;
}

interface RoundReadyPayload {
  matchId: string;
  roundNumber: number;
  mode: Mode;
  difficulty: AIMode;
  bestOf: BestOf;
  readyAt?: number;
  playerId?: string | null;
  profileId?: string | null;
}

interface MoveSelectedPayload {
  matchId: string;
  roundNumber: number;
  at?: number;
}

interface RoundCompletedPayload {
  matchId: string;
  roundNumber: number;
  outcome: Outcome;
  aiStreak: number;
  youStreak: number;
  completedAt?: number;
}

interface MatchEndedPayload {
  matchId: string;
  endedAt?: number;
  playerId?: string | null;
  profileId?: string | null;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (percentileValue / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

function summarise(values: number[], latest: number | null): StatSummary {
  if (!values.length) {
    return { count: 0, average: null, median: null, p75: null, p90: null, latest };
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    count: values.length,
    average: sum / values.length,
    median: percentile(values, 50),
    p75: percentile(values, 75),
    p90: percentile(values, 90),
    latest,
  };
}

function describeElement(target: EventTarget | null): { name: string; id?: string } {
  if (!(target instanceof Element)) {
    return { name: "unknown" };
  }
  const element = target as HTMLElement;
  const dataId = element.dataset.devLabel || element.dataset.analyticsId;
  const id = dataId || element.id || undefined;
  const dataName = element.dataset.analyticsId || element.dataset.devLabel;
  const aria = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby");
  const text = element.textContent?.trim();
  let name = dataName || aria || element.getAttribute("name") || element.tagName.toLowerCase();
  if (!dataName && !aria && text && text.length <= 24) {
    name = `${name}:${text}`;
  }
  return { name, id };
}

function gridForPosition(x: number, y: number): string {
  if (typeof window === "undefined") return "0,0";
  const colSize = Math.max(1, window.innerWidth / 3);
  const rowSize = Math.max(1, window.innerHeight / 3);
  const colIndex = Math.max(0, Math.min(2, Math.floor(x / colSize)));
  const rowIndex = Math.max(0, Math.min(2, Math.floor(y / rowSize)));
  return `${colIndex},${rowIndex}`;
}

class DevInstrumentation {
  private matches = new Map<string, MatchMetrics>();
  private currentMatchId: string | null = null;
  private currentRound: RoundMetrics | null = null;
  private readonly roundHistory: RoundMetrics[] = [];
  private readonly clickRecords: ClickRecord[] = [];
  private readonly interClickIntervals: number[] = [];
  private readonly clickTimestamps: number[] = [];
  private readonly listeners = new Set<SnapshotListener>();
  private readonly viewClickCounts = new Map<string, number>();
  private readonly sessionIdleGaps: { start: number; end?: number }[] = [];
  private readonly promptLog: PromptEntry[] = [];
  private currentView = "BOOT";
  private focused = true;
  private lastInteractionAt: number;
  private idle = false;
  private idleSince: number | null = null;
  private session = {
    startedAt: typeof performance !== "undefined" ? performance.now() : 0,
    activeMs: 0,
    lastActiveMark: typeof performance !== "undefined" ? performance.now() : 0,
    totalInteractions: 0,
    totalClicks: 0,
    focusEvents: [] as FocusEventEntry[],
  };
  private activeTimer: number | null = null;
  private scope: InstrumentationScope = { playerId: null, profileId: null, playerName: null, profileName: null };
  private lastSnapshotAt: number | null = null;
  private roundsSinceSnapshot = 0;
  private readonly timeOrigin: number;

  constructor() {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    this.lastInteractionAt = now;
    this.timeOrigin = typeof performance !== "undefined" ? Date.now() - now : Date.now();
    if (typeof window !== "undefined") {
      this.focused = document.hasFocus();
      if (this.focused) {
        this.session.focusEvents.push({ type: "focus", at: now });
      }
      window.addEventListener("focus", this.handleFocus, true);
      window.addEventListener("blur", this.handleBlur, true);
      window.addEventListener("pointerdown", this.handlePointer, true);
      window.addEventListener("keydown", this.handleKey, true);
      document.addEventListener("visibilitychange", this.handleVisibility, true);
      this.activeTimer = window.setInterval(this.tickActive, 1_000);
    }
  }

  destroy() {
    if (typeof window === "undefined") return;
    window.removeEventListener("focus", this.handleFocus, true);
    window.removeEventListener("blur", this.handleBlur, true);
    window.removeEventListener("pointerdown", this.handlePointer, true);
    window.removeEventListener("keydown", this.handleKey, true);
    document.removeEventListener("visibilitychange", this.handleVisibility, true);
    if (this.activeTimer != null) {
      window.clearInterval(this.activeTimer);
      this.activeTimer = null;
    }
    this.listeners.clear();
  }

  subscribe(listener: SnapshotListener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  setScope(scope: InstrumentationScope) {
    this.scope = {
      playerId: scope.playerId ?? null,
      profileId: scope.profileId ?? null,
      playerName: scope.playerName ?? null,
      profileName: scope.profileName ?? null,
    };
  }

  getSnapshot(): DevInstrumentationSnapshot {
    const sessionSpeeds = this.roundHistory.map(round => round.responseSpeedMs).filter((value): value is number => value != null);
    const sessionTimes = this.roundHistory.map(round => round.responseTimeMs).filter((value): value is number => value != null);
    const sessionDelays = this.roundHistory
      .map(round => round.interRoundDelayMs)
      .filter((value): value is number => value != null);
    const lastTime = sessionTimes.length ? sessionTimes[sessionTimes.length - 1] : null;
    const lastSpeed = sessionSpeeds.length ? sessionSpeeds[sessionSpeeds.length - 1] : null;
    const sessionSummary: StatSummary = summarise(sessionTimes, lastTime);
    const sessionSpeedSummary: StatSummary = summarise(sessionSpeeds, lastSpeed);
    const sessionDelaySummary: StatSummary = summarise(sessionDelays, sessionDelays.length ? sessionDelays[sessionDelays.length - 1] : null);

    const rolling = this.roundHistory.slice(-20);
    const rollingTimes = rolling.map(round => round.responseTimeMs).filter((value): value is number => value != null);
    const rollingSummary: StatSummary = summarise(rollingTimes, rollingTimes.length ? rollingTimes[rollingTimes.length - 1] : null);

    const focusEvents = [...this.session.focusEvents];

    const currentMatch = this.currentMatchId ? this.matches.get(this.currentMatchId) : undefined;
    const currentMatchSummary = currentMatch
      ? {
          id: currentMatch.id,
          mode: currentMatch.mode,
          difficulty: currentMatch.difficulty,
          bestOf: currentMatch.bestOf,
          playerId: currentMatch.playerId,
          profileId: currentMatch.profileId,
          playerName: currentMatch.playerName,
          profileName: currentMatch.profileName,
          startedAt: currentMatch.startedAt,
          endedAt: currentMatch.endedAt,
          roundsPlayed: currentMatch.rounds.length,
          responseSpeed: summarise(currentMatch.responseSpeed, currentMatch.responseSpeed.slice(-1)[0] ?? null),
          responseTime: summarise(currentMatch.responseTime, currentMatch.responseTime.slice(-1)[0] ?? null),
          clickCount: currentMatch.clickCount,
          interactions: currentMatch.interactions,
          activeMs: currentMatch.activeMs,
          streaks: this.computeStreakBreakdown(currentMatch.rounds),
          idleGaps: [...currentMatch.idleGaps],
        }
      : undefined;

    const gridCounts = this.clickRecords.reduce<Record<string, number>>((acc, record) => {
      acc[record.grid] = (acc[record.grid] ?? 0) + 1;
      return acc;
    }, {});
    const topElementsMap = this.clickRecords.reduce<Record<string, number>>((acc, record) => {
      const key = record.elementId ? `${record.target}#${record.elementId}` : record.target;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const topElements = Object.entries(topElementsMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => ({ key, count }));

    const avgInterval = this.interClickIntervals.length
      ? this.interClickIntervals.reduce((acc, value) => acc + value, 0) / this.interClickIntervals.length
      : null;
    const medianInterval = percentile(this.interClickIntervals, 50);
    const lastInterval = this.interClickIntervals.length ? this.interClickIntervals[this.interClickIntervals.length - 1] : null;

    const { peak, latest } = this.computeBurstStats();

    const sessionViewCounts: Record<string, number> = {};
    for (const [view, count] of this.viewClickCounts.entries()) {
      sessionViewCounts[view] = count;
    }

    return {
      scope: {
        playerId: this.scope.playerId,
        profileId: this.scope.profileId,
        playerName: this.scope.playerName,
        profileName: this.scope.profileName,
      },
      timeOrigin: this.timeOrigin,
      capturedAt: Date.now(),
      session: {
        startedAt: this.session.startedAt,
        activeMs: this.session.activeMs,
        focused: this.focused,
        idleThresholdMs: IDLE_THRESHOLD_MS,
        lastInteractionAt: this.lastInteractionAt,
        totalInteractions: this.session.totalInteractions,
        totalClicks: this.session.totalClicks,
        currentView: this.currentView,
        viewClickCounts: sessionViewCounts,
        focusEvents,
        idleGaps: [...this.sessionIdleGaps],
        responseSpeed: sessionSpeedSummary,
        responseTime: sessionSummary,
        interRoundDelay: sessionDelaySummary,
      },
      currentMatch: currentMatchSummary,
      recentRounds: this.roundHistory.slice(-20).reverse(),
      rollingResponseTime: rollingSummary,
      clickHeatmap: {
        total: this.clickRecords.length,
        grid: gridCounts,
        topElements,
      },
      clickHistory: [...this.clickRecords],
      clickSpeed: {
        averageIntervalMs: avgInterval,
        medianIntervalMs: medianInterval,
        lastIntervalMs: lastInterval,
        peakBurstPer10s: peak,
        latestBurstPer10s: latest,
      },
      promptHistory: [...this.promptLog].slice(-10).reverse(),
    };
  }

  setView(view: string) {
    this.currentView = view;
  }

  captureSnapshot(trigger: SnapshotTrigger = "manual") {
    this.requestSnapshot(trigger, { force: true });
  }

  matchStarted(payload: MatchStartPayload) {
    const { matchId, mode, difficulty, bestOf } = payload;
    const startedAt = payload.startedAt ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
    const match: MatchMetrics = {
      id: matchId,
      mode,
      difficulty,
      bestOf,
      playerId: payload.playerId ?? this.scope.playerId,
      profileId: payload.profileId ?? this.scope.profileId,
      playerName: payload.playerName ?? this.scope.playerName,
      profileName: payload.profileName ?? this.scope.profileName,
      startedAt,
      responseSpeed: [],
      responseTime: [],
      rounds: [],
      clickCount: 0,
      interactions: 0,
      activeMs: 0,
      idleGaps: [],
      idleSince: null,
    };
    this.matches.set(matchId, match);
    this.currentMatchId = matchId;
    this.currentRound = null;
    this.roundsSinceSnapshot = 0;
    this.emit();
  }

  matchEnded(payload: MatchEndedPayload) {
    const { matchId } = payload;
    const match = this.matches.get(matchId);
    if (match) {
      match.endedAt = payload.endedAt ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
      match.idleSince = null;
    }
    if (this.currentMatchId === matchId) {
      this.currentMatchId = null;
      this.currentRound = null;
    }
    this.requestSnapshot("match-ended");
    this.emit();
  }

  roundReady(payload: RoundReadyPayload) {
    const match = this.matches.get(payload.matchId);
    const readyAt = payload.readyAt ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
    const round: RoundMetrics = {
      matchId: payload.matchId,
      roundNumber: payload.roundNumber,
      mode: payload.mode,
      difficulty: payload.difficulty,
      bestOf: payload.bestOf,
      playerId: payload.playerId ?? match?.playerId ?? this.scope.playerId,
      profileId: payload.profileId ?? match?.profileId ?? this.scope.profileId,
      readyAt,
      interactions: 0,
      clicks: 0,
    };
    if (this.currentRound?.completedAt != null) {
      round.interRoundDelayMs = readyAt - this.currentRound.completedAt;
    }
    this.currentRound = round;
    if (match) {
      match.rounds.push(round);
      if (match.rounds.length > MAX_ROUND_HISTORY) {
        match.rounds.splice(0, match.rounds.length - MAX_ROUND_HISTORY);
      }
    }
    this.roundHistory.push(round);
    if (this.roundHistory.length > MAX_ROUND_HISTORY) {
      this.roundHistory.splice(0, this.roundHistory.length - MAX_ROUND_HISTORY);
    }
    this.emit();
  }

  moveSelected(payload: MoveSelectedPayload) {
    const round = this.findRound(payload.matchId, payload.roundNumber);
    const match = this.matches.get(payload.matchId);
    const timestamp = payload.at ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (round) {
      round.moveSelectedAt = timestamp;
      if (round.responseTimeMs == null && round.readyAt != null) {
        round.responseTimeMs = Math.max(0, Math.round(timestamp - round.readyAt));
        if (match) {
          match.responseTime.push(round.responseTimeMs);
          if (match.responseTime.length > MAX_ROUND_HISTORY) {
            match.responseTime.splice(0, match.responseTime.length - MAX_ROUND_HISTORY);
          }
        }
      }
    }
    this.emit();
  }

  roundCompleted(payload: RoundCompletedPayload) {
    const round = this.findRound(payload.matchId, payload.roundNumber);
    const match = this.matches.get(payload.matchId);
    const completedAt = payload.completedAt ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (round) {
      round.completedAt = completedAt;
      round.outcome = payload.outcome;
      round.aiStreak = payload.aiStreak;
      round.youStreak = payload.youStreak;
      if (round.responseSpeedMs != null && match) {
        match.responseSpeed.push(round.responseSpeedMs);
        if (match.responseSpeed.length > MAX_ROUND_HISTORY) {
          match.responseSpeed.splice(0, match.responseSpeed.length - MAX_ROUND_HISTORY);
        }
      }
      if (round.moveSelectedAt == null && round.readyAt != null) {
        round.responseTimeMs = Math.max(0, Math.round(completedAt - round.readyAt));
        if (match) {
          match.responseTime.push(round.responseTimeMs);
          if (match.responseTime.length > MAX_ROUND_HISTORY) {
            match.responseTime.splice(0, match.responseTime.length - MAX_ROUND_HISTORY);
          }
        }
      }
    }
    this.roundsSinceSnapshot += 1;
    if (this.roundsSinceSnapshot >= AUTO_SNAPSHOT_ROUND_INTERVAL) {
      this.requestSnapshot("round-interval");
    }
    this.emit();
  }

  trackPromptState(name: string, isOpen: boolean) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const existing = this.promptLog.find(entry => entry.name === name && entry.closedAt == null);
    if (isOpen) {
      if (!existing) {
        this.promptLog.push({ name, openedAt: now });
      }
    } else if (existing) {
      existing.closedAt = now;
      existing.durationMs = now - existing.openedAt;
    }
    if (this.promptLog.length > 40) {
      this.promptLog.splice(0, this.promptLog.length - 40);
    }
    this.emit();
  }

  private findRound(matchId: string, roundNumber: number): RoundMetrics | null {
    if (!matchId) return this.currentRound;
    if (this.currentRound && this.currentRound.matchId === matchId && this.currentRound.roundNumber === roundNumber) {
      return this.currentRound;
    }
    const match = this.matches.get(matchId);
    if (!match) return this.currentRound;
    return match.rounds.find(round => round.roundNumber === roundNumber) ?? null;
  }

  private markInteraction(now: number, isClick: boolean) {
    this.session.totalInteractions += 1;
    if (isClick) {
      this.session.totalClicks += 1;
    }
    if (this.idle) {
      this.idle = false;
      if (this.idleSince != null) {
        const lastGap = this.sessionIdleGaps.find(gap => gap.end == null);
        if (lastGap) {
          lastGap.end = now;
        } else {
          this.sessionIdleGaps.push({ start: this.idleSince, end: now });
        }
        if (this.currentMatchId) {
          const match = this.matches.get(this.currentMatchId);
          if (match) {
            const openGap = match.idleGaps.find(gap => gap.end == null);
            if (openGap) {
              openGap.end = now;
            } else {
              match.idleGaps.push({ start: this.idleSince, end: now });
            }
            match.idleSince = null;
          }
        }
      }
      this.idleSince = null;
    }
    this.lastInteractionAt = now;
    if (this.currentRound) {
      this.currentRound.interactions += 1;
      if (isClick) {
        this.currentRound.clicks += 1;
      }
    }
    if (this.currentMatchId) {
      const match = this.matches.get(this.currentMatchId);
      if (match) {
        match.interactions += 1;
        if (isClick) {
          match.clickCount += 1;
        }
      }
    }
  }

  private handlePointer = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.markInteraction(now, true);
    const { name, id } = describeElement(event.target);
    const grid = gridForPosition(event.clientX, event.clientY);
    const record: ClickRecord = {
      timestamp: now,
      view: this.currentView,
      matchId: this.currentMatchId ?? undefined,
      roundNumber: this.currentRound?.roundNumber,
      mode: this.currentRound?.mode ?? (this.currentMatchId ? this.matches.get(this.currentMatchId)?.mode : undefined),
      difficulty:
        this.currentRound?.difficulty ?? (this.currentMatchId ? this.matches.get(this.currentMatchId)?.difficulty : undefined),
      target: name,
      elementId: id,
      grid,
      x: event.clientX,
      y: event.clientY,
      playerId: this.scope.playerId,
      profileId: this.scope.profileId,
      viewportWidth: typeof window !== "undefined" ? window.innerWidth : undefined,
      viewportHeight: typeof window !== "undefined" ? window.innerHeight : undefined,
    };
    this.clickRecords.push(record);
    if (this.clickRecords.length > MAX_CLICK_HISTORY) {
      this.clickRecords.splice(0, this.clickRecords.length - MAX_CLICK_HISTORY);
    }
    const previousClick = this.clickTimestamps.length ? this.clickTimestamps[this.clickTimestamps.length - 1] : null;
    if (previousClick != null) {
      const interval = now - previousClick;
      this.interClickIntervals.push(interval);
      if (this.interClickIntervals.length > MAX_INTERVAL_HISTORY) {
        this.interClickIntervals.splice(0, this.interClickIntervals.length - MAX_INTERVAL_HISTORY);
      }
    }
    this.clickTimestamps.push(now);
    if (this.clickTimestamps.length > MAX_CLICK_HISTORY) {
      this.clickTimestamps.splice(0, this.clickTimestamps.length - MAX_CLICK_HISTORY);
    }
    this.incrementViewCount(this.currentView);
    if (this.currentRound && this.currentRound.firstInteractionAt == null) {
      this.currentRound.firstInteractionAt = now;
      this.currentRound.responseSpeedMs = Math.max(0, Math.round(now - this.currentRound.readyAt));
    }
    this.emit();
  };

  private handleKey = () => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.markInteraction(now, false);
    if (this.currentRound && this.currentRound.firstInteractionAt == null) {
      this.currentRound.firstInteractionAt = now;
      this.currentRound.responseSpeedMs = Math.max(0, Math.round(now - this.currentRound.readyAt));
    }
    this.emit();
  };

  private requestSnapshot(trigger: SnapshotTrigger, options: { force?: boolean } = {}) {
    if (!this.scope.playerId) return;
    if (!options.force && !instrumentationSnapshots.isAutoCaptureEnabled(this.scope)) {
      return;
    }
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const snapshot = this.getSnapshot();
    const saved = instrumentationSnapshots.saveSnapshot({ ...this.scope }, snapshot, trigger);
    if (saved) {
      this.lastSnapshotAt = now;
      this.roundsSinceSnapshot = 0;
    }
  }

  private handleFocus = () => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.focused = true;
    this.session.focusEvents.push({ type: "focus", at: now });
    if (!this.session.focusEvents.length) {
      this.session.focusEvents.push({ type: "focus", at: now });
    }
    this.emit();
  };

  private handleBlur = () => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.focused = false;
    this.session.focusEvents.push({ type: "blur", at: now });
    this.emit();
  };

  private handleVisibility = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "hidden") {
      this.handleBlur();
    } else {
      this.handleFocus();
    }
  };

  private tickActive = () => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const delta = now - this.session.lastActiveMark;
    this.session.lastActiveMark = now;
    if (!this.focused) {
      return;
    }
    if (now - this.lastInteractionAt <= IDLE_THRESHOLD_MS) {
      this.session.activeMs += delta;
      if (this.currentMatchId) {
        const match = this.matches.get(this.currentMatchId);
        if (match) {
          match.activeMs += delta;
        }
      }
    } else if (!this.idle) {
      this.idle = true;
      this.idleSince = this.lastInteractionAt;
      this.sessionIdleGaps.push({ start: this.lastInteractionAt });
      if (this.currentMatchId) {
        const match = this.matches.get(this.currentMatchId);
        if (match) {
          match.idleSince = this.lastInteractionAt;
          match.idleGaps.push({ start: this.lastInteractionAt });
        }
      }
    }
    if (this.scope.playerId) {
      const last = this.lastSnapshotAt ?? this.session.startedAt;
      if (now - last >= AUTO_SNAPSHOT_INTERVAL_MS) {
        this.requestSnapshot("time-interval");
      }
    }
  };

  private incrementViewCount(view: string) {
    const previous = this.viewClickCounts.get(view) ?? 0;
    this.viewClickCounts.set(view, previous + 1);
  }

  private computeBurstStats(): { peak: number; latest: number } {
    let peak = 0;
    let latest = 0;
    const timestamps = this.clickTimestamps;
    let startIndex = 0;
    for (let i = 0; i < timestamps.length; i += 1) {
      const windowStart = timestamps[i] - BURST_WINDOW_MS;
      while (timestamps[startIndex] < windowStart) {
        startIndex += 1;
      }
      const windowCount = i - startIndex + 1;
      if (windowCount > peak) {
        peak = windowCount;
      }
    }
    const now = timestamps.length ? timestamps[timestamps.length - 1] : null;
    if (now != null) {
      const cutoff = now - BURST_WINDOW_MS;
      latest = timestamps.filter(timestamp => timestamp >= cutoff).length;
    }
    return { peak, latest };
  }

  private computeStreakBreakdown(rounds: RoundMetrics[]): StreakBreakdown {
    const wins: number[] = [];
    const losses: number[] = [];
    const neutral: number[] = [];
    rounds.forEach(round => {
      if (round.responseTimeMs == null) return;
      if ((round.youStreak ?? 0) >= 2) {
        wins.push(round.responseTimeMs);
      } else if ((round.aiStreak ?? 0) >= 2) {
        losses.push(round.responseTimeMs);
      } else {
        neutral.push(round.responseTimeMs);
      }
    });
    return {
      winStreakAvgMs: wins.length ? wins.reduce((acc, value) => acc + value, 0) / wins.length : null,
      lossStreakAvgMs: losses.length ? losses.reduce((acc, value) => acc + value, 0) / losses.length : null,
      neutralAvgMs: neutral.length ? neutral.reduce((acc, value) => acc + value, 0) / neutral.length : null,
    };
  }

  private emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

class NoopInstrumentation {
  subscribe() {
    return () => {};
  }
  getSnapshot(): DevInstrumentationSnapshot | null {
    return null;
  }
  setView() {}
  setScope() {}
  captureSnapshot() {}
  matchStarted() {}
  matchEnded() {}
  roundReady() {}
  moveSelected() {}
  roundCompleted() {}
  trackPromptState() {}
}

export type DevInstrumentationApi = {
  subscribe: (listener: SnapshotListener) => () => void;
  getSnapshot: () => DevInstrumentationSnapshot | null;
  setView: (view: string) => void;
  setScope: (scope: InstrumentationScope) => void;
  captureSnapshot: (trigger?: SnapshotTrigger) => void;
  matchStarted: (payload: MatchStartPayload) => void;
  matchEnded: (payload: MatchEndedPayload) => void;
  roundReady: (payload: RoundReadyPayload) => void;
  moveSelected: (payload: MoveSelectedPayload) => void;
  roundCompleted: (payload: RoundCompletedPayload) => void;
  trackPromptState: (name: string, isOpen: boolean) => void;
};

declare global {
  interface Window {
    __DEV_INSTRUMENTATION__?: DevInstrumentationApi;
  }
}

function createDevInstrumentation(): DevInstrumentationApi {
  if (typeof window === "undefined" || !DEV_MODE_ENABLED) {
    return new NoopInstrumentation() as DevInstrumentationApi;
  }
  if (window.__DEV_INSTRUMENTATION__) {
    return window.__DEV_INSTRUMENTATION__;
  }
  const instance = new DevInstrumentation();
  const api: DevInstrumentationApi = {
    subscribe: listener => instance.subscribe(listener),
    getSnapshot: () => instance.getSnapshot(),
    setView: view => instance.setView(view),
    setScope: scope => instance.setScope(scope),
    captureSnapshot: trigger => instance.captureSnapshot(trigger),
    matchStarted: payload => instance.matchStarted(payload),
    matchEnded: payload => instance.matchEnded(payload),
    roundReady: payload => instance.roundReady(payload),
    moveSelected: payload => instance.moveSelected(payload),
    roundCompleted: payload => instance.roundCompleted(payload),
    trackPromptState: (name, isOpen) => instance.trackPromptState(name, isOpen),
  };
  window.__DEV_INSTRUMENTATION__ = api;
  return api;
}

export const devInstrumentation: DevInstrumentationApi = createDevInstrumentation();

export function useDevInstrumentationSnapshot(): DevInstrumentationSnapshot | null {
  const [snapshot, setSnapshot] = useState<DevInstrumentationSnapshot | null>(devInstrumentation.getSnapshot());
  useEffect(() => {
    const unsubscribe = devInstrumentation.subscribe(setSnapshot);
    return unsubscribe;
  }, []);
  return snapshot;
}

