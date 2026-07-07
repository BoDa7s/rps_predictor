import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { PLAY_DASHBOARD_PATH } from "../../playEntry";
import {
  CHALLENGE_LAUNCH_VALUE,
  PLAY_LAUNCH_MODE_PARAM,
  type PlayLaunchIntent,
} from "../../playEntry";
import { usePlayAppFacade } from "../../routes/usePlayAppFacade";

export default function GameplayPage() {
  const { trainingRequired } = usePlayAppFacade();
  const [searchParams] = useSearchParams();
  const launchValue = searchParams.get(PLAY_LAUNCH_MODE_PARAM);
  const launchIntent: PlayLaunchIntent | null = launchValue === CHALLENGE_LAUNCH_VALUE ? launchValue : null;

  if (launchIntent === CHALLENGE_LAUNCH_VALUE) {
    return <Navigate to={trainingRequired ? PLAY_DASHBOARD_PATH : "/play/challenge"} replace />;
  }

  return <Navigate to={PLAY_DASHBOARD_PATH} replace />;
}
