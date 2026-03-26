import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import RPSDoodleApp from "../../App";
import { buildTrainingStartPath, profileNeedsTraining } from "../../playEntry";
import {
  CHALLENGE_LAUNCH_VALUE,
  PLAY_LAUNCH_MODE_PARAM,
  type PlayLaunchIntent,
} from "../../playEntry";
import { useStats } from "../../stats";

export default function GameplayPage() {
  const { currentProfile } = useStats();
  const [searchParams] = useSearchParams();
  const launchValue = searchParams.get(PLAY_LAUNCH_MODE_PARAM);
  const launchIntent: PlayLaunchIntent | null = launchValue === CHALLENGE_LAUNCH_VALUE ? launchValue : null;

  if (profileNeedsTraining(currentProfile)) {
    return <Navigate to={buildTrainingStartPath()} replace />;
  }

  return <RPSDoodleApp embeddedInPlayLayout launchIntent={launchIntent} />;
}
