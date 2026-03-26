import React from "react";
import { useSearchParams } from "react-router-dom";
import RPSDoodleApp from "../../App";
import {
  CHALLENGE_LAUNCH_VALUE,
  PLAY_LAUNCH_MODE_PARAM,
  TRAINING_LAUNCH_VALUE,
  type PlayLaunchIntent,
} from "../../playEntry";

export default function GameplayPage() {
  const [searchParams] = useSearchParams();
  const launchValue = searchParams.get(PLAY_LAUNCH_MODE_PARAM);
  const launchIntent: PlayLaunchIntent | null =
    launchValue === TRAINING_LAUNCH_VALUE || launchValue === CHALLENGE_LAUNCH_VALUE ? launchValue : null;

  return <RPSDoodleApp embeddedInPlayLayout launchIntent={launchIntent} />;
}
