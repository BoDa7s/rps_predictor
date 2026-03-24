import React from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import AboutPage from "./pages/play/AboutPage";
import GameplayPage from "./pages/play/GameplayPage";
import HelpPage from "./pages/play/HelpPage";
import LeaderboardPage from "./pages/play/LeaderboardPage";
import SettingsPage from "./pages/play/SettingsPage";
import StatsPage from "./pages/play/StatsPage";
import PlayLayout from "./routes/PlayLayout";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    path: "/play",
    element: <PlayLayout />,
    children: [
      {
        index: true,
        element: <GameplayPage />,
      },
      {
        path: "stats",
        element: <StatsPage />,
      },
      {
        path: "leaderboard",
        element: <LeaderboardPage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "help",
        element: <HelpPage />,
      },
      {
        path: "about",
        element: <AboutPage />,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
