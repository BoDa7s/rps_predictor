import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEV_MODE_ENABLED, DEV_MODE_SECURE } from "./devMode";
import { usePlayers } from "./players";
import type { PlayerProfile } from "./players";
import { useStats } from "./stats";
import type { MatchSummary, RoundLog, StatsProfile } from "./stats";
import type { AIMode, Mode } from "./gameTypes";
import { MatchTimings, MATCH_TIMING_DEFAULTS, normalizeMatchTimings } from "./matchTimings";
import { useDevInstrumentationSnapshot } from "./devInstrumentation";
import {
  instrumentationSnapshots,
  makeScope as makeInstrumentationScope,
  useAutoCapture,
} from "./instrumentationSnapshots";
import InstrumentationTab from "./InstrumentationTab";
import {
  appendAuditEntry,
  AuditEntry,
  isUnlocked,
  loadAuditLog,
  loadDatasetSnapshot,
  saveDatasetSnapshot,
  subscribeSecure,
  unlockWithPin,
} from "./secureStore";

function cloneTimings(value: MatchTimings): MatchTimings {
  return {
    challenge: { ...value.challenge },
    practice: { ...value.practice },
  };
}

interface DeveloperConsoleProps {
  open: boolean;
  onClose: () => void;
  timings: MatchTimings;
  onTimingsUpdate: (timings: MatchTimings, options?: { persist?: boolean; clearSaved?: boolean }) => void;
  onTimingsReset: () => void;
}

const TAB_OPTIONS = ["overview", "data", "instrumentation", "timers", "audit"] as const;
type TabKey = typeof TAB_OPTIONS[number];
type TimingField = keyof MatchTimings["challenge"];

function countTimingDifferences(base: MatchTimings, compare: MatchTimings): number {
  let changes = 0;
  (["challenge", "practice"] as const).forEach(mode => {
    (Object.keys(base[mode]) as TimingField[]).forEach(field => {
      if (base[mode][field] !== compare[mode][field]) {
        changes += 1;
      }
    });
  });
  return changes;
}

interface ControlFilters {
  playerId: string | null;
  profileId: string | null;
  mode: Mode | "";
  difficulty: AIMode | "";
  dateRange: {
    start: string | null;
    end: string | null;
  };
}

interface MatchSearchFilters {
  player: string;
  profile: string;
  mode: string;
}

interface RoundSearchFilters {
  player: string;
  mode: string;
}

const MODE_OPTIONS: Mode[] = ["practice", "challenge"];
const DIFFICULTY_OPTIONS: AIMode[] = ["fair", "normal", "ruthless"];
const FILTER_DEFAULTS: ControlFilters = {
  playerId: null,
  profileId: null,
  mode: "",
  difficulty: "",
  dateRange: { start: null, end: null },
};

interface PlayerSummaryData {
  player: PlayerProfile;
  profiles: number;
  matches: number;
  rounds: number;
  lastPlayed: string | null;
  lastPlayedMs: number;
}

interface ProfileSummaryData {
  profile: StatsProfile;
  matches: number;
  rounds: number;
  wins: number;
  winRate: number | null;
  longestStreak: number;
  modeCounts: Record<Mode, number>;
}

