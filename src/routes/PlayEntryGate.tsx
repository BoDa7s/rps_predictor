import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { usePlayers } from "../players";
import { buildBootPath, getStoredWelcomePreference } from "../playEntry";

export default function PlayEntryGate() {
  const location = useLocation();
  const { currentPlayer } = usePlayers();
  const welcomePreference = getStoredWelcomePreference();

  if (!currentPlayer || welcomePreference === "show") {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={buildBootPath(returnTo)} replace />;
  }

  return <Outlet />;
}
