import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PlayerSetupForm from "../../components/play/PlayerSetupForm";
import { usePlayers } from "../../players";
import {
  buildPlayPath,
  buildPostOnboardingDestination,
  persistWelcomePreference,
  sanitizeReturnTo,
} from "../../playEntry";

export default function CreatePlayerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { createPlayer, updatePlayer } = usePlayers();
  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get("returnTo")), [searchParams]);

  const handleComplete = () => {
    persistWelcomePreference("skip");
    navigate(buildPostOnboardingDestination({ returnTo, forceTraining: true }), { replace: true });
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[0.85fr,1.15fr] lg:items-start">
      <article className="play-shell-card rounded-[2rem] px-6 py-8">
        <p className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.32em]">New Player</p>
        <h1 className="play-shell-heading mt-4 text-4xl font-semibold tracking-[-0.05em]">Create your player profile</h1>
        <p className="play-shell-muted mt-4 text-sm leading-7">
          Player setup is now its own routed step. Save a profile here, then the gameplay runtime at <code>/play</code>
          can stay focused on modes, matches, and results.
        </p>
        <div className="play-shell-panel mt-6 rounded-[1.5rem] px-5 py-5">
          <div className="play-shell-heading text-lg font-semibold">What happens next</div>
          <p className="play-shell-muted mt-2 text-sm leading-7">
            After saving, the onboarding flow completes and you return to the play workspace with a fresh training path.
          </p>
        </div>
      </article>

      <PlayerSetupForm
        mode="create"
        player={null}
        createPlayer={createPlayer}
        updatePlayer={updatePlayer}
        onClose={() => navigate(buildPlayPath("welcome", returnTo))}
        onBack={() => navigate(buildPlayPath("welcome", returnTo))}
        onSaved={() => handleComplete()}
        origin="welcome"
        appearance="page"
      />
    </section>
  );
}
