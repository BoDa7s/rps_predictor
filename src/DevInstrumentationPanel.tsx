import React, { useMemo, useState } from "react";

import { useDevInstrumentationSnapshot } from "./devInstrumentation";
import type { DevInstrumentationSnapshot } from "./devInstrumentation";

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
  if (value == null) return "–";
  return value.toLocaleString();
}

function percent(value: number, total: number): string {
  if (!total) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export function DevInstrumentationPanel(): JSX.Element | null {
  const snapshot = useDevInstrumentationSnapshot();
  const [collapsed, setCollapsed] = useState(false);

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();

  type MemoData = {
    sessionAge: number;
    idleTotal: number;
    viewClicks: Array<[string, number]>;
    recentRounds: DevInstrumentationSnapshot["recentRounds"];
    topElements: DevInstrumentationSnapshot["clickHeatmap"]["topElements"];
    gridCells: Array<[string, number]>;
    prompts: DevInstrumentationSnapshot["promptHistory"];
  };

  const { sessionAge, idleTotal, viewClicks, recentRounds, topElements, gridCells, prompts } = useMemo<MemoData>(() => {
    if (!snapshot) {
      return {
        sessionAge: 0,
        idleTotal: 0,
        viewClicks: [],
        recentRounds: [],
        topElements: [],
        gridCells: [],
        prompts: [],
      };
    }
    const age = now - snapshot.session.startedAt;
    const idleSum = snapshot.session.idleGaps.reduce((total, gap) => {
      const end = gap.end ?? now;
      return total + Math.max(0, end - gap.start);
    }, 0);
    const viewList = Object.entries(snapshot.session.viewClickCounts).sort((a, b) => b[1] - a[1]);
    const gridEntries = Object.entries(snapshot.clickHeatmap.grid).sort((a, b) => b[1] - a[1]);
    return {
      sessionAge: age,
      idleTotal: idleSum,
      viewClicks: viewList,
      recentRounds: snapshot.recentRounds,
      topElements: snapshot.clickHeatmap.topElements,
      gridCells: gridEntries,
      prompts: snapshot.promptHistory,
    };
  }, [snapshot, now]);

  if (!snapshot) return null;

  const match = snapshot.currentMatch;
  const matchDuration = match ? (match.endedAt ?? now) - match.startedAt : null;
  const matchIdle = match
    ? match.idleGaps.reduce((total, gap) => {
        const end = gap.end ?? now;
        return total + Math.max(0, end - gap.start);
      }, 0)
    : null;
  const matchActiveRatio = match && matchDuration && matchDuration > 0 ? match.activeMs / matchDuration : null;

  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-[70] w-[360px] max-w-[92vw] text-xs text-slate-700">
      <div className="overflow-hidden rounded-2xl bg-white/95 shadow-xl ring-1 ring-slate-200 backdrop-blur">
        <button
          type="button"
          className="flex w-full items-center justify-between bg-slate-900/90 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-white"
          onClick={() => setCollapsed(prev => !prev)}
        >
          <span>Dev Metrics</span>
          <span>{collapsed ? "Show" : "Hide"}</span>
        </button>
        {!collapsed && (
          <div className="space-y-4 px-4 pb-4 pt-3">
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Response Speed</h3>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                <Stat label="Median" value={formatMs(snapshot.session.responseSpeed.median)} />
                <Stat label="P90" value={formatMs(snapshot.session.responseSpeed.p90)} />
                <Stat label="Rounds" value={formatCount(snapshot.session.responseSpeed.count)} />
                <Stat label="Latest" value={formatMs(snapshot.session.responseSpeed.latest)} />
              </div>
              {match && (
                <div className="mt-2 rounded-lg bg-slate-100/80 p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current match</p>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                    <Stat label="Median" value={formatMs(match.responseSpeed.median)} />
                    <Stat label="P90" value={formatMs(match.responseSpeed.p90)} />
                    <Stat label="Rounds" value={formatCount(match.responseSpeed.count)} />
                    <Stat label="Latest" value={formatMs(match.responseSpeed.latest)} />
                  </div>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Response Time</h3>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                <Stat label="Median" value={formatMs(snapshot.session.responseTime.median)} />
                <Stat label="P90" value={formatMs(snapshot.session.responseTime.p90)} />
                <Stat label="Rounds" value={formatCount(snapshot.session.responseTime.count)} />
                <Stat label="Latest" value={formatMs(snapshot.session.responseTime.latest)} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
                <div>
                  <p className="font-semibold text-slate-500">Rolling 20</p>
                  <p>{formatMs(snapshot.rollingResponseTime.average, { decimals: 1 })}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500">Trend count</p>
                  <p>{formatCount(snapshot.rollingResponseTime.count)}</p>
                </div>
              </div>
              {match && (
                <div className="mt-2 rounded-lg bg-slate-100/80 p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Streak insights</p>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                    <Stat label="On win streak" value={formatMs(match.streaks.winStreakAvgMs, { decimals: 1 })} />
                    <Stat label="On loss streak" value={formatMs(match.streaks.lossStreakAvgMs, { decimals: 1 })} />
                    <Stat label="Neutral" value={formatMs(match.streaks.neutralAvgMs, { decimals: 1 })} />
                  </div>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Engagement</h3>
              <div className="mt-2 space-y-1">
                <p>Session age: <strong>{formatDuration(sessionAge)}</strong></p>
                <p>Active (focused & engaged): <strong>{formatDuration(snapshot.session.activeMs)}</strong></p>
                <p>Idle gaps: <strong>{formatCount(snapshot.session.idleGaps.length)}</strong> ({formatDuration(idleTotal)})</p>
                <p>Focus events: <strong>{formatCount(snapshot.session.focusEvents.length)}</strong></p>
                <p>Current view: <strong>{snapshot.session.currentView}</strong></p>
                {match && (
                  <div className="rounded-lg bg-slate-100/80 p-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Match</p>
                    <p>
                      Mode: <strong>{match.mode}</strong> · Difficulty: <strong className="capitalize">{match.difficulty}</strong> · Best of {match.bestOf}
                    </p>
                    <p>Active time: <strong>{formatDuration(match.activeMs)}</strong></p>
                    <p>Total time: <strong>{formatDuration(matchDuration)}</strong></p>
                    <p>Engagement ratio: <strong>{matchActiveRatio != null ? `${(matchActiveRatio * 100).toFixed(1)}%` : "–"}</strong></p>
                    <p>Rounds played: <strong>{formatCount(match.roundsPlayed)}</strong></p>
                    <p>Clicks: <strong>{formatCount(match.clickCount)}</strong> · Interactions {formatCount(match.interactions)}</p>
                    <p>Idle gaps: <strong>{formatCount(match.idleGaps.length)}</strong> ({formatDuration(matchIdle)})</p>
                  </div>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Click Activity</h3>
              <div className="mt-2 space-y-1">
                <p>Total clicks: <strong>{formatCount(snapshot.session.totalClicks)}</strong></p>
                <p>Total interactions: <strong>{formatCount(snapshot.session.totalInteractions)}</strong></p>
                <p>Top views:</p>
                <ul className="ml-3 list-disc space-y-1">
                  {viewClicks.slice(0, 4).map(([view, count]) => (
                    <li key={view}>
                      <span className="font-medium">{view}</span> · {formatCount(count)} ({percent(count, snapshot.session.totalClicks)})
                    </li>
                  ))}
                  {!viewClicks.length && <li>No views recorded yet.</li>}
                </ul>
                <p className="mt-2">Top elements:</p>
                <ul className="ml-3 list-disc space-y-1">
                  {topElements.map(item => (
                    <li key={item.key}>
                      <span className="font-medium">{item.key}</span> · {formatCount(item.count)}
                    </li>
                  ))}
                  {!topElements.length && <li>No click data yet.</li>}
                </ul>
                <p className="mt-2">Heatmap grid (3×3):</p>
                <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                  {[0, 1, 2].map(row =>
                    [0, 1, 2].map(col => {
                      const key = `${col},${row}`;
                      const entry = gridCells.find(cell => cell[0] === key);
                      return (
                        <div key={key} className="rounded bg-slate-100 py-1">
                          {key}: {formatCount(entry ? entry[1] : 0)}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Click Speed</h3>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                <Stat label="Avg interval" value={formatMs(snapshot.clickSpeed.averageIntervalMs, { decimals: 1 })} />
                <Stat label="Median interval" value={formatMs(snapshot.clickSpeed.medianIntervalMs, { decimals: 1 })} />
                <Stat label="Last interval" value={formatMs(snapshot.clickSpeed.lastIntervalMs, { decimals: 1 })} />
                <Stat label="Peak burst (10s)" value={formatCount(snapshot.clickSpeed.peakBurstPer10s)} />
                <Stat label="Latest burst" value={formatCount(snapshot.clickSpeed.latestBurstPer10s)} />
              </div>
            </section>

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recent Rounds</h3>
              <div className="mt-2 space-y-1">
                {recentRounds.length ? (
                  recentRounds.map(round => (
                    <div key={`${round.matchId}:${round.roundNumber}`} className="rounded-lg border border-slate-200 p-2">
                      <p className="font-semibold text-slate-600">
                        Match {round.matchId.slice(-4)} · Round {round.roundNumber}
                      </p>
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                        <Stat label="Speed" value={formatMs(round.responseSpeedMs ?? null)} />
                        <Stat label="Time" value={formatMs(round.responseTimeMs ?? null)} />
                        <Stat label="Clicks" value={formatCount(round.clicks)} />
                        <Stat label="Interactions" value={formatCount(round.interactions)} />
                        <Stat label="Outcome" value={round.outcome ?? "?"} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p>No rounds logged yet.</p>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Guidance & Prompts</h3>
              <div className="mt-2 space-y-1">
                {prompts.length ? (
                  prompts.map(prompt => (
                    <div key={`${prompt.name}-${prompt.openedAt}`} className="rounded-lg border border-slate-200 p-2">
                      <p className="font-semibold text-slate-600">{prompt.name}</p>
                      <p>Opened at +{formatDuration(prompt.openedAt)}</p>
                      {prompt.closedAt ? (
                        <p>Dismissed after {formatDuration(prompt.durationMs ?? 0)}</p>
                      ) : (
                        <p className="text-amber-600">Active for {formatDuration(now - prompt.openedAt)}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p>No prompt interactions yet.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  );
}

export default DevInstrumentationPanel;
