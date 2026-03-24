import React, { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { useStats } from "./stats";
import { usePlayers } from "./players";
import { AIMode, Mode } from "./gameTypes";
import {
  aggregateLeaderboardEntries,
  collectLeaderboardEntries,
  groupRoundsByMatch,
  type LeaderboardMatchEntry,
  type LeaderboardPlayerInfo,
} from "./leaderboardData";

interface LeaderboardModalProps {
  open?: boolean;
  onClose: () => void;
  mode?: "modal" | "page";
}

const MODE_LABELS: Record<Mode, string> = {
  challenge: "Challenge",
  practice: "Practice",
};

const DIFFICULTY_LABELS: Record<AIMode, string> = {
  fair: "Fair",
  normal: "Normal",
  ruthless: "Ruthless",
};

const DEFAULT_LIMIT = 10;

function safeDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string) {
  const date = safeDate(value);
  if (!date) return value;
  return date.toLocaleString();
}

function formatStreak(value: number) {
  return value > 0 ? value : "-";
}

export default function LeaderboardModal({
  open = true,
  onClose,
  mode = "modal",
}: LeaderboardModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const { adminMatches, adminRounds } = useStats();
  const { players } = usePlayers();
  const isPageMode = mode === "page";

  useEffect(() => {
    if (!open || isPageMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>("[data-focus-first]");
    if (firstFocusable) {
      firstFocusable.focus();
    }
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPageMode, onClose, open]);

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

  const { entries: matchEntries, hasPracticeLegacy } = useMemo(
    () => collectLeaderboardEntries({ matches: adminMatches, roundsByMatchId, playersById }),
    [adminMatches, roundsByMatchId, playersById],
  );

  const allTimeRows = useMemo(() => {
    if (!matchEntries.length) {
      return [] as LeaderboardMatchEntry[];
    }
    return aggregateLeaderboardEntries(matchEntries);
  }, [matchEntries]);

  const rowsToDisplay = useMemo(() => allTimeRows.slice(0, DEFAULT_LIMIT), [allTimeRows]);
  const showEmptyState = rowsToDisplay.length === 0;

  if (!open) return null;

  const body = (
    <>
      <div className={`px-6 py-4 ${isPageMode ? "border-b border-white/10 bg-slate-950 text-white" : "border-b bg-slate-900 text-white"}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Leaderboard</h2>
            <p className={isPageMode ? "text-sm text-slate-300" : "text-sm text-slate-200"}>Best match scores on this device.</p>
          </div>
          {!isPageMode && (
            <button
              onClick={onClose}
              className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              data-dev-label="lb.close"
              data-focus-first
            >
              Close x
            </button>
          )}
        </div>
      </div>
      <div className={`px-6 py-6 overflow-auto ${isPageMode ? "bg-slate-900/85 text-slate-200" : ""}`}>
        {showEmptyState ? (
          <div className={`p-8 text-center ${isPageMode ? "text-slate-400" : "text-slate-500"}`}>No data yet - play a match.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200/20 text-sm">
              <thead className={isPageMode ? "bg-white/5" : "bg-slate-50"}>
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-400">Rank</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-400">Player</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-400">Score</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-400">Mode</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-400">Difficulty</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-400">Streak</th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-400">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/10">
                {rowsToDisplay.map((row, index) => (
                  <tr key={row.matchId} className={isPageMode ? "hover:bg-white/5" : "hover:bg-slate-50"}>
                    <td className={`px-3 py-2 font-semibold ${isPageMode ? "text-white" : "text-slate-700"}`}>{index + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={isPageMode ? "font-medium text-white" : "font-medium text-slate-800"}>{row.playerName}</span>
                        {row.grade && (
                          <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
                            Grade {row.grade === "Not applicable" ? "N/A" : row.grade}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-3 py-2 font-semibold ${isPageMode ? "text-white" : "text-slate-900"}`}>{row.score.toLocaleString()} pts</td>
                    <td className={`px-3 py-2 ${isPageMode ? "text-slate-300" : "text-slate-700"}`}>{MODE_LABELS[row.mode]}</td>
                    <td className={`px-3 py-2 ${isPageMode ? "text-slate-300" : "text-slate-700"}`}>{DIFFICULTY_LABELS[row.difficulty]}</td>
                    <td className={`px-3 py-2 ${isPageMode ? "text-slate-300" : "text-slate-700"}`}>{formatStreak(row.streak)}</td>
                    <td className={`px-3 py-2 ${isPageMode ? "text-slate-400" : "text-slate-600"}`}>{formatDate(row.endedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasPracticeLegacy && (
          <p className={`mt-4 text-xs ${isPageMode ? "text-slate-400" : "text-slate-500"}`}>
            Practice matches are archived as <span className="font-semibold">Practice Legacy</span> and are excluded
            from these rankings.
          </p>
        )}
      </div>
    </>
  );

  if (isPageMode) {
    return <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl">{body}</section>;
  }

  return (
    <motion.div
      className="fixed inset-0 z-[85] grid place-items-center bg-black/40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="flex w-[min(95vw,960px)] max-h-[85vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Leaderboard"
        onClick={event => event.stopPropagation()}
        ref={modalRef}
      >
        {body}
      </motion.div>
    </motion.div>
  );
}
