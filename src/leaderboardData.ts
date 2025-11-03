import { AIMode, Mode } from "./gameTypes";
import { Grade } from "./players";
import { computeMatchScore } from "./leaderboard";
import { MatchSummary, RoundLog } from "./stats";

export interface LeaderboardPlayerInfo {
  name: string;
  grade?: Grade;
}

export interface LeaderboardMatchEntry {
  matchId: string;
  matchKey: string;
  playerId: string;
  profileId: string;
  playerName: string;
  grade?: Grade;
  score: number;
  streak: number;
  rounds: number;
  mode: Mode;
  difficulty: AIMode;
  endedAt: string;
  endedAtMs: number;
}

const PRACTICE_LEGACY_TYPE = "Practice Legacy" as const;

const DIFFICULTY_RANK: Record<AIMode, number> = {
  fair: 0,
  normal: 1,
  ruthless: 2,
};

export function groupRoundsByMatch(rounds: RoundLog[]): Map<string, RoundLog[]> {
  const map = new Map<string, RoundLog[]>();
  rounds.forEach(round => {
    if (!round.matchId) return;
    const existing = map.get(round.matchId);
    if (existing) {
      existing.push(round);
    } else {
      map.set(round.matchId, [round]);
    }
  });
  return map;
}

function isCandidateBetter(candidate: LeaderboardMatchEntry, current: LeaderboardMatchEntry): boolean {
  if (candidate.score !== current.score) {
    return candidate.score > current.score;
  }
  if (candidate.endedAtMs !== current.endedAtMs) {
    return candidate.endedAtMs > current.endedAtMs;
  }
  const candidateRank = DIFFICULTY_RANK[candidate.difficulty] ?? 0;
  const currentRank = DIFFICULTY_RANK[current.difficulty] ?? 0;
  if (candidateRank !== currentRank) {
    return candidateRank > currentRank;
  }
  const candidateId = candidate.matchId ?? candidate.matchKey;
  const currentId = current.matchId ?? current.matchKey;
  return (candidateId ?? "").localeCompare(currentId ?? "") < 0;
}

export function aggregateLeaderboardEntries(entries: LeaderboardMatchEntry[]): LeaderboardMatchEntry[] {
  const map = new Map<string, LeaderboardMatchEntry>();
  entries.forEach(entry => {
    const key = entry.playerId;
    const existing = map.get(key);
    if (!existing || isCandidateBetter(entry, existing)) {
      map.set(key, entry);
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.endedAtMs !== a.endedAtMs) return b.endedAtMs - a.endedAtMs;
    const rankA = DIFFICULTY_RANK[a.difficulty] ?? 0;
    const rankB = DIFFICULTY_RANK[b.difficulty] ?? 0;
    if (rankB !== rankA) return rankB - rankA;
    const aId = a.matchId ?? a.matchKey;
    const bId = b.matchId ?? b.matchKey;
    return (aId ?? "").localeCompare(bId ?? "");
  });
}

export function findTopLeaderboardEntryForPlayer(
  entries: LeaderboardMatchEntry[],
  playerId?: string | null,
): LeaderboardMatchEntry | null {
  if (!playerId) return null;
  let best: LeaderboardMatchEntry | null = null;
  entries.forEach(entry => {
    if (entry.playerId !== playerId) return;
    if (!best || isCandidateBetter(entry, best)) {
      best = entry;
    }
  });
  return best;
}

function safeDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function collectLeaderboardEntries({
  matches,
  roundsByMatchId,
  playersById,
}: {
  matches: MatchSummary[];
  roundsByMatchId: Map<string, RoundLog[]>;
  playersById?: Map<string, LeaderboardPlayerInfo>;
}): { entries: LeaderboardMatchEntry[]; hasPracticeLegacy: boolean } {
  let hasPracticeLegacy = false;
  const entries: LeaderboardMatchEntry[] = [];
  matches.forEach(match => {
    if (match.mode === "practice" || match.leaderboardType === PRACTICE_LEGACY_TYPE) {
      hasPracticeLegacy = true;
      return;
    }
    if (match.mode !== "challenge") return;
    const playerMeta = playersById?.get(match.playerId);
    if (playersById && !playerMeta) return;
    const matchKey = match.clientId ?? match.id;
    const rounds = matchKey ? roundsByMatchId.get(matchKey) ?? [] : [];
    if (!rounds.length) return;
    const endedAt = match.endedAt || match.startedAt;
    if (!endedAt) return;
    const endedDate = safeDate(endedAt);
    if (!endedDate) return;
    const computed = match.leaderboardScore != null && match.leaderboardRoundCount != null ? null : computeMatchScore(rounds);
    const totalScore = match.leaderboardScore ?? computed?.total ?? 0;
    if (totalScore <= 0) return;
    const maxStreak = match.leaderboardMaxStreak ?? computed?.maxStreak ?? 0;
    const roundCount = match.leaderboardRoundCount ?? computed?.rounds ?? rounds.length;
    entries.push({
      matchId: match.id,
      matchKey: matchKey ?? match.id,
      playerId: match.playerId,
      profileId: match.profileId,
      playerName: playerMeta?.name ?? "",
      grade: playerMeta?.grade,
      score: totalScore,
      streak: maxStreak,
      rounds: roundCount,
      mode: match.mode,
      difficulty: match.difficulty,
      endedAt,
      endedAtMs: endedDate.getTime(),
    });
  });
  return { entries, hasPracticeLegacy };
}
