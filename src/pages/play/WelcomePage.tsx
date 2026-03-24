import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePlayers } from "../../players";
import { getActiveStatsProfileForPlayer, useStats } from "../../stats";
import {
  PLAY_WELCOME_SLIDES,
  buildPlayPath,
  buildPostOnboardingDestination,
  persistWelcomePreference,
  sanitizeReturnTo,
} from "../../playEntry";

export default function WelcomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { players, currentPlayer } = usePlayers();
  const { adminProfiles } = useStats();
  const [slideIndex, setSlideIndex] = useState(0);
  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get("returnTo")), [searchParams]);
  const hasLocalProfiles = players.length > 0;
  const currentStatsProfile = useMemo(
    () => (currentPlayer ? getActiveStatsProfileForPlayer(adminProfiles, currentPlayer.id) : null),
    [adminProfiles, currentPlayer],
  );
  const isLastSlide = slideIndex >= PLAY_WELCOME_SLIDES.length - 1;
  const progress = ((slideIndex + 1) / PLAY_WELCOME_SLIDES.length) * 100;

  return (
    <section className="play-shell-card rounded-[2rem] px-6 py-8 sm:px-10 sm:py-10">
      <div className="grid gap-8 lg:grid-cols-[0.95fr,1.05fr] lg:items-center">
        <div className="space-y-5">
          <p className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.32em]">Welcome</p>
          <h1 className="play-shell-heading text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Meet the predictor before the first match starts.
          </h1>
          <p className="play-shell-muted max-w-xl text-sm leading-7 sm:text-base">
            RPS Predictor uses a lightweight adaptive model to learn your habits over time. The onboarding flow keeps
            setup, restore, and launch decisions explicit before you enter the gameplay runtime.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="play-shell-panel rounded-[1.5rem] px-5 py-5">
              <div className="play-shell-heading text-lg font-semibold">Train first</div>
              <p className="play-shell-muted mt-2 text-sm leading-7">
                New players complete a short warm-up so the AI has enough rounds to learn from.
              </p>
            </article>
            <article className="play-shell-panel rounded-[1.5rem] px-5 py-5">
              <div className="play-shell-heading text-lg font-semibold">Restore existing data</div>
              <p className="play-shell-muted mt-2 text-sm leading-7">
                Returning players can reload saved local profiles and continue reviewing their stats and history.
              </p>
            </article>
          </div>
        </div>

        <div className="play-shell-panel rounded-[1.75rem] px-6 py-6 sm:px-8">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.24em]">
            <span className="play-shell-eyebrow">Intro</span>
            <span className="play-shell-text-muted">
              {slideIndex + 1} / {PLAY_WELCOME_SLIDES.length}
            </span>
          </div>

          <div
            className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[color:var(--app-surface-input)]"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={PLAY_WELCOME_SLIDES.length}
            aria-valuenow={slideIndex + 1}
          >
            <div
              className="h-full rounded-full bg-[color:var(--app-accent)] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="mt-8 space-y-4">
            <h2 className="play-shell-heading text-3xl font-semibold tracking-[-0.04em]">
              {PLAY_WELCOME_SLIDES[slideIndex]?.title}
            </h2>
            <p className="play-shell-muted text-base leading-8">{PLAY_WELCOME_SLIDES[slideIndex]?.body}</p>
          </div>

          {isLastSlide ? (
            <div className="mt-10 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setSlideIndex(index => Math.max(0, index - 1))}
                  className="play-shell-button play-shell-button-muted rounded-full px-4 py-2 text-sm font-semibold"
                >
                  Back
                </button>
                <div className="flex flex-wrap justify-end gap-3">
                  {currentPlayer && (
                    <button
                      type="button"
                      onClick={() => {
                        persistWelcomePreference("skip");
                        navigate(
                          buildPostOnboardingDestination({
                            returnTo,
                            profile: currentStatsProfile,
                          }),
                          { replace: true },
                        );
                      }}
                      className="play-shell-button play-shell-button-muted rounded-full px-5 py-2.5 text-sm font-semibold"
                    >
                      Continue as {currentPlayer.playerName}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(buildPlayPath("new", returnTo))}
                    className="play-shell-button play-shell-button-accent rounded-full px-5 py-2.5 text-sm font-semibold"
                  >
                    Get started
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(buildPlayPath("restore", returnTo))}
                    disabled={!hasLocalProfiles}
                    className="play-shell-button play-shell-button-muted rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    Already played? Load my data
                  </button>
                </div>
              </div>
              {!hasLocalProfiles && (
                <p className="play-shell-text-muted text-xs">No saved profiles detected on this device.</p>
              )}
            </div>
          ) : (
            <div className="mt-10 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSlideIndex(index => Math.max(0, index - 1))}
                disabled={slideIndex === 0}
                className="play-shell-button play-shell-button-muted rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() =>
                  setSlideIndex(index => Math.min(PLAY_WELCOME_SLIDES.length - 1, index + 1))
                }
                className="play-shell-button play-shell-button-accent rounded-full px-5 py-2.5 text-sm font-semibold"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
