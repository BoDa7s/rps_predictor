import React from "react";
import { useSearchParams } from "react-router-dom";
import RPSDoodleApp from "../../App";
import { PLAY_LAUNCH_MODE_PARAM, TRAINING_LAUNCH_VALUE, type PlayLaunchIntent } from "../../playEntry";

export default function GameplayPage() {
  const [searchParams] = useSearchParams();
  const launchIntent: PlayLaunchIntent | null =
    searchParams.get(PLAY_LAUNCH_MODE_PARAM) === TRAINING_LAUNCH_VALUE ? TRAINING_LAUNCH_VALUE : null;

  return <RPSDoodleApp embeddedInPlayLayout launchIntent={launchIntent} />;
}