export function DeveloperConsole({ open, onClose, timings, onTimingsUpdate, onTimingsReset }: DeveloperConsoleProps) {
  const { players, updatePlayer, deletePlayer, setCurrentPlayer, currentPlayerId } = usePlayers();
  const {
    adminRounds,
    adminMatches,
    adminProfiles,
    selectProfile,
    createProfile,
    updateProfile,
    adminUpdateRound,
    adminDeleteRound,
    adminUpdateMatch,
    adminDeleteMatch,
    currentProfileId,
    currentProfile,
  } = useStats();
  const [tab, setTab] = useState<TabKey>("data");
  const [pin, setPin] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [ready, setReady] = useState(() => (typeof window === "undefined" ? false : isUnlocked()));
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<string | null>(null);
  const [timingDraft, setTimingDraft] = useState<MatchTimings>(() => cloneTimings(timings));
  const [makeDefault, setMakeDefault] = useState(false);
  const [filters, setFilters] = useState<ControlFilters>(() => ({
    playerId: null,
    profileId: null,
    mode: "",
    difficulty: "",
    dateRange: { start: null, end: null },
  }));
  const [instrumentationSource, setInstrumentationSource] = useState<"selected" | "active">("selected");
  const [instrumentationView, setInstrumentationView] = useState<"live" | "history">("live");
  const [liveStatus, setLiveStatus] = useState<{ running: boolean; label: string | null }>({
    running: false,
    label: null,
  });
  const [matchSearch, setMatchSearch] = useState<MatchSearchFilters>({ player: "", profile: "", mode: "" });
  const [roundSearch, setRoundSearch] = useState<RoundSearchFilters>({ player: "", mode: "" });
  const [focusedMatchId, setFocusedMatchId] = useState<string | null>(null);
  const [focusedRoundId, setFocusedRoundId] = useState<string | null>(null);
  const [roundMatchFilter, setRoundMatchFilter] = useState<string | null>(null);
  const [auditActionFilter, setAuditActionFilter] = useState<string>("all");
  const [overrideState, setOverrideState] = useState<
    | {
        origin: { playerId: string | null; profileId: string | null };
        active: { playerId: string; profileId: string | null };
      }
    | null
  >(null);
  const [pendingProfileSelection, setPendingProfileSelection] = useState<string | null>(null);
  const [jumpDialogOpen, setJumpDialogOpen] = useState(false);
  const [jumpSelection, setJumpSelection] = useState<{ playerId: string | null; profileId: string | null }>(
    () => ({ playerId: null, profileId: null })
  );
  const [timingConfirmOpen, setTimingConfirmOpen] = useState(false);
  const [timingConfirmAction, setTimingConfirmAction] = useState<"save" | "revert" | "restore" | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const hashInitialized = useRef(false);
  const timerFields = useMemo(
    () => [
      { key: "countdownTickMs" as TimingField, label: "Countdown tick (ms)", helper: "Delay between countdown numbers." },
      { key: "revealHoldMs" as TimingField, label: "AI reveal hold (ms)", helper: "Pause between reveal and score resolution." },
      { key: "resultBannerMs" as TimingField, label: "Result banner (ms)", helper: "Hold duration before the next round begins." },
      {
        key: "robotRoundReactionMs" as TimingField,
        label: "Robot round reaction (ms)",
        helper: "How long the robot displays round reactions before resting.",
      },
      {
        key: "robotRoundRestMs" as TimingField,
        label: "Robot round rest (ms)",
        helper: "Cooldown duration for the robot after a round reaction.",
      },
      {
        key: "robotResultReactionMs" as TimingField,
        label: "Robot result reaction (ms)",
        helper: "Duration of robot reactions to match results.",
      },
      {
        key: "robotResultRestMs" as TimingField,
        label: "Robot result rest (ms)",
        helper: "Rest period after match result reactions.",
      },
    ],
    []
  );

  useEffect(() => {
    if (!open) return;
    const unsubscribe = subscribeSecure(() => {
      const unlocked = isUnlocked();
      setReady(unlocked);
      if (unlocked) {
        loadAuditLog().then(setAuditLogs).catch(() => setAuditLogs([]));
        if (DEV_MODE_SECURE) {
          loadDatasetSnapshot<{ savedAt?: string }>({ savedAt: undefined })
            .then(data => {
              if (data?.savedAt) setSnapshotSavedAt(data.savedAt);
            })
            .catch(() => setSnapshotSavedAt(null));
        } else {
          setSnapshotSavedAt(null);
        }
      }
    });
    if (isUnlocked()) {
      loadAuditLog().then(setAuditLogs).catch(() => setAuditLogs([]));
      if (DEV_MODE_SECURE) {
        loadDatasetSnapshot<{ savedAt?: string }>({ savedAt: undefined })
          .then(data => {
            if (data?.savedAt) setSnapshotSavedAt(data.savedAt);
          })
          .catch(() => setSnapshotSavedAt(null));
      } else {
        setSnapshotSavedAt(null);
      }
    }
    return unsubscribe;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTimingDraft(cloneTimings(timings));
    setMakeDefault(false);
  }, [timings, open]);

  useEffect(() => {
    if (!toastMessage) return;
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!open || !ready || !DEV_MODE_SECURE) return;
    const payload = {
      savedAt: new Date().toISOString(),
      players,
      rounds: adminRounds,
      matches: adminMatches,
      profiles: adminProfiles,
    };
    saveDatasetSnapshot(payload)
      .then(() => setSnapshotSavedAt(payload.savedAt))
      .catch(err => console.error("Failed to persist developer snapshot", err));
  }, [open, ready, players, adminRounds, adminMatches, adminProfiles]);

  const overview = useMemo(() => {
    const totalRounds = adminRounds.length;
    const totalMatches = adminMatches.length;
    const byPlayer = new Map<string, { name: string; rounds: number; matches: number }>();
    adminRounds.forEach(r => {
      const ref = byPlayer.get(r.playerId) || { name: r.playerId, rounds: 0, matches: 0 };
      ref.rounds += 1;
      byPlayer.set(r.playerId, ref);
    });
    adminMatches.forEach(m => {
      const ref = byPlayer.get(m.playerId) || { name: m.playerId, rounds: 0, matches: 0 };
      ref.name = players.find(p => p.id === m.playerId)?.playerName || ref.name;
      ref.matches += 1;
      byPlayer.set(m.playerId, ref);
    });
    players.forEach(p => {
      const ref = byPlayer.get(p.id) || { name: p.playerName, rounds: 0, matches: 0 };
      ref.name = p.playerName;
      byPlayer.set(p.id, ref);
    });
    const distribution = Array.from(byPlayer.entries()).map(([playerId, stats]) => ({
      playerId,
      ...stats,
    }));
    return { totalRounds, totalMatches, distribution };
  }, [adminMatches, adminRounds, players]);

  const playerMap = useMemo(() => new Map(players.map(player => [player.id, player])), [players]);
  const profileMap = useMemo(() => new Map(adminProfiles.map(profile => [profile.id, profile])), [adminProfiles]);
  const matchMap = useMemo(() => new Map(adminMatches.map(match => [match.id, match])), [adminMatches]);
  const roundMap = useMemo(() => new Map(adminRounds.map(round => [round.id, round])), [adminRounds]);

  const playerSummaries = useMemo<PlayerSummaryData[]>(
    () =>
      players
        .map(player => {
          const relatedProfiles = adminProfiles.filter(profile => profile.playerId === player.id);
          const relatedMatches = adminMatches.filter(match => match.playerId === player.id);
          const relatedRounds = adminRounds.filter(round => round.playerId === player.id);
          let lastPlayed: string | null = null;
          let lastPlayedMs = Number.NEGATIVE_INFINITY;
          relatedMatches.forEach(match => {
            const stamp = Date.parse(match.endedAt || match.startedAt || "");
            if (Number.isFinite(stamp) && stamp > lastPlayedMs) {
              lastPlayedMs = stamp;
              lastPlayed = match.endedAt || match.startedAt;
            }
          });
          relatedRounds.forEach(round => {
            const stamp = Date.parse(round.t || "");
            if (Number.isFinite(stamp) && stamp > lastPlayedMs) {
              lastPlayedMs = stamp;
              lastPlayed = round.t;
            }
          });
          const summary: PlayerSummaryData = {
            player,
            profiles: relatedProfiles.length,
            matches: relatedMatches.length,
            rounds: relatedRounds.length,
            lastPlayed,
            lastPlayedMs: Number.isFinite(lastPlayedMs) ? lastPlayedMs : Number.NEGATIVE_INFINITY,
          };
          return summary;
        })
        .sort((a, b) => {
          if (a.lastPlayedMs === b.lastPlayedMs) {
            return a.player.playerName.localeCompare(b.player.playerName);
          }
          return (b.lastPlayedMs || 0) - (a.lastPlayedMs || 0);
        }) as PlayerSummaryData[],
    [players, adminProfiles, adminMatches, adminRounds]
  );

  const profileSummaries = useMemo<ProfileSummaryData[]>(() => {
    return adminProfiles.map(profile => {
      const relatedMatches = adminMatches.filter(match => match.profileId === profile.id);
      const relatedRounds = adminRounds.filter(round => round.profileId === profile.id);
      const wins = relatedRounds.filter(round => round.outcome === "win").length;
      const totalRounds = relatedRounds.length;
      const longestStreak = relatedRounds.reduce((max, round) => Math.max(max, round.streakYou ?? 0), 0);
      const modeCounts = relatedMatches.reduce(
        (acc, match) => {
          acc[match.mode] = (acc[match.mode] ?? 0) + 1;
          return acc;
        },
        {} as Record<Mode, number>
      );
      const summary: ProfileSummaryData = {
        profile,
        matches: relatedMatches.length,
        rounds: relatedRounds.length,
        wins,
        winRate: totalRounds > 0 ? wins / totalRounds : null,
        longestStreak,
        modeCounts,
      };
      return summary;
    });
  }, [adminProfiles, adminMatches, adminRounds]);

  const profileSummaryMap = useMemo(() => new Map(profileSummaries.map(item => [item.profile.id, item])), [profileSummaries]);

  const selectedPlayer = filters.playerId ? playerMap.get(filters.playerId) ?? null : null;
  const selectedProfile = filters.profileId ? profileMap.get(filters.profileId) ?? null : null;
  const selectedPlayerSummary = selectedPlayer
    ? playerSummaries.find(summary => summary.player.id === selectedPlayer.id) ?? null
    : null;
  const selectedProfileSummary = selectedProfile ? profileSummaryMap.get(selectedProfile.id) ?? null : null;
  const instrumentationSnapshot = useDevInstrumentationSnapshot();
  const instrumentationScope = useMemo(
    () =>
      filters.playerId
        ? makeInstrumentationScope(
            filters.playerId,
            filters.profileId ?? null,
            selectedPlayer?.playerName ?? null,
            selectedProfile?.name ?? null,
          )
        : null,
    [filters.playerId, filters.profileId, selectedPlayer?.playerName, selectedProfile?.name],
  );
  const autoCaptureEnabled = useAutoCapture(instrumentationScope);
  const handleLiveStatusChange = useCallback((status: { running: boolean; label: string | null }) => {
    setLiveStatus(status);
  }, []);
  const handleToggleAutoCapture = useCallback(
    (next: boolean) => {
      if (!instrumentationScope) return;
      instrumentationSnapshots.setAutoCaptureEnabled(instrumentationScope, next);
    },
    [instrumentationScope],
  );
  const jumpProfileOptions = useMemo(() => {
    if (!jumpSelection.playerId) return [] as StatsProfile[];
    return adminProfiles.filter(profile => profile.playerId === jumpSelection.playerId);
  }, [jumpSelection.playerId, adminProfiles]);
  const overrideDisplay = useMemo(() => {
    if (!overrideState) return null;
    const playerName = playerMap.get(overrideState.active.playerId)?.playerName ?? "Unknown player";
    const profileLabel = overrideState.active.profileId
      ? profileMap.get(overrideState.active.profileId)?.name ?? overrideState.active.profileId
      : "Default profile";
    return `${playerName} • ${profileLabel}`;
  }, [overrideState, playerMap, profileMap]);
  const normalizedActiveTimings = useMemo(() => normalizeMatchTimings(timings), [timings]);
  const normalizedTimingDraft = useMemo(() => normalizeMatchTimings(timingDraft), [timingDraft]);
  const timingChangesCount = useMemo(
    () => countTimingDifferences(normalizedActiveTimings, normalizedTimingDraft),
    [normalizedActiveTimings, normalizedTimingDraft]
  );
  const hasTimingChanges = timingChangesCount > 0;
  const timingSummaryLine = `${timingChangesCount} change${timingChangesCount === 1 ? "" : "s"}`;
  const hasOverride = Boolean(overrideState);
  const jumpSelectedPlayerName = jumpSelection.playerId
    ? playerMap.get(jumpSelection.playerId)?.playerName ?? "Unknown player"
    : null;
  const jumpSelectedProfileName = jumpSelection.playerId
    ? jumpSelection.profileId
      ? profileMap.get(jumpSelection.profileId)?.name ?? "Unknown profile"
      : "Default profile"
    : null;
  const timingConfirmTitle =
    timingConfirmAction === "save"
      ? "Apply timer changes?"
      : timingConfirmAction === "revert"
      ? "Revert changes?"
      : timingConfirmAction === "restore"
      ? "Restore defaults?"
      : "";
  const timingConfirmBody =
    timingConfirmAction === "save"
      ? `You’re about to update timings for this session.${
          makeDefault ? " These values will also become the default for future sessions." : ""
        }`
      : timingConfirmAction === "revert"
      ? "This will discard the pending edits and restore the active timings."
      : timingConfirmAction === "restore"
      ? "This will replace the current timings with the baseline defaults."
      : "";
  const timingConfirmDisabled = timingConfirmAction === "save" && !hasTimingChanges;

  useEffect(() => {
    if (!ready) return;
    if (!pendingProfileSelection) return;
    const profile = profileMap.get(pendingProfileSelection);
    if (!profile) {
      setPendingProfileSelection(null);
      return;
    }
    if (profile.playerId !== currentPlayerId) return;
    selectProfile(pendingProfileSelection);
    setPendingProfileSelection(null);
  }, [pendingProfileSelection, profileMap, currentPlayerId, selectProfile, ready]);

  const profilesForList = useMemo(() => {
    const scopedProfiles = filters.playerId
      ? adminProfiles.filter(profile => profile.playerId === filters.playerId)
      : adminProfiles;
    return scopedProfiles.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [adminProfiles, filters.playerId]);

  const filteredMatches = useMemo(() => {
    const { playerId, profileId, mode, difficulty, dateRange } = filters;
    const playerTerm = matchSearch.player.trim().toLowerCase();
    const profileTerm = matchSearch.profile.trim().toLowerCase();
    const modeTerm = matchSearch.mode.trim().toLowerCase();
    const startMs = dateRange.start ? Date.parse(`${dateRange.start}T00:00:00.000Z`) : null;
    const endMs = dateRange.end ? Date.parse(`${dateRange.end}T23:59:59.999Z`) : null;

    return adminMatches
      .filter(match => {
        if (playerId && match.playerId !== playerId) return false;
        if (profileId && match.profileId !== profileId) return false;
        if (mode && match.mode !== mode) return false;
        if (difficulty && match.difficulty !== difficulty) return false;

        const matchStamp = Date.parse(match.startedAt || match.endedAt || "");
        if (startMs !== null && (!Number.isFinite(matchStamp) || matchStamp < startMs)) return false;
        if (endMs !== null && (!Number.isFinite(matchStamp) || matchStamp > endMs)) return false;

        const playerName = playerMap.get(match.playerId)?.playerName?.toLowerCase() ?? "";
        if (playerTerm && !playerName.includes(playerTerm)) return false;

        const profileName = profileMap.get(match.profileId)?.name?.toLowerCase() ?? "";
        if (profileTerm && !profileName.includes(profileTerm)) return false;

        if (modeTerm && !match.mode.toLowerCase().includes(modeTerm)) return false;

        return true;
      })
      .sort((a, b) => {
        const stampA = Date.parse(a.startedAt || a.endedAt || "");
        const stampB = Date.parse(b.startedAt || b.endedAt || "");
        const normalizedA = Number.isFinite(stampA) ? stampA : 0;
        const normalizedB = Number.isFinite(stampB) ? stampB : 0;
        return normalizedB - normalizedA;
      });
  }, [adminMatches, filters, matchSearch, playerMap, profileMap]);

  const filteredRounds = useMemo(() => {
    const { playerId, profileId, mode, difficulty, dateRange } = filters;
    const playerTerm = roundSearch.player.trim().toLowerCase();
    const modeTerm = roundSearch.mode.trim().toLowerCase();
    const startMs = dateRange.start ? Date.parse(`${dateRange.start}T00:00:00.000Z`) : null;
    const endMs = dateRange.end ? Date.parse(`${dateRange.end}T23:59:59.999Z`) : null;

    return adminRounds
      .filter(round => {
        if (playerId && round.playerId !== playerId) return false;
        if (profileId && round.profileId !== profileId) return false;
        if (mode && round.mode !== mode) return false;
        if (difficulty && round.difficulty !== difficulty) return false;
        if (roundMatchFilter && round.matchId !== roundMatchFilter) return false;

        const roundStamp = Date.parse(round.t || "");
        if (startMs !== null && (!Number.isFinite(roundStamp) || roundStamp < startMs)) return false;
        if (endMs !== null && (!Number.isFinite(roundStamp) || roundStamp > endMs)) return false;

        const playerName = playerMap.get(round.playerId)?.playerName?.toLowerCase() ?? "";
        if (playerTerm && !playerName.includes(playerTerm)) return false;

        if (modeTerm && !round.mode.toLowerCase().includes(modeTerm)) return false;

        return true;
      })
      .sort((a, b) => {
        const stampA = Date.parse(a.t || "");
        const stampB = Date.parse(b.t || "");
        const normalizedA = Number.isFinite(stampA) ? stampA : 0;
        const normalizedB = Number.isFinite(stampB) ? stampB : 0;
        return normalizedB - normalizedA;
      });
  }, [adminRounds, filters, roundSearch, roundMatchFilter, playerMap]);

  const focusedMatch = focusedMatchId ? matchMap.get(focusedMatchId) ?? null : null;
  const focusedRound = focusedRoundId ? roundMap.get(focusedRoundId) ?? null : null;

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined" || hashInitialized.current) {
      hashInitialized.current = true;
      return;
    }
    const rawHash = window.location.hash.slice(1);
    if (!rawHash) {
      hashInitialized.current = true;
      return;
    }
    const params = new URLSearchParams(rawHash);
    const tabParam = params.get("tab");
    if (tabParam && (TAB_OPTIONS as readonly string[]).includes(tabParam)) {
      setTab(tabParam as TabKey);
    }
    const playerParam = params.get("player");
    const profileParam = params.get("profile");
    const modeParam = params.get("mode") as Mode | null;
    const difficultyParam = params.get("difficulty") as AIMode | null;
    const fromParam = params.get("from");
    const toParam = params.get("to");
    const nextFilters: ControlFilters = {
      playerId: playerParam || null,
      profileId: profileParam || null,
      mode: modeParam && MODE_OPTIONS.includes(modeParam) ? modeParam : "",
      difficulty: difficultyParam && DIFFICULTY_OPTIONS.includes(difficultyParam) ? difficultyParam : "",
      dateRange: {
        start: fromParam || null,
        end: toParam || null,
      },
    };
    setFilters({ ...nextFilters, dateRange: { ...nextFilters.dateRange } });
    const matchParam = params.get("match");
    const roundParam = params.get("round");
    const roundMatchParam = params.get("roundMatch");
    setFocusedMatchId(matchParam || null);
    setFocusedRoundId(roundParam || null);
    setRoundMatchFilter(roundMatchParam || null);
    hashInitialized.current = true;
  }, [open]);

  useEffect(() => {
    if (!open || !hashInitialized.current || typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (filters.playerId) params.set("player", filters.playerId);
    if (filters.profileId) params.set("profile", filters.profileId);
    if (filters.mode) params.set("mode", filters.mode);
    if (filters.difficulty) params.set("difficulty", filters.difficulty);
    if (filters.dateRange.start) params.set("from", filters.dateRange.start);
    if (filters.dateRange.end) params.set("to", filters.dateRange.end);
    if (focusedMatchId) params.set("match", focusedMatchId);
    if (roundMatchFilter) params.set("roundMatch", roundMatchFilter);
    if (focusedRoundId) params.set("round", focusedRoundId);
    const hash = params.toString();
    const base = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", hash ? `${base}#${hash}` : base);
  }, [
    open,
    tab,
    filters.playerId,
    filters.profileId,
    filters.mode,
    filters.difficulty,
    filters.dateRange.start,
    filters.dateRange.end,
    focusedMatchId,
    focusedRoundId,
    roundMatchFilter,
  ]);

  useEffect(() => {
    if (!filters.profileId) return;
    const profile = profileMap.get(filters.profileId);
    if (!profile || (filters.playerId && profile.playerId !== filters.playerId)) {
      setFilters(prev => ({
        ...prev,
        profileId: null,
        dateRange: { ...prev.dateRange },
      }));
    }
  }, [filters.playerId, filters.profileId, profileMap]);

  useEffect(() => {
    if (focusedMatchId && !filteredMatches.some(match => match.id === focusedMatchId)) {
      setFocusedMatchId(null);
    }
  }, [focusedMatchId, filteredMatches]);

  useEffect(() => {
    if (focusedRoundId && !filteredRounds.some(round => round.id === focusedRoundId)) {
      setFocusedRoundId(null);
    }
  }, [focusedRoundId, filteredRounds]);

  useEffect(() => {
    if (roundMatchFilter && !matchMap.has(roundMatchFilter)) {
      setRoundMatchFilter(null);
    }
  }, [roundMatchFilter, matchMap]);

  useEffect(() => {
    if (roundMatchFilter) {
      const match = matchMap.get(roundMatchFilter);
      if (!match) {
        setRoundMatchFilter(null);
        return;
      }
      if ((filters.playerId && match.playerId !== filters.playerId) || (filters.profileId && match.profileId !== filters.profileId)) {
        setRoundMatchFilter(null);
      }
    }
  }, [roundMatchFilter, matchMap, filters.playerId, filters.profileId]);

  const handleSelectPlayer = useCallback(
    (playerId: string | null) => {
      setFilters(prev => ({
        ...prev,
        playerId,
        profileId:
          playerId && prev.profileId && profileMap.get(prev.profileId)?.playerId === playerId ? prev.profileId : null,
        dateRange: { ...prev.dateRange },
      }));
      setRoundMatchFilter(null);
      setFocusedMatchId(null);
      setFocusedRoundId(null);
    },
    [profileMap]
  );

  const handleSelectProfile = useCallback(
    (profileId: string | null) => {
      if (!profileId) {
        setFilters(prev => ({
          ...prev,
          profileId: null,
          dateRange: { ...prev.dateRange },
        }));
        setFocusedMatchId(null);
        setFocusedRoundId(null);
        setRoundMatchFilter(null);
        return;
      }
      const profile = profileMap.get(profileId);
      if (!profile) return;
      setFilters(prev => ({
        ...prev,
        playerId: profile.playerId,
        profileId: profile.id,
        dateRange: { ...prev.dateRange },
      }));
      setRoundMatchFilter(null);
      setFocusedMatchId(null);
      setFocusedRoundId(null);
    },
    [profileMap]
  );

  const handleModeFilterChange = useCallback((value: Mode | "") => {
    setFilters(prev => ({
      ...prev,
      mode: value,
      dateRange: { ...prev.dateRange },
    }));
  }, []);

  const handleDifficultyFilterChange = useCallback((value: AIMode | "") => {
    setFilters(prev => ({
      ...prev,
      difficulty: value,
      dateRange: { ...prev.dateRange },
    }));
  }, []);

  const handleDateRangeChange = useCallback((field: "start" | "end", value: string) => {
    setFilters(prev => ({
      ...prev,
      dateRange: {
        ...prev.dateRange,
        [field]: value ? value : null,
      },
    }));
  }, []);

  const clearDateRange = useCallback(() => {
    setFilters(prev => ({
      ...prev,
      dateRange: { start: null, end: null },
    }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({ ...FILTER_DEFAULTS, dateRange: { ...FILTER_DEFAULTS.dateRange } });
    setMatchSearch({ player: "", profile: "", mode: "" });
    setRoundSearch({ player: "", mode: "" });
    setFocusedMatchId(null);
    setFocusedRoundId(null);
    setRoundMatchFilter(null);
  }, []);

  const handleMatchSearchChange = useCallback((field: keyof MatchSearchFilters, value: string) => {
    setMatchSearch(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleRoundSearchChange = useCallback((field: keyof RoundSearchFilters, value: string) => {
    setRoundSearch(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleMatchRowClick = useCallback((matchId: string) => {
    setFocusedMatchId(matchId);
    setFocusedRoundId(null);
  }, []);

  const handleRoundRowClick = useCallback((roundId: string) => {
    setFocusedRoundId(roundId);
  }, []);

  const handleViewRoundsForMatch = useCallback(
    (matchId: string) => {
      const match = matchMap.get(matchId);
      if (match) {
        setFilters(prev => ({
          ...prev,
          playerId: match.playerId,
          profileId: match.profileId,
          dateRange: { ...prev.dateRange },
        }));
      }
      setRoundMatchFilter(matchId);
      setFocusedRoundId(null);
    },
    [matchMap]
  );

  const handleOpenJumpDialog = useCallback(() => {
    setJumpSelection({
      playerId: filters.playerId,
      profileId: filters.profileId,
    });
    setJumpDialogOpen(true);
  }, [filters.playerId, filters.profileId]);

  const handleJumpPlayerChange = useCallback((playerId: string) => {
    setJumpSelection(prev => ({
      playerId: playerId || null,
      profileId:
        prev.profileId && profileMap.get(prev.profileId)?.playerId === playerId ? prev.profileId : null,
    }));
  }, [profileMap]);

  const handleJumpProfileChange = useCallback((profileId: string) => {
    setJumpSelection(prev => ({
      ...prev,
      profileId: profileId || null,
    }));
  }, []);

  const handleCancelJump = useCallback(() => {
    setJumpDialogOpen(false);
  }, []);

  const handleConfirmJump = useCallback(() => {
    if (!ready) return;
    if (!jumpSelection.playerId) return;
    const targetPlayerId = jumpSelection.playerId;
    const profileCandidate =
      jumpSelection.profileId && profileMap.get(jumpSelection.profileId)?.playerId === targetPlayerId
        ? jumpSelection.profileId
        : null;
    const originPlayerId = overrideState?.origin.playerId ?? currentPlayerId ?? null;
    const originProfileId =
      overrideState?.origin.profileId ?? (currentProfile?.id ?? currentProfileId ?? null);

    const nextOverride = {
      origin: { playerId: originPlayerId, profileId: originProfileId },
      active: { playerId: targetPlayerId, profileId: profileCandidate },
    };

    setOverrideState(nextOverride);
    setCurrentPlayer(targetPlayerId);
    setPendingProfileSelection(profileCandidate);
    setJumpDialogOpen(false);
    onClose();
  }, [ready, jumpSelection.playerId, jumpSelection.profileId, profileMap, overrideState, currentPlayerId, currentProfile, currentProfileId, setCurrentPlayer, setPendingProfileSelection, onClose]);

  const handleReleaseOverride = useCallback(() => {
    if (!ready) return;
    if (!overrideState) return;
    const { origin } = overrideState;
    setOverrideState(null);
    setCurrentPlayer(origin.playerId);
    setPendingProfileSelection(origin.profileId);
    onClose();
  }, [overrideState, setCurrentPlayer, setPendingProfileSelection, onClose, ready]);

  const recordAudit = useCallback(async (entry: Omit<AuditEntry, "timestamp">) => {
    const fullEntry: AuditEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    await appendAuditEntry(fullEntry);
    setAuditLogs(prev => prev.concat(fullEntry));
  }, []);

  const handleExportPlayer = useCallback(() => {
    if (!selectedPlayer || typeof window === "undefined") return;
    const payload = {
      player: selectedPlayer,
      profiles: adminProfiles.filter(profile => profile.playerId === selectedPlayer.id),
      matches: adminMatches.filter(match => match.playerId === selectedPlayer.id),
      rounds: adminRounds.filter(round => round.playerId === selectedPlayer.id),
    };
    const filename = `${makeSlug(selectedPlayer.playerName || "player")}_player.json`;
    downloadJson(filename, payload);
  }, [selectedPlayer, adminProfiles, adminMatches, adminRounds]);

  const handleExportProfile = useCallback(() => {
    if (!selectedProfile || typeof window === "undefined") return;
    const payload = {
      profile: selectedProfile,
      matches: adminMatches.filter(match => match.profileId === selectedProfile.id),
      rounds: adminRounds.filter(round => round.profileId === selectedProfile.id),
    };
    const filename = `${makeSlug(selectedProfile.name || "profile")}_profile.json`;
    downloadJson(filename, payload);
  }, [selectedProfile, adminMatches, adminRounds]);

  const handleResetProfileTraining = useCallback(async () => {
    if (!selectedProfile) return;
    if (typeof window !== "undefined" && !window.confirm("Reset training progress for this profile?")) return;
    updateProfile(selectedProfile.id, { trainingCount: 0, trained: false });
    await recordAudit({ action: "reset-profile-training", target: selectedProfile.id });
  }, [selectedProfile, updateProfile, recordAudit]);

  const handleRenameProfile = useCallback(async () => {
    if (!selectedProfile) return;
    if (typeof window === "undefined") return;
    const nextName = window.prompt("Rename profile", selectedProfile.name);
    if (!nextName) return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === selectedProfile.name) return;
    updateProfile(selectedProfile.id, { name: trimmed });
    await recordAudit({ action: "rename-profile", target: selectedProfile.id, notes: JSON.stringify({ name: trimmed }) });
  }, [selectedProfile, updateProfile, recordAudit]);

  const handleCreateProfileForPlayer = useCallback(async () => {
    if (!selectedPlayer) return;
    const created = createProfile(selectedPlayer.id);
    if (!created) return;
    await recordAudit({ action: "create-profile", target: created.id, notes: JSON.stringify({ playerId: created.playerId }) });
    handleSelectProfile(created.id);
  }, [selectedPlayer, createProfile, recordAudit, handleSelectProfile]);

  const filteredAuditLogs = useMemo(() => {
    if (auditActionFilter === "all") return auditLogs;
    return auditLogs.filter(entry => entry.action === auditActionFilter);
  }, [auditLogs, auditActionFilter]);

  const auditActions = useMemo(() => {
    return Array.from(new Set(auditLogs.map(entry => entry.action))).sort();
  }, [auditLogs]);

  const ensureAuditLoaded = useCallback(async () => {
    if (!isUnlocked()) return;
    const logs = await loadAuditLog();
    setAuditLogs(logs);
  }, []);

  const handleUnlock = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setUnlockError(null);
    setLoading(true);
    try {
      const success = await unlockWithPin(pin.trim());
      if (!success) {
        setUnlockError("Invalid PIN");
      } else {
        setPin("");
        await ensureAuditLoaded();
      }
    } catch (err) {
      console.error(err);
      setUnlockError("Unable to unlock store");
    } finally {
      setLoading(false);
    }
  }, [pin, ensureAuditLoaded]);

  const handlePlayerDelete = useCallback(async (id: string) => {
    deletePlayer(id);
    await recordAudit({ action: "delete-player", target: id });
  }, [deletePlayer, recordAudit]);

  const handleDeleteSelectedPlayer = useCallback(async () => {
    if (!selectedPlayer) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Delete this player and remove all of their profiles, matches, and rounds?"
      );
      if (!confirmed) return;
    }
    await handlePlayerDelete(selectedPlayer.id);
    handleSelectPlayer(null);
  }, [selectedPlayer, handlePlayerDelete, handleSelectPlayer]);

  const handleTimingFieldChange = useCallback((mode: "challenge" | "practice", field: TimingField, raw: string) => {
    const nextValue = Number.parseFloat(raw);
    setTimingDraft(prev => {
      if (!Number.isFinite(nextValue)) return prev;
      const clamped = Math.max(1, Math.round(nextValue));
      if (prev[mode][field] === clamped) return prev;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          [field]: clamped,
        },
      };
    });
  }, []);

  const handleTimingSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!hasTimingChanges) return;
      setTimingConfirmAction("save");
      setTimingConfirmOpen(true);
    },
    [hasTimingChanges]
  );

  const handleRevertDraft = useCallback(() => {
    if (!hasTimingChanges) return;
    setTimingConfirmAction("revert");
    setTimingConfirmOpen(true);
  }, [hasTimingChanges]);

  const handleResetTimings = useCallback(() => {
    setTimingConfirmAction("restore");
    setTimingConfirmOpen(true);
  }, []);

  const handleConfirmTimingAction = useCallback(() => {
    if (!timingConfirmAction) return;
    if (timingConfirmAction === "save") {
      const sanitized = normalizeMatchTimings(timingDraft);
      setTimingDraft(cloneTimings(sanitized));
      onTimingsUpdate(sanitized, { persist: makeDefault });
      setToastMessage(makeDefault ? "Timings updated and set as default." : "Timings updated.");
    } else if (timingConfirmAction === "revert") {
      setTimingDraft(cloneTimings(timings));
      setMakeDefault(false);
    } else if (timingConfirmAction === "restore") {
      const defaults = normalizeMatchTimings(MATCH_TIMING_DEFAULTS);
      setTimingDraft(cloneTimings(defaults));
      setMakeDefault(false);
      onTimingsReset();
    }
    setTimingConfirmAction(null);
    setTimingConfirmOpen(false);
  }, [timingConfirmAction, timingDraft, makeDefault, onTimingsUpdate, timings, onTimingsReset]);

  const handleCancelTimingAction = useCallback(() => {
    setTimingConfirmAction(null);
    setTimingConfirmOpen(false);
  }, []);

  if (!DEV_MODE_ENABLED || !open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 15, 30, 0.72)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-hidden={false}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: "min(95vw, 1200px)",
          maxHeight: "92vh",
          background: "#0b1220",
          borderRadius: "16px",
          padding: "24px",
          color: "#f7fafc",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div>
              <h2 style={{ fontSize: "1.35rem", margin: 0 }}>Developer Control Room</h2>
              <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.7 }}>
                Secure access to player demographics, gameplay statistics, and audit trails.
              </p>
            </div>
            {filters.profileId && (
              <span
                style={{
                  alignSelf: "flex-start",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  background: "rgba(59,130,246,0.18)",
                  color: "#93c5fd",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                }}
              >
                Viewing in Dev Mode
              </span>
            )}
            {overrideDisplay && (
              <span style={{ fontSize: "0.8rem", opacity: 0.8 }}>Current override: {overrideDisplay}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={handleOpenJumpDialog}
              disabled={!ready || players.length === 0}
              style={{
                background: ready && players.length > 0 ? "#2563eb" : "rgba(37,99,235,0.35)",
                border: "none",
                color: "white",
                borderRadius: "999px",
                padding: "6px 18px",
                cursor: ready && players.length > 0 ? "pointer" : "not-allowed",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
                opacity: ready && players.length > 0 ? 1 : 0.6,
              }}
            >
              Jump to Game
            </button>
            <button
              onClick={handleReleaseOverride}
              disabled={!hasOverride || !ready}
              style={{
                background:
                  hasOverride && ready ? "rgba(255,255,255,0.12)" : "rgba(148,163,184,0.18)",
                border: "1px solid rgba(255,255,255,0.2)",
                color:
                  hasOverride && ready ? "#f8fafc" : "rgba(226,232,240,0.5)",
                borderRadius: "999px",
                padding: "6px 18px",
                cursor: hasOverride && ready ? "pointer" : "not-allowed",
              }}
            >
              Release &amp; Revert
            </button>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "inherit",
                borderRadius: "999px",
                padding: "6px 18px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </header>

        {jumpDialogOpen && (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(8, 15, 30, 0.65)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10001,
            }}
          >
            <div
              style={{
                background: "#0f172a",
                borderRadius: "12px",
                padding: "24px",
                width: "min(92vw, 420px)",
                display: "grid",
                gap: "16px",
                boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Set active player/profile for gameplay?</h3>
              <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.75 }}>
                Choose which player and stats profile to apply to the live experience. Dev Mode will close after
                applying the override.
              </p>
              <label style={{ display: "grid", gap: "6px", fontSize: "0.85rem" }}>
                <span>Player</span>
                <select
                  value={jumpSelection.playerId ?? ""}
                  onChange={event => handleJumpPlayerChange(event.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(15,23,42,0.85)",
                    color: "#f8fafc",
                  }}
                >
                  <option value="">Select a player</option>
                  {players.map(player => (
                    <option key={player.id} value={player.id}>
                      {player.playerName}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: "6px", fontSize: "0.85rem" }}>
                <span>Profile</span>
                <select
                  value={jumpSelection.profileId ?? ""}
                  onChange={event => handleJumpProfileChange(event.target.value)}
                  disabled={!jumpSelection.playerId || jumpProfileOptions.length === 0}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(15,23,42,0.85)",
                    color: jumpSelection.playerId ? "#f8fafc" : "rgba(226,232,240,0.6)",
                  }}
                >
                  <option value="">Auto-select default profile</option>
                  {jumpProfileOptions.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
              {jumpSelectedPlayerName && (
                <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>
                  Selected: {jumpSelectedPlayerName}
                  {jumpSelectedProfileName ? ` • ${jumpSelectedProfileName}` : ""}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleCancelJump}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "#e2e8f0",
                    borderRadius: "8px",
                    padding: "8px 16px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmJump}
                  disabled={!jumpSelection.playerId}
                  style={{
                    background: jumpSelection.playerId ? "#2563eb" : "rgba(37,99,235,0.35)",
                    border: "none",
                    color: "white",
                    borderRadius: "8px",
                    padding: "8px 16px",
                    cursor: jumpSelection.playerId ? "pointer" : "not-allowed",
                    opacity: jumpSelection.playerId ? 1 : 0.6,
                  }}
                >
                  Confirm &amp; Apply
                </button>
              </div>
            </div>
          </div>
        )}

        {timingConfirmOpen && timingConfirmAction && (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(8, 15, 30, 0.65)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10002,
            }}
          >
            <div
              style={{
                background: "#0f172a",
                borderRadius: "12px",
                padding: "24px",
                width: "min(92vw, 400px)",
                display: "grid",
                gap: "14px",
                boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.05rem" }}>{timingConfirmTitle}</h3>
              {timingConfirmBody && <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.75 }}>{timingConfirmBody}</p>}
              {timingConfirmAction === "save" && (
                <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>{timingSummaryLine}</p>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleCancelTimingAction}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "#e2e8f0",
                    borderRadius: "8px",
                    padding: "8px 16px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmTimingAction}
                  disabled={timingConfirmDisabled}
                  style={{
                    background: !timingConfirmDisabled ? "#2563eb" : "rgba(37,99,235,0.35)",
                    border: "none",
                    color: "white",
                    borderRadius: "8px",
                    padding: "8px 16px",
                    cursor: !timingConfirmDisabled ? "pointer" : "not-allowed",
                    opacity: !timingConfirmDisabled ? 1 : 0.6,
                  }}
                >
                  Confirm &amp; Apply
                </button>
              </div>
            </div>
          </div>
        )}

        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: "fixed",
              right: "24px",
              bottom: "24px",
              background: "rgba(15,23,42,0.95)",
              color: "#f8fafc",
              padding: "12px 18px",
              borderRadius: "10px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
              fontSize: "0.9rem",
              zIndex: 10003,
            }}
          >
            {toastMessage}
          </div>
        )}

        {!ready ? (
          <form onSubmit={handleUnlock} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p style={{ margin: 0, opacity: 0.8 }}>
              Enter the developer PIN to unlock secure tooling for protected data.
            </p>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>PIN</span>
              <input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(15,20,35,0.9)",
                  color: "inherit",
                }}
              />
            </label>
            {unlockError && <p style={{ color: "#f87171", margin: 0 }}>{unlockError}</p>}
            <button
              type="submit"
              disabled={!pin.trim() || loading}
              style={{
                alignSelf: "flex-start",
                background: "#2563eb",
                border: "none",
                color: "white",
                borderRadius: "8px",
                padding: "8px 18px",
                cursor: pin.trim() ? "pointer" : "not-allowed",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Verifying..." : "Unlock"}
            </button>
          </form>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: "0" }}>
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 5,
                background: "rgba(11,18,32,0.94)",
                backdropFilter: "blur(10px)",
                paddingBottom: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <nav style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {TAB_OPTIONS.map(key => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    style={{
                      background: tab === key ? "#1d4ed8" : "rgba(255,255,255,0.08)",
                      border: "none",
                      color: "white",
                      padding: "8px 14px",
                      borderRadius: "999px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      textTransform: "capitalize",
                    }}
                  >
                    {key}
                  </button>
                ))}
              </nav>
              {liveStatus.running && liveStatus.label && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("instrumentation");
                      setInstrumentationView("live");
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "rgba(34,197,94,0.18)",
                      border: "1px solid rgba(34,197,94,0.45)",
                      color: "#bbf7d0",
                      borderRadius: "999px",
                      padding: "6px 12px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "999px", background: "#22c55e" }} />
                    Live: {liveStatus.label}
                  </button>
                </div>
              )}
              <ContextHeader
                player={selectedPlayer}
                profile={selectedProfile}
                filters={filters}
                matchCount={filteredMatches.length}
                roundCount={filteredRounds.length}
                onClearPlayer={() => handleSelectPlayer(null)}
                onClearProfile={() => handleSelectProfile(null)}
                onClearMode={() => handleModeFilterChange("")}
                onClearDifficulty={() => handleDifficultyFilterChange("")}
                onClearDateRange={clearDateRange}
                onClearMatchScope={() => setRoundMatchFilter(null)}
                roundMatchFilter={roundMatchFilter}
                focusedMatch={focusedMatch}
              />
              <FilterBar
                playerOptions={playerSummaries}
                profileOptions={profilesForList}
                filters={filters}
                onPlayerChange={handleSelectPlayer}
                onProfileChange={handleSelectProfile}
                onModeChange={handleModeFilterChange}
                onDifficultyChange={handleDifficultyFilterChange}
                onDateChange={handleDateRangeChange}
                onClearAll={clearAllFilters}
              />
            </div>
            <div
              style={{
                flex: 1,
                overflow: "auto",
                paddingRight: "4px",
                paddingBottom: "12px",
                paddingTop: "12px",
                display: "grid",
                gap: "16px",
              }}
            >
              {tab === "overview" && (
                <div style={{ display: "grid", gap: "16px" }}>
                  <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                    <StatCard label="Players" value={players.length} />
                    <StatCard label="Profiles" value={adminProfiles.length} />
                    <StatCard label="Matches" value={overview.totalMatches} />
                    <StatCard label="Rounds" value={overview.totalRounds} />
                  </div>
                  <OverviewTable
                    snapshotSavedAt={snapshotSavedAt}
                    summaries={playerSummaries}
                    onSelectPlayer={handleSelectPlayer}
                  />
                </div>
              )}

              {tab === "data" && (
                <div
                  style={{
                    display: "grid",
                    gap: "16px",
                    gridTemplateColumns: "minmax(220px, 260px) minmax(220px, 260px) 1fr",
                    alignItems: "start",
                  }}
                >
                  <PlayersPanel summaries={playerSummaries} selectedPlayerId={filters.playerId} onSelect={handleSelectPlayer} />
                  <ProfilesPanel
                    profiles={profilesForList}
                    summaries={profileSummaryMap}
                    selectedProfileId={filters.profileId}
                    onSelect={handleSelectProfile}
                    playerMap={playerMap}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", minHeight: 0 }}>
                    <ContextSummary
                      player={selectedPlayer}
                      playerStats={selectedPlayerSummary}
                      profile={selectedProfile}
                      profileStats={selectedProfileSummary}
                      onExportPlayer={handleExportPlayer}
                      onDeletePlayer={handleDeleteSelectedPlayer}
                      onCreateProfile={handleCreateProfileForPlayer}
                      onExportProfile={handleExportProfile}
                      onResetProfile={handleResetProfileTraining}
                      onRenameProfile={handleRenameProfile}
                    />
                    {selectedPlayer ? (
                      <>
                        <MatchesSection
                          matches={filteredMatches}
                          selectedMatchId={focusedMatchId}
                          playerMap={playerMap}
                          profileMap={profileMap}
                          search={matchSearch}
                          onSearchChange={handleMatchSearchChange}
                          onRowClick={handleMatchRowClick}
                          onSelectPlayer={handleSelectPlayer}
                          onSelectProfile={handleSelectProfile}
                          focusedMatch={focusedMatch}
                          onViewRounds={handleViewRoundsForMatch}
                          onClearFilters={clearAllFilters}
                        />
                        <RoundsSection
                          rounds={filteredRounds}
                          selectedRoundId={focusedRoundId}
                          playerMap={playerMap}
                          profileMap={profileMap}
                          matchMap={matchMap}
                          search={roundSearch}
                          onSearchChange={handleRoundSearchChange}
                          onRowClick={handleRoundRowClick}
                          onSelectPlayer={handleSelectPlayer}
                          onSelectProfile={handleSelectProfile}
                          onSelectMatch={handleMatchRowClick}
                          focusedRound={focusedRound}
                          roundMatchFilter={roundMatchFilter}
                          onClearMatchFilter={() => setRoundMatchFilter(null)}
                          onClearFilters={clearAllFilters}
                        />
                      </>
                    ) : (
                      <EmptyState
                        players={playerSummaries}
                        onSelectPlayer={handleSelectPlayer}
                        onClearFilters={clearAllFilters}
                      />
                    )}
                  </div>
                </div>
              )}

              {tab === "instrumentation" && (
                <InstrumentationTab
                  snapshot={instrumentationSnapshot}
                  scope={instrumentationScope}
                  modeFilter={filters.mode}
                  difficultyFilter={filters.difficulty}
                  dateRange={filters.dateRange}
                  playerName={selectedPlayer?.playerName ?? null}
                  profileName={selectedProfile?.name ?? null}
                  source={instrumentationSource}
                  onSourceChange={setInstrumentationSource}
                  autoCaptureEnabled={autoCaptureEnabled}
                  onToggleAutoCapture={handleToggleAutoCapture}
                  activeView={instrumentationView}
                  onViewChange={setInstrumentationView}
                  onLiveStatusChange={handleLiveStatusChange}
                />
              )}

              {tab === "timers" && (
                <form onSubmit={handleTimingSubmit} style={{ display: "grid", gap: "16px" }}>
                  <div
                    style={{
                      background: "rgba(15,25,45,0.8)",
                      borderRadius: "12px",
                      padding: "16px",
                      display: "grid",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <h3 style={{ margin: "0 0 4px" }}>Match loop timings</h3>
                      <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.7 }}>
                        Update countdown, reveal, and banner durations. Apply changes for the current session or mark them as the
                        new default.
                      </p>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gap: "12px",
                        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                      }}
                    >
                      {(["challenge", "practice"] as const).map(mode => (
                        <fieldset
                          key={mode}
                          style={{
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: "12px",
                            padding: "12px",
                            display: "grid",
                            gap: "12px",
                          }}
                        >
                          <legend style={{ padding: "0 8px", fontWeight: 600, textTransform: "capitalize" }}>{mode} mode</legend>
                          {timerFields.map(field => (
                            <label key={field.key} style={{ display: "grid", gap: "4px" }}>
                              <span style={{ fontSize: "0.85rem" }}>{field.label}</span>
                              <input
                                type="number"
                                min={100}
                                step={50}
                                value={timingDraft[mode][field.key]}
                                onChange={e => handleTimingFieldChange(mode, field.key, e.target.value)}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: "8px",
                                  border: "1px solid rgba(255,255,255,0.18)",
                                  background: "rgba(15,20,35,0.9)",
                                  color: "inherit",
                                }}
                              />
                              <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                                Baseline {MATCH_TIMING_DEFAULTS[mode][field.key]} ms · {field.helper}
                              </span>
                            </label>
                          ))}
                        </fieldset>
                      ))}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem" }}>
                      <input type="checkbox" checked={makeDefault} onChange={e => setMakeDefault(e.target.checked)} />
                      <span>Make these timings the default</span>
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <button
                        type="submit"
                        disabled={!hasTimingChanges}
                        style={{
                          background: hasTimingChanges ? "#2563eb" : "rgba(30,64,175,0.45)",
                          border: "none",
                          color: "white",
                          borderRadius: "8px",
                          padding: "8px 18px",
                          cursor: hasTimingChanges ? "pointer" : "not-allowed",
                          opacity: hasTimingChanges ? 1 : 0.6,
                        }}
                      >
                        Save timings
                      </button>
                      <button
                        type="button"
                        onClick={handleRevertDraft}
                        disabled={!hasTimingChanges}
                        style={{
                          background: hasTimingChanges ? "rgba(255,255,255,0.1)" : "rgba(148,163,184,0.12)",
                          border: "1px solid rgba(255,255,255,0.15)",
                          color: hasTimingChanges ? "white" : "rgba(226,232,240,0.6)",
                          borderRadius: "8px",
                          padding: "8px 14px",
                          cursor: hasTimingChanges ? "pointer" : "not-allowed",
                        }}
                      >
                        Revert to active
                      </button>
                      <button
                        type="button"
                        onClick={handleResetTimings}
                        style={{
                          background: "rgba(59,130,246,0.12)",
                          border: "1px solid rgba(59,130,246,0.4)",
                          color: "#93c5fd",
                          borderRadius: "8px",
                          padding: "8px 14px",
                          cursor: "pointer",
                        }}
                      >
                        Restore baseline defaults
                      </button>
                    </div>
                    {!hasTimingChanges && (
                      <p style={{ fontSize: "0.75rem", opacity: 0.65, margin: "0" }}>No changes to save.</p>
                    )}
                  </div>
                </form>
              )}

              {tab === "audit" && (
                <AuditSection
                  logs={filteredAuditLogs}
                  actions={auditActions}
                  actionFilter={auditActionFilter}
                  onActionFilterChange={setAuditActionFilter}
                  resolveTarget={(action, target) =>
                    resolveAuditTarget(action, target, { playerMap, profileMap, matchMap, roundMap })
                  }
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: "rgba(15,25,45,0.8)",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>{label}</span>
      <strong style={{ fontSize: "1.5rem" }}>{value}</strong>
    </div>
  );
}

