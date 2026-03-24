import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePlayers } from "../../players";
import { getActiveStatsProfileForPlayer, useStats } from "../../stats";
import {
  PLAY_BOOT_DURATION_MS,
  getBootDestination,
  getStoredWelcomePreference,
  sanitizeReturnTo,
} from "../../playEntry";

export default function BootPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentPlayer, players } = usePlayers();
  const { adminProfiles } = useStats();
  const [progress, setProgress] = useState(0);
  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get("returnTo")), [searchParams]);
  const currentStatsProfile = useMemo(
    () => (currentPlayer ? getActiveStatsProfileForPlayer(adminProfiles, currentPlayer.id) : null),
    [adminProfiles, currentPlayer],
  );

  useEffect(() => {
    let frameId = 0;
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }
      const elapsed = timestamp - startTime;
      const ratio = Math.min(elapsed / PLAY_BOOT_DURATION_MS, 1);
      setProgress(ratio * 100);

      if (ratio >= 1) {
        const nextPath = getBootDestination({
          welcomePreference: getStoredWelcomePreference(),
          hasCurrentPlayer: Boolean(currentPlayer),
          savedPlayerCount: players.length,
          returnTo,
          currentProfile: currentStatsProfile,
        });
        navigate(nextPath, { replace: true });
        return;
      }

      frameId = window.requestAnimationFrame(step);
    };

    frameId = window.requestAnimationFrame(step);
    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [currentPlayer, currentStatsProfile, navigate, players.length, returnTo]);

  const percent = Math.max(4, Math.round(progress));

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-[color:var(--app-border)] px-6 py-12 shadow-[var(--app-surface-shadow)] sm:px-10 sm:py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,color-mix(in_srgb,var(--app-accent-soft)_70%,transparent),transparent_42%),radial-gradient(circle_at_80%_24%,color-mix(in_srgb,var(--app-accent)_30%,transparent),transparent_38%),linear-gradient(135deg,var(--app-gradient-start),var(--app-gradient-middle),var(--app-gradient-end))]" />
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-8 text-center">
        <div className="play-shell-card w-full rounded-[1.75rem] px-8 py-10">
          <p className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.32em]">Boot Sequence</p>
          <h1 className="play-shell-heading mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Initializing RPS AI Lab
          </h1>
          <p className="play-shell-muted mt-4 text-sm leading-7 sm:text-base">
            Loading your local player data, theme preferences, and match runtime before entering the play workspace.
          </p>

          <div className="mx-auto mt-10 w-full max-w-md">
            <div className="h-3 overflow-hidden rounded-full bg-[color:var(--app-surface-input)]">
              <div
                className="h-full rounded-full bg-[color:var(--app-accent)] transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="play-shell-muted mt-4 text-xs font-semibold uppercase tracking-[0.35em]">
              Booting... {percent}%
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
