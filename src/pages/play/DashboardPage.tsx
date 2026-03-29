import React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  buildChallengeStartPath,
  buildTrainingStartPath,
  profileNeedsTraining,
} from "../../playEntry";
import { useStats } from "../../stats";

type ModeTileProps = {
  title: string;
  subtitle: string;
  detail: string;
  tone: "training" | "challenge";
  actionLabel: string;
  badge: string;
  disabled?: boolean;
  disabledReason?: string;
  onLaunch: () => void;
};

function ModeTile({
  title,
  subtitle,
  detail,
  tone,
  actionLabel,
  badge,
  disabled = false,
  disabledReason,
  onLaunch,
}: ModeTileProps) {
  const toneClass =
    tone === "challenge"
      ? "border-[color:color-mix(in_srgb,var(--app-accent)_28%,var(--app-border))] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--app-accent-soft)_26%,var(--app-surface-card)),color-mix(in_srgb,var(--app-surface-card)_86%,transparent))]"
      : "border-[color:color-mix(in_srgb,var(--app-accent-muted)_20%,var(--app-border))] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--app-accent-muted)_18%,var(--app-surface-card)),color-mix(in_srgb,var(--app-surface-card)_84%,transparent))]";

  return (
    <article
      className={`relative overflow-hidden rounded-[1.75rem] border px-5 py-5 sm:px-6 sm:py-6 ${toneClass} ${
        disabled ? "opacity-75" : ""
      }`}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--app-accent)_48%,transparent),transparent)]" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[color:var(--app-text-muted)]">
            {subtitle}
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--app-text-strong)]">
            {title}
          </h2>
        </div>
        <span className="rounded-full border border-[color:var(--app-border)] bg-[color:color-mix(in_srgb,var(--app-surface-input)_80%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--app-text-secondary)]">
          {badge}
        </span>
      </div>

      <p className="mt-4 max-w-xl text-sm leading-7 text-[color:var(--app-text-secondary)]">{detail}</p>

      <div className="mt-6 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onLaunch}
          disabled={disabled}
          className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition ${
            disabled
              ? "cursor-not-allowed border border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] text-[color:var(--app-text-muted)]"
              : "play-shell-button play-shell-button-accent"
          }`}
        >
          {actionLabel}
        </button>
        {disabledReason ? (
          <p className="max-w-[16rem] text-right text-xs leading-6 text-[color:var(--app-text-muted)]">{disabledReason}</p>
        ) : (
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-[color:var(--app-text-muted)]">
            Live runtime
          </p>
        )}
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { currentProfile } = useStats();

  if (profileNeedsTraining(currentProfile)) {
    return <Navigate to={buildTrainingStartPath()} replace />;
  }

  const predictorReady = Boolean(currentProfile?.predictorDefault);
  const challengeBestOf = currentProfile?.preferences.gameplay.bestOf ?? 5;
  const challengeDifficulty = currentProfile?.preferences.gameplay.aiDifficulty ?? "normal";
  const challengeDifficultyLabel =
    challengeDifficulty.charAt(0).toUpperCase() + challengeDifficulty.slice(1);

  return (
    <div
      className="h-full min-h-0 overflow-hidden bg-[color:var(--app-bg)]"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, color-mix(in srgb, var(--app-accent-soft) 34%, transparent), transparent 28%), radial-gradient(circle at right 18%, color-mix(in srgb, var(--app-accent-muted) 18%, transparent), transparent 24%), linear-gradient(180deg, color-mix(in srgb, var(--app-bg) 92%, transparent), color-mix(in srgb, var(--app-surface-subtle) 32%, transparent))",
      }}
    >
      <section className="grid h-full min-h-0 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto grid h-full w-full max-w-6xl content-center">
          <div className="grid gap-4 sm:gap-5">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--app-text-muted)]">
              <span className="rounded-full border border-[color:var(--app-border)] bg-[color:color-mix(in_srgb,var(--app-accent-soft)_28%,transparent)] px-3 py-1">
                Training complete
              </span>
            </div>

            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-semibold tracking-[-0.06em] text-[color:var(--app-text-strong)] sm:text-5xl">
                Choose Your Mode
              </h1>
            </div>

            <div className="mx-auto grid w-full max-w-5xl gap-4 pt-1 lg:grid-cols-2">
              <ModeTile
                title="Training"
                subtitle="Warm-up"
                detail="Run another training session with random-mode rounds and the predictor disabled."
                tone="training"
                badge="AI off"
                actionLabel="Open training"
                onLaunch={() => navigate(buildTrainingStartPath())}
              />
              <ModeTile
                title="Challenge"
                subtitle="Live match"
                detail={`Launch the predictor match flow using Best of ${challengeBestOf} with ${challengeDifficultyLabel} difficulty.`}
                tone="challenge"
                badge={predictorReady ? challengeDifficultyLabel : "Locked"}
                actionLabel={predictorReady ? "Launch challenge" : "Challenge locked"}
                disabled={!predictorReady}
                disabledReason={!predictorReady ? "Enable the AI predictor in the current profile before challenge can start." : undefined}
                onLaunch={() => navigate(buildChallengeStartPath())}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
