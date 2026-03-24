import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { usePlayers } from "../../players";
import { getActiveStatsProfileForPlayer, useStats } from "../../stats";
import {
  buildPlayPath,
  buildPostOnboardingDestination,
  persistWelcomePreference,
  sanitizeReturnTo,
} from "../../playEntry";

export default function RestorePlayerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { players, currentPlayer, setCurrentPlayer } = usePlayers();
  const { adminProfiles } = useStats();
  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get("returnTo")), [searchParams]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(currentPlayer?.id ?? players[0]?.id ?? null);

  useEffect(() => {
    if (!players.length) return;
    setSelectedPlayerId(current => {
      if (current && players.some(player => player.id === current)) {
        return current;
      }
      return currentPlayer?.id ?? players[0]?.id ?? null;
    });
  }, [currentPlayer?.id, players]);

  const selectedPlayer = useMemo(
    () => players.find(player => player.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId],
  );
  const selectedStatsProfile = useMemo(
    () => (selectedPlayerId ? getActiveStatsProfileForPlayer(adminProfiles, selectedPlayerId) : null),
    [adminProfiles, selectedPlayerId],
  );

  if (!players.length) {
    return <Navigate to={buildPlayPath("new", returnTo)} replace />;
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[0.85fr,1.15fr] lg:items-start">
      <article className="play-shell-card rounded-[2rem] px-6 py-8">
        <p className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.32em]">Restore Player</p>
        <h1 className="play-shell-heading mt-4 text-4xl font-semibold tracking-[-0.05em]">Load an existing player</h1>
        <p className="play-shell-muted mt-4 text-sm leading-7">
          Choose a saved player profile from this device to continue into the routed play workspace with existing match
          history, statistics, and local preferences.
        </p>

        {selectedPlayer && (
          <div className="play-shell-panel mt-6 rounded-[1.5rem] px-5 py-5">
            <div className="play-shell-heading text-lg font-semibold">{selectedPlayer.playerName}</div>
            <div className="play-shell-muted mt-2 grid gap-2 text-sm">
              <div>Grade: {selectedPlayer.grade === "Not applicable" ? "N/A" : selectedPlayer.grade}</div>
              {selectedPlayer.school && <div>School: {selectedPlayer.school}</div>}
              {selectedPlayer.priorExperience && <div>Prior experience: {selectedPlayer.priorExperience}</div>}
            </div>
          </div>
        )}
      </article>

      <section className="play-shell-card rounded-[2rem] px-6 py-8">
        <p className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.32em]">Saved Profiles</p>
        <h2 className="play-shell-heading mt-4 text-2xl font-semibold tracking-[-0.03em]">Select who is playing</h2>
        <p className="play-shell-muted mt-3 text-sm leading-7">
          This step replaces the old restore dialog so loading saved data behaves like a real routed page.
        </p>

        <label className="mt-6 block text-sm font-medium play-shell-heading">
          Player profile
          <select
            value={selectedPlayerId ?? ""}
            onChange={event => setSelectedPlayerId(event.target.value || null)}
            className="play-shell-input mt-2 w-full rounded-2xl px-4 py-3"
          >
            {players.map(player => (
              <option key={player.id} value={player.id}>
                {player.playerName}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => navigate(buildPlayPath("welcome", returnTo))}
            className="play-shell-button play-shell-button-muted rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Back
          </button>
          <button
            type="button"
            disabled={!selectedPlayerId}
            onClick={() => {
              if (!selectedPlayerId) return;
              setCurrentPlayer(selectedPlayerId);
              persistWelcomePreference("skip");
              navigate(
                buildPostOnboardingDestination({
                  returnTo,
                  profile: selectedStatsProfile,
                }),
                { replace: true },
              );
            }}
            className="play-shell-button play-shell-button-accent rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Continue to play
          </button>
        </div>
      </section>
    </section>
  );
}
