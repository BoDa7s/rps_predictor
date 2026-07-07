import { useCallback, useMemo } from "react";
import { usePlayers } from "../players";
import {
  buildPostOnboardingDestination,
  completePlayEntryOnboarding,
  getBootDestination,
  profileNeedsTraining,
  readPlayEntryPreference,
  resetPlayEntryOnboarding,
  type WelcomePreference,
} from "../playEntry";
import { useStats } from "../stats";
import { resolveTelemetryProfileSelectionForPlayer, telemetryService, useTelemetryStore } from "../telemetry";

export function usePlayAppFacade() {
  const telemetry = useTelemetryStore();
  const {
    players,
    currentPlayer,
    currentPlayerId,
    setCurrentPlayer,
    createPlayer,
    updatePlayer,
    deletePlayer,
  } = usePlayers();
  const {
    currentProfile: currentStatsProfile,
    currentProfileId,
    profiles,
    sessionId,
    selectProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    forkProfileVersion,
    exportRoundsCsv,
  } = useStats();

  const welcomePreference = readPlayEntryPreference();

  const getProfileForPlayer = useCallback(
    (playerId: string | null | undefined, preferredProfileId?: string | null) => {
      const effectivePreferredId =
        preferredProfileId ?? (playerId === currentPlayerId ? currentProfileId : null);
      return resolveTelemetryProfileSelectionForPlayer(telemetry.profiles, playerId, effectivePreferredId).activeProfile;
    },
    [currentPlayerId, currentProfileId, telemetry.profiles],
  );

  const currentTelemetryProfileSelection = useMemo(
    () => resolveTelemetryProfileSelectionForPlayer(telemetry.profiles, currentPlayer?.id, currentProfileId),
    [currentPlayer?.id, currentProfileId, telemetry.profiles],
  );
  const currentTelemetryProfile = currentTelemetryProfileSelection.activeProfile;

  const trainingRequired = profileNeedsTraining(currentTelemetryProfile ?? currentStatsProfile);
  const challengeAllowed = Boolean((currentTelemetryProfile ?? currentStatsProfile)?.predictorDefault) && !trainingRequired;

  const setWelcomePreference = useCallback((value: WelcomePreference) => {
    if (value === "skip") {
      completePlayEntryOnboarding();
      return;
    }
    resetPlayEntryOnboarding();
  }, []);

  const resolveBootDestination = useCallback(
    (returnTo?: string | null, profileOverride?: typeof currentTelemetryProfile | null) =>
      getBootDestination({
        welcomePreference,
        hasCurrentPlayer: Boolean(currentPlayer),
        savedPlayerCount: players.length,
        returnTo,
        currentProfile: profileOverride ?? currentTelemetryProfile,
      }),
    [currentPlayer, currentTelemetryProfile, players.length, welcomePreference],
  );

  const resolvePostOnboardingDestination = useCallback(
    (returnTo?: string | null, options?: { profile?: typeof currentTelemetryProfile | null; forceTraining?: boolean }) =>
      buildPostOnboardingDestination({
        returnTo,
        profile: options?.profile ?? currentTelemetryProfile,
        forceTraining: options?.forceTraining ?? false,
      }),
    [currentTelemetryProfile],
  );

  const completeOnboarding = useCallback(
    (returnTo?: string | null, options?: { profile?: typeof currentTelemetryProfile | null; forceTraining?: boolean }) => {
      completePlayEntryOnboarding();
      return resolvePostOnboardingDestination(returnTo, options);
    },
    [resolvePostOnboardingDestination],
  );

  const restorePlayer = useCallback(
    (playerId: string, returnTo?: string | null) => {
      const restoredProfile = getProfileForPlayer(playerId);
      telemetryService.logUIEvent({
        sessionId,
        timestamp: new Date().toISOString(),
        playerId,
        profileId: restoredProfile?.id ?? null,
        surface: "restore-player",
        action: "player-restored",
      });
      setCurrentPlayer(playerId);
      completePlayEntryOnboarding();
      return buildPostOnboardingDestination({
        returnTo,
        profile: restoredProfile,
      });
    },
    [getProfileForPlayer, sessionId, setCurrentPlayer],
  );

  return {
    telemetry,
    players,
    playerCount: players.length,
    currentPlayer,
    currentPlayerId,
    setCurrentPlayer,
    createPlayer,
    updatePlayer,
    deletePlayer,
    profiles,
    currentTelemetryProfile,
    currentTelemetryProfileId: currentTelemetryProfileSelection.activeProfileId,
    currentStatsProfile,
    currentProfileId,
    sessionId,
    selectProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    forkProfileVersion,
    exportRoundsCsv,
    welcomePreference,
    setWelcomePreference,
    getProfileForPlayer,
    resolveBootDestination,
    resolvePostOnboardingDestination,
    completeOnboarding,
    restorePlayer,
    trainingRequired,
    challengeAllowed,
  };
}
