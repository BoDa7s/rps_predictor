import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useStats, RoundLog } from "./stats";
import { usePlayers, GradeBand } from "./players";
import { AIMode, Mode } from "./gameTypes";
import { computeMatchScore } from "./leaderboard";
import { DEV_MODE_ENABLED } from "./devMode";
import leaderboardBg from "./leaderboard-with-abstract-background/4654059.jpg";

interface LeaderboardModalProps {
  open: boolean;
  onClose: () => void;
}

type LeaderboardTab = "daily" | "weekly" | "all-time" | "personal" | "class";

interface LeaderboardMatchEntry {
  matchId: string;
  matchKey: string;
  playerId: string;
  profileId: string;
  playerName: string;
  gradeBand?: GradeBand;
  score: number;
  streak: number;
  rounds: number;
  mode: Mode;
  difficulty: AIMode;
  endedAt: string;
  endedAtMs: number;
}

interface PersonalBestSummary {
  daily: LeaderboardMatchEntry | null;
  weekly: LeaderboardMatchEntry | null;
  allTime: LeaderboardMatchEntry | null;
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

const DEFAULT_LIMIT = 15;
const CLASS_LIMIT = 25;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const day = start.getDay();
  const diff = (day + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - diff);
  return start;
}

function isWithinRange(timestamp: number, start: Date, end: Date) {
  return timestamp >= start.getTime() && timestamp < end.getTime();
}