interface OverviewTableProps {
  snapshotSavedAt: string | null;
  summaries: PlayerSummaryData[];
  onSelectPlayer: (playerId: string | null) => void;
}

function OverviewTable({ snapshotSavedAt, summaries, onSelectPlayer }: OverviewTableProps) {
  return (
    <div
      style={{
        background: "rgba(15,25,45,0.8)",
        borderRadius: "12px",
        padding: "16px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div>
        <h3 style={{ margin: "0 0 4px" }}>Participation</h3>
        {snapshotSavedAt && (
          <p style={{ margin: 0, fontSize: "0.75rem", opacity: 0.6 }}>Secure snapshot saved {formatDateTime(snapshotSavedAt)}.</p>
        )}
      </div>
      <div
        style={{
          maxHeight: "260px",
          overflow: "auto",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead style={{ position: "sticky", top: 0, background: "rgba(9,14,26,0.95)" }}>
            <tr style={{ textAlign: "left", opacity: 0.7 }}>
              <th style={{ padding: "8px 12px" }}>Player</th>
              <th style={{ padding: "8px 12px" }}>Rounds</th>
              <th style={{ padding: "8px 12px" }}>Matches</th>
            </tr>
          </thead>
          <tbody>
            {summaries.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: "12px", textAlign: "center", opacity: 0.7 }}>
                  No players recorded yet.
                </td>
              </tr>
            ) : (
              summaries.map(summary => (
                <tr
                  key={summary.player.id}
                  style={{ borderTop: "1px solid rgba(255,255,255,0.05)", cursor: "pointer" }}
                  onClick={() => onSelectPlayer(summary.player.id)}
                >
                  <td style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>{summary.player.playerName}</span>
                    <CopyIdButton id={summary.player.id} />
                  </td>
                  <td style={{ padding: "8px 12px" }}>{summary.rounds}</td>
                  <td style={{ padding: "8px 12px" }}>{summary.matches}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
interface ContextHeaderProps {
  player: PlayerProfile | null;
  profile: StatsProfile | null;
  filters: ControlFilters;
  matchCount: number;
  roundCount: number;
  onClearPlayer: () => void;
  onClearProfile: () => void;
  onClearMode: () => void;
  onClearDifficulty: () => void;
  onClearDateRange: () => void;
  onClearMatchScope: () => void;
  roundMatchFilter: string | null;
  focusedMatch: MatchSummary | null;
}

function ContextHeader({
  player,
  profile,
  filters,
  matchCount,
  roundCount,
  onClearPlayer,
  onClearProfile,
  onClearMode,
  onClearDifficulty,
  onClearDateRange,
  onClearMatchScope,
  roundMatchFilter,
  focusedMatch,
}: ContextHeaderProps) {
  const chips: { key: string; label: string; onClear?: () => void }[] = [];
  if (player) {
    chips.push({ key: "player", label: `Player: ${player.playerName} (${player.grade})`, onClear: onClearPlayer });
  }
  if (profile) {
    chips.push({ key: "profile", label: `Profile: ${profile.name}`, onClear: onClearProfile });
  }
  if (filters.mode) {
    chips.push({ key: "mode", label: `Mode: ${capitalize(filters.mode)}`, onClear: onClearMode });
  }
  if (filters.difficulty) {
    chips.push({ key: "difficulty", label: `Difficulty: ${capitalize(filters.difficulty)}`, onClear: onClearDifficulty });
  }
  if (filters.dateRange.start || filters.dateRange.end) {
    chips.push({ key: "dates", label: `Dates: ${formatDateRange(filters.dateRange)}`, onClear: onClearDateRange });
  }
  if (roundMatchFilter) {
    chips.push({
      key: "match",
      label: `Match: ${formatMatchLabel(focusedMatch) ?? roundMatchFilter}`,
      onClear: onClearMatchScope,
    });
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
        {chips.length === 0 ? (
          <span style={{ fontSize: "0.8rem", opacity: 0.65 }}>No filters applied.</span>
        ) : (
          chips.map(chip => <ContextChip key={chip.key} label={chip.label} onClear={chip.onClear} />)
        )}
      </div>
      <div style={{ fontSize: "0.75rem", opacity: 0.7, whiteSpace: "nowrap" }}>
        Matches ({matchCount}) › Rounds ({roundCount})
      </div>
    </div>
  );
}

interface ContextChipProps {
  label: string;
  onClear?: () => void;
}

function ContextChip({ label, onClear }: ContextChipProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        background: "rgba(255,255,255,0.1)",
        borderRadius: "999px",
        padding: "4px 10px",
        fontSize: "0.75rem",
      }}
    >
      {label}
      {onClear && (
        <button
          onClick={onClear}
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            fontSize: "0.75rem",
          }}
          aria-label="Clear filter"
          type="button"
        >
          ×
        </button>
      )}
    </span>
  );
}

interface FilterBarProps {
  playerOptions: PlayerSummaryData[];
  profileOptions: StatsProfile[];
  filters: ControlFilters;
  onPlayerChange: (playerId: string | null) => void;
  onProfileChange: (profileId: string | null) => void;
  onModeChange: (mode: Mode | "") => void;
  onDifficultyChange: (difficulty: AIMode | "") => void;
  onDateChange: (field: "start" | "end", value: string) => void;
  onClearAll: () => void;
}

function FilterBar({
  playerOptions,
  profileOptions,
  filters,
  onPlayerChange,
  onProfileChange,
  onModeChange,
  onDifficultyChange,
  onDateChange,
  onClearAll,
}: FilterBarProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "12px",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.75rem" }}>
          <span style={{ opacity: 0.6 }}>Player</span>
          <select
            value={filters.playerId ?? ""}
            onChange={e => onPlayerChange(e.target.value ? e.target.value : null)}
            style={{
              minWidth: "160px",
              padding: "6px 10px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(9,14,26,0.85)",
              color: "inherit",
            }}
          >
            <option value="">All players</option>
            {playerOptions.map(option => (
              <option key={option.player.id} value={option.player.id}>
                {option.player.playerName} ({option.player.grade})
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.75rem" }}>
          <span style={{ opacity: 0.6 }}>Profile</span>
          <select
            value={filters.profileId ?? ""}
            onChange={e => onProfileChange(e.target.value ? e.target.value : null)}
            style={{
              minWidth: "160px",
              padding: "6px 10px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(9,14,26,0.85)",
              color: "inherit",
            }}
          >
            <option value="">All profiles</option>
            {profileOptions.map(option => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.75rem" }}>
          <span style={{ opacity: 0.6 }}>Mode</span>
          <select
            value={filters.mode}
            onChange={e => onModeChange(e.target.value as Mode | "")}
            style={{
              minWidth: "120px",
              padding: "6px 10px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(9,14,26,0.85)",
              color: "inherit",
            }}
          >
            <option value="">Any mode</option>
            {MODE_OPTIONS.map(mode => (
              <option key={mode} value={mode}>
                {capitalize(mode)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.75rem" }}>
          <span style={{ opacity: 0.6 }}>Difficulty</span>
          <select
            value={filters.difficulty}
            onChange={e => onDifficultyChange(e.target.value as AIMode | "")}
            style={{
              minWidth: "140px",
              padding: "6px 10px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(9,14,26,0.85)",
              color: "inherit",
            }}
          >
            <option value="">All difficulties</option>
            {DIFFICULTY_OPTIONS.map(difficulty => (
              <option key={difficulty} value={difficulty}>
                {capitalize(difficulty)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.75rem" }}>
          <span style={{ opacity: 0.6 }}>From</span>
          <input
            type="date"
            value={filters.dateRange.start ?? ""}
            onChange={e => onDateChange("start", e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(9,14,26,0.85)",
              color: "inherit",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.75rem" }}>
          <span style={{ opacity: 0.6 }}>To</span>
          <input
            type="date"
            value={filters.dateRange.end ?? ""}
            onChange={e => onDateChange("end", e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(9,14,26,0.85)",
              color: "inherit",
            }}
          />
        </label>
      </div>
      <button
        onClick={onClearAll}
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.18)",
          color: "inherit",
          borderRadius: "999px",
          padding: "6px 16px",
          cursor: "pointer",
          fontSize: "0.8rem",
        }}
      >
        Clear all filters
      </button>
    </div>
  );
}
interface PlayersPanelProps {
  summaries: PlayerSummaryData[];
  selectedPlayerId: string | null;
  onSelect: (playerId: string | null) => void;
}

function PlayersPanel({ summaries, selectedPlayerId, onSelect }: PlayersPanelProps) {
  return (
    <div
      style={{
        background: "rgba(15,25,45,0.8)",
        borderRadius: "12px",
        padding: "16px",
        display: "grid",
        gap: "12px",
        maxHeight: "100%",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Players</h3>
        {selectedPlayerId && (
          <button
            onClick={() => onSelect(null)}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "inherit",
              borderRadius: "999px",
              padding: "4px 12px",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            Clear
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", maxHeight: "60vh" }}>
        {summaries.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.65, fontSize: "0.8rem" }}>Add a player to view participation.</p>
        ) : (
          summaries.map(summary => {
            const selected = summary.player.id === selectedPlayerId;
            return (
              <button
                key={summary.player.id}
                onClick={() => onSelect(summary.player.id)}
                style={{
                  textAlign: "left",
                  background: selected ? "rgba(37,99,235,0.25)" : "rgba(255,255,255,0.04)",
                  border: selected ? "1px solid rgba(37,99,235,0.6)" : "1px solid rgba(255,255,255,0.08)",
                  color: "inherit",
                  borderRadius: "10px",
                  padding: "12px",
                  display: "grid",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                  <div>
                    <strong style={{ fontSize: "0.95rem" }}>{summary.player.playerName}</strong>
                    <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>Grade {summary.player.grade}</div>
                  </div>
                  <CopyIdButton id={summary.player.id} />
                </div>
                <div style={{ fontSize: "0.75rem", opacity: 0.8, display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <span>{summary.profiles} profiles</span>
                  <span>{summary.matches} matches</span>
                  <span>{summary.rounds} rounds</span>
                </div>
                <div style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                  Last played: {summary.lastPlayed ? formatDateTime(summary.lastPlayed) : "—"}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

interface ProfilesPanelProps {
  profiles: StatsProfile[];
  summaries: Map<string, ProfileSummaryData>;
  selectedProfileId: string | null;
  onSelect: (profileId: string | null) => void;
  playerMap: Map<string, PlayerProfile>;
}

function ProfilesPanel({ profiles, summaries, selectedProfileId, onSelect, playerMap }: ProfilesPanelProps) {
  return (
    <div
      style={{
        background: "rgba(15,25,45,0.8)",
        borderRadius: "12px",
        padding: "16px",
        display: "grid",
        gap: "12px",
        maxHeight: "100%",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Profiles</h3>
        {selectedProfileId && (
          <button
            onClick={() => onSelect(null)}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "inherit",
              borderRadius: "999px",
              padding: "4px 12px",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            Clear
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", maxHeight: "60vh" }}>
        {profiles.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.65, fontSize: "0.8rem" }}>Select a player to see their profiles.</p>
        ) : (
          profiles.map(profile => {
            const selected = profile.id === selectedProfileId;
            const summary = summaries.get(profile.id);
            const owner = playerMap.get(profile.playerId);
            return (
              <button
                key={profile.id}
                onClick={() => onSelect(profile.id)}
                style={{
                  textAlign: "left",
                  background: selected ? "rgba(37,99,235,0.25)" : "rgba(255,255,255,0.04)",
                  border: selected ? "1px solid rgba(37,99,235,0.6)" : "1px solid rgba(255,255,255,0.08)",
                  color: "inherit",
                  borderRadius: "10px",
                  padding: "12px",
                  display: "grid",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                  <div>
                    <strong style={{ fontSize: "0.95rem" }}>{profile.name}</strong>
                    <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                      {owner ? `Player: ${owner.playerName}` : "Unassigned"}
                    </div>
                  </div>
                  <CopyIdButton id={profile.id} />
                </div>
                <div style={{ fontSize: "0.75rem", opacity: 0.8, display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <span>{summary?.matches ?? 0} matches</span>
                  <span>{summary?.rounds ?? 0} rounds</span>
                  <span>Win rate: {formatWinRate(summary?.winRate ?? null)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
interface ContextSummaryProps {
  player: PlayerProfile | null;
  playerStats: PlayerSummaryData | null;
  profile: StatsProfile | null;
  profileStats: ProfileSummaryData | null;
  onExportPlayer: () => void;
  onDeletePlayer: () => void;
  onCreateProfile: () => void;
  onExportProfile: () => void;
  onResetProfile: () => void;
  onRenameProfile: () => void;
}

function ContextSummary({
  player,
  playerStats,
  profile,
  profileStats,
  onExportPlayer,
  onDeletePlayer,
  onCreateProfile,
  onExportProfile,
  onResetProfile,
  onRenameProfile,
}: ContextSummaryProps) {
  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {player && (
        <div
          style={{
            background: "rgba(15,25,45,0.8)",
            borderRadius: "12px",
            padding: "16px",
            display: "grid",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
            <div>
              <h3 style={{ margin: 0 }}>{player.playerName}</h3>
              <p style={{ margin: 0, fontSize: "0.75rem", opacity: 0.7 }}>Grade {player.grade}</p>
            </div>
            <CopyIdButton id={player.id} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "0.8rem", opacity: 0.85 }}>
            <span>Profiles: {playerStats?.profiles ?? 0}</span>
            <span>Matches: {playerStats?.matches ?? 0}</span>
            <span>Rounds: {playerStats?.rounds ?? 0}</span>
            <span>Last played: {playerStats?.lastPlayed ? formatDateTime(playerStats.lastPlayed) : "—"}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <button
              onClick={onExportPlayer}
              style={{
                background: "rgba(59,130,246,0.2)",
                border: "1px solid rgba(59,130,246,0.5)",
                color: "#bfdbfe",
                borderRadius: "8px",
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Export player data
            </button>
            <button
              onClick={onCreateProfile}
              style={{
                background: "rgba(34,197,94,0.2)",
                border: "1px solid rgba(34,197,94,0.45)",
                color: "#bbf7d0",
                borderRadius: "8px",
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Create stats profile
            </button>
            <button
              onClick={onDeletePlayer}
              style={{
                background: "rgba(239,68,68,0.15)",
                border: "1px solid rgba(239,68,68,0.45)",
                color: "#fca5a5",
                borderRadius: "8px",
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Delete player
            </button>
          </div>
        </div>
      )}
      {profile && (
        <div
          style={{
            background: "rgba(15,25,45,0.8)",
            borderRadius: "12px",
            padding: "16px",
            display: "grid",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
            <div>
              <h3 style={{ margin: 0 }}>{profile.name}</h3>
              <p style={{ margin: 0, fontSize: "0.75rem", opacity: 0.7 }}>
                Training {profile.trained ? "complete" : `${profile.trainingCount}/5`}
              </p>
            </div>
            <CopyIdButton id={profile.id} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "0.8rem", opacity: 0.85 }}>
            <span>Mode mix: {formatModeMix(profileStats?.modeCounts ?? ({} as Record<Mode, number>))}</span>
            <span>Win rate: {formatWinRate(profileStats?.winRate ?? null)}</span>
            <span>Longest streak: {profileStats?.longestStreak ?? 0}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <button
              onClick={onExportProfile}
              style={{
                background: "rgba(59,130,246,0.2)",
                border: "1px solid rgba(59,130,246,0.5)",
                color: "#bfdbfe",
                borderRadius: "8px",
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Export profile
            </button>
            <button
              onClick={onResetProfile}
              style={{
                background: "rgba(34,197,94,0.2)",
                border: "1px solid rgba(34,197,94,0.45)",
                color: "#bbf7d0",
                borderRadius: "8px",
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Reset training
            </button>
            <button
              onClick={onRenameProfile}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "inherit",
                borderRadius: "8px",
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Rename profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
interface MatchesSectionProps {
  matches: MatchSummary[];
  selectedMatchId: string | null;
  playerMap: Map<string, PlayerProfile>;
  profileMap: Map<string, StatsProfile>;
  search: MatchSearchFilters;
  onSearchChange: (field: keyof MatchSearchFilters, value: string) => void;
  onRowClick: (matchId: string) => void;
  onSelectPlayer: (playerId: string | null) => void;
  onSelectProfile: (profileId: string | null) => void;
  focusedMatch: MatchSummary | null;
  onViewRounds: (matchId: string) => void;
  onClearFilters: () => void;
}

function MatchesSection({
  matches,
  selectedMatchId,
  playerMap,
  profileMap,
  search,
  onSearchChange,
  onRowClick,
  onSelectPlayer,
  onSelectProfile,
  focusedMatch,
  onViewRounds,
  onClearFilters,
}: MatchesSectionProps) {
  return (
    <div
      style={{
        background: "rgba(15,25,45,0.8)",
        borderRadius: "12px",
        padding: "16px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Matches</h3>
        <div style={{ display: "flex", gap: "8px", fontSize: "0.75rem", opacity: 0.7 }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Player</span>
            <input
              value={search.player}
              onChange={e => onSearchChange("player", e.target.value)}
              placeholder="Search"
              style={{
                padding: "4px 8px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(9,14,26,0.85)",
                color: "inherit",
              }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Profile</span>
            <input
              value={search.profile}
              onChange={e => onSearchChange("profile", e.target.value)}
              placeholder="Search"
              style={{
                padding: "4px 8px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(9,14,26,0.85)",
                color: "inherit",
              }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Mode</span>
            <input
              value={search.mode}
              onChange={e => onSearchChange("mode", e.target.value)}
              placeholder="Search"
              style={{
                padding: "4px 8px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(9,14,26,0.85)",
                color: "inherit",
              }}
            />
          </label>
        </div>
      </div>
      <div style={{ maxHeight: "260px", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead style={{ position: "sticky", top: 0, background: "rgba(9,14,26,0.95)" }}>
            <tr style={{ textAlign: "left", opacity: 0.7 }}>
              <th style={{ padding: "8px 12px" }}>Date</th>
              <th style={{ padding: "8px 12px" }}>Mode</th>
              <th style={{ padding: "8px 12px" }}>Difficulty</th>
              <th style={{ padding: "8px 12px" }}>Score (You–AI)</th>
              <th style={{ padding: "8px 12px" }}>Rounds</th>
              <th style={{ padding: "8px 12px" }}>Profile</th>
              <th style={{ padding: "8px 12px" }}>Player</th>
            </tr>
          </thead>
          <tbody>
            {matches.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "12px", textAlign: "center", opacity: 0.7 }}>
                  No matches for this filter.
                  <button
                    onClick={onClearFilters}
                    style={{
                      marginLeft: "8px",
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "inherit",
                      borderRadius: "999px",
                      padding: "2px 10px",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                    }}
                  >
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : (
              matches.map(match => {
                const selected = match.id === selectedMatchId;
                const playerName = playerMap.get(match.playerId)?.playerName ?? match.playerId;
                const profileName = profileMap.get(match.profileId)?.name ?? match.profileId;
                return (
                  <tr
                    key={match.id}
                    onClick={() => onRowClick(match.id)}
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                      background: selected ? "rgba(37,99,235,0.25)" : undefined,
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "8px 12px" }}>{formatDateTime(match.startedAt)}</td>
                    <td style={{ padding: "8px 12px" }}>{capitalize(match.mode)}</td>
                    <td style={{ padding: "8px 12px" }}>{capitalize(match.difficulty)}</td>
                    <td style={{ padding: "8px 12px" }}>{formatScore(match.score)}</td>
                    <td style={{ padding: "8px 12px" }}>{match.rounds}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          onSelectProfile(match.profileId);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          textDecoration: "underline",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                        }}
                      >
                        {profileName}
                      </button>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          onSelectPlayer(match.playerId);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          textDecoration: "underline",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                        }}
                      >
                        {playerName}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {focusedMatch && (
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            borderRadius: "10px",
            padding: "12px",
            display: "grid",
            gap: "8px",
            fontSize: "0.8rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
            <strong>Match details</strong>
            <CopyIdButton id={focusedMatch.id} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", opacity: 0.85 }}>
            <span>Score: {formatScore(focusedMatch.score)}</span>
            <span>Rounds: {focusedMatch.rounds}</span>
            <span>Mode: {capitalize(focusedMatch.mode)}</span>
            <span>Difficulty: {capitalize(focusedMatch.difficulty)}</span>
            <span>Started: {formatDateTime(focusedMatch.startedAt)}</span>
            <span>Ended: {formatDateTime(focusedMatch.endedAt)}</span>
          </div>
          <button
            onClick={() => onViewRounds(focusedMatch.id)}
            style={{
              justifySelf: "flex-start",
              background: "rgba(37,99,235,0.25)",
              border: "1px solid rgba(37,99,235,0.45)",
              color: "#bfdbfe",
              borderRadius: "8px",
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            View all rounds for this match
          </button>
        </div>
      )}
    </div>
  );
}
interface RoundsSectionProps {
  rounds: RoundLog[];
  selectedRoundId: string | null;
  playerMap: Map<string, PlayerProfile>;
  profileMap: Map<string, StatsProfile>;
  matchMap: Map<string, MatchSummary>;
  search: RoundSearchFilters;
  onSearchChange: (field: keyof RoundSearchFilters, value: string) => void;
  onRowClick: (roundId: string) => void;
  onSelectPlayer: (playerId: string | null) => void;
  onSelectProfile: (profileId: string | null) => void;
  onSelectMatch: (matchId: string) => void;
  focusedRound: RoundLog | null;
  roundMatchFilter: string | null;
  onClearMatchFilter: () => void;
  onClearFilters: () => void;
}

function RoundsSection({
  rounds,
  selectedRoundId,
  playerMap,
  profileMap,
  matchMap,
  search,
  onSearchChange,
  onRowClick,
  onSelectPlayer,
  onSelectProfile,
  onSelectMatch,
  focusedRound,
  roundMatchFilter,
  onClearMatchFilter,
  onClearFilters,
}: RoundsSectionProps) {
  const matchScope = roundMatchFilter ? matchMap.get(roundMatchFilter) : null;

  return (
    <div
      style={{
        background: "rgba(15,25,45,0.8)",
        borderRadius: "12px",
        padding: "16px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Rounds</h3>
        <div style={{ display: "flex", gap: "8px", fontSize: "0.75rem", opacity: 0.7 }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Player</span>
            <input
              value={search.player}
              onChange={e => onSearchChange("player", e.target.value)}
              placeholder="Search"
              style={{
                padding: "4px 8px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(9,14,26,0.85)",
                color: "inherit",
              }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>Mode</span>
            <input
              value={search.mode}
              onChange={e => onSearchChange("mode", e.target.value)}
              placeholder="Search"
              style={{
                padding: "4px 8px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(9,14,26,0.85)",
                color: "inherit",
              }}
            />
          </label>
        </div>
      </div>
      {matchScope && (
        <div
          style={{
            background: "rgba(37,99,235,0.15)",
            border: "1px solid rgba(37,99,235,0.4)",
            borderRadius: "10px",
            padding: "10px 12px",
            fontSize: "0.75rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Scoped to match {formatMatchLabel(matchScope)}</span>
          <button
            onClick={onClearMatchFilter}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.3)",
              color: "inherit",
              borderRadius: "999px",
              padding: "2px 10px",
              cursor: "pointer",
              fontSize: "0.7rem",
            }}
          >
            Clear match scope
          </button>
        </div>
      )}
      <div style={{ maxHeight: "260px", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead style={{ position: "sticky", top: 0, background: "rgba(9,14,26,0.95)" }}>
            <tr style={{ textAlign: "left", opacity: 0.7 }}>
              <th style={{ padding: "8px 12px" }}>Round</th>
              <th style={{ padding: "8px 12px" }}>Time</th>
              <th style={{ padding: "8px 12px" }}>Mode</th>
              <th style={{ padding: "8px 12px" }}>Difficulty</th>
              <th style={{ padding: "8px 12px" }}>Player move</th>
              <th style={{ padding: "8px 12px" }}>AI move</th>
              <th style={{ padding: "8px 12px" }}>Outcome</th>
              <th style={{ padding: "8px 12px" }}>AI conf%</th>
              <th style={{ padding: "8px 12px" }}>Match</th>
            </tr>
          </thead>
          <tbody>
            {rounds.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: "12px", textAlign: "center", opacity: 0.7 }}>
                  No rounds for this filter.
                  <button
                    onClick={onClearFilters}
                    style={{
                      marginLeft: "8px",
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "inherit",
                      borderRadius: "999px",
                      padding: "2px 10px",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                    }}
                  >
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : (
              rounds.map(round => {
                const selected = round.id === selectedRoundId;
                return (
                  <tr
                    key={round.id}
                    onClick={() => onRowClick(round.id)}
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                      background: selected ? "rgba(37,99,235,0.25)" : undefined,
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "8px 12px" }}>
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          onRowClick(round.id);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          textDecoration: "underline",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                        }}
                      >
                        {round.id.slice(0, 8)}
                      </button>
                    </td>
                    <td style={{ padding: "8px 12px" }}>{formatDateTime(round.t)}</td>
                    <td style={{ padding: "8px 12px" }}>{capitalize(round.mode)}</td>
                    <td style={{ padding: "8px 12px" }}>{capitalize(round.difficulty)}</td>
                    <td style={{ padding: "8px 12px" }}>{formatMove(round.player)}</td>
                    <td style={{ padding: "8px 12px" }}>{formatMove(round.ai)}</td>
                    <td style={{ padding: "8px 12px" }}>{capitalize(round.outcome)}</td>
                    <td style={{ padding: "8px 12px" }}>{formatConfidence(round.confidence)}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          if (round.matchId) {
                            onSelectMatch(round.matchId);
                          }
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: round.matchId ? "inherit" : "rgba(255,255,255,0.4)",
                          textDecoration: round.matchId ? "underline" : "none",
                          cursor: round.matchId ? "pointer" : "default",
                          fontSize: "0.8rem",
                        }}
                        disabled={!round.matchId}
                      >
                        {round.matchId ? round.matchId.slice(0, 8) : "—"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {focusedRound && (
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            borderRadius: "10px",
            padding: "12px",
            display: "grid",
            gap: "8px",
            fontSize: "0.8rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
            <strong>Round details</strong>
            <CopyIdButton id={focusedRound.id} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", opacity: 0.85 }}>
            <span>Player: {playerMap.get(focusedRound.playerId)?.playerName ?? focusedRound.playerId}</span>
            <span>Profile: {profileMap.get(focusedRound.profileId)?.name ?? focusedRound.profileId}</span>
            <span>Outcome: {capitalize(focusedRound.outcome)}</span>
            <span>Player move: {formatMove(focusedRound.player)}</span>
            <span>AI move: {formatMove(focusedRound.ai)}</span>
            <span>AI confidence: {formatConfidence(focusedRound.confidence)}</span>
          </div>
          <div style={{ fontSize: "0.75rem", opacity: 0.75 }}>
            Reason: {focusedRound.reason || focusedRound.heuristic?.reason || "—"}
          </div>
        </div>
      )}
    </div>
  );
}
interface EmptyStateProps {
  players: PlayerSummaryData[];
  onSelectPlayer: (playerId: string | null) => void;
  onClearFilters: () => void;
}

function EmptyState({ players, onSelectPlayer, onClearFilters }: EmptyStateProps) {
  const topPlayers = players.slice(0, 5);
  return (
    <div
      style={{
        background: "rgba(15,25,45,0.8)",
        borderRadius: "12px",
        padding: "32px",
        display: "grid",
        gap: "16px",
        textAlign: "center",
      }}
    >
      <div>
        <h3 style={{ margin: "0 0 8px" }}>Pick a player to begin</h3>
        <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.75 }}>
          Choose a player from the list to scope profiles, matches, and rounds.
        </p>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px" }}>
        {topPlayers.map(summary => (
          <button
            key={summary.player.id}
            onClick={() => onSelectPlayer(summary.player.id)}
            style={{
              background: "rgba(37,99,235,0.2)",
              border: "1px solid rgba(37,99,235,0.4)",
              color: "#bfdbfe",
              borderRadius: "999px",
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {summary.player.playerName}
          </button>
        ))}
      </div>
      <button
        onClick={onClearFilters}
        style={{
          justifySelf: "center",
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.2)",
          color: "inherit",
          borderRadius: "999px",
          padding: "6px 18px",
          cursor: "pointer",
          fontSize: "0.8rem",
        }}
      >
        Clear all filters
      </button>
    </div>
  );
}
interface AuditSectionProps {
  logs: AuditEntry[];
  actions: string[];
  actionFilter: string;
  onActionFilterChange: (value: string) => void;
  resolveTarget: (action: string, target: string | null | undefined) => { label: string; id: string | null } | null;
}

function AuditSection({ logs, actions, actionFilter, onActionFilterChange, resolveTarget }: AuditSectionProps) {
  return (
    <div
      style={{
        background: "rgba(15,25,45,0.8)",
        borderRadius: "12px",
        padding: "16px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Audit trail</h3>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem" }}>
          <span style={{ opacity: 0.7 }}>Action</span>
          <select
            value={actionFilter}
            onChange={e => onActionFilterChange(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(9,14,26,0.85)",
              color: "inherit",
            }}
          >
            <option value="all">All actions</option>
            {actions.map(action => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ maxHeight: "280px", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead style={{ position: "sticky", top: 0, background: "rgba(9,14,26,0.95)" }}>
            <tr style={{ textAlign: "left", opacity: 0.7 }}>
              <th style={{ padding: "8px 12px" }}>Timestamp</th>
              <th style={{ padding: "8px 12px" }}>Action</th>
              <th style={{ padding: "8px 12px" }}>Target</th>
              <th style={{ padding: "8px 12px" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "12px", textAlign: "center", opacity: 0.7 }}>
                  No audit entries recorded yet.
                </td>
              </tr>
            ) : (
              logs.map(entry => {
                const resolved = resolveTarget(entry.action, entry.target ?? null);
                return (
                  <tr key={`${entry.timestamp}-${entry.target ?? "none"}`} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "8px 12px" }}>{formatDateTime(entry.timestamp)}</td>
                    <td style={{ padding: "8px 12px" }}>{entry.action}</td>
                    <td style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>{resolved?.label ?? entry.target ?? "—"}</span>
                      {resolved?.id && <CopyIdButton id={resolved.id} />}
                    </td>
                    <td style={{ padding: "8px 12px", maxWidth: "320px", wordBreak: "break-word" }}>{formatNotes(entry.notes)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
interface ResolveMaps {
  playerMap: Map<string, PlayerProfile>;
  profileMap: Map<string, StatsProfile>;
  matchMap: Map<string, MatchSummary>;
  roundMap: Map<string, RoundLog>;
}

function resolveAuditTarget(
  action: string,
  target: string | null | undefined,
  maps: ResolveMaps,
): { label: string; id: string | null } | null {
  if (!target) return null;
  const lowered = action.toLowerCase();
  if (lowered.includes("player")) {
    const entity = maps.playerMap.get(target);
    return { label: entity ? entity.playerName : target, id: target };
  }
  if (lowered.includes("profile")) {
    const entity = maps.profileMap.get(target);
    return { label: entity ? entity.name : target, id: target };
  }
  if (lowered.includes("match")) {
    const entity = maps.matchMap.get(target);
    return { label: entity ? formatMatchLabel(entity) ?? target : target, id: target };
  }
  if (lowered.includes("round")) {
    const entity = maps.roundMap.get(target);
    return { label: entity ? `Round ${entity.id.slice(0, 8)}` : target, id: target };
  }
  return { label: target, id: target };
}

function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(id);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied" : "Copy id"}
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "none",
        color: "inherit",
        borderRadius: "6px",
        padding: "2px 8px",
        fontSize: "0.7rem",
        cursor: "pointer",
      }}
      type="button"
    >
      {copied ? "✓" : "ID"}
    </button>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "—";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : "—";
}

function formatDateRange(range: ControlFilters["dateRange"]) {
  const { start, end } = range;
  if (start && end) return `${formatDate(start)} → ${formatDate(end)}`;
  if (start) return `From ${formatDate(start)}`;
  if (end) return `Through ${formatDate(end)}`;
  return "—";
}

function formatModeMix(modeCounts: Record<Mode, number>) {
  const entries = Object.entries(modeCounts);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return "—";
  return entries
    .map(([mode, count]) => `${capitalize(mode)} ${Math.round((count / total) * 100)}%`)
    .join(" • ");
}

function formatWinRate(winRate: number | null) {
  if (winRate === null || Number.isNaN(winRate)) return "—";
  return `${Math.round(winRate * 100)}%`;
}

function formatConfidence(confidence?: number | null) {
  if (confidence === undefined || confidence === null) return "—";
  return `${(confidence * 100).toFixed(1)}%`;
}

function capitalize(value: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatScore(score: MatchSummary["score"]) {
  return `${score.you}–${score.ai}`;
}

function formatMatchLabel(match: MatchSummary | null) {
  if (!match) return null;
  const date = formatDate(match.startedAt);
  return `${date} • ${capitalize(match.mode)} · ${capitalize(match.difficulty)}`;
}

function formatMove(move: string) {
  return capitalize(move);
}

function formatNotes(notes?: string | null) {
  if (!notes) return "—";
  try {
    const parsed = JSON.parse(notes);
    return typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
  } catch {
    return notes;
  }
}

function makeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "record";
}

function downloadJson(filename: string, payload: unknown) {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
