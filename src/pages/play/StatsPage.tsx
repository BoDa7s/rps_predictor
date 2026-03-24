import React, { useMemo } from "react";
import PlaySectionLayout, { type PlaySection } from "../../components/play/PlaySectionLayout";
import { type Move, type Outcome } from "../../gameTypes";
import { usePlayers } from "../../players";
import { useStats } from "../../stats";

const TRAIN_ROUNDS = 5;
const sectionCardClass = "play-shell-card rounded-2xl p-5";
const fieldClass = "play-shell-input rounded-2xl px-4 py-3 text-sm font-semibold";
const accentButtonClass =
  "play-shell-button play-shell-button-accent rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const mutedButtonClass =
  "play-shell-button play-shell-button-muted rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function confidenceBucket(value: number): "low" | "medium" | "high" {
  if (value >= 0.67) return "high";
  if (value >= 0.34) return "medium";
  return "low";
}

function outcomeTone(outcome: Outcome) {
  if (outcome === "win") return "text-emerald-300";
  if (outcome === "lose") return "text-rose-300";
  return "text-slate-300";
}

function downloadCsv(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function StatsPage() {
  const { currentPlayer } = usePlayers();
  const { rounds, matches, currentProfile, profiles, selectProfile, createProfile, exportRoundsCsv } = useStats();

  const sortedRounds = useMemo(() => [...rounds].sort((a, b) => b.t.localeCompare(a.t)), [rounds]);
  const totalRounds = rounds.length;
  const totalMatches = matches.length;
  const playerWins = matches.reduce((count, match) => count + (match.score.you > match.score.ai ? 1 : 0), 0);
  const overallWinRate = totalMatches ? Math.round((playerWins / totalMatches) * 100) : 0;
  const trainingCount = currentProfile?.trainingCount ?? 0;
  const isTrained = Boolean(currentProfile?.trained);

  const behavior = useMemo(() => {
    if (!rounds.length) {
      return {
        repeatAfterWin: 0,
        switchAfterLoss: 0,
        favoriteMove: null as Move | null,
        favoriteMovePct: 0,
        topTransition: null as { key: string; count: number } | null,
      };
    }

    let repeatWins = 0;
    let winCases = 0;
    let switchLosses = 0;
    let lossCases = 0;
    const moveCounts: Record<Move, number> = { rock: 0, paper: 0, scissors: 0 };
    const transitions = new Map<string, number>();

    rounds.forEach((round, index) => {
      moveCounts[round.player] += 1;

      if (index > 0) {
        const previous = rounds[index - 1];
        if (previous.outcome === "win") {
          winCases += 1;
          if (round.player === previous.player) repeatWins += 1;
        }
        if (previous.outcome === "lose") {
          lossCases += 1;
          if (round.player !== previous.player) switchLosses += 1;
        }
        const key = `${previous.player} -> ${round.player}`;
        transitions.set(key, (transitions.get(key) ?? 0) + 1);
      }
    });

    const topMoveEntry = (Object.entries(moveCounts) as Array<[Move, number]>).sort((a, b) => b[1] - a[1])[0];
    const topTransitionEntry = [...transitions.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

    return {
      repeatAfterWin: winCases ? Math.round((repeatWins / winCases) * 100) : 0,
      switchAfterLoss: lossCases ? Math.round((switchLosses / lossCases) * 100) : 0,
      favoriteMove: topMoveEntry?.[1] ? topMoveEntry[0] : null,
      favoriteMovePct: topMoveEntry?.[1] ? Math.round((topMoveEntry[1] / rounds.length) * 100) : 0,
      topTransition: topTransitionEntry ? { key: topTransitionEntry[0], count: topTransitionEntry[1] } : null,
    };
  }, [rounds]);

  const aiMetrics = useMemo(() => {
    if (!rounds.length) {
      return {
        averageConfidence: null as number | null,
        highConfidenceRate: 0,
        ece: null as number | null,
        brier: null as number | null,
        flipRate: 0,
      };
    }

    const averageConfidence =
      Math.round((rounds.reduce((sum, round) => sum + clamp01(round.confidence), 0) / rounds.length) * 100);
    const highConfidenceRate =
      Math.round((rounds.filter(round => clamp01(round.confidence) >= 0.67).length / rounds.length) * 100);

    const bins = Array.from({ length: 5 }, () => ({ confidence: 0, actual: 0, total: 0 }));
    let brierSum = 0;

    rounds.forEach(round => {
      const confidence = clamp01(round.confidence);
      const actual = round.outcome === "lose" ? 1 : round.outcome === "win" ? 0 : 0.5;
      const binIndex = Math.min(4, Math.floor(confidence * 5));
      bins[binIndex].confidence += confidence;
      bins[binIndex].actual += actual;
      bins[binIndex].total += 1;
      brierSum += (confidence - actual) * (confidence - actual);
    });

    const ece =
      bins.reduce((sum, bin) => {
        if (!bin.total) return sum;
        const avgConfidence = bin.confidence / bin.total;
        const avgActual = bin.actual / bin.total;
        return sum + Math.abs(avgConfidence - avgActual) * (bin.total / rounds.length);
      }, 0) * 100;

    let flips = 0;
    for (let index = 1; index < rounds.length; index += 1) {
      if (rounds[index].ai !== rounds[index - 1].ai) {
        flips += 1;
      }
    }

    return {
      averageConfidence,
      highConfidenceRate,
      ece: Math.round(ece * 10) / 10,
      brier: Math.round((brierSum / rounds.length) * 1000) / 1000,
      flipRate: rounds.length > 1 ? Math.round((flips / (rounds.length - 1)) * 100) : 0,
    };
  }, [rounds]);

  const handleCreateProfile = () => {
    createProfile();
  };

  const handleExport = () => {
    if (!currentPlayer || !currentProfile || !rounds.length) return;
    const filename = `rps-${slugify(currentProfile.name || "profile") || "profile"}-rounds.csv`;
    downloadCsv(filename, exportRoundsCsv());
  };

  const sections = useMemo<PlaySection[]>(
    () => [
      {
        id: "overview",
        label: "Overview",
        title: currentProfile?.name ?? "Statistics overview",
        description: "Profile switching, high-level match totals, and training status for the active statistics history.",
        content: (
          <div className="grid gap-4">
            <div className="grid gap-3 lg:grid-cols-[1.15fr,0.85fr]">
              <article className={sectionCardClass}>
                <p className="play-shell-muted text-sm leading-7">
                  Switch between saved profile histories, start a fresh profile, and keep training progress separate
                  without leaving the routed play workspace.
                </p>
              </article>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <select
                  value={currentProfile?.id ?? ""}
                  onChange={event => selectProfile(event.target.value)}
                  disabled={!profiles.length}
                  className={fieldClass}
                >
                  {!profiles.length && <option value="">No profiles yet</option>}
                  {profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                      {!profile.trained && (profile.trainingCount ?? 0) < TRAIN_ROUNDS ? " - Training required" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleCreateProfile}
                  className={accentButtonClass}
                >
                  New profile
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={!currentPlayer || !currentProfile || !rounds.length}
                  className={mutedButtonClass}
                >
                  Export CSV
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className={sectionCardClass}>
                <p className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">Rounds</p>
                <div className="play-shell-heading mt-3 text-4xl font-semibold tracking-[-0.05em]">{totalRounds}</div>
                <p className="play-shell-muted mt-2 text-sm">Recorded rounds for this statistics profile.</p>
              </article>
              <article className={sectionCardClass}>
                <p className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">Matches</p>
                <div className="play-shell-heading mt-3 text-4xl font-semibold tracking-[-0.05em]">{totalMatches}</div>
                <p className="play-shell-muted mt-2 text-sm">Completed match summaries linked to the profile.</p>
              </article>
              <article className={sectionCardClass}>
                <p className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">Match Win Rate</p>
                <div className="play-shell-heading mt-3 text-4xl font-semibold tracking-[-0.05em]">{overallWinRate}%</div>
                <p className="play-shell-muted mt-2 text-sm">Share of matches where you finished ahead of the AI.</p>
              </article>
              <article className={sectionCardClass}>
                <p className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">Training Status</p>
                <div className="play-shell-heading mt-3 text-2xl font-semibold tracking-[-0.04em]">
                  {isTrained ? "Ready for challenge" : `${trainingCount}/${TRAIN_ROUNDS} rounds`}
                </div>
                <p className="play-shell-muted mt-2 text-sm">
                  {isTrained
                    ? "The current profile has completed baseline training."
                    : "Finish the warm-up rounds on /play to unlock the trained predictor."}
                </p>
              </article>
            </div>
          </div>
        ),
      },
      {
        id: "behavior-patterns",
        label: "Behavior Patterns",
        title: "Track how the player tends to repeat, switch, and cycle",
        description: "These cards make it easier to scan for habits the predictor can exploit over time.",
        content: (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className={sectionCardClass}>
              <div className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">Favorite move</div>
              <div className="play-shell-heading mt-3 text-xl font-semibold">
                {behavior.favoriteMove ? `${behavior.favoriteMove} (${behavior.favoriteMovePct}%)` : "No pattern yet"}
              </div>
            </article>
            <article className={sectionCardClass}>
              <div className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">Top transition</div>
              <div className="play-shell-heading mt-3 text-xl font-semibold">
                {behavior.topTransition
                  ? `${behavior.topTransition.key} (${behavior.topTransition.count})`
                  : "Not enough rounds"}
              </div>
            </article>
            <article className={sectionCardClass}>
              <div className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">Repeat after win</div>
              <div className="play-shell-heading mt-3 text-xl font-semibold">{behavior.repeatAfterWin}%</div>
            </article>
            <article className={sectionCardClass}>
              <div className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">Switch after loss</div>
              <div className="play-shell-heading mt-3 text-xl font-semibold">{behavior.switchAfterLoss}%</div>
            </article>
          </div>
        ),
      },
      {
        id: "ai-confidence",
        label: "AI Confidence",
        title: "Review confidence quality, coverage, and how often the AI pivots",
        description: "Calibration and flip-rate summaries help show whether the model is both confident and well-tuned.",
        content: (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className={sectionCardClass}>
              <div className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">Average confidence</div>
              <div className="play-shell-heading mt-3 text-xl font-semibold">
                {aiMetrics.averageConfidence !== null ? `${aiMetrics.averageConfidence}%` : "No data"}
              </div>
            </article>
            <article className={sectionCardClass}>
              <div className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">High-confidence share</div>
              <div className="play-shell-heading mt-3 text-xl font-semibold">{aiMetrics.highConfidenceRate}%</div>
            </article>
            <article className={sectionCardClass}>
              <div className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">Calibration (ECE)</div>
              <div className="play-shell-heading mt-3 text-xl font-semibold">
                {aiMetrics.ece !== null ? `${aiMetrics.ece}%` : "No data"}
              </div>
            </article>
            <article className={sectionCardClass}>
              <div className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.18em]">Prediction flip rate</div>
              <div className="play-shell-heading mt-3 text-xl font-semibold">{aiMetrics.flipRate}%</div>
            </article>
            {aiMetrics.brier !== null && (
              <article className={`${sectionCardClass} md:col-span-2 xl:col-span-4`}>
                <p className="play-shell-muted text-sm leading-7">
                  Brier score: <span className="font-semibold play-shell-heading">{aiMetrics.brier}</span>. Lower values
                  indicate better probability forecasts over the current round history.
                </p>
              </article>
            )}
          </div>
        ),
      },
      {
        id: "recent-rounds",
        label: "Recent Rounds",
        title: "Read the latest round history at a glance",
        description: "Recent outcomes, model confidence, and mode context for the active profile.",
        content:
          sortedRounds.length === 0 ? (
            <div className="play-shell-empty-state rounded-2xl border border-dashed px-6 py-10 text-center text-sm">
              No round history yet. Play a few rounds on <code>/play</code> to populate this page.
            </div>
          ) : (
            <div className="play-shell-table-surface overflow-x-auto rounded-2xl border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-[0.18em] play-shell-text-muted">
                    <th className="px-3 py-3">Time</th>
                    <th className="px-3 py-3">Mode</th>
                    <th className="px-3 py-3">You</th>
                    <th className="px-3 py-3">AI</th>
                    <th className="px-3 py-3">Outcome</th>
                    <th className="px-3 py-3">Confidence</th>
                    <th className="px-3 py-3">Bucket</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRounds.slice(0, 20).map(round => (
                    <tr key={round.id} className="border-b play-shell-muted last:border-b-0">
                      <td className="px-3 py-4 play-shell-text-muted">{formatTimestamp(round.t)}</td>
                      <td className="px-3 py-4">{round.mode}</td>
                      <td className="px-3 py-4 capitalize">{round.player}</td>
                      <td className="px-3 py-4 capitalize">{round.ai}</td>
                      <td className={`px-3 py-4 font-semibold capitalize ${outcomeTone(round.outcome)}`}>
                        {round.outcome}
                      </td>
                      <td className="px-3 py-4">{Math.round(clamp01(round.confidence) * 100)}%</td>
                      <td className="px-3 py-4 uppercase play-shell-text-muted">{confidenceBucket(round.confidence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
      },
      {
        id: "export",
        label: "Export",
        title: "Export profile-linked round data for analysis",
        description: "The CSV export reflects the currently selected statistics profile and its saved rounds.",
        content: (
          <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
            <article className={sectionCardClass}>
              <p className="play-shell-muted text-sm leading-7">
                Exported data stays tied to the active profile, which keeps classroom sessions, retraining runs, and
                comparison histories separate.
              </p>
            </article>
            <button
              type="button"
              onClick={handleExport}
              disabled={!currentPlayer || !currentProfile || !rounds.length}
              className={`${mutedButtonClass} py-4`}
            >
              Export current profile CSV
            </button>
          </div>
        ),
      },
    ],
    [
      aiMetrics.averageConfidence,
      aiMetrics.brier,
      aiMetrics.ece,
      aiMetrics.flipRate,
      aiMetrics.highConfidenceRate,
      behavior.favoriteMove,
      behavior.favoriteMovePct,
      behavior.repeatAfterWin,
      behavior.switchAfterLoss,
      behavior.topTransition,
      currentPlayer,
      currentProfile,
      handleExport,
      isTrained,
      overallWinRate,
      profiles,
      rounds.length,
      selectProfile,
      sortedRounds,
      totalMatches,
      totalRounds,
      trainingCount,
    ],
  );

  return <PlaySectionLayout sections={sections} navLabel="Statistics Sections" />;
}
