import React, { useMemo } from "react";
import { AIMode, Mode } from "../../gameTypes";
import {
  aggregateLeaderboardEntries,
  collectLeaderboardEntries,
  findTopLeaderboardEntryForPlayer,
  groupRoundsByMatch,
  type LeaderboardPlayerInfo,
} from "../../leaderboardData";
import { usePlayers } from "../../players";
import { useStats } from "../../stats";

const MODE_LABELS: Record<Mode, string> = {
  challenge: "Challenge",
  practice: "Practice",
};

const DIFFICULTY_LABELS: Record<AIMode, string> = {
  fair: "Fair",
  normal: "Normal",
  ruthless: "Ruthless",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function LeaderboardPage() {
  const { players, currentPlayer } = usePlayers();
  const { adminMatches, adminRounds } = useStats();

  const playersById = useMemo(() => {
    const map = new Map<string, LeaderboardPlayerInfo>();
    players.forEach(player => {
      map.set(player.id, {
        name: player.playerName,
        grade: player.grade,
      });
    });
    return map;
  }, [players]);

  const roundsByMatchId = useMemo(() => groupRoundsByMatch(adminRounds), [adminRounds]);

  const { entries, hasPracticeLegacy } = useMemo(
    () => collectLeaderboardEntries({ matches: adminMatches, roundsByMatchId, playersById }),
    [adminMatches, playersById, roundsByMatchId],
  );

  const rows = useMemo(() => aggregateLeaderboardEntries(entries), [entries]);
  const activePlayerBest = useMemo(
    () => findTopLeaderboardEntryForPlayer(rows, currentPlayer?.id),
    [currentPlayer?.id, rows],
  );

  const highestScore = rows[0]?.score ?? null;
  const totalRankedPlayers = rows.length;
  const totalChallengeRuns = entries.length;

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/75">Highest Score</p>
          <div className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white">
            {highestScore ? `${highestScore.toLocaleString()} pts` : "No scores yet"}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">Best recorded challenge score saved on this device.</p>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/75">Your Best</p>
          <div className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white">
            {activePlayerBest ? `${activePlayerBest.score.toLocaleString()} pts` : "Unranked"}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            {currentPlayer ? `Top challenge run for ${currentPlayer.playerName}.` : "Select a player in Settings to see a personal best."}
          </p>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/75">Ranked Sessions</p>
          <div className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white">{totalChallengeRuns}</div>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            {totalRankedPlayers} ranked player{totalRankedPlayers === 1 ? "" : "s"} with challenge data available.
          </p>
        </article>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 sm:p-6">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center text-sm text-slate-400">
            No leaderboard data yet. Finish a challenge match on <code>/play</code> to populate this page.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                  <th className="px-3 py-3">Rank</th>
                  <th className="px-3 py-3">Player</th>
                  <th className="px-3 py-3">Score</th>
                  <th className="px-3 py-3">Mode</th>
                  <th className="px-3 py-3">Difficulty</th>
                  <th className="px-3 py-3">Streak</th>
                  <th className="px-3 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.matchId} className="border-b border-white/5 text-slate-300 last:border-b-0">
                    <td className="px-3 py-4 font-semibold text-white">{index + 1}</td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white">{row.playerName}</span>
                        {row.grade && (
                          <span className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
                            Grade {row.grade === "Not applicable" ? "N/A" : row.grade}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-4 font-semibold text-white">{row.score.toLocaleString()} pts</td>
                    <td className="px-3 py-4">{MODE_LABELS[row.mode]}</td>
                    <td className="px-3 py-4">{DIFFICULTY_LABELS[row.difficulty]}</td>
                    <td className="px-3 py-4">{row.streak > 0 ? row.streak : "-"}</td>
                    <td className="px-3 py-4 text-slate-400">{formatDate(row.endedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasPracticeLegacy && (
          <p className="mt-4 text-xs text-slate-400">
            Practice runs are archived as Practice Legacy and excluded from these rankings.
          </p>
        )}
      </section>
    </div>
  );
}
