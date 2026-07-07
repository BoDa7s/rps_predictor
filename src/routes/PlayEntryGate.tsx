import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { buildBootPath, shouldEnterPlayBoot } from "../playEntry";
import { usePlayAppFacade } from "./usePlayAppFacade";

export default function PlayEntryGate() {
  const location = useLocation();
  const { currentPlayer, welcomePreference } = usePlayAppFacade();

  if (
    shouldEnterPlayBoot({
      welcomePreference,
      hasCurrentPlayer: Boolean(currentPlayer),
    })
  ) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={buildBootPath(returnTo)} replace />;
  }

  return <Outlet />;
}