function aggregateByPlayer(entries: LeaderboardMatchEntry[]): LeaderboardMatchEntry[] {
  const map = new Map<string, LeaderboardMatchEntry>();
  entries.forEach(entry => {
    const key = `${entry.playerId}|${entry.profileId}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, entry);
      return;
    }
    if (entry.score > existing.score) {
      map.set(key, entry);
      return;
    }
    if (entry.score === existing.score && entry.endedAtMs > existing.endedAtMs) {
      map.set(key, entry);
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.endedAtMs - a.endedAtMs;
  });
}

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
  return value > 0 ? value : "—";
}

const emptyPersonal: PersonalBestSummary = { daily: null, weekly: null, allTime: null };

export default function LeaderboardModal({ open, onClose }: LeaderboardModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const { adminMatches, adminRounds, currentProfile } = useStats();
  const { players, currentPlayer } = usePlayers();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("daily");

  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setActiveTab("daily");
    }
  }, [open]);

  const playersById = useMemo(() => {
    const map = new Map<string, { name: string; grade?: GradeBand; consented: boolean }>();
    players.forEach(player => {
      map.set(player.id, {
        name: player.displayName,
        grade: player.gradeBand,
        consented: Boolean(player.consent?.agreed),
      });
    });
    return map;
  }, [players]);

  const roundsByMatchId = useMemo(() => {
    const map = new Map<string, RoundLog[]>();
    adminRounds.forEach(round => {
      if (!round.matchId) return;
      const existing = map.get(round.matchId);
      if (existing) {
        existing.push(round);
      } else {
        map.set(round.matchId, [round]);
      }
    });
    return map;
  }, [adminRounds]);

  const matchEntries = useMemo<LeaderboardMatchEntry[]>(() => {
    const entries: LeaderboardMatchEntry[] = [];
    adminMatches.forEach(match => {
      if (match.mode !== "challenge" && match.mode !== "practice") return;
      const player = playersById.get(match.playerId);
      if (!player || !player.consented) return;
      const matchKey = match.clientId ?? match.id;
      const rounds = roundsByMatchId.get(matchKey) ?? [];
      if (!rounds.length) return;
      const endedAt = match.endedAt || match.startedAt;
      if (!endedAt) return;
      const endedDate = safeDate(endedAt);
      if (!endedDate) return;
      const computed = match.leaderboardScore != null && match.leaderboardRoundCount != null
        ? null
        : computeMatchScore(rounds);
      const totalScore = match.leaderboardScore ?? computed?.total ?? 0;
      if (totalScore <= 0) return;
      const maxStreak = match.leaderboardMaxStreak ?? computed?.maxStreak ?? 0;
      const roundCount = match.leaderboardRoundCount ?? computed?.rounds ?? rounds.length;
      entries.push({
        matchId: match.id,
        matchKey,
        playerId: match.playerId,
        profileId: match.profileId,
        playerName: player.name,
        gradeBand: player.grade,
        score: totalScore,
        streak: maxStreak,
        rounds: roundCount,
        mode: match.mode,
        difficulty: match.difficulty,
        endedAt,
        endedAtMs: endedDate.getTime(),
      });
    });
    return entries;
  }, [adminMatches, playersById, roundsByMatchId]);

  const { dailyRows, weeklyRows, allTimeRows } = useMemo(() => {
    if (!matchEntries.length) {
      return { dailyRows: [], weeklyRows: [], allTimeRows: [] as LeaderboardMatchEntry[] };
    }
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = addDays(todayStart, 1);
    const weekStart = startOfWeek(now);
    const weekEnd = addDays(weekStart, 7);

    const dailyMatches = matchEntries.filter(entry => isWithinRange(entry.endedAtMs, todayStart, todayEnd));
    const weeklyMatches = matchEntries.filter(entry => isWithinRange(entry.endedAtMs, weekStart, weekEnd));

    return {
      dailyRows: aggregateByPlayer(dailyMatches),
      weeklyRows: aggregateByPlayer(weeklyMatches),
      allTimeRows: aggregateByPlayer(matchEntries),
    };
  }, [matchEntries]);

  const personalBest = useMemo<PersonalBestSummary>(() => {
    if (!currentPlayer) return emptyPersonal;
    const playerId = currentPlayer.id;
    const targetProfileId = currentProfile?.id ?? null;
    const resolveEntry = (rows: LeaderboardMatchEntry[]) => {
      const strict = rows.find(entry => entry.playerId === playerId && (!targetProfileId || entry.profileId === targetProfileId));
      if (strict) return strict;
      return rows.find(entry => entry.playerId === playerId) ?? null;
    };
    return {
      daily: resolveEntry(dailyRows),
      weekly: resolveEntry(weeklyRows),
      allTime: resolveEntry(allTimeRows),
    };
  }, [currentPlayer, currentProfile, dailyRows, weeklyRows, allTimeRows]);

  const classRows = useMemo(() => {
    if (!DEV_MODE_ENABLED) return [] as LeaderboardMatchEntry[];
    return aggregateByPlayer(matchEntries);
  }, [matchEntries]);

  const tabConfig = useMemo(() => {
    const base: { key: LeaderboardTab; label: string }[] = [
      { key: "daily", label: "Daily" },
      { key: "weekly", label: "Weekly" },
      { key: "all-time", label: "All-Time (device)" },
      { key: "personal", label: "Personal Bests" },
    ];
    if (DEV_MODE_ENABLED) {
      base.push({ key: "class", label: "Class / All-Users" });
    }
    return base;
  }, []);

  const activeRows = useMemo(() => {
    switch (activeTab) {
      case "daily":
        return dailyRows;
      case "weekly":
        return weeklyRows;
      case "all-time":
        return allTimeRows;
      case "class":
        return classRows;
      default:
        return [] as LeaderboardMatchEntry[];
    }
  }, [activeTab, dailyRows, weeklyRows, allTimeRows, classRows]);

  const limit = activeTab === "class" ? CLASS_LIMIT : DEFAULT_LIMIT;
  const rowsToDisplay = activeTab === "personal" ? [] : activeRows.slice(0, limit);
  const showEmptyState = activeTab === "personal"
    ? !personalBest.daily && !personalBest.weekly && !personalBest.allTime
    : rowsToDisplay.length === 0;

  if (!open) return null;

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
        className="bg-white rounded-2xl shadow-2xl w-[min(95vw,960px)] max-h-[85vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Leaderboard"
        onClick={event => event.stopPropagation()}
        ref={modalRef}
      >
        <div className="relative h-32 flex items-end">
          <img src={leaderboardBg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-slate-900/55" />
          <div className="relative z-10 w-full flex items-center justify-between px-6 pb-4 text-white">
            <div>
              <h2 className="text-2xl font-bold">Leaderboard</h2>
              <p className="text-sm text-slate-200">Daily, weekly, and all-time scores stay on this device.</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium text-white hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Close ✕
            </button>
          </div>
        </div>
        <div className="px-6 py-4 overflow-auto">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Leaderboard tabs">
            {tabConfig.map((tab, index) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${activeTab === tab.key ? "bg-sky-600 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                data-focus-first={index === 0 ? true : undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab !== "personal" && (
            <div className="mt-4">
              {showEmptyState ? (
                <div className="p-8 text-center text-slate-500">No data yet—play a match!</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-600">Rank</th>
                        <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-600">Player</th>
                        <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-600">Score</th>
                        <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-600">Mode</th>
                        <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-600">Difficulty</th>
                        <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-600">Streak</th>
                        <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rowsToDisplay.map((row, index) => (
                        <tr key={row.matchId} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-semibold text-slate-700">{index + 1}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-800">{row.playerName}</span>
                              {row.gradeBand && (
                                <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
                                  {row.gradeBand}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{row.score.toLocaleString()} pts</td>
                          <td className="px-3 py-2 text-slate-700">{MODE_LABELS[row.mode]}</td>
                          <td className="px-3 py-2 text-slate-700">{DIFFICULTY_LABELS[row.difficulty]}</td>
                          <td className="px-3 py-2 text-slate-700">{formatStreak(row.streak)}</td>
                          <td className="px-3 py-2 text-slate-600">{formatDate(row.endedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "personal" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {([{
                label: "Daily",
                value: personalBest.daily,
              }, {
                label: "Weekly",
                value: personalBest.weekly,
              }, {
                label: "All-Time",
                value: personalBest.allTime,
              }] as const).map(card => (
                <div key={card.label} className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</div>
                  {card.value ? (
                    <div className="mt-2 space-y-1">
                      <div className="text-2xl font-bold text-slate-800">{card.value.score.toLocaleString()} pts</div>
                      <div className="text-sm text-slate-600">{MODE_LABELS[card.value.mode]} • {DIFFICULTY_LABELS[card.value.difficulty]}</div>
                      <div className="text-xs text-slate-500">Longest streak {formatStreak(card.value.streak)} • {formatDate(card.value.endedAt)}</div>
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-slate-500">No record yet—finish a match.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
